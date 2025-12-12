import asyncio
import aiohttp
import json

async def test_search_places():
    BACKEND_URL = "http://localhost:8000/api/search/places"
    
    test_request = {
        "center_coords": [44.005383, 56.326797],
        "categories": ["кафе", "парк"],
        "radius_m": 5000
    }
    
    print("=" * 60)
    print("ТЕСТ БЭКЕНДА: /api/search/places")
    print("=" * 60)
    print(f"\nЗапрос:")
    print(f"  Начальная точка: {test_request['center_coords']}")
    print(f"  Категории: {test_request['categories']}")
    print(f"  Радиус: {test_request['radius_m']}м")
    print("-" * 60)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                BACKEND_URL, 
                json=test_request,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                
                print(f"\nСтатус ответа: {response.status}")
                
                if response.status == 200:
                    result = await response.json()
                    
                    print("\nОтвет от сервера:")
                    print(json.dumps(result, indent=2, ensure_ascii=False))
                    
                    if result.get('success'):
                        places_by_category = result.get('places_by_category', {})
                        total = result.get('total_count', 0)
                        
                        print("\n" + "=" * 60)
                        print(f"НАЙДЕНО МЕСТ: {total}")
                        print("=" * 60)
                        
                        for category, places in places_by_category.items():
                            print(f"\nКатегория: {category} ({len(places)} мест)")
                            print("-" * 60)
                            
                            for i, place in enumerate(places, 1):
                                print(f"\n  {i}. {place['name']}")
                                print(f"     Адрес: {place['address']}")
                                print(f"     Координаты: {place['coords']}")
                                print(f"     Расстояние: {place['distance_text']}")
                        
                        print("\n" + "=" * 60)
                        
                        if total > 0:
                            print("ТЕСТ ПРОЙДЕН")
                        else:
                            print("ПРЕДУПРЕЖДЕНИЕ: Мест не найдено")
                        
                        print("=" * 60)
                    else:
                        print(f"\nОШИБКА: {result.get('error', 'Unknown error')}")
                        
                else:
                    error_text = await response.text()
                    print(f"\nОШИБКА HTTP {response.status}:")
                    print(error_text)
                    
    except aiohttp.ClientError as e:
        print(f"\nСЕТЕВАЯ ОШИБКА: {str(e)}")
        print(f"Проверь, что бэкенд запущен на {BACKEND_URL}")
    except Exception as e:
        print(f"\nНЕОЖИДАННАЯ ОШИБКА: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_search_places())
