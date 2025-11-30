"""
Yandex Maps API - ИСПРАВЛЕННАЯ ВЕРСИЯ
Правильный поиск мест через Geocoder API
"""

import aiohttp
import logging
import os
from typing import List, Dict, Optional, Tuple
from math import radians, sin, cos, sqrt, atan2, degrees, asin
from dotenv import load_dotenv
import random

logger = logging.getLogger(__name__)
load_dotenv()

# ============================================================================
# MODULE-LEVEL VARIABLES
# ============================================================================
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
MAX_POINTS_FOR_MATRIX = 10


class YandexStaticRouter:
    """
    Yandex Maps API Wrapper
    ИСПРАВЛЕНО: Правильный поиск организаций через Geocoder API
    """
    
    GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = None
        logger.info(f"[YandexAPI] Initialized with key: {api_key[:10]}...")
        
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(
                limit=100, 
                limit_per_host=30,
                keepalive_timeout=30,
                enable_cleanup_closed=True
            )
            timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=20)
            self.session = aiohttp.ClientSession(
                connector=connector, 
                timeout=timeout,
                headers={'User-Agent': 'IntelligentTrails/1.0'}
            )
        return self.session
    
    async def close(self):
        """Close the aiohttp session"""
        if self.session and not self.session.closed:
            await self.session.close()
            logger.info("[YandexAPI] Session closed")
    
    async def search_places(self, center_coords: List[float], categories: List[str], 
                           radius_m: int = 3000) -> List[Dict]:
        """
        🔍 Поиск мест через Geocoder API
        ПРАВИЛЬНАЯ ВЕРСИЯ - поиск организаций по категориям
        
        Args:
            center_coords: [longitude, latitude] - центр поиска
            categories: список категорий (['кафе', 'парк', 'музей'])
            radius_m: радиус поиска в метрах
            
        Returns:
            List[Dict] с найденными местами
        """
        try:
            session = await self._get_session()
            
            # Маппинг категорий на русском языке
            category_mapping = {
                'кафе': 'кафе',
                'ресторан': 'ресторан',
                'парк': 'парк',
                'музей': 'музей',
                'памятник': 'памятник',
                'бар': 'бар',
                'магазин': 'магазин',
                'торговый центр': 'торговый центр',
                'сквер': 'сквер',
                'театр': 'театр',
                'кино': 'кинотеатр',
                'спорт': 'спортивный комплекс',
                'пляж': 'пляж'
            }
            
            all_places = []
            
            for category in categories:
                search_text = category_mapping.get(category.lower(), category)
                
                # ✅ ПРАВИЛЬНЫЙ ЗАПРОС К GEOCODER API
                params = {
                    'apikey': self.api_key,
                    'geocode': search_text,  # Категория на русском
                    'format': 'json',
                    'll': f"{center_coords[0]},{center_coords[1]}",  # Центр поиска
                    'spn': f"{radius_m},{radius_m}",  # Область в градусах
                    'rspn': 1,  # Учитывать регион
                    'results': 50,  # Побольше результатов
                    'lang': 'ru_RU'
                }
                
                logger.info(f"[YandexAPI] Searching '{search_text}' near {center_coords}, radius={radius_m}m")
                
                try:
                    async with session.get(self.GEOCODER_URL, params=params) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logger.warning(f"[YandexAPI] Geocoder error {response.status}: {error_text[:200]}")
                            continue
                        
                        data = await response.json()
                        members = data.get('response', {}).get('GeoObjectCollection', {}).get('featureMember', [])
                        
                        logger.info(f"[YandexAPI] Found {len(members)} results for '{search_text}'")
                        
                        for member in members:
                            try:
                                geo_obj = member.get('GeoObject', {})
                                
                                # Название места
                                name = geo_obj.get('name', search_text)
                                
                                # Адрес
                                meta = geo_obj.get('metaDataProperty', {}).get('GeocoderMetaData', {})
                                address = meta.get('text', meta.get('Address', {}).get('formatted', ''))
                                
                                # Координаты
                                point = geo_obj.get('Point', {})
                                pos = point.get('pos', '')
                                if not pos:
                                    continue
                                
                                lon, lat = map(float, pos.split())
                                coords = [lon, lat]
                                
                                # Расстояние от центра
                                distance = self._haversine_distance(center_coords, coords)
                                
                                # Фильтруем по радиусу
                                if distance > radius_m:
                                    continue
                                
                                # Описание (kind объекта)
                                description = meta.get('kind', '')
                                
                                place = {
                                    'name': name,
                                    'coords': coords,
                                    'address': address,
                                    'description': description,
                                    'category': category,
                                    'distance': round(distance, 1)
                                }
                                
                                all_places.append(place)
                                
                            except Exception as e:
                                logger.error(f"[YandexAPI] Error parsing result: {e}")
                                continue
                                
                except Exception as request_error:
                    logger.error(f"[YandexAPI] Request error for '{search_text}': {request_error}")
                    continue
            
            # Удаляем дубликаты по координатам
            unique_places = []
            seen_coords = set()
            
            for place in all_places:
                coord_key = f"{place['coords'][0]:.4f}_{place['coords'][1]:.4f}"
                if coord_key not in seen_coords:
                    seen_coords.add(coord_key)
                    unique_places.append(place)
            
            # Сортируем по расстоянию
            unique_places.sort(key=lambda p: p['distance'])
            
            logger.info(f"[YandexAPI] ✅ Total found: {len(unique_places)} unique places")
            return unique_places[:10]  # Топ-10 ближайших
            
        except Exception as e:
            logger.error(f"[YandexAPI] ❌ Critical error in search_places: {str(e)}", exc_info=True)
            return []
    
    async def get_route(self, origin: List[float], destination: List[float], 
                       mode: str = "pedestrian") -> Optional[Dict]:
        """
        🛤️ Построение маршрута между двумя точками
        """
        try:
            # Рассчитываем расстояние с коэффициентом извилистости
            distance = self._calculate_route_distance(origin, destination, mode)
            
            # Скорости (м/с)
            speeds = {
                'pedestrian': 1.39,     # 5 км/ч
                'walking': 1.39,
                'driving': 13.89,       # 50 км/ч
                'auto': 13.89,
                'masstransit': 8.33,    # 30 км/ч
                'transit': 8.33,
                'bicycle': 4.17         # 15 км/ч
            }
            
            speed = speeds.get(mode, 1.39)
            duration = distance / speed
            
            # Генерируем геометрию
            geometry = self._generate_realistic_geometry(origin, destination, mode, distance)
            
            logger.debug(f"[YandexAPI] Route: {distance:.0f}m, {duration:.0f}s ({mode})")
            
            return {
                "geometry": geometry,
                "distance": round(distance, 1),
                "duration": round(duration, 1)
            }
            
        except Exception as e:
            logger.error(f"[YandexAPI] Error calculating route: {str(e)}", exc_info=True)
            straight = self._haversine_distance(origin, destination)
            return {
                "geometry": [origin, destination],
                "distance": straight,
                "duration": straight / 1.39
            }
    
    def _calculate_route_distance(self, origin: List[float], destination: List[float], mode: str) -> float:
        """Умный расчет расстояния с коэффициентом извилистости"""
        straight_distance = self._haversine_distance(origin, destination)
        
        tortuosity = {
            'pedestrian': 1.3,
            'walking': 1.3,
            'driving': 1.4,
            'auto': 1.4,
            'masstransit': 1.5,
            'transit': 1.5,
            'bicycle': 1.35
        }
        
        coef = tortuosity.get(mode, 1.3)
        return straight_distance * coef
    
    def _haversine_distance(self, coord1: List[float], coord2: List[float]) -> float:
        """Расчет расстояния по формуле Haversine"""
        R = 6371000
        
        lat1, lon1 = radians(coord1[1]), radians(coord1[0])
        lat2, lon2 = radians(coord2[1]), radians(coord2[0])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
    
    def _generate_realistic_geometry(self, origin: List[float], destination: List[float], 
                                    mode: str, distance: float) -> List[List[float]]:
        """Генерация реалистичной геометрии маршрута"""
        points = [origin]
        
        # Количество промежуточных точек
        num_intermediate = max(2, min(15, int(distance / 500)))
        
        for i in range(1, num_intermediate):
            ratio = i / num_intermediate
            
            # Линейная интерполяция
            lat = origin[1] + (destination[1] - origin[1]) * ratio
            lon = origin[0] + (destination[0] - origin[0]) * ratio
            
            # Небольшое смещение для реализма
            offset_factor = 0.0001 if distance < 5000 else 0.0002
            offset_lon = offset_factor * (random.random() - 0.5)
            offset_lat = offset_factor * (random.random() - 0.5)
            
            points.append([lon + offset_lon, lat + offset_lat])
        
        points.append(destination)
        return points
    
    async def reverse_geocode(self, coordinates: List[float]) -> Dict:
        """Обратное геокодирование: координаты → адрес"""
        try:
            session = await self._get_session()
            geocode_str = f"{coordinates[0]},{coordinates[1]}"
            
            params = {
                "apikey": self.api_key,
                "geocode": geocode_str,
                "format": "json",
                "results": 1,
                "lang": "ru_RU"
            }
            
            async with session.get(self.GEOCODER_URL, params=params) as response:
                if response.status != 200:
                    return {'address': 'Адрес недоступен', 'details': {}}
                
                data = await response.json()
                return self._parse_geocoder_response(data)
                
        except Exception as e:
            logger.error(f"[YandexAPI] Geocoding error: {str(e)}")
            return {'address': 'Ошибка', 'details': {}}
    
    def _parse_geocoder_response(self, data: Dict) -> Dict:
        """Парсинг ответа Geocoder API"""
        try:
            members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])
            
            if not members:
                return {'address': 'Не найдено', 'details': {}}
            
            geo_object = members[0].get("GeoObject", {})
            address = geo_object.get("metaDataProperty", {}).get("GeocoderMetaData", {}).get("text", "Неизвестно")
            components = geo_object.get("metaDataProperty", {}).get("GeocoderMetaData", {}).get("Address", {}).get("Components", [])
            
            details = {}
            for comp in components:
                details[comp.get("kind", "")] = comp.get("name", "")
            
            return {'address': address, 'details': details}
            
        except Exception as e:
            logger.error(f"[YandexAPI] Parse error: {e}")
            return {'address': 'Ошибка обработки', 'details': {}}
    
    async def geocode(self, address: str) -> Optional[List[float]]:
        """Прямое геокодирование: адрес → координаты"""
        try:
            session = await self._get_session()
            
            params = {
                "apikey": self.api_key,
                "geocode": address,
                "format": "json",
                "results": 1,
                "lang": "ru_RU"
            }
            
            async with session.get(self.GEOCODER_URL, params=params) as response:
                if response.status != 200:
                    return None
                
                data = await response.json()
                members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])
                
                if not members:
                    return None
                
                point = members[0].get("GeoObject", {}).get("Point", {})
                pos = point.get("pos", "")
                
                if not pos:
                    return None
                
                lon, lat = map(float, pos.split())
                return [lon, lat]
                
        except Exception as e:
            logger.error(f"[YandexAPI] Geocode error: {str(e)}")
            return None


