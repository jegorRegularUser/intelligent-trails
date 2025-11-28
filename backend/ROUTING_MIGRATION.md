# 🚀 Миграция на гибридную систему маршрутизации

## 📊 Что изменилось

### ДО (OSRM только)
```python
# Один сервис, ограниченные возможности
route_data = await yandex_api.build_route(waypoints, mode)

Проблемы:
❌ Нет общественного транспорта
❌ Нет учета пробок
❌ Одна точка отказа
❌ Публичный сервер может быть медленным
```

### ПОСЛЕ (Гибридная система)
```python
# 3 сервиса, автоматический fallback, кеширование
route_data = await routing_service.build_route(waypoints, mode)

Преимущества:
✅ OSRM (100% бесплатный) - пешком
✅ GraphHopper (500/день) - велосипед
✅ Mapbox (100k/месяц) - авто с пробками!
✅ Автоматический fallback
✅ Кеширование (30 дней)
✅ Статистика использования
```

---

## 🛠️ Настройка

### Шаг 1: Копировать .env.example

```bash
cd backend
cp .env.example .env
```

### Шаг 2: Минимальная конфигурация (работает сразу)

**Ничего не нужно менять!** OSRM уже работает:

```env
# .env может быть пустым - OSRM работает без ключей
```

✅ **Подходит для**: пешие прогулки, велосипед

---

### Шаг 3: Рекомендуемая конфигурация (полный функционал)

#### 3.1. Регистрация GraphHopper (5 минут)

1. Перейдите: https://www.graphhopper.com/dashboard/#/register
2. Зарегистрируйтесь (бесплатно)
3. Подтвердите email
4. Dashboard → **API Keys** → **Create New Key**
5. Скопируйте ключ

```env
GRAPHHOPPER_API_KEY=ваш_ключ_здесь
```

✅ **Лимит**: 500 запросов/день  
✅ **Лучше всего для**: велосипедные маршруты

#### 3.2. Регистрация Mapbox (5 минут)

1. Перейдите: https://account.mapbox.com/auth/signup/
2. Зарегистрируйтесь (бесплатно)
3. Подтвердите email
4. Account → **Access tokens** → **Create a token**
5. Включите `Directions API` scope
6. Скопируйте токен

```env
MAPBOX_API_KEY=ваш_токен_здесь
```

✅ **Лимит**: 100,000 запросов/месяц (≈ 3,300/день)  
✅ **Лучше всего для**: автомобильные маршруты с пробками!

---

## 📝 Итоговый .env

```env
# ПОЛНАЯ конфигурация (рекомендуемая)
GRAPHHOPPER_API_KEY=your_actual_graphhopper_key
MAPBOX_API_KEY=pk.eyJ1Ijoieour_actual_mapbox_token

# МИНИМАЛЬНАЯ конфигурация (только OSRM)
# Пустой файл .env - тоже работает!
```

---

## 🔄 Как работает fallback

### Приоритеты сервисов

```python
# Пешком (pedestrian/walking)
OSRM → GraphHopper → Mapbox
✓ OSRM быстрый и бесплатный
✓ Если недоступен → GraphHopper (500/день)
✓ Если и он недоступен → Mapbox (100k/месяц)

# Авто (auto/driving)
Mapbox → GraphHopper → OSRM
✓ Mapbox учитывает пробки! (driving-traffic)
✓ Если лимит исчерпан → GraphHopper
✓ Если и он недоступен → OSRM

# Велосипед (bicycle)
GraphHopper → OSRM → Mapbox
✓ GraphHopper специализируется на веломаршрутах
✓ OSRM как backup
✓ Mapbox если остальные недоступны
```

### Пример работы

```
[ЗАПРОС] Построить маршрут пешком
  ↓
[OSRM] Пытаемся построить...
  ✓ Успех! Возвращаем маршрут
  ↓
[КЕШ] Сохраняем на 30 дней
  ↓
[РЕЗУЛЬТАТ] Маршрут построен через OSRM

---

[ЗАПРОС] Построить маршрут на авто
  ↓
[MAPBOX] Пытаемся (учет пробок!)...
  ✗ Лимит исчерпан (429 error)
  ↓
[GRAPHHOPPER] Fallback...
  ✓ Успех!
  ↓
[РЕЗУЛЬТАТ] Маршрут построен через GraphHopper
```

---

## 📊 Мониторинг

### Проверить статистику использования

```bash
curl http://localhost:8000/routing/stats
```

```json
{
  "services": {
    "osrm": {
      "success": 45,
      "errors": 2
    },
    "graphhopper": {
      "success": 12,
      "errors": 0
    },
    "mapbox": {
      "success": 8,
      "errors": 1
    }
  },
  "total": {
    "success": 65,
    "errors": 3,
    "success_rate": 95.59
  },
  "cache": {
    "size": 42,
    "ttl_days": 30
  }
}
```

### Очистить кеш

```bash
curl -X POST http://localhost:8000/routing/clear_cache
```

---

## 🧪 Тестирование

### 1. Запустить сервер

```bash
cd backend
uvicorn main:app --reload
```

### 2. Проверить статус

```bash
curl http://localhost:8000/status
# {"status": "ok"}
```

### 3. Протестировать маршрутизацию

```bash
curl -X POST http://localhost:8000/calculate_smart_walk \
  -H "Content-Type: application/json" \
  -d '{
    "start_point": {
      "name": "Красная площадь",
      "coords": [55.7539, 37.6208]
    },
    "activities": [
      {
        "type": "walk",
        "duration_minutes": 30,
        "walking_style": "scenic",
        "transport_mode": "pedestrian"
      }
    ]
  }'
```

Проверьте логи - вы увидите какой сервис был использован!

---

## 🔍 Частые вопросы

### Что будет, если не указать API ключи?

✅ **Все работает!** OSRM работает без ключей, только GraphHopper и Mapbox будут пропущены.

### Что будет, если лимит GraphHopper исчерпан?

✅ **Автоматический fallback на следующий сервис.** Пользователь не заметит.

### Как долго хранится кеш?

📅 **30 дней.** После этого маршрут будет перестроен заново.

### Можно ли отключить кеширование?

✅ **Да:**
```python
route_data = await routing_service.build_route(
    waypoints, 
    mode, 
    use_cache=False  # Отключить кеш
)
```

### Что случилось с Яндекс API?

💸 **Яндекс Router API требует платную подписку** (от 195,000₽/год). Мы перешли на бесплатные альтернативы с лучшим функционалом.

---

## 🚀 Что дальше?

### Ближайшие улучшения

- [ ] Добавить Redis для кеша (вместо in-memory)
- [ ] Добавить HERE Maps API (еще 250k/месяц бесплатно)
- [ ] Общественный транспорт через OpenTripPlanner
- [ ] Графики использования API в dashboard
- [ ] Webhook уведомления при приближении к лимитам

---

## 💬 Поддержка

Если возникли проблемы:

1. Проверьте логи сервера - там подробная информация
2. Проверьте `/routing/stats` - может лимит исчерпан
3. Проверьте API ключи в .env
4. Попробуйте очистить кеш: `POST /routing/clear_cache`

---

**Готово к использованию!** 🎉
