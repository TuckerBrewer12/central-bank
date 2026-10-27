import { expect, test } from "vitest";
import { keptRate, repoReport, tally } from "../src/ledger/report.ts";
import type { Finding, PrRecord } from "../src/ledger/types.ts";

function finding(outcome: Finding["outcome"], lens = "MVVM Bot"): Finding {
  return {
    id: outcome,
    lens,
    path: "a.tsx",
    line: 1,
    createdAt: "2026-10-01T00:00:00Z",
    url: "https://example.com",
    excerpt: "x",
    hasSuggestion: false,
    outcome,
    basis: "none",
    confidence: "exact",
    fixPr: null,
  };
}

function pr(number: number, findings: Finding[], extra: Partial<PrRecord> = {}): PrRecord {
  return {
    schema: 1,
    repo: "o/r",
    number,
    title: `PR ${number}`,
    url: "https://example.com",
    state: "MERGED",
    draft: false,
    author: "me",
    base: "main",
    head: "feature",
    createdAt: "2026-10-01T00:00:00Z",
    mergedAt: "2026-10-02T00:00:00Z",
    closedAt: "2026-10-02T00:00:00Z",
    additions: 1,
    deletions: 1,
    commits: 1,
    writtenBy: ["claude"],
    checks: "SUCCESS",
    fixes: null,
    findings,
    ...extra,
  };
}

test("kept rate leaves open findings out", () => {
  const t = tally([finding("kept"), finding("kept"), finding("disregarded"), finding("unaddressed"), finding("open")]);
  expect(t).toMatchObject({ findings: 5, kept: 2, disregarded: 1, unaddressed: 1, open: 1 });
  expect(keptRate(t)).toBe(0.5);
  expect(keptRate(tally([finding("open")]))).toBeNull();
});

test("the repo report counts fix PRs apart from work PRs", () => {
  const md = repoReport("o/r", [
    pr(1, [finding("kept"), finding("disregarded", "Brand Kit Bot")]),
    pr(2, [], { fixes: 1, state: "CLOSED", head: "bot-fix/pr-1/x", writtenBy: ["bot"] }),
  ]);
  expect(md).toContain("**PRs:** 1 (0 open, 1 merged, 0 closed without merging), plus 1 bot fix PRs.");
  expect(md).toContain("| MVVM Bot | 1 | 1 | 0 | 0 | 0 | 100% | 100% |");
  expect(md).toContain("| Brand Kit Bot | 1 | 0 | 1 | 0 | 0 | 0% | 100% |");
});
