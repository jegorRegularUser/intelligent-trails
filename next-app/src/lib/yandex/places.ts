import axios from 'axios'
import { Place } from '@/types/place'
import { calculateDistance } from '@/lib/utils/distance'

const YANDEX_GEOCODER_URL = 'https://geocode-maps.yandex.ru/1.x/'

/**
 * Поиск мест по категориям
 */
export async function searchPlaces(
  centerCoords: [number, number],
  categories: string[],
  radiusM: number,
  apiKey: string
): Promise<Record<string, Place[]>> {
  const results: Record<string, Place[]> = {}

  for (const category of categories) {
    try {
      const response = await axios.get(YANDEX_GEOCODER_URL, {
        params: {
          apikey: apiKey,
          geocode: `${centerCoords[0]},${centerCoords[1]}`,
          kind: 'house', // ищем организации
          results: 20,
          format: 'json',
        },
      })

      const geoObjects =
        response.data.response?.GeoObjectCollection?.featureMember || []

      const places: Place[] = geoObjects
        .map((item: any) => {
          const geoObject = item.GeoObject
          const pos = geoObject.Point.pos.split(' ')
          const coords: [number, number] = [
            parseFloat(pos[0]),
            parseFloat(pos[1]),
          ]

          const distance = calculateDistance(centerCoords, coords)

          if (distance > radiusM) return null

          return {
            name: geoObject.name,
            coords,
            category,
            address:
              geoObject.metaDataProperty?.GeocoderMetaData?.Address
                ?.formatted || '',
            rating: Math.random() * 2 + 3, // mock rating
          }
        })
        .filter((p): p is Place => p !== null)

      results[category] = places
    } catch (error) {
      console.error(`Error searching for ${category}:`, error)
      results[category] = []
    }
  }

  return results
}

/**
 * Последовательный поиск мест (каждое следующее место ищется от предыдущего)
 */
export async function searchPlacesSequential(
  startPoint: [number, number],
  categories: string[],
  maxRadius: number,
  apiKey: string
): Promise<Record<string, Place[]>> {
  const result: Record<string, Place[]> = {}
  let currentPoint = startPoint

  for (const category of categories) {
    const places = await searchPlaces(currentPoint, [category], maxRadius, apiKey)

    if (!places[category] || places[category].length === 0) {
      result[category] = []
      continue
    }

    // Сортируем по расстоянию + рейтингу
    const sorted = places[category].sort((a, b) => {
      const distA = calculateDistance(currentPoint, a.coords)
      const distB = calculateDistance(currentPoint, b.coords)
      const scoreA = distA * 0.7 + (5.0 - (a.rating || 3.0)) * 500
      const scoreB = distB * 0.7 + (5.0 - (b.rating || 3.0)) * 500
      return scoreA - scoreB
    })

    const bestPlace = sorted[0]
    result[category] = [bestPlace]
    currentPoint = bestPlace.coords
  }

  return result
}
