# Instagram Lead Parser PRO

## Установка и запуск

### 1. Backend
```bash
cd backend
npm install
npm run dev
```
Запустится на http://localhost:3001

### 2. Frontend
```bash
cd frontend
npm install
npm start
```
Запустится на http://localhost:3000

### 3. Или оба сразу (bash)
```bash
bash start.sh
```

## Настройка
- В UI введи Apify API Token (обязательно)
- Для AI анализа — OpenAI API Key

## Структура данных
- `data/exports/` — Excel файлы с лидами
- `data/seen-leads.json` — база просмотренных профилей (дедупликация)
