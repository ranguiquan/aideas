# Aideas 信息台

个人信息流看板，数据来自 Notion 的两个数据库：「信息与灵感库」「计划与关注」。

| 路径 | 内容 |
| --- | --- |
| `/#feed` | 信息流：按天分组的记录卡片，可按类型、状态、标签筛选和搜索 |
| `/#graph` | 知识图谱：记录、追踪主题、日程事件、标签之间的关系（衍生、相关计划、所属主题） |
| `/#events` | 主题与事件：时间轴（主题复查、决策回看、事件、写预期/补结果提醒）、假设与信号 |
| `/method` | 方法论：三个技能的规则与生命周期 |

## 数据来源

- `api/data.js`：Vercel Serverless Function，用 Notion API 实时读取两个库（缓存 5 分钟）。
- `public/data/snapshot.json`：本地快照，只用于本地预览，已加入 `.gitignore`，不会提交或部署。
  `/api/data` 不可用时前端会尝试读取它；两者都没有时，页面提示配置 `NOTION_TOKEN`。
  页面左下角显示当前是「实时」「快照」还是「未连接」。

### 开启实时数据

1. 在 https://www.notion.so/profile/integrations 新建一个 Internal Integration，复制 secret。
2. 在 Notion 中打开「信息与灵感库」和「计划与关注」两个数据库 → 右上角 `···` → Connections → 添加这个 integration。
3. 在 Vercel 项目 Settings → Environment Variables 添加 `NOTION_TOKEN`，然后重新部署。
   （可选）`NOTION_INFO_DS` / `NOTION_PLAN_DS` 可覆盖默认的 data source id。

## 部署

仓库根目录即 Vercel 项目根目录：`public/` 是静态输出，`api/` 是函数，无需构建。

```bash
npx vercel        # 预览
npx vercel --prod # 正式
```

本地预览：`npx serve public`（有本地快照时使用快照）。

> 页面会展示 Notion 中的真实记录（包括决策的标的与仓位）。建议保留 Vercel 的 Deployment Protection，只让自己登录后可见。
