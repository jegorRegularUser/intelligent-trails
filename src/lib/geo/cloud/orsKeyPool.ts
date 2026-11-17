// src/lib/geo/cloud/orsKeyPool.ts
// Пул ключей OpenRouteService с ротацией. Один free-ключ ORS живёт на пару
// сборок (матричная квота сгорает клетками матрицы) — мировое решение без
// денег это N ключей, расход размазан round-robin'ом, исчерпанный помечается
// до сброса квоты (полночь UTC по наблюдениям 11–12.11) и трафик уходит на
// соседний. Ключи — секрет: в env через запятую, в git не попадают.

import { GeoError } from '../types';

export interface OrsKeyEntry {
  key: string;
  /** Мс-эпоха, до которой ключ считается исчерпанным; 0 — жив. */
  exhaustedUntil: number;
}

/** Следующая полночь UTC — момент сброса суточных квот ORS. */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export class OrsKeyPool {
  private readonly entries: OrsKeyEntry[];
  /** Индекс «текущего» ключа: движется вперёд на каждый расход — квоты
   *  съедаются равномерно, а не первым ключом до дна. */
  private cursor = 0;

  constructor(keys: string[]) {
    this.entries = keys
      .map((raw) => raw.trim())
      .filter((key) => key.length > 0)
      .map((key) => ({ key, exhaustedUntil: 0 }));
    // Дубликаты в env — тот же квотный аккаунт дважды, выкидываем.
    const unique = new Set(this.entries.map((e) => e.key));
    while (this.entries.length > unique.size) {
      const seen = new Set<string>();
      for (let i = this.entries.length - 1; i >= 0; i--) {
        if (seen.has(this.entries[i].key)) this.entries.splice(i, 1);
        seen.add(this.entries[i].key);
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /** Сколько ключей живы прямо сейчас. */
  liveCount(now = Date.now()): number {
    return this.entries.filter((e) => e.exhaustedUntil <= now).length;
  }

  /**
   * Текущий рабочий ключ (round-robin среди живых): вызов потребляет слот и
   * двигает курсор. Без живых — честный GeoError с моментом сброса квоты;
   * пустой пул — «ключи не заданы».
   */
  current(now = Date.now()): string {
    if (this.entries.length === 0) {
      throw new GeoError(
        'UPSTREAM_UNAVAILABLE',
        'Ключи ORS не заданы (OPENROUTESERVICE_API_KEY(S))',
      );
    }
    const live = this.liveCount(now);
    if (live === 0) {
      const soonest = Math.min(...this.entries.map((e) => e.exhaustedUntil));
      const resetAt = new Date(soonest);
      throw new GeoError(
        'UPSTREAM_UNAVAILABLE',
        `Все ключи ORS исчерпаны — квоты обновятся около ${resetAt.toISOString().slice(0, 16)}Z`,
      );
    }
    // Курсор может указать на исчерпанный — сдвигаем к ближайшему живому
    // и потребляем слот (следующий вызов начнёт со следующего ключа).
    for (let step = 0; step < this.entries.length; step++) {
      const index = (this.cursor + step) % this.entries.length;
      if (this.entries[index].exhaustedUntil <= now) {
        this.cursor = (index + 1) % this.entries.length;
        return this.entries[index].key;
      }
    }
    throw new GeoError('UPSTREAM_UNAVAILABLE', 'Все ключи ORS исчерпаны');
  }

  /**
   * Ключ упёрся в квоту (403/429): помечаем до сброса и отдаём следующий
   * живой. Все исчерпаны — null, вызывающий бросает исходный отказ.
   */
  markExhausted(key: string, now = Date.now()): string | null {
    const entry = this.entries.find((e) => e.key === key);
    if (entry) entry.exhaustedUntil = nextUtcMidnight(now);
    try {
      // current() сам переедет на следующий живой round-robin'ом.
      return this.current(now);
    } catch {
      return null;
    }
  }
}
