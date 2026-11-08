// src/lib/places/index.ts — публичная поверхность слоя мест.
export { buildPlaceCard } from './card';
export type { BuildPlaceCardOptions, NearbyPlaceInfo, PlaceCard } from './card';
export { evaluateOpeningHours } from './hours';
export type { OpenState } from './hours';
export {
  getKindInfo,
  isRoadKind,
  kindFromTags,
  LANDMARK_KINDS,
  PLACE_KINDS,
  UNKNOWN_KIND,
} from './kinds';
export type { PlaceKindInfo, PlaceLocale } from './kinds';
export {
  composeAddress,
  dedupeKindLabel,
  formatDistance,
  formatNearbySuffix,
  localizedName,
  normalizeLabel,
} from './label';
