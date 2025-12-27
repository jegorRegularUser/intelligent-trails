# Intelligent Trails - Next.js Migration

Умные маршруты для прогулок на Next.js + MongoDB + Yandex Maps.

## Технологии

- **Frontend**: Next.js 14 (App Router), React 19, TypeScript, Tailwind CSS
- **State**: Zustand
- **Backend**: Next.js API Routes
- **Database**: MongoDB (Mongoose)
- **Maps**: Yandex Maps JS API 2.1
- **Auth**: NextAuth.js v5 (будет добавлено)

## Установка

```bash
# 1. Установите зависимости
npm install

# 2. Создайте .env.local
cp .env.example .env.local

# 3. Заполните переменные окружения
# - MONGODB_URI - строка подключения MongoDB
# - YANDEX_API_KEY - ключ Yandex Geocoder API
# - NEXT_PUBLIC_YANDEX_API_KEY - публичный ключ Yandex Maps

# 4. Запустите разработку
npm run dev
```

## Функционал

### ✅ Реализовано

- Карта Yandex Maps
- Простой маршрут (A → B)
- Умная прогулка (активности)
- Поиск мест по категориям
- Генерация прогулок (scenic/direct)
- State management (Zustand)
- UI компоненты
- MongoDB модели

### 🚧 TODO

- Построение маршрута на карте (Yandex multiRouter)
- Геокодирование адресов
- NextAuth.js аутентификация
- Сохранение маршрутов в MongoDB
- Список сохраненных маршрутов

## Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   ├── search/places/  # Поиск мест
│   │   └── walks/generate/ # Генерация прогулок
│   └── map/                # Страница карты
├── components/
│   ├── map/                # Компоненты карты
│   ├── route-modal/        # Модалка построения
│   ├── info-panel/         # Панель информации
│   └── ui/                 # UI компоненты
├── lib/
│   ├── mongodb/            # MongoDB подключение
│   ├── yandex/             # Yandex API
│   ├── state/              # Zustand store
│   └── utils/              # Утилиты
├── models/                # Mongoose модели
└── types/                 # TypeScript типы
```

## API Endpoints

### POST /api/search/places

Поиск мест по категориям.

**Request:**
```json
{
  "center_coords": [44.0020, 56.3287],
  "categories": ["кафе", "парк"],
  "radius_m": 3000,
  "sequential": false
}
```

**Response:**
```json
{
  "success": true,
  "places_by_category": {
    "кафе": [...],
    "парк": [...]
  },
  "total_count": 15
}
```

### POST /api/walks/generate

Генерация прогулки на заданное время.

**Request:**
```json
{
  "start_point": [44.0020, 56.3287],
  "end_point": null,
  "duration": 60,
  "style": "scenic",
  "transport": "pedestrian"
}
```

**Response:**
```json
{
  "success": true,
  "waypoints": [[44.0020, 56.3287], ...],
  "estimated_distance": 4800,
  "estimated_time": 60
}
```

## Хостинг

Рекомендуемые бесплатные платформы:

- **Vercel** - лучшее для Next.js, auto-deploy из GitHub
- **MongoDB Atlas** - бесплатный кластер M0 (512MB)
- **Railway / Fly.io** - альтернативы с Docker

## Лицензия

MIT
