#!/bin/bash

# AI Employee Platform - Development Startup Script

echo "🚀 Starting AI Employee Platform..."
echo ""

# Kill any existing process on port 3070
echo "🔄 Checking for existing processes on port 3070..."
if lsof -ti:3070 > /dev/null 2>&1; then
    echo "⚠️  Found existing process on port 3070, killing it..."
    kill -9 $(lsof -ti:3070) 2>/dev/null
    sleep 2
fi

# Start the development server
echo "▶️  Starting Next.js development server on port 3070..."
pnpm dev

echo ""
echo "✨ Server stopped"
