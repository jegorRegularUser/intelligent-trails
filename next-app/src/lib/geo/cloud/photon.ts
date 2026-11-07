// src/lib/geo/cloud/photon.ts
// Photon public (photon.komoot.io) — первый геокодер облачного тира: suggest
// с bias по точке и reverse. Ключа нет, лимиты публичного инстанса щадят
// благодаря кэшу и тому, что Nominatim подключён fallback'ом.

import { GeoError } from '../types';
import { LatLng, ReverseGeocodeResult, SuggestItem } from '../types';
import { roundPoint } from '../cache';
import { fetchJson } from '../http';

/** Радиус reverse-поиска Photon в КИЛОМЕТРАХ (единица его API): «что в точке», не «что в округе». */
export const PHOTON_REVERSE_RADIUS_KM = 0.05;
export const PHOTON_SUGGEST_LIMIT = 8;

export interface PhotonAdapterOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

interface PhotonResponse {
  features?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseFeatures(data: PhotonResponse): PhotonFeature[] {
  if (!Array.isArray(data.features)) {
    throw new GeoError('UPSTREAM_INVALID', 'Photon: features не массив');
  }
  return data.features as PhotonFeature[];
}

/** Координаты фичи: Photon отдаёт [lng, lat]. */
function featurePoint(feature: PhotonFeature): LatLng | undefined {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !isFiniteNumber(coordinates[0]) || !isFiniteNumber(coordinates[1])) {
    return undefined;
  }
  return [coordinates[1], coordinates[0]];
}

function osmTypeOf(value: unknown): 'N' | 'W' | 'R' | undefined {
  return value === 'N' || value === 'W' || value === 'R' ? value : undefined;
}

/** Строковые свойства Photon сырьём — карточки парсят их как OSM-теги. */
function tagsOf(properties: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') tags[key] = value;
  }
  return tags;
}

function reverseAddressOf(properties: Record<string, unknown>): string | undefined {
  const street = asString(properties.street);
  const housenumber = asString(properties.housenumber);
  const city = asString(properties.city) ?? asString(properties.district) ?? asString(properties.county);
  const parts = [street && housenumber ? `${street}, ${housenumber}` : street, city, asString(properties.country)];
  const address = parts.filter(Boolean).join(', ');
  return address.length > 0 ? address : undefined;
}

export class PhotonAdapter {
  constructor(private readonly options: PhotonAdapterOptions) {}

  async suggest(query: string, near?: LatLng): Promise<SuggestItem[]> {
    const params = new URLSearchParams({ q: query, limit: String(PHOTON_SUGGEST_LIMIT) });
    if (near) {
      const [lat, lng] = roundPoint(near);
      params.set('lat', lat.toFixed(5));
      params.set('lon', lng.toFixed(5));
    }
    const data = await fetchJson<PhotonResponse>({
      url: `${this.options.baseUrl}/api?${params.toString()}`,
      timeoutMs: this.options.timeoutMs,
      fetchImpl: this.options.fetchImpl,
    });

    return parseFeatures(data)
      .map((feature): SuggestItem | null => {
        const coordinates = featurePoint(feature);
        if (!coordinates) return null;
        const properties = feature.properties ?? {};
        const title = asString(properties.name) ?? asString(properties.street);
        if (!title) return null;
        const street = asString(properties.street);
        const housenumber = asString(properties.housenumber);
        const subtitle = [
          street && housenumber ? `${street}, ${housenumber}` : street,
          asString(properties.city),
          asString(properties.country),
        ]
          .filter(Boolean)
          .join(', ');
        return { title, subtitle: subtitle || undefined, coordinates };
      })
      .filter((item): item is SuggestItem => item !== null);
  }

  async reverse(point: LatLng): Promise<ReverseGeocodeResult | null> {
    const [lat, lng] = roundPoint(point);
    const params = new URLSearchParams({
      lat: lat.toFixed(5),
      lon: lng.toFixed(5),
      radius: String(PHOTON_REVERSE_RADIUS_KM),
    });
    const data = await fetchJson<PhotonResponse>({
      url: `${this.options.baseUrl}/reverse?${params.toString()}`,
      timeoutMs: this.options.timeoutMs,
      fetchImpl: this.options.fetchImpl,
    });

    const features = parseFeatures(data);
    if (features.length === 0) return null;

    const feature = features[0];
    const properties = feature.properties ?? {};
    const coordinates = featurePoint(feature);
    if (!coordinates) {
      throw new GeoError('UPSTREAM_INVALID', 'Photon: у ближайшей фичи нет координат');
    }

    const kind = asString(properties.osm_value) ?? asString(properties.osm_key);
    return {
      name: asString(properties.name),
      address: reverseAddressOf(properties),
      kind,
      distanceMeters: isFiniteNumber(properties.distance) ? properties.distance : undefined,
      osmId: isFiniteNumber(properties.osm_id) ? properties.osm_id : undefined,
      osmType: osmTypeOf(properties.osm_type),
      tags: tagsOf(properties),
    };
  }
}
