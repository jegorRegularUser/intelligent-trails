'use client'

import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useRouteStore } from '@/lib/state/routeStore'
import { PlaceActivity } from '@/types/activity'

interface PlaceActivityFormProps {
  activity: PlaceActivity
}

const transportOptions = [
  { value: 'pedestrian', label: '🚶 Пешком' },
  { value: 'auto', label: '🚗 Авто' },
  { value: 'bicycle', label: '🚴 Велосипед' },
  { value: 'masstransit', label: '🚌 Общ. транспорт' },
]

const categories = [
  { value: 'кафе', icon: '☕', label: 'Кафе' },
  { value: 'ресторан', icon: '🍽️', label: 'Ресторан' },
  { value: 'парк', icon: '🌳', label: 'Парк' },
  { value: 'музей', icon: '🏛️', label: 'Музей' },
  { value: 'памятник', icon: '🗿', label: 'Памятник' },
  { value: 'бар', icon: '🍺', label: 'Бар' },
  { value: 'магазин', icon: '🛍️', label: 'Магазин' },
]

export function PlaceActivityForm({ activity }: PlaceActivityFormProps) {
  const { updateActivity } = useRouteStore()

  return (
    <div className="space-y-4">
      {/* Режим выбора */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Режим выбора места
        </label>
        <div className="flex space-x-2">
          <button
            onClick={() => updateActivity(activity.id, { mode: 'category' })}
            className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-all ${
              activity.mode === 'category'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}
          >
            🏛️ По категории
          </button>
          <button
            onClick={() => updateActivity(activity.id, { mode: 'specific' })}
            className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-all ${
              activity.mode === 'specific'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}
          >
            📍 Конкретное место
          </button>
        </div>
      </div>

      {/* Категория или конкретное место */}
      {activity.mode === 'category' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            🏛️ Выберите категорию
          </label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <label
                key={cat.value}
                className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${
                  activity.category === cat.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`category-${activity.id}`}
                  value={cat.value}
                  checked={activity.category === cat.value}
                  onChange={(e) => updateActivity(activity.id, { category: e.target.value })}
                  className="sr-only"
                />
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{cat.icon}</span>
                  <span className={`font-medium ${
                    activity.category === cat.value ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {cat.label}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <Input
          label="📍 Адрес или название места"
          placeholder="Например: Starbucks на Красной площади"
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
        label="🕐 Время на месте (минуты)"
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
        label="🚶 Транспорт до места"
        options={transportOptions}
        value={activity.transport}
        onChange={(e) =>
          updateActivity(activity.id, { transport: e.target.value as any })
        }
      />
    </div>
  )
}
