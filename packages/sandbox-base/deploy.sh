#!/bin/bash
source /etc/profile

set -ex

PROJECT=sandbox-base
VERSION=$(git rev-parse --short HEAD)
HARBOR=uhub.service.ucloud.cn
DOCKER_IMAGE=$HARBOR/wudao/$PROJECT:$VERSION
DOCKER_IMAGE_LATEST=$HARBOR/wudao/$PROJECT:latest
DOCKER_FILE=./packages/sandbox-base/Dockerfile

echo "当前环境为: dev-tx"

# 编译镜像
echo "开始构建当次镜像:"
sudo docker build -t "$DOCKER_IMAGE" -f $DOCKER_FILE ./packages/sandbox-base
echo "构建成功"

# 上传到docker私服（hash + latest 双标签）
echo "开始将镜像push到私服！"
sudo docker tag "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"
sudo docker push "$DOCKER_IMAGE"
sudo docker push "$DOCKER_IMAGE_LATEST"
sudo docker rmi "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST"

echo "发布完成！$DOCKER_IMAGE"
