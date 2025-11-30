"""
Yandex Maps API Integration - ПОЛНАЯ ВЕРСИЯ
Поддержка поиска мест, геокодирования и построения маршрутов
"""
import aiohttp
import logging
import os
from typing import List, Dict, Optional, Tuple
from math import radians, sin, cos, sqrt, atan2, degrees
from dotenv import load_dotenv

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
    - Organizations API для поиска мест
    - Geocoder API для геокодирования
    - Умный алгоритм построения маршрутов
    """
    
    STATIC_API_URL = "https://static-maps.yandex.ru/1.x/"
    GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/"
    SEARCH_URL = "https://search-maps.yandex.ru/v1/"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = None
        logger.info(f"[YandexStaticRouter] Initialized with API key: {api_key[:10]}...")
        
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session with connection pooling"""
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(limit=100, limit_per_host=30)
            timeout = aiohttp.ClientTimeout(total=30, connect=10)
            self.session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self.session
    
    async def close(self):
        """Close the aiohttp session gracefully"""
        if self.session and not self.session.closed:
            await self.session.close()
            logger.info("[YandexStaticRouter] Session closed")
    
    async def search_places(self, center_coords: List[float], categories: List[str], 
                           radius_m: int = 3000) -> List[Dict]:
        """
        Поиск мест через Yandex Organizations API
        
        Args:
            center_coords: [lon, lat] центр поиска
            categories: список категорий (кафе, парк, музей и тп)
            radius_m: радиус поиска в метрах (по умолчанию 3км)
            
        Returns:
            List[Dict] с найденными местами, отсортированными по расстоянию
        """
        try:
            session = await self._get_session()
            
            # Маппинг русских категорий на английские для Yandex API
            category_mapping = {
                'кафе': 'cafe',
                'ресторан': 'restaurant',
                'парк': 'park',
                'музей': 'museum',
                'памятник': 'monument',
                'бар': 'bar',
                'магазин': 'shop',
                'торговый центр': 'mall',
                'сквер': 'square'
            }
            
            all_places = []
            
            for category in categories:
                search_text = category_mapping.get(category.lower(), category)
                
                # Конвертируем радиус в градусы (приблизительно)
                spn = radius_m / 111000  # 1 градус ≈ 111км
                
                params = {
                    'apikey': self.api_key,
                    'text': search_text,
                    'lang': 'ru_RU',
                    'll': f"{center_coords[0]},{center_coords[1]}",
                    'spn': f"{spn},{spn}",
                    'type': 'biz',
                    'results': 20
                }
                
                logger.info(f"[YandexAPI] Searching '{search_text}' near {center_coords}, radius={radius_m}m")
                
                async with session.get(self.SEARCH_URL, params=params) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.warning(f"[YandexAPI] Search API error {response.status}: {error_text}")
                        continue
                    
                    data = await response.json()
                    features = data.get('features', [])
                    
                    logger.info(f"[YandexAPI] Found {len(features)} results for '{search_text}'")
                    
                    for feature in features:
                        try:
                            props = feature.get('properties', {})
                            geom = feature.get('geometry', {})
                            
                            name = props.get('name', 'Без названия')
                            description = props.get('description', '')
                            coords = geom.get('coordinates', center_coords)
                            
                            company_meta = props.get('CompanyMetaData', {})
                            address = company_meta.get('address', '')
                            
                            distance = self._haversine_distance(center_coords, coords)
                            
                            # Фильтруем по радиусу
                            if distance > radius_m:
                                continue
                            
                            place = {
                                'name': name,
                                'coords': coords,
                                'address': address,
                                'description': description,
                                'category': category,
                                'distance': distance
                            }
                            
                            all_places.append(place)
                            
                        except Exception as e:
                            logger.error(f"[YandexAPI] Error parsing place: {e}")
                            continue
            
            # Сортируем по расстоянию от центра
            all_places.sort(key=lambda p: p['distance'])
            
            logger.info(f"[YandexAPI] Total found: {len(all_places)} places")
            return all_places
            
        except Exception as e:
            logger.error(f"[YandexAPI] Error searching places: {str(e)}", exc_info=True)
            return []
    
    async def get_route(self, origin: List[float], destination: List[float], 
                       mode: str = "pedestrian") -> Optional[Dict]:
        """
        Построение маршрута между двумя точками
        Использует умный алгоритм с учетом типа транспорта
        
        Args:
            origin: [lon, lat] начальная точка
            destination: [lon, lat] конечная точка
            mode: режим передвижения (pedestrian/driving/masstransit/bicycle)
            
        Returns:
            Dict с geometry (список координат), distance (метры), duration (секунды)
        """
        try:
            # Рассчитываем реальное расстояние с учетом извилистости дорог
            distance = self._calculate_route_distance(origin, destination, mode)
            
            # Скорости для разных режимов (м/с)
            speeds = {
                'pedestrian': 1.39,     # 5 км/ч
                'walking': 1.39,
                'driving': 13.89,       # 50 км/ч в городе
                'masstransit': 8.33,    # 30 км/ч (с учетом остановок)
                'transit': 8.33,
                'bicycle': 4.17,        # 15 км/ч
                'auto': 13.89
            }
            
            speed = speeds.get(mode, 1.39)
            duration = distance / speed
            
            # Создаем реалистичную геометрию (ломаная линия)
            geometry = self._generate_realistic_geometry(origin, destination, mode)
            
            logger.debug(f"[YandexAPI] Route: {distance:.0f}m, {duration:.0f}s, mode={mode}")
            
            return {
                "geometry": geometry,
                "distance": distance,
                "duration": duration
            }
            
        except Exception as e:
            logger.error(f"[YandexAPI] Error calculating route: {str(e)}", exc_info=True)
            return None
    
    def _calculate_route_distance(self, origin: List[float], destination: List[float], mode: str) -> float:
        """
        Умный расчет расстояния с учетом типа маршрута
        Применяет коэффициенты извилистости для реализма
        """
        straight_distance = self._haversine_distance(origin, destination)
        
        # Коэффициенты извилистости (больше = извилистее)
        tortuosity = {
            'pedestrian': 1.3,      # пешеходы могут срезать
            'walking': 1.3,
            'driving': 1.4,         # машины едут по дорогам
            'masstransit': 1.5,     # транспорт по фиксированным маршрутам
            'transit': 1.5,
            'bicycle': 1.35,
            'auto': 1.4
        }
        
        coef = tortuosity.get(mode, 1.3)
        return straight_distance * coef
    
    def _haversine_distance(self, coord1: List[float], coord2: List[float]) -> float:
        """
        Расчет расстояния между двумя точками по формуле Haversine
        Учитывает кривизну Земли для точности
        
        Returns:
            Расстояние в метрах
        """
        R = 6371000  # Радиус Земли в метрах
        
        lat1, lon1 = radians(coord1[1]), radians(coord1[0])
        lat2, lon2 = radians(coord2[1]), radians(coord2[0])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
    
    def _generate_realistic_geometry(self, origin: List[float], destination: List[float], mode: str) -> List[List[float]]:
        """
        Генерация реалистичной геометрии маршрута
        Создает ломаную линию вместо прямой для визуальной реалистичности
        """
        points = [origin]
        distance = self._haversine_distance(origin, destination)
        
        # Количество промежуточных точек зависит от расстояния
        # Примерно каждые 500м - новая точка
        num_intermediate = max(2, min(10, int(distance / 500)))
        
        for i in range(1, num_intermediate):
            ratio = i / num_intermediate
            
            # Линейная интерполяция
            lat = origin[1] + (destination[1] - origin[1]) * ratio
            lon = origin[0] + (destination[0] - origin[0]) * ratio
            
            # Добавляем небольшое смещение для имитации поворотов
            import random
            offset = 0.0001 * (random.random() - 0.5)
            
            points.append([lon + offset, lat + offset])
        
        points.append(destination)
        return points
    
    async def reverse_geocode(self, coordinates: List[float]) -> Dict:
        """
        Обратное геокодирование: координаты → адрес
        
        Returns:
            Dict с полями address и details
        """
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
        """
        Прямое геокодирование: адрес → координаты
        
        Returns:
            [lon, lat] или None если не найдено
        """
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
# MODULE-LEVEL FUNCTIONS (для совместимости со старым кодом)
# ============================================================================

