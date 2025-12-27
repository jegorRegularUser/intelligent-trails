/**
 * Вычисление расстояния между двумя точками по формуле гаверсинусов
 * @param point1 [lon, lat]
 * @param point2 [lon, lat]
 * @returns расстояние в метрах
 */
export function calculateDistance(
  point1: [number, number],
  point2: [number, number]
): number {
  const R = 6371e3 // радиус Земли в метрах
  const φ1 = (point1[1] * Math.PI) / 180
  const φ2 = (point2[1] * Math.PI) / 180
  const Δφ = ((point2[1] - point1[1]) * Math.PI) / 180
  const Δλ = ((point2[0] - point1[0]) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Вычисление общей дистанции маршрута
 */
export function calculateTotalDistance(
  waypoints: Array<[number, number]>
): number {
  let total = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += calculateDistance(waypoints[i], waypoints[i + 1])
  }
  return total
}