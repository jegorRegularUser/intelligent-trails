// src/lib/walk/streetLoop.ts
// Уровень L3 лестницы деградации «Прогуляться сейчас»: интересных мест нет
// вовсе — отдаём чистую уличную петлю на всё время. Роза K=4 вейпоинтов:
// углы 90° + джиттер ±12° с сортировкой по возрастанию (монотонный свип,
// зазор ≥65°), радиусы ±10%; радиус решается из желаемой длины и корректируется
// по факту роутинга (×1.3 / ×0.85).
//
// Петля «туда-сюда по одной улице»: ORS прокладывает между соседями через
// ~90° путь «в догонку» по уже пройденной улице. Реакция двухуровневая —
// профилактика (монотонный свип с зазором) и реакция на гейт улиц: варианты
// [базовый, +30°, +60°, +90°, K=3], берём ПЕРВЫЙ прошедший loopStreetGate,
// иначе — с минимальным перекрытием (лучший из худших лучше случайного).
// Детерминизм §13: сид фиксированный, та же точка → та же петля бит-в-бит.
//
// Умная роза (docs/street-interest-wave.md S3): при переданных StreetHints
// вейпоинты, попавшие в сектор с interest ≥ порога, притягиваются к
// attraction-точке сектора — снап живёт ВНУТРИ buildWaypoints (tune
// перестраивает вейпоинты через него же, иначе снап стёрся бы первым же
// ×1.3/×0.85). Отказ route со снапнутыми точками → один ретрай варианта
// с геометрическими вейпоинтами. План с ≥2 снапнутыми секторами несёт
// streetInterest: true вместо метки loop-only.

import type { WalkFailure, WalkLatLng, WalkLeg, WalkPlan, WalkStreetFeature, WalkStreetHints } from './types';
import { DEFAULT_WALKING_SPEED_KMH, SECTOR_COUNT } from './types';
import type { WalkRouteSegment, WalkRoutingPort } from './ports';
import {
  azimuthRad,
  haversineMeters,
  sectorOfAzimuth,
  splitPolylineByWaypoints,
  splitRouteMetrics,
} from './internal/geo';
import { errMessage, validateWalkCore } from './internal/geo-utils';
import { attachMicroNotes } from './internal/microStops';
import { mulberry32 } from './internal/rng';
import { evaluateGates, maxStreetOverlap, SAME_STREET_OVERLAP_THRESHOLD } from './gates';

/** Джиттер формы петли: углы в градусах, радиусы — доля. */
const ANGLE_JITTER_DEG = 12;
const RADIUS_JITTER = 0.1;
/** Минимальное угловое разделение соседних вейпоинтов: при базе 90° и ±12°
 *  зазор арифметически ≥ 66°, порог 65° — страховка от «в догонку». */
const MIN_ANGLE_GAP_DEG = 65;
/** Желаемая длина петли — доля бюджета, умноженная на скорость (метры). */
const TARGET_LENGTH_SHARE = 0.8;
/** Окно принятия по факту роутинга: доля бюджета времени. */
const MIN_DURATION_SHARE = 0.5;
const MAX_DURATION_SHARE = 1.15;
/** Коррекция радиуса: рост короткой петли / сжатие длинной, лимиты на сторону. */
const GROW_FACTOR = 1.3;
const SHRINK_FACTOR = 0.85;
const MAX_TUNE_STEPS = 4;
/** NO_ROUTE или перекрытие улиц — шаг поворота всей розы. */
const ROTATE_STEP_DEG = 30;
/** Варианты розы: квадрат с поворотами, последний шанс — треугольник. */
const VARIANTS: { corners: number; rotationDeg: number }[] = [
  { corners: 4, rotationDeg: 0 },
  { corners: 4, rotationDeg: ROTATE_STEP_DEG },
  { corners: 4, rotationDeg: 2 * ROTATE_STEP_DEG },
  { corners: 4, rotationDeg: 3 * ROTATE_STEP_DEG },
  { corners: 3, rotationDeg: 0 },
];
/** Общий жёсткий кап route-вызовов (5 вариантов × попытка + коррекции + ретраи
 *  снапа — у капа есть запас на «один ретрай на вариант», S3). */
const MAX_ROUTE_CALLS = 20;
/** Сид джиттера по умолчанию: фиксированный — детерминизм §13. */
const DEFAULT_SEED = 1;