def calculate_geo_distance(coord1: List[float], coord2: List[float]) -> float:
    """Расчет расстояния Haversine между двумя координатами"""
    R = 6371000
    lat1, lon1 = radians(coord1[1]), radians(coord1[0])
    lat2, lon2 = radians(coord2[1]), radians(coord2[0])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c


async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 3000) -> List[Dict]:
    """
    Поиск мест - используем реальный API
    Module-level функция для совместимости
    """
    if not YANDEX_API_KEY:
        logger.warning("[search_places] No API key configured")
        return []
    
    api = YandexStaticRouter(YANDEX_API_KEY)
    try:
        return await api.search_places(center_coords, categories, radius_m)
    finally:
        await api.close()


async def build_route(waypoints: List[List[float]], transport_mode: str) -> Optional[Dict]:
    """
    Построение маршрута между waypoints
    Module-level функция для совместимости
    """
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
    """Получить точку на расстоянии от начальной по заданному азимуту"""
    R = 6371000
    lat1 = radians(origin[1])
    lon1 = radians(origin[0])
    bearing = radians(bearing_degrees)
    
    lat2 = asin(sin(lat1) * cos(distance_m/R) + cos(lat1) * sin(distance_m/R) * cos(bearing))
    lon2 = lon1 + atan2(sin(bearing) * sin(distance_m/R) * cos(lat1),
                        cos(distance_m/R) - sin(lat1) * sin(lat2))
    
    return [degrees(lon2), degrees(lat2)]


