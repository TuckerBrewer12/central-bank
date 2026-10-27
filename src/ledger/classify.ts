import type { Basis, Finding, Outcome, PrState, Thread, ThreadComment } from "./types.ts";

const MARKER_RE = /<!-- review-bot:(\{.*?\}) -->/s;
const STATUS_RE = /<!-- review-bot-status:(\{.*?\}) -->/s;
const REVIEWER_RE = /Reviewer%3A%20(.+?)%0A/;
const FIX_PR_RE = /(?:Opened|Already opened) \[#(\d+)\]/;
const DISMISS_RE = /^\s*\/dismiss\b/i;
const FIXED_REPLY_RE = /\b(fixed|addressed|done)\b.*\b[0-9a-f]{7,40}\b|^\s*(fixed|addressed|done)\b/i;
const COMMAND_RE = /^\s*\/\w+/;

export interface ClassifyContext {
  prState: PrState;
  botLogins: ReadonlySet<string>;
  /** State of each PR the bot opened as a fix, by number. */
  fixPrStates: ReadonlyMap<number, PrState>;
}

interface Marker {
  id?: string;
  bot?: string;
  line?: number;
}

function parseJson<T>(match: RegExpMatchArray | null): T | null {
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function lensOf(body: string, marker: Marker | null): string {
  if (marker?.bot) return stripEmoji(marker.bot);
  const reviewer = body.match(REVIEWER_RE)?.[1];
  if (reviewer) return stripEmoji(decodeURIComponent(reviewer));
  return "unknown";
}

function stripEmoji(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function excerptOf(body: string): string {
  const prose = body.split(/\n```|\n\[Discuss in Conductor\]|\n<!--/)[0] ?? "";
  const flat = prose.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}

/** A review thread is a finding when a bot opened it. */
export function isFinding(thread: Thread, botLogins: ReadonlySet<string>): boolean {
  const first = thread.comments[0];
  return first !== undefined && botLogins.has(first.author);
}

export function classify(thread: Thread, ctx: ClassifyContext): Finding {
  const [first, ...replies] = thread.comments as [ThreadComment, ...ThreadComment[]];
  const marker = parseJson<Marker>(first.body.match(MARKER_RE));
  const isBot = (c: ThreadComment) => ctx.botLogins.has(c.author);
  // `/fix` and other commands are requests, not answers; `/dismiss` is an answer.
  const human = replies.filter(
    (c) => !isBot(c) && (!COMMAND_RE.test(c.body) || DISMISS_RE.test(c.body)),
  );

  let lastStatus: { status: string; at: string } | null = null;
  let fixPr: number | null = null;
  for (const c of replies.filter(isBot)) {
    const status = parseJson<{ status?: string }>(c.body.match(STATUS_RE));
    if (status?.status) lastStatus = { status: status.status, at: c.createdAt };
    const pr = c.body.match(FIX_PR_RE)?.[1];
    if (pr) fixPr = Number(pr);
  }

  const settle = (outcome: Outcome, basis: Basis, confidence: Finding["confidence"]): Finding => ({
    id: marker?.id ?? String(first.id),
    lens: lensOf(first.body, marker),
    path: thread.path,
    line: thread.line ?? thread.originalLine ?? marker?.line ?? null,
    createdAt: first.createdAt,
    url: first.url,
    excerpt: excerptOf(first.body),
    hasSuggestion: first.body.includes("```suggestion"),
    outcome,
    basis,
    confidence,
    fixPr,
  });

  const claimsFixed = (after: string | null) =>
    human.some((c) => (after === null || c.createdAt > after) && FIXED_REPLY_RE.test(c.body));
  const closed = ctx.prState !== "OPEN";

  if (human.some((c) => DISMISS_RE.test(c.body))) return settle("disregarded", "dismiss", "exact");
  if (lastStatus?.status === "fixed") return settle("kept", "recheck", "exact");
  if (fixPr !== null && ctx.fixPrStates.get(fixPr) === "MERGED") return settle("kept", "fix-pr", "exact");

  if (lastStatus) {
    if (claimsFixed(lastStatus.at)) return settle("kept", "reply", "heuristic");
    if (!closed) return settle("open", "recheck", "exact");
    return human.length > 0
      ? settle("disregarded", "reply", "exact")
      : settle("unaddressed", "recheck", "exact");
  }

  if (claimsFixed(null)) return settle("kept", "reply", "heuristic");
  if (thread.isOutdated) return settle("kept", "outdated", "heuristic");
  if (thread.isResolved) return settle("disregarded", "resolved", "heuristic");
  if (!closed) return settle("open", "none", "heuristic");
  if (human.length > 0) return settle("disregarded", "reply", "heuristic");
  return settle("unaddressed", "none", "heuristic");
}
