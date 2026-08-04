# Playwright 官方镜像预装 chromium/firefox/webkit，与 requirements.txt 中 playwright 版本保持一致
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    # 确保 chromium 与实际安装的 playwright 版本匹配（基础镜像预装浏览器可能过时）
    && python -m playwright install --with-deps chromium

COPY app ./app

EXPOSE 19080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "19080"]
