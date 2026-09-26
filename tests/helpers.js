// Tiny Vercel-style req/res doubles for calling api/*.js handlers directly.
const path = require("path");

const API = path.join(__dirname, "..", "api");

function freshApi(name) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(API)) delete require.cache[k];
  return require(path.join(API, name));
}

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return res;
}

function mockReq({ method = "GET", cookie = "", body = null } = {}) {
  return { method, headers: cookie ? { cookie } : {}, body };
}

const PASSWORD = "correct horse battery staple";
const SECRET = "test-secret-".repeat(4);

function setAuthEnv() {
  process.env.AUTH_PASSWORD = PASSWORD;
  process.env.AUTH_SECRET = SECRET;
}

async function loginCookie() {
  const res = mockRes();
  await freshApi("login")(mockReq({ method: "POST", body: { password: PASSWORD } }), res);
  return res.headers["set-cookie"].split(";")[0];
}

module.exports = { freshApi, mockRes, mockReq, setAuthEnv, loginCookie, PASSWORD };
