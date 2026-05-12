# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/actions/ packages/actions/

RUN pnpm install --frozen-lockfile --filter @aaas/actions... \
    && pnpm --filter @aaas/actions build \
    && pnpm --filter @aaas/actions deploy --prod /deploy \
    && cp -R packages/actions/dist /deploy/dist

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2
WORKDIR /app

ARG SOPS_VERSION=3.12.2
ADD https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.amd64 /usr/local/bin/sops
RUN chmod +x /usr/local/bin/sops && sops --version

COPY --from=builder /deploy/node_modules ./node_modules/
COPY --from=builder /deploy/dist ./dist/
COPY --from=builder /deploy/package.json ./
COPY packages/actions/deploy/.env /app.env
COPY packages/actions/deploy/.sops.yaml /.sops.yaml
COPY packages/actions/deploy/tx_dev_run.sh /run.sh

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

ENTRYPOINT ["sh", "-c", "/run.sh"]
