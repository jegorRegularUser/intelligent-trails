"""
Yandex Maps API integration
Provides routing and geocoding services
"""

import aiohttp
import logging
from typing import List, Dict, Optional, Tuple
import json
from math import radians, sin, cos, sqrt, atan2, degrees

logger = logging.getLogger(__name__)


# ============================================================================
# MODULE-LEVEL VARIABLES (для legacy кода)
# ============================================================================
YANDEX_API_KEY = None
MAX_POINTS_FOR_MATRIX = 10


class YandexMapsAPI:
    """Wrapper for Yandex Maps API"""
    
    BASE_URL = "https://api.routing.yandex.net/v2/route"
    GEOCODER_URL = "https://geocode-maps.yandex.ru/1.x/"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = None
        
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def close(self):
        """Close the aiohttp session"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def get_route(self, origin: List[float], destination: List[float], 
                       mode: str = "pedestrian") -> Optional[Dict]:
        """
        Get route between two points
        
        Args:
            origin: [longitude, latitude] of start point
            destination: [longitude, latitude] of end point
            mode: 'pedestrian', 'driving', or 'masstransit'
            
        Returns:
            Dict with route geometry, distance, and duration
        """
        try:
            session = await self._get_session()
            
            # Format coordinates as "lon,lat"
            origin_str = f"{origin[0]},{origin[1]}"
            dest_str = f"{destination[0]},{destination[1]}"
            
            # МАППИНГ РЕЖИМОВ ДЛЯ YANDEX API
            mode_mapping = {
                'pedestrian': 'walking',
                'driving': 'driving',
                'masstransit': 'transit',
                'auto': 'driving',
                'bicycle': 'bicycle'
            }
            yandex_mode = mode_mapping.get(mode, 'walking')
            
            # Build request parameters
            params = {
                "apikey": self.api_key,
                "waypoints": f"{origin_str}|{dest_str}",
                "mode": yandex_mode
            }
            
            # Add mode-specific parameters
            if yandex_mode == "walking":
                params["avoid"] = "tolls"
            
            logger.debug(f"Requesting route: {yandex_mode} from {origin} to {destination}")
            
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"Yandex API error {response.status}: {error_text}")
                    return None
                
                data = await response.json()
                
                # Parse response
                route_info = self._parse_route_response(data)
                
                if route_info:
                    logger.debug(f"Route received: {route_info['distance']}m, {route_info['duration']}s")
                
                return route_info
                
        except Exception as e:
            logger.error(f"Error getting route from Yandex API: {str(e)}", exc_info=True)
            return None
    
    def _parse_route_response(self, data: Dict) -> Optional[Dict]:
        """
        Parse Yandex API route response
        
        Returns:
            Dict with geometry (list of [lon, lat]), distance (meters), duration (seconds)
        """
        try:
            if "route" not in data:
                logger.warning("No route in Yandex API response")
                return None
            
            route = data["route"]
            
            # Extract geometry
            geometry = []
            if "legs" in route:
                for leg in route["legs"]:
                    if "steps" in leg:
                        for step in leg["steps"]:
                            if "polyline" in step:
                                polyline_data = step["polyline"]
                                if "points" in polyline_data:
                                    # Points are in format [lon, lat, lon, lat, ...]
                                    points = polyline_data["points"]
                                    for i in range(0, len(points), 2):
                                        geometry.append([points[i], points[i+1]])
            
            # If no geometry from steps, try to get from route level
            if not geometry and "geometry" in route:
                route_geom = route["geometry"]
                if "coordinates" in route_geom:
                    geometry = route_geom["coordinates"]
            
            # Extract distance and duration
            distance = 0
            duration = 0
            
            if "legs" in route:
                for leg in route["legs"]:
                    if "distance" in leg:
                        distance += leg["distance"]["value"]
                    if "duration" in leg:
                        duration += leg["duration"]["value"]
            
            return {
                "geometry": geometry,
                "distance": distance,
                "duration": duration
            }
            
        except Exception as e:
            logger.error(f"Error parsing Yandex route response: {str(e)}", exc_info=True)
            return None
    
    async def reverse_geocode(self, coordinates: List[float]) -> Dict:
        """Get address from coordinates (reverse geocoding)"""
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
            
            logger.debug(f"Reverse geocoding: {coordinates}")
            
            async with session.get(self.GEOCODER_URL, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"Geocoder API error {response.status}: {error_text}")
                    return {
                        'address': 'Адрес недоступен',
                        'details': {}
                    }
                
                data = await response.json()
                address_info = self._parse_geocoder_response(data)
                return address_info
                
        except Exception as e:
            logger.error(f"Error in reverse geocoding: {str(e)}", exc_info=True)
            return {
                'address': 'Ошибка получения адреса',
                'details': {}
            }
    
    def _parse_geocoder_response(self, data: Dict) -> Dict:
        """Parse Yandex Geocoder API response"""
        try:
            response = data.get("response", {})
            collection = response.get("GeoObjectCollection", {})
            members = collection.get("featureMember", [])
            
            if not members:
                return {
                    'address': 'Адрес не найден',
                    'details': {}
                }
            
            geo_object = members[0].get("GeoObject", {})
            
            address = geo_object.get("metaDataProperty", {}).get(
                "GeocoderMetaData", {}
            ).get("text", "Адрес неизвестен")
            
            components = geo_object.get("metaDataProperty", {}).get(
                "GeocoderMetaData", {}
            ).get("Address", {}).get("Components", [])
            
            details = {}
            for component in components:
                kind = component.get("kind", "")
                name = component.get("name", "")
                details[kind] = name
            
            return {
                'address': address,
                'details': details
            }
            
        except Exception as e:
            logger.error(f"Error parsing geocoder response: {str(e)}")
            return {
                'address': 'Ошибка обработки адреса',
                'details': {}
            }
    
    async def geocode(self, address: str) -> Optional[List[float]]:
        """Get coordinates from address (forward geocoding)"""
        try:
            session = await self._get_session()
            
            params = {
                "apikey": self.api_key,
                "geocode": address,
                "format": "json",
                "results": 1,
                "lang": "ru_RU"
            }
            
            logger.debug(f"Geocoding address: {address}")
            
            async with session.get(self.GEOCODER_URL, params=params) as response:
                if response.status != 200:
                    logger.error(f"Geocoder API error: {response.status}")
                    return None
                
                data = await response.json()
                
                response_obj = data.get("response", {})
                collection = response_obj.get("GeoObjectCollection", {})
                members = collection.get("featureMember", [])
                
                if not members:
                    logger.warning(f"No results for address: {address}")
                    return None
                
                geo_object = members[0].get("GeoObject", {})
                point = geo_object.get("Point", {})
                pos = point.get("pos", "")
                
                if not pos:
                    return None
                
                lon, lat = map(float, pos.split())
                
                logger.debug(f"Geocoded to: [{lon}, {lat}]")
                return [lon, lat]
                
        except Exception as e:
            logger.error(f"Error geocoding address: {str(e)}", exc_info=True)
            return None
    
    async def get_route_alternatives(self, origin: List[float], destination: List[float], 
                                    mode: str = "pedestrian", 
                                    alternatives: int = 3) -> List[Dict]:
        """Get multiple route alternatives between two points"""
        try:
            session = await self._get_session()
            
            origin_str = f"{origin[0]},{origin[1]}"
            dest_str = f"{destination[0]},{destination[1]}"
            
            # МАППИНГ РЕЖИМОВ
            mode_mapping = {
                'pedestrian': 'walking',
                'driving': 'driving',
                'masstransit': 'transit',
                'auto': 'driving',
                'bicycle': 'bicycle'
            }
            yandex_mode = mode_mapping.get(mode, 'walking')
            
            params = {
                "apikey": self.api_key,
                "waypoints": f"{origin_str}|{dest_str}",
                "mode": yandex_mode,
                "alternatives": alternatives
            }
            
            if yandex_mode == "walking":
                params["avoid"] = "tolls"
            
            logger.debug(f"Requesting {alternatives} alternative routes")
            
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status != 200:
                    logger.error(f"API error: {response.status}")
                    return []
                
                data = await response.json()
                
                routes = []
                if "routes" in data:
                    for route_data in data["routes"]:
                        route_info = self._parse_route_response({"route": route_data})
                        if route_info:
                            routes.append(route_info)
                
                return routes
                
        except Exception as e:
            logger.error(f"Error getting route alternatives: {str(e)}")
            return []


# ============================================================================
# MODULE-LEVEL FUNCTIONS (для legacy совместимости с main.py)
# ============================================================================

async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 3000) -> List[Dict]:
    """Legacy функция поиска мест (заглушка)"""
    logger.warning("search_places called but not implemented - returning empty list")
    return []


async def build_route(waypoints: List[List[float]], transport_mode: str) -> Optional[Dict]:
    """Legacy функция построения маршрута"""
    if not YANDEX_API_KEY or len(waypoints) < 2:
        return None
    
    api = YandexMapsAPI(YANDEX_API_KEY)
    try:
        result = await api.get_route(
            origin=waypoints[0],
            destination=waypoints[-1],
            mode=transport_mode
        )
        
        if result:
            return {
                'geometry': result.get('geometry', []),
                'distance_meters': int(result.get('distance', 0)),
                'duration_seconds': int(result.get('duration', 0))
            }
        return None
    finally:
        await api.close()


def calculate_geo_distance(coord1: List[float], coord2: List[float]) -> float:
    """Расчет расстояния между координатами по формуле Haversine"""
    R = 6371000  # радиус Земли в метрах
    
    lat1, lon1 = radians(coord1[1]), radians(coord1[0])
    lat2, lon2 = radians(coord2[1]), radians(coord2[0])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c


def point_at_distance(origin: List[float], distance_m: float, bearing_degrees: float) -> List[float]:
    """Получить точку на расстоянии от начальной по заданному азимуту"""
    R = 6371000
    
    lat1 = radians(origin[1])
    lon1 = radians(origin[0])
    bearing = radians(bearing_degrees)
    
    lat2 = sin(lat1) * cos(distance_m/R) + cos(lat1) * sin(distance_m/R) * cos(bearing)
    lat2 = atan2(sqrt(1 - lat2**2), lat2)
    
    lon2 = lon1 + atan2(sin(bearing) * sin(distance_m/R) * cos(lat1),
                        cos(distance_m/R) - sin(lat1) * sin(lat2))
    
    return [degrees(lon2), degrees(lat2)]


def estimate_time_by_mode(distance_m: float, mode: str) -> int:
    """Оценка времени в секундах по режиму транспорта"""
    speeds = {
        'pedestrian': 5000,      # 5 км/ч
        'auto': 40000,           # 40 км/ч
        'bicycle': 15000,        # 15 км/ч
        'masstransit': 20000     # 20 км/ч
    }
    speed_m_per_hour = speeds.get(mode, 5000)
    return int(distance_m / speed_m_per_hour * 3600)


async def get_routing_matrix(points: List[Dict], mode: str) -> Tuple[List[List[int]], float]:
    """Матрица времени между точками"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i != j:
                dist = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                matrix[i][j] = estimate_time_by_mode(dist, mode)
    
    return matrix, 1.0


def generate_fallback_matrix_with_mode(points: List[Dict], mode: str) -> List[List[int]]:
    """Fallback матрица расстояний"""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i != j:
                dist = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                matrix[i][j] = estimate_time_by_mode(dist, mode)
    
    return matrix


def smart_filter(start_point: Dict, places: List[Dict], limit: int = 10) -> List[Dict]:
    """Фильтр мест по расстоянию от стартовой точки"""
    if not places:
        return []
    
    places_with_dist = []
    for p in places:
        dist = calculate_geo_distance(start_point['coords'], p['coords'])
        places_with_dist.append((dist, p))
    
    places_with_dist.sort(key=lambda x: x[0])
    
    return [p for _, p in places_with_dist[:limit]]


# Module-level helper function
async def create_yandex_api(api_key: str) -> YandexMapsAPI:
    """Create and return YandexMapsAPI instance"""
    return YandexMapsAPI(api_key)
