FROM uhub.service.ucloud.cn/wudao/ci-node-slim:22p2

# 换腾讯云镜像源（slim 镜像无 ca-certificates；镜像站会 301 跳转到 HTTPS，需提前禁用 TLS 验证）
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
    echo 'deb [trusted=yes] http://mirrors.tencent.com/debian bookworm main' > /etc/apt/sources.list && \
    echo 'deb [trusted=yes] http://mirrors.tencent.com/debian bookworm-updates main' >> /etc/apt/sources.list && \
    echo 'deb [trusted=yes] http://mirrors.tencent.com/debian-security bookworm-security main' >> /etc/apt/sources.list && \
    echo 'Acquire::https { Verify-Peer "false"; Verify-Host "false"; }' > /etc/apt/apt.conf.d/99tencent-tls

# 系统依赖 + user 账号
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    bash curl git sudo ca-certificates xz-utils && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --shell /bin/bash --create-home user && \
    echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# 安装 envd（从腾讯云 AGS 官方镜像拉取）
COPY --from=ccr.ccs.tencentyun.com/ags-image/envd:v0.2.11 --chmod=755 /usr/bin/envd /usr/bin/envd

# 安装 s6-overlay
ARG S6_OVERLAY_VERSION=3.2.1.0
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

# s6 服务配置
# s6 服务：仅 envd（app 进程由 dispatcher 通过 SDK commands.run 拉起）
COPY s6-services/ /etc/s6-overlay/s6-rc.d/
RUN chmod +x /etc/s6-overlay/s6-rc.d/envd/run && \
    chmod +x /etc/s6-overlay/s6-rc.d/envd/log/run

# 通用 app 目录；s6-log 目标目录（s6-log 不自动创建，需预先存在）
RUN mkdir -p /app /var/log/envd

EXPOSE 49983

ENTRYPOINT ["/init"]
