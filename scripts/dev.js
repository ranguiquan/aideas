#!/usr/bin/env node
// Local dev server that mimics the Vercel setup without the Vercel CLI:
//   - serves public/ with clean URLs (/method → method.html)
//   - runs api/<name>.js as serverless-style handlers (req.body parsed, res.status().json())
//   - loads .env.local / .env
// API modules are re-required on every request, so edits take effect without a restart.
//
//   npm run dev            → http://localhost:3000
//   PORT=4000 npm run dev
//
// Without AUTH_* / NOTION_TOKEN the API refuses (503) and the page falls back to
// public/data/snapshot.json if you created one with `npm run snapshot`.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./env");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const API = path.join(ROOT, "api");
const PORT = Number(process.env.PORT) || 3000;

loadEnv(ROOT);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function freshRequire(file) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(API)) delete require.cache[k];
  return require(file);
}

async function handleApi(req, res, name) {
  const file = path.join(API, name + ".js");
  // only real endpoints: no path tricks, no "_" helper modules
  if (!/^[a-z0-9-]+$/i.test(name) || name.startsWith("_") || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "not found" }));
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  req.body = raw;
  if ((req.headers["content-type"] || "").includes("application/json") && raw) {
    try { req.body = JSON.parse(raw); } catch (e) { /* leave as string */ }
  }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  try {
    await freshRequire(file)(req, res);
  } catch (err) {
    console.error(`[api/${name}]`, err);
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
  }
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("forbidden"); }
  if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";   // cleanUrls
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const started = Date.now();
  res.on("finish", () => console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`));
  const m = pathname.match(/^\/api\/([^/]+)\/?$/);
  if (m) return handleApi(req, res, m[1]);
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  const has = (k) => (process.env[k] ? "✓" : "✗");
  console.log(`Aideas dev server → http://localhost:${PORT}`);
  console.log(`  NOTION_TOKEN ${has("NOTION_TOKEN")}  AUTH_PASSWORD ${has("AUTH_PASSWORD")}  AUTH_SECRET ${has("AUTH_SECRET")}` +
    (fs.existsSync(path.join(PUBLIC, "data/snapshot.json")) ? "  · snapshot.json present" : ""));
  console.log("  Log in with AUTH_PASSWORD. Use Chrome/Edge/Firefox: the session cookie is Secure, which they allow on localhost.");
});
