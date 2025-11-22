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
    out center 30;
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
    """
    Вычислить точку на заданном расстоянии и направлении от стартовой
    bearing_deg: направление в градусах (0 = север, 90 = восток)
    """
    lat1, lon1 = start_coords
    R = 6371000  # Радиус Земли в метрах
    
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
    """Фильтрация точек по расстоянию от старта"""
    if len(points) <= limit:
        return points
    
    points.sort(key=lambda p: calculate_geo_distance(start['coords'], p['coords']))
    return points[:limit]


async def get_routing_matrix(points: List[Dict[str, Any]], mode: str) -> Tuple[List[List[int]], float]:
    """Построение матрицы времени между точками используя Yandex Router API"""
    n = len(points)
    matrix = [[0]*n for _ in range(n)]
    
    if not YANDEX_API_KEY or YANDEX_API_KEY == "dummy":
        print("[MATRIX] No Yandex API key, using fallback geometric calculation")
        return generate_fallback_matrix_with_mode(points, mode), 0.5
    
    print(f"[MATRIX] Building for {n} points with mode={mode}")
    
    mode_mapping = {
        'pedestrian': 'walking',
        'auto': 'driving',
        'masstransit': 'transit',
        'bicycle': 'cycling'
    }
    
    yandex_mode = mode_mapping.get(mode, 'walking')
    successful_requests = 0
    total_requests = 0
    
    async with httpx.AsyncClient(verify=False, timeout=10) as client:
        tasks = []
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    tasks.append((i, j, get_single_route_time(
                        client, 
                        points[i]['coords'], 
                        points[j]['coords'], 
                        yandex_mode
                    )))
        
        batch_size = 10
        for batch_start in range(0, len(tasks), batch_size):
            batch = tasks[batch_start:batch_start + batch_size]
            results = await asyncio.gather(*[task[2] for task in batch], return_exceptions=True)
            
            for (i, j, _), result in zip(batch, results):
                total_requests += 1
                if isinstance(result, int) and result > 0:
                    matrix[i][j] = result
                    successful_requests += 1
                else:
                    dist_m = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                    matrix[i][j] = estimate_time_by_mode(dist_m, mode)
            
            await asyncio.sleep(0.1)
    
    success_rate = successful_requests / total_requests if total_requests > 0 else 0
    print(f"[MATRIX] Success rate: {success_rate:.1%} ({successful_requests}/{total_requests})")
    
    if successful_requests == 0:
        print("[MATRIX] All requests failed, using fallback")
        return generate_fallback_matrix_with_mode(points, mode), 0.0
    
    return matrix, success_rate


async def get_single_route_time(client: httpx.AsyncClient, start_coords: List[float], end_coords: List[float], mode: str) -> int:
    """Получить время маршрута между двумя точками через Yandex Router API"""
    try:
        params = {
            'apikey': YANDEX_API_KEY,
            'waypoints': f"{start_coords[1]},{start_coords[0]}|{end_coords[1]},{end_coords[0]}",
            'mode': mode
        }
        
        response = await client.get(YANDEX_ROUTER_URL, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if 'route' in data and 'legs' in data['route']:
                total_duration = sum(leg.get('duration', {}).get('value', 0) for leg in data['route']['legs'])
                return int(total_duration)
        
        return -1
    except Exception:
        return -1


def estimate_time_by_mode(distance_m: int, mode: str) -> int:
    """Оценка времени по расстоянию и режиму передвижения"""
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


def generate_fallback_matrix_with_mode(points: List[Dict[str, Any]], mode: str) -> List[List[int]]:
    """Генерация матрицы на основе геометрического расстояния с учетом режима"""
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


async def get_route_geometry(points: List[List[float]], mode: str) -> Optional[List[List[float]]]:
    """Получить геометрию (точки) реального маршрута для отрисовки на карте"""
    if not YANDEX_API_KEY or len(points) < 2:
        return None
    
    mode_mapping = {
        'pedestrian': 'walking',
        'auto': 'driving',
        'masstransit': 'transit',
        'bicycle': 'cycling'
    }
    
    yandex_mode = mode_mapping.get(mode, 'walking')
    waypoints_str = "|".join([f"{p[1]},{p[0]}" for p in points])
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            params = {
                'apikey': YANDEX_API_KEY,
                'waypoints': waypoints_str,
                'mode': yandex_mode
            }
            
            response = await client.get(YANDEX_ROUTER_URL, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if 'route' in data and 'legs' in data['route']:
                    geometry = []
                    for leg in data['route']['legs']:
                        for step in leg.get('steps', []):
                            polyline = step.get('polyline', {}).get('points', [])
                            for point in polyline:
                                geometry.append([point[0], point[1]])
                    
                    return geometry if geometry else None
        
        return None
    except Exception as e:
        print(f"[GEOMETRY] Error: {e}")
        return None
