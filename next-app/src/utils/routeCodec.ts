import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { Coordinates, RoutingMode, PlaceOfInterest } from "@/types/map";

const V2_PREFIX = "2.";
const COORD_SCALE = 1e5;

type ModeCode = "p" | "a" | "m" | "b";

type PointTypeCode = 0 | 1; // 0 = address-like, 1 = category

type EndTuple = 0 | [PointTypeCode, number, number, string, string];

// Waypoint tuple (positional to reduce JSON size):
// [t, v, latI, lonI, n, stayDuration, m, i, altFlat?, altNames?, oc?, dist?, dur?]
// altFlat: [latI, lonI, latI, lonI, ...]
// altNames: ["Name 1", "Name 2", ...]
// dist: distanceToNext (meters)
// dur: durationToNext (minutes)
export type WaypointTupleV2 = [
  PointTypeCode,
  string,
  number,
  number,
  string,
  number, // stayDuration (minutes)
  ModeCode,
  number,
  number[]?,
  string[]?,
  string?,
  number?,
  number?
];

export type RoutePayloadV2 = [
  number, // start latI
  number, // start lonI
  string, // start name
  ModeCode, // start transport
  EndTuple,
  WaypointTupleV2[],
  number?, // startDistanceToNext
  number?  // startDurationToNext
];

function roundCoord(value: number): number {
  return Math.round(value * COORD_SCALE);
}

function unroundCoord(value: number): number {
  return value / COORD_SCALE;
}

function encodeCoords(coords: Coordinates): [number, number] {
  return [roundCoord(coords[0]), roundCoord(coords[1])];
}

function decodeCoords(latI: number, lonI: number): Coordinates {
  return [unroundCoord(latI), unroundCoord(lonI)];
}

function modeToCode(mode: RoutingMode): ModeCode {
  switch (mode) {
    case "pedestrian":
      return "p";
    case "auto":
      return "a";
    case "masstransit":
      return "m";
    case "bicycle":
      return "b";
    default:
      return "p";
  }
}

function codeToMode(code: string): RoutingMode {
  switch (code) {
    case "p":
      return "pedestrian";
    case "a":
      return "auto";
    case "m":
      return "masstransit";
    case "b":
      return "bicycle";
    default:
      return "pedestrian";
  }
}

function typeToCode(type: any): PointTypeCode {
  // 'map' behaves like an address-like point (coords are explicit)
  return type === "category" ? 1 : 0;
}

function codeToType(code: number): "address" | "category" {
  return code === 1 ? "category" : "address";
}

function toPlaceholdersFromAltFlat(
  altFlat: number[] | undefined,
  altNames: string[] | undefined,
  category: string
): PlaceOfInterest[] | undefined {
  if (!altFlat || altFlat.length < 2) return undefined;

  const result: PlaceOfInterest[] = [];
  for (let i = 0; i + 1 < altFlat.length; i += 2) {
    const latI = altFlat[i];
    const lonI = altFlat[i + 1];
    const index = i / 2;
    const name = altNames?.[index] || `Вариант ${index + 1}`;

    result.push({
      id: index,
      name,
      category,
      coordinates: decodeCoords(latI, lonI),
    });
  }

  return result.length > 0 ? result : undefined;
}

// ===================== Legacy v1 =====================
// NOTE: kept only for backward compatibility with already saved routes / links.
interface LegacyCompressedRoute {
  s: Coordinates;
  sn: string;
  sa?: string;
  st: RoutingMode;
  e?: Coordinates;
  en?: string;
  ea?: string;
  et?: "a" | "c";
  ec?: string;
  w: Array<{
    t: "a" | "c";
    v: string;
    c: Coordinates;
    n: string;
    a?: string;
    d: number;
    m: RoutingMode;
    i?: number;
    alt?: Array<[number, number, string]>;
    dist?: number;
    dur?: number;
    oc?: string;
  }>;
}

