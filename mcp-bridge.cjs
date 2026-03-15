#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const VERSION = require(path.join(__dirname, "package.json")).version;

const serverPath = path.join(__dirname, "server", "dist", "server", "server.js");
const child = spawn("node", [serverPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, MCP_VERSION: VERSION },
});
child.on("exit", (code) => process.exit(code ?? 1));
