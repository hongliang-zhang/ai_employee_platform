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
