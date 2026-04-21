"use server";

import { Coordinates } from "@/types/map";

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

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY || process.env.YANDEX_SUGGEST_API_KEY;

  if (!apiKey) {
    console.error("Не задан ключ API Яндекс Подсказок");
    return [];
  }

  try {
    // Правильный URL для HTTP API Подсказок Яндекса (v1)
    let url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${apiKey}&text=${encodeURIComponent(query)}&results=7`; // Уменьшили с 10 до 7

    // Если есть геолокация пользователя, добавляем параметр ll для приоритизации результатов рядом
    if (userLocation) {
      const [lat, lon] = userLocation;
      url += `&ll=${lon},${lat}`; // Яндекс API использует формат lon,lat
    }

    const response = await fetch(url, {
      next: { revalidate: 300 } // Кэшируем на 5 минут
    });

    if (!response.ok) throw new Error("Ошибка API Подсказок");

    const data = await response.json();

    if (!data.results) return [];

    // Возвращаем только чистый текст
    const results = data.results.map((item: any) => ({
      title: item.title?.text || "",
      subtitle: item.subtitle?.text || "",
    }));

    // Сохраняем в кэш
    suggestCache.set(cacheKey, { results, timestamp: Date.now() });

    // Очищаем старые записи из кэша (если больше 100)
    if (suggestCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of suggestCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          suggestCache.delete(key);
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Ошибка при получении подсказок:", error);
    return [];
  }
}