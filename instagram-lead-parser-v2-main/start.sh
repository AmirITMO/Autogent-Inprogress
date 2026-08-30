#!/bin/bash
# Local dev: запуск backend и frontend параллельно

echo "Installing backend dependencies..."
cd backend && npm install

echo "Installing frontend dependencies..."
cd ../frontend && npm install

echo ""
echo "Starting backend on http://localhost:3001"
cd ../backend && npm run dev &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173"
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "App running (dev mode):"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"

wait $BACKEND_PID $FRONTEND_PID
