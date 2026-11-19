// npm run protect-main: turns on branch protection for main in your own repo.
// Changes go in only through a pull request, the checks below must pass first,
// and nobody (admins too) can push straight to main.
// Needs the GitHub CLI, logged in as the owner of the repo.
import { spawnSync } from "node:child_process";

// The names GitHub shows for the jobs in .github/workflows/ci.yml.
export const REQUIRED_CHECKS = [
  "check (ubuntu-latest)",
  "check (macos-latest)",
  "check (windows-latest)",
  "eval",
];

export function protectionBody(checks = REQUIRED_CHECKS) {
  return {
    required_status_checks: {
      strict: true,
      checks: checks.map((context) => ({ context })),
    },
    enforce_admins: true,
    // A pull request is required. 0 approvals, because a solo student can't
    // approve their own pull request.
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
  };
}

function gh(args, input) {
  const result = spawnSync("gh", args, { encoding: "utf8", input });
  if (result.error?.code === "ENOENT") {
    console.error(
      "protect-main: install the GitHub CLI first: https://cli.github.com",
    );
    process.exit(1);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  if (repo.status !== 0) {
    console.error(
      "protect-main: run this inside your repo, logged in with gh auth login.",
    );
    process.exit(1);
  }
  const name = repo.stdout.trim();
  const put = gh(
    [
      "api",
      "--method",
      "PUT",
      `repos/${name}/branches/main/protection`,
      "--input",
      "-",
    ],
    JSON.stringify(protectionBody()),
  );
  if (put.status !== 0) {
    console.error(put.stderr || put.stdout);
    console.error(
      "protect-main: GitHub refused. Branch protection needs a public repo, or a paid plan for a private one.",
    );
    process.exit(1);
  }
  console.log(
    `Done: main in ${name} now needs a pull request and passing checks.`,
  );
}
