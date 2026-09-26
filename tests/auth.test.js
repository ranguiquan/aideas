const test = require("node:test");
const assert = require("node:assert/strict");
const { freshApi, mockRes, mockReq, setAuthEnv, loginCookie, PASSWORD } = require("./helpers");

test.beforeEach(() => {
  setAuthEnv();
  process.env.NOTION_TOKEN = "ntn_test";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ has_more: false, results: [] }) });
});

test("data API fails closed when auth is not configured", async () => {
  delete process.env.AUTH_PASSWORD;
  const res = mockRes();
  await freshApi("data")(mockReq(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.auth, "unconfigured");
  assert.equal(res.headers["cache-control"], "private, no-store");
});

test("a password shorter than 12 characters is rejected as configuration", async () => {
  process.env.AUTH_PASSWORD = "short";
  const res = mockRes();
  await freshApi("login")(mockReq({ method: "POST", body: { password: "short" } }), res);
  assert.equal(res.statusCode, 503);
});

test("data API requires a session", async () => {
  const res = mockRes();
  await freshApi("data")(mockReq(), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.auth, "required");
});

test("wrong password: 401 after a delay, no cookie", async () => {
  const res = mockRes();
  const t0 = Date.now();
  await freshApi("login")(mockReq({ method: "POST", body: { password: "nope" } }), res);
  assert.equal(res.statusCode, 401);
  assert.ok(Date.now() - t0 >= 900, "failed logins are slowed down");
  assert.equal(res.headers["set-cookie"], undefined);
});

test("login only accepts POST", async () => {
  const res = mockRes();
  await freshApi("login")(mockReq({ method: "GET" }), res);
  assert.equal(res.statusCode, 405);
});

test("right password sets a hardened session cookie that unlocks the data API", async () => {
  const res = mockRes();
  await freshApi("login")(mockReq({ method: "POST", body: JSON.stringify({ password: PASSWORD }) }), res);
  assert.equal(res.statusCode, 200);
  const cookie = res.headers["set-cookie"];
  for (const attr of ["__Host-", "HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(cookie.includes(attr), attr);

  const data = mockRes();
  await freshApi("data")(mockReq({ cookie: "other=1; " + cookie.split(";")[0] }), data);
  assert.equal(data.statusCode, 200);
  assert.deepEqual(data.body.records, []);
  assert.equal(data.headers["cache-control"], "private, no-store");
});

test("forged, tampered, expired and rotated sessions are refused", async () => {
  const cookie = await loginCookie();
  const [name, value] = cookie.split("=");
  const [payload, sig] = value.split(".");
  const call = async (c) => { const r = mockRes(); await freshApi("data")(mockReq({ cookie: c }), r); return r.statusCode; };

  const forged = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString("base64url");
  assert.equal(await call(`${name}=${forged}.${sig}`), 401, "forged payload");
  assert.equal(await call(`${name}=${payload}.${sig.slice(0, -2)}AA`), 401, "tampered signature");

  const realNow = Date.now;
  Date.now = () => realNow() + 31 * 24 * 3600 * 1000;
  try { assert.equal(await call(cookie), 401, "expired after 30 days"); } finally { Date.now = realNow; }

  process.env.AUTH_SECRET = "rotated-secret-".repeat(3);
  assert.equal(await call(cookie), 401, "rotating AUTH_SECRET logs everyone out");
});

test("logout clears the cookie", async () => {
  const res = mockRes();
  await freshApi("logout")(mockReq({ method: "POST" }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["set-cookie"], /Max-Age=0/);
});
