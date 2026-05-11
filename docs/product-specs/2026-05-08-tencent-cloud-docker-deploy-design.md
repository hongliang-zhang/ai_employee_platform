# Tencent Cloud Docker Deployment for Gateway and Dispatcher

## Status

Completed — gateway and dispatcher deployment assets exist under `packages/*/deploy/`.

## Context

The Agent Runtime platform currently runs `gateway` and `dispatcher` as Node.js packages in a pnpm monorepo:

- `packages/gateway` is the trusted backend service. It exposes HTTP APIs and defaults to `PORT=3001`.
- `packages/dispatcher` is the IM polling and sandbox lifecycle worker. It does not expose an HTTP port.
- `packages/gateway` and `packages/dispatcher` now have Docker-based image publishing flows under their `deploy/` directories.
- `~/monorepo/claude-code-proxy/deploy/prod_tx` provides the desired deployment pattern for encrypted environment files copied into images and decrypted at container startup with `sops`.

The goal is to add Docker deployment assets for `gateway` and `dispatcher` targeting Tencent Cloud image registry.

## Goals

1. Add a `deploy/` directory for each service.
2. Add a Dockerfile for each service.
3. Add a script to build and push each image.
4. Add a script to run each service container.
5. Keep deployment style close to the existing gateway/dispatcher deploy scripts and `claude-code-proxy` conventions.
6. Store runtime configuration as encrypted `sops` env files copied into the image, then decrypted at startup.

## Non-goals

- Do not change gateway or dispatcher business logic.
- Do not add Kubernetes/Rancher deployment manifests.
- Do not introduce docker-compose.
- Do not solve database migration orchestration in this change.
- Do not store plaintext production secrets in the repository.

## Directory layout

Add:

```text
packages/gateway/deploy/
  Dockerfile
  build.sh
  run.sh
  entrypoint.sh
  .env
  .sops.yaml

packages/dispatcher/deploy/
  Dockerfile
  build.sh
  run.sh
  entrypoint.sh
  .env
  .sops.yaml
```

Each service's `deploy/.env` is intended to be a `sops`-encrypted env file, following the `claude-code-proxy/deploy/prod_tx` pattern.

## Image naming and tagging

Use Tencent Cloud registry values aligned with the service deploy scripts:

```bash
HARBOR=maas-images-register.tencentcloudcr.com
NAMESPACE=wudao
VERSION=$(git rev-parse --short HEAD)
```

Gateway image names:

```text
maas-images-register.tencentcloudcr.com/wudao/agent-runtime-gateway:<git-short-sha>
maas-images-register.tencentcloudcr.com/wudao/agent-runtime-gateway:latest
```

Dispatcher image names:

```text
maas-images-register.tencentcloudcr.com/wudao/agent-runtime-dispatcher:<git-short-sha>
maas-images-register.tencentcloudcr.com/wudao/agent-runtime-dispatcher:latest
```

Deployments may run `latest`, while the immutable git short SHA tag remains available for debugging and rollback.

## Docker build design

Both services use multi-stage Docker builds.

### Base image

Use the same Node base image chosen for this deployment work:

```text
uhub.service.ucloud.cn/wudao/ci-node-slim:22p2
```

Use it for both builder and runtime stages unless implementation testing proves a smaller compatible runtime stage is safe.

### Build context

Build from the monorepo root, not from the package directory. This is required because both services depend on workspace packages such as `@aaas/db`.

Example:

```bash
docker build -t "$DOCKER_IMAGE" -f packages/gateway/deploy/Dockerfile .
```

### Builder stage

The builder stage should:

1. Enable corepack and activate pnpm 9.
2. Set `WORKDIR /app`.
3. Copy workspace metadata:
   - `pnpm-workspace.yaml`
   - `package.json`
   - `tsconfig.base.json`
   - `pnpm-lock.yaml`
4. Copy `packages/db/` and the target service package.
5. Install the filtered workspace dependencies.
6. Generate Prisma client files for `@aaas/db`.
7. Build/package the target service and its workspace dependencies into runnable JavaScript.
8. Use pnpm deploy, or an equivalent tested packaging strategy, to produce a production-only `/deploy` directory.
9. Verify the emitted service entrypoint path and make `entrypoint.sh` match that path.

Gateway build commands should be based on:

