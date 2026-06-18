// src/actions/geocoder.ts
"use server";

import { Coordinates } from "@/types/map";
import { nominatimForwardGeocode, nominatimReverseGeocode } from "@/services/nominatimGeocoder";

const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY;

// In-memory кэш для геокодирования (живет 10 минут)
const geocodeCache = new Map<string, { coords: Coordinates | null; timestamp: number }>();
const reverseGeocodeCache = new Map<string, { result: { name: string; address: string }; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

/**
 * Прямое геокодирование: Адрес -> [lat, lon]
 */
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  // Проверяем кэш
  const cached = geocodeCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.coords;
  }

  let coords: Coordinates | null = null;

  if (apiKey) {
    try {
      const response = await fetch(
        `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${encodeURIComponent(address)}&format=json`,
        { next: { revalidate: 600 } }
      );

      if (response.ok) {
        const data = await response.json();
        const featureMember = data.response.GeoObjectCollection.featureMember;

        if (featureMember.length > 0) {
          const point = featureMember[0].GeoObject.Point.pos;
          const [lon, lat] = point.split(" ").map(Number);
          coords = [lat, lon];
        }
      }
    } catch (error) {
      console.warn("Yandex forward geocode failed, trying Nominatim:", error);
    }
  }

  if (!coords) {
    coords = await nominatimForwardGeocode(address);
  }

  geocodeCache.set(address, { coords, timestamp: Date.now() });

  if (geocodeCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of geocodeCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        geocodeCache.delete(key);
      }
    }
  }

  return coords;
}

/**
 * ОБРАТНОЕ ГЕОКОДИРОВАНИЕ: [lat, lon] -> { name, address }
 * Именно эта функция убирает "Старт" и "Финиш" из интерфейса.
 */
export async function reverseGeocode(coords: Coordinates): Promise<{ name: string; address: string }> {
  // Проверяем кэш
  const cacheKey = `${coords[0]},${coords[1]}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const fallback = { name: "Точка на карте", address: `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}` };

  if (apiKey) {
    try {
      const [lat, lon] = coords;
      const response = await fetch(
        `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lon},${lat}&format=json&kind=house`,
        { next: { revalidate: 600 } }
      );

      if (response.ok) {
        const data = await response.json();
        const featureMember = data.response.GeoObjectCollection.featureMember;

        if (featureMember.length > 0) {
          const geoObject = featureMember[0].GeoObject;
          const metaData = geoObject.metaDataProperty?.GeocoderMetaData;
          const rawName = geoObject.name || "Точка на карте";

          let shortName = rawName;
          let formattedAddress = "";

          if (metaData?.Address?.Components) {
            const components = metaData.Address.Components;
            const street = components.find((c: { kind: string }) => c.kind === 'street')?.name;
            const house = components.find((c: { kind: string }) => c.kind === 'house')?.name;
            const locality = components.find((c: { kind: string }) => c.kind === 'locality')?.name;

            if (street && house) shortName = `${street}, ${house}`;
            else if (street) shortName = street;

            if (street && house && locality) formattedAddress = `${street}, ${house}, ${locality}`;
            else if (street && locality) formattedAddress = `${street}, ${locality}`;
            else formattedAddress = metaData?.text || geoObject.description || "";
          } else {
            formattedAddress = metaData?.text || geoObject.description || "";
          }

          const result = { name: shortName, address: formattedAddress };
          reverseGeocodeCache.set(cacheKey, { result, timestamp: Date.now() });
          return result;
        }
      }
    } catch (error) {
      console.warn("Yandex reverse geocode failed, trying Nominatim:", error);
    }
  }

  try {
    const result = await nominatimReverseGeocode(coords);
    reverseGeocodeCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("Nominatim reverse geocode failed:", error);
    return fallback;
  }
}

/**
 * Пакетное геокодирование для альтернатив
 * Возвращает массив { name, address } в том же порядке
 */
export async function batchReverseGeocode(coordsList: Coordinates[]): Promise<Array<{ name: string; address: string }>> {
  try {
    // Геокодируем параллельно с небольшой задержкой между запросами
    const results = await Promise.all(
      coordsList.map((coords, index) =>
        new Promise<{ name: string; address: string }>(resolve => {
          // Задержка 50ms между запросами, чтобы не перегрузить API
          setTimeout(async () => {
            try {
              const result = await reverseGeocode(coords);
              resolve(result);
            } catch (error) {
              console.error(`Ошибка геокодирования координат ${coords}:`, error);
              resolve({ name: "Точка на карте", address: "" });
            }
          }, index * 50);
        })
      )
    );

    return results;
  } catch (error) {
    console.error("Ошибка пакетного геокодирования:", error);
    // Возвращаем заглушки
    return coordsList.map(() => ({ name: "Точка на карте", address: "" }));
  }
}