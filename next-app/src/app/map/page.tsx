'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import '../../styles/map.css'

// Динамический импорт YandexMap чтобы избежать SSR
const YandexMap = dynamic(() => import('@/components/YandexMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="spinner"></div>
    </div>
  ),
})

export default function MapPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="map-page-container">
      <YandexMap />
      
      <button 
        className="floating-action-btn"
        onClick={() => setIsModalOpen(true)}
      >
        <span className="fab-icon">🗺️</span>
        <span className="fab-text">Построить маршрут</span>
      </button>

      {/* TODO: Add RouteModal component */}
    </div>
  )
}
