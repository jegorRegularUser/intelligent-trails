'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SimpleRoutePanel } from './SimpleRoutePanel'
import { SmartRoutePanel } from './SmartRoutePanel'
import { useRouteStore } from '@/lib/state/routeStore'

interface RouteModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RouteModal({ isOpen, onClose }: RouteModalProps) {
  const { mode, setMode, isBuilding, setBuilding, simpleRoute, smartRoute, activities } = useRouteStore()
  const [error, setError] = useState<string | null>(null)

  const handleBuild = async () => {
    setError(null)
    
    // Валидация
    if (mode === 'simple') {
      if (!simpleRoute.start || !simpleRoute.end) {
        setError('Укажите начальную и конечную точки')
        return
      }
    } else {
      if (!smartRoute.start) {
        setError('Укажите стартовую точку')
        return
      }
      if (activities.length === 0) {
        setError('Добавьте хотя бы одну активность')
        return
      }
    }

    setBuilding(true)
    
    // TODO: Implement route building logic
    await new Promise(resolve => setTimeout(resolve, 500))
    
    setBuilding(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✨ Построить маршрут" size="xl">
      <div className="space-y-6">
        {/* Route Type Selector - как в старом проекте */}
        <div className="route-type-selector">
          <button
            onClick={() => setMode('smart')}
            className={`route-type-btn ${mode === 'smart' ? 'active' : ''}`}
          >
            <span className="type-icon">🧠</span>
            <div>
              <div className="type-title">Умная прогулка</div>
              <div className="type-desc">С активностями</div>
            </div>
          </button>
          <button
            onClick={() => setMode('simple')}
            className={`route-type-btn ${mode === 'simple' ? 'active' : ''}`}
          >
            <span className="type-icon">🗺️</span>
            <div>
              <div className="type-title">Простой маршрут</div>
              <div className="type-desc">Из точки А в точку Б</div>
            </div>
          </button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800 font-medium">⚠️ {error}</p>
          </div>
        )}

        {/* Панели */}
        <div className="modal-body">
          {mode === 'simple' ? <SimpleRoutePanel /> : <SmartRoutePanel />}
        </div>

        {/* Футер с кнопками */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isBuilding}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleBuild} disabled={isBuilding}>
            <span className="btn-icon">{isBuilding ? '🔄' : '🗺️'}</span>
            <span id="buildBtnText">
              {isBuilding ? 'Строим маршрут...' : mode === 'smart' ? 'Построить прогулку' : 'Построить маршрут'}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