// --- Снап к attraction-точкам (docs/street-interest-wave.md S3) --------------

/** Сектор с interest ниже порога розу не тянет: слабый сигнал ≠ направление. */
export const INTEREST_SNAP_THRESHOLD = 0.35;
/** Отклонение снапнутого вейпоинта от геометрического — не больше доли радиуса
 *  (выше — петля перестала быть петлёй вокруг старта: точка остаётся геометрической). */
export const SNAP_MAX_RADIUS_SHARE = 0.3;

export interface StreetLoopInput {
  start: WalkLatLng;
  budgetMinutes: number;
  speedKmh?: number;
  /** Сид джиттера; по умолчанию фиксированный — та же точка даёт ту же петлю. */
  seed?: number;
  /**
   * Интерес-подсказки секторов (S2 → S3): hasData=true включает снап вейпоинтов
   * к attraction-точкам. Нет подсказок или hasData=false — прежняя
   * геометрическая роза бит-в-бит (поля undefined, не пустые массивы).
   */
  streetHints?: WalkStreetHints;
  /** Фичи улиц (S4): микро-стопы «по пути» на ногах петли. */
  streetFeatures?: WalkStreetFeature[];
  ports: WalkRoutingPort;
}

/** Результат построения вейпоинтов варианта: точки + кто из них снапнут (S3). */
export interface SnappedWaypoints {
  points: WalkLatLng[];
  /** Индексы точек, притянутых к attraction-точкам. */
  snappedIndices: number[];
}

/** Угловое расстояние между азимутами [0..π). */
function angularSeparationRad(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}

/**
 * Снап геометрических вейпоинтов к attraction-точкам секторов — чистая
 * функция, вызывается ВНУТРИ buildWaypoints на каждом вызове (B3: углы
 * секторов от радиуса не зависят, снап стабилен между tune-шагами). Вейпоинт
 * снапится, если его сектор (по КОНВЕНЦИОННОМУ азимуту точки, не по угловому
 * параметру розы — см. pinned-тест) имеет interest ≥ порога, а отклонение
 * влезает в 30% радиуса. Радиус-джиттер на снапнутой точке не живёт — она
 * заменяется целиком.
 */
export function snapWaypointsToHints(
  start: WalkLatLng,
  radiusMeters: number,
  geometric: WalkLatLng[],
  hints: WalkStreetHints,
): SnappedWaypoints {
  const points = geometric.slice();
  const snappedIndices: number[] = [];
  if (!hints.hasData) return { points, snappedIndices };

  const interestOf = (index: number): number => {
    const sector = sectorOfAzimuth(azimuthRad(start, geometric[index]), SECTOR_COUNT);
    return hints.sectors[sector]?.interest ?? 0;
  };

  for (let i = 0; i < points.length; i++) {
    const sector = sectorOfAzimuth(azimuthRad(start, geometric[i]), SECTOR_COUNT);
    const hint = hints.sectors[sector];
    if (!hint?.point || hint.interest < INTEREST_SNAP_THRESHOLD) continue;
    if (haversineMeters(geometric[i], hint.point) > radiusMeters * SNAP_MAX_RADIUS_SHARE) continue;
    points[i] = hint.point;
    snappedIndices.push(i);
  }

  if (snappedIndices.length > 1) {
    // Дедуп attraction-точек (B3): один крупный парк в соседних секторах даёт
    // два вейпоинта в одной точке → loop_no_repeat_street закономерно падает.
    // Энфорс минимального углового разноса снапнутых ≥ MIN_ANGLE_GAP_DEG, как
    // в buildShapeAngles: слабейший по интересу откатывается к геометрии.
    const order = snappedIndices
      .slice()
      .sort((a, b) => interestOf(b) - interestOf(a) || a - b);
    const accepted: number[] = [];
    const demoted: number[] = [];
    for (const index of order) {
      const angle = azimuthRad(start, points[index]);
      const conflicted = accepted.some(
        (angleAccepted) => angularSeparationRad(angleAccepted, angle) < MIN_ANGLE_GAP_DEG * DEG,
      );
      if (conflicted) demoted.push(index);
      else accepted.push(angle);
    }
    for (const index of demoted) points[index] = geometric[index];
    snappedIndices.length = 0;
    snappedIndices.push(...order.filter((index) => !demoted.includes(index)).sort((a, b) => a - b));
  }

  return { points, snappedIndices };
}

