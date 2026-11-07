# Параллельные чаты — промпты (Фазы 1–4)

Каждый промпт — самодостаточный: скопируй целиком в новый чат ZCode с рабочей
папкой соответствующего ворктри. Ветки уже созданы, контракт geo-слоя на main.
Все чаты работают параллельно и не пересекаются по файлам. Пушить ничего не
нужно — мержом займётся интеграционный чат.

Общие правила (уже вшиты в каждый промпт): сначала дизайн-док → потом код;
0 ошибок tsc/lint; юнит-тесты на фейках; build зелёный; не трогать чужие зоны.

---

## Чат A — Geo-provider (ворктри `C:\Users\dvoin\files\programming\it-geo-provider`)

```
Ты работаешь в репо C:\Users\dvoin\files\programming\it-geo-provider (ветка feat/geo-provider, не пушить).

ПРОЧТИ СНАЧАЛА (это контракт, не опционально):
- docs/PRODUCT.md — продуктовая логика
- docs/ADR/adr-001-geo-provider.md — архитектура geo-слоя
- next-app/src/lib/geo/types.ts — ЗАМОРОЖЕННЫЙ контракт GeoProvider/GeoError

МИССИЯ: реализовать CloudProvider — универсальный geo-адаптер, работающий в любом
городе на публичных сервисах (тир 1 из ADR). Пакетный тир (PackProvider) пока
не делается, но архитектура должна его допускать.

ПОСТАВЬ ДИЗАЙН ВПЕРЕДИ КОДА: сначала короткий дизайн-док docs/geo-cloud-design.md
(структура модулей, политика таймаутов/ретраев, лимиты бесплатных тиров и как
честно деградировать при их исчерпании, как тестировать без сети) — потом код.

ФУНКЦИОНАЛ (реализуй полностью, без заглушек):
1. Роутинг: OpenRouteService foot-walking (POST /v2/directions/foot-walking/geojson,
   ключ из env OPENROUTESERVICE_API_KEY). GeoJSON → RouteSegment {distanceMeters,
   durationSeconds, geometry}. Нет ключа/лимит → GeoError('NO_ROUTE') с внятным message.
2. Матрица: POST /v2/matrix/foot-walking, чанкинг ≤40 источников на запрос
   (паттерн: источники чанком + ВСЕ цели, индексы целей относительные внутри
   чанка — этот баг уже однажды ловили, не повтори), склейка ячеек, null для
   недостижимых. Ответы матрицы кэшировать.
3. Геокодинг/реверс/подсказки: Photon public (https://photon.komoot.io) с bias
   по текущей точке; fallback Nominatim (1 запрос/сек строго, User-Agent обязателен).
4. POI: Overpass — переиспользуй идеи существующих next-app/src/services/osm.ts и
   overpassClient.ts (зеркала, эскалация радиуса, коридорный поиск), но оформи как
   адаптер над GeoProvider.searchPlaces с маппингом тегов из constants/categories.ts.
5. Кэш: единый модуль TTL+LRU, ключи — координаты, округлённые до 5 знаков (~1.1м).
6. isFastArea → всегда false (PackProvider придёт позже).
7. Валидация входов: координаты конечные, lat ±90, lng ±180 → GeoError('INVALID_INPUT').
8. DI: конструктор принимает fetchImpl (по умолчанию global fetch) — все юнит-тесты
   на фейковых апстримах, ноль живой сети.

ЗОНА ФАЙЛОВ (не выходить): next-app/src/lib/geo/** (types.ts — только читать),
next-app/.env.example (добавить ключи с комментариями).
i18n не нужен (серверный слой). UI не трогать, server actions не трогать.

ТЕСТЫ: URL-формы запросов к апстримам, чанк-математика матрицы, попадания в кэш,
маппинг ошибок (422 NOT_FOUND vs 502 UPSTREAM_INVALID vs 504 TIMEOUT), rate-limit
Nominatim. Один опциональный живой тест — файлом *.integration.test.ts (CI его исключает).

ВЕРИФИКАЦИЯ (обязательна перед отчётом): cd next-app && npm install && npx tsc --noEmit
(0 ошибок) && npm run lint (0 ошибок) && npx vitest run --exclude "**/*.integration.test.*"
(зелёное) && npm run build. Коммить атомарно. В конце: список коммитов, что проверено,
открытые вопросы.
```

