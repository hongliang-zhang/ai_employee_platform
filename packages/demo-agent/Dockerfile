FROM uhub.service.ucloud.cn/wudao/ci-node:22p1 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
# Copy agent-sdk (workspace dependency) and demo-agent
COPY packages/agent-sdk/ packages/agent-sdk/
COPY packages/demo-agent/ packages/demo-agent/

# Install + build only demo-agent and its dependencies
RUN pnpm install --frozen-lockfile --filter @aaas/demo-agent... \
    && pnpm --filter @alexlikevibe/agent-sdk build \
    && pnpm --filter @aaas/demo-agent build

# ── Production image ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node:22p1
WORKDIR /app
COPY --from=builder /app/packages/demo-agent/package.json ./
COPY --from=builder /app/packages/demo-agent/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/agent-sdk/package.json ./packages/agent-sdk/package.json
COPY --from=builder /app/packages/agent-sdk/dist ./packages/agent-sdk/dist/
COPY --from=builder /app/packages/agent-sdk/node_modules ./packages/agent-sdk/node_modules/
RUN mkdir -p node_modules/@alexlikevibe && \
    ln -s ../../packages/agent-sdk node_modules/@alexlikevibe/agent-sdk
RUN mkdir -p /persistent/shared /persistent/conversation && chmod -R 777 /persistent

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/agent.js"]
