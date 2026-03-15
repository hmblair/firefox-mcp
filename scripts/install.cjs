#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const bridgePath = path.resolve(__dirname, "..", "mcp-bridge.cjs");
const home = process.env.HOME || process.env.USERPROFILE;

const CLAUDE_CONFIG = path.join(home, ".mcp.json");
const OPENCODE_CONFIG = path.join(home, ".config", "opencode", "opencode.json");

const SERVER_NAME = "firefox-mcp";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

let rl;

function ask(question) {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

function installClaude() {
  const config = readJson(CLAUDE_CONFIG) || {};
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[SERVER_NAME] = {
    command: "node",
    args: [bridgePath],
  };
  writeJson(CLAUDE_CONFIG, config);
  console.log(`  Added ${SERVER_NAME} to ${CLAUDE_CONFIG}`);
}

function installOpencode() {
  const config = readJson(OPENCODE_CONFIG) || { $schema: "https://opencode.ai/config.json" };
  if (!config.mcp) config.mcp = {};
  config.mcp[SERVER_NAME] = {
    type: "local",
    command: ["node", bridgePath],
  };
  writeJson(OPENCODE_CONFIG, config);
  console.log(`  Added ${SERVER_NAME} to ${OPENCODE_CONFIG}`);
}

function uninstallClaude() {
  const config = readJson(CLAUDE_CONFIG);
  if (!config?.mcpServers?.[SERVER_NAME]) return;
  delete config.mcpServers[SERVER_NAME];
  writeJson(CLAUDE_CONFIG, config);
  console.log(`  Removed ${SERVER_NAME} from ${CLAUDE_CONFIG}`);
}

function uninstallOpencode() {
  const config = readJson(OPENCODE_CONFIG);
  if (!config?.mcp?.[SERVER_NAME]) return;
  delete config.mcp[SERVER_NAME];
  writeJson(OPENCODE_CONFIG, config);
  console.log(`  Removed ${SERVER_NAME} from ${OPENCODE_CONFIG}`);
}

async function install() {
  console.log();
  if (await ask("Install into Claude Code (~/.mcp.json)? [Y/n] ")) {
    installClaude();
  } else {
    console.log("  Skipped.");
  }
  console.log();
  if (await ask("Install into OpenCode (~/.config/opencode/opencode.json)? [Y/n] ")) {
    installOpencode();
  } else {
    console.log("  Skipped.");
  }
  console.log();
  rl.close();
}

function uninstall() {
  console.log();
  uninstallClaude();
  uninstallOpencode();
  console.log();
}

const command = process.argv[2];
if (command === "uninstall") {
  uninstall();
} else {
  install();
}
