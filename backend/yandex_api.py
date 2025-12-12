import aiohttp
import logging
import os
from typing import List, Dict, Optional, Tuple
from math import radians, sin, cos, sqrt, atan2
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
load_dotenv()

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
YANDEX_SUGGEST_API_KEY = os.getenv("YANDEX_SUGGEST_API_KEY")

RUSSIAN_CITIES = {
    "москва": [37.6173, 55.7558],
    "санкт-петербург": [30.3351, 59.9343],
    "нижний новгород": [44.005383, 56.326797],
    "новосибирск": [82.920430, 55.030199],
    "екатеринбург": [60.597465, 56.838011],
    "казань": [49.108891, 55.796289],
    "челябинск": [61.402550, 55.160026],
    "омск": [73.368212, 54.989342],
    "самара": [50.101783, 53.195538],
    "ростов-на-дону": [39.723062, 47.222531],
    "уфа": [56.037750, 54.735147],
    "красноярск": [92.852572, 56.010563],
    "пермь": [56.229398, 58.010374],
    "воронеж": [39.200269, 51.660781],
    "волгоград": [44.516839, 48.707103]
}

class YandexStaticRouter:
    GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/"
    SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest"
    
    def __init__(self, api_key: str, suggest_key: str = None):
        self.api_key = api_key
        self.suggest_key = suggest_key or YANDEX_SUGGEST_API_KEY
        self.session = None
        
    async def _get_session(self) -> aiohttp.ClientSession:
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

    async def _get_corrected_location(self, coordinates: List[float]) -> Dict:
        url = self.GEOCODER_URL
        params = {
            "apikey": self.api_key,
            "geocode": f"{coordinates[0]},{coordinates[1]}",
            "format": "json",
            "results": 5
        }

        try:
            session = await self._get_session()
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])
                    
                    for member in members:
                        geo_obj = member.get("GeoObject", {})
                        name = geo_obj.get("name", "").lower()
                        description = geo_obj.get("description", "").lower()
                        
                        for city_name, city_coords in RUSSIAN_CITIES.items():
                            if city_name in name or city_name in description:
                                logger.info(f"Corrected location: {name} -> {city_coords}")
                                return {
                                    "name": city_name.title(),
                                    "coordinates": city_coords,
                                    "is_russian": True
                                }
                    
                    if members:
                        first = members[0].get("GeoObject", {})
                        return {
                            "name": first.get("name", "Unknown"),
                            "coordinates": coordinates,
                            "is_russian": False
                        }
        except Exception as e:
            logger.error(f"Location correction failed: {e}")
        
        return {
            "name": "Нижний Новгород",
            "coordinates": [44.005383, 56.326797],
            "is_russian": True
        }

    async def _smart_geocode(self, name: str, address: str, location_info: Dict) -> Optional[Tuple[List[float], str]]:
        url = self.GEOCODER_URL
        
        if location_info.get('is_russian') and location_info.get('name'):
            city = location_info['name']
            
            strategies = []
            
            if name and address:
                strategies.append((f"{name}, {address}, {city}", "name_address_city"))
            if name:
                strategies.append((f"{name}, {city}", "name_city"))
            if address:
                strategies.append((f"{address}, {city}", "address_city"))
            if name:
                strategies.append((f"{name}", "name_only"))
            
            for query, method in strategies:
                params = {
                    "apikey": self.api_key,
                    "geocode": query,
                    "format": "json",
                    "results": 1
                }

                try:
                    session = await self._get_session()
                    async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=3)) as response:
                        if response.status == 200:
                            data = await response.json()
                            members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])

                            if members:
                                geo_obj = members[0].get("GeoObject", {})
                                pos = geo_obj.get("Point", {}).get("pos", "")

                                if pos:
                                    lon, lat = map(float, pos.split())
                                    if 19 < lon < 180 and 41 < lat < 82:
                                        return ([lon, lat], method)
                except:
                    continue
        
        return None

    async def search_places(self, center_coords: List[float], categories: List[str], radius_m: int = 5000) -> List[Dict]:
        try:
            if not self.suggest_key:
                logger.error("YANDEX_SUGGEST_API_KEY not configured")
                return []
            
            session = await self._get_session()
            all_places = []
            
            location_info = await self._get_corrected_location(center_coords)
            corrected_coords = location_info['coordinates']
            
            logger.info(f"Corrected location: {location_info['name']} at {corrected_coords}")
            
            for category in categories:
                logger.info(f"Searching '{category}' near {corrected_coords}")
                
                suggest_params = {
                    "apikey": self.suggest_key,
                    "text": category,
                    "ll": f"{corrected_coords[0]},{corrected_coords[1]}",
                    "results": 10,
                    "types": "biz",
                    "lang": "ru_RU"
                }
                
                try:
                    async with session.get(self.SUGGEST_URL, params=suggest_params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                        if response.status != 200:
                            logger.error(f"Suggest error {response.status}")
                            continue
                        
                        data = await response.json()
                        suggest_results = data.get("results", [])
                        logger.info(f"Suggest: {len(suggest_results)} results for '{category}'")
                        
                        if not suggest_results:
                            continue
                        
                        category_places = []
                        
                        for i, result in enumerate(suggest_results, 1):
                            title = result.get("title", {})
                            subtitle = result.get("subtitle", {})
                            
                            name = title.get("text", "") if isinstance(title, dict) else str(title)
                            subtitle_text = subtitle.get("text", "") if isinstance(subtitle, dict) else str(subtitle)
                            
                            place_category = category
                            address = ""
                            if "·" in subtitle_text:
                                parts = subtitle_text.split("·")
                                place_category = parts[0].strip()
                                address = parts[1].strip() if len(parts) > 1 else subtitle_text
                            else:
                                address = subtitle_text
                            
                            result_coords = await self._smart_geocode(name, address, location_info)
                            
                            if not result_coords:
                                continue
                            
                            coords, method = result_coords
                            distance_m = self._haversine_distance(corrected_coords, coords)
                            
                            if distance_m > radius_m:
                                continue
                            
                            place = {
                                "name": name,
                                "coords": coords,
                                "address": address,
                                "category": place_category,
                                "distance": round(distance_m),
                                "distance_text": f"{int(distance_m)}м"
                            }
                            
                            category_places.append(place)
                            logger.info(f"  Found: {name[:30]} [{coords}] {distance_m:.0f}м")
                        
                        if category_places:
                            category_places.sort(key=lambda p: p['distance'])
                            all_places.extend(category_places[:5])
                            logger.info(f"Category '{category}': {len(category_places)} -> {min(5, len(category_places))} closest")
                        else:
                            logger.warning(f"No valid places for '{category}'")
                
                except Exception as e:
                    logger.error(f"Category '{category}' error: {e}")
                    continue
            
            final_places = []
            seen_coords = set()
            
            for place in all_places:
                coord_key = f"{place['coords'][0]:.6f},{place['coords'][1]:.6f}"
                if coord_key not in seen_coords:
                    seen_coords.add(coord_key)
                    final_places.append(place)
            
            final_places.sort(key=lambda p: (p['category'], p['distance']))
            logger.info(f"Final result: {len(final_places)} unique places")
            
            return final_places
            
        except Exception as e:
            logger.error(f"search_places error: {e}", exc_info=True)
            return []
    
    def _haversine_distance(self, coord1: List[float], coord2: List[float]) -> float:
        R = 6371000
        lat1, lon1 = radians(coord1[1]), radians(coord1[0])
        lat2, lon2 = radians(coord2[1]), radians(coord2[0])
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        return R * 2 * atan2(sqrt(a), sqrt(1-a))

YandexMapsAPI = YandexStaticRouter

async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 5000) -> List[Dict]:
    if not YANDEX_API_KEY or not YANDEX_SUGGEST_API_KEY:
        logger.error("Missing API keys")
        return []
    api = YandexStaticRouter(YANDEX_API_KEY, YANDEX_SUGGEST_API_KEY)
    try:
        return await api.search_places(center_coords, categories, radius_m)
    finally:
        await api.close()
