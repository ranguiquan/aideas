#!/usr/bin/env node
// Pull both Notion databases into public/data/snapshot.json for offline preview.
// The file holds your private records and is gitignored — never commit it.
//
//   npm run snapshot        (needs NOTION_TOKEN in .env.local or the shell)

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./env");

const ROOT = path.join(__dirname, "..");
loadEnv(ROOT);                                  // before requiring api/data.js, which reads NOTION_*_DS at load
const { loadAll } = require("../api/data");

(async () => {
  const token = (process.env.NOTION_TOKEN || "").trim();
  if (!token) {
    console.error("NOTION_TOKEN is missing. Put it in .env.local (see .env.example).");
    process.exit(1);
  }
  try {
    const { records, plans } = await loadAll(token);
    const out = path.join(ROOT, "public/data/snapshot.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ source: "snapshot", generatedAt: new Date().toISOString(), records, plans }, null, 1));
    console.log(`Wrote ${path.relative(ROOT, out)}: ${records.length} records, ${plans.length} plan items. (gitignored — do not commit)`);
  } catch (err) {
    console.error(`Notion error${err.notionCode ? " (" + err.notionCode + ")" : ""}: ${err.message}`);
    if (err.notionCode === "object_not_found") console.error("→ Share both databases with your integration: ··· → Connections.");
    if (err.notionCode === "unauthorized") console.error("→ The token is invalid; copy the integration secret again.");
    process.exit(1);
  }
})();
