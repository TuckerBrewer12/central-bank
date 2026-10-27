import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Entry } from "./entries.ts";
import type { PrRecord } from "./types.ts";

/**
 * Where the ledger lives: `--data`, else `CENTRAL_BANK_DATA`, else `~/.central-bank/data`.
 * One place per machine, so every repo's agents write to the same ledger.
 */
export function resolveDataDir(flag?: string): string {
  return flag ?? process.env.CENTRAL_BANK_DATA ?? join(homedir(), ".central-bank", "data");
}

/**
 * `<data>/<owner>/<repo>/prs/<number>.json`, one file per PR, and
 * `<data>/<owner>/<repo>/entries/<id>.json`, one file per entry.
 * Writing a record again overwrites it, so the store never holds duplicates
 * and a git diff of the data shows exactly what changed.
 */
export class Store {
  constructor(readonly root: string) {}

  private dir(repo: string, kind: "prs" | "entries"): string {
    return join(this.root, ...repo.split("/"), kind);
  }

  private async writeJson(dir: string, name: string, value: unknown): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${name}.json`);
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    return path;
  }

  private async readAll<T>(dir: string): Promise<T[]> {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    return Promise.all(
      files.filter((f) => f.endsWith(".json")).map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as T),
    );
  }

  async write(record: PrRecord): Promise<string> {
    return this.writeJson(this.dir(record.repo, "prs"), String(record.number), record);
  }

  async writeEntry(entry: Entry): Promise<string> {
    return this.writeJson(this.dir(entry.repo, "entries"), entry.id, entry);
  }

  async readRepo(repo: string): Promise<PrRecord[]> {
    return (await this.readAll<PrRecord>(this.dir(repo, "prs"))).sort((a, b) => a.number - b.number);
  }

  async readEntries(repo: string): Promise<Entry[]> {
    return (await this.readAll<Entry>(this.dir(repo, "entries"))).sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Every repo with data, as `owner/name`. */
  async repos(): Promise<string[]> {
    const repos: string[] = [];
    for (const owner of await readdir(this.root).catch(() => [])) {
      for (const name of await readdir(join(this.root, owner)).catch(() => [])) {
        repos.push(`${owner}/${name}`);
      }
    }
    return repos.sort();
  }
}
