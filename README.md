# Intelligent Trails

Генератор прогулок: человек говорит, сколько у него времени и какое настроение —
сайт строит готовый пешеходный маршрут (петлю или A→B) с осмысленными остановками,
честным таймингом и учётом контекста (погода, тень, вечер). Продуктовая логика
и принципы — в [docs/PRODUCT.md](docs/PRODUCT.md).

## Структура репозитория

```
next-app/    — единственное живое приложение (Next.js 16, App Router)
docs/        — продуктовая документация
.github/     — CI (build+lint+tests) и деплой на VPS
```

Исторические поколения проекта (PHP-дипломная версия, FastAPI-прокси, Vite-SPA)
удалены — они жили в `backend/`, `php-frontend/`, `frontend/` до фазы очистки.

## Локальный запуск

```bash
cd next-app
cp .env.example .env.local   # заполни ключи
npm install
npm run dev                  # http://localhost:3000
```

### Переменные окружения

| Переменная | Зачем |
|---|---|
| `MONGODB_URI` | MongoDB (маршруты, юзеры, NextAuth-адаптер) |
| `AUTH_SECRET` | Секрет NextAuth v5 (`openssl rand -base64 32`) |
| `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` | OAuth Яндекс |
| `NEXT_PUBLIC_YANDEX_API_KEY` | JS API Яндекс.Карт (отрисовка карты) |
| `NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY` | Подсказки адресов (опционально) |

## Стек

- **Next.js 16** (App Router, React Compiler, Server Actions) + React 19
- **Tailwind CSS 4**, zustand, next-intl (ru/en — локаль в cookie, не в URL)
- **MongoDB** (сессии, сохранённые маршруты), next-auth v5 (Yandex OAuth + credentials)
- Карта: Яндекс.Карты JS API (миграция на MapLibre + собственные тайлы — в планах)

## Команды

```bash
npm run dev      # разработка
npm run build    # production-сборка
npm run lint     # eslint
npm test         # vitest (юнит-тесты)
```

Интеграционный тест Overpass (`*.integration.test.ts`) ходит в живую сеть —
в CI он исключён, запускается локально вручную: `npx vitest run`.

## Дорожная карта

1. ✅ Фаза 0 — уборка легаси, cookie-локаль, CI, кредиты вне репозитория
2. Geo-provider слой: облачные источники (любой город) + пакеты регионов как ускоритель
3. Движок прогулки v2: серверный роутинг, матрица расстояний, петли, бюджет времени
4. Карточки мест: reverse-geocode с landmark-обогащением, viewport-загрузка POI
5. Формула прогулки: сценарии-архетипы, тень/зелень (ESA WorldCover), погода
6. Карта: MapLibre + собственные векторные тайлы
