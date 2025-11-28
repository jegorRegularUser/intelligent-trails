#!/usr/bin/env python3
"""
Тестовый скрипт для проверки гибридной системы маршрутизации

Использование:
    python test_routing.py
"""

import asyncio
import sys
from dotenv import load_dotenv

load_dotenv()

import routing_service


async def test_routing():
    print("\n" + "="*60)
    print("🚀 ТЕСТИРОВАНИЕ ГИБРИДНОЙ СИСТЕМЫ МАРШРУТИЗАЦИИ")
    print("="*60 + "\n")
    
    # Проверяем наличие API ключей
    print("🔑 Проверка API ключей:")
    print(f"  GraphHopper: {'✅ Настроен' if routing_service.GRAPHHOPPER_API_KEY else '❌ Не настроен'}")
    print(f"  Mapbox:      {'✅ Настроен' if routing_service.MAPBOX_API_KEY else '❌ Не настроен'}")
    print(f"  OSRM:        ✅ Всегда доступен (public)\n")
    
    # Тестовые точки (Москва: Красная площадь → Парк Горького)
    test_cases = [
        {
            "name": "🚶 Пешеходный маршрут",
            "waypoints": [
                [55.7539, 37.6208],  # Красная площадь
                [55.7311, 37.6076]   # Парк Горького
            ],
            "mode": "pedestrian"
        },
        {
            "name": "🚗 Автомобильный маршрут",
            "waypoints": [
                [55.7539, 37.6208],
                [55.7311, 37.6076]
            ],
            "mode": "auto"
        },
        {
            "name": "🚴 Велосипедный маршрут",
            "waypoints": [
                [55.7539, 37.6208],
                [55.7311, 37.6076]
            ],
            "mode": "bicycle"
        }
    ]
    
    results = []
    
    for test in test_cases:
        print(f"\n{'='*60}")
        print(f"{test['name']}")
        print(f"{'='*60}")
        
        try:
            result = await routing_service.build_route(
                waypoints=test['waypoints'],
                mode=test['mode'],
                use_cache=False  # Отключаем кеш для теста
            )
            
            if result:
                service = result.get('service', 'unknown')
                distance = result.get('distance_meters', 0)
                duration = result.get('duration_seconds', 0)
                points = len(result.get('geometry', []))
                
                print(f"\n✅ УСПЕХ!")
                print(f"  Сервис:    {service}")
                print(f"  Расстояние: {distance}m ({distance/1000:.2f}km)")
                print(f"  Время:      {duration}s ({duration/60:.1f}min)")
                print(f"  Точек:      {points}")
                
                results.append({
                    'test': test['name'],
                    'success': True,
                    'service': service
                })
            else:
                print(f"\n❌ ОШИБКА: Все сервисы недоступны")
                results.append({
                    'test': test['name'],
                    'success': False,
                    'service': None
                })
                
        except Exception as e:
            print(f"\n❌ ИСКЛЮЧЕНИЕ: {e}")
            results.append({
                'test': test['name'],
                'success': False,
                'service': None
            })
    
    # Итоговая статистика
    print(f"\n\n{'='*60}")
    print("📊 ИТОГОВАЯ СТАТИСТИКА")
    print(f"{'='*60}\n")
    
    success_count = sum(1 for r in results if r['success'])
    total_count = len(results)
    
    print(f"Общий результат: {success_count}/{total_count} успешных тестов\n")
    
    for r in results:
        status = "✅" if r['success'] else "❌"
        service = f" ({r['service']})" if r['service'] else ""
        print(f"{status} {r['test']}{service}")
    
    # Показываем статистику API
    stats = routing_service.get_usage_stats()
    
    print(f"\n\n{'='*60}")
    print("📊 СТАТИСТИКА ИСПОЛЬЗОВАНИЯ API")
    print(f"{'='*60}\n")
    
    for service_name, service_stats in stats['services'].items():
        total = service_stats['success'] + service_stats['errors']
        if total > 0:
            success_rate = (service_stats['success'] / total) * 100
            print(f"{service_name.upper()}:")
            print(f"  ✅ Успешных: {service_stats['success']}")
            print(f"  ❌ Ошибок:    {service_stats['errors']}")
            print(f"  📊 Success rate: {success_rate:.1f}%\n")
    
    print(f"\nКеш: {stats['cache']['size']} маршрутов (TTL: {stats['cache']['ttl_days']} дней)")
    
    # Рекомендации
    print(f"\n\n{'='*60}")
    print("💡 РЕКОМЕНДАЦИИ")
    print(f"{'='*60}\n")
    
    if not routing_service.GRAPHHOPPER_API_KEY:
        print("⚠️  GraphHopper API ключ не настроен")
        print("   Регистрация: https://www.graphhopper.com/dashboard/#/register")
        print("   Лимит: 500 запросов/день (бесплатно)\n")
    
    if not routing_service.MAPBOX_API_KEY:
        print("⚠️  Mapbox API ключ не настроен")
        print("   Регистрация: https://account.mapbox.com/auth/signup/")
        print("   Лимит: 100,000 запросов/месяц (бесплатно)")
        print("   Особенность: Учитывает пробки!\n")
    
    if routing_service.GRAPHHOPPER_API_KEY and routing_service.MAPBOX_API_KEY:
        print("✅ Все API ключи настроены!")
        print("   Вы получите лучшее качество маршрутизации с автоматическим fallback!\n")
    
    print(f"\n{'='*60}")
    print("✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print(f"{'='*60}\n")
    
    return success_count == total_count


if __name__ == "__main__":
    try:
        success = asyncio.run(test_routing())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Тестирование прервано")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ КРИТИЧЕСКАЯ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
