#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="cope"
DOMAIN="copo.iver.top"
REPO_URL="https://github.com/iv3rins/Cope.git"
APP_DIR="/opt/${APP_NAME}"
WEB_ROOT="${APP_DIR}/public"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_LINK="/etc/nginx/sites-enabled/${APP_NAME}"
NODE_MAJOR="20"

log() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "请使用 root 执行：sudo bash deploy/deploy-debian12.sh"
command -v apt-get >/dev/null || die "此脚本需要 Debian 12 或兼容的 apt 系统。"

export DEBIAN_FRONTEND=noninteractive

log "安装系统依赖"
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git nginx certbot python3-certbot-nginx rsync

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt "${NODE_MAJOR}" ]]; then
  log "安装 Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y --no-install-recommends nodejs
fi

log "同步项目代码"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --depth=1 origin master
  git -C "${APP_DIR}" reset --hard origin/master
else
  rm -rf "${APP_DIR}"
  git clone --depth=1 --branch master "${REPO_URL}" "${APP_DIR}"
fi

log "安装依赖并构建前端"
cd "${APP_DIR}"
npm ci --omit=optional
npm run build
[[ -f "${APP_DIR}/public/engine.bundle.js" ]] || die "构建未生成 public/engine.bundle.js"

log "准备静态发布目录"
rsync -a --delete "${APP_DIR}/assets/" "${WEB_ROOT}/assets/"
rsync -a "${APP_DIR}/public/engine.bundle.js" "${WEB_ROOT}/public/engine.bundle.js"
rsync -a "${APP_DIR}/index.html" "${APP_DIR}/app.js" "${APP_DIR}/styles.css" "${WEB_ROOT}/"

log "配置 Nginx"
mkdir -p "${WEB_ROOT}"
cat > "${NGINX_SITE}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(?:css|js|json|svg|webp|png|jpg|jpeg|gif|ico)$ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=3600";
    }

    location ~ /\. {
        deny all;
    }
}
NGINX
ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "开放 HTTP/HTTPS 防火墙端口（若 ufw 已安装）"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 'Nginx Full' >/dev/null || true
fi

log "检查域名解析"
SERVER_IP="$(hostname -I | awk '{print $1}')"
DOMAIN_IP="$(getent ahostsv4 "${DOMAIN}" | awk 'NR==1 {print $1}')"
if [[ -z "${DOMAIN_IP}" ]]; then
  printf '警告：%s 尚未解析到服务器。请先设置 DNS A 记录指向 %s，再运行本脚本完成 HTTPS。\n' "${DOMAIN}" "${SERVER_IP}"
else
  log "${DOMAIN} 当前解析到 ${DOMAIN_IP}，服务器地址为 ${SERVER_IP}"
fi

if [[ "${ENABLE_HTTPS:-1}" == "1" && -n "${DOMAIN_IP}" && "${DOMAIN_IP}" == "${SERVER_IP}" ]]; then
  log "申请 Let's Encrypt HTTPS 证书"
  certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "${DOMAIN}" || {
    printf '警告：HTTPS 证书申请失败，HTTP 网站仍可访问。稍后可重新执行脚本。\n' >&2
  }
else
  printf '跳过 HTTPS：请确认 DNS 已将 %s 指向本机，并确保 80/443 端口可从公网访问。\n' "${DOMAIN}"
fi

systemctl reload nginx
log "部署完成"
printf '访问地址：http%s://%s\n' "$([[ -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]] && printf 's' || true)" "${DOMAIN}"
printf '项目目录：%s\n' "${APP_DIR}"
printf '重新部署：sudo ENABLE_HTTPS=1 bash %s\n' "$0"
