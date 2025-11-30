"""
ТЕСТ БЭКЕНДА - ПРОВЕРКА start_point + categories + return_to_start
"""

import asyncio
import aiohttp
import json
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_backend_route():
    """
    Тест отправки точно такого же запроса, как с фронта
    """
    # URL бэкенда (замени на свой)
    BACKEND_URL = "http://localhost:8000/api/route/build"
    
    # ✅ ТОЧНО ТОТ ЖЕ ЗАПРОС С ФРОНТА
    test_request = {
        "start_point": [56.326797, 44.006516],  # Нижний Новгород
        "categories": [
            {
                "category": "кафе",
                "transport_mode": "pedestrian"
            },
            {
                "category": "парк", 
                "transport_mode": "pedestrian"
            }
        ],
        "places": [],
        "end_point": None,
        "return_to_start": True,
        "smart_ending": False
    }
    
    print("🔍 ТЕСТИРУЕМ БЭКЕНД")
    print(f"📍 Start point: {test_request['start_point']} (Нижний Новгород)")
    print(f"📋 Categories: {len(test_request['categories'])}")
    for i, cat in enumerate(test_request['categories']):
        print(f"   {i+1}. {cat['category']} ({cat['transport_mode']})")
    print(f"🔄 Return to start: {test_request['return_to_start']}")
    print(f"🚶 Smart ending: {test_request['smart_ending']}")
    print("-" * 60)
    
    try:
        async with aiohttp.ClientSession() as session:
            # Отправляем POST запрос
            async with session.post(
                BACKEND_URL, 
                json=test_request,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                
                print(f"📡 Response status: {response.status}")
                
                if response.status == 200:
                    result = await response.json()
                    
                    print("\n✅ УСПЕШНЫЙ ОТВЕТ:")
                    print(f"   Success: {result.get('success', False)}")
                    
                    if result.get('success'):
                        # Анализируем результат
                        places = result.get('places', [])
                        segments = result.get('segments', [])
                        
                        print(f"\n📍 НАЙДЕННЫЕ МЕСТА ({len(places)}):")
                        for i, place in enumerate(places):
                            coords = place.get('coordinates', [0, 0])
                            name = place.get('name', 'N/A')
                            category = place.get('category', 'N/A')
                            mode = place.get('transport_mode', 'N/A')
                            
                            marker_type = place.get('marker', {}).get('number', i+1)
                            print(f"   {i+1}. '{name}' [{category}]")
                            print(f"      📍 {coords[0]:.6f}, {coords[1]:.6f}")
                            print(f"      🚶 {mode}")
                            print(f"      🏷️  #{marker_type}")
                            
                        print(f"\n🛤️ СЕГМЕНТЫ МАРШРУТА ({len(segments)}):")
                        for i, segment in enumerate(segments):
                            from_name = segment.get('from', {}).get('name', 'N/A')
                            to_name = segment.get('to', {}).get('name', 'N/A')
                            distance = segment.get('distance', 0)
                            duration = segment.get('duration', 0)
                            mode = segment.get('mode', 'N/A')
                            
                            print(f"   {i+1}. {from_name} → {to_name}")
                            print(f"      📏 {distance/1000:.2f} км")
                            print(f"      ⏱️  {duration/60:.1f} мин")
                            print(f"      🚶 {mode}")
                        
                        summary = result.get('summary', {})
                        print(f"\n📊 ОБЩАЯ СТАТИСТИКА:")
                        print(f"   Мест: {summary.get('number_of_places', 0)}")
                        print(f"   Сегментов: {summary.get('number_of_segments', 0)}")
                        print(f"   Дистанция: {summary.get('total_distance_km', 0):.2f} км")
                        print(f"   Время: {summary.get('total_duration_minutes', 0)} мин")
                        print(f"   Оптимизация: {result.get('optimization_applied', False)}")
                        
                        # ПРОВЕРЯЕМ, ЧТО ВСЕ РАБОТАЕТ
                        if len(places) >= 3:  # Старт + минимум 1 категория + возврат
                            print(f"\n🎉 ✅ ТЕСТ ПРОЙДЕН!")
                            print(f"   Маршрут содержит {len(places)} точек")
                            print(f"   Общая длина: {summary.get('total_distance_km', 0):.2f} км")
                        else:
                            print(f"\n⚠️  ПРЕДУПРЕЖДЕНИЕ: Мало точек ({len(places)})")
                            print(f"   Ожидалось: Старт + Кафе + Парк + Возврат = 4 точки")
                        
                    else:
                        error = result.get('error', 'Unknown error')
                        print(f"\n❌ ОШИБКА БЭКЕНДА: {error}")
                        
                else:
                    # Ошибка HTTP
                    error_text = await response.text()
                    print(f"\n❌ HTTP ОШИБКА {response.status}:")
                    print(f"   {error_text}")
                    
    except aiohttp.ClientError as e:
        print(f"\n❌ СЕТЕВАЯ ОШИБКА: {str(e)}")
        print(f"   Проверь, что бэкенд запущен на {BACKEND_URL}")
    except Exception as e:
        print(f"\n❌ НЕОЖИДАННАЯ ОШИБКА: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Запускаем тест
    asyncio.run(test_backend_route())
