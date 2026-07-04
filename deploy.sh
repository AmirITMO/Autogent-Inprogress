#!/bin/sh
set -e
cd "$(dirname "$0")"
git pull
docker compose -f docker-compose.prod.yml up -d --build
