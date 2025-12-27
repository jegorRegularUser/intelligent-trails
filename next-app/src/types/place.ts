// Типы мест

export interface Place {
  name: string
  coords: [number, number] // [lon, lat]
  category: string
  address?: string
  rating?: number
  description?: string
}

export interface PlaceSearchRequest {
  center_coords: [number, number]
  categories: string[]
  radius_m?: number
  sequential?: boolean
  previous_point?: [number, number]
}

export interface PlaceSearchResponse {
  success: boolean
  places_by_category: Record<string, Place[]>
  total_count: number
  error?: string
}