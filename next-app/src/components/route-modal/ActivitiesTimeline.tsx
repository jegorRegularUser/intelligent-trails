'use client'

import { Button } from '@/components/ui/Button'
import { useRouteStore } from '@/lib/state/routeStore'
import { ActivityCard } from './ActivityCard'
import { formatDuration } from '@/lib/utils/time'

export function ActivitiesTimeline() {
  const { activities, addActivity } = useRouteStore()

  // Подсчет общего времени
  const totalTime = activities.reduce((sum, activity) => {
    if (activity.type === 'walk') {
      return sum + activity.duration
    } else {
      return sum + activity.stayTime
    }
  }, 0)

  return (
    <div className="space-y-3">
      {/* Список активностей */}
      {activities.length > 0 ? (
        <div className="space-y-2">
          {activities.map((activity, index) => (
            <ActivityCard key={activity.id} activity={activity} index={index} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">
            🎯 Добавьте активности в маршрут
          </p>
        </div>
      )}

      {/* Кнопки добавления */}
      <div className="flex space-x-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addActivity('walk')}
          className="flex-1"
        >
          🚶 Добавить прогулку
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addActivity('place')}
          className="flex-1"
        >
          🎯 Добавить место
        </Button>
      </div>

      {/* Общее время */}
      {activities.length > 0 && (
        <div className="pt-3 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Общее время:
            </span>
            <span className="text-lg font-bold text-blue-600">
              {formatDuration(totalTime)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
