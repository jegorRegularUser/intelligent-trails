'use client'

import { useEffect, useRef } from 'react'
import { geocodeAddress } from '@/lib/yandex/client'
import { Activity } from '@/types/activity'
import { SmartRoute } from '@/types/route'

interface SmartWalkBuilderProps {
  mapInstance: any
  smartRoute: SmartRoute
  activities: Activity[]
  onRouteBuilt: (route: any) => void
}

export function SmartWalkBuilder({
  mapInstance,
  smartRoute,
  activities,
  onRouteBuilt,
}: SmartWalkBuilderProps) {
  const multiRouteRef = useRef<any>(null)

  useEffect(() => {
    if (!mapInstance || !smartRoute.start || activities.length === 0) return

    buildSmartRoute()

    return () => {
      if (multiRouteRef.current && mapInstance) {
        mapInstance.geoObjects.remove(multiRouteRef.current)
      }
    }
  }, [mapInstance, smartRoute, activities])

  const buildSmartRoute = async () => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY || ''

      // Геокодируем стартовую точку
      const startCoords = await geocodeAddress(smartRoute.start, apiKey)
      if (!startCoords) {
        console.error('Не удалось геокодировать стартовую точку')
        return
      }

      const waypoints: Array<[number, number]> = [startCoords]
      let currentPoint = startCoords

      // Обрабатываем каждую активность
      for (const activity of activities) {
        if (activity.type === 'walk') {
          // Для прогулки генерируем waypoints через API
          const response = await fetch('/api/walks/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              start_point: currentPoint,
              end_point: null,
              duration: activity.duration,
              style: activity.style,
              transport: activity.transport,
            }),
          })

          const data = await response.json()
          if (data.success && data.waypoints) {
            waypoints.push(...data.waypoints.slice(1)) // пропускаем первую точку (текущая)
            currentPoint = data.waypoints[data.waypoints.length - 1]
          }
        } else {
          // Для места ищем через API
          if (activity.mode === 'category' && activity.category) {
            const response = await fetch('/api/search/places', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                center_coords: currentPoint,
                categories: [activity.category],
                radius_m: 3000,
                sequential: true,
                previous_point: currentPoint,
              }),
            })

            const data = await response.json()
            if (data.success && data.places_by_category[activity.category]?.[0]) {
              const place = data.places_by_category[activity.category][0]
              waypoints.push(place.coords)
              currentPoint = place.coords
            }
          } else if (activity.mode === 'specific' && activity.specificPlace) {
            waypoints.push(activity.specificPlace.coords)
            currentPoint = activity.specificPlace.coords
          }
        }
      }

      // Обрабатываем конечную точку
      if (smartRoute.endMode === 'return') {
        waypoints.push(startCoords)
      } else if (smartRoute.endMode === 'custom' && smartRoute.customEnd) {
        const endCoords = await geocodeAddress(smartRoute.customEnd, apiKey)
        if (endCoords) waypoints.push(endCoords)
      }

      // Убираем старый маршрут
      if (multiRouteRef.current) {
        mapInstance.geoObjects.remove(multiRouteRef.current)
      }

      // Создаем маршрут
      const multiRoute = new window.ymaps.multiRouter.MultiRoute(
        {
          referencePoints: waypoints,
          params: {
            routingMode: 'pedestrian',
          },
        },
        {
          boundsAutoApply: true,
          wayPointVisible: true,
          routeActiveStrokeWidth: 6,
          routeActiveStrokeColor: '#16a34a',
        }
      )

      multiRouteRef.current = multiRoute
      mapInstance.geoObjects.add(multiRoute)

      // Добавляем маркеры мест
      activities.forEach((activity, index) => {
        if (activity.type === 'place' && waypoints[index + 1]) {
          const placemark = new window.ymaps.Placemark(
            waypoints[index + 1],
            {
              balloonContent: activity.category || activity.specificPlace?.name,
            },
            {
              preset: 'islands#blueDotIcon',
            }
          )
          mapInstance.geoObjects.add(placemark)
        }
      })

      // Ждем построения
      multiRoute.model.events.add('requestsuccess', () => {
        const activeRoute = multiRoute.getActiveRoute()
        if (activeRoute) {
          const routeData = {
            distance: activeRoute.properties.get('distance').value,
            duration: activeRoute.properties.get('duration').value / 60,
            waypoints,
            activities,
          }
          onRouteBuilt(routeData)
        }
      })

    } catch (error) {
      console.error('Ошибка построения умной прогулки:', error)
    }
  }

  return null
}
