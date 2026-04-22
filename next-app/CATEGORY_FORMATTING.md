# Форматирование названий категорий в модальном окне ошибок

## Проблема
Раньше в модальном окне отображались технические ID категорий на английском:
- ❌ Категория: **bar**
- ❌ Категория: **cafe**
- ❌ Категория: **restaurant**

## Решение
Теперь используются переведенные названия из `BuilderSidebar`:
- ✅ Категория: **Бар** (ru) / **Bar** (en)
- ✅ Категория: **Кафе** (ru) / **Cafe** (en)
- ✅ Категория: **Ресторан** (ru) / **Restaurant** (en)

## Реализация

### 1. Утилита `categoryFormatter.ts`

```typescript
// Извлекает ID категории из текста ошибки
extractCategoryFromError("Не найдено мест категории \"cafe\" поблизости")
// → "cafe"

// Форматирует ID в читаемое название (fallback)
formatCategoryName("cafe")
// → "Cafe"
```

### 2. Компонент `RouteErrorModal`

```typescript
const tBuilder = useTranslations("BuilderSidebar");

const getFormattedCategoryName = (categoryId?: string): string | undefined => {
  if (!categoryId) return undefined;

  if (categoryId in PLACE_CATEGORIES) {
    // Используем перевод: BuilderSidebar.catCafe → "Кафе"
    const translationKey = `cat${categoryId.charAt(0).toUpperCase() + categoryId.slice(1)}`;
    return tBuilder(translationKey);
  }

  // Fallback: "cafe" → "Cafe"
  return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
};
```

## Примеры отображения

### Русский язык
```
┌─────────────────────────────────────────┐
│  🔴  Не удалось найти место             │
│      Сбои случаются, не переживайте     │
├─────────────────────────────────────────┤
│  Не найдено мест категории "cafe"      │
│  поблизости                             │
│                                         │
│  Категория: Кафе                        │
├─────────────────────────────────────────┤
│  Вы можете попробовать построить        │
│  маршрут заново или удалить эту точку   │
├─────────────────────────────────────────┤
│  [🗑️ Удалить точку] [🔄 Попробовать снова] │
└─────────────────────────────────────────┘
```

### Английский язык
```
┌─────────────────────────────────────────┐
│  🔴  Place Not Found                    │
│      Don't worry, these things happen   │
├─────────────────────────────────────────┤
│  No places found for category "bar"    │
│  nearby                                 │
│                                         │
│  Category: Bar                          │
├─────────────────────────────────────────┤
│  You can try building the route again   │
│  or remove this point                   │
├─────────────────────────────────────────┤
│  [🗑️ Remove Point] [🔄 Try Again]        │
└─────────────────────────────────────────┘
```

## Поддерживаемые категории

Все 9 категорий автоматически форматируются:

| ID | Русский | English |
|---|---|---|
| cafe | Кафе | Cafe |
| restaurant | Ресторан | Restaurant |
| park | Парк | Park |
| museum | Музей | Museum |
| attraction | Достопримечательность | Attraction |
| bar | Бар | Bar |
| cinema | Кинотеатр | Cinema |
| shopping | Магазин | Shopping |
| viewpoint | Смотровая площадка | Viewpoint |

## Тесты

Добавлены 7 unit-тестов в `categoryFormatter.test.ts`:
- ✅ Извлечение категории из русского текста ошибки
- ✅ Извлечение категории из ошибки финиша
- ✅ Обработка сообщений без категории
- ✅ Обработка undefined
- ✅ Форматирование валидных ID категорий
- ✅ Форматирование неизвестных категорий
- ✅ Обработка пустой строки

Все тесты проходят успешно ✅
