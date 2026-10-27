# AGENTS.md

central-bank is Tucker's software factory: shared skills and workflows for every project, plus a
ledger of PRs, review-bot effectiveness and written summaries of finished work. See README.md.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run check:pstack        # plugins/pstack still matches the pin in vendor.json
npm run ledger -- help
```

## Layout

- `.claude-plugin/marketplace.json`: the plugin marketplace. Lists `plugins/*`.
- `plugins/central-bank/`: our plugin. Skills in `skills/<name>/SKILL.md`.
- `plugins/pstack/`: vendored pstack. **Never edit by hand**; `scripts/sync-pstack.sh` owns it.
- `src/cli.ts`: the `central-bank` CLI. `bin/central-bank.mjs` runs it through tsx for `npx`.
- `src/ledger/`: the ledger.
  - `github.ts`: GraphQL fetch.
  - `classify.ts`: finding outcomes.
  - `attribution.ts`: who wrote a PR.
  - `entries.ts`: entry schema and validation.
  - `collect.ts`, `store.ts`, `report.ts`.
  - `site.html` + `site.ts`: the dashboard. One HTML file; the ledger is embedded at build time.
- `test/`: Vitest. `classify.test.ts` is the spec for finding outcomes and `entries.test.ts` for
  entries. Change the spec before changing the rules.

## Rules

- This repo is public. Never commit ledger data, reports, the built site, or anything naming a
  private repo. Data lives in `~/.central-bank/data`; `reports/` and `site/` are gitignored.
- Classification is a pure function of a review thread. Keep GitHub calls in `github.ts` and
  `collect.ts`.
- When an outcome rule changes, update the table in README.md in the same commit. When the entry
  schema changes, update `plugins/central-bank/skills/record-to-ledger/SKILL.md` too; agents
  write entries from that file alone.
- Bump `plugins/central-bank/.claude-plugin/plugin.json`'s version when a skill changes, so
  installed copies update.
