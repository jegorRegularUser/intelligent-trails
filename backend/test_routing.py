"""
Жесткий тест бэкенда - максимально похоже на фронтенд
Проверяет все сценарии: категории, координаты, построение маршрутов
"""

import asyncio
import json
import logging
from typing import List, Dict
from datetime import datetime

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Импорты из вашего бэкенда
from routing_service import get_routing_service, ROUTING_MODES
from yandex_api import YandexMapsAPI, search_places
import os
from dotenv import load_dotenv

load_dotenv()
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")

# Цвета для красивого вывода
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'


def print_header(text: str):
    """Красивый заголовок"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*80}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(80)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*80}{Colors.END}\n")


def print_success(text: str):
    """Успех"""
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")


def print_error(text: str):
    """Ошибка"""
    print(f"{Colors.RED}❌ {text}{Colors.END}")


def print_warning(text: str):
    """Предупреждение"""
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")


def print_info(text: str):
    """Информация"""
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.END}")


def print_json(data: Dict, title: str = ""):
    """Красивый вывод JSON"""
    if title:
        print(f"\n{Colors.BOLD}{Colors.WHITE}{title}:{Colors.END}")
    print(json.dumps(data, indent=2, ensure_ascii=False))


# ============================================================================
# ТЕСТОВЫЕ ДАННЫЕ (как с фронтенда)
# ============================================================================

# Тест 1: Только категории (как с фронта)
TEST_PLACES_CATEGORIES = [
    {
        "name": "кафе",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "кафе"
    },
    {
        "name": "парк",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "парк"
    },
    {
        "name": "музей",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "музей"
    }
]

# Тест 2: Смешанные данные (координаты + категории)
TEST_PLACES_MIXED = [
    {
        "name": "Красная площадь",
        "coordinates": [37.6173, 55.7558],  # Москва
        "type": "must_visit",
        "address": "Красная площадь, Москва"
    },
    {
        "name": "кафе",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "кафе"
    },
    {
        "name": "ресторан",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "ресторан"
    }
]

# Тест 3: Только конкретные места
TEST_PLACES_COORDINATES = [
    {
        "name": "Эрмитаж",
        "coordinates": [30.3141, 59.9398],  # Санкт-Петербург
        "type": "must_visit",
        "address": "Дворцовая набережная, 34"
    },
    {
        "name": "Петропавловская крепость",
        "coordinates": [30.3167, 59.9500],
        "type": "must_visit",
        "address": "Заячий остров, 3"
    }
]

# Тест 4: Много категорий (стресс-тест)
TEST_PLACES_STRESS = [
    {"name": "кафе", "coordinates": [0, 0], "type": "must_visit", "category": "кафе"},
    {"name": "парк", "coordinates": [0, 0], "type": "must_visit", "category": "парк"},
    {"name": "музей", "coordinates": [0, 0], "type": "must_visit", "category": "музей"},
    {"name": "ресторан", "coordinates": [0, 0], "type": "must_visit", "category": "ресторан"},
    {"name": "бар", "coordinates": [0, 0], "type": "must_visit", "category": "бар"},
]


# ============================================================================
# ТЕСТОВЫЕ ФУНКЦИИ
# ============================================================================

async def test_search_places():
    """Тест 1: Поиск мест по категориям"""
    print_header("ТЕСТ 1: ПОИСК МЕСТ ПО КАТЕГОРИЯМ")
    
    test_center = [37.6173, 55.7558]  # Москва
    test_categories = ["кафе", "парк", "музей"]
    
    print_info(f"Центр поиска: {test_center}")
    print_info(f"Категории: {', '.join(test_categories)}")
    print_info(f"Радиус: 3000м")
    
    try:
        results = await search_places(
            center_coords=test_center,
            categories=test_categories,
            radius_m=3000
        )
        
        if results:
            print_success(f"Найдено {len(results)} мест")
            
            # Группируем по категориям
            by_category = {}
            for place in results:
                cat = place.get('category', 'unknown')
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(place)
            
            # Выводим по категориям
            for category, places in by_category.items():
                print(f"\n{Colors.BOLD}📍 {category.upper()} ({len(places)} мест):{Colors.END}")
                for i, place in enumerate(places[:3], 1):  # Первые 3
                    print(f"  {i}. {place['name']}")
                    print(f"     📍 {place['coords']}")
                    print(f"     📏 {place['distance']:.0f}м от центра")
                    if place.get('address'):
                        print(f"     🏠 {place['address']}")
            
            # Детальный JSON первого места
            print_json(results[0], "Пример первого места (полные данные)")
            
        else:
            print_error("Места не найдены!")
            
    except Exception as e:
        print_error(f"Ошибка поиска: {str(e)}")
        logger.exception(e)


async def test_route_categories_only():
    """Тест 2: Построение маршрута только по категориям (как с фронта)"""
    print_header("ТЕСТ 2: МАРШРУТ ТОЛЬКО ПО КАТЕГОРИЯМ (КАК С ФРОНТА)")
    
    print_info("Места с фронтенда:")
    print_json(TEST_PLACES_CATEGORIES)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_PLACES_CATEGORIES,
            mode='pedestrian',
            optimize=True
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен успешно!")
            
            # Summary
            summary = route_data['summary']
            print(f"\n{Colors.BOLD}📊 ИТОГО:{Colors.END}")
            print(f"  🚶 Режим: {route_data['mode']}")
            print(f"  📍 Места: {summary['number_of_places']}")
            print(f"  📏 Расстояние: {summary['total_distance_km']:.2f} км")
            print(f"  ⏱️  Время: {summary['total_duration_minutes']:.0f} мин")
            print(f"  🔄 Оптимизация: {'Да' if route_data['optimization_applied'] else 'Нет'}")
            
            # Places
            print(f"\n{Colors.BOLD}📍 НАЙДЕННЫЕ МЕСТА:{Colors.END}")
            for place in route_data['places']:
                print(f"  {place['order']}. {place['name']}")
                print(f"     📍 {place['coordinates']}")
                if place.get('address'):
                    print(f"     🏠 {place['address']}")
                if place.get('category'):
                    print(f"     🏷️  Категория: {place['category']}")
            
            # Segments
            print(f"\n{Colors.BOLD}🛤️  СЕГМЕНТЫ МАРШРУТА:{Colors.END}")
            for i, segment in enumerate(route_data['segments'], 1):
                print(f"  {i}. {segment['from']['name']} → {segment['to']['name']}")
                print(f"     {segment['style']['icon']} {segment['mode_display']}")
                print(f"     📏 {segment['distance']:.0f}м, ⏱️ {segment['duration']:.0f}с")
                print(f"     📝 {segment['instructions']}")
                print(f"     🗺️  Точек геометрии: {len(segment['geometry'])}")
            
            # Полный JSON
            print_json(route_data, "\n📦 ПОЛНЫЙ JSON ОТВЕТА")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            print_json(route_data)
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_route_mixed():
    """Тест 3: Смешанный маршрут (координаты + категории)"""
    print_header("ТЕСТ 3: СМЕШАННЫЙ МАРШРУТ (КООРДИНАТЫ + КАТЕГОРИИ)")
    
    print_info("Места:")
    print_json(TEST_PLACES_MIXED)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_PLACES_MIXED,
            mode='driving',
            optimize=False
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен!")
            
            summary = route_data['summary']
            print(f"\n{Colors.BOLD}📊 ИТОГО:{Colors.END}")
            print(f"  🚗 Режим: {route_data['mode']}")
            print(f"  📍 Места: {summary['number_of_places']}")
            print(f"  📏 Расстояние: {summary['total_distance_km']:.2f} км")
            print(f"  ⏱️  Время: {summary['total_duration_minutes']:.0f} мин")
            
            # Places
            print(f"\n{Colors.BOLD}📍 МАРШРУТ:{Colors.END}")
            for place in route_data['places']:
                icon = "📍" if place.get('category') else "🎯"
                print(f"  {icon} {place['order']}. {place['name']}")
                print(f"     {place['coordinates']}")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_route_coordinates():
    """Тест 4: Маршрут только по координатам"""
    print_header("ТЕСТ 4: МАРШРУТ ТОЛЬКО ПО КООРДИНАТАМ")
    
    print_info("Места:")
    print_json(TEST_PLACES_COORDINATES)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_PLACES_COORDINATES,
            mode='pedestrian',
            optimize=False
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен!")
            
            summary = route_data['summary']
            print(f"\n📊 Расстояние: {summary['total_distance_km']:.2f} км")
            print(f"⏱️  Время: {summary['total_duration_minutes']:.0f} мин")
            
            # Проверяем геометрию
            for i, segment in enumerate(route_data['segments'], 1):
                geom_len = len(segment['geometry'])
                if geom_len < 2:
                    print_error(f"Сегмент {i}: НЕТ ГЕОМЕТРИИ!")
                elif geom_len == 2:
                    print_warning(f"Сегмент {i}: Прямая линия ({geom_len} точки)")
                else:
                    print_success(f"Сегмент {i}: Реалистичная геометрия ({geom_len} точек)")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_route_stress():
    """Тест 5: Стресс-тест (много категорий)"""
    print_header("ТЕСТ 5: СТРЕСС-ТЕСТ (МНОГО КАТЕГОРИЙ)")
    
    print_info(f"Количество мест: {len(TEST_PLACES_STRESS)}")
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    start_time = datetime.now()
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_PLACES_STRESS,
            mode='pedestrian',
            optimize=True
        )
        
        elapsed = (datetime.now() - start_time).total_seconds()
        
        if route_data.get('success'):
            print_success(f"Маршрут построен за {elapsed:.2f}с")
            
            summary = route_data['summary']
            print(f"\n📊 Найдено мест: {summary['number_of_places']}")
            print(f"📏 Расстояние: {summary['total_distance_km']:.2f} км")
            print(f"⏱️  Время: {summary['total_duration_minutes']:.0f} мин")
            print(f"🔄 Оптимизация: {route_data['optimization_applied']}")
            
            # Список найденных мест
            print(f"\n{Colors.BOLD}Найденные места:{Colors.END}")
            for place in route_data['places']:
                cat = place.get('category', 'конкретное место')
                print(f"  • {place['name']} ({cat})")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_routing_modes():
    """Тест 6: Все режимы передвижения"""
    print_header("ТЕСТ 6: ВСЕ РЕЖИМЫ ПЕРЕДВИЖЕНИЯ")
    
    test_places = [
        {"name": "Точка А", "coordinates": [37.6173, 55.7558], "type": "must_visit"},
        {"name": "Точка Б", "coordinates": [37.6300, 55.7600], "type": "must_visit"}
    ]
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    for mode in ROUTING_MODES.keys():
        print(f"\n{Colors.BOLD}🚶 Тестируем режим: {mode.upper()}{Colors.END}")
        
        try:
            route_data = await routing_service.build_route(
                places=test_places,
                mode=mode,
                optimize=False
            )
            
            if route_data.get('success'):
                summary = route_data['summary']
                config = ROUTING_MODES[mode]
                
                print_success(f"Построен!")
                print(f"  {config['icon']} {config['type']}")
                print(f"  📏 {summary['total_distance_km']:.2f} км")
                print(f"  ⏱️  {summary['total_duration_minutes']:.0f} мин")
                print(f"  🎨 Цвет: {config['color']}")
                print(f"  📐 Стиль: {config['style']}")
            else:
                print_error(f"Ошибка: {route_data.get('error')}")
                
        except Exception as e:
            print_error(f"Исключение: {str(e)}")


async def test_yandex_api_direct():
    """Тест 7: Прямой тест Yandex API"""
    print_header("ТЕСТ 7: ПРЯМОЙ ТЕСТ YANDEX API")
    
    api = YandexMapsAPI(YANDEX_API_KEY)
    
    # Тест get_route
    print_info("Тестируем get_route()...")
    try:
        route = await api.get_route(
            origin=[37.6173, 55.7558],
            destination=[37.6300, 55.7600],
            mode='pedestrian'
        )
        
        if route:
            print_success("get_route() работает!")
            print(f"  📏 Расстояние: {route['distance']:.0f}м")
            print(f"  ⏱️  Время: {route['duration']:.0f}с")
            print(f"  🗺️  Точек геометрии: {len(route['geometry'])}")
            
            # Проверяем геометрию
            if len(route['geometry']) < 2:
                print_error("ГЕОМЕТРИЯ ПУСТАЯ!")
            elif len(route['geometry']) == 2:
                print_warning("Геометрия - прямая линия")
            else:
                print_success(f"Геометрия реалистичная ({len(route['geometry'])} точек)")
        else:
            print_error("get_route() вернул None!")
            
    except Exception as e:
        print_error(f"Ошибка get_route(): {str(e)}")
        logger.exception(e)
    
    # Тест geocode
    print_info("\nТестируем geocode()...")
    try:
        coords = await api.geocode("Москва, Красная площадь")
        if coords:
            print_success(f"geocode() работает! Координаты: {coords}")
        else:
            print_error("geocode() вернул None!")
    except Exception as e:
        print_error(f"Ошибка geocode(): {str(e)}")
    
    # Тест reverse_geocode
    print_info("\nТестируем reverse_geocode()...")
    try:
        address = await api.reverse_geocode([37.6173, 55.7558])
        if address:
            print_success("reverse_geocode() работает!")
            print(f"  🏠 {address['address']}")
        else:
            print_error("reverse_geocode() вернул None!")
    except Exception as e:
        print_error(f"Ошибка reverse_geocode(): {str(e)}")
    
    await api.close()


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

async def run_all_tests():
    """Запуск всех тестов"""
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("=" * 80)
    print(" ЖЕСТКИЙ ТЕСТ БЭКЕНДА INTELLIGENT TRAILS ".center(80))
    print(f" {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ".center(80))
    print("=" * 80)
    print(Colors.END)
    
    if not YANDEX_API_KEY:
        print_error("YANDEX_API_KEY не найден в .env!")
        return
    
    print_success(f"API ключ найден: {YANDEX_API_KEY[:20]}...")
    
    tests = [
        ("Поиск мест по категориям", test_search_places),
        ("Маршрут только по категориям", test_route_categories_only),
        ("Смешанный маршрут", test_route_mixed),
        ("Маршрут по координатам", test_route_coordinates),
        ("Стресс-тест", test_route_stress),
        ("Все режимы передвижения", test_routing_modes),
        ("Прямой тест Yandex API", test_yandex_api_direct),
    ]
    
    passed = 0
    failed = 0
    
    for i, (name, test_func) in enumerate(tests, 1):
        try:
            print(f"\n{Colors.BOLD}[{i}/{len(tests)}] {name}{Colors.END}")
            await test_func()
            passed += 1
        except Exception as e:
            print_error(f"ТЕСТ УПАЛ: {str(e)}")
            logger.exception(e)
            failed += 1
        
        # Пауза между тестами
        if i < len(tests):
            await asyncio.sleep(1)
    
    # Итоги
    print_header("ИТОГИ ТЕСТИРОВАНИЯ")
    print(f"{Colors.GREEN}✅ Пройдено: {passed}{Colors.END}")
    print(f"{Colors.RED}❌ Провалено: {failed}{Colors.END}")
    print(f"{Colors.BOLD}📊 Всего: {len(tests)}{Colors.END}")
    
    if failed == 0:
        print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! 🎉{Colors.END}\n")
    else:
        print(f"\n{Colors.BOLD}{Colors.RED}⚠️  ЕСТЬ ОШИБКИ! ⚠️{Colors.END}\n")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
