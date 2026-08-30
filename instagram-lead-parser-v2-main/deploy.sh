#!/bin/bash
# Деплой на сервер с HTTPS через DuckDNS + certbot
# Запускать на сервере: bash deploy.sh

set -e

if [ ! -f .env ]; then
  echo "❌ Файл .env не найден. Скопируйте .env.example в .env и заполните."
  exit 1
fi

source .env

if [ -z "$DOMAIN" ] || [ -z "$DUCKDNS_TOKEN" ]; then
  echo "❌ DOMAIN и DUCKDNS_TOKEN должны быть заданы в .env"
  exit 1
fi

echo "📁 Создаём директории..."
mkdir -p nginx/certs nginx/certbot/www data/exports data/seen

# Подменяем ${DOMAIN} в nginx.conf
echo "⚙ Настраиваем nginx для домена $DOMAIN..."
sed -i "s/\${DOMAIN}/$DOMAIN/g" nginx/nginx.conf

# Первый запуск — получаем сертификат
if [ ! -d "nginx/certs/live/$DOMAIN" ]; then
  echo "🔐 Получаем SSL сертификат для $DOMAIN..."

  # Временно запустить nginx только на 80 (для ACME challenge)
  docker compose up -d nginx

  docker compose run --rm certbot certonly \
    --dns-duckdns \
    --dns-duckdns-token "$DUCKDNS_TOKEN" \
    -d "$DOMAIN" \
    --email admin@$DOMAIN \
    --agree-tos \
    --no-eff-email

  echo "✅ Сертификат получен!"
fi

echo "🚀 Запускаем все сервисы..."
docker compose up -d --build

echo ""
echo "✅ Готово! Сайт доступен на https://$DOMAIN"
echo ""
echo "Создать промокод (замените YOUR_SECRET и HOURS):"
echo "  curl -X POST https://$DOMAIN/api/admin/promo \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'X-Admin-Secret: YOUR_SECRET' \\"
echo "    -d '{\"durationHours\": HOURS}'"
