# Tencent Cloud Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Docker build, push, and run assets for `gateway` and `dispatcher` so both services can be deployed to Tencent Cloud with encrypted SOPS env files.

**Architecture:** Each service gets an isolated `deploy/` directory containing `Dockerfile`, `build.sh`, `run.sh`, `entrypoint.sh`, encrypted `.env`, and `.sops.yaml`. Docker builds run from the monorepo root, build only the target workspace slice, package production artifacts, copy encrypted env into the image, and decrypt it at container startup. Runtime containers use mounted SOPS age key material via `SOPS_AGE_KEY_FILE`.

**Tech Stack:** Docker, Bash, Node.js 22, pnpm 9, TypeScript, Prisma 7, SOPS/age, Tencent Cloud Container Registry.

---

## Source spec

Implement exactly the approved spec:

- `docs/product-specs/2026-05-08-tencent-cloud-docker-deploy-design.md`

Key decisions from the spec:

- Deployment assets live under `packages/gateway/deploy/` and `packages/dispatcher/deploy/`.
- Script names are `build.sh`, `run.sh`, and `entrypoint.sh`.
- Image names are `agent-runtime-gateway` and `agent-runtime-dispatcher`.
- Push both `<git-short-sha>` and `latest` tags.
- Base image is `uhub.service.ucloud.cn/wudao/ci-node-slim:22p2`.
- Env files are encrypted `deploy/.env` files copied into images as `/app.env`.
- Containers decrypt `/app.env` with `sops -d` at startup.

## File structure

### Existing files to read and preserve

- `packages/demo-agent/Dockerfile` — existing pnpm workspace Docker pattern.
- `packages/demo-agent/deploy.sh` — existing Tencent Cloud image push pattern.
- `/Users/fanfei/monorepo/claude-code-proxy/deploy/prod_tx/Dockerfile` — encrypted env COPY pattern.
- `/Users/fanfei/monorepo/claude-code-proxy/deploy/prod_tx/start_glm_proxy.sh` — SOPS decrypt/export startup pattern.
- `/Users/fanfei/monorepo/claude-code-proxy/deploy/prod_tx/.sops.yaml` — age recipient convention.
- `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma.config.ts`, `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts` — workspace DB packaging constraints.
- `packages/gateway/package.json`, `packages/gateway/tsconfig.json`, `packages/gateway/src/index.ts` — gateway build and entrypoint.
- `packages/dispatcher/package.json`, `packages/dispatcher/tsconfig.json`, `packages/dispatcher/src/index.ts` — dispatcher build and entrypoint.

### Files to create

Gateway deploy assets:

- `packages/gateway/deploy/Dockerfile` — multi-stage Docker build for gateway.
- `packages/gateway/deploy/build.sh` — build and push gateway image to Tencent Cloud registry.
- `packages/gateway/deploy/run.sh` — host-side `docker run` helper for gateway.
- `packages/gateway/deploy/entrypoint.sh` — container-side SOPS decrypt and Node startup.
- `packages/gateway/deploy/.sops.yaml` — SOPS age recipient config.
- `packages/gateway/deploy/.env` — SOPS-encrypted gateway runtime env placeholder or real encrypted env.

Dispatcher deploy assets:

- `packages/dispatcher/deploy/Dockerfile` — multi-stage Docker build for dispatcher.
- `packages/dispatcher/deploy/build.sh` — build and push dispatcher image to Tencent Cloud registry.
- `packages/dispatcher/deploy/run.sh` — host-side `docker run` helper for dispatcher.
- `packages/dispatcher/deploy/entrypoint.sh` — container-side SOPS decrypt and Node startup.
- `packages/dispatcher/deploy/.sops.yaml` — SOPS age recipient config.
- `packages/dispatcher/deploy/.env` — SOPS-encrypted dispatcher runtime env placeholder or real encrypted env.

### Files to modify

- `packages/db/package.json` — add a `build` script if needed for production Docker packaging.
- `packages/db/tsconfig.build.json` — create if needed to compile DB runtime files and include generated Prisma output.
- `packages/gateway/package.json` — add optional `docker:build` / `docker:run` script aliases if desired.
- `packages/dispatcher/package.json` — add optional `docker:build` / `docker:run` script aliases if desired.
- `.gitignore` — add required exceptions so encrypted `packages/*/deploy/.env` files are tracked while root plaintext `.env` remains ignored.
- `.dockerignore` — add required exceptions so encrypted `packages/*/deploy/.env` files are included in Docker build context while root plaintext `.env` remains excluded.

