# ========== main.py ==========
"""
Intelligent Trails Backend - ИСПРАВЛЕННАЯ ВЕРСИЯ
✅ Исправлена логика построения маршрута и выбора мест
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict
import logging
import os
from dotenv import load_dotenv

from routing_service import get_routing_service
import yandex_api as yandex_api_module

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Intelligent Trails API",
    description="✅ ИСПРАВЛЕННАЯ ВЕРСИЯ: Правильная логика маршрута",
    version="3.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
routing_service = get_routing_service(YANDEX_API_KEY) if YANDEX_API_KEY else None

COORDINATE_CORRECTIONS = {
    (56.326797, 44.006516): [44.005383, 56.326797],
    (44.006516, 56.326797): [44.005383, 56.326797],
    (55.7558, 37.6173): [37.6173, 55.7558],
    (37.6173, 55.7558): [37.6173, 55.7558],
    (59.9343, 30.3351): [30.3351, 59.9343],
    (30.3351, 59.9343): [30.3351, 59.9343]
}

def correct_coordinates(coords: List[float]) -> List[float]:
    if len(coords) != 2:
        return coords
    
    lat, lon = coords[0], coords[1]
    
    for (problem_lat, problem_lon), correct_coords in COORDINATE_CORRECTIONS.items():
        if abs(lat - problem_lat) < 0.1 and abs(lon - problem_lon) < 0.1:
            logger.info(f"✅ Corrected coordinates: [{lat}, {lon}] -> {correct_coords}")
            return correct_coords
    
    if (lat > 90 or lon > 180) and (coords[1] <= 90 and coords[0] <= 180):
        corrected = [coords[1], coords[0]]
        logger.info(f"✅ Auto-corrected coordinates: {coords} -> {corrected}")
        return corrected
    
    return coords

@app.get("/")
async def root():
    return {
        "service": "Intelligent Trails API", 
        "version": "3.2.0",
        "status": "running",
        "features": ["✅ ИСПРАВЛЕННАЯ ВЕРСИЯ: Правильная логика маршрута"]
    }

@app.post("/api/route/build")
async def build_route(request: dict = Body(...)):
    """✅ ИСПРАВЛЕННАЯ ВЕРСИЯ: Правильная логика построения маршрута"""
    try:
        if not YANDEX_API_KEY or not routing_service:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        logger.info(f"📦 Request received: {request}")
        
        if 'start_point' in request:
            request['start_point'] = correct_coordinates(request['start_point'])
            logger.info(f"📍 Corrected start_point: {request['start_point']}")
        
        # Определяем формат запроса
        if 'start_point' in request:
            places_data = await convert_new_format_to_places(request)
        else:
            places_data = request.get('places', [])
        
        if not places_data or len(places_data) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 places")
        
        logger.info(f"🎯 Building route for {len(places_data)} places")
        
        # Строим маршрут
        route_data = await routing_service.build_route(
            places=places_data,
            optimize=request.get('optimize', True)
        )
        
        if not route_data.get('success'):
            raise HTTPException(status_code=400, detail=route_data.get('error'))
        
        logger.info(f"✅ Route built: {len(route_data['places'])} places, {route_data['summary']['total_distance_km']:.1f} km")
        return route_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}", exc_info=True)
        raise HTTPException(statuscode=500, detail=str(e))

async def convert_new_format_to_places(request: dict) -> List[dict]:
    """✅ ИСПРАВЛЕННАЯ ВЕРСИЯ: Правильная логика выбора мест"""
    places = []
    start_point = request.get('start_point', [])
    
    if not start_point or len(start_point) != 2:
        raise ValueError("❌ start_point must be [lon, lat]")
    
    # 1. НАЧАЛЬНАЯ ТОЧКА
    places.append({
        'name': 'Старт',
        'coordinates': start_point,
        'type': 'must_visit',
        'transport_mode': 'pedestrian',
        'is_start': True
    })
    logger.info(f"✅ 1. Start point: {start_point}")
    
    # 2. КАТЕГОРИИ - ИСПРАВЛЕННАЯ ЛОГИКА
    categories = request.get('categories', [])
    
    if categories:
        logger.info(f"🔍 Processing {len(categories)} categories")
        
        for i, cat_req in enumerate(categories):
            category = cat_req.get('category') if isinstance(cat_req, dict) else str(cat_req)
            transport_mode = cat_req.get('transport_mode', 'pedestrian') if isinstance(cat_req, dict) else 'pedestrian'
            
            logger.info(f"🔍 {i+1}. Searching '{category}' near {start_point}")
            
            try:
                # ✅ ИЩЕМ МЕСТО ДЛЯ КАТЕГОРИИ (ближайшее к стартовой точке)
                search_results = await yandex_api_module.search_places(
                    center_coords=start_point,  # Всегда ищем от стартовой точки
                    categories=[category],
                    radius_m=5000
                )
                
                if search_results:
                    # ✅ ВЫБИРАЕМ САМОЕ БЛИЖАЙШЕЕ МЕСТО (не первое из списка)
                    best_place = min(search_results, key=lambda x: x['distance'])
                    
                    place_data = {
                        'name': best_place.get('name', category),
                        'coordinates': best_place.get('coords', start_point),
                        'address': best_place.get('address', ''),
                        'type': 'must_visit',
                        'category': category,
                        'transport_mode': transport_mode,
                        'is_category': True,
                        'distance_from_start': best_place.get('distance', 0)
                    }
                    
                    places.append(place_data)
                    logger.info(f"✅ {i+1}. Found: '{place_data['name']}' at {place_data['coordinates']} ({best_place['distance']}м)")
                    
                else:
                    logger.warning(f"⚠️ No places found for '{category}'")
                    places.append({
                        'name': f'{category} (не найдено)',
                        'coordinates': start_point,
                        'type': 'must_visit',
                        'category': category,
                        'transport_mode': transport_mode,
                        'is_fallback': True
                    })
                    
            except Exception as e:
                logger.error(f"❌ Error searching '{category}': {str(e)}")
                places.append({
                    'name': f'{category} (ошибка)',
                    'coordinates': start_point,
                    'type': 'must_visit',
                    'category': category,
                    'transport_mode': transport_mode,
                    'is_error': True
                })
    
    # 3. КОНЕЧНАЯ ТОЧКА - ТОЛЬКО ЕСЛИ ЕСТЬ КУДА ВОЗВРАЩАТЬСЯ
    if request.get('return_to_start', False) and len(places) > 1:
        places.append({
            'name': 'Возврат к старту',
            'coordinates': start_point,
            'type': 'must_visit',
            'transport_mode': 'pedestrian',
            'is_return': True
        })
        logger.info(f"✅ Added return to start")
    
    logger.info(f"✅ Final places count: {len(places)}")
    for i, place in enumerate(places):
        place_type = ' | '.join([k for k, v in place.items() if v is True and k.startswith('is_')])
        logger.info(f"  {i+1}. '{place['name']}' at {place['coordinates']} [{place_type}]")
    
    return places

@app.post("/api/search/places")
async def search_places_endpoint(request: dict = Body(...)):
    """✅ ЭНДПОИНТ ДЛЯ ПОИСКА МЕСТ БЕЗ ПОСТРОЕНИЯ МАРШРУТА"""
    try:
        center_coords = request.get('center_coords')
        categories = request.get('categories', [])
        radius_m = request.get('radius_m', 5000)
        
        if not center_coords or len(center_coords) != 2:
            raise HTTPException(status_code=400, detail="Invalid center_coords")
        
        if not categories:
            raise HTTPException(status_code=400, detail="Categories list is empty")
        
        # Корректируем координаты
        center_coords = correct_coordinates(center_coords)
        
        logger.info(f"🔍 Search request: {categories} near {center_coords}")
        
        places = await yandex_api_module.search_places(center_coords, categories, radius_m)
        
        # Группируем по категориям
        places_by_category = {}
        for place in places:
            category = place['category']
            if category not in places_by_category:
                places_by_category[category] = []
            places_by_category[category].append(place)
        
        return {
            "success": True,
            "places": places_by_category,
            "total_count": len(places)
        }
        
    except Exception as e:
        logger.error(f"[API] ❌ Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)