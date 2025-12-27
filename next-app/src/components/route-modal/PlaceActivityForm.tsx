'use client'

import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useRouteStore } from '@/lib/state/routeStore'
import { PlaceActivity } from '@/types/activity'

interface PlaceActivityFormProps {
  activity: PlaceActivity
}

const categoryOptions = [
  { value: 'кафе', label: '☕ Кафе' },
  { value: 'ресторан', label: '🍴 Ресторан' },
  { value: 'парк', label: '🌳 Парк' },
  { value: 'музей', label: '🏛️ Музей' },
  { value: 'памятник', label: '🗿 Памятник' },
  { value: 'бар', label: '🍻 Бар' },
  { value: 'магазин', label: '🛍️ Магазин' },
]

const transportOptions = [
  { value: 'pedestrian', label: '🚶 Пешком' },
  { value: 'auto', label: '🚗 Авто' },
  { value: 'bicycle', label: '🚴 Велосипед' },
  { value: 'masstransit', label: '🚌 Общ. транспорт' },
]

export function PlaceActivityForm({ activity }: PlaceActivityFormProps) {
  const { updateActivity } = useRouteStore()

  return (
    <div className="space-y-3">
      {/* Режим выбора */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Режим выбора места
        </label>
        <div className="space-y-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              checked={activity.mode === 'category'}
              onChange={() => updateActivity(activity.id, { mode: 'category' })}
              className="w-4 h-4 text-blue-600"
            />
            <span>По категории</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              checked={activity.mode === 'specific'}
              onChange={() => updateActivity(activity.id, { mode: 'specific' })}
              className="w-4 h-4 text-blue-600"
            />
            <span>Конкретное место</span>
          </label>
        </div>
      </div>

      {/* Категория или конкретное место */}
      {activity.mode === 'category' ? (
        <Select
          label="Категория"
          options={categoryOptions}
          value={activity.category || 'кафе'}
          onChange={(e) => updateActivity(activity.id, { category: e.target.value })}
        />
      ) : (
        <Input
          label="Название места"
          placeholder="Например: Кафе Starbucks"
          value={activity.specificPlace?.name || ''}
          onChange={(e) =>
            updateActivity(activity.id, {
              specificPlace: {
                name: e.target.value,
                coords: activity.specificPlace?.coords || [0, 0],
              },
            })
          }
        />
      )}

      <Input
        label="Время на месте (минуты)"
        type="number"
        min={5}
        max={180}
        value={activity.stayTime}
        onChange={(e) =>
          updateActivity(activity.id, {
            stayTime: parseInt(e.target.value) || 30,
          })
        }
      />

      <Select
        label="Транспорт до места"
        options={transportOptions}
        value={activity.transport}
        onChange={(e) =>
          updateActivity(activity.id, { transport: e.target.value as any })
        }
      />
    </div>
  )
}
