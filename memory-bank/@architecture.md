# 项目架构

## 项目是什么

- 名称：无限画布（infinite-canvas），本地化品牌名「蝶讯 AI-D.SD」
- 来源：fork 自开源项目 basketikun/infinite-canvas
  - 自己的仓库（origin）：`https://github.com/lzp2778499669-spec/DSD-AI.git`
  - 上游原版（upstream）：`https://github.com/basketikun/infinite-canvas.git`
  - 当前分支：`main`，当前版本：`v0.20.0`
- 定位：面向图片创作的开源工作台 —— 画布编排 + AI 图片生成 + 参考图编辑 + 对话助手 + 提示词库 + 素材沉淀

## 技术栈

- 前端：Vite 7 + React + React Router + TypeScript + Ant Design + Tailwind + Zustand
- 运行时 / 包管理：bun（本机版本 1.4.4）
- 本地持久化：画布、素材、配置随账号同步到 Supabase（`user_state` + Storage 用户目录）；本地只剩极小的 UI 偏好配置
- 账号体系：Supabase 认证 + 管理员审核（`profiles.access_status`）；API Key 由 `channel-secrets` Edge Function 加密存储
- 后端：无独立后端，浏览器前端直连第三方 AI 接口；被 CORS 拦截时可开启本地代理 `canvas-proxy`（默认 `http://127.0.0.1:23210`）
- 语言：纯 JavaScript / TypeScript（全项目 0 个 .py 文件，无 Python）

## 目录结构

- `web/` — 主前端（Vite + React）。源码在 `web/src/`：
  `components` / `pages` / `stores` / `services` / `lib` / `hooks` / `i18n` / `layouts` / `types` / `constant` / `router.tsx` / `main.tsx`
- `canvas-agent/` — 本地 Canvas Agent，连接画布网页与本机 Codex / Claude Code
- `canvas-proxy/` — 本地转发代理，解决浏览器直连第三方 AI 接口的 CORS 问题，默认监听 `http://127.0.0.1:23210`
- `plugins/` — Codex app 插件（`canvas`、`infinite-canvas`）
- `docs/` — 文档站（Next.js / Fumadocs）
- `AGENTS.md` — AI 编码规范（以它为准）
- `memory-bank/` — 本目录，项目记忆库

## 启动与访问

- 启动：双击仓库根目录 `启动画布.bat`
  - 先 `bun run build`（约 18 秒），再 `bun run start`（即 `vite preview --host 0.0.0.0 --port 3000`）
  - 黑窗口必须保持打开，关闭 = 停止服务
  - 构建产物在 `web/dist/`
- 访问：本机 `http://localhost:3000` ；局域网 `http://192.168.6.62:3000`
- 本地路径：`C:\Users\LINZHANPENG\Documents\默认项目\infinite-canvas`

## 数据流

- 网页（浏览器）→ 直连第三方 AI 接口
- 被 CORS 拦截时 → 请求先发到本机 `canvas-proxy` → 由代理转发到目标地址
- 画布、素材、配置随登录账号同步到 Supabase（`user_state` 表 + Storage 用户目录）；渠道 API Key 经 `channel-secrets` Edge Function 加密存取，浏览器不落明文
