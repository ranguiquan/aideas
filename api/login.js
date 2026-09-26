// POST /api/login  { "password": "..." }  → sets the session cookie
const auth = require("./_auth");

const FAIL_DELAY_MS = 1000; // slows down password guessing

module.exports = async (req, res) => {
  auth.noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const cfg = auth.config();
  if (!cfg.ok) {
    res.status(503).json({ error: cfg.error, auth: "unconfigured" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const password = body && body.password;
  if (!auth.checkPassword(cfg, password)) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    res.status(401).json({ error: "wrong password" });
    return;
  }
  res.setHeader("Set-Cookie", auth.issueCookie(cfg));
  res.status(200).json({ ok: true });
};
