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
