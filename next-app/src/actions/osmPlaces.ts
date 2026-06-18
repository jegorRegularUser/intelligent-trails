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
    const places = await fetchPlacesByCategory(nearCoords, category, undefined, destinationCoords);

    if (!places || places.length === 0) {
      return [];
    }

    const normalizedCategory = category.toLowerCase().trim();

    return rankPlaces(places, {
      currentPosition: nearCoords,
      destinationPosition: destinationCoords,
      maxResults: 5,
      diversityRadius: 300,
      nearbyThreshold:
        normalizedCategory === 'park' || normalizedCategory === 'парк' ? 3500 : 2000,
    });
  } catch (error) {
    console.error("Ошибка при поиске через OSM:", error);
    return [];
  }
}