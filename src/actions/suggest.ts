"use server";

import { Coordinates } from "@/types/map";
import { CloudProvider } from "@/lib/geo";

export interface YandexSuggestResult {
  title: string;
  subtitle: string;
}

// Простой in-memory кэш для подсказок (живет 5 минут)
const suggestCache = new Map<string, { results: YandexSuggestResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

export async function getAddressSuggestions(query: string, userLocation?: Coordinates | null): Promise<YandexSuggestResult[]> {
  if (!query.trim()) return [];

  // Проверяем кэш
  const cacheKey = `${query}:${userLocation?.[0]},${userLocation?.[1]}`;
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }

  const results = await fetchYandexSuggestions(query, userLocation)
    .catch(() => [] as YandexSuggestResult[]);

  // Универсальный фолбэк: Photon публичный — работает без ключей в любом городе
  const finalResults = results.length > 0 ? results : await fetchPhotonSuggestions(query, userLocation).catch(() => []);

  if (finalResults.length > 0) {
    suggestCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
  }
  return finalResults;
}

/** Яндекс Suggest (нужен ключ; ключа нет — пусто, дальше фолбэк). */
async function fetchYandexSuggestions(
  query: string,
  userLocation?: Coordinates | null,
): Promise<YandexSuggestResult[]> {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY || process.env.YANDEX_SUGGEST_API_KEY;
  if (!apiKey) return [];

  let url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${apiKey}&text=${encodeURIComponent(query)}&results=7`;
  if (userLocation) {
    const [lat, lon] = userLocation;
    url += `&ll=${lon},${lat}`; // Яндекс API использует формат lon,lat
  }

  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error("Ошибка API Подсказок");

  const data = await response.json();
  if (!data.results) return [];

  return data.results.map((item: any) => ({
    title: item.title?.text || "",
    subtitle: item.subtitle?.text || "",
  }));
}

/** Photon public: мировой геокодер без ключа, bias по точке пользователя. */
async function fetchPhotonSuggestions(
  query: string,
  userLocation?: Coordinates | null,
): Promise<YandexSuggestResult[]> {
  const provider = new CloudProvider({});
  const items = await provider.suggest(query, userLocation ?? undefined);
  return items
    .filter((item) => item.title)
    .slice(0, 7)
    .map((item) => ({
      title: item.title,
      subtitle: item.subtitle ?? "",
    }));
}
