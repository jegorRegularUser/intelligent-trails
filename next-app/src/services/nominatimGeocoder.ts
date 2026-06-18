import { Coordinates } from '@/types/map';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'IntelligentTrails/1.0 (route-planner; contact@intelligent-trails.local)';

export async function nominatimReverseGeocode(
  coords: Coordinates
): Promise<{ name: string; address: string }> {
  const [lat, lon] = coords;
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
    'accept-language': 'ru',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${NOMINATIM_ENDPOINT}/reverse?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim reverse HTTP ${response.status}`);
    }

    const data = await response.json() as {
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    };

    const address = data.address ?? {};
    const street = address.road || address.pedestrian || address.footway;
    const house = address.house_number;
    const city = address.city || address.town || address.village;

    let shortName = data.name || street || 'Точка на карте';
    if (street && house) shortName = `${street}, ${house}`;
    else if (street) shortName = street;

    let formattedAddress = data.display_name || '';
    if (street && house && city) formattedAddress = `${street}, ${house}, ${city}`;
    else if (street && city) formattedAddress = `${street}, ${city}`;

    return { name: shortName, address: formattedAddress };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function nominatimForwardGeocode(
  address: string
): Promise<Coordinates | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: address,
    limit: '1',
    addressdetails: '0',
    'accept-language': 'ru',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${NOMINATIM_ENDPOINT}/search?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json() as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return [lat, lon];
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}