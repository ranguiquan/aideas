// Vercel serverless function: reads both Notion data sources and returns the
// same normalized shape as public/data/snapshot.json.
//
// Env vars:
//   NOTION_TOKEN        Notion internal integration secret (required for live data)
//   NOTION_INFO_DS      data source id of 信息与灵感库 (optional, has default)
//   NOTION_PLAN_DS      data source id of 计划与关注 (optional, has default)
//   AUTH_PASSWORD / AUTH_SECRET   required; see api/_auth.js. Without a valid session this returns 401.

const auth = require("./_auth");

const NOTION_VERSION = "2025-09-03";
const INFO_DS = process.env.NOTION_INFO_DS || "3e627141-a910-80f6-b4de-000b0e86ddc4";
const PLAN_DS = process.env.NOTION_PLAN_DS || "d64bfa5d-3677-4546-83b4-80c81a00c727";

const plain = (rich) => (rich && rich.length ? rich.map((t) => t.plain_text).join("") : null);
const bareId = (id) => id.replace(/-/g, "");

function prop(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select ? p.select.name : null;
    case "multi_select": return p.multi_select.map((o) => o.name);
    case "url": return p.url;
    case "relation": return p.relation.map((r) => bareId(r.id));
    case "date": return p.date;
    case "created_time": return p.created_time;
    case "last_edited_time": return p.last_edited_time;
    default: return null;
  }
}

async function queryAll(dataSourceId, token) {
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `Notion API returned ${res.status}`);
      err.notionStatus = res.status;
      err.notionCode = body.code;
      err.dataSource = dataSourceId;
      throw err;
    }
    const json = await res.json();
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function toRecord(p) {
  const review = prop(p, "回看日");
  return {
    id: bareId(p.id),
    title: prop(p, "标题"),
    type: prop(p, "类型"),
    status: prop(p, "状态"),
    tags: prop(p, "主题标签") || [],
    source: prop(p, "来源"),
    summary: prop(p, "一句话小结"),
    next: prop(p, "下一步"),
    link: prop(p, "链接"),
    derivedFrom: prop(p, "衍生自") || [],
    derivedTo: prop(p, "衍生出") || [],
    plans: prop(p, "相关计划") || [],
    target: prop(p, "标的"),
    action: prop(p, "动作"),
    reviewDate: review ? review.start : null,
    verdict: prop(p, "判定"),
    created: p.created_time,
    updated: p.last_edited_time,
  };
}

function toPlan(p) {
  const date = prop(p, "日期");
  return {
    id: bareId(p.id),
    name: prop(p, "名称"),
    kind: prop(p, "类型"),
    status: prop(p, "状态"),
    tags: prop(p, "主题标签") || [],
    date: date ? date.start : null,
    dateEnd: date ? date.end : null,
    hypothesis: prop(p, "假设"),
    confirm: prop(p, "证实信号"),
    refute: prop(p, "推翻信号"),
    expectation: prop(p, "预期"),
    result: prop(p, "结果"),
    verdict: prop(p, "判定"),
    theme: prop(p, "所属主题") || [],
    events: prop(p, "检验事件") || [],
    records: prop(p, "相关记录") || [],
    created: p.created_time,
  };
}

// Read both data sources and return { records, plans } (used by the handler and scripts/snapshot.js)
async function loadAll(token) {
  const [info, plan] = await Promise.all([queryAll(INFO_DS, token), queryAll(PLAN_DS, token)]);
  const records = info.map(toRecord).sort((a, b) => b.created.localeCompare(a.created));
  const plans = plan.map(toPlan);
  return { records, plans };
}

async function handler(req, res) {
  // private data: never let the CDN or a shared cache keep a copy
  auth.noStore(res);
  const cfg = auth.config();
  if (!cfg.ok) {
    // fail closed: no auth configured means no data
    res.status(503).json({ error: cfg.error, auth: "unconfigured" });
    return;
  }
  if (!auth.isAuthenticated(req, cfg)) {
    res.status(401).json({ error: "login required", auth: "required" });
    return;
  }
  const token = (process.env.NOTION_TOKEN || "").trim();
  if (!token) {
    res.status(503).json({ error: "NOTION_TOKEN is not configured" });
    return;
  }
  try {
    const { records, plans } = await loadAll(token);
    res.status(200).json({ source: "live", generatedAt: new Date().toISOString(), records, plans });
  } catch (err) {
    console.error("[api/data]", err.notionStatus, err.notionCode, err.dataSource, err.message);
    res.status(502).json({
      error: String(err.message || err),
      notionStatus: err.notionStatus || null,
      notionCode: err.notionCode || null,
      dataSource: err.dataSource || null,
    });
  }
}

module.exports = handler;
module.exports.loadAll = loadAll;
module.exports.toRecord = toRecord;
module.exports.toPlan = toPlan;
