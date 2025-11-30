# ========== main.py ==========
"""
Intelligent Trails Backend - ФИНАЛЬНАЯ ВЕРСИЯ
✅ Исправлены дубликаты + возвращает 5 мест для выбора на фронте
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
    description="✅ ФИНАЛЬНАЯ ВЕРСИЯ: Исправлены дубликаты + 5 мест для выбора",
    version="3.1.0"
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
        "version": "3.1.0",
        "status": "running",
        "features": ["✅ ФИНАЛЬНАЯ ВЕРСИЯ: Исправлены дубликаты + 5 мест для выбора"]
    }

@app.post("/api/route/build")
async def build_route(request: dict = Body(...)):
    """✅ ФИНАЛЬНАЯ ВЕРСИЯ: Возвращает альтернативные места для выбора"""
    try:
        if not YANDEX_API_KEY or not routing_service:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        logger.info(f"📦 Request received: {request}")
        
        if 'start_point' in request:
            request['start_point'] = correct_coordinates(request['start_point'])
            logger.info(f"📍 Corrected start_point: {request['start_point']}")
        
        if 'start_point' in request:
            route_data = await build_route_with_alternatives(request)
        else:
            places_data = request.get('places', [])
            if not places_data or len(places_data) < 2:
                raise HTTPException(status_code=400, detail="Need at least 2 places")
            
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
        raise HTTPException(status_code=500, detail=str(e))

async def build_route_with_alternatives(request: dict) -> Dict:
    """✅ ФИНАЛЬНАЯ ВЕРСИЯ: Строит маршрут и возвращает альтернативные места"""
    start_point = request.get('start_point', [])
    categories = request.get('categories', [])
    
    if not start_point or len(start_point) != 2:
        raise ValueError("❌ start_point must be [lon, lat]")
    
    # 1. ПОИСК ВСЕХ МЕСТ ДЛЯ КАЖДОЙ КАТЕГОРИИ
    all_category_places = {}
    current_center = start_point
    
    for i, cat_req in enumerate(categories):
        category = cat_req.get('category') if isinstance(cat_req, dict) else str(cat_req)
        
        logger.info(f"🔍 {i+1}. Searching ALL places for '{category}' near {current_center}")
        
        try:
            # ✅ ИЩЕМ ВСЕ МЕСТА ДЛЯ КАТЕГОРИИ (до 5 штук)
            search_results = await yandex_api_module.search_places(
                center_coords=current_center,
                categories=[category],
                radius_m=5000
            )
            
            if search_results:
                all_category_places[category] = search_results
                logger.info(f"✅ Found {len(search_results)} places for '{category}'")
                
                # Обновляем центр для следующей категории (берем первое место)
                current_center = search_results[0]['coords']
            else:
                logger.warning(f"⚠️ No places found for '{category}'")
                all_category_places[category] = []
                
        except Exception as e:
            logger.error(f"❌ Error searching '{category}': {str(e)}")
            all_category_places[category] = []
    
    # 2. СОЗДАЕМ ОСНОВНОЙ МАРШРУТ (используем первые места из каждой категории)
    route_places = []
    
    # Стартовая точка
    route_places.append({
        'name': 'Старт',
        'coordinates': start_point,
        'type': 'must_visit',
        'transport_mode': 'pedestrian',
        'is_start': True
    })
    
    # Добавляем первые места из каждой категории в маршрут
    for category, places in all_category_places.items():
        if places:
            first_place = places[0]
            transport_mode = next((cat_req.get('transport_mode', 'pedestrian') 
                                for cat_req in categories 
                                if (cat_req.get('category') if isinstance(cat_req, dict) else str(cat_req)) == category), 
                              'pedestrian')
            
            route_places.append({
                'name': first_place['name'],
                'coordinates': first_place['coords'],
                'address': first_place.get('address', ''),
                'type': 'must_visit',
                'category': category,
                'transport_mode': transport_mode,
                'is_category': True
            })
    
    # Возврат к старту
    if request.get('return_to_start', False):
        route_places.append({
            'name': 'Возврат к старту',
            'coordinates': start_point,
            'type': 'must_visit',
            'transport_mode': 'pedestrian',
            'is_return': True
        })
    
    # 3. СТРОИМ МАРШРУТ
    route_data = await routing_service.build_route(
        places=route_places,
        optimize=request.get('optimize', True)
    )
    
    # 4. ДОБАВЛЯЕМ АЛЬТЕРНАТИВНЫЕ МЕСТА В ОТВЕТ
    if route_data.get('success'):
        route_data['alternative_places'] = all_category_places
        logger.info(f"✅ Added alternative places: {len(all_category_places)} categories")
    
    return route_data

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