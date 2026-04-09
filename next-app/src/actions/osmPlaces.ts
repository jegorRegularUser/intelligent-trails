// src/actions/osmPlaces.ts
"use server";

import { Coordinates, PlaceOfInterest } from "@/types/map";
import { fetchPlacesByCategory } from "@/services/osm"; 
import { getDistanceInMeters } from "@/utils/geo"; 

export async function findOSMPlacesWithAlternatives(
  category: string,
  nearCoords: Coordinates
): Promise<PlaceOfInterest[]> {
  try {
    const places = await fetchPlacesByCategory(nearCoords, category);

    if (!places || places.length === 0) {
      return [];
    }

    return places.sort((a, b) => 
      getDistanceInMeters(nearCoords, a.coordinates) - getDistanceInMeters(nearCoords, b.coordinates)
    );
  } catch (error) {
    console.error("Ошибка при поиске через OSM:", error);
    return [];
  }
}