const DEG = Math.PI / 180;
const EARTH_M_PER_DEG = 6371008.8 * (Math.PI / 180);

export type StreetLoopResult =
  | { ok: true; plan: WalkPlan }
  | { ok: false; failure: WalkFailure };

/**
 * Радиус правильного K-угольника с евклидовым периметром desiredLength:
 * периметр = 2·R·K·sin(π/K) → R = L / (2·K·sin(π/K)). Чистая математика —
 * тестируется отдельно, роутинг её корректирует по факту улиц.
 */
export function loopRadiusMeters(desiredLengthMeters: number, corners: number): number {
  const k = Math.max(3, Math.floor(corners));
  return desiredLengthMeters / (2 * k * Math.sin(Math.PI / k));
}

/**
 * Углы розы: равномерная база 2π/K + джиттер, затем сортировка по возрастанию
 * (монотонный угловой свип) с гарантированным зазором ≥ MIN_ANGLE_GAP_DEG.
 * Зазор для K≤4 при джиттере ±12° арифметически не может нарушиться
 * (base − 2·jitter ≥ 66°), энфорс — страховка на случай будущих параметров.
 */
export function buildShapeAngles(corners: number, angleJitterRad: number[]): number[] {
  const minGap = MIN_ANGLE_GAP_DEG * DEG;
  const raw = angleJitterRad
    .map((jitter, i) => ({ angle: (i * 2 * Math.PI) / corners + jitter }))
    .sort((a, b) => a.angle - b.angle);
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].angle - raw[i - 1].angle < minGap) {
      raw[i].angle = raw[i - 1].angle + minGap;
    }
  }
  return raw.map((item) => item.angle);
}

/**
 * Вейпоинты варианта: повёрнутая роза углов, радиусы с ±10% джиттером; при
 * переданных подсказках — снап к attraction-точкам ВНУТРИ (S3/B3: tune
 * перестраивает вейпоинты только через эту функцию, поэтому снап не стирается
 * коррекциями радиуса). Параметр снапа undefined → прежняя геометрическая роза.
 */
function buildWaypoints(
  start: WalkLatLng,
  radiusMeters: number,
  angles: number[],
  baseAngleRad: number,
  radiusJitter: number[],
  snapHints?: WalkStreetHints,
): SnappedWaypoints {
  const latPerM = 1 / EARTH_M_PER_DEG;
  const lngPerM = 1 / (EARTH_M_PER_DEG * Math.cos(start[0] * DEG));
  const geometric: WalkLatLng[] = angles.map((angle, i) => {
    const a = baseAngleRad + angle;
    const r = radiusMeters * radiusJitter[i];
    return [
      start[0] + Math.sin(a) * r * latPerM,
      start[1] + Math.cos(a) * r * lngPerM,
    ];
  });
  if (!snapHints) return { points: geometric, snappedIndices: [] };
  return snapWaypointsToHints(start, radiusMeters, geometric, snapHints);
}

