# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/agent-sdk/ packages/agent-sdk/
COPY packages/demo-agent/ packages/demo-agent/

RUN pnpm install --frozen-lockfile --filter @aaas/demo-agent... \
    && pnpm --filter @aaas/demo-agent... build \
    && pnpm --filter @aaas/demo-agent deploy --prod /deploy

# ── Stage 2: Production ──────────────────────────────────────────────────────
# sandbox-base 已包含: node, envd, s6-overlay (仅 envd 服务), user 账号
# app 进程由 dispatcher 通过 SDK commands.run 拉起，不通过 s6
FROM uhub.service.ucloud.cn/wudao/sandbox-base:latest
WORKDIR /app

COPY --from=builder /deploy/node_modules ./node_modules/
COPY --from=builder /deploy/dist ./dist/
COPY --from=builder /deploy/package.json ./
RUN mkdir -p /persistent/shared /persistent/conversation && chmod -R 777 /persistent

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
