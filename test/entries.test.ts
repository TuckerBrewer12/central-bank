import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EntryError, parseEntry } from "../src/ledger/entries.ts";
import { repoReport } from "../src/ledger/report.ts";
import { Store } from "../src/ledger/store.ts";

const now = new Date("2026-10-28T07:30:00Z");
const loopRun = {
  repo: "TuckerBrewer12/BirdieEyeView",
  kind: "loop-run",
  title: "Overnight scan-accuracy loop",
  outcome: "improved",
  summary: "41 attempts, 5 kept. Held-out 88.9% → 92.4%.",
  metrics: { program: "scan-accuracy", iterations: 41, kept: 5, heldout_before: 0.889, heldout_after: 0.924 },
  links: [{ label: "PR #412", url: "https://github.com/TuckerBrewer12/BirdieEyeView/pull/412" }],
  author: "claude",
};

describe("parseEntry", () => {
  test("fills the id, time and defaults", () => {
    const e = parseEntry(loopRun, { now });
    expect(e).toMatchObject({
      schema: 1,
      id: "2026-10-28-loop-run-overnight-scan-accuracy-loop",
      at: "2026-10-28T07:30:00.000Z",
      outcome: "improved",
      tags: [],
    });
  });

  test("takes the repo from the command line when the entry leaves it out", () => {
    const { repo: _, ...noRepo } = loopRun;
    expect(parseEntry(noRepo, { repo: "o/r", now }).repo).toBe("o/r");
  });

  test("names every problem at once", () => {
    const attempt = () =>
      parseEntry({ kind: "Loop Run", outcome: "great", metrics: { kept: true }, links: [{ label: "x", url: "ftp://x" }] }, { now });
    expect(attempt).toThrow(EntryError);
    expect(attempt).toThrow(/repo is required/);
    expect(attempt).toThrow(/kind must be short kebab-case/);
    expect(attempt).toThrow(/title is required/);
    expect(attempt).toThrow(/summary is required/);
    expect(attempt).toThrow(/outcome must be one of/);
    expect(attempt).toThrow(/metrics.kept must be a number or string/);
    expect(attempt).toThrow(/links\[0\]/);
  });

  test("defaults the outcome to info", () => {
    expect(parseEntry({ ...loopRun, outcome: undefined }, { now }).outcome).toBe("info");
  });
});

test("a recorded entry round-trips and shows in the repo report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-"));
  try {
    const store = new Store(dir);
    const entry = parseEntry(loopRun, { now });
    await store.writeEntry(entry);
    await store.writeEntry(entry);
    const entries = await store.readEntries("TuckerBrewer12/BirdieEyeView");
    expect(entries).toHaveLength(1);
    const md = repoReport("TuckerBrewer12/BirdieEyeView", [], entries, now);
    expect(md).toContain("## Loop runs");
    expect(md).toContain("| 2026-10-28 | [scan-accuracy](#2026-10-28-loop-run-overnight-scan-accuracy-loop) | improved | 41 | 5 | – | 0.889 → 0.924 | – |");
    expect(md).toContain("41 attempts, 5 kept.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
