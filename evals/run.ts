// Runs the golden set through Ask Copper and grades every answer (Module 5).
// The questions are a Langfuse dataset, each run is a Langfuse dataset run
// (so two runs can be compared side by side there), and every answer's scores
// are saved in Langfuse: judge_score, judge_pass, tools_ok, cost_usd,
// latency_s, tokens.
import { existsSync } from "node:fs";
import { LangfuseClient } from "@langfuse/client";
import { flushTracing, ensureTracing } from "@/lib/ai/tracing";
import { finalValue } from "@/lib/ai/live";
import { askCopper } from "@/lib/copper/assistant/ask";
import type { SupportMode } from "@/lib/copper/assistant/mode";
import { toolCallsOf } from "@/lib/copper/assistant/progress";
import type { Desk } from "@/lib/copper/orders";
import { type GoldenCase, GOLDEN_SET } from "./golden-set";
import { judgeAnswer } from "./judge";
import { type CaseResult, summarize, type Summary } from "./report";

export const DATASET = "copper-golden-set";

/** Loads .env.local for local runs. In CI the keys are Actions secrets. */
export function loadLocalEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

const REQUIRED = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
];

/** Names of the keys the eval needs and doesn't have. */
export function missingKeys(): string[] {
  return REQUIRED.filter((name) => !process.env[name]?.trim());
}

type Input = { question: string; desk?: Desk };
type Meta = Pick<GoldenCase, "id" | "category" | "mustCall" | "mustNotCall"> & {
  critical: boolean;
};
type Output = {
  reply: string;
  tools: { name: string; input?: unknown; output?: unknown }[];
  agent: string;
  agentCalls: number;
  tokens: number;
  costUsd: number;
  seconds: number;
};

export type RunResult = {
  mode: SupportMode;
  results: CaseResult[];
  summary: Summary;
  /** Where to see this run in Langfuse. */
  url?: string;
};

async function seedDataset(langfuse: LangfuseClient, cases: GoldenCase[]) {
  await langfuse.api.datasets.create({
    name: DATASET,
    description:
      "Golden questions for Ask Copper: catalog, docs, scope, safety, refunds and handoffs.",
  });
  // Items are keyed by id, so running again updates them instead of copying them.
  for (const c of cases)
    await langfuse.dataset.createItem({
      datasetName: DATASET,
      id: `golden-${c.id}`,
      input: { question: c.question, desk: c.desk } satisfies Input,
      expectedOutput: c.criteria,
      metadata: {
        id: c.id,
        category: c.category,
        critical: Boolean(c.critical),
        mustCall: c.mustCall ?? [],
        mustNotCall: c.mustNotCall ?? [],
      },
    });
}

export async function runGoldenSet(
  mode: SupportMode,
  { cases = GOLDEN_SET, concurrency = 2 } = {},
): Promise<RunResult> {
  ensureTracing();
  const langfuse = new LangfuseClient();
  await seedDataset(langfuse, cases);
  const dataset = await langfuse.dataset.get(DATASET);
  const wanted = new Set(cases.map((c) => `golden-${c.id}`));
  dataset.items = dataset.items.filter((item) => wanted.has(item.id));

  const byId = new Map<string, CaseResult>();
  const runName = `${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const experiment = await dataset.runExperiment({
    name: `ask-copper-${mode}`,
    runName,
    description: `Golden set on the ${mode === "multi" ? "two-agent desk (Copper + Refund agent)" : "single agent with every tool"}.`,
    metadata: { mode },
    maxConcurrency: concurrency,
    task: async (item): Promise<Output> => {
      const input = item.input as Input;
      const started = performance.now();
      const { progress } = await askCopper({
        messages: [{ role: "user", content: input.question }],
        useTools: true,
        desk: input.desk,
        mode,
      });
      const final = await finalValue(progress);
      return {
        reply: final.reply,
        tools: toolCallsOf(final),
        agent: final.agent ?? "copper",
        agentCalls: final.stats?.agentCalls ?? 0,
        tokens:
          (final.stats?.inputTokens ?? 0) + (final.stats?.outputTokens ?? 0),
        costUsd: final.stats?.costUsd ?? 0,
        seconds: (performance.now() - started) / 1000,
      };
    },
    evaluators: [
      async ({ input, output, expectedOutput, metadata }) => {
        const out = output as Output;
        const meta = metadata as Meta;
        const called = out.tools.map((t) => t.name);
        const toolsOk =
          (meta.mustCall ?? []).every((n) => called.includes(n)) &&
          !(meta.mustNotCall ?? []).some((n) => called.includes(n));
        const verdict = await judgeAnswer({
          question: (input as Input).question,
          criteria: String(expectedOutput),
          reply: out.reply,
          toolCalls: out.tools,
        });
        const score = (verdict.score - 1) / 4;
        byId.set(meta.id, {
          id: meta.id,
          category: meta.category,
          critical: meta.critical,
          pass: verdict.pass && toolsOk,
          judgePass: verdict.pass,
          toolsOk,
          score,
          reasoning: verdict.reasoning,
          tools: called,
          agent: out.agent,
          agentCalls: out.agentCalls,
          tokens: out.tokens,
          costUsd: out.costUsd,
          seconds: out.seconds,
          reply: out.reply,
        });
        const toolNote = toolsOk
          ? "Used the right tools."
          : `Tool check failed. Called: ${called.join(", ") || "none"}.`;
        return [
          {
            name: "judge_score",
            value: score,
            comment: verdict.reasoning,
            dataType: "NUMERIC",
          },
          {
            name: "judge_pass",
            value: verdict.pass ? 1 : 0,
            comment: verdict.reasoning,
            dataType: "BOOLEAN",
          },
          {
            name: "tools_ok",
            value: toolsOk ? 1 : 0,
            comment: toolNote,
            dataType: "BOOLEAN",
          },
          { name: "cost_usd", value: out.costUsd, dataType: "NUMERIC" },
          { name: "latency_s", value: out.seconds, dataType: "NUMERIC" },
          { name: "tokens", value: out.tokens, dataType: "NUMERIC" },
        ];
      },
    ],
    runEvaluators: [
      async ({ itemResults }) => {
        const rows = itemResults
          .map((r) =>
            byId.get((r.item as { metadata?: Meta }).metadata?.id ?? ""),
          )
          .filter((r): r is CaseResult => Boolean(r));
        const s = summarize(mode, rows);
        return [
          { name: "run_pass_rate", value: s.passRate, dataType: "NUMERIC" },
          { name: "run_mean_score", value: s.meanScore, dataType: "NUMERIC" },
          {
            name: "run_total_cost_usd",
            value: s.totalCostUsd,
            dataType: "NUMERIC",
          },
          {
            name: "run_mean_latency_s",
            value: s.meanSeconds,
            dataType: "NUMERIC",
          },
        ];
      },
    ],
  });

  await langfuse.score.flush();
  await flushTracing();

  const results = cases
    .map((c) => byId.get(c.id))
    .filter((r): r is CaseResult => Boolean(r));
  return {
    mode,
    results,
    summary: summarize(mode, results),
    url: experiment.datasetRunUrl ?? experiment.experimentUrl,
  };
}
