// src/lib/walk/internal/microStops.ts
// Микро-стопы «по пути» (docs/street-interest-wave.md S4): точки kind
// viewpoint/art и берега воды в буфере 60 м от полилинии ноги, ≤2 на ногу,
// отсорт по близости к пути. Ключевое решение волны (B2): минуты считает
// движок ДО evaluateGates — микро-стопы цепляются к ногам ДО итогов и гейтов;
// постфактум-добавление запрещено, иначе карточка показала бы total > 1.1·B
// при gatesPass=true. Микро-минуты идут в totals как walk («шаг, взгляд»),
// не stay — иначе перевирается walk_share.

import type { WalkLeg, WalkLatLng, WalkMicroKind, WalkStreetFeature } from '../types';
import { BUDGET_TOLERANCE, MAX_LEG_MINUTES } from '../types';
import { bboxIntersects, bboxOf, closestPointOnPolyline } from './geo';

/** Буфер «по пути» (S4): дальше — уже не по пути. */
export const MICRO_BUFFER_M = 60;
/** Минуты одного микро-стопа («шаг, взгляд») — walk-минуты, не stay. */
export const MICRO_STOP_MINUTES = 2;
/** ≤2 на ногу (S4): у длинной ноги не устраиваем ярмарку. */
export const MICRO_MAX_PER_LEG = 2;
/** Кап микро-минут на план: min(4, остаток до потолка 1.1·B) — S4. */
export const MICRO_PLAN_CAP_MINUTES = 4;

/** microNotes берут viewpoint/art целиком; у воды — берег (ближайшая к пути точка геометрии). */
const MICRO_KINDS: Record<string, WalkMicroKind> = {
  viewpoint: 'viewpoint',
  art: 'art',
  water: 'water',
};

const MICRO_NAME_FALLBACK: Record<WalkMicroKind, string> = {
  viewpoint: 'Смотровая площадка',
  art: 'Арт-объект',
  water: 'Берег воды',
};

const MICRO_REASON: Record<WalkMicroKind, { ru: string; en: string }> = {
  viewpoint: { ru: 'Смотровая площадка по пути', en: 'A viewpoint right on the way' },
  art: { ru: 'Арт-объект по пути', en: 'An artwork right on the way' },
  water: { ru: 'Берег воды по пути', en: 'A waterside spot right on the way' },
};

export interface AttachMicroNotesParams {
  legs: WalkLeg[];
  features?: WalkStreetFeature[];
  budgetMinutes: number;
  /** Ходьба + stay ДО микро-стопов — база остатка до потолка 1.1·B (B2). */
  currentTotalMinutes: number;
}

/**
 * Цепляет микро-стопы к ногам, ДОБАВЛЯЯ их минуты в durationMinutes ног:
 * вызывающая сторона пересчитывает totals ПОСЛЕ attach — гейты и карточка
 * видят честный total. Мутирует legs. Отбор: кандидат — ближайшая к ноге
 * точка фичи (для viewpoint/art сама точка, для воды берег — ближайшая
 * вершина её геометрии, точности буфера 60 м хватает); дедуп по точке+kind
 * (фича у перекрёстка двух ног — один стоп, не два); ноги у потолка
 * MAX_LEG_MINUTES не получают стопов — микро-минуты не должны ломать
 * long_legs. Гейт anchors микро-стопы не засчитывает — stops не трогаются.
 */
export function attachMicroNotes({
  legs,
  features,
  budgetMinutes,
  currentTotalMinutes,
}: AttachMicroNotesParams): void {
  if (!features || features.length === 0 || legs.length === 0) return;
  const minutesCap = Math.min(
    MICRO_PLAN_CAP_MINUTES,
    Math.max(0, budgetMinutes * (1 + BUDGET_TOLERANCE) - currentTotalMinutes),
  );
  if (minutesCap < MICRO_STOP_MINUTES - 1e-9) return;

  interface Candidate {
    legIndex: number;
    point: WalkLatLng;
    distanceMeters: number;
    kind: WalkMicroKind;
    name: string;
  }
  const candidates: Candidate[] = [];
  for (let legIndex = 0; legIndex < legs.length; legIndex++) {
    const leg = legs[legIndex];
    const geometry = leg.geometry;
    // Нога у потолка long_legs: +2 минуты микро-стопа сломали бы гейт честно,
    // но бессмысленно — стоп не цепляется (S4, решение в walk-engine.md §18).
    if (leg.durationMinutes > MAX_LEG_MINUTES - MICRO_STOP_MINUTES + 1e-9) continue;
    if (geometry.length < 2) continue;
    const legBox = bboxOf(geometry, MICRO_BUFFER_M);
    for (const feature of features) {
      const kind = MICRO_KINDS[feature.kind];
      if (!kind || feature.geometry.length === 0) continue;
      if (!bboxIntersects(bboxOf(feature.geometry, 0), legBox)) continue;
      let bestPoint = feature.geometry[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const vertex of feature.geometry) {
        const distance = closestPointOnPolyline(vertex, geometry).distanceMeters;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPoint = vertex;
        }
      }
      if (bestDistance <= MICRO_BUFFER_M) {
        candidates.push({
          legIndex,
          point: bestPoint,
          distanceMeters: bestDistance,
          kind,
          name: feature.name ?? MICRO_NAME_FALLBACK[kind],
        });
      }
    }
  }

  // Ближайшие к пути первыми; caps на ногу/план; дедуп той же точки на соседних ногах.
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const perLeg = new Map<number, number>();
  const used = new Set<string>();
  let minutes = 0;
  for (const candidate of candidates) {
    if (minutes + MICRO_STOP_MINUTES > minutesCap + 1e-9) break;
    if ((perLeg.get(candidate.legIndex) ?? 0) >= MICRO_MAX_PER_LEG) continue;
    const key = `${candidate.kind}:${candidate.point[0].toFixed(6)},${candidate.point[1].toFixed(6)}`;
    if (used.has(key)) continue;
    used.add(key);
    perLeg.set(candidate.legIndex, (perLeg.get(candidate.legIndex) ?? 0) + 1);
    const reason = MICRO_REASON[candidate.kind];
    (legs[candidate.legIndex].microNotes ??= []).push({
      name: candidate.name,
      kind: candidate.kind,
      reason: reason.ru,
      reasonEn: reason.en,
    });
    legs[candidate.legIndex].durationMinutes += MICRO_STOP_MINUTES;
    minutes += MICRO_STOP_MINUTES;
  }
}
