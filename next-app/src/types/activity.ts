import { TransportType } from './route'

// Типы активностей
export type ActivityType = 'walk' | 'place'
export type WalkStyle = 'scenic' | 'direct'
export type PlaceMode = 'category' | 'specific'

// Базовая активность
export interface BaseActivity {
  id: string
  type: ActivityType
  transport: TransportType
}

// Активность "Прогулка"
export interface WalkActivity extends BaseActivity {
  type: 'walk'
  duration: number // минуты
  style: WalkStyle
}

// Активность "Место"
export interface PlaceActivity extends BaseActivity {
  type: 'place'
  mode: PlaceMode
  category?: string // для режима category
  specificPlace?: {
    name: string
    coords: [number, number]
  } // для режима specific
  stayTime: number // минуты
}

// Общий тип активности
export type Activity = WalkActivity | PlaceActivity