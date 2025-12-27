// Типы для Yandex API

export interface YandexGeocoderResponse {
  response: {
    GeoObjectCollection: {
      featureMember: Array<{
        GeoObject: {
          name: string
          Point: {
            pos: string // "lon lat"
          }
          metaDataProperty?: {
            GeocoderMetaData?: {
              Address?: {
                formatted: string
              }
            }
          }
        }
      }>
    }
  }
}

export interface YandexOrganizationResponse {
  features: Array<{
    properties: {
      name: string
      description?: string
      CompanyMetaData?: {
        Categories?: Array<{
          name: string
        }>
        Hours?: {
          text: string
        }
      }
    }
    geometry: {
      coordinates: [number, number] // [lon, lat]
    }
  }>
}
