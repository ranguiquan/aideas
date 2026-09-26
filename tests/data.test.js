const test = require("node:test");
const assert = require("node:assert/strict");
const { freshApi, mockRes, mockReq, setAuthEnv, loginCookie } = require("./helpers");

const rt = (t) => ({ type: "rich_text", rich_text: t ? [{ plain_text: t }] : [] });
const page = (id, props, created = "2026-09-25T02:18:55.000Z") =>
  ({ id, created_time: created, last_edited_time: created, properties: props });

test.beforeEach(() => { setAuthEnv(); process.env.NOTION_TOKEN = "ntn_test"; });

test("record mapping: ids without dashes, tags, relations, decision fields", () => {
  const { toRecord } = freshApi("data");
  const r = toRecord(page("3e627141-a910-81b0-bf7f-e6a88213c237", {
    "标题": { type: "title", title: [{ plain_text: "做空IWM" }] },
    "类型": { type: "select", select: { name: "决策" } },
    "状态": { type: "select", select: { name: "跟进中" } },
    "主题标签": { type: "multi_select", multi_select: [{ name: "宏观" }, { name: "策略" }] },
    "一句话小结": rt("原话"),
    "衍生出": { type: "relation", relation: [{ id: "3e627141-a910-8113-b068-e16f68802737" }] },
    "回看日": { type: "date", date: { start: "2026-10-29", end: null } },
    "动作": { type: "select", select: { name: "买入" } },
  }));
  assert.equal(r.id, "3e627141a91081b0bf7fe6a88213c237");
  assert.equal(r.title, "做空IWM");
  assert.deepEqual(r.tags, ["宏观", "策略"]);
  assert.deepEqual(r.derivedTo, ["3e627141a9108113b068e16f68802737"]);
  assert.deepEqual(r.derivedFrom, []);
  assert.equal(r.reviewDate, "2026-10-29");
  assert.equal(r.action, "买入");
  assert.equal(r.next, null);
});

test("plan mapping keeps datetime dates as-is (the page normalizes them to SGT days)", () => {
  const { toPlan } = freshApi("data");
  const p = toPlan(page("3e727141-a910-81bd-ac28-d99d84d8f2df", {
    "名称": { type: "title", title: [{ plain_text: "美国9月CPI" }] },
    "类型": { type: "select", select: { name: "日程事件" } },
    "日期": { type: "date", date: { start: "2026-10-14T20:30:00.000+08:00", end: null } },
    "所属主题": { type: "relation", relation: [{ id: "3e727141-a910-819f-9aa2-ff20e819f2cb" }] },
  }));
  assert.equal(p.date, "2026-10-14T20:30:00.000+08:00");
  assert.deepEqual(p.theme, ["3e727141a910819f9aa2ff20e819f2cb"]);
  assert.equal(p.expectation, null);
});

test("loadAll follows pagination and sorts records newest first", async () => {
  const calls = [];
  global.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body);
    calls.push({ url, cursor: body.start_cursor, auth: opt.headers.Authorization });
    if (url.includes("3e627141")) {
      if (!body.start_cursor) return { ok: true, json: async () => ({ has_more: true, next_cursor: "c2", results: [page("a-1", {}, "2026-09-25T01:00:00.000Z")] }) };
      return { ok: true, json: async () => ({ has_more: false, results: [page("a-2", {}, "2026-09-26T01:00:00.000Z")] }) };
    }
    return { ok: true, json: async () => ({ has_more: false, results: [] }) };
  };
  const { records, plans } = await freshApi("data").loadAll("ntn_test");
  assert.deepEqual(records.map((r) => r.id), ["a2", "a1"]);
  assert.equal(plans.length, 0);
  assert.equal(calls.filter((c) => c.cursor === "c2").length, 1);
  assert.ok(calls.every((c) => c.auth === "Bearer ntn_test"));
});

test("Notion errors come back as 502 with the Notion code", async () => {
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ code: "object_not_found", message: "Could not find data_source" }) });
  const cookie = await loginCookie();
  const res = mockRes();
  const origError = console.error;
  console.error = () => {};
  try { await freshApi("data")(mockReq({ cookie }), res); } finally { console.error = origError; }
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.notionCode, "object_not_found");
  assert.equal(res.body.notionStatus, 404);
});

test("missing NOTION_TOKEN is reported after login", async () => {
  const cookie = await loginCookie();
  delete process.env.NOTION_TOKEN;
  const res = mockRes();
  await freshApi("data")(mockReq({ cookie }), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /NOTION_TOKEN/);
});
