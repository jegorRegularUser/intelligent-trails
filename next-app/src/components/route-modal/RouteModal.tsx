'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SimpleRoutePanel } from './SimpleRoutePanel'
import { SmartRoutePanel } from './SmartRoutePanel'
import { useRouteStore } from '@/lib/state/routeStore'

interface RouteModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RouteModal({ isOpen, onClose }: RouteModalProps) {
  const { mode, setMode, isBuilding } = useRouteStore()

  const handleBuild = async () => {
    // TODO: Логика построения маршрута
    console.log('🚀 Начинаем построение маршрута...')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Построить маршрут" size="xl">
      <div className="space-y-6">
        {/* Табы */}
        <div className="flex space-x-2 border-b">
          <button
            onClick={() => setMode('simple')}
            className={`px-4 py-2 font-medium transition-colors ${
              mode === 'simple'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Простой маршрут
          </button>
          <button
            onClick={() => setMode('smart')}
            className={`px-4 py-2 font-medium transition-colors ${
              mode === 'smart'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Умная прогулка
          </button>
        </div>

        {/* Панели */}
        <div className="min-h-[400px]">
          {mode === 'simple' ? <SimpleRoutePanel /> : <SmartRoutePanel />}
        </div>

        {/* Кнопка построения */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleBuild} disabled={isBuilding}>
            {isBuilding ? 'Строим...' : 'Построить маршрут'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
