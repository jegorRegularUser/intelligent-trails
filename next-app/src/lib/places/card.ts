// src/lib/places/card.ts
// buildPlaceCard — сборка «карточки места» из сырья геокода.
// Правила приоритетов и честной деградации — docs/place-cards.md (порт из
// отработанного Java-решения):
//   1) именованный объект ≤ 20 м бьёт дорогу;
//   2) дорога принимается только ≤ 5 м;
//   3) дом с адресом ≤ 20 м;
//   4) fallback — ближайший дом / ближайший объект / честное «не знаем».

import type { ReverseGeocodeResult } from '@/lib/geo/types';

import {
  composeAddress,
  dedupeKindLabel,
  formatDistance,
  formatNearbySuffix,
  localizedName,
  normalizeLabel,
} from './label';
import { evaluateOpeningHours, type OpenState } from './hours';
import {
  getKindInfo,
  isRoadKind,
  kindFromTags,
  LANDMARK_KINDS,
  UNKNOWN_KIND,
  type PlaceKindInfo,
  type PlaceLocale,
} from './kinds';

/** Именованный объект побеждает дорогу в этом радиусе. */
const NAMED_MAX_METERS = 20;
/** Дорога становится «местом» только когда человек буквально на ней стоит. */
const ROAD_MAX_METERS = 5;
/** Дом с адресом — в этом радиусе. */
const ADDRESSED_MAX_METERS = 20;
/** Enrichment «(рядом: …)» — дальняя граница. */
const LANDMARK_MAX_METERS = 150;

export interface BuildPlaceCardOptions {
  /** Локаль данных карточки; должна совпадать с локалью страницы. */
  locale?: PlaceLocale;
  /**
   * IANA-таймзона точки прогулки. Без неё бейдж честно уходит в 'unknown' —
   * угадывать зону сервера нельзя.
   */
  timeZone?: string;
  /** Момент оценки часов работы; по умолчанию — сейчас. */
  at?: Date;
}

export interface NearbyPlaceInfo {
  name: string;
  kind: string;
}

export interface PlaceCard {
  /** Разрешённый kind ('cafe', 'house', 'street', 'unknown', …). */
  kind: string;
  /** Локализованная подпись kind; '' если дублирует имя. */
  kindLabel: string;
  /** Иконка kind (lucide-react), нейтральная для unknown. */
  icon: PlaceKindInfo['icon'];
  /** Локализованное имя; '' если неизвестно. */
  name: string;
  /** Имя или честный fallback («Дом», «Улица», «Место»). */
  displayName: string;
  address?: string;
  distanceMeters?: number;
  distanceLabel?: string;
  openState: OpenState;
  /** Ближайший landmark ≤ 150 м, если нашёлся. */
  nearby?: NearbyPlaceInfo;
  /** Готовый суффикс «(рядом: …)» / «(near …)». */
  nearbyLabel?: string;
}

interface Candidate {
  source: ReverseGeocodeResult;
  /** +Infinity — дистанция неизвестна (не догадываемся). */
  distance: number;
}

function sameOsm(
  a: string | number | undefined,
  b: string | number | undefined,
): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

function hasAddress(r: ReverseGeocodeResult): boolean {
  return Boolean((r.address && r.address.trim()) || r.tags?.['addr:housenumber']);
}

function isPostcode(r: ReverseGeocodeResult): boolean {
  return r.kind === 'postcode' || (!r.kind && Boolean(r.tags?.['addr:postcode']));
}

/** Лучший kind объекта: явный → выведенный из тегов → служебный. */
function resolvedKind(r: ReverseGeocodeResult): string | undefined {
  if (r.kind) return r.kind;
  const fromTags = kindFromTags(r.tags);
  if (fromTags) return fromTags;
  if (hasAddress(r) || r.tags?.building) return 'house';
  return undefined;
}

function findNearest(list: Candidate[], predicate: (c: Candidate) => boolean): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of list) {
    if (!predicate(candidate)) continue;
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}