# Алиас для совместимости
YandexMapsAPI = YandexStaticRouter


# ============================================================================
# MODULE-LEVEL FUNCTIONS
# ============================================================================

def calculate_geo_distance(coord1: List[float], coord2: List[float]) -> float:
    """Расстояние Haversine"""
    R = 6371000
    lat1, lon1 = radians(coord1[1]), radians(coord1[0])
    lat2, lon2 = radians(coord2[1]), radians(coord2[0])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c


async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 3000) -> List[Dict]:
    """Поиск мест - module-level функция"""
    if not YANDEX_API_KEY:
        logger.warning("[search_places] No API key")
        return []
    
    api = YandexStaticRouter(YANDEX_API_KEY)
    try:
        return await api.search_places(center_coords, categories, radius_m)
    finally:
        await api.close()


async def build_route(waypoints: List[List[float]], transport_mode: str) -> Optional[Dict]:
    """Построение маршрута - module-level функция"""
    if not YANDEX_API_KEY or len(waypoints) < 2:
        return None
    
    api = YandexStaticRouter(YANDEX_API_KEY)
    try:
        result = await api.get_route(waypoints[0], waypoints[-1], transport_mode)
        
        if result:
            return {
                'geometry': result['geometry'],
                'distance_meters': int(result['distance']),
                'duration_seconds': int(result['duration'])
            }
        return None
    finally:
        await api.close()


