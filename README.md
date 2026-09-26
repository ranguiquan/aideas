# Aideas 信息台

一套基于 Notion 和 Claude 的个人信息流管理机制，以及把它的数据展示出来的网页。

- **三个 Claude 技能**（`.claude/skills/`）：负责把信息记进 Notion、盯日程事件、做复盘。
- **网页**（`public/` + `api/`）：读取 Notion 里的数据，展示信息流、知识图谱、主题与事件。部署在 Vercel 上。

核心思路：平时只管记，事件按提醒跟，所有判断集中到复盘时做。详见网站的 `/method` 页面。

---

## 目录结构

```
.claude/skills/
  notion-info-vault/SKILL.md    记进库里：捕获信息和灵感
  plan-event-tracker/SKILL.md   计划事件：加事件、写预期、补结果
  periodic-review/SKILL.md      复盘：分拣、回看、定主题
public/
  index.html  app.js  styles.css  信息台（信息流 / 知识图谱 / 主题与事件）
  method.html                     方法论页
  data/snapshot.json              本地快照（已 gitignore，不提交）
api/
  data.js                         Vercel Function：实时读取 Notion（需要登录）
  login.js  logout.js             登录 / 退出
  _auth.js                        密码校验和会话 Cookie 签名
vercel.json                       Vercel 配置（输出目录 public/，无需构建）
```

---

## 一、Claude 技能

| 技能 | 什么时候触发 | 做什么 |
| --- | --- | --- |
| `notion-info-vault` | 「记进库里」「存进信息库」「归档这次讨论」 | 先请你用自己的话写一句小结，Claude 补充或反驳，然后写进「信息与灵感库」，状态设为「待处理」 |
| `plan-event-tracker` | 「把下周 CPI 加进计划」「写个预期」「补一下结果」 | 在「计划与关注」里加日程事件，挂到追踪主题，并为每个事件建两个提醒（事件前 2 天写预期、事件后次日补结果） |
| `periodic-review` | 「复盘」「回顾过去两周」，或定时提醒触发 | 汇总上次复盘以来的记录、事件和到期的决策，给出建议；你做决定后更新状态，并写一条复盘记录 |

### 技能依赖

- **Notion 连接器**：读写两个数据库。
- **网络搜索**：核实事件日期和实际结果。
- **定时任务**（`create_trigger`，Claude Code 云端环境提供）：`plan-event-tracker` 用它创建写预期 / 补结果提醒。没有这个能力时，事件照常记录，只是不会自动提醒。

### 安装

- **Claude Code**：在这个仓库里打开 Claude Code，`.claude/skills/` 下的技能会自动加载，不需要额外操作。
- **Claude.ai / 桌面 App**：把某个技能文件夹（例如 `notion-info-vault/`）打成 zip，在 **Settings → Capabilities → Skills** 上传。三个技能分别上传。

### 用在别人的 Notion 里

技能里写的是作者本人的两个 Notion 数据源 ID（`collection://3e627141-…` 和 `collection://d64bfa5d-…`）。换一个工作区使用时：

1. 按下面「Notion 数据库结构」建两个数据库。
2. 在 Notion 里打开数据库，用 Claude 的 Notion 工具获取它的 data source ID（形如 `collection://xxxxxxxx-…`）。
3. 把三个 `SKILL.md` 里出现的两个 ID 全部替换成你自己的。
4. 部署网页时，把环境变量 `NOTION_INFO_DS` / `NOTION_PLAN_DS` 设成这两个 ID（不带 `collection://` 前缀）。

### Notion 数据库结构

**信息与灵感库**

| 字段 | 类型 | 取值 / 说明 |
| --- | --- | --- |
| 标题 | 标题 | |
| 类型 | 单选 | 信息流 / 灵感 / 决策 |
| 状态 | 单选 | 待处理 / 跟进中 / 已归档 / 已放弃 |
| 一句话小结 | 文本 | 用户原话 |
| 下一步 | 文本 | |
| 主题标签 | 多选 | 宏观、行业、公司、策略、灵感、信息管理、AI、认知管理、待归类 |
| 来源 | 文本 | |
| 链接 | 网址 | |
| 衍生自 / 衍生出 | 关联（本库，双向） | |
| 相关计划 | 关联 → 计划与关注 | 对侧字段名「相关记录」 |
| 标的 | 文本 | 决策用 |
| 动作 | 单选 | 买入 / 加仓 / 减仓 / 卖出 / 不操作 |
| 回看日 | 日期 | 决策用 |
| 判定 | 单选 | 理由成立 / 部分成立 / 理由不成立 |

**计划与关注**

| 字段 | 类型 | 取值 / 说明 |
| --- | --- | --- |
| 名称 | 标题 | 复盘记录命名为「复盘 YYYY-MM-DD」 |
| 类型 | 单选 | 追踪主题 / 日程事件 / 复盘 |
| 状态 | 单选 | 进行中 / 待发生 / 已完成 / 已放弃 |
| 日期 | 日期 | 主题填下次复查日，事件填发生日 |
| 主题标签 | 多选 | 与信息库保持一致 |
| 假设 / 证实信号 / 推翻信号 | 文本 | 追踪主题用 |
| 预期 / 结果 | 文本 | 日程事件用 |
| 判定 | 单选 | 证实 / 部分成立 / 推翻 |
| 所属主题 / 检验事件 | 关联（本库，双向） | 事件 ⇄ 主题 |
| 相关记录 | 关联 → 信息与灵感库 | 对侧字段名「相关计划」 |

字段名要和上表一致，网页和技能都按这些名字读取。

---

## 二、网页

