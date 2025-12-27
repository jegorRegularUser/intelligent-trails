import { create } from 'zustand'
import { Activity, WalkActivity, PlaceActivity } from '@/types/activity'
import { Route, SimpleRoute, SmartRoute, RouteMode } from '@/types/route'

interface RouteState {
  // Текущий режим
  mode: RouteMode
  
  // Данные простого маршрута
  simpleRoute: SimpleRoute
  
  // Данные умной прогулки
  smartRoute: SmartRoute
  
  // Список активностей для умной прогулки
  activities: Activity[]
  
  // Построенный маршрут (результат)
  currentRoute: Route | null
  
  // Флаг загрузки
  isBuilding: boolean
  
  // Actions
  setMode: (mode: RouteMode) => void
  
  // Simple route actions
  updateSimpleRoute: <K extends keyof SimpleRoute>(
    field: K,
    value: SimpleRoute[K]
  ) => void
  addWaypoint: (waypoint: string) => void
  removeWaypoint: (index: number) => void
  
  // Smart route actions
  updateSmartRoute: <K extends keyof SmartRoute>(
    field: K,
    value: SmartRoute[K]
  ) => void
  
  // Activity actions
  addActivity: (type: 'walk' | 'place') => void
  removeActivity: (id: string) => void
  updateActivity: (id: string, data: Partial<Activity>) => void
  reorderActivities: (startIndex: number, endIndex: number) => void
  
  // Route building
  setBuilding: (isBuilding: boolean) => void
  setCurrentRoute: (route: Route | null) => void
  
  // Reset
  reset: () => void
}

const initialSimpleRoute: SimpleRoute = {
  start: '',
  end: '',
  waypoints: [],
  transport: 'pedestrian',
}

const initialSmartRoute: SmartRoute = {
  start: '',
  endMode: 'last',
  customEnd: '',
}

export const useRouteStore = create<RouteState>((set, get) => ({
  mode: 'smart',
  simpleRoute: initialSimpleRoute,
  smartRoute: initialSmartRoute,
  activities: [],
  currentRoute: null,
  isBuilding: false,

  setMode: (mode) => set({ mode }),

  // Simple route methods
  updateSimpleRoute: (field, value) =>
    set((state) => ({
      simpleRoute: { ...state.simpleRoute, [field]: value },
    })),

  addWaypoint: (waypoint) =>
    set((state) => ({
      simpleRoute: {
        ...state.simpleRoute,
        waypoints: [...state.simpleRoute.waypoints, waypoint],
      },
    })),

  removeWaypoint: (index) =>
    set((state) => ({
      simpleRoute: {
        ...state.simpleRoute,
        waypoints: state.simpleRoute.waypoints.filter((_, i) => i !== index),
      },
    })),

  // Smart route methods
  updateSmartRoute: (field, value) =>
    set((state) => ({
      smartRoute: { ...state.smartRoute, [field]: value },
    })),

  // Activity methods
  addActivity: (type) => {
    const id = crypto.randomUUID()
    
    let newActivity: Activity
    
    if (type === 'walk') {
      newActivity = {
        id,
        type: 'walk',
        duration: 30,
        style: 'scenic',
        transport: 'pedestrian',
      } as WalkActivity
    } else {
      newActivity = {
        id,
        type: 'place',
        mode: 'category',
        category: 'кафе',
        stayTime: 30,
        transport: 'pedestrian',
      } as PlaceActivity
    }
    
    set((state) => ({
      activities: [...state.activities, newActivity],
    }))
  },

  removeActivity: (id) =>
    set((state) => ({
      activities: state.activities.filter((a) => a.id !== id),
    })),

  updateActivity: (id, data) =>
    set((state) => ({
      activities: state.activities.map((a) =>
        a.id === id ? { ...a, ...data } : a
      ),
    })),

  reorderActivities: (startIndex, endIndex) => {
    const activities = [...get().activities]
    const [removed] = activities.splice(startIndex, 1)
    activities.splice(endIndex, 0, removed)
    set({ activities })
  },

  // Route building
  setBuilding: (isBuilding) => set({ isBuilding }),
  setCurrentRoute: (route) => set({ currentRoute: route }),

  // Reset
  reset: () =>
    set({
      simpleRoute: initialSimpleRoute,
      smartRoute: initialSmartRoute,
      activities: [],
      currentRoute: null,
      isBuilding: false,
    }),
}))
