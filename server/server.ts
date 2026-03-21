import { createServer } from "./create-server";

const { start } = createServer();

start().catch((err) => {
  console.error("MCP Server connection error", err);
  process.exit(1);
});
