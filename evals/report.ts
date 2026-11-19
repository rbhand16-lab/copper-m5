// Turns the per-question results of a golden-set run into a summary, a pass or
// fail for the merge gate, and a table to read. Plain functions, no model.
import type { SupportMode } from "@/lib/copper/assistant/mode";

export type CaseResult = {
  id: string;
  category: string;
  critical: boolean;
  /** The judge passed it AND the tool checks passed. */
  pass: boolean;
  judgePass: boolean;
  toolsOk: boolean;
  /** The judge's 1 to 5 score, as 0 to 1. */
  score: number;
  reasoning: string;
  tools: string[];
  /** Who wrote the reply: copper or refund. */
  agent: string;
  agentCalls: number;
  tokens: number;
  costUsd: number;
  seconds: number;
  reply: string;
};

export type Summary = {
  mode: SupportMode;
  cases: number;
  passRate: number;
  meanScore: number;
  criticalFailed: string[];
  failed: string[];
  totalCostUsd: number;
  meanCostUsd: number;
  meanSeconds: number;
  p90Seconds: number;
  meanTokens: number;
  meanAgentCalls: number;
};

/** What a run must reach to be allowed to merge. */
export const THRESHOLDS = {
  /** Share of questions that pass. */
  passRate: 0.85,
  /** Mean judge score, 0 to 1. */
  meanScore: 0.8,
};

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function summarize(mode: SupportMode, results: CaseResult[]): Summary {
  return {
    mode,
    cases: results.length,
    passRate: mean(results.map((r) => (r.pass ? 1 : 0))),
    meanScore: mean(results.map((r) => r.score)),
    criticalFailed: results
      .filter((r) => r.critical && !r.pass)
      .map((r) => r.id),
    failed: results.filter((r) => !r.pass).map((r) => r.id),
    totalCostUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
    meanCostUsd: mean(results.map((r) => r.costUsd)),
    meanSeconds: mean(results.map((r) => r.seconds)),
    p90Seconds: percentile(
      results.map((r) => r.seconds),
      0.9,
    ),
    meanTokens: mean(results.map((r) => r.tokens)),
    meanAgentCalls: mean(results.map((r) => r.agentCalls)),
  };
}

/** The merge gate: every critical question passes, and the averages clear the bar. */
export function gate(summary: Summary): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (summary.cases === 0) reasons.push("no questions were graded");
  if (summary.criticalFailed.length)
    reasons.push(
      `critical questions failed: ${summary.criticalFailed.join(", ")}`,
    );
  if (summary.passRate < THRESHOLDS.passRate)
    reasons.push(
      `pass rate ${pct(summary.passRate)} is below ${pct(THRESHOLDS.passRate)}`,
    );
  if (summary.meanScore < THRESHOLDS.meanScore)
    reasons.push(
      `mean judge score ${summary.meanScore.toFixed(2)} is below ${THRESHOLDS.meanScore.toFixed(2)}`,
    );
  return { ok: reasons.length === 0, reasons };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A markdown table with one row per mode, to compare them side by side. */
export function comparisonTable(summaries: Summary[]): string {
  const rows: [string, (s: Summary) => string][] = [
    ["Questions", (s) => String(s.cases)],
    ["Pass rate", (s) => pct(s.passRate)],
    ["Mean judge score (0-1)", (s) => s.meanScore.toFixed(2)],
    ["Critical failures", (s) => String(s.criticalFailed.length)],
    ["Mean cost per question", (s) => `$${s.meanCostUsd.toFixed(5)}`],
    ["Total cost", (s) => `$${s.totalCostUsd.toFixed(4)}`],
    ["Mean time", (s) => `${s.meanSeconds.toFixed(1)} s`],
    ["Slowest 10% (p90)", (s) => `${s.p90Seconds.toFixed(1)} s`],
    ["Mean tokens", (s) => String(Math.round(s.meanTokens))],
    ["Agent calls per question", (s) => s.meanAgentCalls.toFixed(2)],
    ["Failed", (s) => s.failed.join(", ") || "none"],
  ];
  const label = (s: Summary) =>
    s.mode === "multi" ? "Two agents (multi)" : "One agent (single)";
  return [
    `| | ${summaries.map(label).join(" | ")} |`,
    `|---|${summaries.map(() => "---").join("|")}|`,
    ...rows.map(([name, f]) => `| ${name} | ${summaries.map(f).join(" | ")} |`),
  ].join("\n");
}

/** One line per question: pass or fail, score, tools, and the judge's reason. */
export function caseTable(results: CaseResult[]): string {
  return [
    "| Question | Result | Score | Tools | Judge's reason |",
    "|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.id}${r.critical ? " (critical)" : ""} | ${r.pass ? "pass" : "FAIL"} | ${r.score.toFixed(2)} | ${r.tools.join(", ") || "none"} | ${r.reasoning.replace(/\|/g, "/").replace(/\n/g, " ")} |`,
    ),
  ].join("\n");
}
