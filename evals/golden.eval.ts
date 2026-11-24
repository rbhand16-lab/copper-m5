// The merge gate (Module 5): run the golden set on the agent we ship, have the
// AI judge grade every answer, save the scores in Langfuse, and fail if the
// results are below the bar in report.ts. Run it with: npm run eval
import { describe, expect, it } from "vitest";
import { DEFAULT_MODE } from "@/lib/copper/assistant/mode";
import { publish, runMarkdown } from "./output";
import { gate } from "./report";
import { loadLocalEnv, missingKeys, runGoldenSet } from "./run";

loadLocalEnv();
const inCI = Boolean(process.env.CI);

describe("golden set", () => {
  it("has the keys it needs", () => {
    const missing = missingKeys();
    // In CI a missing key must fail the check: a skipped eval would let a
    // broken change merge. On a laptop it only skips.
    if (missing.length && !inCI) {
      console.warn(
        `Skipping the golden set. Missing: ${missing.join(", ")}. Add them to .env.local.`,
      );
      return;
    }
    expect(missing, "keys missing from the environment").toEqual([]);
  });

  it(`passes the gate on the ${DEFAULT_MODE} agent`, async () => {
    if (missingKeys().length) return;
    const run = await runGoldenSet(DEFAULT_MODE);
    publish("golden", runMarkdown(run), run);
    const verdict = gate(run.summary);
    expect(verdict.reasons).toEqual([]);
  });
});
