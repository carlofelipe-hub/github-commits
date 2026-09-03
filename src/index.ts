import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { schema } from "./schema.js";

// Load .env for local development. In Docker/Coolify env vars are set directly,
// so a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

const port = Number(process.env.PORT ?? 4000);

if (!process.env.GITHUB_TOKEN) {
  console.error("GITHUB_TOKEN is not set. The server will start, but all queries will fail.");
}

const yoga = createYoga({
  schema,
  graphiql: true,
  healthCheckEndpoint: "/health",
  // Errors thrown by resolvers are deliberate, client-safe messages.
  maskedErrors: false,
});

const server = createServer(yoga);

server.listen(port, () => {
  console.log(`GraphQL API ready at http://localhost:${port}/graphql`);
});