```bash
pnpm install --frozen-lockfile --filter @aaas/gateway...
pnpm --filter @aaas/db generate
pnpm --filter @aaas/gateway... build
pnpm --filter @aaas/gateway deploy --prod /deploy
```

Dispatcher build commands should be based on:

```bash
pnpm install --frozen-lockfile --filter @aaas/dispatcher...
pnpm --filter @aaas/db generate
pnpm --filter @aaas/dispatcher... build
pnpm --filter @aaas/dispatcher deploy --prod /deploy
```

`@aaas/db` requires special attention during implementation. It currently exposes `src/index.ts` as its package entrypoint and imports generated Prisma output from `src/generated/index.js`. A production container running plain Node cannot rely on TypeScript source being executable. The implementation plan must include one of these validated packaging approaches:

1. Add a proper build output for `@aaas/db` so its runtime entrypoint is JavaScript and generated Prisma files are included.
2. Bundle/transpile service output so `@aaas/db` is emitted as runnable JavaScript inside the service artifact.
3. Use another tested pnpm deploy layout that demonstrably lets the configured Node entrypoint resolve `@aaas/db` and its generated Prisma client without `tsx`.

This is deployment packaging work, not a change to gateway/dispatcher business logic.

The service entrypoint path also requires validation. Current gateway and dispatcher TypeScript configs use `rootDir: "."`, so plain `tsc` may emit `src/index.ts` as `dist/src/index.js` rather than `dist/index.js`. The implementation plan must choose one validated approach:

1. Change `entrypoint.sh` to execute the actual emitted path, likely `node dist/src/index.js`.
2. Add deployment-specific TypeScript build configuration that emits the service entrypoint as `dist/index.js`.
3. Use a bundling/package step that explicitly creates `/deploy/dist/index.js`.

The selected approach must be verified inside the built image for both services.

## Runtime image design

The runtime stage should:

1. Set `WORKDIR /app`.
2. Copy production output from builder:
   - `/deploy/node_modules`
   - `/deploy/dist`
   - `/deploy/package.json`
3. Copy encrypted env and startup files from the service deploy directory:
   - encrypted env to `/app.env`
   - `.sops.yaml` to `/.sops.yaml`
   - `entrypoint.sh` to `/app/entrypoint.sh`
4. Set executable permissions on `entrypoint.sh`.
5. Set `NODE_ENV=production`.
6. Use `ENTRYPOINT ["sh", "-c", "/app/entrypoint.sh"]`.

Gateway additionally sets:

```dockerfile
ENV PORT=3001
EXPOSE 3001
```

Dispatcher does not expose any port.

## Encrypted env startup design

Each service has an `entrypoint.sh` similar to `claude-code-proxy/deploy/prod_tx/start_glm_proxy.sh`.

The script should:

1. Exit on errors and undefined variables.
2. Decrypt `/app.env` with `sops` into a temporary file.
3. Export all variables from that temporary file.
4. Remove the temporary file.
5. Start the validated Node entrypoint. With the current TypeScript layout this is expected to be `node dist/src/index.js`; implementation must confirm the built artifact path before finalizing.

Template:

```bash
#!/bin/bash
set -eu

sops -d /app.env >/tmp/env

set -a
. /tmp/env
set +a

rm /tmp/env

node dist/src/index.js
```

The image must contain `sops`, or the chosen base image must already provide it. Implementation must verify this. If missing, install it in the runtime image using the existing project/container conventions.

Because decryption runs inside the container, runtime decryption key material must be injected into the container. The preferred direct-Docker mechanism is:

- mount the age key file read-only into the container, for example `/run/secrets/sops-age-key`;
- set `SOPS_AGE_KEY_FILE=/run/secrets/sops-age-key` for the container process.

`run.sh` should support this with overridable defaults:

```bash
SOPS_AGE_KEY_FILE_ON_HOST=${SOPS_AGE_KEY_FILE_ON_HOST:-/opt/aaas/sops-age-key.txt}
SOPS_AGE_KEY_FILE_IN_CONTAINER=${SOPS_AGE_KEY_FILE_IN_CONTAINER:-/run/secrets/sops-age-key}
```

and run containers with:

