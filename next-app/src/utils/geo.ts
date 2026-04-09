// src/utils/geo.ts

import { Coordinates } from "@/types/map";

/**
 * Переводит градусы в радианы (необходимо для тригонометрических вычислений)
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Вычисляет расстояние между двумя координатами по прямой (формула гаверсинуса).
 * Сложность вычисления O(1) - работает моментально на сервере.
 * * @param coord1 Начальные координаты [lat, lon]
 * @param coord2 Конечные координаты [lat, lon]
 * @returns Расстояние в метрах
 */
export function getDistanceInMeters(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371e3; // Средний радиус Земли в метрах
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;

  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return Math.round(R * c);
}