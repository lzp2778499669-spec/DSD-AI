# 关键决策记录

按时间倒序记录「做了什么决定 + 为什么」，方便以后回溯。

## 2026-11-05

- **修复 `启动画布.bat` 双击无反应**：原因是脚本用了 LF 换行符 + UTF-8，Windows cmd 解析错乱（日志出现「不是内部或外部命令」）。改为 CRLF + GBK 编码（去掉 chcp 65001），实测构建 + 启动正常、3000 端口成功监听。
- **确认无需 Python 虚拟环境**：项目是纯 JS/TS 项目，运行时只有 bun。
- **确认无需 Docker**：本机未安装 Docker（仅下载了安装包，`C:\Program Files\Docker\` 不存在）；启动脚本走 bun，不依赖 docker。

## 2026-11-04

- **fork basketikun/infinite-canvas 并本地化**：改品牌名为「蝶讯 AI-D.SD」，本地克隆到 `C:\Users\LINZHANPENG\Documents\默认项目\infinite-canvas`，自己的仓库为 `DSD-AI`。
- **选用 bun 而非 docker 运行**：本地 docker 不可用；且官方 docker 镜像不含蝶讯定制界面，要跑定制版得走 `docker-compose.local.yml` 自行构建，成本高于直接用 bun。
- **界面定制**：增加蝶讯素材、按键等；版本推进到 `v0.20.0`（见 `CHANGELOG.md`）。

## 待补充

以后每做一次新决策，往这里追加一条，带日期和理由。
