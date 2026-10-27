# central-bank

A software factory for all of Tucker's projects. It holds the skills and workflows every repo
uses, and a ledger that records how every project, bot and agent loop is going.

## Use the skills from any repo

central-bank is a Claude Code plugin marketplace with two plugins:

| Plugin | What it gives you |
| --- | --- |
| `central-bank` | `/central-bank:record-to-ledger`, plus the factory's own workflows as they land |
| `pstack` | poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack): `/pstack:poteto-mode`, `interrogate`, `architect`, `blast-radius`, `correct`, `tdd` and the rest |

Install once for your user, and every repo on the machine has them, including sessions Conductor
starts:

```bash
claude plugin marketplace add TuckerBrewer12/central-bank
claude plugin install central-bank@central-bank
claude plugin install pstack@central-bank
```

To have a repo offer them to anyone who opens it, add this to the repo's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "central-bank": { "source": { "source": "github", "repo": "TuckerBrewer12/central-bank" } }
  },
  "enabledPlugins": { "central-bank@central-bank": true, "pstack@central-bank": true }
}
```

`claude plugin update pstack@central-bank` picks up a new pin after it lands here.

### pstack is pinned

`plugins/pstack` is an unmodified copy of `harness/pstack/claude-code` from
[cursor/plugins](https://github.com/cursor/plugins) at the commit in `vendor.json` (MIT, © Lauren
Tan; its LICENSE is kept). Update it with `scripts/sync-pstack.sh`, which pins the latest commit,
or `scripts/sync-pstack.sh <sha>`. CI fails if the copy drifts from the pin, so changes to pstack
belong upstream or in our own plugin.

## Ledger

The ledger records, for every project:

- **PRs**: who wrote each one (a person, Claude, Codex, Cursor or a bot), how it ended, and what
  happened to each review-bot finding on it. Collected from GitHub.
- **Entries**: short written summaries of work that isn't a PR, such as a loop run, a decision, an
  investigation or an incident. An agent writes one when the work finishes, using the
  `record-to-ledger` skill.

```bash
npm install
npm run ledger -- collect --repo TuckerBrewer12/BirdieEyeView   # all history
npm run ledger -- collect --repo TuckerBrewer12/BirdieEyeView --since 2026-10-01
npm run ledger -- record --file entry.json                      # add an entry
npm run ledger -- report                                        # reports/README.md + one page per project
npm run ledger -- site && open site/index.html                  # the dashboard
```

From another repo, without a checkout: `npx --yes github:TuckerBrewer12/central-bank ledger …`.

Data lives in `$CENTRAL_BANK_DATA`, default `~/.central-bank/data`, one place per machine so every
repo's agents write to the same ledger. It covers private repos too, so it never goes in this
public repo; `reports/` and `site/` are gitignored for the same reason. The GitHub token comes from
`GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`.

### Finding outcomes

Every review thread a bot opens is a finding. Its outcome comes from the first signal that
applies:

| Signal | Outcome | Confidence |
| --- | --- | --- |
| A `/dismiss` reply | disregarded | exact |
| The bot's ✅ recheck | kept | exact |
| The bot's fix PR was merged | kept | exact |
| A "Fixed in `<sha>`" reply after the last ❌ | kept | heuristic |
| Still ❌ when the PR closed, with a reply / with no reply | disregarded / unaddressed | exact |
| No recheck, and the flagged lines changed afterwards | kept | heuristic |
| No recheck, thread resolved without the lines changing | disregarded | heuristic |
| Nothing, PR still open / closed | open / unaddressed | heuristic |

A closed fix PR is not a rejection. The fix often lands as a direct commit instead, and that
counts as kept.
