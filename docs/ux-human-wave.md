# Волна «Human design» — дизайн-док (карта, вход, честность)

> Статус: правлен по холодной критике (2026-11-17): B1–B4, S1–S5, F1, C1–C4
> внесены. Контракт: docs/PRODUCT.md (принципы 1–5), docs/ux-main-screen.md.
> Диагноз — из UX-разведки кода 2026-11-17.

## Диагноз

Главный сценарий закрыт лендингом (`/` → маркетинг → CTA → `/map`); мобильная
шторка не рендерит контент до тапа и бинарна по высоте (`RoutePanel.tsx:16,57,93`)
вместо 45%→85dvh из спеки; у быстрой прогулки нет шаринга; карта в `building`
мертва и полностью перерисовывается на каждой замене/листании вариантов
(`fitNonce` → пересоздание пинов + `setBounds`); пины — стоковые пресеты
Яндекса; причина теряется в карточке пина (`RouteMap.tsx:17-44`); причины в
таймлайне — язык скоринга; отказ геолокации объясняется как общая поломка;
`AddressInput` молчит при ошибке геокодера; «Новый город» — переименованный
быстрый режим без пикера города; при недоступной погоде сайт утверждает
«Погода располагает к прогулке» — враньё по принципу 5.

## Решения (зафиксированы до кода)

- **Стек карты**: maplibre-gl для главного сценария (quick / sightseeing /
  пикер точек / карточки пинов). Эксперт-режим **временно остаётся на
  Яндексе**: его метрики и транспортные альтернативы живут в рантайме
  `multiRouter.MultiRoute` (`RouteMap.tsx:224-303`) — ре-платформа
  транспортного роутинга вне волны. ADR-заметка `docs/ADR/adr-003-maplibre.md`.
- **Критерий переключения стеков** (блокер B2): `RouteMapLoader` выбирает
  `MapCanvas`, если `walkMode !== 'route' && mapPoints.length === 0`, и
  `RouteMap` (Яндекс) иначе. При гидрации `?r=` в `RouteSidebarManager`
  (там, где заполняется `mapPoints`) дополнительно выставлять
  `walkMode='route'` — до правки стор остаётся `'quick'`
  (`useRouteStore.ts:101`) при заполненном `mapPoints`
  (`RouteSidebarManager.tsx:59-108`). Инвариант: эксперт-линия и quick-линия
  не рисуются одновременно; на `?r=` карта — всегда Яндекс.
- **Бандл-инвариант** (C1): `RouteMap` и `MapCanvas` — оба только через
  `dynamic(ssr:false)` внутри `RouteMapLoader`; статический импорт RouteMap
  в лоадере запрещён (иначе Яндекс-чанк на `/`). Скрипт Яндекса инжектится
  при монтировании `YMaps` — на `/` не монтируется. `maplibre-gl` (+CSS
  `maplibre-gl/dist/maplibre-gl.css`) — новый dep; vitest в node-среде
  (`vitest.config.ts:9`) — WebGL-тестов на MapCanvas не пишем.
- **Тайлы**: OpenFreeMap без ключа — `https://tiles.openfreemap.org/styles/positron`
  (лимит только на offline-выгрузки; атрибуция OpenFreeMap / © OpenMapTiles /
  OSM обязательна). Риск positron (C2): бледные footway/path на z14-15 — на
  живом смоуке сравнить с `liberty`; `STYLE_URL` — константа
  (`src/components/map/maplibre/style.ts`), стиль меняется одной строкой.
  Фолбэк при недоступности тайлов — raster CARTO light_all (атрибуция по
  лицензии).
- **Фотографии мест**: НЕТ (принцип `docs/place-cards.md:19` не пересматриваем;
  красоту даёт карта и карточки).
- **Сохранение в историю** (S4): остаётся на expert-кодеке
  (`quickWalkToEncodedRoute`) в этой волне — из истории маршрут открывается
  в expert-режиме, как сегодня. Миграция истории на `?w=` — отдельный пункт
  roadmap, не здесь.
