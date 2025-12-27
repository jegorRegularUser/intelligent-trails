'use client'

import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useRouteStore } from '@/lib/state/routeStore'
import { WalkActivity } from '@/types/activity'

interface WalkActivityFormProps {
  activity: WalkActivity
}

const styleOptions = [
  { value: 'scenic', label: '🌳 Красивая (через парки)' },
  { value: 'direct', label: '🚶 Прямая (кратчайший путь)' },
]

const transportOptions = [
  { value: 'pedestrian', label: '🚶 Пешком' },
  { value: 'bicycle', label: '🚴 Велосипед' },
]

export function WalkActivityForm({ activity }: WalkActivityFormProps) {
  const { updateActivity } = useRouteStore()

  return (
    <div className="space-y-3">
      <Input
        label="Длительность (минуты)"
        type="number"
        min={5}
        max={180}
        value={activity.duration}
        onChange={(e) =>
          updateActivity(activity.id, {
            duration: parseInt(e.target.value) || 30,
          })
        }
      />

      <Select
        label="Стиль прогулки"
        options={styleOptions}
        value={activity.style}
        onChange={(e) =>
          updateActivity(activity.id, { style: e.target.value as any })
        }
      />

      <Select
        label="Транспорт"
        options={transportOptions}
        value={activity.transport}
        onChange={(e) =>
          updateActivity(activity.id, { transport: e.target.value as any })
        }
      />
    </div>
  )
}
