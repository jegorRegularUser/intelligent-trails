'use client'

import { useRouteStore } from '@/lib/state/routeStore'
import { WalkActivity } from '@/types/activity'

interface WalkActivityFormProps {
  activity: WalkActivity
}

export function WalkActivityForm({ activity }: WalkActivityFormProps) {
  const { updateActivity } = useRouteStore()

  return (
    <div className="activity-modal-body">
      {/* Длительность */}
      <div className="input-group">
        <label>⏱️ Длительность прогулки</label>
        <div className="time-selector-compact">
          <input
            type="number"
            id="walkDuration"
            value={activity.duration}
            min={5}
            max={180}
            step={5}
            onChange={(e) =>
              updateActivity(activity.id, {
                duration: parseInt(e.target.value) || 30,
              })
            }
          />
          <span>минут</span>
        </div>
      </div>

      {/* Стиль прогулки */}
      <div className="input-group">
        <label>🎨 Стиль прогулки</label>
        <div className="walk-style-selector">
          <label className="style-option">
            <input
              type="radio"
              name={`walkStyle-${activity.id}`}
              value="scenic"
              checked={activity.style === 'scenic'}
              onChange={(e) =>
                updateActivity(activity.id, { style: 'scenic' })
              }
            />
            <div className="style-card">
              <span className="style-icon">🌳</span>
              <div>
                <strong>Живописная</strong>
                <p>Через парки и красивые места</p>
              </div>
            </div>
          </label>
          <label className="style-option">
            <input
              type="radio"
              name={`walkStyle-${activity.id}`}
              value="direct"
              checked={activity.style === 'direct'}
              onChange={(e) =>
                updateActivity(activity.id, { style: 'direct' })
              }
            />
            <div className="style-card">
              <span className="style-icon">➡️</span>
              <div>
                <strong>Прямая</strong>
                <p>Кратчайший путь к следующей точке</p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Транспорт */}
      <div className="input-group">
        <label>🚶 Способ передвижения</label>
        <select
          id="walkTransport"
          className="transport-select"
          value={activity.transport}
          onChange={(e) =>
            updateActivity(activity.id, { transport: e.target.value as any })
          }
        >
          <option value="pedestrian">🚶 Пешком</option>
          <option value="bicycle">🚴 Велосипед</option>
          <option value="auto">🚗 Авто</option>
          <option value="masstransit">🚌 Транспорт</option>
        </select>
      </div>
    </div>
  )
}
