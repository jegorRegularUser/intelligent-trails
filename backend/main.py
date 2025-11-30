"""
Intelligent Trails Backend - FastAPI Application
КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: start_point + categories
Бэк ищет места по категориям РЯДОМ с start_point!
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import logging
import os
from dotenv import load_dotenv

from routing_service import get_routing_service
from yandex_api import YandexStaticRouter as YandexMapsAPI
import yandex_api as yandex_api_module

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Intelligent Trails API",
    description="✅ start_point + categories support",
    version="2.2.0"
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
yandex_api = YandexMapsAPI(YANDEX_API_KEY) if YANDEX_API_KEY else None

if YANDEX_API_KEY:
    yandex_api_module.YANDEX_API_KEY = YANDEX_API_KEY


class Place(BaseModel):
    name: str
    coordinates: List[float]
    type: str = "must_visit"
    category: Optional[str] = None
    transport_mode: str = "pedestrian"


class RouteRequest(BaseModel):
    places: List[Place] = Field(..., min_length=2)
    optimize: bool = True


@app.get("/")
async def root():
    return {
        "service": "Intelligent Trails API",
        "version": "2.2.0",
        "status": "running",
        "features": ["✅ start_point + categories"]
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
    
    НОВЫЙ:
    {
        "start_point": [lon, lat],
        "categories": [{"category": "кафе", "transport_mode": "pedestrian"}],
        "places": [{"name": "...", "coordinates": [...], "transport_mode": "..."}],
        "end_point": [lon, lat],
        "return_to_start": false,
        "smart_ending": false
    }
    
    СТАРЫЙ:
    {
        "places": [{"name": "...", "coordinates": [...]}],
        "optimize": true
    }
    """
    try:
        if not YANDEX_API_KEY or not routing_service:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        logger.info(f"[API] 📦 Request: {request}")
        
        # ✅ Определяем формат
        if 'start_point' in request:
            places_data = await convert_new_to_old(request)
        else:
            places_data = request.get('places', [])
        
        logger.info(f"[API] 🎯 {len(places_data)} places")
        
        route_data = await routing_service.build_route(
            places=places_data,
            optimize=request.get('optimize', True)
        )
        
        if not route_data.get('success'):
            raise HTTPException(status_code=400, detail=route_data.get('error'))
        
        logger.info(f"[API] ✅ Done: {route_data['summary']['total_distance_km']} km")
        return route_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] ❌ {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def convert_new_to_old(req: dict) -> List[dict]:
    """✅ start_point + categories → places"""
    places = []
    
    # 1. START
    start = req.get('start_point')
    if not start:
        raise ValueError("❌ start_point required!")
    
    places.append({
        'name': 'Старт',
        'coordinates': start,
        'type': 'must_visit',
        'transport_mode': 'pedestrian'
    })
    logger.info(f"[API] ✅ Start: {start}")
    
    # 2. CATEGORIES - ✅ ИЩЕМ РЯДОМ С START!
    cats = req.get('categories', [])
    if cats:
        logger.info(f"[API] 🔍 {len(cats)} categories near {start}")
        
        for cat in cats:
            category = cat.get('category') if isinstance(cat, dict) else cat
            mode = cat.get('transport_mode', 'pedestrian') if isinstance(cat, dict) else 'pedestrian'
            
            try:
                results = await yandex_api_module.search_places(
                    center_coords=start,  # ✅ КЛЮЧ!
                    categories=[category],
                    radius_m=5000
                )
                
                if results:
                    p = results[0]
                    places.append({
                        'name': p.get('name', category),
                        'coordinates': p.get('coords'),
                        'address': p.get('address', ''),
                        'type': 'must_visit',
                        'category': category,
                        'transport_mode': mode
                    })
                    logger.info(f"[API] ✅ '{p['name']}' at {p['coords']}")
                else:
                    logger.warning(f"[API] ⚠️ '{category}' not found")
            except Exception as e:
                logger.error(f"[API] ❌ '{category}': {e}")
    
    # 3. PLACES
    for p in req.get('places', []):
        places.append({
            'name': p.get('name'),
            'coordinates': p.get('coordinates'),
            'type': p.get('type', 'must_visit'),
            'transport_mode': p.get('transport_mode', 'pedestrian')
        })
    
    # 4. END
    if req.get('return_to_start'):
        places.append({
            'name': 'Возврат',
            'coordinates': start,
            'type': 'must_visit',
            'transport_mode': 'pedestrian'
        })
    elif req.get('end_point'):
        places.append({
            'name': 'Финиш',
            'coordinates': req['end_point'],
            'type': 'must_visit',
            'transport_mode': 'pedestrian'
        })
    elif req.get('smart_ending'):
        import random
        ending = random.choice(['музей', 'парк', 'памятник'])
        try:
            results = await yandex_api_module.search_places(
                center_coords=start,
                categories=[ending],
                radius_m=5000
            )
            if results:
                p = results[0]
                places.append({
                    'name': p.get('name', ending),
                    'coordinates': p.get('coords'),
                    'type': 'must_visit',
                    'transport_mode': 'pedestrian'
                })
        except:
            pass
    
    return places


@app.get("/api/route/modes")
async def get_modes():
    from routing_service import ROUTING_MODES
    return {"success": True, "modes": ROUTING_MODES}


@app.on_event("shutdown")
async def shutdown():
    logger.info("👋 Bye")
    if yandex_api:
        await yandex_api.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
