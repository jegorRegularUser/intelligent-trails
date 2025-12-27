'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useRouteStore } from '@/lib/state/routeStore'
import { Activity } from '@/types/activity'
import { WalkActivityForm } from './WalkActivityForm'
import { PlaceActivityForm } from './PlaceActivityForm'
import { formatDuration } from '@/lib/utils/time'

interface ActivityCardProps {
  activity: Activity
  index: number
}

export function ActivityCard({ activity, index }: ActivityCardProps) {
  const { removeActivity } = useRouteStore()
  const [isEditing, setIsEditing] = useState(false)

  const getActivityIcon = () => {
    if (activity.type === 'walk') {
      return activity.style === 'scenic' ? '🌳' : '🚶'
    }
    return '🎯'
  }

  const getActivityTitle = () => {
    if (activity.type === 'walk') {
      const style = activity.style === 'scenic' ? 'Красивая' : 'Прямая'
      return `${style} прогулка (${formatDuration(activity.duration)})`
    } else {
      if (activity.mode === 'category') {
        return `Место: ${activity.category} (${formatDuration(activity.stayTime)})`
      } else {
        return `Место: ${activity.specificPlace?.name} (${formatDuration(activity.stayTime)})`
      }
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <span className="text-2xl">{getActivityIcon()}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-gray-500">
                #{index + 1}
              </span>
              <h4 className="font-medium text-gray-900">{getActivityTitle()}</h4>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Транспорт: {getTransportLabel(activity.transport)}
            </p>
          </div>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Скрыть' : '⚙️'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => removeActivity(activity.id)}
          >
            🗑️
          </Button>
        </div>
      </div>

      {/* Форма редактирования */}
      {isEditing && (
        <div className="mt-4 pt-4 border-t">
          {activity.type === 'walk' ? (
            <WalkActivityForm activity={activity} />
          ) : (
            <PlaceActivityForm activity={activity} />
          )}
        </div>
      )}
    </div>
  )
}

function getTransportLabel(transport: string): string {
  const labels: Record<string, string> = {
    pedestrian: '🚶 Пешком',
    auto: '🚗 Авто',
    bicycle: '🚴 Велосипед',
    masstransit: '🚌 Общ. транспорт',
  }
  return labels[transport] || transport
}
