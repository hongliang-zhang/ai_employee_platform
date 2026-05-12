#!/bin/bash
set -eu

echo "Starting agent-runtime-gateway..."

sops -d /app.env >/tmp/env

set -a
. /tmp/env
set +a

rm /tmp/env

exec node dist/src/index.js
