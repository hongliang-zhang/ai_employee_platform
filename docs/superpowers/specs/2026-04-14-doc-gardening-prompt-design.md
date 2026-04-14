# Doc Gardening Prompt 优化设计

**日期：** 2026-04-14  
**状态：** 草稿  
**范围：** `.doc-gardening-prompt.md` 的结构与内容优化

---

## 背景

`.doc-gardening-prompt.md` 是 doc-gardening 自动化流程中 Claude Code 的审查 prompt。当前 prompt 存在两个问题：

1. **覆盖不全**：`docs/RELIABILITY.md`、`docs/SECURITY.md`、`docs/LOCAL-DEV.md`、`docs/exec-plans/tech-debt-tracker.md` 等文档未纳入核查范围
2. **"完成"判定逻辑不明确**：exec plan 归档只看 checkboxes，product spec 状态完全没有检查逻辑 —— 导致已完成的计划仍留在 `active/`，已落地的 spec 仍标记为 Draft

---

## 设计目标

- 用**核查表结构**替代线性任务列表，每个文档明确标注：对比源、核查命令、核查重点
- 为 exec plan 和 product spec 增加**三步"完成"检测**：checkboxes + git log + 文件存在性
- 补全文档覆盖范围
- 明确操作规则中"记录改动"的位置
- 增加运行结束 summary 输出格式

---

## 结构设计

新 prompt 分为四个部分：

```
1. 核查表（Verification Map）
2. 完成状态检测规则（Done Detection Rules）
3. 操作规则
4. 输出格式
```

---

## 1. 核查表

覆盖仓库中所有需要自动核查的文档：

| 文档 | 对比源（真相来源） | 核查重点 |
|------|-----------------|---------|
| `AGENTS.md` | `ls packages/`、`.env.example`、`package.json scripts` | 布局描述、env vars、开发命令 |
| `ARCHITECTURE.md` | `packages/*/src/` 路由文件、`packages/db/prisma/schema.prisma` | API 路由、DB 表列表、服务描述 |
| `docs/generated/db-schema.md` | `packages/db/prisma/schema.prisma` | 每张表、每个字段是否一致 |
| `docs/QUALITY_SCORE.md` | `packages/*/tests/` 下 `*.test.ts` 文件 | 覆盖率评级与测试文件实际存在性 |
| `docs/RELIABILITY.md` | `packages/gateway/src/`、`packages/dispatcher/src/` | 错误码约定、重试逻辑描述 |
| `docs/SECURITY.md` | `ARCHITECTURE.md`、`.env.example` | 安全约束描述是否仍然准确 |
| `docs/LOCAL-DEV.md` | `package.json scripts`、`.env.example` | 本地启动命令是否与实际一致 |
| `docs/product-specs/index.md` | `ls docs/product-specs/` | 是否列出所有 spec 文件 |
| `docs/exec-plans/tech-debt-tracker.md` | `packages/*/src/` | 已解决条目是否应标记完成 |
| `docs/` 所有 `.md` 中的相对链接 | `ls` 被引用路径 | 链接目标是否存在 |

> `docs/LINTING.md`、`docs/design-docs/` 相对稳定，只做链接有效性检查，不做内容核查。

---

## 2. 完成状态检测规则

### 2.1 Exec Plan 归档（三步验证）

对 `docs/exec-plans/active/` 里每个计划：

**关键词提取**：从文件名中去掉日期前缀和扩展名作为搜索关键词。  
例：`2026-04-14-doc-gardening.md` → 关键词 `doc-gardening`

**Step 1 — checkboxes**
```bash
grep "- \[ \]" <plan-file>
# 无输出 → checkboxes 全勾，进入 Step 2/3
# 有输出 → 仍有未完成步骤
```

**Step 2 — git log**
```bash
git log --oneline | grep -i "<feature-keyword>"
# 有匹配行 → 有提交证据
```

**Step 3 — 关键文件存在性**

