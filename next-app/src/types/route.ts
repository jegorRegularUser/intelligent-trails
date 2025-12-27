// Типы маршрутов
export type RouteMode = 'simple' | 'smart'
export type TransportType = 'pedestrian' | 'auto' | 'bicycle' | 'masstransit'
export type EndMode = 'last' | 'return' | 'custom'

// Простой маршрут (A → B)
export interface SimpleRoute {
  start: string
  end: string
  waypoints: string[]
  transport: TransportType
}

// Умная прогулка
export interface SmartRoute {
  start: string
  endMode: EndMode
  customEnd?: string
}

// Построенный маршрут (результат)
export interface Route {
  id?: string
  type: RouteMode
  waypoints: Array<[number, number]> // [lon, lat]
  metadata: {
    distance: number // метры
    duration: number // минуты
    activities?: Activity[]
  }
  createdAt?: Date
}

// Импорт Activity из activity.ts
import { Activity } from './activity'