'use client'

import { useEffect, useRef } from 'react'
import { geocodeAddress } from '@/lib/yandex/client'
import { TransportType } from '@/types/route'

interface SimpleRouteBuilderProps {
  mapInstance: any
  start: string
  end: string
  waypoints: string[]
  transport: TransportType
  onRouteBuilt: (route: any) => void
}

export function SimpleRouteBuilder({
  mapInstance,
  start,
  end,
  waypoints,
  transport,
  onRouteBuilt,
}: SimpleRouteBuilderProps) {
  const multiRouteRef = useRef<any>(null)

  useEffect(() => {
    if (!mapInstance || !start || !end) return

    buildRoute()

    return () => {
      if (multiRouteRef.current && mapInstance) {
        mapInstance.geoObjects.remove(multiRouteRef.current)
      }
    }
  }, [mapInstance, start, end, waypoints, transport])

  const buildRoute = async () => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY || ''

      // Геокодируем адреса
      const startCoords = await geocodeAddress(start, apiKey)
      const endCoords = await geocodeAddress(end, apiKey)

      if (!startCoords || !endCoords) {
        console.error('Не удалось геокодировать адреса')
        return
      }

      // Геокодируем промежуточные точки
      const waypointCoords = []
      for (const wp of waypoints) {
        if (wp.trim()) {
          const coords = await geocodeAddress(wp, apiKey)
          if (coords) waypointCoords.push(coords)
        }
      }

      // Создаем точки маршрута
      const routePoints = [
        startCoords,
        ...waypointCoords,
        endCoords,
      ]

      // Убираем старый маршрут
      if (multiRouteRef.current) {
        mapInstance.geoObjects.remove(multiRouteRef.current)
      }

      // Создаем новый маршрут
      const multiRoute = new window.ymaps.multiRouter.MultiRoute(
        {
          referencePoints: routePoints,
          params: {
            routingMode: transport,
          },
        },
        {
          boundsAutoApply: true,
          wayPointVisible: true,
          routeActiveStrokeWidth: 6,
          routeActiveStrokeColor: '#2563eb',
        }
      )

      multiRouteRef.current = multiRoute
      mapInstance.geoObjects.add(multiRoute)

      // Ждем построения маршрута
      multiRoute.model.events.add('requestsuccess', () => {
        const activeRoute = multiRoute.getActiveRoute()
        if (activeRoute) {
          const routeData = {
            distance: activeRoute.properties.get('distance').value,
            duration: activeRoute.properties.get('duration').value / 60, // в минуты
            waypoints: routePoints,
          }
          onRouteBuilt(routeData)
        }
      })

    } catch (error) {
      console.error('Ошибка построения маршрута:', error)
    }
  }

  return null
}
