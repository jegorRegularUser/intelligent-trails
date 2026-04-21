import { Coffee, TreePine, Landmark, UtensilsCrossed, Theater, Wine, Clapperboard, ShoppingBag, Eye } from "lucide-react";

/**
 * Централизованный реестр категорий мест для всего приложения.
 *
 * При добавлении новой категории:
 * 1. Добавьте запись в PLACE_CATEGORIES с иконкой, OSM тегом и радиусами поиска
 * 2. Добавьте переводы в messages/ru.json и messages/en.json (ключи: BuilderSidebar.cat{Name})
 * 3. Опционально: добавьте русские алиасы в CATEGORY_ALIASES
 *
 * Радиусы поиска (адаптивный поиск):
 * - Для мелких объектов (кафе, бары): [200, 700, 2000, 5000]
 * - Для средних (рестораны, магазины): [200, 800, 2500, 6000]
 * - Для крупных (парки, достопримечательности): [300, 1000, 3500, 8000]
 * - Для редких (музеи, кинотеатры, смотровые): [400, 1500, 4000, 10000]
 */
export const PLACE_CATEGORIES = {
  cafe: {
    id: 'cafe',
    icon: Coffee,
    osmTag: '["amenity"="cafe"]',
    radiuses: [200, 700, 2000, 5000]
  },
  restaurant: {
    id: 'restaurant',
    icon: UtensilsCrossed,
    osmTag: '["amenity"="restaurant"]',
    radiuses: [200, 800, 2500, 6000]
  },
  park: {
    id: 'park',
    icon: TreePine,
    osmTag: '["leisure"="park"]',
    radiuses: [300, 1000, 3500, 8000]
  },
  museum: {
    id: 'museum',
    icon: Landmark,
    osmTag: '["tourism"="museum"]',
    radiuses: [400, 1500, 4000, 10000]
  },
  attraction: {
    id: 'attraction',
    icon: Theater,
    osmTag: '["tourism"="attraction"]',
    radiuses: [300, 1000, 3500, 8000]
  },
  bar: {
    id: 'bar',
    icon: Wine,
    osmTag: '["amenity"="bar"]',
    radiuses: [200, 700, 2000, 5000]
  },
  cinema: {
    id: 'cinema',
    icon: Clapperboard,
    osmTag: '["amenity"="cinema"]',
    radiuses: [400, 1500, 4000, 10000]
  },
  shopping: {
    id: 'shopping',
    icon: ShoppingBag,
    osmTag: '["shop"]',
    radiuses: [200, 800, 2500, 6000]
  },
  viewpoint: {
    id: 'viewpoint',
    icon: Eye,
    osmTag: '["tourism"="viewpoint"]',
    radiuses: [400, 1500, 4000, 10000]
  },
} as const;

export type CategoryId = keyof typeof PLACE_CATEGORIES;

// Алиасы для русских названий
export const CATEGORY_ALIASES: Record<string, CategoryId> = {
  'кафе': 'cafe',
  'кофейня': 'cafe',
  'ресторан': 'restaurant',
  'парк': 'park',
  'сквер': 'park',
  'музей': 'museum'
};
