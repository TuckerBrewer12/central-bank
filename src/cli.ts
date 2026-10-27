#!/usr/bin/env -S npx tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { collect } from "./ledger/collect.ts";
import { EntryError, parseEntry, type Entry } from "./ledger/entries.ts";
import { GitHub, resolveToken } from "./ledger/github.ts";
import { portfolioReport, repoReport } from "./ledger/report.ts";
import { buildSite } from "./ledger/site.ts";
import { resolveDataDir, Store } from "./ledger/store.ts";
import type { PrRecord } from "./ledger/types.ts";

const USAGE = `central-bank ledger <command>

  record --file <path|-> [--repo <owner/name>]
      Add an entry: a short summary of finished work (a loop run, a decision,
      an investigation). The file is JSON; see the record-to-ledger skill.
      Recording the same id again replaces the entry.

  collect --repo <owner/name> [--repo …] [--since <YYYY-MM-DD>] [--bot <login> …]
      Fetch PRs updated since the date (default: all), classify every review
      finding, and write one JSON file per PR.

  report [--out <dir>]
      Write README.md (all projects) and <owner>__<repo>.md per project
      (default --out ./reports).

  site [--out <dir>]
      Write <out>/index.html, a self-contained dashboard (default --out ./site).

Every command takes --data <dir>. Default: $CENTRAL_BANK_DATA, else ~/.central-bank/data.
GitHub token: GITHUB_TOKEN, GH_TOKEN, or \`gh auth token\`.`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function loadAll(store: Store): Promise<{ prs: Map<string, PrRecord[]>; entries: Map<string, Entry[]> }> {
  const prs = new Map<string, PrRecord[]>();
  const entries = new Map<string, Entry[]>();
  for (const repo of await store.repos()) {
    prs.set(repo, await store.readRepo(repo));
    entries.set(repo, await store.readEntries(repo));
  }
  return { prs, entries };
}

async function main(argv: string[]): Promise<void> {
  const [group, command, ...rest] = argv;
  if (group !== "ledger" || !command || command === "help") {
    console.log(USAGE);
    return;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      repo: { type: "string", multiple: true },
      since: { type: "string" },
      data: { type: "string" },
      out: { type: "string" },
      bot: { type: "string", multiple: true },
      file: { type: "string" },
    },
  });
  const store = new Store(resolveDataDir(values.data));

  if (command === "record") {
    if (!values.file) throw new Error("record needs --file <path>, or --file - to read stdin");
    const text = values.file === "-" ? await readStdin() : await readFile(values.file, "utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new Error(`The entry is not valid JSON: ${(err as Error).message}`);
    }
    const entry = parseEntry(raw, values.repo?.[0] ? { repo: values.repo[0] } : {});
    const path = await store.writeEntry(entry);
    console.log(`Recorded ${entry.kind} "${entry.title}" for ${entry.repo}\n  ${path}`);
    return;
  }

  if (command === "collect") {
    if (!values.repo?.length) throw new Error("collect needs at least one --repo owner/name");
    const gh = new GitHub(resolveToken());
    const since = values.since ? new Date(values.since).toISOString() : null;
    for (const repo of values.repo) {
      console.log(`${repo}${since ? ` (updated since ${values.since})` : ""}`);
      await collect(gh, store, {
        repo,
        since,
        ...(values.bot ? { botLogins: values.bot } : {}),
        log: (line) => console.log(line),
      });
    }
    return;
  }

  if (command === "report") {
    const { prs, entries } = await loadAll(store);
    const out = values.out ?? "reports";
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "README.md"), portfolioReport(prs, entries));
    for (const [repo, list] of prs) {
      await writeFile(join(out, `${repo.replace("/", "__")}.md`), repoReport(repo, list, entries.get(repo) ?? []));
    }
    console.log(`Wrote ${prs.size + 1} reports to ${out}/`);
    return;
  }

  if (command === "site") {
    const { prs, entries } = await loadAll(store);
    const out = values.out ?? "site";
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "index.html"), await buildSite([...prs.values()].flat(), [...entries.values()].flat()));
    console.log(`Wrote ${join(out, "index.html")}`);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof EntryError || err instanceof Error ? err.message : err);
  process.exit(1);
});
