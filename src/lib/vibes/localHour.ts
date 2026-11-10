// src/lib/vibes/localHour.ts
// Час в таймзоне юзера. hourAffinity архетипа и часовой fallback тьмы —
// про время ЮЗЕРА, а не сервера: на VPS в UTC вечерний вайб для мск-клиента
// съезжал на 3 часа (docs/vibes.md §8, контекст «сейчас»).
// Чистая функция без зависимостей — её же едят тесты на граничных часах.

/**
 * Час 0..23 в IANA-таймзоне юзера. Зона не передана или незнакома —
 * честная деградация в серверный час (лучше грубо, чем упасть).
 */
export function userLocalHour(now: Date, timeZone?: string): number {
  if (timeZone) {
    try {
      // h23 вместо hour12:false: у en-US полночь в некоторых ICU — «24», а нужен 0.
      const formatted = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone,
      }).format(now);
      const hour = Number.parseInt(formatted, 10);
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
    } catch {
      // Незнакомая IANA-зона (RangeError) — падаем в серверный час.
    }
  }
  return now.getHours();
}
