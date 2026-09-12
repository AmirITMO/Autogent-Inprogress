#!/bin/sh
set -e
cd "$(dirname "$0")"
git pull
export APP_VERSION="$(git rev-list --count HEAD).$(git rev-parse --short HEAD)"
docker compose -f docker-compose.prod.yml up -d --build
