// src/actions/geocoder.ts
"use server";

import { Coordinates } from "@/types/map";

const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY;

/**
 * Прямое геокодирование: Адрес -> [lat, lon]
 */
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  if (!apiKey) throw new Error("Не задан ключ API Яндекс Геокодера");

  try {
    const response = await fetch(
      `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${encodeURIComponent(address)}&format=json`,
      { next: { revalidate: 86400 } } 
    );

    if (!response.ok) throw new Error("Ошибка при запросе к геокодеру");

    const data = await response.json();
    const featureMember = data.response.GeoObjectCollection.featureMember;

    if (featureMember.length === 0) return null;

    const point = featureMember[0].GeoObject.Point.pos;
    const [lon, lat] = point.split(" ").map(Number);

    return [lat, lon];
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

  try {
    const [lat, lon] = coords;
    // ВАЖНО: Яндекс принимает координаты в формате "lon,lat"
    const response = await fetch(
      `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lon},${lat}&format=json`,
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) throw new Error("Ошибка обратного геокодирования");

    const data = await response.json();
    const featureMember = data.response.GeoObjectCollection.featureMember;

    if (featureMember.length === 0) {
      return { name: "Неизвестное место", address: "" };
    }

    const geoObject = featureMember[0].GeoObject;
    
    // name — это само здание/объект (например, "музей Эрмитаж" или "ул. Ленина, 5")
    // description — это район/город (например, "Санкт-Петербург, Россия")
    // text — это полный адрес одной строкой
    const name = geoObject.name || "Точка на карте";
    const address = geoObject.metaDataProperty?.GeocoderMetaData?.text || geoObject.description || "";

    return { 
      name, 
      address 
    };
  } catch (error) {
    console.error("Ошибка обратного геокодирования:", error);
    return { name: "Точка на карте", address: "" };
  }
}