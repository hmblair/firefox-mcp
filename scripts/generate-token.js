const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const secret = crypto.randomBytes(32).toString("hex");

const config = {
  secret,
};

const copyLocations = ["../extension/dist", "../server/dist"];

const jsonStr = JSON.stringify(config, null, 2);
for (const loc of copyLocations) {
  const dir = path.resolve(__dirname, loc);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), jsonStr);
}
