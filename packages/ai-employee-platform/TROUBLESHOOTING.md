# 🔧 故障排除指南

## 问题：无法访问 http://localhost:3070

### 解决方案 1：杀掉现有进程并重启

在终端运行：

```bash
# 找到占用3070端口的进程
lsof -ti:3070

# 杀掉进程
kill -9 $(lsof -ti:3070)

# 重新启动
cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform
pnpm dev
```

### 解决方案 2：使用启动脚本

```bash
cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform
./dev.sh
```

### 解决方案 3：更换端口

如果3000端口一直有问题，修改 `package.json`：

```json
{
  "scripts": {
    "dev": "next dev -p 3070",
    ...
  }
}
```

然后访问 http://localhost:3070

### 解决方案 4：检查防火墙设置

MacOS可能阻止了端口访问：

1. 打开"系统偏好设置" > "安全性与隐私" > "防火墙"
2. 确保允许Node.js的入站连接
3. 或临时关闭防火墙测试

### 解决方案 5：检查Node.js版本

```bash
node --version  # 应该是 v22 或更高
```

如果版本不对，重新安装：
```bash
# 使用 nvm 安装
nvm install 22
nvm use 22
```

## 其他常见问题

### 依赖安装失败

```bash
# 清理缓存重试
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 端口被占用

```bash
# 查看所有占用端口的进程
lsof -i -P -n | grep LISTEN

# 杀掉指定端口的进程（例如3070）
kill -9 $(lsof -ti:3070)
```

### 浏览器缓存问题

1. 打开开发者工具 (F12)
2. 右键点击刷新按钮
3. 选择"清空缓存并硬性重新加载"

## 仍然无法解决？

请检查：
1. Node.js是否正确安装: `node --version`
2. 依赖是否完整: `ls node_modules`
3. 端口是否被占用: `lsof -i :3000`
4. 防火墙是否阻止连接

## 联系支持

如果问题持续，请提供：
- 完整的错误信息
- `node --version` 输出
- `pnpm --version` 输出
- 终端的完整启动日志
