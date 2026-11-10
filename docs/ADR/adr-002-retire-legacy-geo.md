# ADR-002: ретир легаси geo-стека эксперт-режима

Статус: принят (2026-11-10). Дополняет ADR-001.

## Контекст

После ADR-001 (замороженный контракт `GeoProvider`) приложение жило с двумя
параллельными OSM-стеками:

- **новый** — `src/lib/geo/cloud/*`: Overpass (9 зеркал, sticky, эскалация
  радиусов, коридор), Photon → Nominatim (лимитер 1 rps), TTL/LRU-кэши,
  `GeoError` со стабильными кодами;
- **легаси** — `src/services/osm.ts`, `overpassClient.ts`,
  `nominatimGeocoder.ts`, `nominatimPlaces.ts` + `src/utils/placeRanking.ts`:
  свой Overpass-клиент, свои Map-кэши в actions, Nominatim без лимитера,
  конус направления по сырым градусам (ошибка проекции, отмечена в
  `lib/walk/internal/geo.ts`).

Легаси обслуживала только эксперт-режим (`routeBuilder` → `geocoder` /
`osmPlaces`). `docs/vibes.md` обещал «placeRanking исчезнет на интеграции».

## Решение

1. Эксперт-режим переводится на `CloudProvider` (синглтон `getCloudProvider`):
   - геокодирование — `src/actions/geocoder.ts` через `suggest` /
     `reverseGeocode`; заглушка «Точка на карте» — только при честном
     «не знаем»/отказе апстрима;
   - альтернативы категории — `src/actions/osmPlaces.ts` через
     `searchPlaces` (адаптивные радиусы категории + коридор `opts.toward`);
     диверсификация списка (300 м) и маппинг в `PlaceOfInterest` — в экшене.
2. Удаляются: `services/osm.ts`, `services/overpassClient.ts`,
   `services/nominatimGeocoder.ts`, `services/nominatimPlaces.ts`,
   `utils/placeRanking.ts`, их интеграционные тесты.
3. Непешие транспортные режимы эксперт-режима (`TransportAlternatives`)
   остаются вне `GeoProvider` — контракт пеший (ADR-001), это осознанный
   остаток до расширения контракта.

## Последствия

- Один Overpass-клиент, один лимитер, одни кэши — поведение быстрого прогона
  и эксперт-режима согласовано по определению.
- Минус ~1000 строк дублирующей логики и два класса багов (безлимитный
  Nominatim, конус по градусам).
- Прямое геокодирование идёт через `suggest` (Photon): первый результат с
  координатами. Если понадобится строгий адресный поиск — расширять контракт
  методом `geocode`, не возвращать легаси.
