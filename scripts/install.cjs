#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const nativeHostPath = path.resolve(__dirname, "..", "server", "dist", "native-host.js");
const home = process.env.HOME || process.env.USERPROFILE;

const OPENCODE_CONFIG = path.join(home, ".config", "opencode", "opencode.json");
const NATIVE_HOST_DIR = process.platform === "darwin"
  ? path.join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts")
  : path.join(home, ".mozilla", "native-messaging-hosts");
const NATIVE_HOST_MANIFEST = path.join(NATIVE_HOST_DIR, "firefox_mcp.json");

const SERVER_NAME = "firefox-mcp";
const HTTP_PORT = 8581;
const MCP_URL = `http://localhost:${HTTP_PORT}/mcp`;

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

function installNativeHost() {
  // Write a wrapper script that node can execute
  const wrapperPath = path.resolve(__dirname, "..", "server", "dist", "native-host-wrapper.sh");
  const wrapperContent = `#!/bin/sh\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nexec node "${nativeHostPath}"\n`;
  fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });

  const manifest = {
    name: "firefox_mcp",
    description: "Firefox MCP native messaging host",
    path: wrapperPath,
    type: "stdio",
    allowed_extensions: ["firefox-mcp@hmblair.dev"],
  };
  writeJson(NATIVE_HOST_MANIFEST, manifest);
  console.log(`  Installed native messaging host manifest to ${NATIVE_HOST_MANIFEST}`);
}

function installClaude() {
  const { execFileSync } = require("child_process");
  try {
    execFileSync("claude", ["mcp", "add", "--transport", "http", "--scope", "user", SERVER_NAME, MCP_URL], { stdio: "inherit" });
  } catch {
    console.log(`  Failed to add ${SERVER_NAME} via claude CLI — add manually with:`);
    console.log(`    claude mcp add --transport http --scope user ${SERVER_NAME} ${MCP_URL}`);
  }
}

function installOpencode() {
  const config = readJson(OPENCODE_CONFIG) || { $schema: "https://opencode.ai/config.json" };
  if (!config.mcp) config.mcp = {};
  config.mcp[SERVER_NAME] = {
    type: "http",
    url: MCP_URL,
  };
  writeJson(OPENCODE_CONFIG, config);
  console.log(`  Added ${SERVER_NAME} to ${OPENCODE_CONFIG}`);
}

function uninstallNativeHost() {
  try {
    fs.unlinkSync(NATIVE_HOST_MANIFEST);
    console.log(`  Removed ${NATIVE_HOST_MANIFEST}`);
  } catch {
    // file doesn't exist
  }
}

function uninstallClaude() {
  const { execFileSync } = require("child_process");
  try {
    execFileSync("claude", ["mcp", "remove", "--scope", "user", SERVER_NAME], { stdio: "inherit" });
  } catch {
    // May not be installed
  }
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

  // Always install native messaging host
  installNativeHost();

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
  uninstallNativeHost();
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