- **Эксперт-линия приоритетна**: при `mapPoints.length > 0` quick-полилиния
  не рисуется (семантика `RouteMap.tsx:353,379-380` сохраняется).

## M1. Карта на maplibre (рендер главного сценария)

Файлы: `src/components/map/maplibre/MapCanvas.tsx` (ядро), `useMapRoute.ts`,
`useMapPins.ts`, `useMapLocale.ts`; `RouteMap.tsx` (Яндекс) — только expert.
Полный список точек интеграции (S2, дополнен критикой):

1. Геолокация при монтировании + `setStoreUserLocation` (`RouteMap.tsx:63-88`)
   — на неё опирается bias подсказок `AddressInput` (`AddressInput.tsx:28,46`);
   повторить в MapCanvas.
2. Пин «вы здесь» (`RouteMap.tsx:91-110`, ключ `Map.youAreHere`).
3. Проекция для `PlaceMiniCard`: адаптер `map.project([lng,lat])` вместо
   Яндекс `toGlobalPixels`+`globalToPage` (`RouteMap.tsx:363-375`);
   `useAnchoredPosition` принимает пиксели — библиотечно-независима
   (`useAnchoredPosition.ts:56-141`).
4. Пере-якорение открытой карточки на движение карты: событие `move`
   (вместо `boundschange`).
5. Язык подписей: `setLayoutProperty` text-field (`name` / `name:ru` /
   `name:latin`) по `mapLocale` из `PreferencesContext` — вместо `lang:` опции
   Яндекса (`RouteMap.tsx:451-455`).
6. Приоритет эксперт-линии (см. «Решения»).
7. Семантика закрытия карточки: по `fitNonce` (`RouteMap.tsx:446-448`) →
   по факту исчезновения stop id из плана (см. F1).
8. Suppression-опции Яндекса (`RouteMap.tsx:468-471`) — не переносятся,
   аналога не искать.

- **Линия маршрута**: GeoJSON source + два line layer: кэш (белая 9px, 0.9)
  + основной (brand-600, 6px). Опционально — symbol layer со шевронами
  направления.
- **Пины**: HTML-маркеры — старт: брендовый кружок + Footprints; остановки:
  номер + иконка вида (те же 9 lucide); юзер — точка. Карточка пина —
  `PlaceMiniCard` с `reason` и `stayMinutes` (новый ключ `Places.stayMinutes`).
- **Камера**: `fitBounds` padding `{left: 460}` десктоп / панель снизу мобайл,
  800мс ease; `pitch 0`.
- **Building-фаза** (S1): радиус зоны для пунктирной петли клиент берёт из
  нового shared-модуля `src/lib/walk/shared/geometry.ts`
  (`searchRadiusMetersForBudget` — вынести формулу `quickPipeline.ts:37-40`
  в чистую функцию; сервер и клиент используют одну). Стор карты расширяется:
  `building: { start, radiusMeters } | null` (`useQuickWalkMapStore`),
  `QuickWalkContent` ставит его в `runBuild` до `await` (старт из
  `getCurrentStart`/адреса), снимает в `BUILD_SUCCESS/FAILED/RESET`. Рисуем
  окружность радиуса: line-dasharray + CSS-анимация dashoffset.
- **Пикер точек**: клик по карте → координата.
- **maplibre-версия не рендерит эксперт** (см. B2): при `?r=` лоадер отдаёт
  Яндекс-компонент.

## M2. Вход и первый экран

- `src/app/page.tsx` → главный экран; **`src/app/map/page.tsx` →
  `redirect('/?' + searchParams.toString())`** (блокер B1: сохраняет `r=`,
  `sketch=1` — шареные ссылки эксперта `/map?r=...` продолжают открываться).
  Смоук-тест: старая ссылка `/map?r=2.<lz>` → `/` → эксперт-сайдбар с линией.
- Лендинг → `src/app/about/page.tsx` (тело переиспользует
  `Landing.tutorial/cta`); GIF-пути `/tutorial/step1..6.gif` статические —
  не меняются (`TutorialSection.tsx:13-18`).
