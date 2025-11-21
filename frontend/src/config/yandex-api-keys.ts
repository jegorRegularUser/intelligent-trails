const mapsApiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY || '7637c9ce-fc0e-4f1d-a6e2-2d6e85cf7193';
const suggestApiKey = import.meta.env.VITE_YANDEX_SUGGEST_API_KEY || '1019e534-8f99-42e2-85b2-d0c7ed9ccca2';

export const YANDEX_API_KEYS = {
  mapsApiKey,
  suggestApiKey,
} as const;

export const getYandexMapsUrl = () => {
  const { mapsApiKey, suggestApiKey } = YANDEX_API_KEYS;
  return `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsApiKey}&suggest_apikey=${suggestApiKey}&load=package.full`;
};
