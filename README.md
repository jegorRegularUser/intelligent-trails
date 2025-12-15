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
   - Создайте приложение в разделе "API Поиска по организациям" → получите `YANDEX_SUGGEST_API_KEY`
   - Вставьте полученные ключи в файл `.env`

4. Запустите сервер:
```bash
python main.py
```

Backend будет доступен на http://localhost:8000

### Frontend (PHP)

1. Установите MySQL и создайте базу данных:
```bash
mysql -u root -p
CREATE DATABASE dvoinydx_db;
```

2. Импортируйте схему базы данных:
```bash
cd php-frontend
mysql -u root -p dvoinydx_db < db.sql
```

3. Отредактируйте файл `php-frontend/config.php`:
```php
$host = 'localhost';
$db   = 'dvoinydx_db';
$user = 'root';  // ваш MySQL пользователь
$pass = 'ваш_пароль';

define('YANDEX_CLIENT_ID', 'ваш_yandex_oauth_client_id');
define('YANDEX_CLIENT_SECRET', 'ваш_yandex_oauth_secret');
define('YANDEX_REDIRECT_URI', 'http://localhost/yandex_callback.php');

// Автоматическое определение окружения
if ($_SERVER['HTTP_HOST'] === 'localhost' || $_SERVER['HTTP_HOST'] === 'localhost:80') {
    define('BACKEND_API_URL', 'http://localhost:8000');
} else {
    define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');
}
```

4. Получение Yandex OAuth ключей:
   - Перейдите на https://oauth.yandex.ru/
   - Создайте новое приложение
   - В настройках приложения добавьте Redirect URI: `http://localhost/yandex_callback.php`
   - Скопируйте Client ID и Client Secret
   - Вставьте их в файл `config.php` в соответствующие константы `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`

5. Запустите PHP сервер:
```bash
cd php-frontend
php -S localhost:80
```

Frontend будет доступен на http://localhost

## Настройка автоматического переключения между окружениями

В файле `php-frontend/config.php` используется автоматическое определение окружения:

```php
// Если запущено локально - используется uvicorn, иначе - Render
if ($_SERVER['HTTP_HOST'] === 'localhost' || $_SERVER['HTTP_HOST'] === 'localhost:80') {
    define('BACKEND_API_URL', 'http://localhost:8000');
} else {
    define('BACKEND_API_URL', 'https://intelligent-trails.onrender.com');
}
```

Фронтенд автоматически определит окружение:
- **Локально** → обращается к `http://localhost:8000` (uvicorn)
- **На продакшене** → обращается к `https://intelligent-trails.onrender.com`
