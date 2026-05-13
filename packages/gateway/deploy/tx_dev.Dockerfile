# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/db/ packages/db/
COPY packages/gateway/ packages/gateway/

RUN pnpm install --frozen-lockfile --filter @aaas/gateway... \
    && pnpm --filter @aaas/db generate \
    && pnpm --filter @aaas/db exec tsc -p tsconfig.json --skipLibCheck \
    && cp -R packages/db/src/generated packages/db/dist/generated \
    && pnpm --filter @aaas/gateway... build \
    && pnpm --filter @aaas/gateway deploy --prod /deploy \
    && cp -R dist /deploy/dist \
    && mkdir -p /deploy/node_modules/@aaas/db/dist \
    && cp -R --remove-destination packages/db/dist/. /deploy/node_modules/@aaas/db/dist/ \
    && node -e "const fs=require('fs'); const p='/deploy/node_modules/@aaas/db/package.json'; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.main='dist/index.js'; fs.writeFileSync(p, JSON.stringify(pkg, null, 2));"

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2
WORKDIR /app

ARG SOPS_VERSION=3.12.2
COPY deploy/bin/sops-v${SOPS_VERSION}.linux.amd64 /usr/local/bin/sops
RUN chmod +x /usr/local/bin/sops && sops --version

COPY --from=builder /deploy/node_modules ./node_modules/
COPY --from=builder /deploy/dist ./dist/
COPY --from=builder /deploy/package.json ./
COPY packages/gateway/deploy/.env /app.env
COPY packages/gateway/deploy/.sops.yaml /.sops.yaml
COPY packages/gateway/deploy/tx_dev_run.sh /run.sh

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

ENTRYPOINT ["sh", "-c", "/run.sh"]
