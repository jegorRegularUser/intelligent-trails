'use client'

import { useRouteStore } from '@/lib/state/routeStore'
import { ActivitiesTimeline } from './ActivitiesTimeline'

export function SmartRoutePanel() {
  const { smartRoute, updateSmartRoute } = useRouteStore()

  return (
    <div className="route-panel active">
      {/* Стартовая точка */}
      <div className="section-header">
        <span className="section-icon">📍</span>
        <h3>Откуда начинаем?</h3>
      </div>

      <div className="input-group">
        <input
          type="text"
          id="smartStartPoint"
          className="location-input"
          placeholder="Например: Москва, Красная площадь"
          value={smartRoute.start}
          onChange={(e) => updateSmartRoute('start', e.target.value)}
          autoComplete="off"
        />
        <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
          💡 Введите адрес и выберите из выпадающего списка
        </small>
      </div>

      {/* Активности */}
      <div className="section-header" style={{ marginTop: '25px' }}>
        <span className="section-icon">⏱️</span>
        <h3>Что будем делать?</h3>
        <p className="section-desc">Перетаскивайте активности для изменения порядка</p>
      </div>

      <ActivitiesTimeline />

      {/* Куда придём */}
      <div className="route-end-options" style={{ marginTop: '25px' }}>
        <div className="section-header">
          <span className="section-icon">🎯</span>
          <h3>Куда придём?</h3>
        </div>

        <label className="radio-option">
          <input
            type="radio"
            name="routeEnd"
            value="last"
            checked={smartRoute.endMode === 'last'}
            onChange={() => updateSmartRoute('endMode', 'last')}
          />
          <div className="option-card">
            <span className="option-icon">🎯</span>
            <span>Закончить в последней точке интереса</span>
          </div>
        </label>

        <label className="radio-option">
          <input
            type="radio"
            name="routeEnd"
            value="return"
            checked={smartRoute.endMode === 'return'}
            onChange={() => updateSmartRoute('endMode', 'return')}
          />
          <div className="option-card">
            <span className="option-icon">🔄</span>
            <span>Вернуться к началу</span>
          </div>
        </label>

        <label className="radio-option">
          <input
            type="radio"
            name="routeEnd"
            value="custom"
            checked={smartRoute.endMode === 'custom'}
            onChange={() => updateSmartRoute('endMode', 'custom')}
          />
          <div className="option-card">
            <span className="option-icon">📍</span>
            <span>Закончить в другом месте</span>
          </div>
        </label>
      </div>

      {/* Кастомная конечная точка */}
      {smartRoute.endMode === 'custom' && (
        <div className="input-group" id="smartEndPointGroup" style={{ marginTop: '15px' }}>
          <input
            type="text"
            id="smartEndPoint"
            className="location-input"
            placeholder="Точка финиша"
            value={smartRoute.customEnd || ''}
            onChange={(e) => updateSmartRoute('customEnd', e.target.value)}
            autoComplete="off"
          />
          <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
            💡 Введите адрес и выберите из списка
          </small>
        </div>
      )}
    </div>
  )
}
