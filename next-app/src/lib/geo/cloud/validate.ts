// src/lib/geo/cloud/validate.ts
// Валидация входов geo-слоя (ADR-001, правило 5: координаты везде [lat, lng]).
// Всё, что плохо → GeoError('INVALID_INPUT') ДО любого похода в сеть.

import { GeoError } from '../types';
import { LatLng } from '../types';

export function assertValidPoint(point: unknown, label = 'point'): void {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new GeoError('INVALID_INPUT', `${label}: координаты — пара [lat, lng]`);
  }
  const [lat, lng] = point as unknown[];
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new GeoError('INVALID_INPUT', `${label}: координаты должны быть конечными числами`);
  }
  if (lat < -90 || lat > 90) {
    throw new GeoError('INVALID_INPUT', `${label}: широта ${lat} вне диапазона ±90`);
  }
  if (lng < -180 || lng > 180) {
    throw new GeoError('INVALID_INPUT', `${label}: долгота ${lng} вне диапазона ±180`);
  }
}

export function assertValidWaypoints(waypoints: LatLng[], minCount = 2): void {
  if (!Array.isArray(waypoints) || waypoints.length < minCount) {
    throw new GeoError('INVALID_INPUT', `waypoints: нужно минимум ${minCount} точки`);
  }
  waypoints.forEach((point, index) => assertValidPoint(point, `waypoints[${index}]`));
}

export function assertValidAlternatives(alternatives: number | undefined): void {
  if (alternatives === undefined) return;
  if (!Number.isInteger(alternatives) || alternatives < 0 || alternatives > 2) {
    throw new GeoError('INVALID_INPUT', `alternatives: ожидается целое 0–2, получено ${alternatives}`);
  }
}

/** ORS принимает пары [lng, lat] — приложение живёт в [lat, lng]. */
export function toLngLat(point: LatLng): [number, number] {
  return [point[1], point[0]];
}
