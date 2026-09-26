// Single-user auth: one password (AUTH_PASSWORD) and an HMAC-signed session cookie (AUTH_SECRET).
// Files starting with "_" in api/ are not exposed as endpoints by Vercel.
//
// Env vars:
//   AUTH_PASSWORD  the password you log in with (at least 12 characters)
//   AUTH_SECRET    random signing key, e.g. `openssl rand -base64 32` (at least 32 characters)
//
// Changing either value invalidates every existing session.

const crypto = require("crypto");

const COOKIE = "__Host-aideas_session";
const MAX_AGE = 30 * 24 * 3600; // seconds

function config() {
  const password = process.env.AUTH_PASSWORD || "";
  const secret = process.env.AUTH_SECRET || "";
  if (password.length < 12) return { ok: false, error: "AUTH_PASSWORD is not configured or shorter than 12 characters" };
  if (secret.length < 32) return { ok: false, error: "AUTH_SECRET is not configured or shorter than 32 characters" };
  // derive the signing key from both, so rotating the password also logs everyone out
  const key = crypto.createHash("sha256").update(secret + "\0" + password).digest();
  return { ok: true, password, key };
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (key, data) => crypto.createHmac("sha256", key).update(data).digest("base64url");

function safeEqual(a, b) {
  // compare fixed-length digests so timing does not leak length or content
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkPassword(cfg, input) {
  return typeof input === "string" && safeEqual(input, cfg.password);
}

function issueCookie(cfg) {
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const value = payload + "." + sign(cfg.key, payload);
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(req) {
  const header = (req.headers && req.headers.cookie) || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return null;
}

function isAuthenticated(req, cfg) {
  const value = readCookie(req);
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(cfg.key, payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch (e) {
    return false;
  }
}

function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store");
}

module.exports = { config, checkPassword, issueCookie, clearCookie, isAuthenticated, noStore };
