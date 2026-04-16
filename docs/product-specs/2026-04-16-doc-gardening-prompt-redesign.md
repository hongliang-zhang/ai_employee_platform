# Doc Gardening Prompt 重设计

**日期：** 2026-04-16  
**状态：** 草稿  
**范围：** `.doc-gardening-prompt.md` 从"步骤驱动"到"目标驱动"的重设计

---

## 背景

当前 `.doc-gardening-prompt.md` 经过 2026-04-14 的重写，解决了覆盖范围不全和完成判定逻辑缺失的问题。但该版本存在更深层的设计问题：**把 agent 当 shell script 用**，而不是发挥 agent 的理解和判断能力。

具体表现：

1. **内容核查是假的**：核查表的"核查重点"只是标签（如"API 路由、DB 表列表"），没有要求 agent 读懂代码、验证文档声明是否成立
2. **exec plan 归档靠猜**：三步验证依赖文件名关键词匹配 git log，commit message 格式稍有不同就失效
3. **spec 状态更新靠文件名匹配**：用 spec 文件名关键词搜索 exec-plans 目录，命名不一致时断掉
4. **判断权被剥夺**：所有情况被判定表格覆盖，agent 遇到表格未覆盖的灰色地带只能无脑跳过

---

## 设计目标

把 prompt 的核心思路从「告诉 agent 怎么做」改为「告诉 agent 要验证什么命题」，让 agent 自己决定如何读取证据、如何判断。

**核心原则：不规定 agent 使用的具体工具或命令，只规定要验证的命题和判断标准。**

---

## 设计

### 1. 核查表：验证目标替代执行步骤

**原来**：核查表"核查重点"列是标签，隐含"对照格式检查"的意思。

**改为**：每行的"验证目标"列明确描述需要验证的命题，格式为：

> 读懂文档的声明 → 读源码 → 判断声明是否成立

示例对比：

| 文档 | 真相来源 | 验证目标（新） |
|------|---------|--------------|
| `ARCHITECTURE.md` | `packages/*/src/` 路由文件、`schema.prisma` | 读文档中每条 API 路由描述和服务说明，在对应源文件中确认路由是否真实存在、描述是否准确；读文档中的 DB 表列表，对照 schema 判断有无增删或字段变化 |
| `docs/LOCAL-DEV.md` | `package.json scripts`、`.env.example` | 读文档中的每条启动命令，在 package.json 中确认命令是否存在且参数一致；读文档中的 env var 列表，对照 .env.example 判断有无缺失或多余 |

**真相来源文件不存在时**：若某行列出的真相来源路径在仓库中不存在（如目录已重组），对该文档标记 flag，注明无法找到对比基准，跳过内容核查。

---

### 2. Exec Plan 归档：理解意图 + 代码验证

**原来**：三步算法（checkboxes → git log 关键词 → ls 文件列表），机械判定。

**改为**：

对 `docs/exec-plans/active/` 里每个计划：

1. **读懂计划**：理解它要实现什么功能、关键交付物是什么
2. **在代码里找落地证据**：直接去 plan 描述的关键文件或功能点检查——文件是否存在、核心逻辑是否实现
3. **做出判断**：基于对计划意图的理解和代码现状，判断这个计划是否已经完成

checkboxes 作为辅助信号，不作为主要判据。

**归档条件**（自然语言，不用判定表格）：

> 如果你读完代码后判断这个计划描述的功能已经落地，就归档。如果证据不足或存在矛盾，不归档，加 flag 说明你观察到了什么、为什么无法判断。

**summary 中的 `依据:` 字段**也应反映 agent 的推理过程，而非机械步骤的输出。例如：

```
[ARCHIVED]   docs/exec-plans/active/2026-04-14-gateway-hardening.md → completed/
             依据：读 plan，目标是在 gateway 加 rate limiting；确认 packages/gateway/src/middleware/
             中存在 rateLimit.ts 且逻辑与 plan 描述一致
```

---

### 3. Product Spec 状态更新：读内容找证据

**原来**：spec 文件名关键词 → 搜索 exec-plans 目录 → 搜索 git log，依赖命名一致性。

**改为**：

对 `docs/product-specs/` 下每个 spec（除 `index.md`）：

1. **读懂 spec**：理解它描述的是什么功能、核心交付物是什么
2. **在代码和 exec-plans 里找证据**：
   - 功能是否已在代码里实现
   - `docs/exec-plans/` 下是否有描述该功能的计划（**读内容来判断，不靠文件名**）
3. **判断状态**：
   - 功能未实现、有 exec plan 在 `active/` → **Active**
   - 功能已在代码里落地，或对应 exec plan 已归档到 `completed/`（含本次 run 中刚归档的）→ **Completed**
   - 功能未实现、也没有对应 exec plan → 不修改，加 flag 说明

**内容匹配示例**：spec `doc-gardening.md` 描述的是"定时审查文档准确性的自动化 agent"；exec plan `2026-04-14-doc-gardening-prompt-rewrite.md` 的内容提到"重写 `.doc-gardening-prompt.md`"——二者描述的是同一功能域，可判定为关联，不依赖文件名中是否都含 `doc-gardening`。

**说明**：本次 run 中通过 Section 2 刚归档到 `completed/` 的 exec plan，在 Section 3 的状态判断中同样有效。

---

### 4. 无法判断时的统一处理协议

适用于核查表、exec plan 归档、spec 状态更新三个场景：

当 agent 读完所有可用证据后仍无法得出有把握的结论时：

- **不做修改**，不强行归档或更新状态
- 在相关文件顶部加 flag 注释：`<!-- DOC-GARDENING-FLAG: [描述你观察到了什么、哪里矛盾、为什么无法判断] -->`
- 在 summary 中用 `[FLAGGED]` 条目记录，说明观察到的信息和无法判断的原因

"无法判断"的典型情形：代码与文档描述部分匹配、真相来源文件不存在、exec plan 意图不明确、spec 功能在代码中只实现了一半。

---

### 5. 操作规则和输出格式（主体保持不变）

- 只修改已存在的 `.md` 文件，不修改代码，不创建新文件
- 每个被修改的文件在顶部加 `<!-- DOC-GARDENING-CHANGE: YYYY-MM-DD ... -->` 注释
- 不确定时加 `<!-- DOC-GARDENING-FLAG: ... -->` 标注，不做修改
- 运行结束输出结构化 summary 到 stdout，`依据:` 字段应反映 agent 实际推理过程

---

## 非目标

- 不修改核查表覆盖的文档范围（沿用 2026-04-14 版本）
- 不修改输出格式的整体结构（`[ARCHIVED]`、`[STATUS]`、`[FIXED]`、`[NO-CHANGE]`、`[FLAGGED]` 分类保持）
- 不修改操作规则中的注释格式
- **不规定 agent 使用的具体命令或工具**（这是本次重设计的核心原则，不属于 agent 自由选择的范围）
