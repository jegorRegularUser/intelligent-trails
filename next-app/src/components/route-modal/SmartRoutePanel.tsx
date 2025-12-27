'use client'

import { Input } from '@/components/ui/Input'
import { useRouteStore } from '@/lib/state/routeStore'
import { ActivitiesTimeline } from './ActivitiesTimeline'

export function SmartRoutePanel() {
  const { smartRoute, updateSmartRoute } = useRouteStore()

  return (
    <div className="space-y-6">
      {/* Стартовая точка */}
      <Input
        label="Стартовая точка"
        placeholder="Введите адрес начала прогулки"
        value={smartRoute.start}
        onChange={(e) => updateSmartRoute('start', e.target.value)}
      />

      {/* Режим окончания */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Где закончить прогулку?
        </label>
        <div className="space-y-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="endMode"
              value="last"
              checked={smartRoute.endMode === 'last'}
              onChange={(e) => updateSmartRoute('endMode', 'last')}
              className="w-4 h-4 text-blue-600"
            />
            <span>В последней точке маршрута</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="endMode"
              value="return"
              checked={smartRoute.endMode === 'return'}
              onChange={(e) => updateSmartRoute('endMode', 'return')}
              className="w-4 h-4 text-blue-600"
            />
            <span>Вернуться к стартовой точке</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              name="endMode"
              value="custom"
              checked={smartRoute.endMode === 'custom'}
              onChange={(e) => updateSmartRoute('endMode', 'custom')}
              className="w-4 h-4 text-blue-600"
            />
            <span>В другом месте</span>
          </label>
        </div>
      </div>

      {/* Кастомная конечная точка */}
      {smartRoute.endMode === 'custom' && (
        <Input
          label="Конечная точка"
          placeholder="Введите адрес конечной точки"
          value={smartRoute.customEnd || ''}
          onChange={(e) => updateSmartRoute('customEnd', e.target.value)}
        />
      )}

      {/* Таймлайн активностей */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Активности в маршруте
        </label>
        <ActivitiesTimeline />
      </div>

      {/* Инфо */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-sm text-green-800">
          🎯 <strong>Умная прогулка</strong> автоматически подберет интересные
          места согласно вашим предпочтениям!
        </p>
      </div>
    </div>
  )
}
