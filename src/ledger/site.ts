import { readFile } from "node:fs/promises";
import type { Entry } from "./entries.ts";
import type { PrRecord } from "./types.ts";

const TEMPLATE = new URL("./site.html", import.meta.url);
const PLACEHOLDER = "/*__LEDGER_DATA__*/";

/** The fields the dashboard reads; drops bodies and other bulk it never shows. */
function slim(pr: PrRecord) {
  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    writtenBy: pr.writtenBy,
    fixes: pr.fixes,
    findings: pr.findings.map((f) => ({
      lens: f.lens,
      path: f.path,
      line: f.line,
      createdAt: f.createdAt,
      url: f.url,
      excerpt: f.excerpt,
      outcome: f.outcome,
      basis: f.basis,
      confidence: f.confidence,
    })),
  };
}

/** A self-contained HTML dashboard with the ledger embedded in it. */
export async function buildSite(prs: PrRecord[], entries: Entry[] = [], now = new Date()): Promise<string> {
  const template = await readFile(TEMPLATE, "utf8");
  // `<` is escaped so text inside the data can never close the script tag.
  const json = JSON.stringify({ generatedAt: now.toISOString(), prs: prs.map(slim), entries }).replaceAll("<", "\\u003c");
  return template.replace(PLACEHOLDER, () => json);
}
