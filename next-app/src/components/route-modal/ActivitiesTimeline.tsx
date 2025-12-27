'use client'

import { useRouteStore } from '@/lib/state/routeStore'
import { ActivityCard } from './ActivityCard'

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
    <>
      <div className="timeline-container">
        <div className="timeline-total">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="timeline-icon">🕐</span>
            <span>Общее время: <strong id="totalTimeDisplay">{totalTime} мин</strong></span>
          </div>
        </div>

        <div id="activitiesTimeline" className="activities-timeline">
          {activities.length === 0 ? (
            <div className="timeline-empty">
              <p>🎯 Добавьте активности, чтобы создать прогулку</p>
            </div>
          ) : (
            activities.map((activity, index) => (
              <ActivityCard key={activity.id} activity={activity} index={index} />
            ))
          )}
        </div>
      </div>

      <div className="add-activity-panel">
        <div className="activity-type-selector">
          <button
            className="activity-type-btn"
            onClick={() => addActivity('walk')}
          >
            <span className="activity-icon">🚶</span>
            <span>Прогулка</span>
          </button>
          <button
            className="activity-type-btn"
            onClick={() => addActivity('place')}
          >
            <span className="activity-icon">📍</span>
            <span>Место</span>
          </button>
        </div>
      </div>
    </>
  )
}
