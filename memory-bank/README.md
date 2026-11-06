# memory-bank（项目记忆库）

本目录用于让 AI（opencode / Claude Code / 其他编码助手）跨会话「记住」这个项目，避免每次开工都像失忆一样重新摸一遍。

## AI 使用约定

- 每次开始工作前，**先读取本目录下全部文件**（`@architecture.md`、`@decisions.md`、`@progress.md`），再动手改代码。
- 每完成一个重大功能或里程碑后，**更新对应文件**：
  - 项目结构 / 技术栈变了 → 更新 `@architecture.md`
  - 做了新决策 → 追加到 `@decisions.md`
  - 进度变化 → 更新 `@progress.md`
- 代码怎么写，以仓库根目录的 `AGENTS.md` 为准（本目录不重复它，只负责「架构 / 决策 / 进度」的记忆）。

## 与 AGENTS.md 的分工

| 文件 | 管什么 |
|---|---|
| `AGENTS.md` | 「怎么写代码」的规范（技术栈、目录、UI 风格、发版本流程） |
| `memory-bank/@architecture.md` | 项目现在长什么样（结构、技术栈、数据流、怎么启动） |
| `memory-bank/@decisions.md` | 为什么这么做（关键决策 + 理由 + 日期） |
| `memory-bank/@progress.md` | 接下来干什么（已完成 / 进行中 / 待办） |

## 备注

- 本目录是新增的，未改动 `AGENTS.md`。
- 若希望 AI 自动读取本目录（而不是每次手动提醒），可在 `AGENTS.md` 里加一行指向 `memory-bank/`；当前状态需人工在开工时提醒 AI 先读本目录。
