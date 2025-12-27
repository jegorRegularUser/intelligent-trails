'use client'

import { useEffect, useRef } from 'react'
import { useRouteStore } from '@/lib/state/routeStore'

// Декларация типов для ymaps
declare global {
  interface Window {
    ymaps: any
  }
}

export function YandexMapWrapper() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const { currentRoute } = useRouteStore()

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

  useEffect(() => {
    if (currentRoute && mapInstance.current) {
      // TODO: Добавление маршрута на карту
      console.log('🛤️ Маршрут построен:', currentRoute)
    }
  }, [currentRoute])

  return <div ref={mapRef} className="w-full h-full" id="map" />
}
