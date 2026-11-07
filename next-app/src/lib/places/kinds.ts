// src/lib/places/kinds.ts
// Словарь OSM-kind'ов → { ru, en, icon }. Правила — docs/place-cards.md:
// неизвестный/отсутствующий kind деградирует в нейтральный «Место», никогда
// не падает и не выдумывает тип.

import {
  Anchor,
  BedDouble,
  BedSingle,
  Beer,
  Bike,
  Blocks,
  Bus,
  BusFront,
  CakeSlice,
  Castle,
  Church,
  CircleParking,
  Clapperboard,
  Coins,
  Coffee,
  Croissant,
  Disc3,
  Droplets,
  Eye,
  Flag,
  Flame,
  Flower2,
  Fuel,
  Home,
  Hospital,
  Image,
  Landmark,
  Library,
  Mail,
  MapPin,
  Medal,
  Moon,
  PawPrint,
  PersonStanding,
  Pill,
  Route,
  Sandwich,
  ShoppingBag,
  ShoppingCart,
  Signpost,
  Sparkles,
  Store,
  Theater,
  TowerControl,
  Train,
  TrainFront,
  TreePalm,
  TreePine,
  UtensilsCrossed,
  Waves,
  Wine,
  type LucideIcon,
} from 'lucide-react';

export type PlaceLocale = 'ru' | 'en';

export interface PlaceKindInfo {
  ru: string;
  en: string;
  icon: LucideIcon;
}

/**
 * Ключи — «сырые» OSM-kind'ы из ReverseGeocodeResult.kind (snake_case).
 * Расширять можно; исчезновение ключа не ломает UI (fallback нейтральный).
 */
export const PLACE_KINDS: Record<string, PlaceKindInfo> = {
  // Еда и напитки
  cafe: { ru: 'Кафе', en: 'Café', icon: Coffee },
  restaurant: { ru: 'Ресторан', en: 'Restaurant', icon: UtensilsCrossed },
  bar: { ru: 'Бар', en: 'Bar', icon: Wine },
  pub: { ru: 'Паб', en: 'Pub', icon: Beer },
  fast_food: { ru: 'Фастфуд', en: 'Fast food', icon: Sandwich },
  bakery: { ru: 'Пекарня', en: 'Bakery', icon: Croissant },
  confectionery: { ru: 'Кондитерская', en: 'Confectionery', icon: CakeSlice },

  // Культура и история
  museum: { ru: 'Музей', en: 'Museum', icon: Landmark },
  memorial: { ru: 'Мемориал', en: 'Memorial', icon: Flame },
  monument: { ru: 'Памятник', en: 'Monument', icon: PersonStanding },
  castle: { ru: 'Замок', en: 'Castle', icon: Castle },
  church: { ru: 'Храм', en: 'Church', icon: Church },
  place_of_worship: { ru: 'Храм', en: 'Place of worship', icon: Church },
  mosque: { ru: 'Мечеть', en: 'Mosque', icon: Moon },
  theatre: { ru: 'Театр', en: 'Theatre', icon: Theater },
  cinema: { ru: 'Кинотеатр', en: 'Cinema', icon: Clapperboard },
  gallery: { ru: 'Галерея', en: 'Gallery', icon: Image },
  library: { ru: 'Библиотека', en: 'Library', icon: Library },
  nightclub: { ru: 'Ночной клуб', en: 'Nightclub', icon: Disc3 },
  attraction: { ru: 'Достопримечательность', en: 'Attraction', icon: Sparkles },
  viewpoint: { ru: 'Смотровая площадка', en: 'Viewpoint', icon: Eye },

  // Природа и отдых
  park: { ru: 'Парк', en: 'Park', icon: TreePine },
  garden: { ru: 'Сад', en: 'Garden', icon: Flower2 },
  square: { ru: 'Площадь', en: 'Square', icon: Flag },
  fountain: { ru: 'Фонтан', en: 'Fountain', icon: Droplets },
  playground: { ru: 'Детская площадка', en: 'Playground', icon: Blocks },
  stadium: { ru: 'Стадион', en: 'Stadium', icon: Medal },
  swimming_pool: { ru: 'Бассейн', en: 'Pool', icon: Waves },
  beach: { ru: 'Пляж', en: 'Beach', icon: TreePalm },
  zoo: { ru: 'Зоопарк', en: 'Zoo', icon: PawPrint },

  // Транспорт
  subway_station: { ru: 'Метро', en: 'Metro station', icon: TrainFront },
  train_station: { ru: 'Вокзал', en: 'Train station', icon: Train },
  bus_stop: { ru: 'Остановка', en: 'Bus stop', icon: Bus },
  bus_station: { ru: 'Автостанция', en: 'Bus station', icon: BusFront },
  parking: { ru: 'Парковка', en: 'Parking', icon: CircleParking },
  fuel: { ru: 'АЗС', en: 'Fuel station', icon: Fuel },
  bicycle_rental: { ru: 'Прокат велосипедов', en: 'Bike rental', icon: Bike },
  pier: { ru: 'Причал', en: 'Pier', icon: Anchor },
  bridge: { ru: 'Мост', en: 'Bridge', icon: Route },
  lighthouse: { ru: 'Маяк', en: 'Lighthouse', icon: TowerControl },

  // Магазины и сервис
  mall: { ru: 'Торговый центр', en: 'Shopping mall', icon: ShoppingBag },
  supermarket: { ru: 'Супермаркет', en: 'Supermarket', icon: ShoppingCart },
  marketplace: { ru: 'Рынок', en: 'Market', icon: Store },
  pharmacy: { ru: 'Аптека', en: 'Pharmacy', icon: Pill },
  bank: { ru: 'Банк', en: 'Bank', icon: Coins },
  hospital: { ru: 'Больница', en: 'Hospital', icon: Hospital },
  post_office: { ru: 'Почта', en: 'Post office', icon: Mail },
  hotel: { ru: 'Отель', en: 'Hotel', icon: BedDouble },
  hostel: { ru: 'Хостел', en: 'Hostel', icon: BedSingle },

  // Служебные kind'ы карточки (деградация геокода)
  house: { ru: 'Дом', en: 'Building', icon: Home },
  street: { ru: 'Улица', en: 'Street', icon: Signpost },
};

