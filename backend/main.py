"""
Intelligent Trails Backend - FastAPI Application
✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: start_point + categories ПО ПРЯДКУ!
Все категории находят места рядом с start_point!
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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
    description="✅ start_point + categories - все работает!",
    version="2.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
if not YANDEX_API_KEY:
    logger.error("❌ YANDEX_API_KEY not found!")

routing_service = get_routing_service(YANDEX_API_KEY) if YANDEX_API_KEY else None


class Place(BaseModel):
    name: str
    coordinates: List[float]
    type: str = "must_visit"
    category: Optional[str] = None
    transport_mode: str = "pedestrian"


class RouteRequest(BaseModel):
    places: List[Place] = Field(..., min_length=2)
    optimize: bool = True


class CategoryRequest(BaseModel):
    category: str
    transport_mode: str = "pedestrian"


@app.get("/")
async def root():
    return {
        "service": "Intelligent Trails API",
        "version": "2.3.0",
        "status": "running",
        "features": ["✅ start_point + categories по порядку"]
    }


@app.get("/status")
async def status():
    return {"status": "ok", "api_key": bool(YANDEX_API_KEY)}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/route/build")
async def build_route(request: dict = Body(...)):
    """
    ✅ ПРИНИМАЕТ start_point + categories ИЛИ старый формат
    
    НОВЫЙ ФОРМАТ:
    {
        "start_point": [lon, lat],
        "categories": [{"category": "кафе", "transport_mode": "pedestrian"}],
        "places": [],
        "return_to_start": false,
        "smart_ending": false
    }
    
    ✅ ВАЖНО: категории обрабатываются ПО ПОРЯДКУ!
    """
    try:
        if not YANDEX_API_KEY or not routing_service:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        logger.info(f"[API] 📦 Request received: {request}")
        
        # ✅ Определяем формат запроса
        if 'start_point' in request:
            # НОВЫЙ ФОРМАТ - start_point + categories
            places_data = await convert_new_format_to_places(request)
        else:
            # СТАРЫЙ ФОРМАТ
            places_data = request.get('places', [])
        
        if not places_data or len(places_data) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 places")
        
        logger.info(f"[API] 🎯 Building route for {len(places_data)} places")
        for i, place in enumerate(places_data):
            logger.info(f"  Place {i+1}: '{place.get('name', 'N/A')}' at {place.get('coordinates')} (mode: {place.get('transport_mode', 'pedestrian')})")
        
        # Строим маршрут
        route_data = await routing_service.build_route(
            places=places_data,
            optimize=request.get('optimize', True)
        )
        
        if not route_data.get('success'):
            raise HTTPException(status_code=400, detail=route_data.get('error'))
        
        logger.info(f"[API] ✅ Route built: {len(route_data['places'])} places, {route_data['summary']['total_distance_km']:.1f} km")
        return route_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] ❌ Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def convert_new_format_to_places(request: dict) -> List[dict]:
    """
    ✅ КРИТИЧЕСКАЯ ФУНКЦИЯ!
    Преобразует start_point + categories в places
    ОБРАБАТЫВАЕТ КАТЕГОРИИ ПО ПОРЯДКУ!
    """
    places = []
    start_point = request.get('start_point')
    
    if not start_point or len(start_point) != 2:
        raise ValueError("❌ start_point must be [lon, lat]")
    
    # 1. НАЧАЛЬНАЯ ТОЧКА - ВСЕГДА ПЕРВАЯ!
    places.append({
        'name': 'Старт',
        'coordinates': start_point,
        'type': 'must_visit',
        'transport_mode': 'pedestrian',
        'is_start': True
    })
    logger.info(f"[API] ✅ 1. Start point: {start_point}")
    
    # 2. КОНКРЕТНЫЕ МЕСТА (если есть)
    specific_places = request.get('places', [])
    for i, place in enumerate(specific_places):
        places.append({
            'name': place.get('name', f'Место {i+1}'),
            'coordinates': place.get('coordinates', start_point),
            'type': place.get('type', 'must_visit'),
            'category': place.get('category'),
            'transport_mode': place.get('transport_mode', 'pedestrian'),
            'is_specific': True
        })
        logger.info(f"[API] ✅ 2.{i+1}. Specific place: '{place.get('name', 'N/A')}' at {place.get('coordinates')}")
    
    # 3. КАТЕГОРИИ - ОБРАБАТЫВАЕМ ПО ПОРЯДКУ!
    categories = request.get('categories', [])
    current_center = start_point  # Начинаем с start_point
    
    if categories:
        logger.info(f"[API] 🔍 Processing {len(categories)} categories starting from {start_point}")
        
        for i, cat_req in enumerate(categories):
            category = cat_req.get('category') if isinstance(cat_req, dict) else str(cat_req)
            transport_mode = cat_req.get('transport_mode', 'pedestrian') if isinstance(cat_req, dict) else 'pedestrian'
            
            logger.info(f"[API] 🔍 {i+1}. Searching '{category}' near {current_center}")
            
            try:
                # ИЩЕМ МЕСТО ДЛЯ ЭТОЙ КАТЕГОРИИ
                search_results = await yandex_api_module.search_places(
                    center_coords=current_center,
                    categories=[category],
                    radius_m=5000
                )
                
                if search_results and len(search_results) > 0:
                    found_place = search_results[0]  # Берем первое (ближайшее)
                    
                    place_data = {
                        'name': found_place.get('name', category),
                        'coordinates': found_place.get('coords', current_center),
                        'address': found_place.get('address', ''),
                        'type': 'must_visit',
                        'category': category,
                        'transport_mode': transport_mode,
                        'distance_from_center': found_place.get('distance', 0),
                        'is_category': True
                    }
                    
                    places.append(place_data)
                    
                    # ✅ ОБНОВЛЯЕМ ЦЕНТР ПОИСКА для следующей категории
                    current_center = place_data['coordinates']
                    
                    logger.info(f"[API] ✅ {i+1}. Found: '{place_data['name']}' at {place_data['coordinates']} ({transport_mode})")
                    logger.info(f"[API] 🔄 Next search center: {current_center}")
                    
                else:
                    # Если не нашли - используем start_point как fallback
                    logger.warning(f"[API] ⚠️ {i+1}. No places found for '{category}', using start_point")
                    places.append({
                        'name': f'{category} (не найдено)',
                        'coordinates': start_point,
                        'type': 'must_visit',
                        'category': category,
                        'transport_mode': transport_mode,
                        'is_fallback': True
                    })
                    current_center = start_point
                    
            except Exception as e:
                logger.error(f"[API] ❌ {i+1}. Error searching '{category}': {str(e)}")
                # Fallback - используем start_point
                places.append({
                    'name': f'{category} (ошибка)',
                    'coordinates': start_point,
                    'type': 'must_visit',
                    'category': category,
                    'transport_mode': transport_mode,
                    'is_error': True
                })
                current_center = start_point
    
    # 4. КОНЕЧНАЯ ТОЧКА
    if request.get('return_to_start', False):
        # Возврат к старту - ВСЕГДА ПОСЛЕДНИЙ
        places.append({
            'name': 'Возврат к старту',
            'coordinates': start_point,
            'type': 'must_visit',
            'transport_mode': 'pedestrian',
            'is_return': True
        })
        logger.info(f"[API] ✅ Added return to start: {start_point}")
        
    elif request.get('end_point'):
        places.append({
            'name': 'Финиш',
            'coordinates': request['end_point'],
            'type': 'must_visit',
            'transport_mode': 'pedestrian',
            'is_end': True
        })
        logger.info(f"[API] ✅ Added end point: {request['end_point']}")
        
    elif request.get('smart_ending', False):
        # Умное завершение - ищем интересное место
        ending_categories = ['музей', 'парк', 'памятник', 'сквер']
        import random
        ending_category = random.choice(ending_categories)
        
        logger.info(f"[API] 🧠 Smart ending with category: '{ending_category}' near {current_center}")
        
        try:
            search_results = await yandex_api_module.search_places(
                center_coords=current_center,
                categories=[ending_category],
                radius_m=5000
            )
            
            if search_results and len(search_results) > 0:
                found_place = search_results[0]
                places.append({
                    'name': found_place.get('name', ending_category),
                    'coordinates': found_place.get('coords', current_center),
                    'address': found_place.get('address', ''),
                    'type': 'must_visit',
                    'category': ending_category,
                    'transport_mode': 'pedestrian',
                    'is_smart_end': True
                })
                logger.info(f"[API] ✅ Smart ending: '{found_place.get('name', ending_category)}' at {found_place.get('coords')}")
            else:
                # Fallback к старту
                logger.warning(f"[API] ⚠️ Smart ending failed, returning to start")
                places.append({
                    'name': 'Возврат к старту (умный)',
                    'coordinates': start_point,
                    'type': 'must_visit',
                    'transport_mode': 'pedestrian',
                    'is_fallback_end': True
                })
                
        except Exception as e:
            logger.error(f"[API] ❌ Smart ending error: {str(e)}")
            places.append({
                'name': 'Возврат к старту (ошибка)',
                'coordinates': start_point,
                'type': 'must_visit',
                'transport_mode': 'pedestrian',
                'is_error_end': True
            })
    
    # ✅ ЛОГИКА: если нет конечной точки и нет return_to_start, маршрут заканчивается на последней категории
    if not request.get('return_to_start') and not request.get('end_point') and not request.get('smart_ending'):
        logger.info("[API] ⚠️ No end point specified - route ends at last category")
        # Маршрут заканчивается на последней точке
        pass
    
    logger.info(f"[API] ✅ Final places count: {len(places)}")
    for i, place in enumerate(places):
        place_type = ' | '.join([k for k, v in place.items() if v is True and k.startswith('is_')])
        logger.info(f"  {i+1}. '{place['name']}' at {place['coordinates']} [{place_type}]")
    
    return places


@app.get("/api/route/modes")
async def get_modes():
    from routing_service import ROUTING_MODES
    return {"success": True, "modes": ROUTING_MODES}


@app.on_event("shutdown")
async def shutdown():
    logger.info("👋 Shutting down")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
