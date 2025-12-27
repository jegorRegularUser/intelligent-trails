'use client'

import { YandexMapWrapper } from '@/components/map/YandexMapWrapper'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'

export default function MapPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="relative h-screen w-full">
      {/* Карта */}
      <YandexMapWrapper />

      {/* Кнопка построения маршрута */}
      <div className="absolute top-4 left-4 z-10">
        <Button onClick={() => setIsModalOpen(true)}>
          📍 Построить маршрут
        </Button>
      </div>

      {/* Панель информации (потом добавим) */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm z-10">
        <h3 className="font-bold text-lg mb-2">🗺️ Intelligent Trails</h3>
        <p className="text-sm text-gray-600">
          Постройте умный маршрут для прогулки!
        </p>
      </div>
    </div>
  )
}
