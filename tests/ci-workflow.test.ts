// Module 5: CI runs the tests and the golden-set eval on every pull request,
// and branch protection requires them. These tests keep that wiring honest.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { protectionBody, REQUIRED_CHECKS } from "@/scripts/protect-main.mjs";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("CI workflow", () => {
  it("runs on every pull request", () => {
    expect(ci).toMatch(/^on:\n {2}pull_request:/m);
  });

  it("runs the tests and the golden-set eval", () => {
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run eval");
    expect(pkg.scripts.eval).toContain("golden.eval.ts");
  });

  it("gives the eval its keys from Actions secrets, never typed in the file", () => {
    for (const key of [
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "LANGFUSE_PUBLIC_KEY",
      "LANGFUSE_SECRET_KEY",
      "LANGFUSE_BASE_URL",
    ])
      expect(ci).toContain(`${key}: \${{ secrets.${key} }}`);
  });
});

describe("branch protection", () => {
  it("requires a pull request, passing checks and no admin bypass", () => {
    const body = protectionBody();
    expect(body.required_pull_request_reviews).toBeDefined();
    expect(
      body.required_status_checks.checks.map(
        (c: { context: string }) => c.context,
      ),
    ).toEqual(REQUIRED_CHECKS);
    expect(body.enforce_admins).toBe(true);
    expect(body.allow_force_pushes).toBe(false);
  });

  it("requires exactly the jobs that ci.yml defines", () => {
    expect(REQUIRED_CHECKS).toContain("eval");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) {
      expect(REQUIRED_CHECKS).toContain(`check (${os})`);
      expect(ci).toContain(os);
    }
    expect(ci).toMatch(/^ {2}eval:/m);
  });
});
