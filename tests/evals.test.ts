// Module 5: the golden set, the judge's prompt and the merge gate are plain
// code, so they are tested here without calling a model.
import { describe, expect, it } from "vitest";
import { GOLDEN_SET } from "@/evals/golden-set";
import { judgePrompt, judgeSchema } from "@/evals/judge";
import {
  type CaseResult,
  caseTable,
  comparisonTable,
  gate,
  summarize,
  THRESHOLDS,
} from "@/evals/report";
import { getOrders } from "@/lib/copper/orders";

const result = (over: Partial<CaseResult> = {}): CaseResult => ({
  id: "q",
  category: "catalog",
  critical: false,
  pass: true,
  judgePass: true,
  toolsOk: true,
  score: 1,
  reasoning: "ok",
  tools: ["get_prices"],
  agent: "copper",
  agentCalls: 1,
  tokens: 1000,
  costUsd: 0.001,
  seconds: 2,
  reply: "$129",
  ...over,
});

describe("golden set", () => {
  it("has unique ids and real criteria", () => {
    const ids = GOLDEN_SET.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of GOLDEN_SET) {
      expect(c.question.length, c.id).toBeGreaterThan(5);
      expect(c.criteria.length, c.id).toBeGreaterThan(20);
    }
  });

  it("covers every kind of question, with critical safety and refund cases", () => {
    const categories = new Set(GOLDEN_SET.map((c) => c.category));
    for (const c of ["catalog", "docs", "scope", "safety", "refund", "handoff"])
      expect(categories.has(c as never), c).toBe(true);
    expect(GOLDEN_SET.filter((c) => c.critical).length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it("gives every refund question a desk, and only names tools that exist", () => {
    const known = new Set([
      "get_products",
      "get_prices",
      "calculate_cost",
      "check_availability",
      "search_docs",
      "get_orders",
      "request_refund",
    ]);
    for (const c of GOLDEN_SET) {
      if (c.category === "refund" || c.category === "handoff")
        expect(c.desk, c.id).toBeDefined();
      for (const t of [...(c.mustCall ?? []), ...(c.mustNotCall ?? [])])
        expect(known.has(t), `${c.id}: ${t}`).toBe(true);
    }
  });

  it("states refund amounts that match the orders", () => {
    const orders = getOrders();
    const amount = (id: string) =>
      orders.find((o) => o.id === id)!.amountUsd.toString();
    const by = (id: string) => GOLDEN_SET.find((c) => c.id === id)!.criteria;
    expect(by("refund-under-limit")).toContain(`$${amount("1001")}`);
    expect(by("refund-over-limit")).toContain(`$${amount("1004")}`);
    expect(by("refund-higher-limit")).toContain(`$${amount("1004")}`);
  });
});

describe("judge", () => {
  it("shows the judge the question, criteria, tools and answer", () => {
    const prompt = judgePrompt({
      question: "How much is Notes?",
      criteria: "Says $129.",
      reply: "It costs $129.",
      toolCalls: [{ name: "get_prices", input: {}, output: { ok: true } }],
    });
    for (const part of [
      "How much is Notes?",
      "Says $129.",
      "get_prices",
      "It costs $129.",
    ])
      expect(prompt).toContain(part);
  });

  it("accepts only scores from 1 to 5", () => {
    const ok = { reasoning: "r", score: 4, pass: true };
    expect(judgeSchema.safeParse(ok).success).toBe(true);
    expect(judgeSchema.safeParse({ ...ok, score: 0 }).success).toBe(false);
    expect(judgeSchema.safeParse({ ...ok, score: 6 }).success).toBe(false);
  });
});

describe("merge gate", () => {
  it("passes a run that clears every bar", () => {
    const s = summarize("multi", [result(), result({ id: "r" })]);
    expect(gate(s)).toEqual({ ok: true, reasons: [] });
  });

  it("blocks when a critical question fails, even if the average is high", () => {
    const many = Array.from({ length: 19 }, (_, i) => result({ id: `q${i}` }));
    const s = summarize("multi", [
      ...many,
      result({
        id: "refund-over-limit",
        critical: true,
        pass: false,
        score: 0,
      }),
    ]);
    expect(s.passRate).toBeGreaterThan(THRESHOLDS.passRate);
    const verdict = gate(s);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join()).toContain("refund-over-limit");
  });

  it("blocks a low pass rate or low score, and an empty run", () => {
    const bad = summarize("single", [
      result({ pass: false, score: 0.25 }),
      result({ id: "b", pass: false, score: 0.25 }),
    ]);
    expect(gate(bad).ok).toBe(false);
    expect(gate(summarize("single", [])).ok).toBe(false);
  });

  it("adds up cost and time, and prints tables for both modes", () => {
    const multi = summarize("multi", [
      result({ costUsd: 0.002, seconds: 4 }),
      result({ id: "b", costUsd: 0.004, seconds: 6 }),
    ]);
    expect(multi.totalCostUsd).toBeCloseTo(0.006);
    expect(multi.meanSeconds).toBe(5);
    const single = summarize("single", [result()]);
    const table = comparisonTable([multi, single]);
    expect(table).toContain("Two agents");
    expect(table).toContain("One agent");
    expect(caseTable([result({ critical: true })])).toContain("(critical)");
  });
});
