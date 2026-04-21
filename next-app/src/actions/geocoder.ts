// src/actions/geocoder.ts
"use server";

import { Coordinates } from "@/types/map";

const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY;

// In-memory кэш для геокодирования (живет 10 минут)
const geocodeCache = new Map<string, { coords: Coordinates | null; timestamp: number }>();
const reverseGeocodeCache = new Map<string, { result: { name: string; address: string }; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

/**
 * Прямое геокодирование: Адрес -> [lat, lon]
 */
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  if (!apiKey) throw new Error("Не задан ключ API Яндекс Геокодера");

  // Проверяем кэш
  const cached = geocodeCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.coords;
  }

  try {
    const response = await fetch(
      `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${encodeURIComponent(address)}&format=json`,
      { next: { revalidate: 600 } } // Кэшируем на 10 минут
    );

    if (!response.ok) throw new Error("Ошибка при запросе к геокодеру");

    const data = await response.json();
    const featureMember = data.response.GeoObjectCollection.featureMember;

    if (featureMember.length === 0) {
      geocodeCache.set(address, { coords: null, timestamp: Date.now() });
      return null;
    }

    const point = featureMember[0].GeoObject.Point.pos;
    const [lon, lat] = point.split(" ").map(Number);
    const coords: Coordinates = [lat, lon];

    // Сохраняем в кэш
    geocodeCache.set(address, { coords, timestamp: Date.now() });

    // Очищаем старые записи
    if (geocodeCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of geocodeCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          geocodeCache.delete(key);
        }
      }
    }

    return coords;
  } catch (error) {
    console.error("Ошибка прямого геокодирования:", error);
    return null;
  }
}

/**
 * ОБРАТНОЕ ГЕОКОДИРОВАНИЕ: [lat, lon] -> { name, address }
 * Именно эта функция убирает "Старт" и "Финиш" из интерфейса.
 */
export async function reverseGeocode(coords: Coordinates): Promise<{ name: string; address: string }> {
  if (!apiKey) throw new Error("Не задан ключ API Яндекс Геокодера");

  // Проверяем кэш
  const cacheKey = `${coords[0]},${coords[1]}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const [lat, lon] = coords;
    // ВАЖНО: Яндекс принимает координаты в формате "lon,lat"
    const response = await fetch(
      `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lon},${lat}&format=json&kind=house`,
      { next: { revalidate: 600 } } // Кэшируем на 10 минут
    );

    if (!response.ok) {
      console.error("Geocoder API error:", response.status, await response.text());
      return { name: "Точка на карте", address: "" };
    }

    const data = await response.json();
    const featureMember = data.response.GeoObjectCollection.featureMember;

    if (featureMember.length === 0) {
      return { name: "Неизвестное место", address: "" };
    }

    const geoObject = featureMember[0].GeoObject;
    const metaData = geoObject.metaDataProperty?.GeocoderMetaData;

    // name — это само здание/объект (например, "музей Эрмитаж" или "ул. Ленина, 5")
    const rawName = geoObject.name || "Точка на карте";

    // Формируем короткий адрес: улица, дом, город (без страны и региона)
    let shortName = rawName;
    let formattedAddress = "";

    if (metaData?.Address?.Components) {
      const components = metaData.Address.Components;
      const street = components.find((c: any) => c.kind === 'street')?.name;
      const house = components.find((c: any) => c.kind === 'house')?.name;
      const locality = components.find((c: any) => c.kind === 'locality')?.name;

      // Формируем короткое название: улица, дом
      if (street && house) {
        shortName = `${street}, ${house}`;
      } else if (street) {
        shortName = street;
      }

      // Формируем полный адрес: улица, дом, город (без страны)
      if (street && house && locality) {
        formattedAddress = `${street}, ${house}, ${locality}`;
      } else if (street && locality) {
        formattedAddress = `${street}, ${locality}`;
      } else {
        formattedAddress = metaData?.text || geoObject.description || "";
      }
    } else {
      formattedAddress = metaData?.text || geoObject.description || "";
    }

    const result = {
      name: shortName,
      address: formattedAddress
    };

    // Сохраняем в кэш
    reverseGeocodeCache.set(cacheKey, { result, timestamp: Date.now() });

    // Очищаем старые записи
    if (reverseGeocodeCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of reverseGeocodeCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          reverseGeocodeCache.delete(key);
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Ошибка обратного геокодирования:", error);
    return { name: "Точка на карте", address: "" };
  }
}

/**
 * Пакетное геокодирование для альтернатив
 * Возвращает массив { name, address } в том же порядке
 */
export async function batchReverseGeocode(coordsList: Coordinates[]): Promise<Array<{ name: string; address: string }>> {
  if (!apiKey) throw new Error("Не задан ключ API Яндекс Геокодера");

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