## Implementation notes

### DB packaging decision

Do not assume `@aaas/db` works in production as-is. It currently has:

- `main: "src/index.ts"` in `packages/db/package.json`.
- Generated Prisma output under `packages/db/src/generated`.
- `packages/db/tsconfig.json` excludes `src/generated`.

The Docker build must make `@aaas/db` runnable by plain Node inside `/deploy`. Use this deployment-local strategy unless a simpler verified alternative emerges during implementation:

1. In the Docker builder, run `pnpm --filter @aaas/db generate`.
2. Compile `packages/db/src/index.ts` to `packages/db/dist/index.js`.
3. Copy generated Prisma runtime files from `packages/db/src/generated` to `packages/db/dist/generated`.
4. After `pnpm --filter @aaas/<service> deploy --prod /deploy`, patch `/deploy/node_modules/@aaas/db/package.json` so `main` points to `dist/index.js`.
5. Copy `packages/db/dist` into `/deploy/node_modules/@aaas/db/dist` if `pnpm deploy` did not include it.
6. Verify inside the built image that `node -e "import('@aaas/db').then(() => console.log('ok'))"` succeeds from `/app`.

This avoids changing local dev/test resolution for `@aaas/db` unless tests prove a package-level change is safe.

### Service entrypoint decision

Gateway and dispatcher currently compile `src/index.ts` to `dist/src/index.js` because their package `tsconfig.json` files set `rootDir: "."`. Use `node dist/src/index.js` in `entrypoint.sh` unless implementation changes the build layout and verifies a different emitted path.

### SOPS env decision

The committed `deploy/.env` files must not contain plaintext production secrets. If real values are not available during implementation, create encrypted placeholder files with obvious placeholder values. The placeholder still proves Docker COPY and startup wiring, while deployers can later edit via `sops packages/<service>/deploy/.env`.

---

## Task 1: Allow encrypted deploy env files to be tracked and copied into Docker builds

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`

The root `.gitignore` and `.dockerignore` both ignore every file named `.env`. Because this deployment design intentionally commits SOPS-encrypted `packages/gateway/deploy/.env` and `packages/dispatcher/deploy/.env`, add explicit exceptions before creating those files. The `.gitignore` exceptions make the encrypted env files trackable; the `.dockerignore` exceptions make them available to Dockerfile `COPY` instructions.

- [ ] **Step 1: Add precise `.gitignore` unignore rules**

Modify `.gitignore` in the Environment / local config section:

```gitignore
.env
.env.*
!.env.example
!.env.*.example
!packages/gateway/deploy/.env
!packages/dispatcher/deploy/.env
*.local
```

Do not unignore root `.env`.

- [ ] **Step 2: Add precise `.dockerignore` unignore rules**

Modify `.dockerignore` near the env ignore rules:

```gitignore
.env
.env.*
!.env.example
!packages/gateway/deploy/.env
!packages/dispatcher/deploy/.env
```

Do not unignore root `.env`.

- [ ] **Step 3: Verify the deploy env paths are no longer gitignored**

Run:

```bash
git check-ignore -v packages/gateway/deploy/.env packages/dispatcher/deploy/.env || true
```

Expected: no output for these two paths after the `.gitignore` rules are added.

- [ ] **Step 4: Verify Docker build context can include deploy env files**

Run:

```bash
git check-ignore -v --no-index --exclude-from=.dockerignore packages/gateway/deploy/.env packages/dispatcher/deploy/.env || true
```

Expected: no output for these two paths after the `.dockerignore` rules are added.

- [ ] **Step 5: Commit ignore-file changes**

Run:

```bash
git add .gitignore .dockerignore
git commit -m "chore: allow encrypted deploy env files"
```

Expected: commit succeeds.

---

## Task 2: Add gateway deploy directory and scripts

**Files:**
- Create: `packages/gateway/deploy/Dockerfile`
- Create: `packages/gateway/deploy/build.sh`
- Create: `packages/gateway/deploy/run.sh`
- Create: `packages/gateway/deploy/entrypoint.sh`
- Create: `packages/gateway/deploy/.sops.yaml`
- Create: `packages/gateway/deploy/.env`

- [ ] **Step 1: Create the deploy directory**

Run:

```bash
mkdir -p packages/gateway/deploy
```

Expected: directory exists.

- [ ] **Step 2: Create gateway `.sops.yaml`**

Create `packages/gateway/deploy/.sops.yaml` based on `claude-code-proxy/deploy/prod_tx/.sops.yaml`:

```yaml
creation_rules:
  - path_regex: .*\.env$
    age: age1cdelwv46c27sh9wjq9ywqmqdqdfzt982gpahd8c6a99rjpz2msasxd5swz
    encrypted_regex: '.*'
