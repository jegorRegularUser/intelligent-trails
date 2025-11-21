const mapsApiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY || '***REMOVED-YANDEX-MAPS-KEY***';
const suggestApiKey = import.meta.env.VITE_YANDEX_SUGGEST_API_KEY || '***REMOVED-YANDEX-SUGGEST-KEY***';

export const YANDEX_API_KEYS = {
  mapsApiKey,
  suggestApiKey,
} as const;

export const getYandexMapsUrl = () => {
  const { mapsApiKey, suggestApiKey } = YANDEX_API_KEYS;
  return `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsApiKey}&suggest_apikey=${suggestApiKey}&load=package.full`;
};
