// src/actions/osmPlaces.ts
"use server";

// Поиск альтернатив категории для эксперт-режима — на едином geo-слое
// (ADR-001): Overpass-адаптер сам делает коридорный поиск (opts.toward) и
// адаптивные радиусы категории; здесь только нормализация категории,
// диверсификация списка и маппинг в PlaceOfInterest. Легаси services/osm +
// utils/placeRanking выведены в ADR-002.
import { Coordinates, PlaceOfInterest } from "@/types/map";
import type { GeoPlace } from "@/lib/geo";
import { getCloudProvider } from "@/lib/geo/instance";
import { getDistanceInMeters } from "@/utils/geo";
import { CATEGORY_ALIASES, PLACE_CATEGORIES, type CategoryId } from "@/constants/categories";

/** Сколько альтернатив отдаём наружу (UI показывает первые 5). */
const MAX_RESULTS = 5;
/** Минимальная дистанция между альтернативами — не пять заведений в одном дворе. */
const DIVERSITY_RADIUS_M = 300;

/** UI-строка категории (id или русский алиас) → id реестра; незнакомое → null. */
function normalizeCategory(category: string): CategoryId | null {
  const key = category.toLowerCase().trim();
  if (key in PLACE_CATEGORIES) return key as CategoryId;
  const aliased = (CATEGORY_ALIASES as Record<string, CategoryId | undefined>)[key];
  return aliased && aliased in PLACE_CATEGORIES ? aliased : null;
}

/** GeoPlace → PlaceOfInterest: числовой id обязателен, строка OSM парсится. */
function toPlaceOfInterest(place: GeoPlace, index: number): PlaceOfInterest {
  const numericId = typeof place.id === "number" ? place.id : Number(String(place.id).replace(/\D/g, ""));
  return {
    // Нечисловой id — стабильный отрицательный (не пересекается с реальными OSM-id).
    id: Number.isFinite(numericId) && numericId !== 0 ? numericId : -(index + 1),
    name: place.name,
    category: place.category,
    coordinates: place.coordinates,
    address: place.address,
    rating: place.rating,
    tags: place.tags,
  };
}

export async function findOSMPlacesWithAlternatives(
  category: string,
  nearCoords: Coordinates,
  destinationCoords?: Coordinates
): Promise<PlaceOfInterest[]> {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];

  try {
    const places = await getCloudProvider().searchPlaces(nearCoords, normalized, {
      // Радиусы не задаём: адаптер сам эскалирует по radiuses категории
      // (дока categories.ts), коридор — через toward к финишу.
      ...(destinationCoords ? { toward: destinationCoords } : {}),
      limit: 24,
    });

    // Ближайшие первыми (адаптер уже сортировал, но сортировка от center
    // при коридоре может прийти перемешанной), затем диверсификация.
    const sorted = [...places].sort(
      (a, b) => getDistanceInMeters(nearCoords, a.coordinates) - getDistanceInMeters(nearCoords, b.coordinates),
    );
    const picked: GeoPlace[] = [];
    for (const place of sorted) {
      if (picked.every((p) => getDistanceInMeters(p.coordinates, place.coordinates) >= DIVERSITY_RADIUS_M)) {
        picked.push(place);
        if (picked.length >= MAX_RESULTS) break;
      }
    }
    // Диверсификация проредила слишком сильно (плотный центр) — добираем ближайшими.
    for (const place of sorted) {
      if (picked.length >= MAX_RESULTS) break;
      if (!picked.includes(place)) picked.push(place);
    }
    return picked.map(toPlaceOfInterest);
  } catch (error) {
    console.error("Ошибка при поиске через geo-слой:", error);
    return [];
  }
}
