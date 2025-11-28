"""
Routing Service - Improved version with proper mode handling
Handles pedestrian, driving, and masstransit routing modes correctly
"""

import logging
from typing import List, Dict, Tuple, Optional
from yandex_api import YandexMapsAPI
from solver import RouteSolver
import time

logger = logging.getLogger(__name__)

# Routing mode configurations
ROUTING_MODES = {
    'pedestrian': {
        'yandex_mode': 'pedestrian',
        'avoid_tolls': True,
        'type': 'walking',
        'color': '#2E86DE',  # Blue
        'style': 'dashed',
        'icon': '🚶'
    },
    'driving': {
        'yandex_mode': 'driving',
        'avoid_tolls': False,
        'type': 'car',
        'color': '#EE5A6F',  # Red
        'style': 'solid',
        'icon': '🚗'
    },
    'masstransit': {
        'yandex_mode': 'masstransit',
        'avoid_tolls': False,
        'type': 'transit',
        'color': '#26de81',  # Green
        'style': 'dashed',
        'icon': '🚌'
    }
}


class RouteSegment:
    """Represents a single segment of the route between two places"""
    
    def __init__(self, from_place: Dict, to_place: Dict, geometry: List, 
                 distance: float, duration: float, mode: str):
        self.from_place = from_place
        self.to_place = to_place
        self.geometry = geometry
        self.distance = distance  # meters
        self.duration = duration  # seconds
        self.mode = mode
        self.instructions = self._generate_instructions()
        
    def _generate_instructions(self) -> str:
        """Generate human-readable instructions for this segment"""
        mode_config = ROUTING_MODES.get(self.mode, ROUTING_MODES['pedestrian'])
        icon = mode_config['icon']
        mode_name = {
            'pedestrian': 'Идите пешком',
            'driving': 'Езжайте на машине',
            'masstransit': 'Воспользуйтесь общественным транспортом'
        }.get(self.mode, 'Двигайтесь')
        
        distance_str = f"{self.distance / 1000:.1f} км" if self.distance >= 1000 else f"{int(self.distance)} м"
        duration_str = f"{int(self.duration / 60)} мин" if self.duration >= 60 else f"{int(self.duration)} сек"
        
        return f"{icon} {mode_name} от '{self.from_place['name']}' до '{self.to_place['name']}' ({distance_str}, {duration_str})"
    
    def to_dict(self) -> Dict:
        """Convert segment to dictionary for JSON serialization"""
        mode_config = ROUTING_MODES.get(self.mode, ROUTING_MODES['pedestrian'])
        
        return {
            'from': {
                'name': self.from_place['name'],
                'coordinates': self.from_place['coordinates'],
                'address': self.from_place.get('address', '')
            },
            'to': {
                'name': self.to_place['name'],
                'coordinates': self.to_place['coordinates'],
                'address': self.to_place.get('address', '')
            },
            'geometry': self.geometry,
            'distance': round(self.distance, 2),
            'duration': round(self.duration, 2),
            'mode': self.mode,
            'mode_display': mode_config['type'],
            'instructions': self.instructions,
            'style': {
                'color': mode_config['color'],
                'line_style': mode_config['style'],
                'icon': mode_config['icon']
            }
        }


