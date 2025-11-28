"""Гибридный сервис маршрутизации с несколькими бесплатными API

Использует:
- OSRM (полностью бесплатный, но ограниченный)
- GraphHopper (500 запросов/день)
- Mapbox (100,000 запросов/месяц)

С автоматическим fallback и кешированием
"""

import os
import asyncio
import httpx
import hashlib
import json
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

# API Keys из .env
GRAPHHOPPER_API_KEY = os.getenv("GRAPHHOPPER_API_KEY", "")
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY", "")

# URLs
OSRM_URL = "https://router.project-osrm.org/route/v1"
GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route"
MAPBOX_URL = "https://api.mapbox.com/directions/v5/mapbox"

# Простой in-memory кеш (в продакшене использовать Redis)
ROUTE_CACHE: Dict[str, Tuple[Dict, float]] = {}
CACHE_TTL_SECONDS = 86400 * 30  # 30 дней

# Статистика использования API
API_USAGE_STATS = {
    'osrm': {'success': 0, 'errors': 0},
    'graphhopper': {'success': 0, 'errors': 0},
    'mapbox': {'success': 0, 'errors': 0}
}


def get_cache_key(waypoints: List[List[float]], mode: str, service: str) -> str:
    """Генерация ключа кеша для маршрута"""
    waypoints_str = json.dumps(waypoints, sort_keys=True)
    data = f"{service}:{mode}:{waypoints_str}"
    return hashlib.md5(data.encode()).hexdigest()


def get_cached_route(cache_key: str) -> Optional[Dict[str, Any]]:
    """Получение маршрута из кеша"""
    if cache_key in ROUTE_CACHE:
        route_data, timestamp = ROUTE_CACHE[cache_key]
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            print(f"[CACHE] ✓ Hit for key {cache_key[:8]}...")
            return route_data
        else:
            # Удаляем устаревший кеш
            del ROUTE_CACHE[cache_key]
    return None


def save_to_cache(cache_key: str, route_data: Dict[str, Any]):
    """Сохранение маршрута в кеш"""
    ROUTE_CACHE[cache_key] = (route_data, time.time())
    print(f"[CACHE] ✓ Saved key {cache_key[:8]}... (total cached: {len(ROUTE_CACHE)})")


def convert_mode_to_profile(mode: str, service: str) -> str:
    """Конвертация режима транспорта в профиль конкретного API"""
    
    # OSRM profiles: foot, driving, bike
    osrm_map = {
        'pedestrian': 'foot',
        'walking': 'foot',
        'auto': 'driving',
        'driving': 'driving',
        'bicycle': 'bike',
        'masstransit': 'driving'  # fallback
    }
    
    # GraphHopper profiles: foot, car, bike
    graphhopper_map = {
        'pedestrian': 'foot',
        'walking': 'foot',
        'auto': 'car',
        'driving': 'car',
        'bicycle': 'bike',
        'masstransit': 'car'  # fallback
    }
    
    # Mapbox profiles: walking, driving, cycling, driving-traffic
    mapbox_map = {
        'pedestrian': 'walking',
        'walking': 'walking',
        'auto': 'driving-traffic',  # С учетом пробок!
        'driving': 'driving-traffic',
        'bicycle': 'cycling',
        'masstransit': 'driving'  # fallback
    }
    
    if service == 'osrm':
        return osrm_map.get(mode, 'foot')
    elif service == 'graphhopper':
        return graphhopper_map.get(mode, 'foot')
    elif service == 'mapbox':
        return mapbox_map.get(mode, 'walking')
    
    return 'foot'


async def build_route_osrm(
    waypoints: List[List[float]], 
    mode: str
) -> Optional[Dict[str, Any]]:
    """Построение маршрута через OSRM (полностью бесплатный)"""
    
    if len(waypoints) < 2:
        return None
    
    try:
        profile = convert_mode_to_profile(mode, 'osrm')
        
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            # OSRM: lon,lat формат
            coordinates = ';'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
            url = f"{OSRM_URL}/{profile}/{coordinates}"
            
            params = {
                'overview': 'full',
                'geometries': 'geojson',
                'steps': 'false',
                'alternatives': 'false'
            }
            
            print(f"[OSRM] → {profile} | {len(waypoints)} points")
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                if 'routes' in data and len(data['routes']) > 0:
                    route = data['routes'][0]
                    
                    if 'geometry' in route and 'coordinates' in route['geometry']:
                        coords = route['geometry']['coordinates']
                        # Конвертируем [lon, lat] → [lat, lon]
                        geometry = [[c[1], c[0]] for c in coords]
                        
                        duration = route.get('duration', 0)
                        distance = route.get('distance', 0)
                        
                        result = {
                            'geometry': geometry,
                            'duration_seconds': int(duration),
                            'distance_meters': int(distance),
                            'service': 'osrm'
                        }
                        
                        API_USAGE_STATS['osrm']['success'] += 1
                        print(f"[OSRM] ✓ {int(distance)}m, {int(duration)}s")
                        return result
            
            API_USAGE_STATS['osrm']['errors'] += 1
            return None
                
    except Exception as e:
        API_USAGE_STATS['osrm']['errors'] += 1
        print(f"[OSRM] ✗ {type(e).__name__}: {str(e)[:100]}")
        return None


