// Part 4 (Module 5): run the same golden set on the two-agent desk and on one
// agent with every tool, and compare quality, cost and time. Both runs are
// Langfuse dataset runs on the same dataset, so Langfuse can compare them too.
// Run it with: npm run eval:compare
import { describe, expect, it } from "vitest";
import { SUPPORT_MODES } from "@/lib/copper/assistant/mode";
import { publish, runMarkdown } from "./output";
import { comparisonTable } from "./report";
import { loadLocalEnv, missingKeys, runGoldenSet } from "./run";

loadLocalEnv();

describe("single vs multi agent", () => {
  it("runs the golden set on both", async () => {
    expect(missingKeys(), "keys missing from the environment").toEqual([]);
    const runs = [];
    for (const mode of SUPPORT_MODES) runs.push(await runGoldenSet(mode));
    const markdown = [
      "# Single agent vs two agents",
      "",
      comparisonTable(runs.map((r) => r.summary)),
      "",
      ...runs.map((r) => runMarkdown(r)),
    ].join("\n");
    publish("compare", markdown, runs);
    expect(runs).toHaveLength(2);
  });
});
