# 信息流三拍子

一套基于 Notion 与 Claude Skills 的个人信息流管理机制的展示页：平时只捕获，事件按日程盯，判断集中在复盘。

- `public/index.html`：纯静态单页，无需构建
- `vercel.json`：Vercel 直接以 `public/` 为输出目录

## 部署到 Vercel

**方式一：导入 GitHub 仓库**
1. 打开 https://vercel.com/new ，选择 `ranguiquan/aideas`
2. Framework Preset 选 `Other`，其余保持默认（`vercel.json` 已指定输出目录）
3. Deploy

**方式二：命令行**
```bash
npm i -g vercel
vercel        # 预览部署
vercel --prod # 正式部署
```

## 本地预览
```bash
npx serve public
```