---

## Чат B — Движок прогулки (ворктри `C:\Users\dvoin\files\programming\it-walk-engine`)

```
Ты работаешь в репо C:\Users\dvoin\files\programming\it-walk-engine (ветка feat/walk-engine, не пушить).

ПРОЧТИ СНАЧАЛА:
- docs/PRODUCT.md — это ТЗ продукта; раздел «Метрика хорошей прогулки» — твои гейты
- docs/ADR/adr-001-geo-provider.md и next-app/src/lib/geo/types.ts — контракт данных
  (RouteSegment, MatrixCell, GeoPlace, LatLng)
- next-app/src/utils/placeRanking.ts — старые эвристики (конус направления там
  посчитан неправильно: dot product в сырых градусах; не копируй эту ошибку)

МИССИЯ: чистый детерминированный движок прогулок src/lib/walk — сердце продукта.
Никакого UI и сети: движок получает кандидатов и порт маршрутизации, выдаёт план.

ПОСТАВЬ ДИЗАЙН ВПЕРЕДИ КОДА: docs/walk-engine.md — алгоритм по шагам, сложности,
failure modes (мало кандидатов, недостижимые ячейки, бюджет слишком мал → отказ
типом NOT_ENOUGH_TIME, а не мусорный план), потом код.

ФУНКЦИОНАЛ:
1. createWalkPlan(input, ports) где input = {start: LatLng, budgetMinutes,
   categoryWeights: Record<string, number>, candidates: GeoPlace[], isLoop: boolean,
   walkingSpeedKmh?: default 4.5}, ports = {matrix(sources, targets), route(wp)} —
   объяви ЛОКАЛЬНЫЙ структурный порт (совместимый с GeoProvider), движок не должен
   импортировать geo/types напрямую (только LatLng/GeoPlace через структуру).
2. Отбор кандидатов: коридор к финишу (для A→B) шириной, пропорциональной длине;
   для петли — радиус из бюджета: (speed × walkableMinutes) с учётом stay-оверхеда;
   cap 60 кандидатов; cap матрицы: чанкинг на стороне порта.
3. Порядок остановок: nearest neighbor по матрице ВРЕМЁН ходьбы + улучшение 2-opt
   (петля: фиксируем старт, улучшаем кольцо; A→B: фиксируем оба конца).
4. Петля замыкается в старт; бюджет = Σходьба + Σstay; подбор количества остановок:
   добавлять, пока влезает в бюджет ±10%.
5. Гейты качества (PRODUCT.md): бюджет ±10%; ≥2 якоря с непустой reason; ни один
   leg > 25 мин без остановки; петля не возвращается по той же улице (эвристика
   на полилиниях leg'ов — задокументируй выбор); gateReport: {gate, pass, detail}.
6. Альтернативы: 3 варианта плана (джиттер радиуса/весов), отсорт по
   (все гейты pass, затем score = Σweight выбранных − штраф за leg>25min).
7. reason якоря: строка-обоснование («крупный парк на пути», «лучший скор
   категории в коридоре») — по-русски, из фактов выбора, не из воздуха.
8. Если маршрута нет (null-ячейки) — честная деградация: исключить кандидата.

ТЕСТЫ (все оффлайн): FakeRoutingPort на детерминированной сетке-городе
(задокументируй синтетику); для случайных сидов: бюджет соблюдён, гейты
проверены; 2-opt не хуже NN по времени; отказ при невозможности.

ЗОНА ФАЙЛОВ: next-app/src/lib/walk/**, docs/walk-engine.md. Никакого UI, no server
actions, constants/categories.ts можно читать.

ВЕРИФИКАЦИЯ (обязательна): cd next-app && npm install && npx tsc --noEmit (0) &&
npm run lint (0) && npx vitest run --exclude "**/*.integration.test.*" (зелёное) &&
npm run build. Коммить атомарно. В конце: коммиты, что проверено, открытые вопросы.
```