function cityOf(r: ReverseGeocodeResult): string | undefined {
  const city = r.tags?.['addr:city']?.trim().toLowerCase();
  return city || undefined;
}

function buildCandidates(
  reversed: ReverseGeocodeResult,
  nearby: readonly ReverseGeocodeResult[] | undefined,
  nearestRoad: ReverseGeocodeResult | undefined | null,
): Candidate[] {
  const candidates: Candidate[] = [];
  // Объект в точке: отсутствие дистанции означает 0, а не «неизвестно».
  candidates.push({
    source: reversed,
    distance: typeof reversed.distanceMeters === 'number' ? reversed.distanceMeters : 0,
  });

  const seen = new Set<string>();
  if (reversed.osmId !== undefined && reversed.osmId !== null) {
    seen.add(String(reversed.osmId));
  }
  for (const item of nearby ?? []) {
    if (!item) continue;
    const key = item.osmId !== undefined && item.osmId !== null ? String(item.osmId) : null;
    if (key !== null) {
      if (seen.has(key)) continue; // тот же объект второй раз
      seen.add(key);
    }
    candidates.push({
      source: item,
      distance:
        typeof item.distanceMeters === 'number' ? item.distanceMeters : Number.POSITIVE_INFINITY,
    });
  }

  // Дорога участвует в правиле 2 наравне с дорогами из nearby; правила 1/3/4
  // её отсекают по isRoadKind.
  if (nearestRoad) {
    const key = nearestRoad.osmId !== undefined && nearestRoad.osmId !== null ? String(nearestRoad.osmId) : null;
    if (key === null || !seen.has(key)) {
      candidates.push({
        source: nearestRoad,
        distance:
          typeof nearestRoad.distanceMeters === 'number'
            ? nearestRoad.distanceMeters
            : Number.POSITIVE_INFINITY,
      });
    }
  }
  return candidates;
}

interface Selection {
  candidate: Candidate;
  kind: string;
}

/** Приоритеты 1–4; undefined = вокруг вообще нечего показать. */
function selectPrimary(candidates: Candidate[], locale: PlaceLocale): Selection | undefined {
  // 1. Именованный объект ≤ 20 м (не дорога, не postcode) — бьёт дорогу.
  const named = findNearest(candidates, (c) => {
    if (!localizedName(c.source, locale)) return false;
    const kind = resolvedKind(c.source);
    if (isRoadKind(kind) || kind === 'postcode') return false;
    return c.distance <= NAMED_MAX_METERS;
  });
  if (named) return { candidate: named, kind: resolvedKind(named.source) ?? 'unknown' };

  // 2. Дорога — только вплотную (≤ 5 м) и только если дистанция известна
  //    (в кандидатах дорога без дистанции = Infinity).
  const road = findNearest(
    candidates,
    (c) => isRoadKind(resolvedKind(c.source)) && c.distance <= ROAD_MAX_METERS,
  );
  if (road) return { candidate: road, kind: 'street' };

  // 3. Дом с адресом ≤ 20 м.
  const addressed = findNearest(candidates, (c) => {
    const kind = resolvedKind(c.source);
    if (isRoadKind(kind) || kind === 'postcode') return false;
    return hasAddress(c.source) && c.distance <= ADDRESSED_MAX_METERS;
  });
  if (addressed) return { candidate: addressed, kind: resolvedKind(addressed.source) ?? 'house' };

  // 4a. Fallback — ближайший дом (любой дистанции, без ограничения 20 м);
  //     дом с неизвестной дистанцией «ближайшим» не доказуем → не берём.
  const house = findNearest(candidates, (c) => {
    const kind = resolvedKind(c.source);
    return !isRoadKind(kind) && kind === 'house' && Number.isFinite(c.distance);
  });
  if (house) return { candidate: house, kind: 'house' };

  // 4b. Совсем пусто вокруг — ближайший любой не-дорога.
  const anyObject = findNearest(candidates, (c) => {
    const kind = resolvedKind(c.source);
    return !isRoadKind(kind) && kind !== 'postcode' && Number.isFinite(c.distance);
  });
  if (anyObject) return { candidate: anyObject, kind: resolvedKind(anyObject.source) ?? 'unknown' };

  return undefined;
}

