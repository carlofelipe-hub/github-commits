import { createSchema } from "graphql-yoga";
import { TtlCache } from "./cache.js";
import { fetchContributions, type Contributions } from "./github.js";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
const cache = new TtlCache<Contributions>(cacheTtlSeconds * 1000);

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      contributions(username: String!, from: String, to: String): Contributions!
    }

    type Contributions {
      total: Int!
      totalCommits: Int!
      totalPRs: Int!
      totalIssues: Int!
      totalReviews: Int!
      calendar: [ContributionDay!]!
      byRepository: [RepoContribution!]!
    }

    type ContributionDay {
      date: String!
      count: Int!
      level: Int!
    }

    type RepoContribution {
      repo: String!
      url: String!
      commits: Int!
    }
  `,
  resolvers: {
    Query: {
      contributions: async (_parent, args: { username: string; from?: string; to?: string }) => {
        const to = args.to ?? new Date().toISOString();
        const from = args.from ?? new Date(Date.parse(to) - ONE_YEAR_MS).toISOString();
        const key = `${args.username}:${from}:${to}`;

        const cached = cache.get(key);
        if (cached) return cached;

        const contributions = await fetchContributions(args.username, from, to);
        cache.set(key, contributions);
        return contributions;
      },
    },
  },
});
