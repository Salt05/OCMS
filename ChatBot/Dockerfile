FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc libpq-dev
COPY . .
RUN pip install --no-cache-dir -e .
RUN pip install --no-cache-dir psycopg2-binary uvicorn fastapi python-dotenv openai
EXPOSE 8000
CMD ["python", "main.py"]
