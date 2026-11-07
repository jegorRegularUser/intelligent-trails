// src/lib/places/hours.ts
// Парсер подмножества OSM opening_hours. Правила игры — docs/place-cards.md:
// поддержано то, что реально встречается на табличках; всё непонятное → 'unknown'.
// Никогда не отвечаем 'closed' на строке, которую не смогли разобрать.

export type OpenState = 'open' | 'closed' | 'unknown';

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** Минуты дня, weekday: 0 = воскресенье … 6 = суббота. */
interface WallClock {
  weekday: number;
  minutes: number;
}

/** Коды Intl (weekday: 'short'): 'Sun', 'Mon', 'Tue'… */
const WEEKDAY_BY_INTL: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Коды OSM opening_hours: 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'. */
const WEEKDAY_BY_OSM: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

// Форматтеры на таймзону кэшируются: Intl-конструкция дорогая, а вызовов много.
const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

function wallClockInZone(at: Date, timeZone: string): WallClock | null {
  let fmt = formatterCache.get(timeZone);
  if (fmt === undefined) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      fmt = null; // неизвестная таймзона
    }
    formatterCache.set(timeZone, fmt);
  }
  if (!fmt) return null;

  let weekday = -1;
  let hour = -1;
  let minute = -1;
  for (const part of fmt.formatToParts(at)) {
    if (part.type === 'weekday') weekday = WEEKDAY_BY_INTL[part.value.toLowerCase()] ?? -1;
    else if (part.type === 'hour') hour = Number.parseInt(part.value, 10);
    else if (part.type === 'minute') minute = Number.parseInt(part.value, 10);
  }
  if (weekday < 0 || hour < 0 || minute < 0) return null;
  return { weekday, minutes: hour * 60 + minute };
}

/**
 * Расписание недели: интервалы [start, end) в минутах недели (0..10080).
 * Сутки через полночь и граница недели разрезаются на два интервала,
 * поэтому containment-проверка остаётся тривиальной.
 */
type WeekSchedule = Array<[number, number]>;

interface ParsedRule {
  /** Дни недели, к которым относится правило. */
  days: Set<number>;
  /** Диапазоны времени внутри дня, минуты [start, end); end может превышать 1440. */
  spans: Array<[number, number]>;
  /** Правило-вычитание ('Tu off'). */
  isOff: boolean;
}

const DAY_TOKEN = /^(su|mo|tu|we|th|fr|sa)(-(su|mo|tu|we|th|fr|sa))?$/;
const TIME_TOKEN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
const OFF_MODIFIER = /^(off|closed)$/;
const OPEN_MODIFIER = /^open$/;