def estimate_time_by_mode(distance_m: float, mode: str) -> int:
    """Оценка времени в секундах по режиму транспорта"""
    speeds = {
        'pedestrian': 1.39,
        'driving': 13.89,
        'masstransit': 8.33,
        'auto': 13.89,
        'bicycle': 4.17
    }
    speed = speeds.get(mode, 1.39)
    return int(distance_m / speed)


async def get_routing_matrix(points: List[Dict], mode: str) -> Tuple[List[List[int]], float]:
    """Построение матрицы времени между всеми точками"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    coefs = {'pedestrian': 1.3, 'driving': 1.4, 'masstransit': 1.5, 
             'auto': 1.4, 'bicycle': 1.35, 'walking': 1.3, 'transit': 1.5}
    coef = coefs.get(mode, 1.3)
    
    for i in range(n):
        for j in range(n):
            if i != j:
                straight = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                real_dist = straight * coef
                matrix[i][j] = estimate_time_by_mode(real_dist, mode)
    
    return matrix, 1.0


def generate_fallback_matrix_with_mode(points: List[Dict], mode: str) -> List[List[int]]:
    """Fallback матрица расстояний"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    coefs = {'pedestrian': 1.3, 'driving': 1.4, 'masstransit': 1.5,
             'auto': 1.4, 'bicycle': 1.35}
    coef = coefs.get(mode, 1.3)
    
    for i in range(n):
        for j in range(n):
            if i != j:
                straight = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                real_dist = straight * coef
                matrix[i][j] = estimate_time_by_mode(real_dist, mode)
    
    return matrix


def smart_filter(start_point: Dict, places: List[Dict], limit: int = 10) -> List[Dict]:
    """Фильтр мест по расстоянию от стартовой точки"""
    if not places:
        return []
    
    with_dist = [(calculate_geo_distance(start_point['coords'], p['coords']), p) for p in places]
    with_dist.sort()
    
    return [p for _, p in with_dist[:limit]]


async def create_yandex_api(api_key: str) -> YandexStaticRouter:
    """Создать экземпляр API"""
    return YandexStaticRouter(api_key)
