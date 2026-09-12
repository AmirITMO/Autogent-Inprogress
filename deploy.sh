#!/bin/sh
set -e
cd "$(dirname "$0")"

# git pull переписывает этот же файл на диске, пока интерпретатор его ещё
# читает (по одному open() на весь запуск) — на прошлом деплое это привело
# к тому, что фактически выполнилась СТАРАЯ версия скрипта из уже открытого
# файлового дескриптора, несмотря на свежий git log на сервере. Поэтому:
# git pull делаем только один раз (сторожим через DEPLOY_REEXEC), а сам
# деплой — через exec заново прочитанного файла, отдельным open().
if [ -z "$DEPLOY_REEXEC" ]; then
  git pull
  DEPLOY_REEXEC=1 exec sh "$0"
fi

# Версия сборки — пишем/обновляем строку в .env.production, она уже
# подключена контейнеру как env_file и перечитывается при каждом старте.
# Через docker build --build-arg не работает: на этом сервере docker
# compose собирает через buildx bake (pipe по stdin), и build-arg из
# шелл-окружения туда не долетает — версия внутри контейнера оставалась
# дефолтным "dev".
# Формат v{год}.{месяц}.{день}.{порядковый номер сборки} — читаемая дата
# деплоя + монотонный build number (git rev-list --count), на случай
# нескольких деплоев в один день.
APP_VERSION="v$(date -u +%Y.%m.%d).$(git rev-list --count HEAD)"
if grep -q '^APP_VERSION=' .env.production 2>/dev/null; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=${APP_VERSION}/" .env.production
else
  echo "APP_VERSION=${APP_VERSION}" >> .env.production
fi

docker compose -f docker-compose.prod.yml up -d --build