/** Enrichment: ближайший landmark ≤ 150 м, не сам объект, тот же город. */
function findNearbyLandmark(
  candidates: Candidate[],
  primary: Candidate,
  locale: PlaceLocale,
): Candidate | undefined {
  const primaryName = normalizeLabel(localizedName(primary.source, locale));
  const primaryCity = cityOf(primary.source);

  return findNearest(candidates, (c) => {
    if (c === primary) return false;
    if (sameOsm(c.source.osmId, primary.source.osmId)) return false;
    if (!Number.isFinite(c.distance) || c.distance > LANDMARK_MAX_METERS) return false;
    const kind = resolvedKind(c.source);
    if (!kind || !LANDMARK_KINDS.has(kind)) return false;
    if (isPostcode(c.source)) return false;
    const name = localizedName(c.source, locale);
    if (!name) return false;
    // Тот же объект под другим osmId — не обогащаем.
    if (primaryName && normalizeLabel(name) === primaryName) return false;
    // Город должен совпадать, только если известен обоим.
    const city = cityOf(c.source);
    if (primaryCity && city && primaryCity !== city) return false;
    return true;
  });
}

function emptyCard(locale: PlaceLocale): PlaceCard {
  const info = getKindInfo(undefined);
  return {
    kind: 'unknown',
    kindLabel: info[locale],
    icon: info.icon,
    name: '',
    displayName: UNKNOWN_KIND[locale],
    openState: 'unknown',
  };
}

/**
 * Собирает карточку места из сырья геокода. Никогда не бросает и не врёт:
 * нет данных → соответствующее поле пустое или 'unknown'.
 */
export function buildPlaceCard(
  reversed: ReverseGeocodeResult | null | undefined,
  nearby: readonly ReverseGeocodeResult[] | undefined,
  nearestRoad?: ReverseGeocodeResult | null,
  opts: BuildPlaceCardOptions = {},
): PlaceCard {
  const locale: PlaceLocale = opts.locale ?? 'ru';
  if (!reversed) return emptyCard(locale);

  const candidates = buildCandidates(reversed, nearby, nearestRoad);
  const selection = selectPrimary(candidates, locale);
  if (!selection) return emptyCard(locale);

  const { candidate, kind } = selection;
  const source = candidate.source;
  const name = localizedName(source, locale);
  const kindInfo: PlaceKindInfo = getKindInfo(kind);
  const rawKindLabel = kindInfo[locale];
  const kindLabel = dedupeKindLabel(rawKindLabel, name);

  const address = composeAddress(source);
  const distanceMeters = Number.isFinite(candidate.distance) ? candidate.distance : undefined;

  const rawHours = source.tags?.opening_hours;
  let openState: OpenState = 'unknown';
  if (rawHours && rawHours.trim() && opts.timeZone) {
    openState = evaluateOpeningHours(rawHours, opts.at ?? new Date(), opts.timeZone);
  }

  const landmark = findNearbyLandmark(candidates, candidate, locale);
  const nearbyName = landmark ? localizedName(landmark.source, locale) : '';

  return {
    kind,
    kindLabel,
    icon: kindInfo.icon,
    name,
    displayName: name || rawKindLabel || UNKNOWN_KIND[locale],
    address,
    distanceMeters,
    distanceLabel:
      distanceMeters !== undefined ? formatDistance(distanceMeters, locale) : undefined,
    openState,
    nearby: landmark && nearbyName ? { name: nearbyName, kind: resolvedKind(landmark.source) ?? 'unknown' } : undefined,
    nearbyLabel: landmark && nearbyName ? formatNearbySuffix(nearbyName, locale) : undefined,
  };
}
