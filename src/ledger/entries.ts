/**
 * Ledger entries: short written summaries of work that isn't a PR, such as a loop run, a
 * decision, an incident, or an investigation. An agent writes one when the work finishes,
 * so the ledger can show over time what was tried and how it went.
 */

export const KNOWN_KINDS = ["loop-run", "decision", "investigation", "incident", "release", "note"] as const;
export const OUTCOMES = ["improved", "no-change", "regressed", "failed", "info"] as const;

export type EntryOutcome = (typeof OUTCOMES)[number];

export interface EntryLink {
  label: string;
  url: string;
}

export interface Entry {
  schema: 1;
  id: string;
  /** `owner/name` of the project the work was in. */
  repo: string;
  /** One of KNOWN_KINDS, or any other short kebab-case kind. */
  kind: string;
  title: string;
  /** When the work finished. ISO 8601. */
  at: string;
  /** How it went, in a few plain sentences of markdown. */
  summary: string;
  outcome: EntryOutcome;
  /** Numbers worth tracking over time. For a loop-run, see LOOP_RUN_METRICS. */
  metrics: Record<string, number | string>;
  links: EntryLink[];
  /** Who did the work: human, claude, codex, cursor, bot. */
  author: string | null;
  tags: string[];
}

/** Metric keys a loop-run entry uses, so runs line up in the dashboard. All optional. */
export const LOOP_RUN_METRICS = [
  "program",
  "metric",
  "iterations",
  "kept",
  "dev_before",
  "dev_after",
  "heldout_before",
  "heldout_after",
  "cost_usd",
  "hours",
] as const;

const KIND_RE = /^[a-z][a-z0-9-]{1,39}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "entry"
  );
}

export class EntryError extends Error {}

/**
 * Checks raw JSON from an agent and fills defaults. Throws EntryError naming every problem, so
 * the agent can fix them in one go.
 */
export function parseEntry(raw: unknown, defaults: { repo?: string; now?: Date } = {}): Entry {
  const problems: string[] = [];
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (key: string): string | undefined => {
    const v = input[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") {
      problems.push(`${key} must be a string`);
      return undefined;
    }
    return v.trim();
  };

  const repo = str("repo") ?? defaults.repo;
  if (!repo) problems.push("repo is required (owner/name)");
  else if (!REPO_RE.test(repo)) problems.push(`repo must look like owner/name, got "${repo}"`);

  const kind = str("kind");
  if (!kind) problems.push(`kind is required, e.g. ${KNOWN_KINDS.join(", ")}`);
  else if (!KIND_RE.test(kind)) problems.push(`kind must be short kebab-case, got "${kind}"`);

  const title = str("title");
  if (!title) problems.push("title is required");

  const summary = str("summary");
  if (!summary) problems.push("summary is required: say how it went, with numbers");

  const outcome = str("outcome") ?? "info";
  if (!(OUTCOMES as readonly string[]).includes(outcome)) {
    problems.push(`outcome must be one of ${OUTCOMES.join(", ")}, got "${outcome}"`);
  }

  const atRaw = str("at");
  const at = atRaw ? new Date(atRaw) : (defaults.now ?? new Date());
  if (Number.isNaN(at.getTime())) problems.push(`at must be an ISO date, got "${atRaw}"`);

  const metrics: Record<string, number | string> = {};
  if (input.metrics !== undefined) {
    if (typeof input.metrics !== "object" || input.metrics === null || Array.isArray(input.metrics)) {
      problems.push("metrics must be an object of numbers or strings");
    } else {
      for (const [k, v] of Object.entries(input.metrics)) {
        if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
        else if (typeof v === "string") metrics[k] = v;
        else problems.push(`metrics.${k} must be a number or string`);
      }
    }
  }

  const links: EntryLink[] = [];
  if (input.links !== undefined) {
    if (!Array.isArray(input.links)) problems.push("links must be an array of {label, url}");
    else
      input.links.forEach((l, i) => {
        const link = l as Partial<EntryLink>;
        if (typeof link?.label !== "string" || typeof link?.url !== "string" || !/^https?:\/\//.test(link.url)) {
          problems.push(`links[${i}] must be {label, url} with an http(s) url`);
        } else links.push({ label: link.label, url: link.url });
      });
  }

  const tags = Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === "string") : [];
  const author = str("author") ?? null;

  if (problems.length > 0) throw new EntryError(`Entry is not valid:\n- ${problems.join("\n- ")}`);

  const iso = at.toISOString();
  return {
    schema: 1,
    id: str("id") ?? `${iso.slice(0, 10)}-${kind}-${slugify(title!)}`,
    repo: repo!,
    kind: kind!,
    title: title!,
    at: iso,
    summary: summary!,
    outcome: outcome as EntryOutcome,
    metrics,
    links,
    author,
    tags,
  };
}
