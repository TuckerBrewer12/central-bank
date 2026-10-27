import { execFileSync } from "node:child_process";
import type { PrState, Thread } from "./types.ts";

export interface RawPr {
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  body: string;
  author: string;
  commitCount: number;
  commitMessages: string[];
  checks: string | null;
  threads: Thread[];
}

export function resolveToken(): string {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No GitHub token: set GITHUB_TOKEN or sign in with `gh auth login`.");
  }
}

export class GitHub {
  constructor(
    private readonly token: string,
    private readonly endpoint = "https://api.github.com/graphql",
  ) {}

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { authorization: `bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      // GitHub answers 502/504 on heavy queries now and then; they pass on retry.
      if ((res.status === 502 || res.status === 504) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (!res.ok || json.errors?.length || !json.data) {
        const detail = json.errors?.map((e) => e.message).join("; ") ?? res.statusText;
        throw new Error(`GitHub GraphQL ${res.status}: ${detail}`);
      }
      return json.data;
    }
  }
}

const PR_FIELDS = `
  number title url state isDraft createdAt updatedAt mergedAt closedAt
  baseRefName headRefName additions deletions body author { login }
  commits(first: 100) { totalCount nodes { commit { message } } }
  latest: commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  reviewThreads(first: 100) {
    nodes {
      isResolved isOutdated path line originalLine
      comments(first: 50) { nodes { databaseId author { login } createdAt body url } }
    }
  }`;

const LIST_QUERY = `
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 20, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PR_FIELDS} }
      }
    }
  }`;

interface GqlPr {
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  body: string;
  author: { login: string } | null;
  commits: { totalCount: number; nodes: Array<{ commit: { message: string } }> };
  latest: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
  reviewThreads: {
    nodes: Array<{
      isResolved: boolean;
      isOutdated: boolean;
      path: string;
      line: number | null;
      originalLine: number | null;
      comments: {
        nodes: Array<{
          databaseId: number;
          author: { login: string } | null;
          createdAt: string;
          body: string;
          url: string;
        }>;
      };
    }>;
  };
}

function toRaw(pr: GqlPr): RawPr {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    additions: pr.additions,
    deletions: pr.deletions,
    body: pr.body,
    author: pr.author?.login ?? "ghost",
    commitCount: pr.commits.totalCount,
    commitMessages: pr.commits.nodes.map((n) => n.commit.message),
    checks: pr.latest.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    threads: pr.reviewThreads.nodes.map((t) => ({
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      path: t.path,
      line: t.line,
      originalLine: t.originalLine,
      comments: t.comments.nodes.map((c) => ({
        id: c.databaseId,
        author: c.author?.login ?? "ghost",
        createdAt: c.createdAt,
        body: c.body,
        url: c.url,
      })),
    })),
  };
}

/** PRs updated at or after `since`, newest first. */
export async function* listPrs(gh: GitHub, repo: string, since: string | null): AsyncGenerator<RawPr> {
  const [owner, name] = repo.split("/");
  let cursor: string | null = null;
  for (;;) {
    const data: {
      repository: {
        pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlPr[] };
      };
    } = await gh.graphql(LIST_QUERY, { owner, name, cursor });
    const page = data.repository.pullRequests;
    for (const pr of page.nodes) {
      if (since !== null && pr.updatedAt < since) return;
      yield toRaw(pr);
    }
    if (!page.pageInfo.hasNextPage) return;
    cursor = page.pageInfo.endCursor;
  }
}

/** State of each numbered PR, fetched in one aliased query. */
export async function prStates(gh: GitHub, repo: string, numbers: number[]): Promise<Map<number, PrState>> {
  const states = new Map<number, PrState>();
  if (numbers.length === 0) return states;
  const [owner, name] = repo.split("/");
  const fields = numbers.map((n) => `pr${n}: pullRequest(number: ${n}) { number state }`).join("\n");
  const data = await gh.graphql<{ repository: Record<string, { number: number; state: PrState } | null> }>(
    `query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
    { owner, name },
  );
  for (const pr of Object.values(data.repository)) if (pr) states.set(pr.number, pr.state);
  return states;
}
