import { writtenBy } from "./attribution.ts";
import { classify, isFinding } from "./classify.ts";
import { type GitHub, listPrs, prStates, type RawPr } from "./github.ts";
import type { Store } from "./store.ts";
import type { PrRecord, PrState } from "./types.ts";

export const DEFAULT_BOT_LOGINS = ["github-actions"];

const FIX_BRANCH_RE = /^bot-fix\/pr-(\d+)\//;
const FIX_PR_RE = /(?:Opened|Already opened) \[#(\d+)\]/;

export interface CollectOptions {
  repo: string;
  since: string | null;
  botLogins?: string[];
  log?: (line: string) => void;
}

export function toRecord(
  repo: string,
  pr: RawPr,
  botLogins: ReadonlySet<string>,
  fixPrStates: ReadonlyMap<number, PrState>,
): PrRecord {
  const ctx = { prState: pr.state, botLogins, fixPrStates };
  return {
    schema: 1,
    repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    draft: pr.isDraft,
    author: pr.author,
    base: pr.baseRefName,
    head: pr.headRefName,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    commits: pr.commitCount,
    writtenBy: writtenBy({
      author: pr.author,
      head: pr.headRefName,
      body: pr.body,
      commitMessages: pr.commitMessages,
    }),
    checks: pr.checks,
    fixes: Number(pr.headRefName.match(FIX_BRANCH_RE)?.[1] ?? NaN) || null,
    findings: pr.threads.filter((t) => isFinding(t, botLogins)).map((t) => classify(t, ctx)),
  };
}

/** Fetch every PR updated since `since`, classify its findings, and write it to the store. */
export async function collect(gh: GitHub, store: Store, opts: CollectOptions): Promise<PrRecord[]> {
  const log = opts.log ?? (() => {});
  const botLogins = new Set(opts.botLogins ?? DEFAULT_BOT_LOGINS);

  const raw: RawPr[] = [];
  for await (const pr of listPrs(gh, opts.repo, opts.since)) {
    raw.push(pr);
    if (raw.length % 20 === 0) log(`  fetched ${raw.length} PRs…`);
  }

  // A finding's fix PR may sit outside this window; look its state up.
  const known = new Map<number, PrState>();
  for (const r of await store.readRepo(opts.repo)) known.set(r.number, r.state);
  for (const pr of raw) known.set(pr.number, pr.state);
  const wanted = new Set<number>();
  for (const pr of raw)
    for (const t of pr.threads)
      for (const c of t.comments) {
        const n = Number(c.body.match(FIX_PR_RE)?.[1] ?? NaN);
        if (n && !known.has(n)) wanted.add(n);
      }
  for (const [n, state] of await prStates(gh, opts.repo, [...wanted])) known.set(n, state);

  const records = raw.map((pr) => toRecord(opts.repo, pr, botLogins, known));
  for (const record of records) await store.write(record);
  log(`  wrote ${records.length} PRs, ${records.reduce((n, r) => n + r.findings.length, 0)} findings`);
  return records;
}