async def build_route_graphhopper(
    waypoints: List[List[float]], 
    mode: str
) -> Optional[Dict[str, Any]]:
    """Построение маршрута через GraphHopper (500 запросов/день)"""
    
    if not GRAPHHOPPER_API_KEY:
        print("[GRAPHHOPPER] ⚠ API key not configured")
        return None
    
    if len(waypoints) < 2:
        return None
    
    try:
        profile = convert_mode_to_profile(mode, 'graphhopper')
        
        async with httpx.AsyncClient(timeout=30) as client:
            # GraphHopper: lat,lon формат в query параметрах
            params = {
                'key': GRAPHHOPPER_API_KEY,
                'vehicle': profile,
                'locale': 'ru',
                'points_encoded': 'false',
                'elevation': 'false'
            }
            
            # Добавляем точки как point параметры
            for wp in waypoints:
                params[f'point'] = f"{wp[0]},{wp[1]}"
            
            print(f"[GRAPHHOPPER] → {profile} | {len(waypoints)} points")
            
            response = await client.get(GRAPHHOPPER_URL, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                if 'paths' in data and len(data['paths']) > 0:
                    path = data['paths'][0]
                    
                    if 'points' in path and 'coordinates' in path['points']:
                        coords = path['points']['coordinates']
                        # GraphHopper возвращает [lon, lat], конвертируем → [lat, lon]
                        geometry = [[c[1], c[0]] for c in coords]
                        
                        duration = path.get('time', 0) / 1000  # миллисекунды → секунды
                        distance = path.get('distance', 0)
                        
                        result = {
                            'geometry': geometry,
                            'duration_seconds': int(duration),
                            'distance_meters': int(distance),
                            'service': 'graphhopper'
                        }
                        
                        API_USAGE_STATS['graphhopper']['success'] += 1
                        print(f"[GRAPHHOPPER] ✓ {int(distance)}m, {int(duration)}s")
                        return result
            
            elif response.status_code == 429:
                print(f"[GRAPHHOPPER] ⚠ Rate limit exceeded (500/day)")
            
            API_USAGE_STATS['graphhopper']['errors'] += 1
            return None
                
    except Exception as e:
        API_USAGE_STATS['graphhopper']['errors'] += 1
        print(f"[GRAPHHOPPER] ✗ {type(e).__name__}: {str(e)[:100]}")
        return None


async def build_route_mapbox(
    waypoints: List[List[float]], 
    mode: str
) -> Optional[Dict[str, Any]]:
    """Построение маршрута через Mapbox (100,000 запросов/месяц)"""
    
    if not MAPBOX_API_KEY:
        print("[MAPBOX] ⚠ API key not configured")
        return None
    
    if len(waypoints) < 2:
        return None
    
    try:
        profile = convert_mode_to_profile(mode, 'mapbox')
        
        async with httpx.AsyncClient(timeout=30) as client:
            # Mapbox: lon,lat формат в URL
            coordinates = ';'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
            url = f"{MAPBOX_URL}/{profile}/{coordinates}"
            
            params = {
                'access_token': MAPBOX_API_KEY,
                'geometries': 'geojson',
                'overview': 'full',
                'steps': 'false'
            }
            
            print(f"[MAPBOX] → {profile} | {len(waypoints)} points")
            
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                if 'routes' in data and len(data['routes']) > 0:
                    route = data['routes'][0]
                    
                    if 'geometry' in route and 'coordinates' in route['geometry']:
                        coords = route['geometry']['coordinates']
                        # Mapbox возвращает [lon, lat], конвертируем → [lat, lon]
                        geometry = [[c[1], c[0]] for c in coords]
                        
                        duration = route.get('duration', 0)
                        distance = route.get('distance', 0)
                        
                        result = {
                            'geometry': geometry,
                            'duration_seconds': int(duration),
                            'distance_meters': int(distance),
                            'service': 'mapbox'
                        }
                        
                        API_USAGE_STATS['mapbox']['success'] += 1
                        print(f"[MAPBOX] ✓ {int(distance)}m, {int(duration)}s")
                        return result
            
            elif response.status_code == 429:
                print(f"[MAPBOX] ⚠ Rate limit exceeded")
            
            API_USAGE_STATS['mapbox']['errors'] += 1
            return None
                
    except Exception as e:
        API_USAGE_STATS['mapbox']['errors'] += 1
        print(f"[MAPBOX] ✗ {type(e).__name__}: {str(e)[:100]}")
        return None


def get_service_priority(mode: str) -> List[str]:
    """Определение приоритета сервисов в зависимости от режима транспорта"""
    
    # Пешеходные маршруты - OSRM вполне хорош и бесплатен
    if mode in ['pedestrian', 'walking']:
        priority = ['osrm', 'graphhopper', 'mapbox']
    
    # Автомобильные - Mapbox лучше (учитывает пробки), но ограничен
    elif mode in ['auto', 'driving']:
        priority = ['mapbox', 'graphhopper', 'osrm']
    
    # Велосипед - GraphHopper специализируется
    elif mode == 'bicycle':
        priority = ['graphhopper', 'osrm', 'mapbox']
    
    # Общественный транспорт - пока нет реализации, fallback на авто
    elif mode == 'masstransit':
        priority = ['mapbox', 'graphhopper', 'osrm']
    
    else:
        priority = ['osrm', 'graphhopper', 'mapbox']
    
    return priority


async def build_route(
    waypoints: List[List[float]], 
    mode: str,
    use_cache: bool = True
) -> Optional[Dict[str, Any]]:
    """Главная функция построения маршрута с автоматическим fallback
    
    Args:
        waypoints: Список координат [[lat, lon], ...]
        mode: Режим транспорта (pedestrian, auto, bicycle, masstransit)
        use_cache: Использовать ли кеширование
    
    Returns:
        Dict с ключами: geometry, duration_seconds, distance_meters, service
        или None если все сервисы недоступны
    """
    
    if len(waypoints) < 2:
        print("[ROUTING] ✗ Need at least 2 waypoints")
        return None
    
    print(f"\n{'='*60}")
    print(f"[ROUTING] Building route: {len(waypoints)} points, mode={mode}")
    print(f"{'='*60}")
    
    # Проверяем кеш
    if use_cache:
        for service in ['osrm', 'graphhopper', 'mapbox']:
            cache_key = get_cache_key(waypoints, mode, service)
            cached = get_cached_route(cache_key)
            if cached:
                print(f"[ROUTING] ✓ Returning cached route from {service}")
                return cached
    
    # Получаем приоритет сервисов для данного режима
    service_priority = get_service_priority(mode)
    
    print(f"[ROUTING] Service priority: {' → '.join(service_priority)}")
    
    # Пробуем сервисы по порядку приоритета
    for service in service_priority:
        try:
            result = None
            
            if service == 'osrm':
                result = await build_route_osrm(waypoints, mode)
            elif service == 'graphhopper' and GRAPHHOPPER_API_KEY:
                result = await build_route_graphhopper(waypoints, mode)
            elif service == 'mapbox' and MAPBOX_API_KEY:
                result = await build_route_mapbox(waypoints, mode)
            
            if result:
                # Сохраняем в кеш
                if use_cache:
                    cache_key = get_cache_key(waypoints, mode, service)
                    save_to_cache(cache_key, result)
                
                print(f"[ROUTING] ✓ SUCCESS via {service}")
                print(f"{'='*60}\n")
                return result
            
        except Exception as e:
            print(f"[ROUTING] ✗ {service} failed: {e}")
            continue
    
    # Все сервисы недоступны
    print(f"[ROUTING] ✗ ALL SERVICES FAILED")
    print(f"{'='*60}\n")
    return None


def get_usage_stats() -> Dict[str, Any]:
    """Получить статистику использования API"""
    total_success = sum(s['success'] for s in API_USAGE_STATS.values())
    total_errors = sum(s['errors'] for s in API_USAGE_STATS.values())
    
    return {
        'services': API_USAGE_STATS,
        'total': {
            'success': total_success,
            'errors': total_errors,
            'success_rate': round(total_success / max(total_success + total_errors, 1) * 100, 2)
        },
        'cache': {
            'size': len(ROUTE_CACHE),
            'ttl_days': CACHE_TTL_SECONDS / 86400
        }
    }


def clear_cache():
    """Очистить кеш маршрутов"""
    global ROUTE_CACHE
    old_size = len(ROUTE_CACHE)
    ROUTE_CACHE = {}
    print(f"[CACHE] Cleared {old_size} entries")
