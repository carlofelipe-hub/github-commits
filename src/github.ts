const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionDay {
  date: string;
  count: number;
  level: ContributionLevel;
}

export interface RepoContribution {
  repo: string;
  url: string;
  commits: number;
}

export interface Contributions {
  total: number;
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  totalReviews: number;
  calendar: ContributionDay[];
  byRepository: RepoContribution[];
}

const QUERY = /* GraphQL */ `
  query ($login: String!, $from: DateTime, $to: DateTime) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            nameWithOwner
            url
          }
          contributions {
            totalCount
          }
        }
      }
    }
  }
`;

const LEVEL_MAP: Record<string, ContributionLevel> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

interface UpstreamResponse {
  data?: {
    user: {
      contributionsCollection: {
        totalCommitContributions: number;
        totalPullRequestContributions: number;
        totalIssueContributions: number;
        totalPullRequestReviewContributions: number;
        contributionCalendar: {
          totalContributions: number;
          weeks: {
            contributionDays: {
              date: string;
              contributionCount: number;
              contributionLevel: string;
            }[];
          }[];
        };
        commitContributionsByRepository: {
          repository: { nameWithOwner: string; url: string };
          contributions: { totalCount: number };
        }[];
      };
    } | null;
  };
  errors?: { message: string }[];
}

export async function fetchContributions(
  username: string,
  from: string | undefined,
  to: string | undefined,
): Promise<Contributions> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("Server is missing GITHUB_TOKEN.");
  }

  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-commits-api",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: username, from, to } }),
  });

  if (res.status === 401) {
    throw new Error("GitHub rejected the server token (401). Check GITHUB_TOKEN.");
  }
  if (!res.ok) {
    throw new Error(`GitHub API request failed with status ${res.status}.`);
  }

  const body = (await res.json()) as UpstreamResponse;

  if (body.errors?.length) {
    const message = body.errors[0].message;
    if (body.data?.user === null || /Could not resolve to a User/.test(message)) {
      throw new Error(`GitHub user "${username}" not found.`);
    }
    throw new Error(`GitHub API error: ${message}`);
  }

  const collection = body.data?.user?.contributionsCollection;
  if (!collection) {
    throw new Error(`GitHub user "${username}" not found.`);
  }

  return {
    total: collection.contributionCalendar.totalContributions,
    totalCommits: collection.totalCommitContributions,
    totalPRs: collection.totalPullRequestContributions,
    totalIssues: collection.totalIssueContributions,
    totalReviews: collection.totalPullRequestReviewContributions,
    calendar: collection.contributionCalendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: LEVEL_MAP[day.contributionLevel] ?? 0,
      })),
    ),
    byRepository: collection.commitContributionsByRepository.map((entry) => ({
      repo: entry.repository.nameWithOwner,
      url: entry.repository.url,
      commits: entry.contributions.totalCount,
    })),
  };
}
