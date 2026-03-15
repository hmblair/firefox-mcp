#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const serverPath = path.join(__dirname, "server", "dist", "server", "server.js");
const child = spawn("node", [serverPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
