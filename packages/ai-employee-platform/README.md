# AI Employee Platform

一个让企业像"雇佣真人员工"一样雇佣、培训、管理 AI 员工的平台。

## 🎯 产品定位

### 核心理念
把 AI 不当工具，当"员工"

- **工具**是"用"，**员工**是"雇"
- 工具按调用次数计费，员工按岗位/产出计费
- 工具有功能，员工有职责、目标、协作关系

### 目标用户
- 100 人以下 SMB & OPC & Pro-C 企业
- 拥抱变化、效率优先的 agent native company

## ✨ 核心功能

### 1. AI 员工构建 (Hire & Onboard)
- 📋 **岗位模板库**: 开箱即用的岗位模板（Support Agent、Data Analyst、Sales SDR 等）
- ✨ **自然语言招聘**: 描述需求，自动生成 agent 配置
- 📝 **岗位说明书**: System Prompt + 职责 + KPI + 协作关系
- 🛠️ **技能装配**: 从技能市场拖拽 MCP 工具
- 🧪 **试岗**: Test Run 预览效果

### 2. AI 员工工作空间 (Workspace)
- 🏢 **运行环境**: 沙箱容器，网络访问策略
- 🔐 **凭证保险箱**: OAuth/API Key 管理
- 🧠 **持久记忆**: 跨会话记住客户、项目、偏好
- 📁 **文件柜**: 文档、知识库、产出物
- 📜 **会话历史**: 工作日志，可回溯、调试

### 3. 协作 (Collaboration)
- 👤 **人 ↔ AI**: Slack/Teams/邮箱触发，人工审批，工作交接
- 🤖 **AI ↔ AI**: 团队协作，工作流编排，自主协作

### 4. 可观测性 (Observability)
- 📊 **业务指标**: 任务量、成功率、响应时长、满意度
- 💰 **成本指标**: Token 消耗、成本归因
- 🔍 **链路追踪**: Session Transcript、工具调用链、错误堆栈

## 🚀 快速开始

### 前置要求
- Node.js >= 22
- npm 或 pnpm

### 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm (推荐)
pnpm install
```

### 配置环境变量

复制 `.env.local.example` 到 `.env.local`:

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 启动开发服务器

```bash
npm run dev
# 或
pnpm dev
```

访问 http://localhost:3070

如果需要更换端口，可以修改 package.json 中的 dev 脚本：
```bash
"dev": "next dev -p 3070"  # 使用 3070 端口
```

## 📁 项目结构

```
ai-employee-platform/
├── src/
│   ├── app/              # Next.js App Router 页面
│   │   ├── (app)/       # 应用布局页面
│   │   │   ├── dashboard/    # 仪表盘
│   │   │   ├── employees/    # 员工列表
│   │   │   ├── hire/         # 招聘页面
│   │   │   ├── workspace/    # 工作空间
│   │   │   └── collaboration/ # 协作
│   │   ├── globals.css       # 全局样式
│   │   ├── layout.tsx        # 根布局
│   │   └── page.tsx          # 首页
│   ├── components/      # React 组件
│   │   └── ui/         # shadcn/ui 组件
│   ├── lib/            # 工具函数和 API 客户端
│   └── types/          # TypeScript 类型定义
├── public/             # 静态资源
└── package.json
```

## 🎨 设计特点

### 视觉风格
- **简约**: 清晰的层次结构，去除不必要的装饰
- **高级感**: 精心设计的配色方案和间距
- **友好**: 直观的用户界面，流畅的交互体验

### 技术栈
- **框架**: Next.js 14 (App Router)
- **样式**: Tailwind CSS
- **组件**: shadcn/ui (如有依赖问题，使用原生组件)
- **语言**: TypeScript

## 🔗 后端集成

本平台设计为与 `z-mono` 后端服务集成：

- **Gateway**: API 网关，处理 LLM、历史记录、文件存储
- **Dispatcher**: IM 接入和消息路由
- **Actions**: 三方服务集成

## 📊 MVP 功能清单

### Phase 1 (当前版本)
- ✅ 岗位模板库（5 个模板）
- ✅ 自然语言描述生成 agent
- ✅ 岗位说明书配置
- ✅ 基础工作空间管理
- ✅ 会话历史查看
- ✅ 基础 Analytics
- ✅ RBAC 权限控制

### Phase 2 (计划中)
- 🔲 持久记忆（Memory Store）
- 🔲 知识库挂载
- 🔲 Human-in-the-loop 审批
- 🔲 员工绩效仪表盘
- 🔲 团队协作功能

### Phase 3 (未来)
- 🔲 AI 团队（Team）协作
- 🔲 工作流编排（SOP Builder）
- 🔲 自学习与微调
- 🔲 SSO / SCIM
- 🔲 A/B 实验框架

## 🛠️ 开发指南

### 添加新页面

1. 在 `src/app/(app)/` 下创建新目录
2. 添加 `page.tsx` 文件
3. 使用 `AppLayout` 包装页面保持导航一致性

```tsx
import AppLayout from "../layout"

export default function NewPage() {
  return (
    <AppLayout>
      {/* 页面内容 */}
    </AppLayout>
  )
}
```

### 添加新 API

在 `src/lib/api.ts` 中添加新的 API 方法：

```typescript
export const myFeatureApi = {
  list: () => api.get('/my-feature'),
  get: (id: string) => api.get(`/my-feature/${id}`),
  create: (data: any) => api.post('/my-feature', data),
}
```

## 📝 注意事项

- 本项目为前端应用，需要配合后端服务使用
- 所有敏感信息（API Key、凭证等）应存储在后端
- 前端只负责展示和用户交互，不处理业务逻辑

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
