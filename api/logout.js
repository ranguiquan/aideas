// POST /api/logout  → clears the session cookie
const auth = require("./_auth");

module.exports = async (req, res) => {
  auth.noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  res.setHeader("Set-Cookie", auth.clearCookie());
  res.status(200).json({ ok: true });
};
