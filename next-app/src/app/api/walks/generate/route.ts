import { NextRequest, NextResponse } from 'next/server'
import { generateWalk } from '@/lib/yandex/walks'
import { isValidCoordinates } from '@/lib/utils/validation'
import { calculateTotalDistance } from '@/lib/utils/distance'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { start_point, end_point, duration, style, transport } = body

    // Валидация
    if (!isValidCoordinates(start_point)) {
      return NextResponse.json(
        { success: false, error: 'Invalid start_point' },
        { status: 400 }
      )
    }

    if (end_point && !isValidCoordinates(end_point)) {
      return NextResponse.json(
        { success: false, error: 'Invalid end_point' },
        { status: 400 }
      )
    }

    if (!duration || duration < 5 || duration > 300) {
      return NextResponse.json(
        { success: false, error: 'Duration must be between 5 and 300 minutes' },
        { status: 400 }
      )
    }

    if (!['scenic', 'direct'].includes(style)) {
      return NextResponse.json(
        { success: false, error: 'Style must be scenic or direct' },
        { status: 400 }
      )
    }

    const apiKey = process.env.YANDEX_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key not configured' },
        { status: 500 }
      )
    }

    const waypoints = await generateWalk(
      start_point,
      end_point || null,
      duration,
      style,
      transport || 'pedestrian',
      apiKey
    )

    return NextResponse.json({
      success: true,
      waypoints,
      estimated_distance: calculateTotalDistance(waypoints),
      estimated_time: duration,
    })
  } catch (error) {
    console.error('Generate walk error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
