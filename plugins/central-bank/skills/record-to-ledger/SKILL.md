---
name: record-to-ledger
description: Write a summary of finished work to the central-bank ledger. Use when a loop or overnight run finishes, when an experiment, investigation, migration or incident wraps up, when a notable decision is made, or when the user asks to log, record or note something in the ledger.
---

# Record to the ledger

The ledger is where Tucker tracks how work across all his projects went over time. PRs and
review-bot findings are collected automatically; everything else is an **entry** an agent writes
when the work finishes. Write one entry per finished piece of work, at the end, not as you go.

## Write the entry

Save JSON to a temporary file outside the repo (for example `$TMPDIR/ledger-entry.json`):

```json
{
  "repo": "TuckerBrewer12/BirdieEyeView",
  "kind": "loop-run",
  "title": "Overnight scan-accuracy loop",
  "outcome": "improved",
  "summary": "41 attempts, 5 kept. Held-out cell accuracy 88.9% → 92.4%. The gains came from splitting merged to-par rows; prompt changes to the Gemini merge did nothing and were reverted. Next: label 20 more failed scans, because three of the five kept changes target one card layout.",
  "metrics": { "program": "scan-accuracy", "metric": "cell_accuracy", "iterations": 41, "kept": 5,
               "dev_before": 0.901, "dev_after": 0.947, "heldout_before": 0.889, "heldout_after": 0.924,
               "cost_usd": 2.1, "hours": 7.5 },
  "links": [{ "label": "PR #412", "url": "https://github.com/TuckerBrewer12/BirdieEyeView/pull/412" }],
  "author": "claude",
  "tags": ["scanner"]
}
```

Then record it:

```bash
npx --yes github:TuckerBrewer12/central-bank ledger record --file "$TMPDIR/ledger-entry.json"
```

The command checks the entry and lists every problem at once if something is wrong. Fix them and
run it again. Recording the same `id` again replaces the entry, so a correction doesn't duplicate.

## Fields

| Field | Required | What goes in it |
| --- | --- | --- |
| `repo` | yes | `owner/name` of the repo the work was in (`git remote get-url origin`) |
| `kind` | yes | `loop-run`, `decision`, `investigation`, `incident`, `release`, `note`, or another short kebab-case word |
| `title` | yes | What the work was, in a few words |
| `summary` | yes | How it went. See below |
| `outcome` | no | `improved`, `no-change`, `regressed`, `failed`, or `info` (default) |
| `at` | no | When it finished, ISO 8601. Defaults to now |
| `metrics` | no | Numbers or short strings worth comparing across runs |
| `links` | no | `[{ "label", "url" }]`: the PR, the run log, the issue |
| `author` | no | Who did the work: `claude`, `codex`, `cursor`, `human`, `bot` |
| `tags` | no | Short words to group entries |

For a `loop-run`, use these metric keys so runs line up in the dashboard: `program`, `metric`,
`iterations`, `kept`, `dev_before`, `dev_after`, `heldout_before`, `heldout_after`, `cost_usd`,
`hours`.

## The summary

Tucker reads these weeks later to decide what works. Write it for that reader:

- Lead with the result, in numbers: what moved, by how much, against what baseline.
- Say what was tried that did not work. That is as useful as what did.
- Name anything that makes the result less trustworthy, such as a small dataset or a noisy metric.
- End with the next step you would take.
- A few sentences, no headings, no marketing. Report a failed or flat run plainly with
  `outcome: "failed"` or `"no-change"`.

## Where it goes

Entries are written under `$CENTRAL_BANK_DATA` (default `~/.central-bank/data`), next to the PR
data. `central-bank ledger site` and `ledger report` show them in the timeline and, for loop runs,
in the loop runs table. Do not commit entries to the project repo.
