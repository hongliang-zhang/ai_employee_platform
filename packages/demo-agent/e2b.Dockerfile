FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY gateway_client.py .
COPY app.py .
COPY file_sync.py .
RUN mkdir -p /persistent/shared /persistent/conversation
