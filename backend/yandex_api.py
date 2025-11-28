import os
import asyncio
import httpx
import math
from typing import List, Dict, Any, Tuple, Optional

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY", "")
MAX_POINTS_FOR_MATRIX = 20
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSRM_URL = "https://router.project-osrm.org/route/v1"


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


def convert_mode_to_osrm(mode: str) -> str:
    """
    Конвертация режимов в профили OSRM
    OSRM поддерживает: car, bike, foot
    """
    mode_map = {
        'pedestrian': 'foot',
        'walking': 'foot',
        'auto': 'car',
        'driving': 'car',
        'bicycle': 'bike',
        'bike': 'bike',
        'masstransit': 'car'  # fallback
    }

    
    osrm_profile = mode_map.get(mode, 'foot')
    print(f"[MODE CONVERT] {mode} -> {osrm_profile}")
    return osrm_profile


async def build_route(waypoints: List[List[float]], mode: str) -> Optional[Dict[str, Any]]:
    """
    Построение маршрута через OSRM (Open Source Routing Machine)
    ПОЛНОСТЬЮ БЕСПЛАТНЫЙ, использует данные OpenStreetMap
    """
    if len(waypoints) < 2:
        print("[OSRM ROUTE] ERROR: Need at least 2 waypoints")
        return None
    
    try:
        osrm_profile = convert_mode_to_osrm(mode)
        
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            # OSRM формат: lon,lat (как у Yandex)
            coordinates = ';'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
            
            url = f"{OSRM_URL}/{osrm_profile}/{coordinates}"
            
            params = {
                'overview': 'full',
                'geometries': 'geojson',
                'steps': 'false'
            }
            
            print(f"\n{'='*60}")
            print(f"[OSRM ROUTE] REQUEST")
            print(f"  URL: {url[:100]}...")
            print(f"  Waypoints: {len(waypoints)}")
            print(f"  Mode (original): {mode}")
            print(f"  Profile (OSRM): {osrm_profile}")
            print(f"{'='*60}\n")
            
            response = await client.get(url, params=params)
            
            print(f"[OSRM ROUTE] Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if 'routes' in data and len(data['routes']) > 0:
                    route = data['routes'][0]
                    
                    # Получаем geometry из GeoJSON
                    if 'geometry' in route and 'coordinates' in route['geometry']:
                        coords = route['geometry']['coordinates']
                        # OSRM возвращает [lon, lat], конвертируем в [lat, lon]
                        geometry = [[c[1], c[0]] for c in coords]
                        
                        duration = route.get('duration', 0)
                        distance = route.get('distance', 0)
                        
                        print(f"\n{'='*60}")
                        print(f"[OSRM ROUTE] ✓ SUCCESS")
                        print(f"  Geometry points: {len(geometry)}")
                        print(f"  Distance: {int(distance)}m")
                        print(f"  Duration: {int(duration)}s")
                        print(f"{'='*60}\n")
                        
                        return {
                            'geometry': geometry,
                            'duration_seconds': int(duration),
                            'distance_meters': int(distance)
                        }
                    else:
                        print(f"[OSRM ROUTE] ERROR: No geometry in response")
                        return None
                else:
                    print(f"[OSRM ROUTE] ERROR: No routes in response")
                    print(f"[OSRM ROUTE] Response: {data}")
                    return None
            else:
                error_text = response.text[:1000]
                print(f"\n{'='*60}")
                print(f"[OSRM ROUTE] ✗ API ERROR")
                print(f"  Status: {response.status_code}")
                print(f"  Response: {error_text}")
                print(f"{'='*60}\n")
                return None
                
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"[OSRM ROUTE] ✗ EXCEPTION")
        print(f"  Type: {type(e).__name__}")
        print(f"  Message: {str(e)}")
        print(f"{'='*60}\n")
        return None


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
