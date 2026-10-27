import type { Writer } from "./types.ts";

export interface AttributionInput {
  author: string;
  head: string;
  body: string;
  commitMessages: string[];
}

const BOT_AUTHORS = /(\[bot\]$|^github-actions$|^dependabot$|^renovate$)/;

const SIGNALS: Array<[Writer, (i: AttributionInput, text: string) => boolean]> = [
  ["bot", (i) => i.head.startsWith("bot-fix/") || BOT_AUTHORS.test(i.author)],
  ["claude", (_, t) => /Generated with \[Claude Code\]|Co-Authored-By: Claude/i.test(t)],
  ["codex", (i, t) => i.head.startsWith("codex/") || /Co-Authored-By: Codex|chatgpt-codex/i.test(t)],
  ["cursor", (i, t) => i.head.startsWith("cursor/") || /Co-Authored-By: Cursor|cursoragent/i.test(t)],
];

/** Every writer with a signal on the PR; `human` only when no agent left one. */
export function writtenBy(input: AttributionInput): Writer[] {
  const text = [input.body, ...input.commitMessages].join("\n");
  const writers = SIGNALS.filter(([, test]) => test(input, text)).map(([writer]) => writer);
  return writers.length > 0 ? writers : ["human"];
}