export async function buildStreetLoop(input: StreetLoopInput): Promise<StreetLoopResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, failure: invalid };

  const speedMPerMin = ((input.speedKmh ?? DEFAULT_WALKING_SPEED_KMH) * 1000) / 60;
  const budget = input.budgetMinutes;
  const desiredLength = budget * speedMPerMin * TARGET_LENGTH_SHARE;
  const rng = mulberry32(input.seed ?? DEFAULT_SEED);
  const minMinutes = MIN_DURATION_SHARE * budget;
  const maxMinutes = MAX_DURATION_SHARE * budget;

  // Джиттеры генерируются один раз на форму в фиксированном порядке вызовов
  // rng — повороты крутят только базовый угол, петля воспроизводима.
  const shapeJitter = new Map<number, { angles: number[]; radiusJitter: number[] }>();
  for (const { corners } of VARIANTS) {
    if (shapeJitter.has(corners)) continue;
    const angleJitter = Array.from(
      { length: corners },
      () => (2 * rng() - 1) * ANGLE_JITTER_DEG * DEG,
    );
    const radiusJitter = Array.from({ length: corners }, () => 1 + (2 * rng() - 1) * RADIUS_JITTER);
    shapeJitter.set(corners, { angles: buildShapeAngles(corners, angleJitter), radiusJitter });
  }

  let routeCalls = 0;
  let lastError = 'роутер не дал ни одного маршрута';
  // Варианты, у которых петля построилась, но гейт улиц не прошёл: из них
  // берём минимальное перекрытие, если ни один вариант не прошёл чисто.
  const survivors: { plan: WalkPlan; overlap: number }[] = [];

  for (const variant of VARIANTS) {
    if (routeCalls >= MAX_ROUTE_CALLS) break;
    const shape = shapeJitter.get(variant.corners)!;
    const baseAngle = variant.rotationDeg * DEG;
    let radius = loopRadiusMeters(desiredLength, variant.corners);
    // Снап включён, пока подсказки живы; отказ route со снапнутыми точками
    // переводит вариант на геометрические вейпоинты (ретрай, B3).
    let useSnap = input.streetHints !== undefined;
    const buildFor = (r: number): SnappedWaypoints =>
      buildWaypoints(input.start, r, shape.angles, baseAngle, shape.radiusJitter, useSnap ? input.streetHints : undefined);

    let built = buildFor(radius);
    routeCalls += 1;
    let segment: WalkRouteSegment;
    try {
      segment = await input.ports.route({ waypoints: [input.start, ...built.points, input.start] });
    } catch (e) {
      if (!useSnap) {
        lastError = errMessage(e);
        continue; // NO_ROUTE — следующий вариант розы
      }
      // Ретрай на отказ route с снапнутыми точками (B3): один повтор того же
      // варианта с геометрическими вейпоинтами. Все варианты снапнуты и все
      // отказали — честная деградация ниже (NO_ROUTE), не ошибка экрана.
      useSnap = false;
      built = buildFor(radius);
      if (routeCalls >= MAX_ROUTE_CALLS) {
        lastError = errMessage(e);
        continue;
      }
      routeCalls += 1;
      try {
        segment = await input.ports.route({ waypoints: [input.start, ...built.points, input.start] });
      } catch (retryError) {
        lastError = errMessage(retryError);
        continue;
      }
    }
    if (!validMetrics(segment)) {
      lastError = 'порт вернул некорректные метрики петли';
      continue;
    }

    // Коррекция радиуса по факту: короткая петля растёт, длинная сжимается;
    // лимиты на сторону исчерпаны — принимаем последний вариант, гейт бюджета
    // честно упадёт и не блокирует деградацию.
    let grows = 0;
    let shrinks = 0;
    let broken = false;
    for (let tune = 0; tune <= MAX_TUNE_STEPS; tune++) {
      const minutes = segment.durationSeconds / 60;
      if (minutes >= minMinutes && minutes <= maxMinutes) break;
      if (minutes < minMinutes && grows < MAX_TUNE_STEPS / 2) {
        radius *= GROW_FACTOR;
        grows += 1;
      } else if (minutes > maxMinutes && shrinks < MAX_TUNE_STEPS / 2) {
        radius *= SHRINK_FACTOR;
        shrinks += 1;
      } else {
        break; // обе стороны исчерпаны — берём как есть
      }
      if (routeCalls >= MAX_ROUTE_CALLS) break;
      const rebuilt = buildFor(radius);
      routeCalls += 1;
      try {
        segment = await input.ports.route({ waypoints: [input.start, ...rebuilt.points, input.start] });
        built = rebuilt;
      } catch (e) {
        if (useSnap) {
          // Tune-отказ со снапнутыми точками — тот же ретрай на геометрию (B3).
          useSnap = false;
          const geometric = buildFor(radius);
          if (routeCalls >= MAX_ROUTE_CALLS) {
            lastError = errMessage(e);
            broken = true;
            break;
          }
          routeCalls += 1;
          try {
            segment = await input.ports.route({ waypoints: [input.start, ...geometric.points, input.start] });
            built = geometric;
          } catch (retryError) {
            lastError = errMessage(retryError);
            broken = true;
            break;
          }
        } else {
          lastError = errMessage(e);
          broken = true;
          break;
        }
      }
      if (!validMetrics(segment)) {
        lastError = 'порт вернул некорректные метрики петли';
        broken = true;
        break;
      }
    }
    if (broken) continue;

    const plan = assemblePlan(
      input.start,
      segment,
      built.points,
      budget,
      built.snappedIndices.length,
      input.streetFeatures,
    );
    const overlap = maxStreetOverlap(plan.legs.map((leg) => leg.geometry));
    if (overlap <= SAME_STREET_OVERLAP_THRESHOLD) {
      // Первый вариант с чистой петлёй закрывает задачу — порядок вариантов
      // и есть приоритет (детерминизм §13).
      return { ok: true, plan };
    }
    survivors.push({ plan, overlap });
    lastError = `все варианты розы дают перекрытие улиц (лучшее ~${Math.round(
      Math.min(...survivors.map((s) => s.overlap)) * 100,
    )}%)`;
  }

  // Ни один вариант не прошёл гейт улиц — отдаём минимальное перекрытие:
  // «лучший из худших лучше случайного», гейт честно помечает провал.
  if (survivors.length > 0) {
    let best = survivors[0];
    for (const candidate of survivors) {
      if (candidate.overlap < best.overlap - 1e-9) best = candidate;
    }
    return { ok: true, plan: best.plan };
  }

  return {
    ok: false,
    failure: { code: 'NO_ROUTE', detail: `уличная петля не построилась: ${lastError}` },
  };
}