/** Нейтральная карточка для неизвестного kind. */
export const UNKNOWN_KIND: PlaceKindInfo = { ru: 'Место', en: 'Place', icon: MapPin };

export function getKindInfo(kind: string | undefined | null): PlaceKindInfo {
  if (!kind) return UNKNOWN_KIND;
  return PLACE_KINDS[kind] ?? UNKNOWN_KIND;
}

/**
 * Kinds, которыми имеет смысл обогащать карточку («(рядом: …)»):
 * то, что бывает точкой притяжения в путеводителе. Дороги, дома,
 * почтовые индексы и сервисные точки landmark'ами не считаются.
 */
export const LANDMARK_KINDS: ReadonlySet<string> = new Set([
  'museum',
  'memorial',
  'monument',
  'castle',
  'church',
  'place_of_worship',
  'mosque',
  'theatre',
  'gallery',
  'park',
  'garden',
  'square',
  'fountain',
  'bridge',
  'viewpoint',
  'lighthouse',
  'pier',
  'zoo',
  'attraction',
  'train_station',
  'stadium',
  'beach',
]);

/**
 * Дороги — отдельная ветка приоритетов, именованными объектами не считаются.
 * Набор — типовые значения highway= из OSM: геокодеры (Nominatim/Photon)
 * отдают дорогу любым из этих типов, не только 'street'.
 */
export const ROAD_KINDS: ReadonlySet<string> = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'pedestrian',
  'footway',
  'path',
  'cycleway',
  'steps',
  'track',
  'road',
  'street',
  'crossing',
]);

export function isRoadKind(kind: string | undefined | null): boolean {
  return !!kind && ROAD_KINDS.has(kind);
}

/** Kind по сырым тегам, когда geocoder не дал kind. */
export function kindFromTags(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  if (tags.amenity) return tags.amenity;
  if (tags.tourism) return tags.tourism;
  if (tags.leisure) return tags.leisure;
  if (tags.historic) return tags.historic;
  if (tags.shop) return tags.shop;
  if (tags.railway === 'station' && tags.station === 'subway') return 'subway_station';
  if (tags.railway === 'station') return 'train_station';
  if (tags.highway === 'bus_stop') return 'bus_stop';
  if (tags.building) return 'house';
  return undefined;
}
