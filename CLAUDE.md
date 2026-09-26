# CLAUDE.md

Aideas 信息台：基于 Notion + Claude 技能的个人信息流系统。仓库里有两部分：

1. **三个 Claude 技能**（`.claude/skills/`）把信息写进 Notion 的两个数据库：「信息与灵感库」「计划与关注」。
2. **网页**（`public/` 静态页 + `api/` Vercel Functions）读取这两个库，展示信息流、知识图谱、主题与事件。部署在 Vercel，`main` 分支 = 正式环境。

用户说中文，界面文案、文档、回复都用中文；代码注释和提交信息用英文。

## 常用命令

```bash
npm run dev        # 本地开发服务器 http://localhost:3000（静态页 + api/，读取 .env.local，改 api 不用重启）
npm test           # node:test，覆盖鉴权和 Notion 数据映射（无依赖，不访问网络）
npm run snapshot   # 把 Notion 数据拉到 public/data/snapshot.json（已 gitignore，含私密数据，绝不提交）
```

没有 npm 依赖，也没有构建步骤。需要 Node ≥ 18（用到全局 `fetch`）。

## 本地环境

- 复制 `.env.example` 为 `.env.local`，填 `NOTION_TOKEN`、`AUTH_PASSWORD`（≥12 位）、`AUTH_SECRET`（≥32 位）。不要读取或打印 `.env.local` 的内容。
- 登录用 `AUTH_PASSWORD`。会话 Cookie 带 `Secure` 和 `__Host-` 前缀：Chrome / Edge / Firefox 在 `localhost` 上允许，Safari 可能不行。
- **离线看界面**：先 `npm run snapshot`，再在 `.env.local` 里去掉 `AUTH_*`，这时 `/api/data` 返回 503，页面会退回读取快照。配置了 `AUTH_*` 时，未登录只会看到登录框，不会读快照。

## 结构

```
api/_auth.js        单用户鉴权：AUTH_PASSWORD 常数时间比较 + HMAC 签名的 30 天会话 Cookie（"_" 开头的文件不会成为接口）
api/login.js        POST {password} → Set-Cookie；密码错误固定延迟 1 秒
api/logout.js       POST → 清 Cookie
api/data.js         登录后读取两个 Notion 数据源（API 版本 2025-09-03，/v1/data_sources/{id}/query）；导出 loadAll/toRecord/toPlan
public/index.html   信息台外壳（侧栏、KPI、三个视图、登录框、详情抽屉）
public/app.js       全部前端逻辑，一个 IIFE，ES5 风格（var/function），d3 v7 从 cdnjs 加载
public/styles.css   设计 token + 全部样式；method.html 也用它
public/theme.js     外观切换（系统/明亮/暗黑），放在 <head> 里同步执行以免闪烁
public/method.html  方法论页（不需要登录，不含 Notion 数据）
scripts/dev.js      模拟 Vercel 的本地服务器；scripts/snapshot.js；scripts/env.js（.env 读取）
tests/              node:test 用例 + helpers.js（req/res 替身）
.claude/skills/     notion-info-vault / plan-event-tracker / periodic-review
.mcp.json           Notion MCP（技能读写 Notion 用）
```

## 数据模型

`api/data.js` 和快照都返回 `{ source, generatedAt, records, plans }`：

- `records`（信息与灵感库）：`id` 是去掉短横线的页面 ID；`title type status tags source summary next link derivedFrom derivedTo plans target action reviewDate verdict created updated`。
- `plans`（计划与关注）：`name kind(追踪主题/日程事件/复盘) status tags date dateEnd hypothesis confirm refute expectation result verdict theme events records created`。
- 关联字段都是 ID 数组。Notion 的字段名是中文，映射集中在 `toRecord` / `toPlan`；改字段名要同时改那里、README 的「Notion 数据库结构」和技能里的描述。
- **日期**：Notion 的日期可能带时间（`2026-10-14T20:30:00.000+08:00`）。前端在 `index()` 里统一转成新加坡时间（`Asia/Singapore`）的 `YYYY-MM-DD`，时间另存到 `p.time`。所有日期计算都基于这种 day key，不要直接对原始字符串做 `split("-")`。事件的 `date` 可能为空。

## 隐私与安全（必须遵守）

- 任何 Notion 记录、快照、token、密码都不能进 git。`public/data/snapshot.json`、`.env*` 已在 `.gitignore`。
- `/api/data` 必须保持：未登录返回 401；`AUTH_*` 没配置时拒绝（fail closed）；响应头 `Cache-Control: private, no-store`，不能加 CDN 缓存。
- 日志里只记错误码，不要打印记录内容。
- 发布到公网或分享给别人之前，先确认内容里没有这些私密数据。

## 前端约定和已知坑

- 颜色一律用 `styles.css` 里的 token，浅色和深色都要能用：`:root` 下定义浅色，`@media (prefers-color-scheme: dark)` 和 `:root[data-theme="dark"]` 下定义深色。改完两种主题都要看一遍。
- 用 `el.hidden` 控制显示；全局有 `[hidden]{display:none!important}`，所以自定义了 `display` 的元素也能被隐藏。
- Grid 子元素要设 `min-width:0`，否则宽内容会把手机页面撑宽（时间轴出过这个问题）。
- 页面在 390px 手机宽度下不能出现横向滚动；时间轴和日历在自己的容器里横向滚动。
- 触摸屏：轻点之后浏览器会补发一个 `mouseleave` 事件，所以只有 `lastPointer === "mouse"` 时才靠它关浮窗。图谱节点第一次轻点显示卡片，第二次才打开详情。
- 知识图谱：拖动节点会切到以它为中心的同心圆布局（`focusOn` / `applyFocus`）；名字用 `layoutLabels()` 按优先级避让；缩放时文字和线条保持屏幕尺寸不变。
- 左侧筛选同时作用于记录、主题和事件（`filtered()`、`planMatches()`）；标签后面的数字只统计记录。

## 验证

- 改后端：`npm test`。
- 改前端：`npm run dev` 后在浏览器里分别看电脑宽度和 390px 手机宽度、浅色和深色。本仓库没有装 Playwright，需要截图检查时可以临时安装，不要把它加进 `package.json`。

## 部署与 Git

- 开发在分支上做，开 PR 合并到 `main`。Vercel 会为每个分支生成预览地址，合并到 `main` 后自动发布正式环境。
- 环境变量在 Vercel → Settings → Environment Variables 里配置，Production 和 Preview 都要勾选；改完需要 Redeploy。

## Claude 技能

- 技能通过 Notion MCP 读写数据库。第一次在本地使用时，运行 `/mcp` 完成 Notion 授权。
- `plan-event-tracker` 的写预期 / 补结果提醒依赖 Claude Code 云端的定时任务（`create_trigger`）。本地没有这个能力：事件照常记录，但不会创建提醒，需要提醒时去云端会话里做。
- 技能里写死了两个数据源 ID（`collection://3e627141-…`、`collection://d64bfa5d-…`）。仓库里的技能是账号里技能的一份副本，改了其中一边要同步到另一边。
