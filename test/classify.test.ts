import { describe, expect, test } from "vitest";
import { classify, isFinding } from "../src/ledger/classify.ts";
import type { PrState, Thread, ThreadComment } from "../src/ledger/types.ts";

const BOT = "github-actions";
const bots = new Set([BOT]);

let nextId = 1;
function comment(author: string, body: string, createdAt = "2026-10-01T00:00:00Z"): ThreadComment {
  return { id: nextId++, author, body, createdAt, url: `https://github.com/o/r/pull/1#c${nextId}` };
}

const finding = (bot = "🧩 MVVM Bot") =>
  comment(
    BOT,
    `Use \`round.par\`.\n\n\`\`\`suggestion\nconst par = round.par;\n\`\`\`\n\n<!-- review-bot:{"id":"cc2942a1","path":"a.tsx","line":33,"bot":"${bot}"} -->`,
    "2026-10-01T00:00:00Z",
  );
const status = (s: "fixed" | "open", at: string) =>
  comment(BOT, `${s === "fixed" ? "✅" : "❌"}\n\n<!-- review-bot-status:{"id":"cc2942a1","status":"${s}","sha":"abc"} -->`, at);
const human = (body: string, at = "2026-10-02T00:00:00Z") => comment("TuckerBrewer12", body, at);

function thread(comments: ThreadComment[], state: Partial<Thread> = {}): Thread {
  return { isResolved: false, isOutdated: false, path: "a.tsx", line: 33, originalLine: 33, comments, ...state };
}

function run(t: Thread, prState: PrState = "MERGED", fixPrStates = new Map<number, PrState>()) {
  return classify(t, { prState, botLogins: bots, fixPrStates });
}

describe("classify", () => {
  test("reads the lens, id and suggestion from the bot's marker", () => {
    const f = run(thread([finding()]));
    expect(f).toMatchObject({ id: "cc2942a1", lens: "MVVM Bot", hasSuggestion: true, excerpt: "Use `round.par`." });
  });

  test("a /dismiss reply disregards it, even after a fix claim", () => {
    const f = run(thread([finding(), human("Fixed in abc1234"), human("/dismiss the kit owns this", "2026-10-03T00:00:00Z")]));
    expect(f).toMatchObject({ outcome: "disregarded", basis: "dismiss", confidence: "exact" });
  });

  test("the bot's ✅ recheck keeps it", () => {
    const f = run(thread([finding(), status("open", "2026-10-02T00:00:00Z"), status("fixed", "2026-10-03T00:00:00Z")]));
    expect(f).toMatchObject({ outcome: "kept", basis: "recheck", confidence: "exact" });
  });

  test("a merged fix PR keeps it", () => {
    const opened = comment(BOT, "Opened [#370](https://github.com/o/r/pull/370) with this change.");
    const f = run(thread([finding(), opened]), "MERGED", new Map([[370, "MERGED"]]));
    expect(f).toMatchObject({ outcome: "kept", basis: "fix-pr", fixPr: 370 });
  });

  test("a closed fix PR alone does not decide it", () => {
    const opened = comment(BOT, "Opened [#370](https://github.com/o/r/pull/370) with this change.");
    const f = run(thread([finding(), opened], { isOutdated: true }), "MERGED", new Map([[370, "CLOSED"]]));
    expect(f).toMatchObject({ outcome: "kept", basis: "outdated", fixPr: 370 });
  });

  test("still ❌ at merge with an answer is disregarded; with silence, unaddressed", () => {
    const answered = run(thread([finding(), status("open", "2026-10-02T00:00:00Z"), human("Leaving this: the chart needs it.", "2026-10-03T00:00:00Z")]));
    const silent = run(thread([finding(), status("open", "2026-10-02T00:00:00Z")]));
    expect(answered).toMatchObject({ outcome: "disregarded", basis: "reply", confidence: "exact" });
    expect(silent).toMatchObject({ outcome: "unaddressed", basis: "recheck", confidence: "exact" });
  });

  test("a fix claim after the last ❌ keeps it", () => {
    const f = run(thread([finding(), status("open", "2026-10-02T00:00:00Z"), human("Fixed in 9f8e7d6.", "2026-10-03T00:00:00Z")]));
    expect(f).toMatchObject({ outcome: "kept", basis: "reply", confidence: "heuristic" });
  });

  test("without a recheck: outdated lines are kept, a resolved thread is disregarded", () => {
    expect(run(thread([finding()], { isOutdated: true }))).toMatchObject({ outcome: "kept", basis: "outdated" });
    expect(run(thread([finding()], { isResolved: true }))).toMatchObject({ outcome: "disregarded", basis: "resolved" });
  });

  test("on an open PR an untouched finding is open; once merged, unaddressed", () => {
    expect(run(thread([finding()]), "OPEN")).toMatchObject({ outcome: "open" });
    expect(run(thread([finding()]), "MERGED")).toMatchObject({ outcome: "unaddressed", basis: "none" });
  });

  test("/fix is a request, not an answer", () => {
    const f = run(thread([finding(), human("/fix")]));
    expect(f).toMatchObject({ outcome: "unaddressed" });
  });

  test("falls back to the Discuss link's reviewer when there is no marker", () => {
    const old = comment(BOT, "Hardcoded hex.\n\n[Discuss in Conductor](conductor://prompt=x%0AReviewer%3A%20%F0%9F%8E%A8%20Brand%20Kit%20Bot%0AFinding)");
    expect(run(thread([old])).lens).toBe("Brand Kit Bot");
  });

  test("only threads a bot opened are findings", () => {
    expect(isFinding(thread([finding()]), bots)).toBe(true);
    expect(isFinding(thread([human("nit")]), bots)).toBe(false);
  });
});
