'use client'

import { useRouteStore } from '@/lib/state/routeStore'

const transportOptions = [
  { value: 'auto', icon: '🚗', label: 'Авто' },
  { value: 'pedestrian', icon: '🚶', label: 'Пешком' },
  { value: 'masstransit', icon: '🚌', label: 'Транспорт' },
  { value: 'bicycle', icon: '🚴', label: 'Велосипед' },
]

export function SimpleRoutePanel() {
  const { simpleRoute, updateSimpleRoute } = useRouteStore()

  return (
    <div className="route-panel active">
      {/* Точки маршрута */}
      <div className="section-header">
        <span className="section-icon">📍</span>
        <h3>Точки маршрута</h3>
      </div>

      {/* Стартовая точка */}
      <div className="input-group">
        <label>
          <span className="point-icon start-icon">A</span>
          Откуда
        </label>
        <input
          type="text"
          id="simpleStartPoint"
          className="location-input"
          placeholder="Начальная точка"
          value={simpleRoute.start}
          onChange={(e) => updateSimpleRoute('start', e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* TODO: Waypoints */}
      <div id="simpleWaypointsContainer"></div>

      {/* Конечная точка */}
      <div className="input-group">
        <label>
          <span className="point-icon end-icon">B</span>
          Куда
        </label>
        <input
          type="text"
          id="simpleEndPoint"
          className="location-input"
          placeholder="Конечная точка"
          value={simpleRoute.end}
          onChange={(e) => updateSimpleRoute('end', e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Транспорт */}
      <div className="section-header">
        <span className="section-icon">🚗</span>
        <h3>Способ передвижения</h3>
      </div>

      <div className="transport-mode-grid">
        {transportOptions.map((option) => (
          <label key={option.value} className="transport-option">
            <input
              type="radio"
              name="simpleTransport"
              value={option.value}
              checked={simpleRoute.transport === option.value}
              onChange={(e) => updateSimpleRoute('transport', e.target.value as any)}
            />
            <div className="transport-card">
              <span className="transport-icon">{option.icon}</span>
              <span>{option.label}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
