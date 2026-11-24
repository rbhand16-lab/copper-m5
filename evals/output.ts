// Prints and saves the results of an eval run.
import { mkdirSync, writeFileSync } from "node:fs";
import type { RunResult } from "./run";
import { caseTable, gate } from "./report";

/** Writes evals/results/<name>.json and .md, and prints the table. CI shows it on the pull request (see ci.yml). */
export function publish(name: string, markdown: string, data: unknown) {
  mkdirSync("evals/results", { recursive: true });
  writeFileSync(`evals/results/${name}.json`, JSON.stringify(data, null, 2));
  writeFileSync(`evals/results/${name}.md`, markdown);
  console.log(`\n${markdown}\n`);
}

export function runMarkdown(run: RunResult): string {
  const { summary, results, url } = run;
  const verdict = gate(summary);
  return [
    `## Golden set: ${summary.mode === "multi" ? "two agents" : "one agent"}`,
    "",
    `**${verdict.ok ? "PASS" : "FAIL"}**: ${Math.round(summary.passRate * 100)}% passed, mean judge score ${summary.meanScore.toFixed(2)}, cost $${summary.totalCostUsd.toFixed(4)}, mean time ${summary.meanSeconds.toFixed(1)} s.`,
    ...(verdict.ok ? [] : ["", ...verdict.reasons.map((r) => `- ${r}`)]),
    ...(url ? ["", `Langfuse run: ${url}`] : []),
    "",
    caseTable(results),
  ].join("\n");
}
