/** Who wrote a PR. A PR can have several, e.g. a human branch with Claude commits. */
export type Writer = "human" | "claude" | "codex" | "cursor" | "bot";

export type PrState = "OPEN" | "MERGED" | "CLOSED";

/**
 * What happened to a review finding.
 * - kept: the code changed to address it.
 * - disregarded: someone decided not to act on it.
 * - unaddressed: the PR closed with the finding still there and nobody answered it.
 * - open: the PR is still open and nothing has settled it yet.
 */
export type Outcome = "kept" | "disregarded" | "unaddressed" | "open";

/** The signal the outcome was read from. */
export type Basis =
  | "dismiss" // a `/dismiss` reply
  | "recheck" // the bot's own ✅/❌ recheck
  | "fix-pr" // the bot's fix PR was merged
  | "reply" // a human reply ("Fixed in abc1234", or an answer that left it)
  | "outdated" // the flagged lines changed after the comment
  | "resolved" // the thread was resolved without the lines changing
  | "none";

export interface Finding {
  id: string;
  lens: string;
  path: string;
  line: number | null;
  createdAt: string;
  url: string;
  excerpt: string;
  hasSuggestion: boolean;
  outcome: Outcome;
  basis: Basis;
  /** exact: read from an explicit signal. heuristic: inferred from thread state. */
  confidence: "exact" | "heuristic";
  fixPr: number | null;
}

export interface PrRecord {
  schema: 1;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: PrState;
  draft: boolean;
  author: string;
  base: string;
  head: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  commits: number;
  writtenBy: Writer[];
  checks: string | null;
  /** For a bot fix PR (`bot-fix/pr-<n>/…`), the PR it fixes. */
  fixes: number | null;
  findings: Finding[];
}

/** Raw review thread, as fetched. */
export interface ThreadComment {
  id: number;
  author: string;
  createdAt: string;
  body: string;
  url: string;
}

export interface Thread {
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  comments: ThreadComment[];
}
