#!/bin/bash

echo "🚀 AI Employee Platform - 启动脚本"
echo "================================"
echo ""

cd /Users/zhanghongliang/Documents/ai_emoloyee_platform_2/z-mono/packages/ai-employee-platform

echo "📁 当前目录: $(pwd)"
echo "📦 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "⚠️  未找到依赖，正在安装..."
    pnpm install
fi

echo "🔍 检查端口占用..."
for port in 3000 3001 3060 3070 3090 4010 5173 8080 8888; do
    if lsof -ti:$port > /dev/null 2>&1; then
        echo "⚠️  端口 $port 被占用，正在清理..."
        kill -9 $(lsof -ti:$port) 2>/dev/null
    fi
done

echo "▶️  启动开发服务器..."
echo "🌐 请在浏览器访问: http://localhost:4010"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "================================"
echo ""

pnpm dev