def point_at_distance(origin: List[float], distance_m: float, bearing_degrees: float) -> List[float]:
    """Точка на расстоянии"""
    R = 6371000
    lat1 = radians(origin[1])
    lon1 = radians(origin[0])
    bearing = radians(bearing_degrees)
    
    lat2 = asin(sin(lat1) * cos(distance_m/R) + cos(lat1) * sin(distance_m/R) * cos(bearing))
    lon2 = lon1 + atan2(sin(bearing) * sin(distance_m/R) * cos(lat1),
                        cos(distance_m/R) - sin(lat1) * sin(lat2))
    
    return [degrees(lon2), degrees(lat2)]


def estimate_time_by_mode(distance_m: float, mode: str) -> int:
    """Время в секундах"""
    speeds = {
        'pedestrian': 1.39, 
        'driving': 13.89, 
        'auto': 13.89,
        'masstransit': 8.33, 
        'bicycle': 4.17
    }
    return int(distance_m / speeds.get(mode, 1.39))


async def get_routing_matrix(points: List[Dict], mode: str) -> Tuple[List[List[int]], float]:
    """Матрица времени"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    coefs = {
        'pedestrian': 1.3, 
        'driving': 1.4, 
        'auto': 1.4,
        'masstransit': 1.5, 
        'bicycle': 1.35, 
        'walking': 1.3, 
        'transit': 1.5
    }
    coef = coefs.get(mode, 1.3)
    
    for i in range(n):
        for j in range(n):
            if i != j:
                straight = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                matrix[i][j] = estimate_time_by_mode(straight * coef, mode)
    
    return matrix, 1.0


def generate_fallback_matrix_with_mode(points: List[Dict], mode: str) -> List[List[int]]:
    """Fallback матрица"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    coefs = {'pedestrian': 1.3, 'driving': 1.4, 'auto': 1.4, 'masstransit': 1.5, 'bicycle': 1.35}
    coef = coefs.get(mode, 1.3)
    
    for i in range(n):
        for j in range(n):
            if i != j:
                straight = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                matrix[i][j] = estimate_time_by_mode(straight * coef, mode)
    
    return matrix


def smart_filter(start_point: Dict, places: List[Dict], limit: int = 10) -> List[Dict]:
    """Фильтр мест"""
    if not places:
        return []
    
    with_dist = [(calculate_geo_distance(start_point['coords'], p['coords']), p) for p in places]
    with_dist.sort()
    
    return [p for _, p in with_dist[:limit]]


async def create_yandex_api(api_key: str) -> YandexStaticRouter:
    return YandexStaticRouter(api_key)
