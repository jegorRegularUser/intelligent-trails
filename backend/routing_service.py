
# ========== routing_service.py ==========
"""
Routing Service - СОВМЕСТИМАЯ ВЕРСИЯ
✅ Работает с исправленным yandex_api.py
"""

import logging
from typing import List, Dict, Tuple, Optional
from yandex_api import YandexMapsAPI
import yandex_api as yandex_api_module
from solver import solve_vrp_dynamic

logger = logging.getLogger(__name__)

ROUTING_MODES = {
    'pedestrian': {
        'yandex_mode': 'pedestrian',
        'avoid_tolls': True,
        'type': 'walking',
        'color': '#2E86DE',
        'style': 'dashed',
        'icon': '🚶'
    },
    'driving': {
        'yandex_mode': 'driving',
        'avoid_tolls': False,
        'type': 'car',
        'color': '#EE5A6F',
        'style': 'solid',
        'icon': '🚗'
    },
    'auto': {
        'yandex_mode': 'driving',
        'avoid_tolls': False,
        'type': 'car',
        'color': '#EE5A6F',
        'style': 'solid',
        'icon': '🚗'
    },
    'masstransit': {
        'yandex_mode': 'masstransit',
        'avoid_tolls': False,
        'type': 'transit',
        'color': '#26de81',
        'style': 'dashed',
        'icon': '🚌'
    },
    'bicycle': {
        'yandex_mode': 'bicycle',
        'avoid_tolls': False,
        'type': 'bicycle',
        'color': '#FFA502',
        'style': 'dashed',
        'icon': '🚴'
    }
}