- Файлы-сироты ссылок на `/map` (S5): `HeroSection.tsx:53` (HeroCTA после
  переезда ведёт на `/about` — без двойного redirect), `CTASection.tsx:45`,
  `Footer.tsx:50`, `Navigation.tsx:37,102`.
- `src/app/page.tsx` — свой `generateMetadata` («Генератор прогулок по
  реальным улицам…»); `auth()`/`getDb()` уже выполняются для `/` через layout
  (`layout.tsx:53-77`, C4) — новых серверных зависимостей перенос не даёт.
- Шапка панели: «Как это работает» (→ `/about`) — правка
  `WalkModeSwitcher.tsx:14-24`.
- dev-демо `CardsDemo.tsx:12,230-233` остаётся на Яндексе (prod 404
  сохраняется `dev/cards/page.tsx:16-18`) — не входит в maplibre-волну,
  чтобы не раздувать её.

## M3. Мобильная шторка по спеке (S3)

- `RoutePanel` получает проп `phase?: WalkPhase | 'expert'`; владелец
  маппинга — `QuickWalkContent` (машина фаз в его `useReducer`,
  `QuickWalkContent.tsx:79`). Таблица: `idle/params` → 45dvh, `ready` → 85dvh,
  `building/error` → 60dvh; expert-обёртки (`RouteBuilderSidebar.tsx:308`,
  `RouteResultSidebar.tsx:169`) без пропа → прежнее поведение (binary).
- Контент монтирован всегда (убрать unmount `RoutePanel.tsx:93`); скрытие
  transform'ом. Hydration безопасен: сервер и первый рендер `isMobile=false`
  (`RoutePanel.tsx:17,22-27`, C3).
- `QuickStartPanel` отрисовывает чипы времени первыми в DOM-порядке — при
  45dvh они видимы без раскрытия.
- Свайп ручки: pointer events, порог 24px, `setPointerCapture`; `handleToggle`
  сохраняет игнор кликов по кнопкам (`RoutePanel.tsx:43`) — иначе драг по
  свитчеру съест тапы.

## M4. Шаринг быстрой прогулки (принцип 4) — блокеры B3/B4

- **Кодек v3** (не переиспользовать RoutePayloadV2 — другая семантика):
  `QuickPlanPayloadV3 { v:3, type: 'loop'|'ab', budgetMin, variantIndex,
  totals, stops: [{id, name, kind, lat, lng, stayMin, reason}],
  legs: [{walkMin, geometry: LatLng[]}] }`. Геометрия едет в URL:
  ресэмпл до ≤40 точек на лег готовой функцией `sampleLoopGeometry`
  (`shareCodec.ts:47-52`), сжатие lz-string (уже в deps, паттерн
  `routeCodec.ts:1`) → 1.5–3 KB на 60-мин прогулку. URL `/?w=<payload>`.
  При переполнении (>~1800 символов после сжатия) — геометрия отбрасывается,
  на открытии линия достраивается запросом роутинга (не «без сети», честно:
  бейдж «маршрут восстановлен»); предел — константа с комментарием.
- **Канал гидрации** (B4): декод в `QuickWalkContent` по `searchParams`
  (монтируется на `/`): seed-проп `initialPlan` на машину → диспатч
  BUILD_SUCCESS-эквивалента с фазой `ready` без сети; `lastInput = null`
  при гидрации — убрать зависимость слайдера вариантов от `lastInput`
  (`QuickWalkContent.tsx:198-206`): старт брать из стора карты
  (`useQuickWalkMapStore.start`). Контекст погоды из URL не восстанавливается
  → бейдж `weatherUnknown`.
- Кнопка «Поделиться» (`Share2`) рядом с «Сохранить»: Web Share API →
  clipboard → тост. Без логина. Ключи: `WalkUI.shareCta/shareCopied/shareFailed`.

## M5. Человеческий язык причин

- `reasons.ts`: формулы без тавтологий (категория «Кофейня» + причина
  «Лучший „кафе“ поблизости» → «Лучший выбор рядом» / «за углом, 2 мин»).
  Маркер «причина человекочитаемая» — поле данных, не i18n-ключ.
