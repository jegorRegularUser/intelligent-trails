# Intelligent Trails

## Локальный запуск

### Backend (FastAPI)

1. Установите зависимости:
```bash
cd backend
pip install -r requirements.txt
```

2. Создайте файл `.env` в папке `backend/`:
```
YANDEX_API_KEY=ваш_ключ_geocoder
YANDEX_SUGGEST_API_KEY=ваш_ключ_suggest
PORT=8000
```

3. Получение API ключей Yandex:
   - Перейдите на https://developer.tech.yandex.ru/
   - Зарегистрируйтесь или войдите в аккаунт
   - Создайте новое приложение в разделе "API Геокодера" → получите `YANDEX_API_KEY`
   - Создайте приложение в разделе "API Геосаджеста" → получите `YANDEX_SUGGEST_API_KEY`
   - Вставьте полученные ключи в файл `.env`

4. Запустите сервер:
(все также находясь в /backend)
```bash
python main.py
```

Backend будет доступен на http://localhost:8000

### Frontend (PHP)

1. После установки mysql, импортируйте базу данных db.sql

2. Запустите PHP сервер
