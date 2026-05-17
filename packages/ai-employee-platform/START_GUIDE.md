# 快速启动指南

## 🚀 启动应用

在终端中运行以下命令：

```bash
cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform
pnpm dev
```

应用将在 **http://localhost:3070** 启动

## 🌐 访问页面

启动后可以访问以下页面：

- **首页**: http://localhost:3070
- **仪表盘**: http://localhost:3070
- **AI团队**: http://localhost:3070/employees
- **招聘页面**: http://localhost:3070/hire
- **工作空间**: http://localhost:3070/workspace
- **协作页面**: http://localhost:3070/collaboration

## 🔧 如果遇到端口冲突

如果3000端口被占用，可以修改 `package.json` 文件：

```json
"scripts": {
  "dev": "next dev -p 3050",  // 改成你想要的端口
  ...
}
```

然后重新运行 `pnpm dev`

## 📦 项目结构

```
src/
├── app/
│   ├── (app)/          # 应用页面（带侧边栏布局）
│   │   ├── page.tsx              # 仪表盘
│   │   ├── employees/page.tsx    # AI团队管理
│   │   ├── hire/page.tsx         # 招聘页面
│   │   ├── workspace/page.tsx    # 工作空间
│   │   └── collaboration/page.tsx # 协作
│   ├── layout.tsx               # 根布局
│   ├── page.tsx                 # 首页（重定向到仪表盘）
│   └── globals.css              # 全局样式
├── components/ui/      # UI组件库（shadcn/ui）
├── lib/               # 工具函数和API客户端
└── types/             # TypeScript类型定义
```

## ✨ 主要功能

1. **仪表盘**: 查看AI团队的总体表现和最近活动
2. **AI团队**: 管理所有AI员工，查看状态和性能
3. **招聘**: 从模板创建或自定义AI员工
4. **工作空间**: 配置员工环境、凭证和文件
5. **协作**: 管理人机协作任务和工作流

## 🎨 设计特点

- 现代化的紫色主题
- 简洁的侧边栏导航
- 响应式设计
- 流畅的交互动画
- 清晰的数据可视化

## 📝 后续开发

- 连接真实的后端API
- 添加更多员工模板
- 实现会话功能
- 添加权限控制
- 集成第三方服务

---

**提示**: 首次启动可能需要几秒钟来编译，请耐心等待！