class RoutingService:
    """Service for building optimal routes with proper mode handling"""
    
    def __init__(self, api_key: str):
        self.yandex_api = YandexMapsAPI(api_key)
        self.solver = RouteSolver()
        
    async def build_route(self, places: List[Dict], mode: str = 'pedestrian', 
                         optimize: bool = True) -> Dict:
        """
        Build a route through multiple places
        
        Args:
            places: List of places with coordinates, name, type (must_visit/optional)
            mode: Routing mode - pedestrian, driving, or masstransit
            optimize: Whether to optimize the order of places
            
        Returns:
            Dict with route information including segments, total distance/duration
        """
        try:
            logger.info(f"Building route for {len(places)} places in {mode} mode")
            
            # Validate mode
            if mode not in ROUTING_MODES:
                logger.warning(f"Unknown mode {mode}, defaulting to pedestrian")
                mode = 'pedestrian'
            
            # Validate places
            if not places or len(places) < 2:
                raise ValueError("At least 2 places are required to build a route")
            
            # Separate must-visit and optional places
            must_visit = [p for p in places if p.get('type') == 'must_visit']
            optional = [p for p in places if p.get('type') == 'optional']
            
            logger.info(f"Must visit: {len(must_visit)}, Optional: {len(optional)}")
            
            # If optimization is enabled, optimize the order
            if optimize and len(must_visit) > 2:
                ordered_places = await self._optimize_route_order(must_visit, mode)
            else:
                ordered_places = must_visit
            
            # Build route segments
            segments = await self._build_route_segments(ordered_places, mode)
            
            # Calculate totals
            total_distance = sum(s.distance for s in segments)
            total_duration = sum(s.duration for s in segments)
            
            # Build response
            route_data = {
                'success': True,
                'mode': mode,
                'mode_config': ROUTING_MODES[mode],
                'places': [self._place_to_dict(p, idx) for idx, p in enumerate(ordered_places)],
                'segments': [s.to_dict() for s in segments],
                'summary': {
                    'total_distance': round(total_distance, 2),
                    'total_duration': round(total_duration, 2),
                    'total_distance_km': round(total_distance / 1000, 2),
                    'total_duration_hours': round(total_duration / 3600, 2),
                    'total_duration_minutes': round(total_duration / 60, 0),
                    'number_of_places': len(ordered_places),
                    'number_of_segments': len(segments)
                },
                'optimization_applied': optimize and len(must_visit) > 2
            }
            
            logger.info(f"Route built successfully: {total_distance/1000:.1f}km, {total_duration/60:.0f}min")
            return route_data
            
        except Exception as e:
            logger.error(f"Error building route: {str(e)}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'mode': mode
            }
    
    async def _optimize_route_order(self, places: List[Dict], mode: str) -> List[Dict]:
        """Optimize the order of places using TSP solver"""
        try:
            logger.info(f"Optimizing route order for {len(places)} places")
            
            # Build distance matrix
            n = len(places)
            distance_matrix = [[0.0] * n for _ in range(n)]
            
            for i in range(n):
                for j in range(n):
                    if i != j:
                        # Get route between places i and j
                        route_info = await self._get_route_between_two_points(
                            places[i]['coordinates'],
                            places[j]['coordinates'],
                            mode
                        )
                        distance_matrix[i][j] = route_info.get('distance', float('inf'))
            
            # Solve TSP
            optimal_order = self.solver.solve_tsp(distance_matrix)
            
            # Reorder places according to optimal solution
            ordered_places = [places[i] for i in optimal_order]
            
            logger.info(f"Optimization complete. Order: {[p['name'] for p in ordered_places]}")
            return ordered_places
            
        except Exception as e:
            logger.error(f"Error optimizing route: {str(e)}")
            return places  # Return original order if optimization fails
    
    async def _build_route_segments(self, places: List[Dict], mode: str) -> List[RouteSegment]:
        """Build route segments between consecutive places"""
        segments = []
        
        for i in range(len(places) - 1):
            from_place = places[i]
            to_place = places[i + 1]
            
            logger.info(f"Building segment {i+1}: {from_place['name']} -> {to_place['name']}")
            
            # Get route info from Yandex API
            route_info = await self._get_route_between_two_points(
                from_place['coordinates'],
                to_place['coordinates'],
                mode
            )
            
            # Create segment
            segment = RouteSegment(
                from_place=from_place,
                to_place=to_place,
                geometry=route_info.get('geometry', []),
                distance=route_info.get('distance', 0),
                duration=route_info.get('duration', 0),
                mode=mode
            )
            
            segments.append(segment)
        
        return segments
    
    async def _get_route_between_two_points(self, from_coords: List[float], 
                                           to_coords: List[float], mode: str) -> Dict:
        """
        Get route between two points using Yandex API
        
        Args:
            from_coords: [longitude, latitude]
            to_coords: [longitude, latitude]
            mode: pedestrian, driving, or masstransit
            
        Returns:
            Dict with geometry, distance, duration
        """
        try:
            mode_config = ROUTING_MODES.get(mode, ROUTING_MODES['pedestrian'])
            yandex_mode = mode_config['yandex_mode']
            
            logger.debug(f"Requesting {yandex_mode} route from {from_coords} to {to_coords}")
            
            # Request route from Yandex API
            route_data = await self.yandex_api.get_route(
                origin=from_coords,
                destination=to_coords,
                mode=yandex_mode
            )
            
            if not route_data:
                logger.warning(f"No route data returned for {yandex_mode} mode")
                # Fallback to straight line
                return {
                    'geometry': [from_coords, to_coords],
                    'distance': self._calculate_haversine_distance(from_coords, to_coords),
                    'duration': 0
                }
            
            # Extract route information
            geometry = route_data.get('geometry', [from_coords, to_coords])
            distance = route_data.get('distance', 0)
            duration = route_data.get('duration', 0)
            
            logger.debug(f"Route received: {distance}m, {duration}s")
            
            return {
                'geometry': geometry,
                'distance': distance,
                'duration': duration
            }
            
        except Exception as e:
            logger.error(f"Error getting route between points: {str(e)}")
            # Fallback to straight line
            return {
                'geometry': [from_coords, to_coords],
                'distance': self._calculate_haversine_distance(from_coords, to_coords),
                'duration': 0
            }
    
    def _calculate_haversine_distance(self, coord1: List[float], coord2: List[float]) -> float:
        """Calculate distance between two coordinates using Haversine formula"""
        from math import radians, sin, cos, sqrt, atan2
        
        lon1, lat1 = coord1
        lon2, lat2 = coord2
        
        R = 6371000  # Earth radius in meters
        
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        delta_phi = radians(lat2 - lat1)
        delta_lambda = radians(lon2 - lon1)
        
        a = sin(delta_phi/2)**2 + cos(phi1) * cos(phi2) * sin(delta_lambda/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        distance = R * c
        return distance
    
    def _place_to_dict(self, place: Dict, index: int) -> Dict:
        """Convert place to dictionary with additional info"""
        return {
            'id': place.get('id', index),
            'name': place.get('name', f'Place {index + 1}'),
            'coordinates': place.get('coordinates', [0, 0]),
            'address': place.get('address', ''),
            'type': place.get('type', 'must_visit'),
            'order': index + 1,
            'marker': {
                'number': index + 1,
                'color': '#2E86DE' if place.get('type') == 'must_visit' else '#FFA502'
            }
        }
    
    async def get_place_info(self, coordinates: List[float]) -> Dict:
        """Get detailed information about a place by coordinates"""
        try:
            # Get address via reverse geocoding
            address_data = await self.yandex_api.reverse_geocode(coordinates)
            
            return {
                'success': True,
                'coordinates': coordinates,
                'address': address_data.get('address', 'Адрес неизвестен'),
                'details': address_data.get('details', {})
            }
        except Exception as e:
            logger.error(f"Error getting place info: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def update_route_place(self, route_data: Dict, place_index: int, 
                                new_place: Dict) -> Dict:
        """Update a specific place in an existing route and rebuild affected segments"""
        try:
            places = route_data.get('places', [])
            
            if place_index < 0 or place_index >= len(places):
                raise ValueError(f"Invalid place index: {place_index}")
            
            # Update the place
            places[place_index] = new_place
            
            # Rebuild the entire route
            mode = route_data.get('mode', 'pedestrian')
            return await self.build_route(places, mode, optimize=False)
            
        except Exception as e:
            logger.error(f"Error updating route place: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }


# Singleton instance
_routing_service = None

def get_routing_service(api_key: str) -> RoutingService:
    """Get or create routing service singleton"""
    global _routing_service
    if _routing_service is None:
        _routing_service = RoutingService(api_key)
    return _routing_service