- Скоринговые чипы → человеческие формулы («тихий двор», «вид на воду»,
  «открыто до 22:00»).
- `StopRow`: причина без префикса категории, если человекочитаемая.
- Карточка пина: причина + стоянка + часы (данные в сторе уже есть).

## M6. Честные состояния

- Геолокация отклонена → `WalkUI.geoDenied`: «Не дали геолокацию — скажите,
  откуда пойдём» + фокус на адресное поле (error-код из `getCurrentStart`).
- `AddressInput`: инлайн-ошибка геокодера под полем (сейчас console.error,
  `AddressInput.tsx:83-84,104-105`).
- Погода неизвестна → `WalkUI.weatherUnknown` «Погода неизвестна — идём
  в любую» (нейтральный факт; сейчас ложное «Погода располагает…»,
  `QuickWalkContent.tsx:401-407`).
- «Новый город»: пикер города через suggest (`src/actions/suggest.ts`) —
  поле «город» задаёт старт-центр; ключи `cityInputLabel/citySelected/cityClear`.

## M7. Деградация и границы

- Тайлы не загрузились: серая карта + плашка `mapUnavailableTitle/Hint`
  «Карта недоступна — прогулка построена, смотри таймлайн» (движок от карты
  не зависит).
- WebGL недоступен: карта скрыта, панель на весь экран (таймлайн-первый
  режим); Яндекс-фолбэк не держим.

## Контракт диф-апдейта карты (F1 — замена fitNonce-перерисовки)

- Стор разделяет **данные** (`geometry`, `stops`) и **сигнал камеры**
  (`fitNonce` — только новая прогулка/новая сборка).
- `handleSelectVariant` / `handleSwapRequest` вызывают `setWalk(..., {fit:false})`
  (`QuickWalkContent.tsx:141-145,201-205,332-335`; сегодня каждый `setWalk`
  инкрементит fitNonce — `useQuickWalkMapStore.ts:39-40`).
- MapCanvas диффит пины по `stop.id` (стабилен между вариантами,
  `uiAdapter.ts:99`): существующим `setLngLat`, новым `new Marker`,
  пропавшим `remove`; линия — `source.setData`.
- Открытая `PlaceMiniCard`: stop id жив в новом плане → остаётся, пере-якорится
  на `move`; нет → закрывается.
- Ленивый рефит варианта: `map.getBounds()` + `LngLatBounds` с запасом +20%
  по обеим осям; новый bbox внутри → камеру не трогаем.

## Тесты и верификация

- Кодек `/?w=` v3: раундтрип (петля/A→B, пустые причины, utf-8, предел URL,
  восстановление линии при отброшенной геометрии) — vitest.
- Машина высот шторки: чистые функции с тестами.
- Критерий переключения стеков: `?r=` → Яндекс даже при walkMode='quick'
  до гидрации.
- Мап-рендер — живой смоук + скриншоты (visual judge): пустая / building
  с пунктиром / готовая петля с пинами и карточкой / шторка 45% / замена
  остановки без мигания / старая ссылка `/map?r=` открывает эксперт.
- Существующие тесты зелёные; `npm run build` проходит.

## Не делаем в этой волне

Тёмная тема (roadmap), фото мест, ре-платформа эксперт-роутинга, миграция
истории на `?w=`, ре-платформа suggest, dev/cards на maplibre.

## i18n-ключи волны (паритет ru/en)

`WalkUI.howItWorks`, `WalkUI.geoDenied`, `WalkUI.weatherUnknown`,
`WalkUI.mapUnavailableTitle`, `WalkUI.mapUnavailableHint`, `WalkUI.shareCta`,
`WalkUI.shareCopied`, `WalkUI.shareFailed`, `WalkUI.cityInputLabel`,
`WalkUI.citySelected`, `WalkUI.cityClear`, `Places.stayMinutes`,
`Navigation.about`, `Landing.aboutTitle`; мета `/about`.
