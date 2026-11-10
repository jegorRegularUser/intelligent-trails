// src/actions/geocoder.ts
"use server";

// Геокодирование эксперт-режима на едином geo-слое (ADR-001): Photon →
// Nominatim внутри CloudProvider, с лимитером и TTL/LRU-кэшами. Легаси-стек
// (Yandex Geocode 1.x + services/nominatimGeocoder со своим кэшем) выведен
// в ADR-002; сигнатуры экшенов сохранены — routeBuilder и RouteMap не менялись.
import { Coordinates } from "@/types/map";
import { getCloudProvider } from "@/lib/geo/instance";

/**
 * Прямое геокодирование: Адрес -> [lat, lon].
 * Первая подсказка с координатами; пусто/отказ — null, решает вызывающий.
 */
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const items = await getCloudProvider().suggest(query);
    return items.find((item) => item.coordinates)?.coordinates ?? null;
  } catch (error) {
    console.warn("Forward geocode failed:", error);
    return null;
  }
}

/**
 * ОБРАТНОЕ ГЕОКОДИРОВАНИЕ: [lat, lon] -> { name, address }
 * Именно эта функция убирает "Старт" и "Финиш" из интерфейса.
 * null от провайдера или отказ апстрима — честный фолбэк «Точка на карте»:
 * заглушка теперь только там, где правда нечего сказать (docs/PRODUCT.md,
 * честная деградация).
 */
export async function reverseGeocode(coords: Coordinates): Promise<{ name: string; address: string }> {
  const fallback = { name: "Точка на карте", address: `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}` };
  try {
    const result = await getCloudProvider().reverseGeocode(coords);
    if (!result) return fallback;
    return {
      name: result.name ?? fallback.name,
      address: result.address ?? "",
    };
  } catch (error) {
    console.error("Reverse geocode failed:", error);
    return fallback;
  }
}

/**
 * Пакетное геокодирование для альтернатив. Порядок входа сохраняется;
 * темп и дубли гасят лимитер и кэши адаптера — искусственные задержки
 * (setTimeout-лесенка) больше не нужны.
 */
export async function batchReverseGeocode(
  coordsList: Coordinates[],
): Promise<Array<{ name: string; address: string }>> {
  return Promise.all(coordsList.map((coords) => reverseGeocode(coords)));
}
