import os
import asyncio
import httpx
import math
from typing import List, Dict, Any, Tuple

# Константы для совместимости
YANDEX_API_KEY = "dummy" 
MAX_POINTS_FOR_MATRIX = 20 

# --- ИСПРАВЛЕНИЕ: Используем главный сервер Overpass (Германия) ---
# Он гораздо надежнее и стабильнее, чем interpreters.node...
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# ------------------------------------------------------------------

async def search_places(center_coords: List[float], categories: List[str], radius_m: int = 2000) -> List[Dict[str, Any]]:
    
    osm_tags = {
        "кафе": '["amenity"="cafe"]',
        "парк": '["leisure"="park"]',
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
            # Ищем узлы и полигоны (центры)
            query_parts.append(f'node{tag}(around:{radius_m},{lat},{lon});')
            # Для way используем 'out center' ниже, чтобы получить координаты
            query_parts.append(f'way{tag}(around:{radius_m},{lat},{lon});')

    full_query = f"""
    [out:json][timeout:25];
    (
      {''.join(query_parts)}
    );
    out center 20; 
    """
    # out center 20 -> вернуть 20 случайных объектов из найденных

    print(f"--- Requesting OSM Overpass ({OVERPASS_URL}) ---")
    
    async with httpx.AsyncClient(verify=False) as client: # verify=False на случай проблем с SSL сертификатами
        try:
            response = await client.post(OVERPASS_URL, data=full_query, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                elements = data.get("elements", [])
                
                print(f"OSM found {len(elements)} elements")
                
                for el in elements:
                    tags = el.get("tags", {})
                    # Часто название бывает на русском в name:ru
                    name = tags.get("name:ru") or tags.get("name") or tags.get("brand")
                    
                    if not name: continue

                    if "lat" in el and "lon" in el:
                        p_lat, p_lon = el["lat"], el["lon"]
                    elif "center" in el:
                        p_lat, p_lon = el["center"]["lat"], el["center"]["lon"]
                    else:
                        continue
                        
                    # Пытаемся определить категорию обратно
                    cat_found = "место"
                    tags_str = str(tags)
                    if "cafe" in tags_str: cat_found = "кафе"
                    elif "park" in tags_str: cat_found = "парк"
                    elif "museum" in tags_str: cat_found = "музей"
                    
                    places.append({
                        "name": name,
                        "coords": [p_lat, p_lon],
                        "category": cat_found
                    })
            else:
                print(f"OSM Error: {response.status_code} {response.text[:100]}")
                
        except Exception as e:
            print(f"OSM Connection Exception: {e}")

    unique = {}
    for p in places:
        unique[p['name']] = p
    
    results = list(unique.values())
    print(f"--- Total unique places: {len(results)} ---")
    return results[:MAX_POINTS_FOR_MATRIX]

# --- ГЕОМЕТРИЯ ---

def calculate_geo_distance(c1, c2):
    lat1, lon1 = c1
    lat2, lon2 = c2
    R = 6371000 
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return int(R * c)

def smart_filter(start, points, limit, priority_categories=None):
    if len(points) <= limit: return points
    points.sort(key=lambda p: calculate_geo_distance(start['coords'], p['coords']))
    return points[:limit]

async def get_routing_matrix(points: List[Dict[str, Any]], mode: str) -> Tuple[List[List[int]], float]:
    n = len(points)
    matrix = [[0]*n for _ in range(n)]
    WALKING_SPEED = 1.25 
    TORTUOSITY = 1.35
    print(f"--- Building Matrix for {n} points ---")
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_meters = calculate_geo_distance(points[i]['coords'], points[j]['coords'])
                duration_seconds = int((dist_meters * TORTUOSITY) / WALKING_SPEED)
                matrix[i][j] = duration_seconds
    return matrix, 1.0