读 plan 文件中的 `## File Structure` 章节（所有 exec plan 均有此章节，格式为 Markdown 表格），抽取 3-5 个 `Create` 或 `Modify` 类型的核心文件路径，用 `ls` 验证：
```bash
ls <key-file-from-plan>
# 文件存在 → 功能已落地
```

**判定逻辑（优先级从高到低）：**

| 条件 | 结论 |
|------|------|
| Step 1 全勾 AND Step 3 文件存在 | **归档**：移动到 `completed/` |
| Step 1 有未勾选，AND Step 2 有 commits AND Step 3 文件存在 | **归档**：工作已完成但 checkbox 未更新，一并更新后归档 |
| Step 1 全勾，但 Step 3 文件不存在 | **不归档**：加 `<!-- DOC-GARDENING: checkboxes 全勾但 <files> 不存在，需人工确认 -->` |
| Step 1 有未勾选，且 Step 2/3 证据不足 | **不归档** |

> 具体示例：`2026-04-14-gateway-hardening.md` → 关键词 `gateway-hardening`，验证 `git log --oneline | grep -i "gateway-hardening"` 是否有结果，`ls packages/gateway/src/middleware/rateLimit.ts`（从 File Structure 表抽取）是否存在。

### 2.2 Product Spec 状态更新

对 `docs/product-specs/` 下每个 spec（除 `index.md`）：

**关联 exec plan**：
- 从 spec 文件名（去掉扩展名）作为关键词，在 `docs/exec-plans/` 下搜索包含该关键词的文件
- 例：`doc-gardening.md` → 搜索 `docs/exec-plans/**/*doc-gardening*`
- 若无匹配：使用 spec 文件名关键词直接搜索 `git log --oneline | grep -i "<keyword>"`

**状态转移规则：**

| 当前状态 | 条件 | 目标状态 |
|---------|------|---------|
| Draft | 对应 exec plan 存在于 `active/` 且有相关 commits | Active |
| Active | 对应 exec plan 已归档到 `completed/` | Completed |
| Draft 或 Active | 无对应 exec plan，但 git log 有相关 commits 且 spec 中描述的至少一个核心组件文件存在 | Completed |
| 任何状态 | 信号不一致或无法判断 | 不修改，加 `<!-- DOC-GARDENING: -->` 标注 |

---

## 3. 操作规则

- 只修改 `.md` 文件，不修改代码
- 每个被修改的文件，在文件顶部（标题下方）加 HTML 注释块记录改动原因：

```html
<!-- DOC-GARDENING-RUN: YYYY-MM-DD
  - <改了什么>：<为什么改>
-->
```

- 如果发现问题但判定不确定，加 `<!-- DOC-GARDENING: [描述问题] -->` 标注，不做修改
- 先读 `AGENTS.md` 了解项目结构，再开始核查

---

## 4. 输出格式

所有修改完成后，输出结构化 summary 到 stdout（不写入文件）：

```
=== DOC GARDENING SUMMARY ===
[ARCHIVED]   docs/exec-plans/active/2026-04-14-gateway-hardening.md → completed/
             依据：checkboxes 全勾 + packages/gateway/src/middleware/rateLimit.ts 存在
[STATUS]     docs/product-specs/doc-gardening.md: Draft → Active
             依据：对应 exec plan 在 active/ 且有 doc-gardening commits
[FIXED]      ARCHITECTURE.md: 补充 POST /gateway/storage/presign 路由（代码存在但文档缺失）
[NO-CHANGE]  docs/QUALITY_SCORE.md: 测试文件与评级一致，无需修改
[FLAGGED]    docs/exec-plans/active/2026-04-14-doc-gardening.md: checkboxes 全勾但 scripts/doc-gardening/run.ts 不存在，需人工确认
=============================
```

---

## 非目标

- 不修改代码文件
- 不核查 `docs/LINTING.md` 和 `docs/design-docs/` 内容（只检查链接）
- 不自动合并 MR