---

## Чат C — Карточки мест (ворктри `C:\Users\dvoin\files\programming\it-place-cards`)

```
Ты работаешь в репо C:\Users\dvoin\files\programming\it-place-cards (ветка feat/place-cards, не пушить).

ПРОЧТИ СНАЧАЛА:
- docs/PRODUCT.md (принципы: карточка существует внутри прогулки; честная деградация)
- next-app/src/lib/geo/types.ts (ReverseGeocodeResult — сырьё)
- next-app/src/constants/categories.ts, next-app/src/utils/categoryFormatter.ts,
  next-app/src/types/map.ts

МИССИЯ: «карточка места» — что это, зачем останавливаться, работает ли сейчас.
Два слоя: чистая логика (src/lib/places) + презентационные компоненты (src/components/places).

ПОСТАВЬ ДИЗАЙН ВПЕРЕДИ КОДА: docs/place-cards.md — правила приоритетов и шаблоны
лейблов, потом код.

ФУНКЦИОНАЛ (алгоритм перенеси из отработанного решения на Java — ниже точные правила):
1. src/lib/places/card.ts — buildPlaceCard(reversed, nearby, nearestRoad?):
   - Приоритеты: именованное здание/объект в ≤20м БЬЁТ дорогу; дорога принимается
     только если она в ≤5м; дом с адресом ≤20м; fallback — любой ближайший дом.
   - Enrichment: ближайший релевантный landmark в ≤150м (другой osmId, тот же город,
     не postcode) → суффикс лейбла «(рядом: …)».
   - Локализованное имя: name:ru → name. Лейблы ru/en.
   - Дедуп алиасов: «памятник Пушкину», а не «памятник памятник Пушкину».
2. src/lib/places/hours.ts — парсер подмножества OSM opening_hours: '24/7',
   'Mo-Fr 09:00-18:00', 'Sa,Su 10:00-22:00', 'off', списки через ';' → open/closed
   для переданного Date (таймзону передавать параметром). Всё непонятное →
   state:'unknown' (никогда не врать 'closed' на нераспарсенном). Тесты на границы
   (23:59, ровно открытие, ночь через полночь).
3. src/lib/places/kinds.ts — словарь ~40 OSM-kind'ов → {ru, en, icon (lucide-react)}:
   cafe, restaurant, park, museum, memorial, monument, viewpoint, fountain, bridge,
   mall, cinema, bar, bakery, pharmacy, subway_station... unknown → нейтральная иконка.
4. UI: src/components/places/PlaceCard.tsx (полная карточка: имя, kind-иконка+подпись,
   адрес, расстояние, бейдж open/closed/unknown, слот «почему сюда»), PlaceMiniCard.tsx
   (якорная мини-карточка: позиционирование через CSS-переменные + пиксельный clamp,
   хук useAnchoredPosition), мобильный вариант — bottom sheet. Всё пропсами, БЕЗ
   зависимости от карт-библиотек (адаптер к карте напишет интеграционный чат).
5. Демо-страница src/app/dev/cards/page.tsx (noindex) с карточками на фикстурах —
   чтобы результат можно было показать глазами.
6. i18n: добавить ТОЛЬКО namespace Places.* в messages/ru.json и en.json.

ТЕСТЫ: парсер hours (границы), дедуп лейблов, правила приоритетов, kinds-словарь
(полнота р покрытие unknown).

ЗОНА ФАЙЛОВ: next-app/src/lib/places/**, next-app/src/components/places/**,
next-app/src/app/dev/cards/**, messages/*.json (только добавление Places.*).
НЕ ТРОГАЙ: RouteMap*, RouteSidebar*, useRouteStore, src/lib/geo, actions.

ВЕРИФИКАЦИЯ (обязательна): cd next-app && npm install && npx tsc --noEmit (0) &&
npm run lint (0) && npx vitest run --exclude "**/*.integration.test.*" (зелёное) &&
npm run build. Коммить атомарно. В конце: коммиты, что проверено, открытые вопросы.
```