// --- Сборка плана и утилиты ---

/**
 * План без якорей: ноги разрезаны по вейпоинтам ради консистентного рендера.
 * snappedCount ≥ 2 (S3) — петля осмысленно притянута к среде: план помечается
 * streetInterest вместо метки loop-only (закрытый union уровней не расширяется);
 * заметку для карточки берёт uiAdapter. Один снап или ни одного — деградация
 * как раньше: геометрическая роза без сигнала среды.
 */
function assemblePlan(
  start: WalkLatLng,
  segment: WalkRouteSegment,
  waypoints: WalkLatLng[],
  budgetMinutes: number,
  snappedCount: number,
  streetFeatures?: WalkStreetFeature[],
): WalkPlan {
  const path: WalkLatLng[] = [start, ...waypoints, start];
  const segments = splitPolylineByWaypoints(segment.geometry ?? [], waypoints);
  const metrics = splitRouteMetrics(segments, segment.distanceMeters, segment.durationSeconds);
  const legs: WalkLeg[] = path.slice(0, -1).map((from, i) => ({
    from,
    to: path[i + 1],
    distanceMeters: metrics[i].distanceMeters,
    durationMinutes: metrics[i].durationMinutes,
    geometry: segments[i],
  }));

  // Микро-стопы (S4/B2) — минуты ДО гейтов: attach добавляет их в ноги,
  // totals пересчитываются после — total и legDurations согласованы.
  attachMicroNotes({
    legs,
    features: streetFeatures,
    budgetMinutes,
    currentTotalMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
  });

  const totalWalkMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  // Гейты считаются честно против реального бюджета: при пустых якорях
  // anchors закономерно падает, бюджет — если коррекции радиуса исчерпались.
  const gates = evaluateGates({
    budgetMinutes,
    totalMinutes: totalWalkMinutes,
    stops: [],
    legDurations: legs.map((leg) => leg.durationMinutes),
    legGeometries: legs.map((leg) => leg.geometry),
    isLoop: true,
  });

  return {
    stops: [],
    legs,
    totalWalkMinutes,
    totalStayMinutes: 0,
    totalMinutes: totalWalkMinutes,
    score: 0,
    gates,
    allGatesPass: gates.every((g) => g.pass),
    // ≥2 снапнутых сектора — петля осмысленно притянута к среде (S3), это не
    // «чистая геометрия без сигнала»: другая формулировка карточки, не новый
    // уровень деградации.
    ...(snappedCount >= 2 ? { streetInterest: true as const } : { degraded: { level: 'loop-only' as const } }),
  };
}

function validMetrics(segment: WalkRouteSegment): boolean {
  return (
    Number.isFinite(segment.distanceMeters) &&
    segment.distanceMeters >= 0 &&
    Number.isFinite(segment.durationSeconds) &&
    segment.durationSeconds >= 0
  );
}

function validateInput(input: StreetLoopInput): WalkFailure | null {
  // Стержень старт/бюджет — общий модуль geo-utils (R6); кандидатов у L3 нет.
  const coreIssue = validateWalkCore(input);
  if (coreIssue) return { code: 'INVALID_INPUT', detail: coreIssue };
  return null;
}
