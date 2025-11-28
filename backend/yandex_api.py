import os
import asyncio
import httpx
import math
from typing import List, Dict, Any, Tuple, Optional

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY", "")
MAX_POINTS_FOR_MATRIX = 20
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
YANDEX_ROUTER_URL = "https://api.routing.yandex.net/v2/route"


async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 2000) -> List[Dict[str, Any]]:
    """Поиск мест через OSM Overpass API"""
    osm_tags = {
        "кафе": '["amenity"="cafe"]',
        "парк": '["leisure"="park"]',
        "сквер": '["leisure"="garden"]',
        "музей": '["tourism"="museum"]',
        "памятник": '["historic"="memorial"]',
        "ресторан": '["amenity"="restaurant"]',
        "бар": '["amenity"="bar"]',
        "магазин": '["shop"]'
    }

    places = []
    lat, lon = center_coords[0], center_coords[1]

    query_parts = []
    for cat in categories:
        tag = osm_tags.get(cat.lower())
        if tag:
            query_parts.append(f'node{tag}(around:{radius_m},{lat},{lon});')
            query_parts.append(f'way{tag}(around:{radius_m},{lat},{lon});')

    if not query_parts:
        return []

    full_query = f"""
    [out:json][timeout:25];
    (
      {''.join(query_parts)}
    );
    out center 50;
    """

    print(f"[OSM] Requesting from {OVERPASS_URL}")
    
    async with httpx.AsyncClient(verify=False, timeout=20) as client:
        try:
            response = await client.post(OVERPASS_URL, data=full_query)
            
            if response.status_code == 200:
                data = response.json()
                elements = data.get("elements", [])
                
                print(f"[OSM] Found {len(elements)} elements")
                
                for el in elements:
                    tags = el.get("tags", {})
                    name = tags.get("name:ru") or tags.get("name") or tags.get("brand")
                    
                    if not name:
                        continue

                    if "lat" in el and "lon" in el:
                        p_lat, p_lon = el["lat"], el["lon"]
                    elif "center" in el:
                        p_lat, p_lon = el["center"]["lat"], el["center"]["lon"]
                    else:
                        continue
                        
                    cat_found = "место"
                    tags_str = str(tags).lower()
                    if "cafe" in tags_str:
                        cat_found = "кафе"
                    elif "park" in tags_str:
                        cat_found = "парк"
                    elif "garden" in tags_str:
                        cat_found = "сквер"
                    elif "museum" in tags_str:
                        cat_found = "музей"
                    elif "memorial" in tags_str:
                        cat_found = "памятник"
                    elif "restaurant" in tags_str:
                        cat_found = "ресторан"
                    elif "bar" in tags_str:
                        cat_found = "бар"
                    elif "shop" in tags_str:
                        cat_found = "магазин"
                    
                    places.append({
                        "name": name,
                        "coords": [p_lat, p_lon],
                        "category": cat_found,
                        "osm_id": el.get("id"),
                        "type": el.get("type")
                    })
            else:
                print(f"[OSM] Error: {response.status_code}")
                
        except Exception as e:
            print(f"[OSM] Exception: {e}")

    unique = {}
    for p in places:
        key = f"{p['name']}_{p['coords'][0]:.5f}_{p['coords'][1]:.5f}"
        unique[key] = p
    
    results = list(unique.values())
    print(f"[OSM] Total unique places: {len(results)}")
    return results[:50]


def calculate_geo_distance(c1, c2):
    """Геодезическое расстояние (Haversine)"""
    lat1, lon1 = c1
    lat2, lon2 = c2
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return int(R * c)


def point_at_distance(start_coords: List[float], distance_m: int, bearing_deg: float = 0) -> List[float]:
    """Вычислить точку на заданном расстоянии и направлении"""
    lat1, lon1 = start_coords
    R = 6371000
    
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    bearing_rad = math.radians(bearing_deg)
    
    lat2_rad = math.asin(
        math.sin(lat1_rad) * math.cos(distance_m / R) +
        math.cos(lat1_rad) * math.sin(distance_m / R) * math.cos(bearing_rad)
    )
    
    lon2_rad = lon1_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(distance_m / R) * math.cos(lat1_rad),
        math.cos(distance_m / R) - math.sin(lat1_rad) * math.sin(lat2_rad)
    )
    
    return [math.degrees(lat2_rad), math.degrees(lon2_rad)]


def smart_filter(start, points, limit, priority_categories=None):
    """Фильтрация точек по расстоянию"""
    if len(points) <= limit:
        return points
    
    points.sort(key=lambda p: calculate_geo_distance(start['coords'], p['coords']))
    return points[:limit]


