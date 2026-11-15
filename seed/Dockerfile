FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY seed.py .
RUN useradd -r -u 10001 app
USER app
ENTRYPOINT ["python", "seed.py"]