---

## Чат D — Вайбы и контекст (ворктри `C:\Users\dvoin\files\programming\it-vibes-context`)

```
Ты работаешь в репо C:\Users\dvoin\files\programming\it-vibes-context (ветка feat/vibes-context, не пушить).

ПРОЧТИ СНАЧАЛА:
- docs/PRODUCT.md — раздел «Сценарии-архетипы» это твоё ТЗ
- next-app/src/constants/categories.ts (9 категорий), next-app/src/utils/placeRanking.ts
  (старый скоринг — портируй идеи, но файл НЕ меняй),
  next-app/src/lib/geo/types.ts (GeoPlace)

МИССИЯ: «формула прогулки» — архетипы-профили, погодный контекст и скоринг мест v2.

ПОСТАВЬ ДИЗАЙН ВПЕРЕДИ КОДА: docs/vibes.md — таблицы весов с обоснованием каждого
числа, как вес взаимодействует с погодой/временем суток, потом код.

ФУНКЦИОНАЛ:
1. src/lib/vibes/archetypes.ts — 5 архетипов: green, coffee, evening, rainy, surprise.
   Каждый: {id, labelRu/labelEn, categoryWeights: Record<category, number>,
   indoorBias: 0-1, shadePriority: 0-1, stayMinutes: Record<category, number>,
   hourAffinity: (hour) => number, descriptionRu/En}. Инварианты тестами:
   каждая из 9 категорий покрыта весом, веса конечные.
2. src/lib/vibes/ranking.ts — scorePlace(place, ctx) → {score, reasonsRu[], reasonsEn[]}:
   база — качество места (портируй из placeRanking.ts: rating, popularity-прокси
   по тегам wikipedia/website/phone/opening_hours, size-бонус парков), далее вес
   архетипа, indoor/outdoor соответствие (поле indoor из GeoPlace + эвристика
   по категории), бонус «открыто сейчас» (инъекция: ctx.hoursState?: 'open'|'closed'|'unknown'
   — структурный тип, НЕ импорт из чужой зоны), погодные модификаторы.
   Диверсификация: перепиши selectDiverseAlternatives с правильной метрикой
   (эквидистантная проекция вместо сырых градусов). reasons — человекочитаемые
   обоснования выбора (по-русски и по-английски).
3. src/lib/weather/index.ts — Open-Meteo (без ключа): current + hourly 24ч
   (temperature_2m, precipitation, weather_code, is_day). Кэш 30 мин, ключ —
   координаты до 0.1°. WeatherContext {tempC, isRaining, precipNext2h, isDark},
   mapToHints(ctx) → {preferIndoor, preferShade, preferLighted}. Любая ошибка сети
   → null (деградация), тесты на injected fetch.
4. Связка: combineContext(archetype, weather | null, now) → скорректированный
   профиль (дождь → поднять indoorBias и вес крытых категорий; жара >27°C →
   shadePriority и зелень; тьма → evening-аффинити). Правила тестами.

ЗОНА ФАЙЛОВ: next-app/src/lib/vibes/**, next-app/src/lib/weather/**, docs/vibes.md.
НЕ ТРОГАЙ: utils/placeRanking.ts (исчезнет на интеграции), src/lib/places (там
карточки — другая ветка), UI, actions.

ВЕРИФИКАЦИЯ (обязательна): cd next-app && npm install && npx tsc --noEmit (0) &&
npm run lint (0) && npx vitest run --exclude "**/*.integration.test.*" (зелёное) &&
npm run build. Коммить атомарно. В конце: коммиты, что проверено, открытые вопросы.
```

---

## Чат E — Главный экран UX (ворктри `C:\Users\dvoin\files\programming\it-ui-shell`)

