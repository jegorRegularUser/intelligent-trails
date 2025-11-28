import asyncio
import httpx
import json

# URL твоего бэкенда
BACKEND_URL = "http://localhost:8000"  # Или твой URL


async def test_smart_walk():
    """
    Тестируем build_smart_walk как на фронте
    """
    
    # Данные как с фронта
    request_data = {
        "start_point": {
            "name": "Красная площадь",
            "coords": [55.7539, 37.6208]
        },
        "activities": [
            {
                "type": "walk",
                "duration_minutes": 20,
                "walking_style": "scenic",
                "transport_mode": "pedestrian"
            },
            {
                "type": "place",
                "duration_minutes": 30,
                "category": "кафе",
                "time_at_place": 30,
                "transport_mode": "pedestrian"
            },
            {
                "type": "walk",
                "duration_minutes": 15,
                "walking_style": "direct",
                "transport_mode": "auto"
            },
            {
                "type": "place",
                "duration_minutes": 45,
                "category": "музей",
                "time_at_place": 45,
                "transport_mode": "auto"
            }
        ],
        "return_to_start": True,
        "end_point": None
    }
    
    print("="*70)
    print("ТЕСТ УМНОЙ ПРОГУЛКИ")
    print("="*70)
    print(f"\nStart: {request_data['start_point']['name']}")
    print(f"Activities: {len(request_data['activities'])}")
    print(f"Return to start: {request_data['return_to_start']}")
    
    print("\nACTIVITIES:")
    for idx, act in enumerate(request_data['activities']):
        print(f"  {idx+1}. {act['type']}: {act.get('category', act.get('walking_style'))} - {act['duration_minutes']}min - {act['transport_mode']}")
    
    print(f"\n{'='*70}")
    print("ОТПРАВКА ЗАПРОСА...")
    print(f"{'='*70}\n")
    
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            response = await client.post(
                f"{BACKEND_URL}/calculate_smart_walk",
                json=request_data
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                print(f"\n{'='*70}")
                print("✓ УСПЕХ!")
                print(f"{'='*70}\n")
                
                print(f"Total activities returned: {len(data['activities'])}")
                print(f"Total duration: {data['total_duration_minutes']} min")
                print(f"Total distance: {data.get('total_distance_meters', 0)} m")
                print(f"Warnings: {len(data.get('warnings', []))}")
                
                if data.get('warnings'):
                    print("\nWARNINGS:")
                    for warning in data['warnings']:
                        print(f"  - {warning}")
                
                print(f"\n{'='*70}")
                print("ДЕТАЛИ АКТИВНОСТЕЙ:")
                print(f"{'='*70}\n")
                
                for idx, activity in enumerate(data['activities']):
                    print(f"Activity {idx+1}:")
                    print(f"  Type: {activity['activity_type']}")
                    print(f"  Transport: {activity['transport_mode']}")
                    print(f"  Duration: {activity['duration_minutes']} min")
                    
                    if activity.get('geometry'):
                        print(f"  ✓ Geometry: {len(activity['geometry'])} points")
                    else:
                        print(f"  ✗ Geometry: MISSING!")
                    
                    if activity.get('distance_meters'):
                        print(f"  Distance: {activity['distance_meters']} m")
                    
                    if activity.get('duration_seconds'):
                        print(f"  Duration (real): {activity['duration_seconds']} s")
                    
                    if activity['activity_type'] == 'place':
                        if activity.get('selected_place'):
                            print(f"  Place: {activity['selected_place']['name']}")
                        if activity.get('alternatives'):
                            print(f"  Alternatives: {len(activity['alternatives'])}")
                    
                    print()
                
                # Сохраняем полный ответ в файл
                with open('test_response.json', 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print("Full response saved to: test_response.json")
                
            else:
                print(f"\n{'='*70}")
                print("✗ ОШИБКА!")
                print(f"{'='*70}\n")
                print(response.text)
                
        except Exception as e:
            print(f"\n{'='*70}")
            print("✗ EXCEPTION!")
            print(f"{'='*70}\n")
            print(f"Type: {type(e).__name__}")
            print(f"Message: {str(e)}")


async def test_simple_route():
    """
    Тестируем простой маршрут из точки А в Б
    """
    
    request_data = {
        "start_point": {
            "name": "Красная площадь",
            "coords": [55.7539, 37.6208]
        },
        "end_point": {
            "name": "Большой театр",
            "coords": [55.7603, 37.6186]
        },
        "categories": ["кафе", "музей"],
        "time_limit_minutes": 60,
        "return_to_start": False,
        "mode": "pedestrian",
        "settings": {
            "pace": "balanced",
            "time_strictness": 5
        }
    }
    
    print("\n\n")
    print("="*70)
    print("ТЕСТ ПРОСТОГО МАРШРУТА")
    print("="*70)
    
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            response = await client.post(
                f"{BACKEND_URL}/calculate_route",
                json=request_data
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"\n✓ SUCCESS!")
                print(f"Points: {len(data['ordered_route'])}")
                print(f"Time: {data['total_time_minutes']} min")
                
                if data.get('ordered_route'):
                    print("\nRoute:")
                    for idx, point in enumerate(data['ordered_route']):
                        print(f"  {idx+1}. {point['name']}")
            else:
                print(f"\n✗ ERROR: {response.text}")
                
        except Exception as e:
            print(f"\n✗ EXCEPTION: {type(e).__name__}: {str(e)}")


async def test_yandex_api_directly():
    """
    Прямой тест Yandex Router API
    """
    import os
    
    api_key = os.getenv("YANDEX_API_KEY", "")
    
    if not api_key:
        print("ERROR: YANDEX_API_KEY not set!")
        return
    
    print("\n\n")
    print("="*70)
    print("ПРЯМОЙ ТЕСТ YANDEX ROUTER API")
    print("="*70)
    print(f"API Key: {api_key[:10]}...")
    
    # Две точки в Москве
    waypoints = [
        [55.7539, 37.6208],  # Красная площадь
        [55.7603, 37.6186]   # Большой театр
    ]
    
    waypoints_str = '|'.join([f"{wp[1]},{wp[0]}" for wp in waypoints])
    
    params = {
        'apikey': api_key,
        'waypoints': waypoints_str,
        'mode': 'pedestrian'
    }
    
    url = "https://api.routing.yandex.net/v2/route"
    
    print(f"\nURL: {url}")
    print(f"Waypoints: {waypoints_str}")
    print(f"Mode: pedestrian")
    
    async with httpx.AsyncClient(timeout=30, verify=False) as client:
        try:
            response = await client.get(url, params=params)
            
            print(f"\nResponse status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"\n✓ SUCCESS!")
                print(f"Response keys: {list(data.keys())}")
                
                if 'route' in data:
                    route = data['route']
                    print(f"Route keys: {list(route.keys())}")
                    
                    if 'legs' in route:
                        print(f"Legs count: {len(route['legs'])}")
                        
                        geometry_count = 0
                        for leg in route['legs']:
                            if 'steps' in leg:
                                for step in leg['steps']:
                                    if 'polyline' in step:
                                        points = step['polyline'].get('points', [])
                                        geometry_count += len(points)
                        
                        print(f"Total geometry points: {geometry_count}")
                else:
                    print(f"Response data: {json.dumps(data, indent=2)}")
            else:
                print(f"\n✗ ERROR!")
                print(f"Status: {response.status_code}")
                print(f"Response: {response.text[:500]}")
                
        except Exception as e:
            print(f"\n✗ EXCEPTION!")
            print(f"Type: {type(e).__name__}")
            print(f"Message: {str(e)}")


async def main():
    """
    Главная функция - запускает все тесты
    """
    
    # Раскомментируй нужный тест:
    
    # 1. Тест умной прогулки (основной)
    await test_smart_walk()
    
    # 2. Тест простого маршрута
    # await test_simple_route()
    
    # 3. Прямой тест Yandex API
    # await test_yandex_api_directly()


if __name__ == "__main__":
    asyncio.run(main())
