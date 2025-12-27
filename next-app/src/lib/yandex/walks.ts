import { searchPlaces } from './places'
import { calculateDistance } from '@/lib/utils/distance'

const SPEED_MAP = {
  pedestrian: 80, // м/мин
  bicycle: 200,
  auto: 500,
  masstransit: 150,
}

/**
 * Генерация прогулки на заданное время
 */
export async function generateWalk(
  startPoint: [number, number],
  endPoint: [number, number] | null,
  durationMin: number,
  style: 'scenic' | 'direct',
  transport: string,
  apiKey: string
): Promise<Array<[number, number]>> {
  const speed = SPEED_MAP[transport as keyof typeof SPEED_MAP] || 80
  const targetDistance = durationMin * speed

  if (style === 'scenic') {
    return await generateScenicWalk(
      startPoint,
      endPoint,
      targetDistance,
      apiKey
    )
  } else {
    return generateDirectWalk(startPoint, endPoint, targetDistance)
  }
}

/**
 * Генерация красивой прогулки (через парки/набережные)
 */
async function generateScenicWalk(
  start: [number, number],
  end: [number, number] | null,
  targetDistance: number,
  apiKey: string
): Promise<Array<[number, number]>> {
  const waypoints: Array<[number, number]> = [start]
  let currentPoint = start
  let accumulated = 0

  const scenicCategories = ['парк', 'сквер', 'набережная', 'площадь']

  while (accumulated < targetDistance * 0.8) {
    const searchRadius = Math.min(1500, targetDistance - accumulated)
    const places = await searchPlaces(
      currentPoint,
      scenicCategories,
      searchRadius,
      apiKey
    )

    const allPlaces = Object.values(places).flat()
    if (allPlaces.length === 0) break

    const sorted = allPlaces.sort(
      (a, b) =>
        calculateDistance(currentPoint, a.coords) -
        calculateDistance(currentPoint, b.coords)
    )

    const nextPlace = sorted[Math.min(2, sorted.length - 1)]
    waypoints.push(nextPlace.coords)
    accumulated += calculateDistance(currentPoint, nextPlace.coords)
    currentPoint = nextPlace.coords
  }

  if (end) {
    waypoints.push(end)
  } else {
    waypoints.push(start)
  }

  return waypoints
}

/**
 * Генерация простой прогулки (круг или прямая)
 */
function generateDirectWalk(
  start: [number, number],
  end: [number, number] | null,
  targetDistance: number
): Array<[number, number]> {
  if (end) {
    return [start, end]
  }

  const halfDist = targetDistance / 2
  const offsetDeg = halfDist / 111320

  const midpoint: [number, number] = [
    start[0] + offsetDeg * 0.7,
    start[1] + offsetDeg * 0.7,
  ]

  return [start, midpoint, start]
}
