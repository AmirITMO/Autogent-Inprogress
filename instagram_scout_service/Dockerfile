FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Стейт (.env, sessions/*.json) НЕ запекается в образ — монтируется как
# volume снаружи, см. docker-compose.yml и README.md.

CMD ["python", "main.py"]
