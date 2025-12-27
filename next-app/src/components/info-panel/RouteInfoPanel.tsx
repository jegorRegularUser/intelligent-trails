'use client'

import { useRouteStore } from '@/lib/state/routeStore'
import { formatDistance, formatDuration } from '@/lib/utils/time'

export function RouteInfoPanel() {
  const { currentRoute, activities } = useRouteStore()

  if (!currentRoute) {
    return (
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm z-10">
        <h3 className="font-bold text-lg mb-2">🗺️ Intelligent Trails</h3>
        <p className="text-sm text-gray-600">
          Постройте умный маршрут для прогулки!
        </p>
      </div>
    )
  }

  return (
    <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm z-10 max-h-[80vh] overflow-y-auto">
      <h3 className="font-bold text-lg mb-3">📊 Ваш маршрут</h3>

      {/* Статистика */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
          <span className="text-sm font-medium text-gray-700">Расстояние:</span>
          <span className="text-sm font-bold text-blue-600">
            {formatDistance(currentRoute.metadata.distance)}
          </span>
        </div>
        <div className="flex justify-between items-center p-2 bg-green-50 rounded">
          <span className="text-sm font-medium text-gray-700">Время:</span>
          <span className="text-sm font-bold text-green-600">
            {formatDuration(currentRoute.metadata.duration)}
          </span>
        </div>
      </div>

      {/* Список этапов */}
      {activities.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm text-gray-700 mb-2">Этапы:</h4>
          <div className="space-y-2">
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className="p-2 bg-gray-50 rounded text-sm border-l-4 border-blue-500"
              >
                <div className="flex items-start space-x-2">
                  <span className="font-bold text-gray-500">#{index + 1}</span>
                  <div className="flex-1">
                    {activity.type === 'walk' ? (
                      <span>
                        {activity.style === 'scenic' ? '🌳' : '🚶'} Прогулка (
                        {formatDuration(activity.duration)})
                      </span>
                    ) : (
                      <span>
                        🎯 {activity.category || activity.specificPlace?.name} (
                        {formatDuration(activity.stayTime)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кнопка сохранения (потом) */}
      <div className="mt-4 pt-4 border-t">
        <button
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          onClick={() => alert('Сохранение маршрута (скоро)')}
        >
          💾 Сохранить маршрут
        </button>
      </div>
    </div>
  )
}