```bash
-v "$SOPS_AGE_KEY_FILE_ON_HOST:$SOPS_AGE_KEY_FILE_IN_CONTAINER:ro"
-e SOPS_AGE_KEY_FILE="$SOPS_AGE_KEY_FILE_IN_CONTAINER"
```

If Tencent Cloud deployment injects secrets through another supported mechanism, it must provide the equivalent `SOPS_AGE_KEY_FILE` or `SOPS_AGE_KEY` environment for `sops -d /app.env` inside the container.

## Service env contents

### Gateway encrypted env

`packages/gateway/deploy/.env` should contain encrypted values for runtime configuration such as:

```text
DATABASE_URL=
JWT_SECRET=
LLM_API_KEY=
ALLOWED_MODELS=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=
PORT=3001
```

### Dispatcher encrypted env

`packages/dispatcher/deploy/.env` should contain encrypted values for runtime configuration such as:

```text
DATABASE_URL=
JWT_SECRET=
BOT_TOKEN_ENC_KEY=
GATEWAY_URL=
GATEWAY_LOCAL_URL=
E2B_API_KEY=
E2B_DOMAIN=
POD_NAME=
```

`POD_NAME` may be omitted if relying on dispatcher's runtime fallback.

## Build script design

Each service gets a `build.sh` that builds from the monorepo root, pushes a git-SHA tag, and updates `latest`.

Shared behavior:

1. `source /etc/profile`.
2. `set -ex`.
3. Compute `VERSION=$(git rev-parse --short HEAD)`.
4. Build image from monorepo root.
5. Push the SHA tag.
6. Tag and push `latest`.
7. Remove local tags after push.

Gateway values:

```bash
PROJECT=agent-runtime-gateway
DOCKER_FILE=./packages/gateway/deploy/Dockerfile
```

Dispatcher values:

```bash
PROJECT=agent-runtime-dispatcher
DOCKER_FILE=./packages/dispatcher/deploy/Dockerfile
```

## Run script design

Each service gets a `run.sh` for direct Docker host deployment.

Shared behavior:

1. `source /etc/profile`.
2. `set -ex`.
3. Default to the `latest` image.
4. Pull the image.
5. Stop and remove any existing container with the same name.
6. Run the container detached with `--restart unless-stopped`.
7. Show container status.

Gateway runtime:

```bash
CONTAINER_NAME=agent-runtime-gateway
IMAGE=maas-images-register.tencentcloudcr.com/wudao/agent-runtime-gateway:latest
-p 3001:3001
```

Dispatcher runtime:

```bash
CONTAINER_NAME=agent-runtime-dispatcher
IMAGE=maas-images-register.tencentcloudcr.com/wudao/agent-runtime-dispatcher:latest
```

Dispatcher has no port mapping.

Because env is baked into the image in encrypted form and decrypted by `entrypoint.sh`, `run.sh` does not need `--env-file`. It does need to mount or inject the SOPS decryption key material as described above.

## Security notes

- Do not commit plaintext secrets.
- Each service's `deploy/.env` must be `sops`-encrypted if it contains real secrets.
- Copying encrypted env files into the image is accepted for this deployment pattern because secrets remain encrypted at rest in the registry.
- Runtime hosts must provide whatever key material is required for `sops -d` to succeed inside the container, preferably through a read-only age key mount plus `SOPS_AGE_KEY_FILE`.
- The startup script should remove the decrypted temporary env file immediately after sourcing it.

## Validation plan

Implementation should verify:

```bash
sudo docker build -t test-agent-runtime-gateway -f packages/gateway/deploy/Dockerfile .
sudo docker build -t test-agent-runtime-dispatcher -f packages/dispatcher/deploy/Dockerfile .
```

Then verify build scripts, when registry credentials are available:

```bash
bash packages/gateway/deploy/build.sh
bash packages/dispatcher/deploy/build.sh
```

Then verify local run behavior on a deployment host with `sops` decryption material available. For direct Docker runs, either place the age key at the default host path used by `run.sh` or override it:

```bash
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt bash packages/gateway/deploy/run.sh
SOPS_AGE_KEY_FILE_ON_HOST=/opt/aaas/sops-age-key.txt bash packages/dispatcher/deploy/run.sh
```

The validation must confirm that `sops -d /app.env` succeeds inside each running container and that the configured Node entrypoint exists and starts successfully.

Gateway health check:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"ok":true}
```
