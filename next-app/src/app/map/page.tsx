'use client'

import { YandexMapWrapper } from '@/components/map/YandexMapWrapper'
import { Button } from '@/components/ui/Button'
import { RouteModal } from '@/components/route-modal/RouteModal'
import { RouteInfoPanel } from '@/components/info-panel/RouteInfoPanel'
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

      {/* Панель информации */}
      <RouteInfoPanel />

      {/* Модалка */}
      <RouteModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}