```
Ты работаешь в репо C:\Users\dvoin\files\programming\it-ui-shell (ветка feat/ui-shell, не пушить).

ПРОЧТИ СНАЧАЛА:
- docs/PRODUCT.md — ЦЕЛИКОМ. Твой продукт — принципы 1-3: прогулка без регистрации,
  один главный экран (карта + одна карточка «твоя прогулка»), локальная перестройка.
- next-app/src/components/features/RouteBuilderSidebar.tsx (текущий билдер — станет
  «эксперт-режимом», его НЕ трогаешь), next-app/src/store/useRouteStore.ts (форма
  состояния), next-app/src/components/ui/* (готовые примитивы), globals.css
  (Tailwind 4 токены темы brand-*).

МИССИЯ: спроектировать и собрать новый главный сценарий «Прогуляться сейчас» —
быстрый старт и живая карточка прогулки. Это САМЫЙ дизайнерский чат из пяти:
внешний вид и ощущения решают всё.

ЭТАП 1 — ДИЗАЙН (обязателен, до кода): docs/ux-main-screen.md с ASCII-варфреймами
(десктоп + мобайл) для состояний: пусто / выбор параметров / строится / готово /
ошибка / нет сети. Продумай и ЗАПИШИ обоснования: иерархия (что видит глаз первым),
тайминг-чипы 30/60/90/кастом, чипы вайбов (зелёная/кофейная/вечерняя/дождь/удиви),
сводка прогулки (петля или A→B; время: ходьба+стоянки; влезание в бюджет — бейдж),
таймлайн остановок с причинами, замена остановки в один тап. Мобильный — сначала.

ЭТАП 2 — КОМПОНЕНТЫ src/components/walk/:
- QuickStartPanel: чипы времени + чипы вайбов + CTA «Собрать прогулку»;
  состояния loading/disabled, aria-атрибуты на чипах.
- WalkSummaryCard: заголовок (тип, длительность, разбор ходьба/стоянки, бейдж
  «в бюджете ±10%»), таймлайн StopRow (имя, kind, stay, причина, кнопка «заменить»
  → callback onSwapRequest(stopId)).
- Состояния: скелетоны загрузки, empty, error с retry.
- Данные: fixtures.ts с 2-3 фейковыми объектами типа WalkPlan (объяви локальный
  тип по форме будущего движка: stops[{id, name, kind, stayMin, reason}],
  legs[{walkMin}], totals) — никакой интеграции с движком/стором, только визуал
  и интеракции на колбэках.
- i18n: ТОЛЬКО добавление namespace WalkUI.* в messages/ru.json и en.json.
- Опционально, изолированно: src/components/ui/SketchCard.tsx — эксперимент с
  hand-drawn стилем (rough.js поверх SVG-оверлея) — только как демо на dev-странице,
  по умолчанию выключен.

ТЕСТЫ: минимальные рендер-тесты не обязательны, но логика выбора чипов/состояний
— чистые функции с тестами.

ЗОНА ФАЙЛОВ: next-app/src/components/walk/**, next-app/src/components/ui/SketchCard.tsx
(опционально), docs/ux-main-screen.md, messages/*.json (только WalkUI.*).
НЕ ТРОГАЙ: RouteMap*, RouteSidebar*, RouteBuilderSidebar, store, actions, ui-примитивы
(расширять можно, ломать нельзя).

ВЕРИФИКАЦИЯ (обязательна): cd next-app && npm install && npx tsc --noEmit (0) &&
npm run lint (0) && npx vitest run --exclude "**/*.integration.test.*" (зелёное) &&
npm run build. Коммить атомарно. В конце: коммиты, что проверено, открытые вопросы.
```

---

## Как запускать

1. Открой новый чат ZCode с рабочей папкой соответствующего ворктри.
2. Вставь промпт целиком.
3. Когда все ветки готовы — интеграционный чат на `main` мержит ветки
   (geo-provider → walk-engine → place-cards + vibes-context → ui-shell)
   и проводит сквозную интеграцию.
