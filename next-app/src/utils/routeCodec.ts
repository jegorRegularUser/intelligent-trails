import { Coordinates, RoutingMode } from "@/types/map";

// Упрощенный интерфейс только с ВАЖНЫМИ данными для URL
export interface CompressedRoute {
  s: Coordinates; // Start
  e?: Coordinates; // End
  st: RoutingMode; // Start Transport
  w: Array<{
    t: "a" | "c"; // type: address or category
    v: string;    // value
    c?: Coordinates; // coords
    d: number;    // duration
    m: RoutingMode; // modeToNext
  }>;
}

export function encodeRouteToUrl(data: any): string {
  try {
    const compressed: CompressedRoute = {
      s: data.startPoint,
      st: data.startTransport,
      w: data.waypoints.map((wp: any) => ({
        t: wp.type === "address" ? "a" : "c",
        v: wp.value,
        c: wp.coords,
        d: wp.duration,
        m: wp.modeToNext,
      })),
    };
    
    if (data.endPoint) {
      compressed.e = data.endPoint;
    }

    // Превращаем в строку -> кодируем в Base64 -> делаем безопасным для URL
    const jsonString = JSON.stringify(compressed);
    return encodeURIComponent(btoa(encodeURIComponent(jsonString)));
  } catch (e) {
    console.error("Ошибка кодирования маршрута", e);
    return "";
  }
}

export function decodeRouteFromUrl(encodedStr: string): any | null {
  try {
    // Декодируем из URL -> Декодируем Base64 -> Парсим JSON
    const jsonString = decodeURIComponent(atob(decodeURIComponent(encodedStr)));
    const compressed: CompressedRoute = JSON.parse(jsonString);

    // Восстанавливаем в полный формат для Zustand
    return {
      startPoint: compressed.s,
      startTransport: compressed.st,
      endPoint: compressed.e || null,
      waypoints: compressed.w.map((cw: any, index: number) => ({
        id: `url-wp-${index}`, // Генерируем новые ID
        type: cw.t === "a" ? "address" : "category",
        value: cw.v,
        coords: cw.c,
        duration: cw.d,
        modeToNext: cw.m,
      })),
    };
  } catch (e) {
    console.error("Ошибка декодирования маршрута", e);
    return null;
  }
}