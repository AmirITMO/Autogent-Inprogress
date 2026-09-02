#!/bin/bash
# Единственная команда, которую разрешено выполнить через ограниченный
# deploy-ключ (см. forced-command в authorized_keys на сервере) — поэтому
# никаких параметров не принимает и ничего не спрашивает.
#
# Прод — Docker Compose (не systemd/pm2): app-контейнер собирается из
# Dockerfile в этой же директории, миграции (prisma migrate deploy) уже
# встроены в CMD контейнера и накатываются сами при каждом старте.
set -euo pipefail

APP_DIR="/opt/autogent-platform"

cd "$APP_DIR"
git pull origin main
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app

# Сиды идемпотентны (upsert по фиксированным id) — безопасно гонять на
# каждый деплой, чтобы новые сервисные User/TrafficChannel заводились сами.
docker compose -f docker-compose.prod.yml exec -T app npx tsx prisma/seed.ts