class RouteSegment:
    def __init__(self, from_place: Dict, to_place: Dict, geometry: List, 
                 distance: float, duration: float, mode: str):
        self.from_place = from_place
        self.to_place = to_place
        self.geometry = geometry
        self.distance = distance
        self.duration = duration
        self.mode = mode
        self.instructions = self._generate_instructions()
        
    def _generate_instructions(self) -> str:
        mode_config = ROUTING_MODES.get(self.mode, ROUTING_MODES['pedestrian'])
        icon = mode_config['icon']
        mode_name = {
            'pedestrian': 'Идите пешком',
            'driving': 'Езжайте на машине',
            'auto': 'Езжайте на машине',
            'masstransit': 'Воспользуйтесь общественным транспортом',
            'bicycle': 'Езжайте на велосипеде'
        }.get(self.mode, 'Двигайтесь')
        
        distance_str = f"{self.distance / 1000:.1f} км" if self.distance >= 1000 else f"{int(self.distance)} м"
        duration_str = f"{int(self.duration / 60)} мин" if self.duration >= 60 else f"{int(self.duration)} сек"
        
        return f"{icon} {mode_name} от '{self.from_place['name']}' до '{self.to_place['name']}' ({distance_str}, {duration_str})"
    
    def to_dict(self) -> Dict:
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
    def __init__(self, api_key: str):
        self.yandex_api = YandexMapsAPI(api_key)
        
    async def build_route(self, places: List[Dict], optimize: bool = True) -> Dict:
        try:
            logger.info(f"[RoutingService] Building route for {len(places)} places, optimize={optimize}")
            
            if not places or len(places) < 2:
                raise ValueError("At least 2 places are required to build a route")
            
            resolved_places = await self._resolve_places(places)
            
            if len(resolved_places) < 2:
                raise ValueError("Not enough valid places after resolution")
            
            logger.info(f"[RoutingService] ✅ Resolved {len(resolved_places)} places (from {len(places)} input)")
            
            if optimize and len(resolved_places) > 2:
                ordered_places = await self._optimize_route_order(resolved_places)
            else:
                ordered_places = resolved_places
            
            segments = await self._build_route_segments(ordered_places)
            
            total_distance = sum(s.distance for s in segments)
            total_duration = sum(s.duration for s in segments)
            
            route_data = {
                'success': True,
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
                'optimization_applied': optimize and len(resolved_places) > 2
            }
            
            logger.info(f"[RoutingService] ✅ Route built: {total_distance/1000:.1f}km, {total_duration/60:.0f}min, {len(segments)} segments")
            return route_data
            
        except Exception as e:
            logger.error(f"[RoutingService] ❌ Error building route: {str(e)}", exc_info=True)
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _resolve_places(self, places: List[Dict]) -> List[Dict]:
        resolved = []
        
        search_center = None
        for place in places:
            coords = place.get('coordinates', [0, 0])
            if coords and len(coords) == 2 and (coords[0] != 0 or coords[1] != 0):
                search_center = coords
                logger.info(f"[RoutingService] Using search center from '{place.get('name')}': {search_center}")
                break
        
        if not search_center:
            search_center = [37.6173, 55.7558]
            logger.warning(f"[RoutingService] ⚠️ No valid coordinates, using Moscow: {search_center}")
        
        for i, place in enumerate(places):
            place_type = place.get('type', 'must_visit')
            category = place.get('category')
            coords = place.get('coordinates', [0, 0])
            transport_mode = place.get('transport_mode', 'pedestrian')
            
            has_valid_coords = (coords and len(coords) == 2 and (coords[0] != 0 or coords[1] != 0))
            
            if has_valid_coords:
                resolved.append(place)
                logger.info(f"[RoutingService] Place {i}: '{place.get('name')}' - ✅ coords {coords}, mode={transport_mode}")
                continue
            
            if category:
                logger.info(f"[RoutingService] Place {i}: Searching '{category}' near {search_center}")
                
                try:
                    search_results = await yandex_api_module.search_places(
                        center_coords=search_center,
                        categories=[category],
                        radius_m=5000
                    )
                    
                    if search_results:
                        found_place = search_results[0]
                        resolved_place = {
                            'name': found_place.get('name', category),
                            'coordinates': found_place.get('coords', search_center),
                            'address': found_place.get('address', ''),
                            'type': place_type,
                            'category': category,
                            'transport_mode': transport_mode
                        }
                        resolved.append(resolved_place)
                        logger.info(f"[RoutingService] ✅ Found: '{resolved_place['name']}' at {resolved_place['coordinates']}, mode={transport_mode}")
                        
                        search_center = resolved_place['coordinates']
                    else:
                        logger.warning(f"[RoutingService] ❌ No places found for category '{category}'")
                        
                except Exception as e:
                    logger.error(f"[RoutingService] ❌ Error searching '{category}': {e}")
                    
            else:
                logger.warning(f"[RoutingService] ⚠️ Place {i}: '{place.get('name')}' - NO coords, NO category - SKIPPING")
        
        logger.info(f"[RoutingService] ✅ Resolved {len(resolved)} places from {len(places)} input")
        return resolved
    
    async def _optimize_route_order(self, places: List[Dict]) -> List[Dict]:
        try:
            logger.info(f"[RoutingService] Optimizing route order for {len(places)} places")
            
            if len(places) < 3:
                return places
            
            n = len(places)
            distance_matrix = [[0] * n for _ in range(n)]
            
            for i in range(n):
                for j in range(n):
                    if i != j:
                        to_mode = places[j].get('transport_mode', 'pedestrian')
                        
                        route_info = await self._get_route_between_two_points(
                            places[i]['coordinates'],
                            places[j]['coordinates'],
                            to_mode
                        )
                        distance_matrix[i][j] = int(route_info.get('duration', 999999))
            
            optimal_order = solve_vrp_dynamic(
                matrix=distance_matrix,
                time_limit_minutes=999,
                return_to_start=False,
                end_point_index=None,
                pace='balanced',
                strictness=5
            )
            
            ordered_places = [places[i] for i in optimal_order if i < len(places)]
            
            logger.info(f"[RoutingService] ✅ Optimization complete. Order: {[p['name'] for p in ordered_places]}")
            return ordered_places
            
        except Exception as e:
            logger.error(f"[RoutingService] ❌ Error optimizing route: {str(e)}")
            return places
    
    async def _build_route_segments(self, places: List[Dict]) -> List[RouteSegment]:
        segments = []
        
        for i in range(len(places) - 1):
            from_place = places[i]
            to_place = places[i + 1]
            
            mode = to_place.get('transport_mode', 'pedestrian')
            
            logger.info(f"[RoutingService] Segment {i+1}: {from_place['name']} -> {to_place['name']} ({mode})")
            
            route_info = await self._get_route_between_two_points(
                from_place['coordinates'],
                to_place['coordinates'],
                mode
            )
            
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
        try:
            mode_config = ROUTING_MODES.get(mode, ROUTING_MODES['pedestrian'])
            yandex_mode = mode_config['yandex_mode']
            
            logger.debug(f"[RoutingService] Requesting {yandex_mode} route from {from_coords} to {to_coords}")
            
            route_data = await self.yandex_api.get_route(
                origin=from_coords,
                destination=to_coords,
                mode=yandex_mode
            )
            
            if not route_data:
                logger.warning(f"[RoutingService] No route data for {yandex_mode} mode")
                return {
                    'geometry': [from_coords, to_coords],
                    'distance': self._calculate_haversine_distance(from_coords, to_coords),
                    'duration': 0
                }
            
            geometry = route_data.get('geometry', [from_coords, to_coords])
            distance = route_data.get('distance', 0)
            duration = route_data.get('duration', 0)
            
            logger.debug(f"[RoutingService] Route received: {distance}m, {duration}s")
            
            return {
                'geometry': geometry,
                'distance': distance,
                'duration': duration
            }
            
        except Exception as e:
            logger.error(f"[RoutingService] Error getting route: {str(e)}")
            return {
                'geometry': [from_coords, to_coords],
                'distance': self._calculate_haversine_distance(from_coords, to_coords),
                'duration': 0
            }
    
    def _calculate_haversine_distance(self, coord1: List[float], coord2: List[float]) -> float:
        from math import radians, sin, cos, sqrt, atan2
        
        lon1, lat1 = coord1
        lon2, lat2 = coord2
        
        R = 6371000
        
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        delta_phi = radians(lat2 - lat1)
        delta_lambda = radians(lon2 - lon1)
        
        a = sin(delta_phi/2)**2 + cos(phi1) * cos(phi2) * sin(delta_lambda/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        distance = R * c
        return distance
    
    def _place_to_dict(self, place: Dict, index: int) -> Dict:
        return {
            'id': place.get('id', index),
            'name': place.get('name', f'Place {index + 1}'),
            'coordinates': place.get('coordinates', [0, 0]),
            'address': place.get('address', ''),
            'type': place.get('type', 'must_visit'),
            'category': place.get('category', ''),
            'transport_mode': place.get('transport_mode', 'pedestrian'),
            'order': index + 1,
            'marker': {
                'number': index + 1,
                'color': '#2E86DE' if place.get('type') == 'must_visit' else '#FFA502'
            }
        }
    
    async def get_place_info(self, coordinates: List[float]) -> Dict:
        try:
            address_data = await self.yandex_api.reverse_geocode(coordinates)
            
            return {
                'success': True,
                'coordinates': coordinates,
                'address': address_data.get('address', 'Адрес неизвестен'),
                'details': address_data.get('details', {})
            }
        except Exception as e:
            logger.error(f"[RoutingService] Error getting place info: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }


_routing_service = None

def get_routing_service(api_key: str) -> RoutingService:
    global _routing_service
    if _routing_service is None:
        _routing_service = RoutingService(api_key)
    return _routing_service