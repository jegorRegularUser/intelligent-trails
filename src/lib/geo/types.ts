// src/lib/geo/types.ts
// ЗАМОРОЖЕННЫЙ КОНТРАКТ geo-слоя (ADR: docs/ADR/adr-001-geo-provider.md).
// Все адаптеры (облачный и пакетный) реализуют GeoProvider; движок прогулки
// и UI не знают, кто под ними. Расширять можно новыми типами, ломать — нельзя.

/** Координаты в едином порядке приложения: [широта, долгота]. */
export type LatLng = [number, number];

/** Категории мест (пока совпадает с constants/categories.ts). */
export type PlaceCategory =
  | 'cafe' | 'restaurant' | 'park' | 'museum' | 'attraction'
  | 'bar' | 'cinema' | 'shopping' | 'viewpoint' | string;

/** Место. Расширение существующего PlaceOfInterest из types/map.ts. */
export interface GeoPlace {
  id: string | number;
  name: string;
  category: PlaceCategory;
  coordinates: LatLng;
  address?: string;
  /** 0-5, если источник даёт. */
  rating?: number;
  /** OSM-теги сырьём — карточки и hours парсят из них. */
  tags?: Record<string, string>;
  /** indoor/outdoor эвристика источника. */
  indoor?: boolean;
}

/** Сегмент маршрута: реальная геометрия улиц + метрики. */
export interface RouteSegment {
  distanceMeters: number;
  durationSeconds: number;
  /** Полилиния [lat,lng]; пустой массив, если источник не дал геометрию. */
  geometry: LatLng[];
  /** Откуда метрики — для отладки и бейджа fast mode. */
  source: 'cloud' | 'pack';
}

export interface RouteRequest {
  waypoints: LatLng[];
  /** Максимальное число альтернатив (0-2). */
  alternatives?: number;
}

export interface MatrixCell {
  sourceIndex: number;
  targetIndex: number;
  /** null = ячейка недостижима пешком. */
  distanceMeters: number | null;
  durationSeconds: number | null;
}

/** Результат обратного геокодирования — сырьё для карточки места. */
export interface ReverseGeocodeResult {
  name?: string;
  address?: string;
  /** Сырой OSM-kind: 'cafe' | 'park' | 'memorial' | ... (словарь — слой мест). */
  kind?: string;
  distanceMeters?: number;
  osmId?: string | number;
  osmType?: 'N' | 'W' | 'R';
  tags?: Record<string, string>;
}

export interface SuggestItem {
  title: string;
  subtitle?: string;
  coordinates?: LatLng;
}

// ---------------------------------------------------------------------------
// Фичи улиц «Улицы с характером» (docs/street-interest-wave.md S1).
// Аддитивное расширение контракта (ADR-001 разрешает расширение): опциональный
// метод GeoProvider — провайдер без метода означает «интерес-модели нет»,
// движок честно деградирует в чистую геометрическую розу.
// ---------------------------------------------------------------------------

/** Классы фич улиц (движок-твин — WalkStreetFeatureKind в lib/walk/types). */
export type StreetFeatureKind = 'green' | 'water' | 'pedestrian' | 'viewpoint' | 'art';

/** Фича улиц: полигоны зелени/воды, линии пешеходных улиц, точечные видовые/арт. */
export interface StreetFeature {
  kind: StreetFeatureKind;
  /** [lat,lng]: 1 точка — точечная фича; 2+ — линия или контур полигона (≤64 точек). */
  geometry: LatLng[];
  /** Имя из OSM, если есть; у воды/зелени часто нет — не повод отбрасывать (S1). */
  name?: string;
  /** Площадь замкнутого контура, м² (точки/линии — 0) — лог-шкала размера в интерес-модели (S2). */
  areaMeters: number;
}

export interface SearchPlacesOptions {
  /** Радиус поиска, м (адаптер сам решает, как деградировать). */
  radiusMeters?: number;
  /** Тянуться к этой точке (коридорный поиск). */
  toward?: LatLng;
  limit?: number;
}

/** Стабильные коды ошибок geo-слоя (расширение таксономии map-service). */
export type GeoErrorCode =
  | 'INVALID_INPUT'          // 400 — плохие координаты/параметры
  | 'NOT_FOUND'              // 422 — валидный запрос, ничего не нашли
  | 'NO_ROUTE'               // 422 — маршрут не построился
  | 'UPSTREAM_INVALID'       // 502 — мусор от провайдера
  | 'UPSTREAM_TIMEOUT'       // 504 — провайдер не ответил
  | 'UPSTREAM_UNAVAILABLE';  // 502/503 — провайдер лежит

export class GeoError extends Error {
  constructor(
    public readonly code: GeoErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GeoError';
  }
}

/**
 * Единый порт геоданных. Две реализации:
 *  - CloudProvider — публичные сервисы, работает в любом городе (ADR-001, тир 1);
 *  - PackProvider  — собственный стек региона (OSRM/Photon/PMTiles), тир 2.
 */
export interface GeoProvider {
  readonly id: 'cloud' | 'pack';

  /** Пешеходный маршрут по реальным улицам. Бросает GeoError('NO_ROUTE'). */
  route(req: RouteRequest): Promise<RouteSegment>;

  /**
   * Альтернативные маршруты по тем же двум вейпоинтам, основной первым
   * (docs/walk-loop-quality.md R3). Опциональное расширение контракта:
   * провайдер без метода просто не даёт альтернатив. Реализация обязана
   * деградировать честно — отказ альтернативных маршрутов (например, ORS
   * 400/2011) возвращает [основной], а не бросает NO_ROUTE.
   */
  routeAlternatives?(req: RouteRequest): Promise<RouteSegment[]>;

  /**
   * Матрица пешеходных расстояний/времени. Нюанс реализации: чанкинг
   * (≤40 точек на запрос) и null для недостижимых ячеек — обязательны.
   */
  matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixCell[]>;

  /**
   * Фичи улиц района (зелень/вода/пешеходные/видовые/арт) одним Overpass-запросом
   * с клипом геометрии (docs/street-interest-wave.md S1). Радиус клампится в
   * [500, 3000] м. Опциональное расширение контракта (S6): реализации возвращают
   * [] — «апстрим ответил: данных нет» и null — «апстрим лёг / ответ не влез в
   * капы» (решение о деградации — за движком, полям WalkInput нужны undefined,
   * не пустые массивы).
   */
  fetchStreetFeatures?(center: LatLng, searchRadiusMeters: number): Promise<StreetFeature[] | null>;

  /** Поиск мест категории вокруг точки. */
  searchPlaces(center: LatLng, category: PlaceCategory, opts?: SearchPlacesOptions): Promise<GeoPlace[]>;

  /** Обратный геокод: что находится в точке. null = честное «не знаем». */
  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult | null>;

  /** Подсказки адресов/мест для инпута. */
  suggest(query: string, near?: LatLng): Promise<SuggestItem[]>;

  /**
   * Покрыт ли регион быстрым пакетом (тир 2). CloudProvider всегда false,
   * PackProvider — по bbox-таблице покрытий.
   */
  isFastArea(point: LatLng): Promise<boolean>;
}
