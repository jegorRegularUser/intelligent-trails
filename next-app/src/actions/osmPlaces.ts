// src/actions/osmPlaces.ts
"use server";

import { Coordinates, PlaceOfInterest } from "@/types/map";
import { fetchPlacesByCategory } from "@/services/osm";
import { rankPlaces } from "@/utils/placeRanking";

export async function findOSMPlacesWithAlternatives(
  category: string,
  nearCoords: Coordinates,
  destinationCoords?: Coordinates
): Promise<PlaceOfInterest[]> {
  try {
    const places = await fetchPlacesByCategory(nearCoords, category);

    if (!places || places.length === 0) {
      return [];
    }

    // Умное ранжирование с учетом качества, расстояния, направления и разнообразия
    return rankPlaces(places, {
      currentPosition: nearCoords,
      destinationPosition: destinationCoords,
      maxResults: 5,
      diversityRadius: 300, // 300м между альтернативами
    });
  } catch (error) {
    console.error("Ошибка при поиске через OSM:", error);
    return [];
  }
}