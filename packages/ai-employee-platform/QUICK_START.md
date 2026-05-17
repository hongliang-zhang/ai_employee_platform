# 🚀 快速启动指南

## ✅ 最简单的方法

### 1. 打开你的**真实终端**（不是在这个sandbox里）

### 2. 运行启动脚本：

```bash
cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform
./start.sh
```

### 3. 在浏览器访问：
**http://localhost:4010**

---

## 📝 或者手动启动

```bash
# 1. 进入项目目录
cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform

# 2. 清理可能占用的端口
kill -9 $(lsof -ti:4010) 2>/dev/null

# 3. 启动开发服务器
pnpm dev
```

---

## 🌐 主要页面

启动后访问以下页面：

- **仪表盘**: http://localhost:4010
- **AI团队**: http://localhost:4010/employees
- **招聘**: http://localhost:4010/hire
- **工作空间**: http://localhost:4010/workspace
- **协作**: http://localhost:4010/collaboration

---

## ⚠️ 常见问题

### Q: 为什么不能在sandbox里启动？
A: Sandbox环境有网络权限限制，需要在你的真实终端中运行。

### Q: 端口被占用怎么办？
A: 运行 `start.sh` 脚本会自动清理，或者手动：
```bash
kill -9 $(lsof -ti:4010)
```

### Q: 如何更换端口？
A: 编辑 `package.json`，修改端口号：
```json
"dev": "next dev -p 你想要的端口"
```

---

## ✨ 成功启动的标志

当你看到：

```
▲ Next.js 14.2.0
- Local:        http://localhost:4010

✓ Ready in 2.3s
```

说明启动成功！🎉

---

## 🎨 项目特点

- ✅ 现代化紫色主题设计
- ✅ 完整的AI员工管理功能
- ✅ 招聘流程和模板选择
- ✅ 工作空间配置
- ✅ 人机协作管理
- ✅ 响应式布局

**现在请在你的真实终端中运行启动命令！**
