import { expect, test } from "vitest";
import { writtenBy } from "../src/ledger/attribution.ts";

const base = { author: "TuckerBrewer12", head: "feature", body: "", commitMessages: [] as string[] };

test("a PR with no agent signal is human", () => {
  expect(writtenBy(base)).toEqual(["human"]);
});

test("Claude is read from the PR footer or a commit trailer", () => {
  expect(writtenBy({ ...base, body: "🤖 Generated with [Claude Code](https://claude.com/claude-code)" })).toEqual(["claude"]);
  expect(writtenBy({ ...base, commitMessages: ["Fix\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"] })).toEqual(["claude"]);
});

test("Codex and Cursor are read from their branch prefixes", () => {
  expect(writtenBy({ ...base, head: "codex/scan-fix" })).toEqual(["codex"]);
  expect(writtenBy({ ...base, head: "cursor/landing" })).toEqual(["cursor"]);
});

test("bot fix branches and bot authors are bots", () => {
  expect(writtenBy({ ...base, head: "bot-fix/pr-367/abc", author: "github-actions" })).toEqual(["bot"]);
  expect(writtenBy({ ...base, author: "dependabot[bot]" })).toEqual(["bot"]);
});