function atobCompat(input: string): string {
  // Node 18+ has atob, but keep a safe fallback for test/runtime variance.
  if (typeof atob === "function") return atob(input);
  return Buffer.from(input, "base64").toString("binary");
}

function decodeLegacy(encodedStr: string): any | null {
  try {
    const jsonString = decodeURIComponent(atobCompat(decodeURIComponent(encodedStr)));
    const compressed: LegacyCompressedRoute = JSON.parse(jsonString);

    return {
      startPoint: compressed.s,
      startPointName: compressed.sn,
      startPointAddress: compressed.sa,
      startTransport: compressed.st,
      endPoint: compressed.e || null,
      endPointName: compressed.en,
      endPointAddress: compressed.ea,
      // If et is missing in older payloads, treat as address-like.
      endPointType: compressed.et ? (compressed.et === "a" ? "address" : "category") : "address",
      endPointCategory: compressed.ec,
      waypoints: compressed.w.map((cw: any, index: number) => ({
        id: `url-wp-${index}`,
        type: cw.t === "a" ? "address" : "category",
        value: cw.v,
        coords: cw.c,
        resolvedName: cw.n,
        address: cw.a,
        duration: cw.d,
        modeToNext: cw.m,
        selectedAlternativeIndex: cw.i || 0,
        originalCategory: cw.oc,
        distanceToNext: cw.dist,
        durationToNext: cw.dur,
        alternatives: cw.alt
          ? cw.alt.map((alt: any, altIndex: number) => ({
              id: altIndex,
              name: alt[2],
              category: cw.oc || cw.v,
              coordinates: [alt[0], alt[1]] as Coordinates,
              address: alt[2],
            }))
          : undefined,
      })),
    };
  } catch (e) {
    return null;
  }
}

// ===================== v2 =====================
export function encodeRouteToUrl(data: any): string {
  try {
    if (!data?.startPoint || !data?.startTransport || !Array.isArray(data?.waypoints)) {
      return "";
    }

    const [sLatI, sLonI] = encodeCoords(data.startPoint);
    const sn = (data.startPointName || "") as string;
    const st = modeToCode(data.startTransport);

    const endTuple: EndTuple = data.endPoint
      ? (() => {
          const [eLatI, eLonI] = encodeCoords(data.endPoint as Coordinates);
          const et = typeToCode(data.endPointType);
          const en = (data.endPointName || "") as string;
          const ec = et === 1 ? ((data.endPointCategory || "") as string) : "";
          return [et, eLatI, eLonI, en, ec];
        })()
      : 0;

    const w: WaypointTupleV2[] = data.waypoints.map((wp: any) => {
      const t = typeToCode(wp.type);

      // For address-like points keep display name (shorter / more useful than raw input).
      const v = (t === 1 ? wp.value : wp.resolvedName || wp.value || "") as string;

      const coords: Coordinates | undefined = wp.coords;
      if (!coords) {
        throw new Error("Waypoint has no coords");
      }
      const [latI, lonI] = encodeCoords(coords);

      const n = (wp.resolvedName || wp.value || "") as string;
      const stayDuration = Number(wp.stayDuration || wp.duration || 0); // stayDuration или старое поле duration
      const m = modeToCode(wp.modeToNext);
      const i = Number(wp.selectedAlternativeIndex || 0);

      const oc = (wp.originalCategory || "") as string;

      let altFlat: number[] | undefined = undefined;
      let altNames: string[] | undefined = undefined;
      if (Array.isArray(wp.alternatives) && wp.alternatives.length > 0) {
        const flat: number[] = [];
        const names: string[] = [];
        for (const alt of wp.alternatives as PlaceOfInterest[]) {
          const [aLatI, aLonI] = encodeCoords(alt.coordinates);
          flat.push(aLatI, aLonI);
          names.push(alt.name || "");
        }
        if (flat.length > 0) {
          altFlat = flat;
          altNames = names;
        }
      }

      const dist = wp.distanceToNext !== undefined ? Number(wp.distanceToNext) : undefined;
      const dur = wp.durationToNext !== undefined ? Number(wp.durationToNext) : undefined;

      const tuple: WaypointTupleV2 = [t, v, latI, lonI, n, stayDuration, m, i];
      if (altFlat) tuple.push(altFlat);
      if (altNames) tuple.push(altNames as any); // Добавляем названия альтернатив
      if (oc && (t === 1 || tuple.length > 8)) tuple.push(oc);
      if (dist !== undefined) tuple.push(dist);
      if (dur !== undefined) tuple.push(dur);
      return tuple;
    });

    const payload: RoutePayloadV2 = [sLatI, sLonI, sn, st, endTuple, w];

    // Добавляем метрики первого сегмента (от старта до первой точки)
    if (data.startDistanceToNext !== undefined) {
      payload.push(Number(data.startDistanceToNext));
    }
    if (data.startDurationToNext !== undefined) {
      payload.push(Number(data.startDurationToNext));
    }

    const json = JSON.stringify(payload);
    const compressed = compressToEncodedURIComponent(json);

    return `${V2_PREFIX}${compressed}`;
  } catch (e) {
    console.error("Ошибка кодирования маршрута", e);
    return "";
  }
}

