import axios from 'axios'
import { YandexGeocoderResponse } from './types'

const YANDEX_GEOCODER_URL = 'https://geocode-maps.yandex.ru/1.x/'

/**
 * Геокодирование адреса в координаты
 */
export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<[number, number] | null> {
  try {
    const response = await axios.get<YandexGeocoderResponse>(
      YANDEX_GEOCODER_URL,
      {
        params: {
          apikey: apiKey,
          geocode: address,
          format: 'json',
          results: 1,
        },
      }
    )

    const geoObjects =
      response.data.response.GeoObjectCollection.featureMember

    if (geoObjects.length === 0) {
      return null
    }

    const pos = geoObjects[0].GeoObject.Point.pos.split(' ')
    return [parseFloat(pos[0]), parseFloat(pos[1])] // [lon, lat]
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

/**
 * Обратное геокодирование (координаты → адрес)
 */
export async function reverseGeocode(
  coords: [number, number],
  apiKey: string
): Promise<string | null> {
  try {
    const response = await axios.get<YandexGeocoderResponse>(
      YANDEX_GEOCODER_URL,
      {
        params: {
          apikey: apiKey,
          geocode: `${coords[0]},${coords[1]}`,
          format: 'json',
          results: 1,
        },
      }
    )

    const geoObjects =
      response.data.response.GeoObjectCollection.featureMember

    if (geoObjects.length === 0) {
      return null
    }

    return (
      geoObjects[0].GeoObject.metaDataProperty?.GeocoderMetaData?.Address
        ?.formatted || geoObjects[0].GeoObject.name
    )
  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return null
  }
}
