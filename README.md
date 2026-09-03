# github-commits

A small GraphQL backend that proxies GitHub's contribution data for portfolio widgets — contribution heatmap, totals, and per-repo commit counts. One upstream query per request, with in-memory caching.

## Quick start

```bash
cp .env.example .env   # add a classic GitHub PAT (read-only scopes)
npm install
npm run dev            # http://localhost:4000/graphql (GraphiQL playground enabled)
```

Note: fine-grained PATs don't work with GitHub's GraphQL API — use a **classic** token with `read:user` and `public_repo` scopes.

## Using the API

The API is a single GraphQL endpoint: `POST /graphql`. Send the query as JSON in the request body; the response is JSON.

### curl

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ contributions(username: \"octocat\") { total calendar { date count level } } }"}'
```

### JavaScript / TypeScript

```ts
const res = await fetch("http://localhost:4000/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `{
      contributions(username: "octocat") {
        total
        calendar { date count level }
        byRepository { repo url commits }
      }
    }`,
  }),
});

const { data, errors } = await res.json();
```

## Schema

```graphql
type Query {
  contributions(username: String!, from: String, to: String): Contributions!
}
```

`from` / `to` are optional ISO-8601 datetimes and default to the trailing year. GitHub caps contribution ranges at **1 year per query** — for a specific past year, pass explicit bounds (e.g. `from: "2024-01-01T00:00:00Z"`, `to: "2024-12-31T23:59:59Z"`).

### `Contributions`

| Field          | Type                  | Description                                        |
| -------------- | --------------------- | -------------------------------------------------- |
| `total`        | `Int!`                | All contributions in range (GitHub's headline number) |
| `totalCommits` | `Int!`                | Commits only                                       |
| `totalPRs`     | `Int!`                | Pull requests opened                               |
| `totalIssues`  | `Int!`                | Issues opened                                      |
| `totalReviews` | `Int!`                | Pull request reviews                               |
| `calendar`     | `[ContributionDay!]!` | Day-by-day heatmap data                            |
| `byRepository` | `[RepoContribution!]!`| Commit counts per repository (max 100)             |

### `ContributionDay`

| Field   | Type      | Description                                      |
| ------- | --------- | ------------------------------------------------ |
| `date`  | `String!` | `YYYY-MM-DD`                                     |
| `count` | `Int!`    | Contributions that day                           |
| `level` | `Int!`    | Intensity `0`–`4` (GitHub's "Less → More" scale) |

### `RepoContribution`

| Field     | Type      | Description                |
| --------- | --------- | -------------------------- |
| `repo`    | `String!` | `owner/name`               |
| `url`     | `String!` | Link to the repository     |
| `commits` | `Int!`    | Commits by the user in range |

### Example response

```json
{
  "data": {
    "contributions": {
      "total": 1517,
      "calendar": [
        { "date": "2025-09-01", "count": 3, "level": 2 },
        { "date": "2025-09-02", "count": 0, "level": 0 }
      ],
      "byRepository": [
        { "repo": "octocat/hello-world", "url": "https://github.com/octocat/hello-world", "commits": 42 }
      ]
    }
  }
}
```

## Rendering a heatmap

- Days arrive in chronological order, grouped by week. Chunk `calendar` into groups of 7 — each chunk is one vertical column (Sunday at the top).
- Use `level` (0–4) for the cell color, e.g. `["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]`.
- Use `count` for tooltips, and `total` for the "N contributions" headline.

## Errors

Errors come back in the standard GraphQL `errors` array with HTTP 200:

```json
{ "errors": [{ "message": "GitHub user \"nope\" not found." }], "data": null }
```

Possible messages: unknown username, missing/rejected server token, GitHub rate limit or other upstream failure.

## Caching

Responses are cached in memory per `username:from:to` for `CACHE_TTL_SECONDS` (default 1 hour) to stay well under GitHub's rate limit. The cache resets on restart.

## Deploy on Coolify

1. Push this repo to your git remote.
2. Coolify → New Resource → select the repo → build pack: **Dockerfile**.
3. Set `GITHUB_TOKEN` (and optionally `PORT`, `CACHE_TTL_SECONDS`) in the Environment Variables tab.
4. Deploy. `GET /health` is available for Coolify health checks.

## Environment variables

| Variable            | Required | Default | Description                     |
| ------------------- | -------- | ------- | ------------------------------- |
| `GITHUB_TOKEN`      | yes      | —       | Classic GitHub PAT (read-only)  |
| `PORT`              | no       | `4000`  | HTTP port                       |
| `CACHE_TTL_SECONDS` | no       | `3600`  | In-memory cache TTL per query   |
