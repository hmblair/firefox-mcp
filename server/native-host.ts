import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createServer } from "./create-server";

const logFile = path.join(os.tmpdir(), "firefox-mcp.log");

function log(msg: string) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
}

process.on("uncaughtException", (err: Error) => {
  log(`UNCAUGHT: ${err.stack || err.message}`);
  process.exit(1);
});

const { start } = createServer();

start().catch((err) => {
  log(`start failed: ${err.stack || err.message}`);
  process.exit(1);
});
