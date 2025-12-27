import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces, searchPlacesSequential } from '@/lib/yandex/places'
import { isValidCoordinates } from '@/lib/utils/validation'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { center_coords, categories, radius_m, sequential, previous_point } =
      body

    // Валидация
    if (!isValidCoordinates(center_coords)) {
      return NextResponse.json(
        { success: false, error: 'Invalid center_coords' },
        { status: 400 }
      )
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid categories' },
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

    // Последовательный поиск или обычный
    const places = sequential
      ? await searchPlacesSequential(
          previous_point || center_coords,
          categories,
          radius_m || 5000,
          apiKey
        )
      : await searchPlaces(
          center_coords,
          categories,
          radius_m || 5000,
          apiKey
        )

    return NextResponse.json({
      success: true,
      places_by_category: places,
      total_count: Object.values(places).flat().length,
    })
  } catch (error) {
    console.error('Search places error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