| 路径 | 内容 |
| --- | --- |
| `/#feed` | 信息流：按天分组的记录卡片，按类型 / 状态 / 标签筛选和搜索 |
| `/#graph` | 知识图谱：记录、主题、事件、标签的关系图；按入库时间筛选（双滑块、日期框、可拖选的日历联动） |
| `/#events` | 主题与事件：时间轴（主题复查、决策回看、事件、提醒）、假设与信号、事件列表 |
| `/method` | 方法论 |

### 数据来源

- 线上：`api/data.js` 用 Notion API 实时读取两个数据库，每次打开页面都是最新数据，不经过 CDN 缓存。只有登录后才能读取（见下方「访问控制」）。
- 本地：如果存在 `public/data/snapshot.json`，页面会用它（这个文件在 `.gitignore` 里，不会提交）。
- 两者都没有时，页面提示「未连接 Notion」。页面左下角会显示当前数据来源：实时 / 快照 / 未连接。

---

## 三、部署到 Vercel

### 1. 导入仓库

1. 打开 [vercel.com/new](https://vercel.com/new)。如果还没连 GitHub，点 **Continue with GitHub** 授权，至少允许访问这个仓库。
2. 找到 `aideas`，点 **Import**。
3. **Framework Preset** 选 `Other`，Root Directory 保持 `./`，其他设置都不用改（`vercel.json` 已指定输出目录 `public/`，不需要构建）。
4. 点 **Deploy**，得到一个 `xxx.vercel.app` 地址。

Vercel 的正式地址默认从 `main` 分支部署。推到其他分支会生成预览地址。

### 2. 创建 Notion integration

1. 打开 [notion.so/profile/integrations](https://www.notion.so/profile/integrations)，点 **New integration**。
2. 类型选 **Internal**，权限勾 **Read content** 即可（网页只读）。
3. 保存后复制 **Internal Integration Secret**。
4. 在 Notion 里分别打开「信息与灵感库」和「计划与关注」，点右上角 `···` → **Connections** → 添加这个 integration。两个库都要加。

### 3. 配置环境变量

在 Vercel 项目 **Settings → Environment Variables** 添加：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NOTION_TOKEN` | 是 | 上一步复制的 secret |
| `NOTION_INFO_DS` | 否 | 信息与灵感库的 data source ID，不填用作者的默认值 |
| `NOTION_PLAN_DS` | 否 | 计划与关注的 data source ID，不填用作者的默认值 |
| `AUTH_PASSWORD` | 是 | 登录密码，至少 12 位，建议用一句长短语 |
| `AUTH_SECRET` | 是 | 会话签名密钥，至少 32 位随机字符，用 `openssl rand -base64 32` 生成 |

勾选环境时，Production 和 Preview 都要勾，否则预览部署读不到。添加后到 **Deployments**，在最新一次部署右侧点 `···` → **Redeploy**。部署完成后打开页面，输入 `AUTH_PASSWORD` 登录，左下角应显示「实时 · Notion」。

### 4. 访问控制

数据很私密，页面自带单用户登录：

- 打开页面先显示登录框。密码正确后，服务器发一个 30 天有效的会话 Cookie（HttpOnly、Secure、SameSite=Strict，HMAC-SHA256 签名，无法伪造）。
- `/api/data` 没有有效会话一律返回 401，页面的 HTML / JS 里不包含任何数据。
- 没配置 `AUTH_PASSWORD` / `AUTH_SECRET`（或太短）时，数据接口直接拒绝，不会因为漏配而公开。
- 密码错误时服务器固定延迟 1 秒再回复，拖慢暴力猜测。
- 数据接口返回 `Cache-Control: private, no-store`，CDN 和中间代理不会留存副本。
- **让所有设备下线**：修改 `AUTH_PASSWORD` 或 `AUTH_SECRET` 后 Redeploy，所有已有会话立即失效。
- 侧边栏底部有「退出登录」。

方法论页（`/method`）不经过登录，它只包含使用方法，不含 Notion 数据。

可选：Vercel 的 **Settings → Deployment Protection → Vercel Authentication** 还能再给预览地址加一层 Vercel 账号登录（免费版只覆盖预览地址，正式域名要靠上面的密码登录）。

### 命令行部署（可选）

不连 GitHub 也可以部署，但以后每次改动都要手动发布：

```bash
npx vercel login
npx vercel                        # 预览部署，第一次会问几个问题，一路回车
npx vercel env add NOTION_TOKEN   # 粘贴 token，三个环境都选上
npx vercel --prod                 # 发布正式地址
```

### 常见问题

- **左下角显示「未连接 Notion」**：页面会显示具体原因。常见的是 `NOTION_TOKEN` 没勾选当前环境、两个数据库没在 Connections 里加 integration、或改完环境变量后没有 Redeploy。
- **提示「还没有设置访问密码」**：添加 `AUTH_PASSWORD` 和 `AUTH_SECRET` 后 Redeploy。
- **登录后又回到登录框**：Cookie 被浏览器拦截了，确认是通过 `https://` 访问的。
- **页面是空的 / 404**：确认 Framework Preset 是 `Other`，并且部署的分支里有 `public/` 目录。

---

## 本地预览

```bash
npx serve public
```

打开终端里显示的地址。没有 `public/data/snapshot.json` 时，页面显示「未连接 Notion」。本地的 `/api/data` 不会运行；要在本地连 Notion 并测试登录，用 `npx vercel dev`，并在 `.env.local` 里写入 `NOTION_TOKEN`、`AUTH_PASSWORD`、`AUTH_SECRET`（这个文件已被 gitignore）。
