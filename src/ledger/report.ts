import type { Entry } from "./entries.ts";
import type { Finding, Outcome, PrRecord, Writer } from "./types.ts";

export interface Tally {
  findings: number;
  kept: number;
  disregarded: number;
  unaddressed: number;
  open: number;
  exact: number;
}

export function tally(findings: Finding[]): Tally {
  const t: Tally = { findings: 0, kept: 0, disregarded: 0, unaddressed: 0, open: 0, exact: 0 };
  for (const f of findings) {
    t.findings++;
    t[f.outcome satisfies Outcome]++;
    if (f.confidence === "exact") t.exact++;
  }
  return t;
}

/** Share of settled findings that were kept. Open findings are not settled yet. */
export function keptRate(t: Tally): number | null {
  const settled = t.kept + t.disregarded + t.unaddressed;
  return settled === 0 ? null : t.kept / settled;
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

function table(header: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function tallyRow(label: string, t: Tally): Array<string | number> {
  return [label, t.findings, t.kept, t.disregarded, t.unaddressed, t.open, pct(keptRate(t)), pct(t.exact / (t.findings || 1))];
}

const TALLY_HEADER = ["", "Findings", "Kept", "Disregarded", "Unaddressed", "Open", "Kept rate", "Exact"];

const isFixPr = (pr: PrRecord) => pr.fixes !== null;
const primaryWriter = (pr: PrRecord): Writer => pr.writtenBy.find((w) => w !== "human") ?? "human";

export function repoReport(repo: string, prs: PrRecord[], entries: Entry[] = [], now = new Date()): string {
  const work = prs.filter((pr) => !isFixPr(pr));
  const fixPrs = prs.filter(isFixPr);
  const findings = prs.flatMap((pr) => pr.findings);
  const all = tally(findings);
  const count = (state: PrRecord["state"]) => work.filter((pr) => pr.state === state).length;

  const writers = [...groupBy(work, primaryWriter)].sort((a, b) => b[1].length - a[1].length);
  const lenses = [...groupBy(findings, (f) => f.lens)].sort((a, b) => b[1].length - a[1].length);
  const months = [...groupBy(findings, (f) => f.createdAt.slice(0, 7))].sort(([a], [b]) => b.localeCompare(a));
  const bases = [...groupBy(findings, (f) => `${f.basis} → ${f.outcome}`)].sort((a, b) => b[1].length - a[1].length);
  const files = [...groupBy(findings, (f) => f.path)].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  const disregarded = findings
    .filter((f) => f.outcome === "disregarded")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return [
    `# ${repo}`,
    "",
    `_Generated ${now.toISOString().slice(0, 16).replace("T", " ")} UTC from ${prs.length} PRs and ${entries.length} entries._`,
    "",
    ...entrySections(entries),
    "## Summary",
    "",
    `- **PRs:** ${work.length} (${count("OPEN")} open, ${count("MERGED")} merged, ${count("CLOSED")} closed without merging), plus ${fixPrs.length} bot fix PRs.`,
    `- **Review findings:** ${all.findings}. ${all.kept} kept, ${all.disregarded} disregarded, ${all.unaddressed} unaddressed, ${all.open} still open.`,
    `- **Kept rate:** ${pct(keptRate(all))} of settled findings. ${pct(all.exact / (all.findings || 1))} of outcomes come from an explicit signal; the rest are inferred from thread state.`,
    "",
    "## Who writes the PRs",
    "",
    table(
      ["Writer", "PRs", "Merged", "Open"],
      writers.map(([w, list]) => [w, list.length, list.filter((p) => p.state === "MERGED").length, list.filter((p) => p.state === "OPEN").length]),
    ),
    "",
    "## Findings by lens",
    "",
    table(TALLY_HEADER, [...lenses.map(([lens, list]) => tallyRow(lens, tally(list))), tallyRow("**All**", all)]),
    "",
    "## Findings by month",
    "",
    table(TALLY_HEADER, months.map(([month, list]) => tallyRow(month, tally(list)))),
    "",
    "## How outcomes were decided",
    "",
    table(["Signal → outcome", "Findings"], bases.map(([b, list]) => [b, list.length])),
    "",
    "## Bot fix PRs",
    "",
    `${fixPrs.length} opened: ${fixPrs.filter((p) => p.state === "MERGED").length} merged, ${fixPrs.filter((p) => p.state === "CLOSED").length} closed, ${fixPrs.filter((p) => p.state === "OPEN").length} open. A closed fix PR is not a rejection: the finding is often fixed by a direct commit instead, and counts as kept above.`,
    "",
    "## Most-flagged files",
    "",
    table(["File", "Findings", "Kept rate"], files.map(([path, list]) => [`\`${path}\``, list.length, pct(keptRate(tally(list)))])),
    "",
    "## Recently disregarded",
    "",
    ...(disregarded.length === 0
      ? ["None."]
      : disregarded.map((f) => `- [${f.lens}](${f.url}) \`${f.path}\` (${f.basis}): ${f.excerpt.replaceAll("|", "\\|")}`)),
    "",
  ].join("\n");
}

const metric = (e: Entry, key: string) => (e.metrics[key] === undefined ? "–" : String(e.metrics[key]));
const change = (e: Entry, before: string, after: string) =>
  e.metrics[before] === undefined && e.metrics[after] === undefined ? "–" : `${metric(e, before)} → ${metric(e, after)}`;

/** Loop runs as a table, then the latest entries of every kind with their summaries. */
function entrySections(entries: Entry[]): string[] {
  if (entries.length === 0) return [];
  const loops = entries.filter((e) => e.kind === "loop-run");
  const lines: string[] = [];
  if (loops.length > 0) {
    lines.push(
      "## Loop runs",
      "",
      table(
        ["Finished", "Program", "Outcome", "Iterations", "Kept", "Dev", "Held-out", "Cost"],
        loops.map((e) => [
          e.at.slice(0, 10),
          `[${metric(e, "program") === "–" ? e.title : metric(e, "program")}](#${e.id})`,
          e.outcome,
          metric(e, "iterations"),
          metric(e, "kept"),
          change(e, "dev_before", "dev_after"),
          change(e, "heldout_before", "heldout_after"),
          e.metrics.cost_usd === undefined ? "–" : `$${e.metrics.cost_usd}`,
        ]),
      ),
      "",
    );
  }
  lines.push("## Latest entries", "");
  for (const e of entries.slice(0, 10)) {
    lines.push(`### ${e.at.slice(0, 10)} · ${e.kind} · ${e.title} <a id="${e.id}"></a>`, "");
    lines.push(`_${e.outcome}${e.author ? ` · ${e.author}` : ""}_`, "", e.summary, "");
    if (e.links.length > 0) lines.push(e.links.map((l) => `[${l.label}](${l.url})`).join(" · "), "");
  }
  return lines;
}

export function portfolioReport(byRepo: Map<string, PrRecord[]>, entriesByRepo = new Map<string, Entry[]>(), now = new Date()): string {
  const rows = [...byRepo].map(([repo, prs]) => {
    const work = prs.filter((pr) => !isFixPr(pr));
    const t = tally(prs.flatMap((pr) => pr.findings));
    const slug = repo.replace("/", "__");
    return [
      `[${repo}](${slug}.md)`,
      work.filter((p) => p.state === "OPEN").length,
      work.filter((p) => p.state === "MERGED").length,
      t.findings,
      t.kept,
      t.disregarded,
      t.unaddressed,
      pct(keptRate(t)),
      entriesByRepo.get(repo)?.[0]?.at.slice(0, 10) ?? "–",
    ];
  });
  return [
    "# central-bank ledger",
    "",
    `_Generated ${now.toISOString().slice(0, 16).replace("T", " ")} UTC._`,
    "",
    table(["Project", "Open PRs", "Merged PRs", "Findings", "Kept", "Disregarded", "Unaddressed", "Kept rate", "Last entry"], rows),
    "",
  ].join("\n");
}