function decodeV2(encodedStr: string): any | null {
  try {
    const payloadStr = encodedStr.startsWith(V2_PREFIX) ? encodedStr.slice(V2_PREFIX.length) : encodedStr;
    const json = decompressFromEncodedURIComponent(payloadStr);
    if (!json) return null;

    const payload = JSON.parse(json) as RoutePayloadV2;
    const [sLatI, sLonI, sn, stCode, endTuple, waypoints, startDistToNext, startDurToNext] = payload;

    const startPoint = decodeCoords(sLatI, sLonI);
    const startTransport = codeToMode(stCode);

    const hasEnd = Array.isArray(endTuple) && endTuple.length >= 3;
    const endPoint = hasEnd ? decodeCoords(endTuple[1], endTuple[2]) : null;
    const endPointType = hasEnd ? codeToType(endTuple[0]) : "address";
    const endPointName = hasEnd ? endTuple[3] : undefined;
    const endPointCategory = hasEnd && endTuple[0] === 1 ? endTuple[4] : undefined;

    return {
      startPoint,
      startPointName: sn,
      startTransport,
      startDistanceToNext: startDistToNext,
      startDurationToNext: startDurToNext,
      endPoint,
      endPointName,
      endPointType,
      endPointCategory,
      waypoints: waypoints.map((cw, index) => {
        const t = cw[0];
        const v = cw[1];
        const latI = cw[2];
        const lonI = cw[3];
        const n = cw[4];
        const stayDuration = cw[5];
        const m = cw[6];
        const i = cw[7] || 0;
        const altFlat = cw[8];
        const altNames = cw[9] as string[] | undefined;
        const oc = cw[10];
        const dist = cw[11];
        const dur = cw[12];

        const type = codeToType(t);
        const categoryForAlt = oc || (type === "category" ? v : "place");

        return {
          id: `url-wp-${index}`,
          type,
          value: v,
          coords: decodeCoords(latI, lonI),
          resolvedName: n,
          stayDuration: stayDuration,
          duration: stayDuration, // Обратная совместимость
          modeToNext: codeToMode(m),
          selectedAlternativeIndex: i,
          originalCategory: oc,
          alternatives: toPlaceholdersFromAltFlat(altFlat, altNames, categoryForAlt),
          distanceToNext: dist,
          durationToNext: dur,
        };
      }),
    };
  } catch (e) {
    return null;
  }
}

export function decodeRouteFromUrl(encodedStr: string): any | null {
  if (!encodedStr) return null;

  // v2
  if (encodedStr.startsWith(V2_PREFIX)) {
    const decoded = decodeV2(encodedStr);
    if (decoded) return decoded;
  }

  // legacy
  return decodeLegacy(encodedStr);
}