function parseMinutes(h: number, m: number): number | null {
  if (m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** '22:00-04:00' → [1320, 1680] (end > 1440 означает переход через полночь). */
function parseTimeToken(token: string): [number, number] | null {
  const match = TIME_TOKEN.exec(token);
  if (!match) return null;
  const [, h1, m1, h2, m2] = match;
  const startH = Number(h1);
  const endH = Number(h2);
  // Начало — внутри суток; конец может быть ровно 24:00.
  if (startH < 0 || startH > 23 || endH < 0 || endH > 24) return null;
  const start = parseMinutes(startH, Number(m1));
  let end = parseMinutes(endH, Number(m2));
  if (start === null || end === null) return null;
  if (endH === 24 && Number(m2) !== 0) return null;
  if (end === 0) end = MINUTES_PER_DAY; // '00:00' как конец = полночь
  if (start === end) return null; // нулевой диапазон — мусор
  if (end < start) end += MINUTES_PER_DAY; // через полночь
  return [start, end];
}

function parseDayToken(token: string): Set<number> | null {
  const match = DAY_TOKEN.exec(token);
  if (!match) return null;
  const from = WEEKDAY_BY_OSM[match[1]];
  const to = match[2] ? WEEKDAY_BY_OSM[match[3]] : from;
  if (from === undefined || to === undefined) return null;
  if (!match[2]) return new Set([from]);
  // Диапазон дней может пересекать границу недели: Fr-Mo = Fr,Sa,Su,Mo.
  const days = new Set<number>();
  let cursor = from;
  for (let guard = 0; guard < 7; guard += 1) {
    days.add(cursor);
    if (cursor === to) break;
    cursor = (cursor + 1) % 7;
  }
  return days;
}

function parseRule(rule: string): ParsedRule | null {
  const text = rule.trim().toLowerCase();
  if (!text) return null;
  if (text === '24/7') {
    return {
      days: new Set([0, 1, 2, 3, 4, 5, 6]),
      spans: [[0, MINUTES_PER_DAY]],
      isOff: false,
    };
  }

  const days = new Set<number>();
  const spans: Array<[number, number]> = [];
  let isOff = false;
  let sawDay = false;
  let sawTime = false;

  for (const token of text.split(/[\s,]+/)) {
    if (!token) continue;
    if (OFF_MODIFIER.test(token)) {
      isOff = true;
      continue;
    }
    if (OPEN_MODIFIER.test(token)) {
      isOff = false; // явный 'open' — обычное добавляющее правило
      continue;
    }
    const daySet = parseDayToken(token);
    if (daySet) {
      for (const day of daySet) days.add(day);
      sawDay = true;
      continue;
    }
    const span = parseTimeToken(token);
    if (span) {
      spans.push(span);
      sawTime = true;
      continue;
    }
    return null; // неизвестный токен (PH, sunrise, '+', месяцы…) — правило целиком непарсируемо
  }

  if (!sawDay && !sawTime) {
    if (!isOff) return null;
    // Голое 'off'/'closed' — вычитаем всю неделю.
    for (let day = 0; day < 7; day += 1) days.add(day);
    spans.push([0, MINUTES_PER_DAY]);
    return { days, spans, isOff };
  }
  if (!sawDay) {
    // Время без дней — все семь дней.
    for (let day = 0; day < 7; day += 1) days.add(day);
  }
  if (spans.length === 0) {
    // Дни без времени: 'Tu off' — вычитаем сутки; 'Mo-Fr' без off = круглосуточно в эти дни.
    spans.push([0, MINUTES_PER_DAY]);
  }
  return { days, spans, isOff };
}

function addSpan(schedule: WeekSchedule, day: number, span: [number, number]): void {
  const [spanStart, spanEnd] = span;
  const start = day * MINUTES_PER_DAY + spanStart;
  const end = day * MINUTES_PER_DAY + spanEnd;
  if (end <= MINUTES_PER_WEEK) {
    schedule.push([start, end]);
    return;
  }
  // Переход через границу недели (вс→пн): режем на хвост и начало.
  schedule.push([start, MINUTES_PER_WEEK]);
  schedule.push([0, end - MINUTES_PER_WEEK]);
}

function subtractInterval(schedule: WeekSchedule, start: number, end: number): WeekSchedule {
  const next: WeekSchedule = [];
  for (const [s, e] of schedule) {
    if (e <= start || s >= end) {
      next.push([s, e]); // не пересекаются
      continue;
    }
    if (s < start) next.push([s, start]);
    if (end < e) next.push([end, e]);
  }
  return next;
}

function buildSchedule(rules: ParsedRule[]): WeekSchedule {
  let schedule: WeekSchedule = [];
  for (const rule of rules) {
    for (const day of rule.days) {
      for (const span of rule.spans) {
        if (rule.isOff) {
          const start = day * MINUTES_PER_DAY + span[0];
          const end = day * MINUTES_PER_DAY + span[1];
          if (end <= MINUTES_PER_WEEK) {
            schedule = subtractInterval(schedule, start, end);
          } else {
            schedule = subtractInterval(schedule, start, MINUTES_PER_WEEK);
            schedule = subtractInterval(schedule, 0, end - MINUTES_PER_WEEK);
          }
        } else {
          addSpan(schedule, day, span);
        }
      }
    }
  }
  return schedule;
}

/**
 * Открыто ли место в момент `at` по строке opening_hours в таймзоне `timeZone`.
 * Страта честности: непустой непарсируемый ввод, пустая строка и неизвестная
 * таймзона дают 'unknown'; 'closed' возвращается только для успешно
 * разобранного расписания, где закрытие доказано.
 *
 * Границы: открытие включительно, закрытие исключительно
 * ('09:00-18:00': в 09:00 открыто, в 18:00 уже закрыто).
 */
export function evaluateOpeningHours(
  raw: string | undefined | null,
  at: Date,
  timeZone: string,
): OpenState {
  if (typeof raw !== 'string') return 'unknown';
  const text = raw.trim();
  if (!text) return 'unknown';

  const clock = wallClockInZone(at, timeZone);
  if (!clock) return 'unknown';

  const rules: ParsedRule[] = [];
  for (const part of text.split(';')) {
    const rule = parseRule(part);
    if (!rule) return 'unknown'; // одно непонятное правило портит всю строку
    rules.push(rule);
  }

  const schedule = buildSchedule(rules);
  const now = clock.weekday * MINUTES_PER_DAY + clock.minutes;
  return schedule.some(([start, end]) => start <= now && now < end) ? 'open' : 'closed';
}
