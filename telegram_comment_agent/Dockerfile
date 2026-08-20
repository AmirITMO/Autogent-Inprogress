FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Стейт (.env, sessions/*.session) НЕ запекается в образ — монтируется как
# volume снаружи, см. docker-compose.yml.

CMD ["python", "main.py"]
