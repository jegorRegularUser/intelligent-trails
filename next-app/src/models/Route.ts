import mongoose from 'mongoose'
import { RouteMode } from '@/types/route'

export interface IRoute {
  userId: mongoose.Types.ObjectId
  type: RouteMode
  data: any // Полные данные маршрута
  waypoints: Array<[number, number]>
  metadata: {
    distance: number
    duration: number
    activities?: any[]
  }
  createdAt: Date
  updatedAt: Date
}

const RouteSchema = new mongoose.Schema<IRoute>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['simple', 'smart'],
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    waypoints: {
      type: [[Number]],
      required: true,
    },
    metadata: {
      distance: {
        type: Number,
        required: true,
      },
      duration: {
        type: Number,
        required: true,
      },
      activities: {
        type: [mongoose.Schema.Types.Mixed],
      },
    },
  },
  {
    timestamps: true,
  }
)

// Индексы
RouteSchema.index({ userId: 1, createdAt: -1 })
RouteSchema.index({ type: 1 })

export const Route =
  mongoose.models.Route || mongoose.model<IRoute>('Route', RouteSchema)
