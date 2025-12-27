'use client'

import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useRouteStore } from '@/lib/state/routeStore'

const transportOptions = [
  { value: 'pedestrian', label: '🚶 Пешком' },
  { value: 'auto', label: '🚗 Автомобиль' },
  { value: 'bicycle', label: '🚴 Велосипед' },
  { value: 'masstransit', label: '🚌 Общественный транспорт' },
]

export function SimpleRoutePanel() {
  const { simpleRoute, updateSimpleRoute, addWaypoint, removeWaypoint } =
    useRouteStore()

  return (
    <div className="space-y-4">
      {/* Откуда */}
      <Input
        label="Откуда"
        placeholder="Введите адрес начальной точки"
        value={simpleRoute.start}
        onChange={(e) => updateSimpleRoute('start', e.target.value)}
      />

      {/* Промежуточные точки */}
      {simpleRoute.waypoints.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Промежуточные точки
          </label>
          {simpleRoute.waypoints.map((waypoint, index) => (
            <div key={index} className="flex space-x-2">
              <Input
                placeholder="Адрес промежуточной точки"
                value={waypoint}
                onChange={(e) => {
                  const newWaypoints = [...simpleRoute.waypoints]
                  newWaypoints[index] = e.target.value
                  updateSimpleRoute('waypoints', newWaypoints)
                }}
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeWaypoint(index)}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Кнопка добавления промежуточной точки */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => addWaypoint('')}
      >
        + Добавить промежуточную точку
      </Button>

      {/* Куда */}
      <Input
        label="Куда"
        placeholder="Введите адрес конечной точки"
        value={simpleRoute.end}
        onChange={(e) => updateSimpleRoute('end', e.target.value)}
      />

      {/* Выбор транспорта */}
      <Select
        label="Тип транспорта"
        options={transportOptions}
        value={simpleRoute.transport}
        onChange={(e) => updateSimpleRoute('transport', e.target.value as any)}
      />

      {/* Инфо */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 <strong>Подсказка:</strong> Вы можете добавить промежуточные точки,
          через которые должен пройти маршрут.
        </p>
      </div>
    </div>
  )
}