```

- [ ] **Step 3: Create encrypted gateway `.env` placeholder**

Create a temporary plaintext file outside the repo:

```bash
cat >/tmp/aaas-gateway.env <<'EOF'
DATABASE_URL=mysql://user:password@host:4000/dbname?sslaccept=strict
JWT_SECRET=change-me-32-chars-minimum-secret
LLM_API_KEY=sk-placeholder
ALLOWED_MODELS=glm-5.1
S3_ENDPOINT=https://cos.ap-beijing.myqcloud.com
S3_BUCKET=your-bucket-1256706073
S3_ACCESS_KEY=AKIDplaceholder
S3_SECRET_KEY=placeholder
S3_REGION=ap-beijing
PORT=3001
EOF
```

Encrypt it into the deploy directory:

```bash
SOPS_AGE_RECIPIENTS=age1cdelwv46c27sh9wjq9ywqmqdqdfzt982gpahd8c6a99rjpz2msasxd5swz \
  sops --encrypt /tmp/aaas-gateway.env > packages/gateway/deploy/.env
rm /tmp/aaas-gateway.env
```

Expected: `packages/gateway/deploy/.env` contains `ENC[` values and SOPS metadata, not plaintext secrets.

If `sops` is unavailable, stop and install/configure SOPS before continuing. Do not commit plaintext `.env`.

- [ ] **Step 4: Create gateway `entrypoint.sh`**

Create `packages/gateway/deploy/entrypoint.sh`:

```bash
#!/bin/bash
set -eu

echo "Starting agent-runtime-gateway..."

sops -d /app.env >/tmp/env

set -a
. /tmp/env
set +a

rm /tmp/env

exec node dist/src/index.js
```

- [ ] **Step 5: Create gateway `build.sh`**

Create `packages/gateway/deploy/build.sh`:

```bash
#!/bin/bash
source /etc/profile

set -ex

PROJECT=agent-runtime-gateway
VERSION=$(git rev-parse --short HEAD)
HARBOR=maas-images-register.tencentcloudcr.com
NAMESPACE=wudao
DOCKER_IMAGE=$HARBOR/$NAMESPACE/$PROJECT:$VERSION
DOCKER_IMAGE_LATEST=$HARBOR/$NAMESPACE/$PROJECT:latest
DOCKER_FILE=./packages/gateway/deploy/Dockerfile

echo "当前环境为: dev-tx"
echo "开始构建当次镜像: $DOCKER_IMAGE"
sudo docker build -t "$DOCKER_IMAGE" -f "$DOCKER_FILE" .
echo "构建成功"

echo "开始将镜像push到私服！"
sudo docker push "$DOCKER_IMAGE"
sudo docker tag "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"
sudo docker push "$DOCKER_IMAGE_LATEST"
sudo docker rmi "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"

echo "发布完成！$DOCKER_IMAGE"
```

- [ ] **Step 6: Create gateway `run.sh`**

Create `packages/gateway/deploy/run.sh`:

```bash
#!/bin/bash
source /etc/profile

set -ex

PROJECT=agent-runtime-gateway
CONTAINER_NAME=${CONTAINER_NAME:-agent-runtime-gateway}
HARBOR=${HARBOR:-maas-images-register.tencentcloudcr.com}
NAMESPACE=${NAMESPACE:-wudao}
TAG=${TAG:-latest}
IMAGE=${IMAGE:-$HARBOR/$NAMESPACE/$PROJECT:$TAG}
HOST_PORT=${HOST_PORT:-3001}
CONTAINER_PORT=${CONTAINER_PORT:-3001}
SOPS_AGE_KEY_FILE_ON_HOST=${SOPS_AGE_KEY_FILE_ON_HOST:-/opt/aaas/sops-age-key.txt}
SOPS_AGE_KEY_FILE_IN_CONTAINER=${SOPS_AGE_KEY_FILE_IN_CONTAINER:-/run/secrets/sops-age-key}

echo "Pulling image: $IMAGE"
sudo docker pull "$IMAGE"

if sudo docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  sudo docker stop "$CONTAINER_NAME" || true
  sudo docker rm "$CONTAINER_NAME" || true
fi

sudo docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -v "$SOPS_AGE_KEY_FILE_ON_HOST:$SOPS_AGE_KEY_FILE_IN_CONTAINER:ro" \
  -e SOPS_AGE_KEY_FILE="$SOPS_AGE_KEY_FILE_IN_CONTAINER" \
  "$IMAGE"

sudo docker ps --filter "name=$CONTAINER_NAME"
```

- [ ] **Step 7: Create gateway Dockerfile**

Create `packages/gateway/deploy/Dockerfile`:

```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/db/ packages/db/
COPY packages/gateway/ packages/gateway/

RUN pnpm install --frozen-lockfile --filter @aaas/gateway... \
    && pnpm --filter @aaas/db generate \
    && pnpm --filter @aaas/db exec tsc -p tsconfig.json \
    && cp -R packages/db/src/generated packages/db/dist/generated \
    && pnpm --filter @aaas/gateway... build \
    && pnpm --filter @aaas/gateway deploy --prod /deploy \
    && mkdir -p /deploy/node_modules/@aaas/db/dist \
    && cp -R packages/db/dist/* /deploy/node_modules/@aaas/db/dist/ \
    && node -e "const fs=require('fs'); const p='/deploy/node_modules/@aaas/db/package.json'; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.main='dist/index.js'; fs.writeFileSync(p, JSON.stringify(pkg, null, 2));"

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2
WORKDIR /app

ARG SOPS_VERSION=3.10.2
ADD https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.amd64 /usr/local/bin/sops
RUN chmod +x /usr/local/bin/sops && sops --version

COPY --from=builder /deploy/node_modules ./node_modules/
COPY --from=builder /deploy/dist ./dist/
COPY --from=builder /deploy/package.json ./
COPY packages/gateway/deploy/.env /app.env
COPY packages/gateway/deploy/.sops.yaml /.sops.yaml
COPY packages/gateway/deploy/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

ENTRYPOINT ["sh", "-c", "/app/entrypoint.sh"]
```

- [ ] **Step 8: Make gateway scripts executable**

Run:

```bash
chmod +x packages/gateway/deploy/build.sh packages/gateway/deploy/run.sh packages/gateway/deploy/entrypoint.sh
```

- [ ] **Step 9: Commit gateway deploy assets**

Run:

```bash
git add packages/gateway/deploy
git commit -m "feat(gateway): add docker deploy assets"
```

Expected: commit succeeds.

---

## Task 3: Add dispatcher deploy directory and scripts

**Files:**
- Create: `packages/dispatcher/deploy/Dockerfile`
- Create: `packages/dispatcher/deploy/build.sh`
- Create: `packages/dispatcher/deploy/run.sh`
- Create: `packages/dispatcher/deploy/entrypoint.sh`
- Create: `packages/dispatcher/deploy/.sops.yaml`
- Create: `packages/dispatcher/deploy/.env`

- [ ] **Step 1: Create the deploy directory**

Run:

```bash
mkdir -p packages/dispatcher/deploy
```

Expected: directory exists.

- [ ] **Step 2: Create dispatcher `.sops.yaml`**

Create `packages/dispatcher/deploy/.sops.yaml`:

```yaml
creation_rules:
  - path_regex: .*\.env$
    age: age1cdelwv46c27sh9wjq9ywqmqdqdfzt982gpahd8c6a99rjpz2msasxd5swz
    encrypted_regex: '.*'
```

- [ ] **Step 3: Create encrypted dispatcher `.env` placeholder**

Create a temporary plaintext file outside the repo:

```bash
cat >/tmp/aaas-dispatcher.env <<'EOF'
DATABASE_URL=mysql://user:password@host:4000/dbname?sslaccept=strict
JWT_SECRET=change-me-32-chars-minimum-secret
BOT_TOKEN_ENC_KEY=0000000000000000000000000000000000000000000000000000000000000000
GATEWAY_URL=https://your-gateway.example.com
GATEWAY_LOCAL_URL=http://agent-runtime-gateway:3001
E2B_API_KEY=e2b_placeholder
E2B_DOMAIN=ap-beijing.tencentags.com
POD_NAME=agent-runtime-dispatcher
EOF
```

Encrypt it into the deploy directory:

```bash
SOPS_AGE_RECIPIENTS=age1cdelwv46c27sh9wjq9ywqmqdqdfzt982gpahd8c6a99rjpz2msasxd5swz \
  sops --encrypt /tmp/aaas-dispatcher.env > packages/dispatcher/deploy/.env
rm /tmp/aaas-dispatcher.env
```

Expected: `packages/dispatcher/deploy/.env` contains `ENC[` values and SOPS metadata, not plaintext secrets.

If `sops` is unavailable, stop and install/configure SOPS before continuing. Do not commit plaintext `.env`.

- [ ] **Step 4: Create dispatcher `entrypoint.sh`**

Create `packages/dispatcher/deploy/entrypoint.sh`:

```bash
#!/bin/bash
set -eu

echo "Starting agent-runtime-dispatcher..."

sops -d /app.env >/tmp/env

set -a
. /tmp/env
set +a

rm /tmp/env

exec node dist/src/index.js
```

- [ ] **Step 5: Create dispatcher `build.sh`**

Create `packages/dispatcher/deploy/build.sh`:

```bash
#!/bin/bash
source /etc/profile

set -ex

PROJECT=agent-runtime-dispatcher
VERSION=$(git rev-parse --short HEAD)
HARBOR=maas-images-register.tencentcloudcr.com
NAMESPACE=wudao
DOCKER_IMAGE=$HARBOR/$NAMESPACE/$PROJECT:$VERSION
DOCKER_IMAGE_LATEST=$HARBOR/$NAMESPACE/$PROJECT:latest
DOCKER_FILE=./packages/dispatcher/deploy/Dockerfile

echo "当前环境为: dev-tx"
echo "开始构建当次镜像: $DOCKER_IMAGE"
sudo docker build -t "$DOCKER_IMAGE" -f "$DOCKER_FILE" .
echo "构建成功"

echo "开始将镜像push到私服！"
sudo docker push "$DOCKER_IMAGE"
sudo docker tag "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"
sudo docker push "$DOCKER_IMAGE_LATEST"
sudo docker rmi "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"

echo "发布完成！$DOCKER_IMAGE"
```

- [ ] **Step 6: Create dispatcher `run.sh`**

Create `packages/dispatcher/deploy/run.sh`:

```bash
#!/bin/bash
source /etc/profile

set -ex

PROJECT=agent-runtime-dispatcher
CONTAINER_NAME=${CONTAINER_NAME:-agent-runtime-dispatcher}
HARBOR=${HARBOR:-maas-images-register.tencentcloudcr.com}
NAMESPACE=${NAMESPACE:-wudao}
TAG=${TAG:-latest}
IMAGE=${IMAGE:-$HARBOR/$NAMESPACE/$PROJECT:$TAG}
SOPS_AGE_KEY_FILE_ON_HOST=${SOPS_AGE_KEY_FILE_ON_HOST:-/opt/aaas/sops-age-key.txt}
SOPS_AGE_KEY_FILE_IN_CONTAINER=${SOPS_AGE_KEY_FILE_IN_CONTAINER:-/run/secrets/sops-age-key}

echo "Pulling image: $IMAGE"
sudo docker pull "$IMAGE"

if sudo docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  sudo docker stop "$CONTAINER_NAME" || true
  sudo docker rm "$CONTAINER_NAME" || true
fi

sudo docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -v "$SOPS_AGE_KEY_FILE_ON_HOST:$SOPS_AGE_KEY_FILE_IN_CONTAINER:ro" \
  -e SOPS_AGE_KEY_FILE="$SOPS_AGE_KEY_FILE_IN_CONTAINER" \
  "$IMAGE"

sudo docker ps --filter "name=$CONTAINER_NAME"
```

- [ ] **Step 7: Create dispatcher Dockerfile**

Create `packages/dispatcher/deploy/Dockerfile`:

```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2 AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/db/ packages/db/
COPY packages/dispatcher/ packages/dispatcher/

RUN pnpm install --frozen-lockfile --filter @aaas/dispatcher... \
    && pnpm --filter @aaas/db generate \
    && pnpm --filter @aaas/db exec tsc -p tsconfig.json \
    && cp -R packages/db/src/generated packages/db/dist/generated \
    && pnpm --filter @aaas/dispatcher... build \
    && pnpm --filter @aaas/dispatcher deploy --prod /deploy \
    && mkdir -p /deploy/node_modules/@aaas/db/dist \
    && cp -R packages/db/dist/* /deploy/node_modules/@aaas/db/dist/ \
    && node -e "const fs=require('fs'); const p='/deploy/node_modules/@aaas/db/package.json'; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.main='dist/index.js'; fs.writeFileSync(p, JSON.stringify(pkg, null, 2));"

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2
WORKDIR /app

ARG SOPS_VERSION=3.10.2
ADD https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.amd64 /usr/local/bin/sops
RUN chmod +x /usr/local/bin/sops && sops --version

COPY --from=builder /deploy/node_modules ./node_modules/
COPY --from=builder /deploy/dist ./dist/
COPY --from=builder /deploy/package.json ./
COPY packages/dispatcher/deploy/.env /app.env
COPY packages/dispatcher/deploy/.sops.yaml /.sops.yaml
COPY packages/dispatcher/deploy/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production

ENTRYPOINT ["sh", "-c", "/app/entrypoint.sh"]
```

- [ ] **Step 8: Make dispatcher scripts executable**

Run:

```bash
chmod +x packages/dispatcher/deploy/build.sh packages/dispatcher/deploy/run.sh packages/dispatcher/deploy/entrypoint.sh
```

- [ ] **Step 9: Commit dispatcher deploy assets**

Run:

```bash
git add packages/dispatcher/deploy
git commit -m "feat(dispatcher): add docker deploy assets"
```

Expected: commit succeeds.

---

## Task 4: Verify SOPS, TypeScript output, and DB packaging locally

**Files:**
- Inspect: `packages/gateway/deploy/Dockerfile`
- Inspect: `packages/dispatcher/deploy/Dockerfile`
- Inspect: `packages/gateway/deploy/entrypoint.sh`
- Inspect: `packages/dispatcher/deploy/entrypoint.sh`
- Modify: deploy Dockerfiles only if validation shows packaging paths are wrong.

- [ ] **Step 1: Verify encrypted env files are not plaintext**

Run:

```bash
rg -n "mysql://|sk-|e2b_|AKID|change-me" packages/gateway/deploy/.env packages/dispatcher/deploy/.env || true
rg -n "ENC\[|sops_" packages/gateway/deploy/.env packages/dispatcher/deploy/.env
```

Expected:

- First command should produce no real secret matches. Placeholder strings may only appear if encrypted as part of `ENC[...]` ciphertext; if plaintext placeholder values appear, re-encrypt before committing.
- Second command should show SOPS encrypted fields or metadata.

- [ ] **Step 2: Verify package TypeScript output paths outside Docker**

Run:

```bash
pnpm --filter @aaas/db generate
pnpm --filter @aaas/gateway build
pnpm --filter @aaas/dispatcher build
find packages/gateway/dist packages/dispatcher/dist packages/db/dist -maxdepth 3 -type f | sort | sed -n '1,120p'
```

Expected:

- Gateway entrypoint exists at `packages/gateway/dist/src/index.js`.
- Dispatcher entrypoint exists at `packages/dispatcher/dist/src/index.js`.
- DB compiled entrypoint exists at `packages/db/dist/index.js` after running the Dockerfile-equivalent DB compile step.

If `packages/db/dist/index.js` is missing, run:

```bash
pnpm --filter @aaas/db exec tsc -p tsconfig.json
cp -R packages/db/src/generated packages/db/dist/generated
```

Expected: `packages/db/dist/index.js` and `packages/db/dist/generated/index.js` exist.

- [ ] **Step 3: Build the gateway image**

Run:

```bash
sudo docker build -t test-agent-runtime-gateway -f packages/gateway/deploy/Dockerfile .
```

Expected: build succeeds.

If this fails because the remote SOPS binary download is unavailable, replace the `ADD https://github.com/getsops/sops/...` install with an equivalent project-approved SOPS install method, then rebuild.

- [ ] **Step 4: Build the dispatcher image**

Run:

```bash
sudo docker build -t test-agent-runtime-dispatcher -f packages/dispatcher/deploy/Dockerfile .
```

Expected: build succeeds.

If this fails because the remote SOPS binary download is unavailable, apply the same install-method fix used for gateway.

- [ ] **Step 5: Verify gateway image contains expected files**

Run:

```bash
sudo docker run --rm --entrypoint sh test-agent-runtime-gateway -c '
  set -eu
  test -f /app/dist/src/index.js
  test -f /app/node_modules/@aaas/db/dist/index.js
  test -f /app/node_modules/@aaas/db/dist/generated/index.js
  test -f /app.env
  test -f /.sops.yaml
  test -x /app/entrypoint.sh
  command -v sops
  node - <<'"'"'NODE'"'"'
import("@aaas/db").then(() => console.log("db import ok"))
NODE
'
```

Expected: command exits 0 and prints `db import ok`.

- [ ] **Step 6: Verify dispatcher image contains expected files**

Run:

```bash
sudo docker run --rm --entrypoint sh test-agent-runtime-dispatcher -c '
  set -eu
  test -f /app/dist/src/index.js
  test -f /app/node_modules/@aaas/db/dist/index.js
  test -f /app/node_modules/@aaas/db/dist/generated/index.js
  test -f /app.env
  test -f /.sops.yaml
  test -x /app/entrypoint.sh
  command -v sops
  node - <<'"'"'NODE'"'"'
import("@aaas/db").then(() => console.log("db import ok"))
NODE
'
```

Expected: command exits 0 and prints `db import ok`.

- [ ] **Step 7: Commit Dockerfile validation fixes if any**

If Steps 3-6 required Dockerfile changes, commit them:

```bash
git add packages/gateway/deploy packages/dispatcher/deploy
git commit -m "fix: make service docker images runnable"
```

If no changes were needed, skip this commit.

---

## Task 5: Add package script aliases only if desired

**Files:**
- Modify: `packages/gateway/package.json`
- Modify: `packages/dispatcher/package.json`

- [ ] **Step 1: Add optional package script aliases**

If the team wants package-level script convenience, modify `packages/gateway/package.json` scripts:

```json
"docker:build": "bash deploy/build.sh",
"docker:run": "bash deploy/run.sh"
```

Modify `packages/dispatcher/package.json` scripts similarly:

```json
"docker:build": "bash deploy/build.sh",
"docker:run": "bash deploy/run.sh"
```

If adding these scripts is unnecessary, skip this step. The deploy assets are usable directly without package script aliases.

- [ ] **Step 2: Validate JSON if package files changed**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/gateway/package.json','utf8')); JSON.parse(require('fs').readFileSync('packages/dispatcher/package.json','utf8')); console.log('package json ok')"
```

Expected: prints `package json ok`.

- [ ] **Step 3: Commit optional metadata changes**

If any files changed in this task, commit:

```bash
git add packages/gateway/package.json packages/dispatcher/package.json
git commit -m "chore: add docker deploy script aliases"
```

If no changes were needed, skip this commit.

---

## Task 6: Validate build scripts and direct container run path

**Files:**
- Inspect/modify: `packages/gateway/deploy/build.sh`
- Inspect/modify: `packages/dispatcher/deploy/build.sh`
- Inspect/modify: `packages/gateway/deploy/run.sh`
- Inspect/modify: `packages/dispatcher/deploy/run.sh`

- [ ] **Step 1: Shell syntax check all deploy scripts**

Run:

```bash
bash -n packages/gateway/deploy/build.sh
bash -n packages/gateway/deploy/run.sh
bash -n packages/gateway/deploy/entrypoint.sh
bash -n packages/dispatcher/deploy/build.sh
bash -n packages/dispatcher/deploy/run.sh
bash -n packages/dispatcher/deploy/entrypoint.sh
```

Expected: no output and exit 0.

- [ ] **Step 2: Verify build scripts point at correct Dockerfiles and project names**

Run:

```bash
rg -n "PROJECT=|DOCKER_FILE=|agent-runtime-|maas-images-register" packages/gateway/deploy/build.sh packages/dispatcher/deploy/build.sh
```

Expected:

- Gateway uses `PROJECT=agent-runtime-gateway` and `DOCKER_FILE=./packages/gateway/deploy/Dockerfile`.
- Dispatcher uses `PROJECT=agent-runtime-dispatcher` and `DOCKER_FILE=./packages/dispatcher/deploy/Dockerfile`.
- Both use `maas-images-register.tencentcloudcr.com` and `wudao`.

- [ ] **Step 3: Test gateway container decryption/startup with a local age key**

Only run this step if you have the matching SOPS age private key for the committed `.env` files.

Run:

```bash
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt \
IMAGE=test-agent-runtime-gateway \
CONTAINER_NAME=test-agent-runtime-gateway \
HOST_PORT=3001 \
bash packages/gateway/deploy/run.sh
```

Expected:

- Container starts.
- Logs do not show SOPS decryption failure.
- `curl http://localhost:3001/health` returns `{"ok":true}` if placeholder env values do not prevent startup before DB access.

Clean up:

```bash
sudo docker stop test-agent-runtime-gateway || true
sudo docker rm test-agent-runtime-gateway || true
```

- [ ] **Step 4: Test dispatcher container decryption/startup with a local age key**

Only run this step if you have the matching SOPS age private key for the committed `.env` files and safe placeholder/real credentials.

Run:

```bash
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt \
IMAGE=test-agent-runtime-dispatcher \
CONTAINER_NAME=test-agent-runtime-dispatcher \
bash packages/dispatcher/deploy/run.sh
```

Expected:

- Container starts or fails only because placeholder external credentials are invalid.
- Logs do not show missing file, missing SOPS key, missing module, or missing entrypoint errors.

Clean up:

```bash
sudo docker stop test-agent-runtime-dispatcher || true
sudo docker rm test-agent-runtime-dispatcher || true
```

- [ ] **Step 5: Commit script validation fixes if any**

If Steps 1-4 required changes, commit:

```bash
git add packages/gateway/deploy packages/dispatcher/deploy
git commit -m "fix: validate docker deploy scripts"
```

If no changes were needed, skip this commit.

---

## Task 7: Final verification and documentation update

**Files:**
- Modify: `docs/LOCAL-DEV.md` or a deploy-specific doc only if the team wants operator instructions in repo docs.
- Inspect: `docs/product-specs/2026-05-08-tencent-cloud-docker-deploy-design.md`

- [ ] **Step 1: Run unit tests for affected packages**

Run:

```bash
pnpm --filter @aaas/gateway test
pnpm --filter @aaas/dispatcher test
```

Expected: both commands pass.

- [ ] **Step 2: Run TypeScript builds**

Run:

```bash
pnpm --filter @aaas/gateway build
pnpm --filter @aaas/dispatcher build
```

Expected: both commands pass.

- [ ] **Step 3: Rebuild Docker images after all changes**

Run:

```bash
sudo docker build -t test-agent-runtime-gateway -f packages/gateway/deploy/Dockerfile .
sudo docker build -t test-agent-runtime-dispatcher -f packages/dispatcher/deploy/Dockerfile .
```

Expected: both builds pass.

- [ ] **Step 4: Optionally run registry push scripts**

Only run this on a machine logged in to Tencent Cloud registry and authorized to push:

```bash
bash packages/gateway/deploy/build.sh
bash packages/dispatcher/deploy/build.sh
```

Expected:

- Both scripts push `<git-short-sha>` and `latest` tags.
- Local image tags are removed after push.

If registry credentials are unavailable, record this as not run and provide the successful direct `docker build` output instead.

- [ ] **Step 5: Add operator notes if needed**

If the user wants documented deploy commands, add a short section to `docs/LOCAL-DEV.md` or a new deployment reference doc. Keep it concise:

```markdown
## Tencent Cloud Docker deploy

Gateway:

```bash
bash packages/gateway/deploy/build.sh
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt bash packages/gateway/deploy/run.sh
```

Dispatcher:

```bash
bash packages/dispatcher/deploy/build.sh
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt bash packages/dispatcher/deploy/run.sh
```
```

Skip this if the deploy scripts are self-explanatory and docs are not requested.

- [ ] **Step 6: Commit final docs if changed**

If Step 5 changed docs, commit:

```bash
git add docs/LOCAL-DEV.md
git commit -m "docs: add docker deployment commands"
```

If no docs changed, skip this commit.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: clean working tree.

---

## Completion criteria

The work is complete when:

- `packages/gateway/deploy/` contains `Dockerfile`, `build.sh`, `run.sh`, `entrypoint.sh`, `.env`, and `.sops.yaml`.
- `packages/dispatcher/deploy/` contains the same file set.
- `build.sh` scripts build and push SHA + `latest` tags for the correct Tencent Cloud image names.
- `run.sh` scripts pull and run the correct images and inject SOPS key material.
- `entrypoint.sh` scripts decrypt `/app.env`, remove the temporary decrypted file, and `exec node dist/src/index.js`.
- Docker images contain runnable service entrypoints and runnable `@aaas/db` JavaScript output.
- Gateway exposes port 3001.
- Dispatcher exposes no port.
- No plaintext production secrets are committed.
- Package tests and Docker builds pass, or unavailable external registry/SOPS-key checks are explicitly documented as not run.
