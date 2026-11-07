// src/lib/geo/cache.ts
// Единый кэш geo-слоя: TTL + LRU-вытеснение (ADR-001, правило 3).
// Recency обновляется при чтении; вытесняется самый старый по использованию.

import { LatLng } from './types';

export interface TtlLruCacheOptions {
  /** Жёсткий предел числа записей. */
  maxEntries: number;
  /** TTL по умолчанию, мс (можно переопределить на set). */
  defaultTtlMs: number;
  /** Инъекция часов для тестов. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlLruCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly now: () => number;

  constructor(private readonly options: TtlLruCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  /** undefined = промах; V может быть и null (кэш пустых ответов). */
  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Map сохраняет порядок вставки → переложили в конец = «недавно использован».
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number): void {
    const expiresAt = this.now() + (ttlMs ?? this.options.defaultTtlMs);
    // Перезапись существующего ключа тоже освежает его позицию в LRU.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/**
 * Округление до 5 знаков (~1.1 м) — база ключей кэша (ADR-001, правило 3).
 * В апстрим уходят те же округлённые координаты, чтобы сеть и кэш были согласованы.
 */
export function round5(value: number): number {
  const rounded = Math.round(value * 1e5) / 1e5;
  // −0 в ключе строкой «0.00000» всё равно не отличить, но приведём явно.
  return rounded === 0 ? 0 : rounded;
}

export function roundPoint(point: LatLng): LatLng {
  return [round5(point[0]), round5(point[1])];
}

/** Стабильный строковый ключ точки («55.75124,37.61842»). */
export function pointKey(point: LatLng): string {
  const [lat, lng] = roundPoint(point);
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}
