#!/usr/bin/env bash
# Copy pstack's Claude Code build from cursor/plugins into plugins/pstack, pinned to a commit.
#
#   scripts/sync-pstack.sh            # update to the latest upstream commit
#   scripts/sync-pstack.sh <sha>      # pin a specific commit
#   scripts/sync-pstack.sh --check    # fail if plugins/pstack differs from the pinned commit
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/vendor.json"
UPSTREAM="https://github.com/cursor/plugins"
SUBDIR="harness/pstack/claude-code"
DEST="$ROOT/plugins/pstack"

mode="sync"
ref="main"
if [[ "${1:-}" == "--check" ]]; then
  mode="check"
  ref="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pstack"]["sha"])' "$LOCK")"
elif [[ -n "${1:-}" ]]; then
  ref="$1"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q
git -C "$work" remote add origin "$UPSTREAM"
git -C "$work" fetch -q --depth 1 origin "$ref"
git -C "$work" checkout -q FETCH_HEAD
sha="$(git -C "$work" rev-parse HEAD)"

if [[ "$mode" == "check" ]]; then
  if diff -r -q "$work/$SUBDIR" "$DEST" >/dev/null; then
    echo "plugins/pstack matches cursor/plugins@$sha"
    exit 0
  fi
  echo "plugins/pstack differs from cursor/plugins@$sha. Run scripts/sync-pstack.sh $sha, or keep local edits out of plugins/pstack." >&2
  diff -r -q "$work/$SUBDIR" "$DEST" >&2 || true
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$work/$SUBDIR/." "$DEST/"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$DEST/.claude-plugin/plugin.json")"
python3 - "$LOCK" "$sha" "$version" <<'PY'
import json, sys, datetime, pathlib
lock_path, sha, version = sys.argv[1:]
path = pathlib.Path(lock_path)
lock = json.loads(path.read_text()) if path.exists() else {}
lock["pstack"] = {
    "upstream": "https://github.com/cursor/plugins",
    "path": "harness/pstack/claude-code",
    "sha": sha,
    "version": version,
    "syncedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
}
path.write_text(json.dumps(lock, indent=2) + "\n")
PY
echo "plugins/pstack is now cursor/plugins@$sha (pstack $version)"
