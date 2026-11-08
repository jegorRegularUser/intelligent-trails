// src/lib/places/label.ts
// Шаблоны лейблов карточки (docs/place-cards.md): локализованное имя,
// дедуп kind-слов, расстояния, суффикс «(рядом: …)».

import type { ReverseGeocodeResult } from '@/lib/geo/types';

import type { PlaceLocale } from './kinds';

/**
 * Локализованное имя: tags['name:<locale>'] → name → ''.
 * Имя на «не том» языке лучше пустоты — показываем то, что есть.
 */
export function localizedName(r: ReverseGeocodeResult, locale: PlaceLocale): string {
  const localized = r.tags?.[`name:${locale}`];
  return (localized && localized.trim()) || (r.name && r.name.trim()) || '';
}

/** Нормализация для сравнения: lowercase, ё→е, пунктуация → пробелы. */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Дедуп алиасов: если kind-слово уже звучит в имени — подпись скрывается.
 * «Памятник» + «Памятник Пушкину» → '' (покажем только имя),
 * «Музей» + «Эрмитаж» → 'Музей'.
 */
export function dedupeKindLabel(kindLabel: string, name: string): string {
  const kind = kindLabel.trim();
  if (!kind) return '';
  const nameNorm = normalizeLabel(name);
  if (!nameNorm) return kind;
  const kindNorm = normalizeLabel(kind);
  if (nameNorm === kindNorm || nameNorm.startsWith(`${kindNorm} `)) return '';
  return kind;
}

/**
 * Расстояние пешком: < 1000 м — целые метры, дальше — километры
 * с одним знаком («350 м» / «350 m», «1,2 км» / «1.2 km»).
 */
export function formatDistance(meters: number, locale: PlaceLocale): string {
  if (!Number.isFinite(meters) || meters < 0) return locale === 'ru' ? '—' : '—';
  if (meters < 1000) {
    return locale === 'ru' ? `${Math.round(meters)} м` : `${Math.round(meters)} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return locale === 'ru' ? `${km.replace('.', ',')} км` : `${km} km`;
}

/** Суффикс enrichment'а: «(рядом: Памятник Пушкину)» / «(near Pushkin Monument)». */
export function formatNearbySuffix(name: string, locale: PlaceLocale): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return locale === 'ru' ? `(рядом: ${trimmed})` : `(near ${trimmed})`;
}

/** Адрес из тегов, если geocoder не дал готовой строки. */
export function composeAddress(r: ReverseGeocodeResult): string | undefined {
  if (r.address && r.address.trim()) return r.address.trim();
  const street = r.tags?.['addr:street']?.trim();
  const house = r.tags?.['addr:housenumber']?.trim();
  if (street && house) return `${street}, ${house}`;
  if (street) return street;
  return undefined;
}