async def build_route(waypoints: List[List[float]], mode: str) -> Optional[Dict[str, Any]]:
    """
    ОСНОВНАЯ ФУНКЦИЯ: строит маршрут через Yandex Router API v2
    waypoints: список координат [lat, lon]
    mode: pedestrian, auto, bicycle, masstransit
    """
    if not YANDEX_API_KEY:
        print("[YANDEX ROUTE] No API key, using fallback")
        return build_fallback_route(waypoints, mode)
    
    if len(waypoints) < 2:
        print("[YANDEX ROUTE] Need at least 2 waypoints")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            # Формат для Yandex Router API v2: lon,lat (НЕ lat,lon!)
            waypoints_str = '|'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
            
            params = {
                'apikey': YANDEX_API_KEY,
                'waypoints': waypoints_str,
                'mode': mode
            }
            
            print(f"[YANDEX ROUTE] Requesting {YANDEX_ROUTER_URL}")
            print(f"[YANDEX ROUTE] Waypoints: {len(waypoints)}, mode: {mode}")
            print(f"[YANDEX ROUTE] API Key: {YANDEX_API_KEY[:10]}...")
            
            response = await client.get(YANDEX_ROUTER_URL, params=params)
            
            print(f"[YANDEX ROUTE] Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if 'route' in data:
                    route = data['route']
                    geometry = []
                    
                    # Парсим geometry из Yandex Router API v2
                    if 'legs' in route:
                        for leg in route['legs']:
                            if 'steps' in leg:
                                for step in leg['steps']:
                                    if 'polyline' in step:
                                        polyline_points = step['polyline'].get('points', [])
                                        for point in polyline_points:
                                            # Yandex возвращает [lon, lat], конвертируем в [lat, lon]
                                            geometry.append([point[1], point[0]])
                    
                    # Вычисляем общую длину и время
                    total_duration = sum(
                        leg.get('duration', {}).get('value', 0) 
                        for leg in route.get('legs', [])
                    )
                    total_distance = sum(
                        leg.get('length', {}).get('value', 0) 
                        for leg in route.get('legs', [])
                    )
                    
                    if len(geometry) > 0:
                        print(f"[YANDEX ROUTE] SUCCESS: {len(geometry)} points, {total_distance}m, {total_duration}s")
                        
                        return {
                            'geometry': geometry,
                            'duration_seconds': int(total_duration),
                            'distance_meters': int(total_distance)
                        }
                    else:
                        print(f"[YANDEX ROUTE] Empty geometry in response")
                else:
                    print(f"[YANDEX ROUTE] No 'route' in response: {list(data.keys())}")
            else:
                error_text = response.text[:500]
                print(f"[YANDEX ROUTE] API error {response.status_code}: {error_text}")
                
    except Exception as e:
        print(f"[YANDEX ROUTE] Exception: {type(e).__name__}: {str(e)}")
    
    # Fallback если Yandex не сработал
    print(f"[YANDEX ROUTE] Using fallback")
    return build_fallback_route(waypoints, mode)


def build_fallback_route(waypoints: List[List[float]], mode: str) -> Dict[str, Any]:
    """
    Fallback: прямые линии с интерполяцией
    """
    geometry = []
    total_distance = 0
    
    for i in range(len(waypoints) - 1):
        start = waypoints[i]
        end = waypoints[i + 1]
        
        # Добавляем промежуточные точки
        num_intermediate = 15
        for j in range(num_intermediate + 1):
            t = j / num_intermediate
            lat = start[0] + (end[0] - start[0]) * t
            lon = start[1] + (end[1] - start[1]) * t
            geometry.append([lat, lon])
        
        dist = calculate_geo_distance(start, end)
        total_distance += dist
    
    duration = estimate_time_by_mode(total_distance, mode)
    
    print(f"[ROUTE FALLBACK] {len(geometry)} points, {total_distance}m, {duration}s")
    
    return {
        'geometry': geometry,
        'duration_seconds': duration,
        'distance_meters': total_distance
    }


def estimate_time_by_mode(distance_m: int, mode: str) -> int:
    """Оценка времени по расстоянию и режиму"""
    speeds = {
        'pedestrian': 1.25,
        'auto': 10.0,
        'masstransit': 7.0,
        'bicycle': 4.5
    }
    
    tortuosity = {
        'pedestrian': 1.35,
        'auto': 1.25,
        'masstransit': 1.40,
        'bicycle': 1.30
    }
    
    speed = speeds.get(mode, 1.25)
    tort = tortuosity.get(mode, 1.30)
    
    return int((distance_m * tort) / speed)


async def get_routing_matrix(points: List[Dict[str, Any]], mode: str) -> Tuple[List[List[int]], float]:
    """Построение матрицы времени"""
    n = len(points)
    matrix = [[0]*n for _ in range(n)]
    
    print(f"[MATRIX] Building fallback matrix for {n} points with mode={mode}")
    return generate_fallback_matrix_with_mode(points, mode), 1.0


def generate_fallback_matrix_with_mode(points: List[Dict[str, Any]], mode: str) -> List[List[int]]:
    """Генерация матрицы на основе геометрического расстояния"""
    n = len(points)
    matrix = [[0]*n for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_m = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                matrix[i][j] = estimate_time_by_mode(dist_m, mode)
    
    return matrix


def generate_fallback_matrix(points: List[Dict[str, Any]]) -> List[List[int]]:
    """Обратная совместимость"""
    return generate_fallback_matrix_with_mode(points, 'pedestrian')
