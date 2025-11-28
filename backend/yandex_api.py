"""
Yandex Maps API integration
Provides routing and geocoding services
"""

import aiohttp
import logging
from typing import List, Dict, Optional, Tuple
import json

logger = logging.getLogger(__name__)


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
            
            # Build request parameters
            params = {
                "apikey": self.api_key,
                "waypoints": f"{origin_str}|{dest_str}",
                "mode": mode
            }
            
            # Add mode-specific parameters
            if mode == "pedestrian":
                params["avoid"] = "tolls"
            
            logger.debug(f"Requesting route: {mode} from {origin} to {destination}")
            
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
        """
        Get address from coordinates (reverse geocoding)
        
        Args:
            coordinates: [longitude, latitude]
            
        Returns:
            Dict with address and details
        """
        try:
            session = await self._get_session()
            
            # Format: "lon,lat"
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
                
                # Parse geocoder response
                address_info = self._parse_geocoder_response(data)
                
                return address_info
                
        except Exception as e:
            logger.error(f"Error in reverse geocoding: {str(e)}", exc_info=True)
            return {
                'address': 'Ошибка получения адреса',
                'details': {}
            }
    
    def _parse_geocoder_response(self, data: Dict) -> Dict:
        """
        Parse Yandex Geocoder API response
        
        Returns:
            Dict with formatted address and details
        """
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
            
            # Get formatted address
            address = geo_object.get("metaDataProperty", {}).get(
                "GeocoderMetaData", {}
            ).get("text", "Адрес неизвестен")
            
            # Extract address components
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
        """
        Get coordinates from address (forward geocoding)
        
        Args:
            address: Address string
            
        Returns:
            [longitude, latitude] or None if not found
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
            
            logger.debug(f"Geocoding address: {address}")
            
            async with session.get(self.GEOCODER_URL, params=params) as response:
                if response.status != 200:
                    logger.error(f"Geocoder API error: {response.status}")
                    return None
                
                data = await response.json()
                
                # Parse response
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
                
                # Parse "lon lat" string
                lon, lat = map(float, pos.split())
                
                logger.debug(f"Geocoded to: [{lon}, {lat}]")
                return [lon, lat]
                
        except Exception as e:
            logger.error(f"Error geocoding address: {str(e)}", exc_info=True)
            return None
    
    async def get_route_alternatives(self, origin: List[float], destination: List[float], 
                                    mode: str = "pedestrian", 
                                    alternatives: int = 3) -> List[Dict]:
        """
        Get multiple route alternatives between two points
        
        Args:
            origin: [longitude, latitude]
            destination: [longitude, latitude]
            mode: routing mode
            alternatives: number of alternative routes to request
            
        Returns:
            List of route dicts
        """
        try:
            session = await self._get_session()
            
            origin_str = f"{origin[0]},{origin[1]}"
            dest_str = f"{destination[0]},{destination[1]}"
            
            params = {
                "apikey": self.api_key,
                "waypoints": f"{origin_str}|{dest_str}",
                "mode": mode,
                "alternatives": alternatives
            }
            
            if mode == "pedestrian":
                params["avoid"] = "tolls"
            
            logger.debug(f"Requesting {alternatives} alternative routes")
            
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status != 200:
                    logger.error(f"API error: {response.status}")
                    return []
                
                data = await response.json()
                
                # Parse all routes
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


# Module-level helper functions
async def create_yandex_api(api_key: str) -> YandexMapsAPI:
    """Create and return YandexMapsAPI instance"""
    return YandexMapsAPI(api_key)
