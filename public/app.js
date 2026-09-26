(function () {
  "use strict";

  // ---------- constants ----------
  var TYPE_COLOR = { "信息流": "var(--t-info)", "灵感": "var(--t-idea)", "决策": "var(--t-decision)" };
  var STATUS_COLOR = {
    "待处理": "var(--c-red)", "跟进中": "var(--c-yellow)", "已归档": "var(--c-green)", "已放弃": "var(--c-gray)",
    "进行中": "var(--c-yellow)", "待发生": "var(--c-blue)", "已完成": "var(--c-green)"
  };
  var TAG_COLOR = {
    "宏观": "var(--c-blue)", "行业": "var(--c-green)", "公司": "var(--c-orange)", "策略": "var(--c-purple)",
    "灵感": "var(--c-pink)", "信息管理": "var(--c-yellow)", "待归类": "var(--c-gray)", "AI": "var(--c-brown)", "认知管理": "var(--c-red)"
  };
  var TYPES = ["信息流", "灵感", "决策"];
  var STATUSES = ["待处理", "跟进中", "已归档", "已放弃"];
  var TZ = "Asia/Singapore";
  var DAY = 86400000;

  var state = { data: null, byId: {}, f: { type: new Set(), status: new Set(), tag: new Set() }, q: "", view: "feed", graphReady: false, range: { from: null, to: null }, pos: {}, zoom: null };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tagColor(t) { return TAG_COLOR[t] || "var(--c-gray)"; }
  function notionUrl(id) { return "https://www.notion.so/" + id; }
  function trunc(s, n) { s = s || ""; return s.length > n ? s.slice(0, n) + "…" : s; }

  var fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  var fmtTime = new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  var fmtWeek = new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, weekday: "short" });
  function sgDay(iso) { return fmtDay.format(new Date(iso)); }          // YYYY-MM-DD in SGT
  function todayKey() { return fmtDay.format(new Date()); }
  function dayNum(key) { var p = key.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY; }
  function daysUntil(key) { return dayNum(key) - dayNum(todayKey()); }
  function addDays(key, n) { return new Date((dayNum(key) + n) * DAY).toISOString().slice(0, 10); }
  function md(key) { if (!key) return "—"; var p = key.split("-"); return +p[1] + "月" + +p[2] + "日"; }
  function mdShort(key) { if (!key) return "—"; var p = key.split("-"); return p[1] + "/" + p[2]; }
  function rel(key) {
    if (!key) return "日期未定";
    var d = daysUntil(key);
    if (d === 0) return "今天";
    if (d === 1) return "明天";
    if (d > 0) return d + " 天后";
    return -d + " 天前";
  }
  function pill(status) { return '<span class="pill" style="--pc:' + (STATUS_COLOR[status] || "var(--c-gray)") + '">' + esc(status || "—") + "</span>"; }
  function tagsHtml(tags) {
    return '<span class="tags">' + (tags || []).map(function (t) { return '<span class="tag" style="--tg:' + tagColor(t) + '">' + esc(t) + "</span>"; }).join("") + "</span>";
  }

  // ---------- data ----------
  // Why /api/data failed, kept so the "not connected" screen can say what to fix.
  var apiError = null;

  function load() {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch("/api/data", ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        clearTimeout(timer);
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.records) throw { status: r.status, body: j };
          return j;
        });
      })
      .catch(function (e) {
        if (e && e.body && e.body.auth === "required") throw { needLogin: true };
        apiError = e && e.name === "AbortError" ? { status: 0, body: { error: "请求超时（15 秒）" } }
          : e && e.status !== undefined ? e : { status: 0, body: { error: String(e && e.message || e) } };
        return fetch("data/snapshot.json").then(function (r) { if (!r.ok) throw new Error("no snapshot"); return r.json(); });
      });
  }

  function apiErrorHint(e) {
    var b = (e && e.body) || {}, code = b.notionCode, st = e && e.status;
    if (b.auth === "unconfigured") return "还没有设置访问密码，所以数据接口处于关闭状态。在 Vercel 环境变量中添加 <code>AUTH_PASSWORD</code>（至少 12 位）和 <code>AUTH_SECRET</code>（至少 32 位随机字符），然后 Redeploy。";
    if (st === 404) return "没有找到 <code>/api/data</code> 接口。本地用 <code>npx serve</code> 预览时这是正常的；线上出现说明 <code>api/</code> 目录没有被部署，检查 Vercel 项目的 Root Directory 是否为 <code>./</code>。";
    if (st === 503) return "这次部署读不到 <code>NOTION_TOKEN</code>。检查环境变量是否勾选了当前环境（Preview 部署需要勾 <b>Preview</b>），以及添加变量之后是否 Redeploy 过——已有的部署不会自动拿到新变量。";
    if (code === "unauthorized") return "Notion 拒绝了这个 token（无效或已被重置）。重新复制 integration 的 secret，更新 Vercel 环境变量后 Redeploy。";
    if (code === "object_not_found") return "token 有效，但 integration 看不到这个数据库（" + esc(b.dataSource || "") + "）。在 Notion 里打开「信息与灵感库」和「计划与关注」，右上角 <code>···</code> → Connections，两个都要添加这个 integration。如果用的是自己的数据库，还要设置 <code>NOTION_INFO_DS</code> / <code>NOTION_PLAN_DS</code>。";
    if (code === "restricted_resource") return "integration 没有读取权限。在 Notion integration 设置里勾选 <b>Read content</b>。";
    if (code === "validation_error" || code === "invalid_request_url") return "Notion 不接受这个请求，通常是数据源 ID 写错了。检查 <code>NOTION_INFO_DS</code> / <code>NOTION_PLAN_DS</code>（只填 ID，不要带 <code>collection://</code>）。";
    return "在 Vercel 项目的 Environment Variables 中添加 <code>NOTION_TOKEN</code>，在 Notion 里把两个数据库连接到这个 integration，然后 Redeploy。";
  }

  // Notion dates can carry a time ("2026-10-14T20:30:00.000+08:00"). Layout works on SGT day keys,
  // so normalize them here and keep the time for display.
  function toKey(s) { return s && s.length > 10 ? sgDay(s) : s; }

  function index(data) {
    state.byId = {};
    data.plans.forEach(function (p) {
      p.time = p.date && p.date.length > 10 ? fmtTime.format(new Date(p.date)) : null;
      p.date = toKey(p.date); p.dateEnd = toKey(p.dateEnd);
    });
    data.records.forEach(function (r) { r.reviewDate = toKey(r.reviewDate); });
    data.records.forEach(function (r) { r._kind = "record"; state.byId[r.id] = r; });
    data.plans.forEach(function (p) { p._kind = "plan"; state.byId[p.id] = p; });
  }

  function filtered() {
    var f = state.f, q = state.q.trim().toLowerCase();
    return state.data.records.filter(function (r) {
      if (f.type.size && !f.type.has(r.type)) return false;
      if (f.status.size && !f.status.has(r.status)) return false;
      if (f.tag.size && !r.tags.some(function (t) { return f.tag.has(t); })) return false;
      if (q) {
        var hay = [r.title, r.summary, r.source, r.next, r.target, r.tags.join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  // Sidebar filters for themes / events / reviews. Their own tags, or the parent theme's when an event has none.
  function planTags(p) {
    if (p.tags && p.tags.length) return p.tags;
    var t = p.theme && state.byId[p.theme[0]];
    return t && t.tags ? t.tags : [];
  }
  function planMatches(p) {
    var f = state.f, q = state.q.trim().toLowerCase();
    if (f.tag.size && !planTags(p).some(function (t) { return f.tag.has(t); })) return false;
    if (q && [p.name, p.hypothesis, p.expectation, p.result].join(" ").toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function themes() { return state.data.plans.filter(function (p) { return p.kind === "追踪主题"; }); }
  function events() { return state.data.plans.filter(function (p) { return p.kind === "日程事件"; }); }

  // ---------- sidebar ----------
  function renderFilters() {
    var recs = state.data.records;
    function group(el, key, values, colorOf) {
      $(el).innerHTML = values.map(function (v) {
        var n = recs.filter(function (r) { return key === "tag" ? r.tags.indexOf(v) >= 0 : r[key] === v; }).length;
        return '<button class="fchip" type="button" data-k="' + key + '" data-v="' + esc(v) + '" aria-pressed="' + state.f[key].has(v) + '" style="--dot:' + colorOf(v) + '"><i></i>' + esc(v) + "<small title=\"" + n + " 条记录\">" + n + "</small></button>";
      }).join("");
    }
    var tagSet = {};
    recs.forEach(function (r) { r.tags.forEach(function (t) { tagSet[t] = (tagSet[t] || 0) + 1; }); });
    var tagList = Object.keys(tagSet).sort(function (a, b) { return tagSet[b] - tagSet[a]; });
    group("f-type", "type", TYPES.filter(function (t) { return recs.some(function (r) { return r.type === t; }); }), function (v) { return TYPE_COLOR[v]; });
    group("f-status", "status", STATUSES.filter(function (s) { return recs.some(function (r) { return r.status === s; }); }), function (v) { return STATUS_COLOR[v]; });
    group("f-tag", "tag", tagList, tagColor);
    var any = state.f.type.size || state.f.status.size || state.f.tag.size;
    $("f-reset").hidden = !any;
  }

  // ---------- login ----------
  function showLogin() {
    document.querySelector(".app").hidden = true;
    $("login").hidden = false;
    $("login-pw").focus();
  }

  function bindLogin() {
    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("login-btn"), err = $("login-err"), pw = $("login-pw").value;
      if (!pw) return;
      btn.disabled = true; btn.textContent = "验证中…"; err.hidden = true;
      fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }), credentials: "same-origin" })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (r) {
          if (r.status === 200) { location.reload(); return; }
          err.textContent = r.status === 401 ? "密码不对，再试一次。"
            : r.body.auth === "unconfigured" ? "服务器还没有设置访问密码（AUTH_PASSWORD / AUTH_SECRET）。"
            : "登录失败（HTTP " + r.status + "）。";
          err.hidden = false;
          $("login-pw").select();
        })
        .catch(function () { err.textContent = "网络错误，请稍后再试。"; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.textContent = "登录"; });
    });
    $("logout").addEventListener("click", function () {
      fetch("/api/logout", { method: "POST", credentials: "same-origin" }).then(function () { location.reload(); }, function () { location.reload(); });
    });
  }

  function renderSource() {
    var el = $("src"), d = state.data;
    $("logout").hidden = d.source !== "live";
    el.className = "src " + (d.source === "live" ? "live" : "snap");
    var t = new Date(d.generatedAt);
    var when = fmtDay.format(t) + " " + fmtTime.format(t);
    el.querySelector("span").textContent = (d.source === "live" ? "实时 · Notion · " : "快照 · ") + when;
  }

  // ---------- KPIs ----------
  function upcoming() {
    var list = [];
    themes().forEach(function (t) { if (t.status === "进行中" && t.date) list.push({ date: t.date, label: "主题复查", name: t.name, id: t.id }); });
    events().forEach(function (e) {
      if (e.status !== "待发生" || !e.date) return;
      list.push({ date: e.date, label: "事件", name: e.name, id: e.id });
      if (!e.expectation) list.push({ date: addDays(e.date, -2), label: "写预期", name: e.name, id: e.id });
    });
    state.data.records.forEach(function (r) {
      if (r.type === "决策" && r.reviewDate && r.status !== "已归档") list.push({ date: r.reviewDate, label: "决策回看", name: r.title, id: r.id });
    });
    return list.filter(function (x) { return daysUntil(x.date) >= 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function renderKPIs() {
    var recs = state.data.records;
    var c = function (fn) { return recs.filter(fn).length; };
    var pending = c(function (r) { return r.status === "待处理"; });
    var next = upcoming()[0];
    var html = [
      kpi(recs.length, "条记录"),
      kpi(pending, "待处理", pending > 0 ? "alert" : ""),
      kpi(c(function (r) { return r.status === "跟进中"; }), "跟进中"),
      kpi(themes().filter(function (t) { return t.status === "进行中"; }).length, "追踪主题"),
      kpi(events().filter(function (e) { return e.status === "待发生"; }).length, "待发生事件")
    ];
    if (next) {
      html.push('<div class="kpi next"><b>' + esc(trunc(next.name, 14)) + "<em>" + rel(next.date) + "</em></b><span>下一个节点 · " + esc(next.label) + " · " + md(next.date) + "</span></div>");
    }
    $("kpis").innerHTML = html.join("");
    function kpi(n, label, cls) { return '<div class="kpi ' + (cls || "") + '"><b>' + n + "</b><span>" + label + "</span></div>"; }
  }

  // ---------- feed ----------
  function renderFeed() {
    var recs = filtered();
    $("n-feed").textContent = recs.length;
    if (!recs.length) { $("v-feed").innerHTML = '<p class="empty">没有符合条件的记录。</p>'; return; }
    var groups = {}, order = [];
    recs.forEach(function (r) { var k = sgDay(r.created); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    $("v-feed").innerHTML = order.map(function (k) {
      var list = groups[k];
      return '<div class="day"><div class="day-h"><b>' + mdShort(k) + "</b><span>" + fmtWeek.format(new Date(k + "T12:00:00+08:00")) + " · " + list.length + " 条</span></div>" +
        '<div class="cards">' + list.map(card).join("") + "</div></div>";
    }).join("");
  }

  var ICON_DERIVE = '<svg viewBox="0 0 16 16"><path d="M4 2v6a3 3 0 0 0 3 3h6M10 8l3 3-3 3"/></svg>';
  var ICON_PLAN = '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6.5h11M5.5 1.5v3M10.5 1.5v3"/></svg>';

  function card(r) {
    var rels = [];
    if (r.derivedFrom.length) rels.push("<span>" + ICON_DERIVE + "衍生自 " + esc(trunc((state.byId[r.derivedFrom[0]] || {}).title, 12)) + "</span>");
    if (r.derivedTo.length) rels.push("<span>" + ICON_DERIVE + "衍生出 " + r.derivedTo.length + " 条</span>");
    if (r.plans.length) rels.push("<span>" + ICON_PLAN + esc(trunc((state.byId[r.plans[0]] || {}).name, 14)) + "</span>");
    var decision = "";
    if (r.type === "决策") {
      decision = '<div class="decision">' +
        (r.action ? "<div><small>动作</small><b>" + esc(r.action) + "</b></div>" : "") +
        (r.target ? "<div><small>标的</small><b>" + esc(r.target) + "</b></div>" : "") +
        (r.reviewDate ? "<div><small>回看日</small><b>" + mdShort(r.reviewDate) + " · " + rel(r.reviewDate) + "</b></div>" : "") +
        (r.verdict ? "<div><small>判定</small><b>" + esc(r.verdict) + "</b></div>" : "") + "</div>";
    }
    return '<article class="card" tabindex="0" data-id="' + r.id + '" style="--tc:' + TYPE_COLOR[r.type] + '">' +
      '<div class="card-meta"><span class="tbadge">' + esc(r.type) + "</span><time>" + fmtTime.format(new Date(r.created)) + '</time><span class="srcname">' + esc(r.source) + "</span></div>" +
      "<h3>" + esc(r.title) + "</h3>" +
      (r.summary ? '<p class="sum">' + esc(r.summary) + "</p>" : "") +
      decision +
      (r.next ? '<p class="next-line"><b>下一步</b><span>' + esc(r.next) + "</span></p>" : "") +
      '<div class="card-foot"><div class="rels">' + tagsHtml(r.tags) + rels.join("") + "</div>" + pill(r.status) + "</div>" +
      "</article>";
  }

  // ---------- graph ----------
  function inRange(iso) {
    var k = sgDay(iso), r = state.range;
    return (!r.from || k >= r.from) && (!r.to || k <= r.to);
  }

  function graphData() {
    var recs = filtered().filter(function (r) { return inRange(r.created); });
    var f = state.f, recordOnly = f.type.size || f.status.size, showAll = $("g-events").checked;
    var recIds = {};
    recs.forEach(function (r) { recIds[r.id] = 1; });
    function linked(p) {
      return p.records.some(function (id) { return recIds[id]; }) || recs.some(function (r) { return r.plans.indexOf(p.id) >= 0; });
    }
    // A plan item shows when it is tied to a visible record, or (with no record-only filter) matches tag/search.
    // Events and reviews are only drawn by default when they connect to a record; the toggle shows all of them.
    var plans = state.data.plans.filter(function (p) {
      if (!inRange(p.created)) return false;
      var isLinked = linked(p);
      if (!isLinked && (recordOnly || !planMatches(p))) return false;
      if (p.kind === "追踪主题") return true;
      return showAll || isLinked;
    });
    var shown = {};
    plans.forEach(function (p) { shown[p.id] = 1; });
    var visThemes = plans.filter(function (p) { return p.kind === "追踪主题"; });
    var ids = {}, nodes = [], links = [], seen = {};
    function addLink(s, t, kind) {
      var key = [s, t].sort().join("|") + kind;
      if (seen[key] || !ids[s] || !ids[t]) return;
      seen[key] = 1; links.push({ source: s, target: t, kind: kind });
    }
    recs.forEach(function (r) { ids[r.id] = 1; nodes.push({ id: r.id, kind: "record", label: r.title, color: TYPE_COLOR[r.type], ref: r }); });
    plans.forEach(function (p) {
      ids[p.id] = 1;
      var k = p.kind === "追踪主题" ? "theme" : p.kind === "日程事件" ? "event" : "review";
      // count this theme's events from both sides of the relation, minus the ones already on the graph
      var evIds = {};
      if (k === "theme") {
        p.events.forEach(function (id) { evIds[id] = 1; });
        events().forEach(function (e) { if (e.theme.indexOf(p.id) >= 0) evIds[e.id] = 1; });
      }
      var hidden = Object.keys(evIds).filter(function (id) { return !shown[id]; }).length;
      nodes.push({ id: p.id, kind: k, label: p.name, color: k === "theme" ? "var(--c-purple)" : k === "event" ? "var(--c-blue)" : "var(--c-gray)", ref: p, hiddenEvents: hidden });
    });
    if ($("g-tags").checked) {
      var tags = {};
      recs.forEach(function (r) { r.tags.forEach(function (t) { tags[t] = 1; }); });
      visThemes.forEach(function (p) { p.tags.forEach(function (t) { tags[t] = 1; }); });
      Object.keys(tags).forEach(function (t) { ids["tag:" + t] = 1; nodes.push({ id: "tag:" + t, kind: "tag", label: "#" + t, color: tagColor(t) }); });
      recs.forEach(function (r) { r.tags.forEach(function (t) { addLink(r.id, "tag:" + t, "tag"); }); });
      visThemes.forEach(function (p) { p.tags.forEach(function (t) { addLink(p.id, "tag:" + t, "tag"); }); });
    }
    recs.forEach(function (r) {
      r.derivedFrom.forEach(function (s) { addLink(s, r.id, "derive"); });
      r.plans.forEach(function (p) { addLink(r.id, p, "plan"); });
    });
    plans.forEach(function (p) {
      p.records.forEach(function (r) { addLink(r, p.id, "plan"); });
      p.theme.forEach(function (t) { addLink(p.id, t, "theme"); });
    });
    // seed positions from the previous render so filtering doesn't reshuffle the layout
    var seeded = 0;
    nodes.forEach(function (n) { var p = state.pos[n.id]; if (p) { n.x = p.x; n.y = p.y; seeded++; } });
    return { nodes: nodes, links: links, seeded: seeded };
  }

  function nodeR(d) { return d.kind === "theme" ? 16 : d.kind === "event" ? 9 : d.kind === "review" ? 7 : d.kind === "tag" ? 5 : 9; }

  var sim;
  function renderGraph() {
    var box = $("graph");
    if (typeof d3 === "undefined") { box.innerHTML = '<p class="empty">图谱组件加载失败，请检查网络。</p>'; return; }
    var W = box.clientWidth || 900, H = box.clientHeight || 600;
    var g = graphData();
    $("n-graph").textContent = g.nodes.filter(function (n) { return n.kind !== "tag"; }).length;
    if (sim) sim.stop();
    box.innerHTML = "";
    var svg = d3.select(box).append("svg").attr("viewBox", [0, 0, W, H]).attr("role", "img").attr("aria-label", "记录、主题、事件与标签的关系图");
    var lastPointer = "mouse", tipFor = null;
    svg.on("click.tip", function (e) { if (!e.target.closest(".g-node")) hideTip(); });   // tap on empty space closes the card
    svg.append("defs").append("marker").attr("id", "arr").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5)
      .attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
      .append("path").attr("d", "M0 0L10 5L0 10z").style("fill", "var(--accent)");
    var root = svg.append("g");
    var zoom = d3.zoom().scaleExtent([0.4, 3]).on("zoom", function (e) { state.zoom = e.transform; root.attr("transform", e.transform); scheduleLabels(); });
    svg.call(zoom);
    if (state.zoom) svg.call(zoom.transform, state.zoom);

    var rings = root.append("g").attr("class", "g-rings");   // guide circles in focus mode
    var link = root.append("g").selectAll("path").data(g.links).join("path")
      .attr("class", function (d) { return "g-link " + d.kind; })
      .attr("marker-end", function (d) { return d.kind === "derive" ? "url(#arr)" : null; });

    var node = root.append("g").selectAll("g").data(g.nodes).join("g")
      .attr("class", function (d) { return "g-node " + d.kind + "node"; })
      .attr("tabindex", function (d) { return d.kind === "tag" ? null : 0; })
      .on("pointerdown.kind", function (e) { lastPointer = e.pointerType; })
      .on("click", function (e, d) {
        // touch: first tap shows the full-title card, a second tap on the same node acts
        if (lastPointer !== "mouse" && tipFor !== d.id) { showTip(e, d, true); tipFor = d.id; return; }
        hideTip();
        if (d.kind === "tag") toggleTag(d.id.slice(4)); else openDetail(d.id);
      })
      .on("keydown", function (e, d) { if (e.key === "Enter" && d.kind !== "tag") openDetail(d.id); })
      .on("mouseenter", function (e, d) { highlight(d); showTip(e, d); })
      .on("mousemove", function (e) { moveTip(e); })
      .on("mouseleave", function () { highlight(null); if (lastPointer === "mouse") hideTip(); })   // touch fires a synthetic mouseleave right after a tap
      .call(d3.drag()
        .on("start", function (e, d) {
          d._sx = e.x; d._sy = e.y; d._moved = false;
          if (!e.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", function (e, d) {
          // a real drag (not a click) makes this node the centre of the layout
          if (!d._moved && Math.hypot(e.x - d._sx, e.y - d._sy) > 4) { d._moved = true; hideTip(); focusOn(d); }
          d.fx = e.x; d.fy = e.y;
          if (d._moved) moveFocus(e.x, e.y);
        })
        .on("end", function (e, d) {
          if (!e.active) sim.alphaTarget(0);
          if (d._moved) glideToCenter(d);
          else if (d.id !== state.focusId) { d.fx = null; d.fy = null; }
        }));

    node.each(function (d) {
      var s = d3.select(this), r = nodeR(d);
      if (d.kind === "event") {
        s.append("rect").attr("class", "shape").attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2).attr("rx", 2).attr("transform", "rotate(45)").style("fill", d.color);
      } else if (d.kind === "tag") {
        s.append("circle").attr("class", "shape").attr("r", r).style("fill", "var(--surface)").style("stroke", d.color).style("stroke-width", 2);
      } else if (d.kind === "theme") {
        s.append("circle").attr("r", r + 5).style("fill", "none").style("stroke", d.color).style("stroke-width", 1.5).style("opacity", 0.45);
        s.append("circle").attr("class", "shape").attr("r", r).style("fill", d.color);
        if (d.hiddenEvents) {   // events folded into the theme: show how many
          var bx = -r * 0.72, by = -r * 0.72;
          s.append("circle").attr("cx", bx).attr("cy", by).attr("r", 7.5).style("fill", "var(--c-blue)").style("stroke", "var(--surface)").style("stroke-width", 2);
          s.append("text").attr("class", "badge").attr("x", bx).attr("y", by + 3.5).attr("text-anchor", "middle").text(d.hiddenEvents);
          s.append("title").text(d.hiddenEvents + " 个检验事件已收起（打开「显示全部事件」可展开）");
        }
      } else {
        s.append("circle").attr("class", "shape").attr("r", r).style("fill", d.color).style("stroke", "var(--surface)").style("stroke-width", 2);
        if (d.kind === "record" && d.ref.status === "待处理") s.append("circle").attr("r", 3).attr("cx", r * 0.75).attr("cy", -r * 0.75).style("fill", "var(--c-red)").style("stroke", "var(--surface)").style("stroke-width", 1.5);
      }
      s.append("text").attr("class", "lbl").attr("x", r + 7).attr("dy", "0.35em").text(d.kind === "tag" ? d.label : trunc(d.label, 18));
    });

    var adj = {};
    g.links.forEach(function (l) { var s = l.source.id || l.source, t = l.target.id || l.target; adj[s + "|" + t] = adj[t + "|" + s] = 1; });
    function highlight(d) {
      node.classed("dim", function (n) { return d && n.id !== d.id && !adj[d.id + "|" + n.id]; });
      link.classed("dim", function (l) { return d && l.source.id !== d.id && l.target.id !== d.id; });
    }

    // ----- labels: keep them readable -----
    // Text keeps the same on-screen size while zooming; after each layout change labels are placed greedily
    // by priority, facing away from the centre, and any label that would overlap a placed label or another
    // node is hidden (the hover card still shows the full title). Zooming in frees space, so more appear.
    var focusC = null, labelFrame = 0, tickCount = 0;
    node.each(function (d) { d._w = this.querySelector("text.lbl").getComputedTextLength(); });   // width at k = 1
    var degree = {};
    g.links.forEach(function (l) {
      var s = l.source.id || l.source, t = l.target.id || l.target;
      degree[s] = (degree[s] || 0) + 1; degree[t] = (degree[t] || 0) + 1;
    });
    function labelPriority(d) {
      if (state.focusId) {
        if (d.id === state.focusId) return 1000;
        var h = d._hop === undefined ? 9 : d._hop;
        return 600 - h * 100 + (d.kind === "theme" ? 30 : d.kind === "record" ? 20 : 0);
      }
      var base = d.kind === "theme" ? 300 : d.kind === "record" ? 200 : d.kind === "event" ? 150 : 100;
      return base + (degree[d.id] || 0) * 5;
    }
    function layoutLabels() {
      var k = state.zoom ? state.zoom.k : 1, c = focusC || viewCenter();
      var h = 14 / k, gap = 6 / k, placed = [];
      function hits(b) {
        for (var i = 0; i < placed.length; i++) {
          var p = placed[i];
          if (b[0] < p[0] + p[2] && b[0] + b[2] > p[0] && b[1] < p[1] + p[3] && b[1] + b[3] > p[1]) return true;
        }
        return false;
      }
      // every node's own shape is an obstacle for other nodes' labels
      g.nodes.forEach(function (d) { var r = nodeR(d) + 1; placed.push([d.x - r, d.y - r, r * 2, r * 2, d.id]); });
      var order = g.nodes.slice().sort(function (a, b) { return labelPriority(b) - labelPriority(a); });
      // visible area in graph coordinates, so labels never run off the canvas
      var tl = state.zoom ? state.zoom.invert([0, 0]) : [0, 0], br = state.zoom ? state.zoom.invert([W, H]) : [W, H];
      function inView(b) { return b[0] >= tl[0] + 4 / k && b[0] + b[2] <= br[0] - 4 / k && b[1] >= tl[1] && b[1] + b[3] <= br[1]; }
      order.forEach(function (d) {
        var off = nodeR(d) + gap, w = d._w / k, outward = d.x >= c[0] ? 1 : -1;
        var own = placed.filter(function (p) { return p[4] === d.id; });
        placed = placed.filter(function (p) { return p[4] !== d.id; });   // a label may touch its own node
        // try facing away from the centre first, then the other side; hide only if neither fits
        d._hideLabel = true; d._off = off; d._side = outward;
        [outward, -outward].some(function (side) {
          var box = side > 0 ? [d.x + off, d.y - h / 2, w, h] : [d.x - off - w, d.y - h / 2, w, h];
          if (!inView(box) || hits(box)) return false;
          d._side = side; d._hideLabel = false; placed.push(box);
          return true;
        });
        placed = placed.concat(own);
      });
      node.classed("nolabel", function (d) { return d._hideLabel; });
      node.select("text.lbl")
        .style("font-size", (11.5 / k) + "px").style("stroke-width", (4 / k) + "px")
        .attr("x", function (d) { return d._side * d._off; })
        .attr("text-anchor", function (d) { return d._side > 0 ? "start" : "end"; });
    }
    function scheduleLabels() {
      if (labelFrame) return;
      labelFrame = requestAnimationFrame(function () { labelFrame = 0; layoutLabels(); });
    }

    // hover card with the full title
    var tip = d3.select(box).append("div").attr("class", "g-tip").attr("hidden", true);
    function showTip(e, d, tapped) {
      var o = d.ref || {}, meta = d.kind === "tag" ? "标签" : o._kind === "record" ? [o.type, o.status].filter(Boolean).join(" · ") : [o.kind, o.status, o.date ? md(o.date) : ""].filter(Boolean).join(" · ");
      tip.html("<b>" + esc(d.kind === "tag" ? d.label : d.label) + "</b>" + (meta ? "<span>" + esc(meta) + "</span>" : "") +
        (tapped ? "<em>" + (d.kind === "tag" ? "再点一次按此标签筛选" : "再点一次查看详情") + "</em>" : "")).attr("hidden", null);
      moveTip(e);
    }
    function moveTip(e) {
      var p = d3.pointer(e, box), bw = box.clientWidth, tw = tip.node().offsetWidth;
      tip.style("left", Math.min(p[0] + 14, bw - tw - 8) + "px").style("top", (p[1] + 16) + "px");
    }
    function hideTip() { tip.attr("hidden", true); tipFor = null; }

    // ----- focus mode: radial layout by hop distance from one node -----
    var nbrs = {};
    g.links.forEach(function (l) {
      var s = l.source.id || l.source, t = l.target.id || l.target;
      (nbrs[s] = nbrs[s] || []).push(t); (nbrs[t] = nbrs[t] || []).push(s);
    });
    function hopsFrom(id) {
      var dist = {}, q = [id];
      dist[id] = 0;
      while (q.length) {
        var c = q.shift();
        (nbrs[c] || []).forEach(function (n) { if (dist[n] === undefined) { dist[n] = dist[c] + 1; q.push(n); } });
      }
      return dist;
    }
    // radius per hop: 0 (centre), 1, 2, 3, 4+, scaled to the canvas; unreachable nodes sit on the outermost ring
    var maxR = Math.max(180, Math.min(W, H) / 2 - 36);
    var RINGS = [0, maxR * 0.26, maxR * 0.46, maxR * 0.65, maxR * 0.83], OUTER = maxR, DEEPEST = RINGS.length - 1;
    function ringOf(n) { return n._hop === undefined ? OUTER : RINGS[Math.min(n._hop, DEEPEST)]; }
    function viewCenter() { return state.zoom ? state.zoom.invert([W / 2, H / 2]) : [W / 2, H / 2]; }
    function drawRings(cx, cy) {
      rings.selectAll("circle").data(RINGS.slice(1)).join("circle").attr("cx", cx).attr("cy", cy).attr("r", function (r) { return r; });
    }
    function applyFocus(d, cx, cy) {
      var dist = hopsFrom(d.id);
      g.nodes.forEach(function (n) { n._hop = dist[n.id]; });
      sim.force("x", null).force("y", null)
        .force("radial", d3.forceRadial(ringOf, cx, cy).strength(function (n) { return n.id === d.id ? 0 : n._hop === undefined ? 0.25 : 0.8; }));
      sim.force("link").strength(0.08);   // let the rings, not the links, decide the shape
      node.classed("focus", function (n) { return n.id === d.id; })
        .attr("data-hop", function (n) { return n._hop === undefined ? "far" : Math.min(n._hop, DEEPEST); });
      link.classed("far", function (l) { var a = l.source._hop, b = l.target._hop; return a === undefined || b === undefined || Math.max(a, b) >= DEEPEST; });
      drawRings(cx, cy);
      focusC = [cx, cy];
      $("g-reset").hidden = false;
    }
    function focusOn(d) {
      if (state.focusId && state.focusId !== d.id) {   // release the previous centre
        var prev = g.nodes.find(function (n) { return n.id === state.focusId; });
        if (prev) { prev.fx = null; prev.fy = null; }
      }
      state.focusId = d.id;
      applyFocus(d, d.x, d.y);
      sim.alpha(0.7).restart();
    }
    function moveFocus(x, y) {
      var r = sim.force("radial");
      if (r) { r.x(x).y(y); }
      drawRings(x, y);
      focusC = [x, y];
    }
    function glideToCenter(d) {
      var c = viewCenter(), fx = d.fx, fy = d.fy, dur = 550;
      var t = d3.timer(function (el) {
        var k = Math.min(1, el / dur), e = d3.easeCubicInOut(k);
        d.fx = fx + (c[0] - fx) * e; d.fy = fy + (c[1] - fy) * e;
        moveFocus(d.fx, d.fy);
        if (sim.alpha() < 0.3) sim.alpha(0.3).restart();
        if (k >= 1) t.stop();
      });
    }
    state.resetFocus = function () {
      state.focusId = null;
      g.nodes.forEach(function (n) { n.fx = null; n.fy = null; n._hop = undefined; });
      sim.force("radial", null).force("x", d3.forceX(W / 2).strength(0.035)).force("y", d3.forceY(H / 2).strength(0.07));
      sim.force("link").strength(function (l) { return l.kind === "tag" ? 0.25 : 0.7; });
      node.classed("focus", false).attr("data-hop", null);
      link.classed("far", false);
      rings.selectAll("circle").remove();
      focusC = null;
      $("g-reset").hidden = true;
      sim.alpha(0.8).restart();
    };

    sim = d3.forceSimulation(g.nodes)
      .alpha(g.seeded && g.seeded >= g.nodes.length / 2 ? 0.35 : 1)
      .force("link", d3.forceLink(g.links).id(function (d) { return d.id; }).distance(function (l) { return l.kind === "tag" ? 90 : l.kind === "theme" ? 70 : 80; }).strength(function (l) { return l.kind === "tag" ? 0.25 : 0.7; }))
      .force("charge", d3.forceManyBody().strength(function (d) { return d.kind === "tag" ? -140 : -320; }))
      .force("collide", d3.forceCollide().radius(function (d) { return nodeR(d) + 14; }))
      .force("x", d3.forceX(W / 2).strength(0.035))
      .force("y", d3.forceY(H / 2).strength(0.07))
      .on("tick", function () {
        link.attr("d", function (d) {
          var sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
          if (d.kind === "derive") { var dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1, r = nodeR(d.target) + 3; tx -= dx / len * r; ty -= dy / len * r; }
          return "M" + sx + "," + sy + "L" + tx + "," + ty;
        });
        node.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
      })
      .on("tick.pos", function () {
        g.nodes.forEach(function (n) { state.pos[n.id] = { x: n.x, y: n.y }; });
        if (++tickCount % 4 === 0) scheduleLabels();
      })
      .on("end", layoutLabels);
    // keep the chosen centre across re-renders (filters, resize)
    var fd = state.focusId && g.nodes.find(function (n) { return n.id === state.focusId; });
    if (fd) { var c0 = viewCenter(); fd.fx = c0[0]; fd.fy = c0[1]; applyFocus(fd, c0[0], c0[1]); }
    else { state.focusId = null; $("g-reset").hidden = true; }
    layoutLabels();
    d3.select(box).append("p").attr("class", "g-hint").text("拖动任一节点，以它为中心重新排版 · 放大可显示更多名称 · 悬停看全名 · 点击查看详情");
  }

  // ---------- time range filter (graph) ----------
  function timeDomain() {
    var keys = state.data.records.map(function (r) { return sgDay(r.created); })
      .concat(state.data.plans.map(function (p) { return sgDay(p.created); }));
    var min = keys.reduce(function (a, b) { return a < b ? a : b; }, todayKey());
    var max = keys.reduce(function (a, b) { return a > b ? a : b; }, todayKey());
    return { min: min, max: max, n: dayNum(max) - dayNum(min) };
  }
  function idxOf(key, dom) { return Math.max(0, Math.min(dom.n, dayNum(key) - dayNum(dom.min))); }

  function renderTimeFilter() {
    var dom = timeDomain(), n = dom.n, r = state.range;
    var lo = r.from ? idxOf(r.from, dom) : 0, hi = r.to ? idxOf(r.to, dom) : n;
    // Each day is one bin; the thumbs sit on bin edges: start-of-day `lo` and end-of-day `hi`.
    var bins = n + 1, loEl = $("tf-lo"), hiEl = $("tf-hi");
    [loEl, hiEl].forEach(function (el) { el.max = bins; el.disabled = n === 0; });
    loEl.value = lo; hiEl.value = hi + 1;
    loEl.style.zIndex = lo >= n ? 3 : 2;   // keep the start thumb grabbable when both sit at the right end
    var edge = function (b) { return b / bins * 100; };
    $("tf-fill").style.left = edge(lo) + "%";
    $("tf-fill").style.right = 100 - edge(hi + 1) + "%";
    var from = addDays(dom.min, lo), to = addDays(dom.min, hi);
    ["tf-from", "tf-to"].forEach(function (id) { $(id).min = dom.min; $(id).max = dom.max; });
    $("tf-from").value = from; $("tf-to").value = to;

    // per-day record counts (respecting the sidebar filters), drawn in the separate 每日入库 chart
    var counts = [], peak = 0;
    for (var i = 0; i <= n; i++) counts.push(0);
    filtered().forEach(function (x) { counts[idxOf(sgDay(x.created), dom)]++; });
    counts.forEach(function (c) { peak = Math.max(peak, c); });
    updateCalendar(dom, counts, peak, lo, hi);

    // label every day when there are few, otherwise first / middle / last
    var tickIdx = bins <= 8 ? counts.map(function (_, i) { return i; }) : [0, Math.round(n / 2), n];
    $("tf-ticks").innerHTML = tickIdx.map(function (i) {
      return '<span style="left:' + edge(i + 0.5) + '%">' + mdShort(addDays(dom.min, i)) + "</span>";
    }).join("");

    var inCount = counts.slice(lo, hi + 1).reduce(function (a, b) { return a + b; }, 0);
    $("tf-sum").textContent = (lo === hi ? md(from) : md(from) + " – " + md(to)) + " · " + inCount + " 条记录";
    $("tf-all").hidden = !r.from && !r.to;
  }

  // ---------- 每日入库 calendar (contribution-graph style) ----------
  function monIdx(key) { return (new Date(dayNum(key) * DAY).getUTCDay() + 6) % 7; }   // Mon=0 … Sun=6

  function buildCalendar(dom) {
    var end = dom.max;
    var start = dayNum(dom.min) < dayNum(end) - 364 ? dom.min : addDays(end, -364);   // at least a year
    start = addDays(start, -monIdx(start));
    var key = start + "|" + end;
    if (state.calKey === key) return;
    state.calKey = key;
    var days = dayNum(end) - dayNum(start) + 1, weeks = Math.ceil(days / 7), html = [], lastLabel = -9;
    for (var w = 0; w < weeks; w++) {
      // label a column when its week contains the 1st of a month (or it's the first column)
      for (var d = 0; d < 7; d++) {
        var k = addDays(start, w * 7 + d), dm = +k.slice(8, 10);
        if ((dm === 1 || w === 0) && w - lastLabel >= 3 && dayNum(k) <= dayNum(end)) {
          var mo = +k.slice(5, 7);
          html.push('<span class="m" style="grid-column:' + (w + 2) + ' / span 3">' + (mo === 1 ? k.slice(0, 4) : mo + "月") + "</span>");
          lastLabel = w; break;
        }
      }
    }
    ["一", "", "三", "", "五", "", ""].forEach(function (t, d) { if (t) html.push('<span class="wd" style="grid-row:' + (d + 2) + '">' + t + "</span>"); });
    for (var i = 0; i < days; i++) {
      html.push('<i class="c" data-k="' + addDays(start, i) + '" style="grid-column:' + (Math.floor(i / 7) + 2) + ";grid-row:" + (i % 7 + 2) + '"></i>');
    }
    $("cal").innerHTML = html.join("");
    state.calScrolled = false;
    scrollCalendarToEnd();
  }

  function scrollCalendarToEnd() {
    var sc = $("cal-scroll");
    if (state.calScrolled || !sc.clientWidth) return;   // hidden views have no width yet
    sc.scrollLeft = sc.scrollWidth;
    state.calScrolled = true;
  }

  function updateCalendar(dom, counts, peak, lo, hi) {
    buildCalendar(dom);
    var from = addDays(dom.min, lo), to = addDays(dom.min, hi), total = 0;
    var ranged = lo > 0 || hi < dom.n;
    $("cal").classList.toggle("ranged", ranged);
    $("cal").querySelectorAll(".c").forEach(function (el) {
      var k = el.dataset.k, inDom = k >= dom.min && k <= dom.max;
      var c = inDom ? counts[idxOf(k, dom)] : 0;
      var lv = !c ? 0 : Math.min(4, Math.ceil(c / (peak || 1) * 4));
      total += c;
      el.className = "c l" + lv + (inDom ? "" : " out") + (k >= from && k <= to ? " sel" : "");
      el.title = md(k) + " · " + c + " 条";
    });
    $("daily-max").textContent = total ? "共 " + total + " 条 · 单日最多 " + peak : "暂无记录";
  }

  function bindCalendar() {
    var cal = $("cal"), sc = $("cal-scroll"), drag = null;
    function cellAt(x, y) { var el = document.elementFromPoint(x, y); return el && el.closest ? el.closest("#cal .c") : null; }
    function preview(a, b) {
      var lo = a < b ? a : b, hi = a < b ? b : a;
      cal.querySelectorAll(".c").forEach(function (el) { var k = el.dataset.k; el.classList.toggle("pv", k >= lo && k <= hi); });
      $("daily-max").textContent = lo === hi ? md(lo) : md(lo) + " – " + md(hi);
    }
    // Mouse: drag selects right away. Touch/pen: a swipe scrolls the calendar;
    // press and hold (~350ms) to start selecting, a quick tap selects that day.
    var HOLD_MS = 350, pending = null;
    function startDrag(k, pointerId) {
      drag = { a: k, b: k };
      cal.classList.add("dragging");
      try { cal.setPointerCapture(pointerId); } catch (err) { /* pointer already released */ }
      preview(k, k);
    }
    function clearPending() { if (pending) { clearTimeout(pending.timer); pending = null; } }
    cal.addEventListener("pointerdown", function (e) {
      var c = e.target.closest(".c");
      if (!c || e.button > 0) return;
      if (e.pointerType === "mouse") { e.preventDefault(); startDrag(c.dataset.k, e.pointerId); return; }
      clearPending();
      pending = { k: c.dataset.k, x: e.clientX, y: e.clientY, id: e.pointerId, t: Date.now() };
      pending.timer = setTimeout(function () {
        var p = pending; pending = null;
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* not allowed */ } }
        startDrag(p.k, p.id);
      }, HOLD_MS);
    });
    // once a touch selection is active, keep the browser from scrolling
    cal.addEventListener("touchmove", function (e) { if (drag) e.preventDefault(); }, { passive: false });
    cal.addEventListener("contextmenu", function (e) { if (drag || pending) e.preventDefault(); });
    cal.addEventListener("pointermove", function (e) {
      if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 8) clearPending();   // it's a swipe
      if (!drag) return;
      // nudge the scroll when dragging near either edge of the card
      var r = sc.getBoundingClientRect();
      if (e.clientX > r.right - 24) sc.scrollLeft += 12; else if (e.clientX < r.left + 36) sc.scrollLeft -= 12;
      var c = cellAt(e.clientX, Math.min(Math.max(e.clientY, r.top + 16), r.bottom - 8));
      if (c && c.dataset.k !== drag.b) { drag.b = c.dataset.k; preview(drag.a, drag.b); }
    });
    function finish() {
      if (!drag) return;
      var a = drag.a < drag.b ? drag.a : drag.b, b = drag.a < drag.b ? drag.b : drag.a;
      drag = null;
      cal.classList.remove("dragging");
      cal.querySelectorAll(".pv").forEach(function (el) { el.classList.remove("pv"); });
      // snap the selection into the valid range (first record … today)
      var dom = timeDomain();
      if (b < dom.min) a = b = dom.min;
      else if (a > dom.max) a = b = dom.max;
      else { if (a < dom.min) a = dom.min; if (b > dom.max) b = dom.max; }
      setRange(idxOf(a, dom), idxOf(b, dom));
    }
    cal.addEventListener("pointerup", function () {
      if (pending) {   // quick tap without moving: select that single day
        var k = pending.k; clearPending();
        drag = { a: k, b: k };
      }
      finish();
    });
    cal.addEventListener("pointercancel", function () { clearPending(); finish(); });
    // vertical wheel scrolls the calendar sideways
    sc.addEventListener("wheel", function (e) {
      if (sc.scrollWidth > sc.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  function setRange(lo, hi) {
    var dom = timeDomain();
    lo = Math.max(0, Math.min(dom.n, lo)); hi = Math.max(0, Math.min(dom.n, hi));
    state.range.from = lo > 0 ? addDays(dom.min, lo) : null;
    state.range.to = hi < dom.n ? addDays(dom.min, hi) : null;
    renderTimeFilter();
    scheduleGraph();
  }

  var graphFrame = 0;
  function scheduleGraph() {
    if (graphFrame) return;
    graphFrame = requestAnimationFrame(function () {
      graphFrame = 0;
      if (state.view === "graph") renderGraph();
      else $("n-graph").textContent = graphData().nodes.filter(function (n) { return n.kind !== "tag"; }).length;
    });
  }

  function bindTimeFilter() {
    var loEl = $("tf-lo"), hiEl = $("tf-hi");
    // slider values are bin edges; a range always covers at least one whole day
    loEl.addEventListener("input", function () {
      var loEdge = Math.min(+loEl.value, +hiEl.value - 1);
      setRange(loEdge, +hiEl.value - 1);
    });
    hiEl.addEventListener("input", function () {
      var hiEdge = Math.max(+hiEl.value, +loEl.value + 1);
      setRange(+loEl.value, hiEdge - 1);
    });
    $("tf-from").addEventListener("change", function (e) {
      var dom = timeDomain(), hi = +hiEl.value - 1;
      var lo = e.target.value ? idxOf(e.target.value, dom) : 0;
      setRange(lo, Math.max(lo, hi));            // pushing the start past the end drags the end along
    });
    $("tf-to").addEventListener("change", function (e) {
      var dom = timeDomain(), lo = +loEl.value;
      var hi = e.target.value ? idxOf(e.target.value, dom) : dom.n;
      setRange(Math.min(lo, hi), hi);
    });
    bindCalendar();
    $("tf-all").addEventListener("click", function () { state.range.from = state.range.to = null; renderTimeFilter(); scheduleGraph(); });
  }

  function renderLegend() {
    var items = [
      ['<circle cx="6" cy="6" r="5" style="fill:var(--t-info)"/>', "信息流"],
      ['<circle cx="6" cy="6" r="5" style="fill:var(--t-idea)"/>', "灵感"],
      ['<circle cx="6" cy="6" r="5" style="fill:var(--t-decision)"/>', "决策"],
      ['<circle cx="6" cy="6" r="6" style="fill:var(--c-purple)"/>', "追踪主题"],
      ['<rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" style="fill:var(--c-blue)"/>', "日程事件"],
      ['<path d="M0 6H18" style="stroke:var(--accent);stroke-width:1.6"/>', "衍生"],
      ['<path d="M0 6H18" style="stroke:var(--c-orange);stroke-width:1.4;stroke-dasharray:4 3"/>', "相关计划"],
      ['<path d="M0 6H18" style="stroke:var(--c-purple);stroke-width:1.4"/>', "所属主题"]
    ];
    $("g-legend").innerHTML = items.map(function (i) { return '<span><svg viewBox="0 0 18 12">' + i[0] + "</svg>" + i[1] + "</span>"; }).join("");
  }

  // ---------- events ----------
  function renderEvents() {
    // dated events first (chronological), undated ones at the end
    var th = themes().filter(planMatches), ev = events().filter(planMatches).sort(function (a, b) { return !a.date ? 1 : !b.date ? -1 : a.date < b.date ? -1 : 1; });
    $("n-events").textContent = th.length + ev.length;
    var html = '<div class="ev-grid">';
    html += '<div><p class="sec-t">时间轴 <em>今天 → ' + (function () { var d = ev.filter(function (e) { return e.date; }), l = d[d.length - 1]; return l ? md(l.dateEnd || l.date) : ""; })() + "</em><span class=\"tl-hint\" id=\"tl-hint\" hidden>左右拖动查看</span></p><div class=\"tl-wrap\" id=\"tl\"></div></div>";
    html += "<div><p class=\"sec-t\">追踪主题 <em>" + th.length + "</em></p>" + '<div class="theme-list">' + th.map(themeCard).join("") + "</div></div>";
    html += '<div><p class="sec-t">日程事件 <em>' + ev.length + '</em></p><div class="ev-list">' + ev.map(evRow).join("") + "</div></div>";
    var reviews = state.data.plans.filter(function (p) { return p.kind === "复盘"; });
    if (reviews.length) {
      html += '<div><p class="sec-t">复盘记录 <em>' + reviews.length + '</em></p><div class="reviews">' + reviews.map(function (r) {
        return '<div class="review" data-id="' + r.id + '" tabindex="0" style="cursor:pointer"><b>' + esc(r.name) + "</b><span>" + esc(r.status) + " · " + rel(r.date) + "</span></div>";
      }).join("") + "</div></div>";
    }
    $("v-events").innerHTML = html + "</div>";
    renderTimeline();
  }

  // The timeline is drawn 1:1 in pixels (≥ 7px per day) so text never gets scaled down;
  // when it's wider than the card it scrolls sideways (finger swipe, or mouse drag).
  function renderTimeline() {
    var el = $("tl");
    if (!el || !el.clientWidth) return;              // hidden view: render when shown
    var cs = getComputedStyle(el);
    var avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    el.innerHTML = timeline(avail);
    var svg = el.querySelector("svg");
    $("tl-hint").hidden = el.scrollWidth <= el.clientWidth + 1;
    if (svg) el.scrollLeft = Math.max(0, +svg.getAttribute("data-today-x") - 48);
  }

  function bindTimelinePan() {
    var pan = null, el = function () { return $("tl"); };
    document.addEventListener("pointerdown", function (e) {
      var t = el();
      if (e.pointerType !== "mouse" || e.button > 0 || !t || !t.contains(e.target) || t.scrollWidth <= t.clientWidth) return;
      pan = { x: e.clientX, sl: t.scrollLeft, moved: false };
    });
    document.addEventListener("pointermove", function (e) {
      if (!pan) return;
      var dx = e.clientX - pan.x, t = el();
      if (!pan.moved && Math.abs(dx) > 4) { pan.moved = true; t.classList.add("panning"); }
      if (pan.moved) t.scrollLeft = pan.sl - dx;
    });
    document.addEventListener("pointerup", function () {
      if (!pan) return;
      var moved = pan.moved; pan = null;
      if (el()) el().classList.remove("panning");
      // a drag shouldn't also count as a click on an item
      if (moved) document.addEventListener("click", function stop(ev) { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener("click", stop, true); }, true);
    });
  }

  function themeCard(t) {
    var evs = t.events.map(function (id) { return state.byId[id]; }).filter(Boolean);
    return '<article class="theme-card" data-id="' + t.id + '" tabindex="0">' +
      '<div class="theme-head"><h3>' + esc(t.name) + '</h3><span class="when">' + pill(t.status) + " · 下次复查 " + (t.date ? md(t.date) + "（" + rel(t.date) + "）" : "未设") + "</span></div>" +
      (t.hypothesis ? '<p class="hyp"><b>假设</b>' + esc(t.hypothesis) + "</p>" : "") +
      // only render the signals row when there is something in it; a single signal spans the full width
      (t.confirm || t.refute ? '<div class="signals' + (t.confirm && t.refute ? "" : " one") + '">' +
        (t.confirm ? '<div class="signal" style="--sc:var(--c-green)"><b>证实信号</b><p>' + esc(t.confirm) + "</p></div>" : "") +
        (t.refute ? '<div class="signal" style="--sc:var(--c-red)"><b>推翻信号</b><p>' + esc(t.refute) + "</p></div>" : "") +
        "</div>" : "") +
      '<div class="rels theme-foot">' + tagsHtml(t.tags) + "<span>" + ICON_PLAN + evs.length + " 个检验事件</span><span>" + ICON_DERIVE + t.records.length + " 条相关记录</span></div>" +
      "</article>";
  }

  function evRow(e) {
    var theme = state.byId[e.theme[0]];
    var flags = [];
    if (e.status === "待发生") {
      if (!e.date) flags.push('<span class="flag warn">日期未定</span>');
      else if (!e.expectation) flags.push('<span class="flag warn">预期未写 · 提醒 ' + mdShort(addDays(e.date, -2)) + "</span>");
      else flags.push('<span class="flag">已写预期</span>');
    }
    if (e.result) flags.push('<span class="flag">已补结果</span>');
    return '<div class="ev-row" data-id="' + e.id + '" tabindex="0">' +
      '<div class="ev-date"><b>' + mdShort(e.date) + "</b><span>" + (e.dateEnd ? "至 " + mdShort(e.dateEnd) : e.time ? e.time : e.date ? e.date.slice(0, 4) : "") + "</span></div>" +
      '<div class="ev-main"><b>' + esc(e.name) + "</b><small>" + (theme ? "所属主题：" + esc(theme.name) : "未挂主题") + "</small></div>" +
      '<div class="ev-flags">' + flags.join("") + pill(e.status) + (e.status === "待发生" ? '<span class="cd">' + rel(e.date) + "</span>" : "") + "</div></div>";
  }

  function timeline(avail) {
    var items = [];
    themes().filter(planMatches).forEach(function (t) { if (t.date) items.push({ id: t.id, date: t.date, end: null, name: "复查 · " + t.name, color: "var(--c-purple)", shape: "circle" }); });
    filtered().forEach(function (r) { if (r.type === "决策" && r.reviewDate) items.push({ id: r.id, date: r.reviewDate, end: null, name: "决策回看 · " + r.title, color: "var(--t-decision)", shape: "circle" }); });
    events().filter(planMatches).forEach(function (e) { if (e.date) items.push({ id: e.id, date: e.date, end: e.dateEnd, name: e.name, color: "var(--c-blue)", shape: "diamond", rem: e.status === "待发生" ? [addDays(e.date, -2), addDays(e.dateEnd || e.date, 1)] : null, noExp: !e.expectation }); });
    state.data.plans.filter(planMatches).forEach(function (p) { if (p.kind === "复盘" && p.date) items.push({ id: p.id, date: p.date, end: null, name: p.name, color: "var(--c-gray)", shape: "circle" }); });
    items.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!items.length) return '<p class="empty">没有符合条件的主题或事件。</p>';

    var today = todayKey();
    var all = items.reduce(function (acc, i) { acc.push(i.date); if (i.end) acc.push(i.end); if (i.rem) acc.push(i.rem[0], i.rem[1]); return acc; }, [today]);
    var minD = dayNum(all.reduce(function (a, b) { return a < b ? a : b; })) - 4;
    var maxD = dayNum(all.reduce(function (a, b) { return a > b ? a : b; })) + 6;
    var L = 20, R = 20, top = 34, row = 36, H = top + items.length * row + 14;
    var W = Math.max(Math.floor(avail || 1000), Math.round((maxD - minD) * 7) + L + R);
    var x = function (key) { return L + (dayNum(key) - minD) / (maxD - minD) * (W - L - R); };
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" data-today-x="' + Math.round(x(todayKey())) + '" role="img" aria-label="主题复查、决策回看与日程事件的时间轴">';
    // month ticks
    var d0 = new Date(minD * DAY), m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
    while (m.getTime() / DAY <= maxD) {
      var key = m.toISOString().slice(0, 10), mx = x(key);
      s += '<g class="tl-month"><line x1="' + mx + '" x2="' + mx + '" y1="' + (top - 10) + '" y2="' + (H - 6) + '"/></g>';
      s += '<g class="tl-axis"><text x="' + (mx + 4) + '" y="14">' + (m.getUTCMonth() === 0 ? m.getUTCFullYear() + "." : "") + (m.getUTCMonth() + 1) + "月</text></g>";
      m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    }
    var tx = x(today);
    s += '<g class="tl-today"><line x1="' + tx + '" x2="' + tx + '" y1="' + (top - 16) + '" y2="' + (H - 6) + '"/><text x="' + (tx + 5) + '" y="' + (top - 6) + '">今天</text></g>';
    items.forEach(function (it, i) {
      var y = top + i * row + row / 2, cx = x(it.date);
      s += '<g class="tl-item" data-id="' + it.id + '" tabindex="0">';
      s += '<rect class="tl-hit" x="0" y="' + (y - row / 2) + '" width="' + W + '" height="' + row + '" rx="6"/>';   // whole row is tappable
      if (it.rem) {
        var a = x(it.rem[0]), b = x(it.rem[1]);
        s += '<line class="tl-rem-line" x1="' + a + '" x2="' + b + '" y1="' + y + '" y2="' + y + '"/>';
        s += '<rect class="tl-rem" x="' + (a - 3) + '" y="' + (y - 3) + '" width="6" height="6"><title>写预期提醒 ' + it.rem[0] + "</title></rect>";
        s += '<rect class="tl-rem" x="' + (b - 3) + '" y="' + (y - 3) + '" width="6" height="6"><title>补结果提醒 ' + it.rem[1] + "</title></rect>";
      }
      if (it.end) {
        var ex = x(it.end);
        s += '<rect x="' + (cx - 5) + '" y="' + (y - 5) + '" width="' + (ex - cx + 10) + '" height="10" rx="5" style="fill:' + it.color + '"/>';
      } else if (it.shape === "diamond") {
        s += '<rect x="' + (cx - 5) + '" y="' + (y - 5) + '" width="10" height="10" transform="rotate(45 ' + cx + " " + y + ')" style="fill:' + it.color + '"/>';
      } else {
        s += '<circle cx="' + cx + '" cy="' + y + '" r="5.5" style="fill:' + it.color + '"/>';
      }
      var lo = it.rem ? x(it.rem[0]) : cx, hi = it.rem ? x(it.rem[1]) : it.end ? x(it.end) : cx;
      // put the label on whichever side it fits (rough width: 12.5px per CJK char)
      var labelW = Math.min(26, it.name.length) * 12.5 + 8;
      var right = hi + 14 + labelW <= W - 4 || lo - 14 - labelW < 4;
      var lx = right ? hi + 14 : lo - 14;
      var anchor = right ? "start" : "end";
      s += '<text x="' + lx + '" y="' + (y - 1) + '" text-anchor="' + anchor + '">' + esc(trunc(it.name, 26)) + "</text>";
      s += '<text class="sub" x="' + lx + '" y="' + (y + 12) + '" text-anchor="' + anchor + '">' + mdShort(it.date) + (it.end ? "–" + mdShort(it.end) : "") + " · " + rel(it.date) + (it.noExp && it.rem ? " · 预期未写" : "") + "</text>";
      s += "</g>";
    });
    return s + "</svg>";
  }

  // ---------- drawer ----------
  function field(label, val) { return val ? "<div><dt>" + label + "</dt><dd>" + val + "</dd></div>" : ""; }
  function linkBtn(id) {
    var o = state.byId[id]; if (!o) return "";
    var color = o._kind === "record" ? TYPE_COLOR[o.type] : o.kind === "追踪主题" ? "var(--c-purple)" : "var(--c-blue)";
    var name = o._kind === "record" ? o.title : o.name;
    var sub = o._kind === "record" ? o.type : o.kind;
    return '<button class="d-link" type="button" data-id="' + id + '" style="--tc:' + color + '"><i></i>' + esc(name) + "<small>" + esc(sub) + "</small></button>";
  }
  function linkGroup(label, ids) { return ids && ids.length ? '<div><p class="sec-t">' + label + '</p><div class="d-links">' + ids.map(linkBtn).join("") + "</div></div>" : ""; }

  function openDetail(id) {
    var o = state.byId[id]; if (!o) return;
    var h;
    if (o._kind === "record") {
      h = '<div class="d-kicker"><span class="tbadge" style="--tc:' + TYPE_COLOR[o.type] + '">' + esc(o.type) + "</span>" + pill(o.status) + '<span class="mono">' + sgDay(o.created) + " " + fmtTime.format(new Date(o.created)) + "</span></div>" +
        '<h2 class="d-title">' + esc(o.title) + "</h2>" +
        (o.summary ? '<p class="d-quote" style="--tc:' + TYPE_COLOR[o.type] + '">' + esc(o.summary) + "</p>" : '<p class="d-quote">小结待复盘时补。</p>') +
        '<dl class="d-fields">' +
        field("下一步", esc(o.next)) + field("来源", esc(o.source)) + field("主题标签", tagsHtml(o.tags)) +
        field("动作", esc(o.action)) + field("标的", esc(o.target)) +
        field("回看日", o.reviewDate ? md(o.reviewDate) + "（" + rel(o.reviewDate) + "）" : "") + field("判定", esc(o.verdict)) +
        field("最后更新", sgDay(o.updated) + " " + fmtTime.format(new Date(o.updated))) + "</dl>" +
        linkGroup("衍生自", o.derivedFrom) + linkGroup("衍生出", o.derivedTo) + linkGroup("相关计划", o.plans) +
        '<div class="d-actions">' + (o.link ? '<a class="btn" href="' + esc(o.link) + '" target="_blank" rel="noopener">打开原文 ↗</a>' : "") +
        '<a class="btn ghost" href="' + notionUrl(o.id) + '" target="_blank" rel="noopener">在 Notion 中打开 ↗</a></div>';
    } else {
      var isEv = o.kind === "日程事件";
      h = '<div class="d-kicker"><span class="tbadge" style="--tc:' + (o.kind === "追踪主题" ? "var(--c-purple)" : "var(--c-blue)") + '">' + esc(o.kind) + "</span>" + pill(o.status) +
        (o.date ? '<span class="mono">' + o.date + (o.dateEnd ? " → " + o.dateEnd : "") + "</span>" : "") + "</div>" +
        '<h2 class="d-title">' + esc(o.name) + "</h2>" +
        (o.hypothesis ? '<p class="d-quote" style="--tc:var(--c-purple)">' + esc(o.hypothesis) + "</p>" : "") +
        '<dl class="d-fields">' +
        field(o.kind === "追踪主题" ? "下次复查" : "日期", o.date ? md(o.date) + (o.time ? " " + o.time + "（新加坡时间）" : "") + (o.dateEnd ? " – " + md(o.dateEnd) : "") + " · " + rel(o.date) : "") +
        field("证实信号", esc(o.confirm)) + field("推翻信号", esc(o.refute)) +
        (isEv ? field("预期", o.expectation ? esc(o.expectation) : '<span class="flag warn">未写</span>') : "") +
        (isEv ? field("结果", o.result ? esc(o.result) : "—") : "") +
        (isEv && o.status === "待发生" && o.date ? field("提醒", "写预期 " + md(addDays(o.date, -2)) + " 09:00 · 补结果 " + md(addDays(o.dateEnd || o.date, 1)) + " 09:00（新加坡）") : "") +
        field("判定", esc(o.verdict)) + field("主题标签", o.tags.length ? tagsHtml(o.tags) : "") + "</dl>" +
        linkGroup("所属主题", o.theme) + linkGroup("检验事件", o.events) + linkGroup("相关记录", o.records) +
        '<div class="d-actions"><a class="btn ghost" href="' + notionUrl(o.id) + '" target="_blank" rel="noopener">在 Notion 中打开 ↗</a></div>';
    }
    $("d-body").innerHTML = h;
    $("drawer").hidden = false; $("scrim").hidden = false;
    $("drawer").scrollTop = 0;
    $("d-close").focus();
  }
  function closeDetail() { $("drawer").hidden = true; $("scrim").hidden = true; }

  // ---------- routing & events ----------
  function setView(v) {
    if (["feed", "graph", "events"].indexOf(v) < 0) v = "feed";
    state.view = v;
    document.querySelectorAll(".views a").forEach(function (a) { if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    ["feed", "graph", "events"].forEach(function (k) { $("v-" + k).hidden = k !== v; });
    if (v === "graph") { renderGraph(); scrollCalendarToEnd(); }
    if (v === "events") renderTimeline();
  }

  function rerender() {
    renderFilters(); renderFeed(); renderTimeFilter(); renderEvents();
    if (state.view === "graph") renderGraph(); else $("n-graph").textContent = graphData().nodes.filter(function (n) { return n.kind !== "tag"; }).length;
  }

  function toggleTag(t) { if (state.f.tag.has(t)) state.f.tag.delete(t); else state.f.tag.add(t); rerender(); }

  function bind() {
    $("filters").addEventListener("click", function (e) {
      var b = e.target.closest(".fchip");
      if (b) { var set = state.f[b.dataset.k]; if (set.has(b.dataset.v)) set.delete(b.dataset.v); else set.add(b.dataset.v); rerender(); }
    });
    $("f-reset").addEventListener("click", function () { state.f.type.clear(); state.f.status.clear(); state.f.tag.clear(); rerender(); });
    $("q").addEventListener("input", function (e) { state.q = e.target.value; rerender(); });
    $("g-tags").addEventListener("change", renderGraph);
    $("g-events").addEventListener("change", renderGraph);
    $("g-reset").addEventListener("click", function () { if (state.resetFocus) state.resetFocus(); });
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-id]");
      if (el && !el.closest(".g-node")) openDetail(el.dataset.id);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDetail();
      if (e.key === "Enter") { var el = e.target.closest && e.target.closest("[data-id]"); if (el && !el.classList.contains("d-link")) openDetail(el.dataset.id); }
    });
    $("d-close").addEventListener("click", closeDetail);
    $("scrim").addEventListener("click", closeDetail);
    window.addEventListener("hashchange", function () { setView(location.hash.slice(1)); });
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (state.view === "graph") renderGraph(); if (state.view === "events") renderTimeline(); }, 200); });
  }

  bind();
  bindLogin();
  bindTimeFilter();
  bindTimelinePan();
  load().then(function (data) {
    try {
      state.data = data; index(data);
      renderSource(); renderKPIs(); renderFilters(); renderFeed(); renderLegend(); renderEvents(); renderTimeFilter();
      $("n-graph").textContent = graphData().nodes.filter(function (n) { return n.kind !== "tag"; }).length;
      setView(location.hash.slice(1));
    } catch (err) {
      // data arrived but something in it broke rendering: say so, rather than blaming the connection
      console.error(err);
      $("v-feed").hidden = false;
      $("v-feed").innerHTML = '<div class="empty conn-err"><p><b>已经读到 Notion 数据，但页面显示时出错了。</b></p>' +
        "<p>可能是 Notion 里有页面还不支持的数据格式。把下面这行错误信息发给开发者即可定位。</p>" +
        '<p class="mono">' + esc(err && (err.stack || err.message) || err).split("\n").slice(0, 3).join(" · ") + "</p></div>";
    }
  }, function (e) {
    if (e && e.needLogin) { showLogin(); return; }
    var b = (apiError && apiError.body) || {};
    var detail = [apiError && apiError.status ? "HTTP " + apiError.status : "", b.notionCode || "", b.error || ""].filter(Boolean).join(" · ");
    $("src").querySelector("span").textContent = "未连接 Notion";
    $("v-feed").innerHTML = '<div class="empty conn-err"><p><b>没有连上 Notion。</b></p>' +
      "<p>" + apiErrorHint(apiError) + "</p>" +
      (detail ? '<p class="mono">' + esc(detail) + "</p>" : "") + "</div>";
  });
})();
