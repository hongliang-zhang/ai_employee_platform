#!/bin/bash
source /etc/profile

set -ex

PROJECT=agent-runtime-gateway
VERSION=$(date +%Y%m%d%H%M%S)
RANCHER_NAMESPACE='wd-dev'
RANCHER=bigmodel-dev
HARBOR=maas-images-register.tencentcloudcr.com
NAMESPACE=wudao
DOCKER_IMAGE=$HARBOR/$NAMESPACE/$PROJECT:$VERSION
DOCKER_FILE=./packages/gateway/deploy/tx_dev.Dockerfile

echo "当前环境为: dev-tx"

echo "开始构建当次镜像:"
sudo docker build --quiet -t "$DOCKER_IMAGE" -f "$DOCKER_FILE" .
echo "构建成功"

echo "开始将镜像push到私服！"
sudo docker push --quiet "$DOCKER_IMAGE"
sudo docker rmi "$DOCKER_IMAGE"

echo "开始将最新镜像部署到远端:"
sudo rancher server switch $RANCHER
sudo rancher kubectl set image deployment/$PROJECT $PROJECT="$DOCKER_IMAGE" -n $RANCHER_NAMESPACE --insecure-skip-tls-verify
echo "部署完成！"
