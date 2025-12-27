'use client'

import { useEffect, useRef } from 'react'
import { useRouteStore } from '@/lib/state/routeStore'
import { SimpleRouteBuilder } from './SimpleRouteBuilder'
import { SmartWalkBuilder } from './SmartWalkBuilder'

// Декларация типов для ymaps
declare global {
  interface Window {
    ymaps: any
  }
}

export function YandexMapWrapper() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const { mode, simpleRoute, smartRoute, activities, currentRoute, setCurrentRoute } = useRouteStore()

  useEffect(() => {
    // Загружаем Yandex Maps API
    const apiKey = process.env.NEXT_PUBLIC_YANDEX_API_KEY || ''
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${apiKey}`
    script.async = true
    script.onload = initMap
    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  const initMap = () => {
    if (!mapRef.current || mapInstance.current) return

    window.ymaps.ready(() => {
      mapInstance.current = new window.ymaps.Map(mapRef.current, {
        center: [56.3287, 44.0020], // Нижний Новгород [lat, lon]
        zoom: 12,
        controls: ['zoomControl', 'geolocationControl'],
      })

      console.log('🗺️ Карта инициализирована')
    })
  }

  const handleRouteBuilt = (routeData: any) => {
    console.log('✅ Маршрут построен:', routeData)
    setCurrentRoute({
      type: mode,
      waypoints: routeData.waypoints,
      metadata: {
        distance: routeData.distance,
        duration: routeData.duration,
        activities: routeData.activities,
      },
    })
  }

  return (
    <>
      <div ref={mapRef} className="w-full h-full" id="map" />
      
      {/* Route builders */}
      {mapInstance.current && mode === 'simple' && simpleRoute.start && simpleRoute.end && (
        <SimpleRouteBuilder
          mapInstance={mapInstance.current}
          start={simpleRoute.start}
          end={simpleRoute.end}
          waypoints={simpleRoute.waypoints}
          transport={simpleRoute.transport}
          onRouteBuilt={handleRouteBuilt}
        />
      )}

      {mapInstance.current && mode === 'smart' && smartRoute.start && activities.length > 0 && (
        <SmartWalkBuilder
          mapInstance={mapInstance.current}
          smartRoute={smartRoute}
          activities={activities}
          onRouteBuilt={handleRouteBuilt}
        />
      )}
    </>
  )
}
