#!/bin/bash
source /etc/profile

set -ex

PROJECT=demo-agent
VERSION=$(git rev-parse --short HEAD)
HARBOR=maas-images-register.tencentcloudcr.com
DOCKER_IMAGE=$HARBOR/wudao/$PROJECT:$VERSION
DOCKER_FILE=./packages/demo-agent/Dockerfile

echo "当前环境为: dev-tx"

# 编译镜像
echo "开始构建当次镜像:"
sudo docker build -t "$DOCKER_IMAGE" -f $DOCKER_FILE .
echo "构建成功"

# 上传到docker私服
echo "开始将镜像push到私服！"
sudo docker push "$DOCKER_IMAGE"
sudo docker rmi "$DOCKER_IMAGE"

echo "发布完成！$DOCKER_IMAGE"
