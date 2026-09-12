#!/bin/sh
set -e
cd "$(dirname "$0")"
git pull

# Версия сборки — просто пишем/обновляем строку в .env.production, она уже
# подключена контейнеру как env_file и перечитывается при каждом старте.
# Раньше пробовали через docker build --build-arg, но на этом сервере
# docker compose собирает через buildx bake (pipe по stdin) и build-arg
# из шелл-окружения туда не долетал — версия внутри контейнера всегда
# оставалась дефолтным "dev". Через .env.production — надёжно.
APP_VERSION="$(git rev-list --count HEAD).$(git rev-parse --short HEAD)"
if grep -q '^APP_VERSION=' .env.production 2>/dev/null; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=${APP_VERSION}/" .env.production
else
  echo "APP_VERSION=${APP_VERSION}" >> .env.production
fi

docker compose -f docker-compose.prod.yml up -d --build
