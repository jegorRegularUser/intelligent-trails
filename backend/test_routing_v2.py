"""
Жесткий тест нового бэкенда v2.1.0
Проверяет индивидуальные режимы транспорта и категории
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

# Импорты из бэкенда
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
    MAGENTA = '\033[95m'


def print_header(text: str):
    """Красивый заголовок"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(100)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}\n")


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


def print_segment(text: str):
    """Сегмент маршрута"""
    print(f"{Colors.MAGENTA}🛤️  {text}{Colors.END}")


def print_json(data: Dict, title: str = ""):
    """Красивый вывод JSON"""
    if title:
        print(f"\n{Colors.BOLD}{Colors.WHITE}{title}:{Colors.END}")
    print(json.dumps(data, indent=2, ensure_ascii=False))


# ============================================================================
# ТЕСТОВЫЕ ДАННЫЕ (КАК С ФРОНТЕНДА)
# ============================================================================

# Тест 1: Реалистичный маршрут с категориями и индивидуальными режимами
TEST_REALISTIC_ROUTE = [
    {
        "name": "Старт",
        "coordinates": [56.318773, 44.004014],  # Красная площадь
        "type": "must_visit",
        "transport_mode": "pedestrian"
    },
    {
        "name": "кафе",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "кафе",
        "transport_mode": "pedestrian"  # До кафе пешком
    },
    {
        "name": "парк",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "парк",
        "transport_mode": "bicycle"  # До парка на велосипеде
    },
    {
        "name": "музей",
        "coordinates": [0, 0],
        "type": "must_visit",
        "category": "музей",
        "transport_mode": "auto"  # До музея на машине
    },
    {
        "name": "Возврат",
        "coordinates": [56.318773, 44.004014],
        "type": "must_visit",
        "transport_mode": "masstransit"  # Обратно на транспорте
    }
]

# Тест 2: Только категории (хардкор)
TEST_CATEGORIES_ONLY = [
    {"name": "кафе", "coordinates": [0, 0], "type": "must_visit", "category": "кафе", "transport_mode": "pedestrian"},
    {"name": "ресторан", "coordinates": [0, 0], "type": "must_visit", "category": "ресторан", "transport_mode": "pedestrian"},
    {"name": "парк", "coordinates": [0, 0], "type": "must_visit", "category": "парк", "transport_mode": "bicycle"},
    {"name": "музей", "coordinates": [0, 0], "type": "must_visit", "category": "музей", "transport_mode": "auto"},
]

# Тест 3: Смешанный маршрут (категории + конкретные места)
TEST_MIXED_ROUTE = [
    {"name": "Эрмитаж", "coordinates": [30.3141, 59.9398], "type": "must_visit", "transport_mode": "pedestrian"},
    {"name": "кафе", "coordinates": [0, 0], "type": "must_visit", "category": "кафе", "transport_mode": "pedestrian"},
    {"name": "Петропавловская крепость", "coordinates": [30.3167, 59.9500], "type": "must_visit", "transport_mode": "auto"},
]

# Тест 4: "Закончить в интересном месте"
TEST_SMART_ENDING = [
    {"name": "Старт", "coordinates": [37.6173, 55.7558], "type": "must_visit", "transport_mode": "pedestrian"},
    {"name": "кафе", "coordinates": [0, 0], "type": "must_visit", "category": "кафе", "transport_mode": "pedestrian"},
    {"name": "Интересное место", "coordinates": [0, 0], "type": "must_visit", "category": "музей", "transport_mode": "pedestrian"}
]


# ============================================================================
# ТЕСТОВЫЕ ФУНКЦИИ
# ============================================================================

async def test_realistic_route():
    """Тест 1: Реалистичный маршрут с разными режимами транспорта"""
    print_header("ТЕСТ 1: РЕАЛИСТИЧНЫЙ МАРШРУТ С ИНДИВИДУАЛЬНЫМИ РЕЖИМАМИ")
    
    print_info("Входные данные (как с фронта):")
    print_json(TEST_REALISTIC_ROUTE)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        start_time = datetime.now()
        
        route_data = await routing_service.build_route(
            places=TEST_REALISTIC_ROUTE,
            optimize=True
        )
        
        elapsed = (datetime.now() - start_time).total_seconds()
        
        if route_data.get('success'):
            print_success(f"Маршрут построен за {elapsed:.2f}с")
            
            # Summary
            summary = route_data['summary']
            print(f"\n{Colors.BOLD}📊 ИТОГОВАЯ СТАТИСТИКА:{Colors.END}")
            print(f"  📍 Мест в маршруте: {summary['number_of_places']}")
            print(f"  📏 Общее расстояние: {summary['total_distance_km']:.2f} км ({summary['total_distance']:.0f} м)")
            print(f"  ⏱️  Общее время: {summary['total_duration_minutes']:.0f} мин ({summary['total_duration']:.0f} сек)")
            print(f"  🔄 Оптимизация: {'Да' if route_data['optimization_applied'] else 'Нет'}")
            
            # Places
            print(f"\n{Colors.BOLD}📍 НАЙДЕННЫЕ МЕСТА:{Colors.END}")
            for place in route_data['places']:
                mode_icon = {'pedestrian': '🚶', 'bicycle': '🚴', 'auto': '🚗', 'masstransit': '🚌'}.get(
                    place['transport_mode'], '🚶'
                )
                category_str = f" [{place['category']}]" if place.get('category') else ""
                print(f"  {place['order']}. {mode_icon} {place['name']}{category_str}")
                print(f"     📍 {place['coordinates']}")
                if place.get('address'):
                    print(f"     🏠 {place['address']}")
            
            # Segments - ДЕТАЛЬНАЯ ПРОВЕРКА
            print(f"\n{Colors.BOLD}🛤️  СЕГМЕНТЫ МАРШРУТА (ДЕТАЛЬНО):{Colors.END}")
            for i, segment in enumerate(route_data['segments'], 1):
                mode = segment['mode']
                mode_icon = segment['style']['icon']
                mode_color = segment['style']['color']
                
                print_segment(f"Сегмент {i}: {segment['from']['name']} → {segment['to']['name']}")
                print(f"     {mode_icon} Режим: {segment['mode_display']} ({mode})")
                print(f"     📏 Расстояние: {segment['distance']:.0f}м ({segment['distance']/1000:.2f}км)")
                print(f"     ⏱️  Время: {segment['duration']:.0f}с ({segment['duration']/60:.1f}мин)")
                print(f"     🎨 Цвет линии: {mode_color}")
                print(f"     📝 {segment['instructions']}")
                
                # Проверяем геометрию
                geom_len = len(segment['geometry'])
                if geom_len < 2:
                    print_error(f"     ❌ НЕТ ГЕОМЕТРИИ!")
                elif geom_len == 2:
                    print_warning(f"     ⚠️  Прямая линия ({geom_len} точки)")
                else:
                    print_success(f"     ✅ Геометрия OK ({geom_len} точек)")
            
            # Полный JSON (для отладки)
            print_json(route_data, "\n📦 ПОЛНЫЙ JSON ОТВЕТА")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            print_json(route_data)
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_categories_only():
    """Тест 2: Только категории (без стартовой точки)"""
    print_header("ТЕСТ 2: ТОЛЬКО КАТЕГОРИИ (ХАРДКОР)")
    
    print_warning("⚠️  КРИТИЧЕСКИЙ ТЕСТ: Все места - категории без координат!")
    print_info("Входные данные:")
    print_json(TEST_CATEGORIES_ONLY)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_CATEGORIES_ONLY,
            optimize=False  # Не оптимизируем чтобы сохранить порядок
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен!")
            
            summary = route_data['summary']
            print(f"\n📊 Найдено мест: {summary['number_of_places']}")
            print(f"📏 Расстояние: {summary['total_distance_km']:.2f} км")
            print(f"⏱️  Время: {summary['total_duration_minutes']:.0f} мин")
            
            # Проверяем что все категории разрешились
            print(f"\n{Colors.BOLD}Проверка разрешения категорий:{Colors.END}")
            for place in route_data['places']:
                if place.get('category'):
                    has_coords = place['coordinates'] != [0, 0]
                    if has_coords:
                        print_success(f"  ✅ '{place['category']}' → {place['name']} {place['coordinates']}")
                    else:
                        print_error(f"  ❌ '{place['category']}' → НЕ РАЗРЕШЕНА!")
                else:
                    print_info(f"  ℹ️  '{place['name']}' - конкретное место")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_mixed_route():
    """Тест 3: Смешанный маршрут"""
    print_header("ТЕСТ 3: СМЕШАННЫЙ МАРШРУТ (КООРДИНАТЫ + КАТЕГОРИИ)")
    
    print_info("Входные данные:")
    print_json(TEST_MIXED_ROUTE)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_MIXED_ROUTE,
            optimize=False
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен!")
            
            # Проверяем типы мест
            print(f"\n{Colors.BOLD}Анализ типов мест:{Colors.END}")
            for place in route_data['places']:
                if place.get('category'):
                    print(f"  🔍 Категория: {place['category']} → Найдено: {place['name']}")
                else:
                    print(f"  📍 Конкретное место: {place['name']}")
            
            # Проверяем режимы транспорта
            print(f"\n{Colors.BOLD}Проверка режимов транспорта:{Colors.END}")
            for segment in route_data['segments']:
                expected_mode = segment['to'].get('transport_mode', 'N/A')
                actual_mode = segment['mode']
                
                if expected_mode == 'N/A' or expected_mode == actual_mode:
                    print_success(f"  {segment['from']['name']} → {segment['to']['name']}: {actual_mode}")
                else:
                    print_error(f"  {segment['from']['name']} → {segment['to']['name']}: ожидался {expected_mode}, получен {actual_mode}")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_smart_ending():
    """Тест 4: Закончить в интересном месте"""
    print_header("ТЕСТ 4: ЗАКОНЧИТЬ В ИНТЕРЕСНОМ МЕСТЕ")
    
    print_info("Сценарий: пользователь выбрал 'Закончить в интересном месте'")
    print_info("Входные данные:")
    print_json(TEST_SMART_ENDING)
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    try:
        route_data = await routing_service.build_route(
            places=TEST_SMART_ENDING,
            optimize=False
        )
        
        if route_data.get('success'):
            print_success("Маршрут построен!")
            
            # Проверяем последнее место
            last_place = route_data['places'][-1]
            print(f"\n{Colors.BOLD}Проверка финальной точки:{Colors.END}")
            
            if last_place.get('category') == 'музей':
                print_success(f"  ✅ Система нашла интересное место: {last_place['name']}")
                print(f"     📍 {last_place['coordinates']}")
                if last_place.get('address'):
                    print(f"     🏠 {last_place['address']}")
            else:
                print_warning(f"  ⚠️  Финальное место: {last_place['name']} (возможно не музей)")
            
        else:
            print_error(f"Ошибка: {route_data.get('error')}")
            
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


async def test_transport_modes_validation():
    """Тест 5: Валидация режимов транспорта"""
    print_header("ТЕСТ 5: ВАЛИДАЦИЯ ВСЕХ РЕЖИМОВ ТРАНСПОРТА")
    
    test_places = [
        {"name": "A", "coordinates": [37.6173, 55.7558], "type": "must_visit", "transport_mode": "pedestrian"},
        {"name": "B", "coordinates": [37.6300, 55.7600], "type": "must_visit", "transport_mode": "pedestrian"}
    ]
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    for mode in ['pedestrian', 'bicycle', 'auto', 'masstransit']:
        print(f"\n{Colors.BOLD}🚶 Тестируем режим: {mode.upper()}{Colors.END}")
        
        # Меняем режим для второго места
        test_places[1]['transport_mode'] = mode
        
        try:
            route_data = await routing_service.build_route(
                places=test_places,
                optimize=False
            )
            
            if route_data.get('success'):
                segment = route_data['segments'][0]
                mode_config = ROUTING_MODES.get(mode, {})
                
                print_success(f"  ✅ Режим: {segment['mode']} (ожидался {mode})")
                print(f"     {mode_config.get('icon', '?')} {segment['mode_display']}")
                print(f"     📏 {segment['distance']:.0f}м")
                print(f"     ⏱️  {segment['duration']:.0f}с")
                print(f"     🎨 Цвет: {mode_config.get('color', 'N/A')}")
                
                # Проверяем соответствие
                if segment['mode'] == mode:
                    print_success(f"     ✅ Режим совпадает!")
                else:
                    print_error(f"     ❌ Режим НЕ совпадает! Ожидался {mode}, получен {segment['mode']}")
            else:
                print_error(f"  ❌ Ошибка: {route_data.get('error')}")
                
        except Exception as e:
            print_error(f"  ❌ Исключение: {str(e)}")


async def test_api_compatibility():
    """Тест 6: Совместимость с API (формат JSON)"""
    print_header("ТЕСТ 6: ПРОВЕРКА ФОРМАТА JSON ДЛЯ ФРОНТЕНДА")
    
    print_info("Проверяем что все поля присутствуют и корректны...")
    
    routing_service = get_routing_service(YANDEX_API_KEY)
    
    test_places = [
        {"name": "Старт", "coordinates": [37.6173, 55.7558], "type": "must_visit", "transport_mode": "pedestrian"},
        {"name": "кафе", "coordinates": [0, 0], "category": "кафе", "type": "must_visit", "transport_mode": "bicycle"},
        {"name": "Финиш", "coordinates": [37.6300, 55.7600], "type": "must_visit", "transport_mode": "auto"}
    ]
    
    try:
        route_data = await routing_service.build_route(places=test_places, optimize=False)
        
        if not route_data.get('success'):
            print_error(f"Маршрут не построен: {route_data.get('error')}")
            return
        
        # Проверяем структуру
        print(f"\n{Colors.BOLD}Проверка структуры JSON:{Colors.END}")
        
        required_fields = ['success', 'places', 'segments', 'summary', 'optimization_applied']
        for field in required_fields:
            if field in route_data:
                print_success(f"  ✅ Поле '{field}' присутствует")
            else:
                print_error(f"  ❌ Поле '{field}' ОТСУТСТВУЕТ!")
        
        # Проверяем places
        print(f"\n{Colors.BOLD}Проверка структуры places:{Colors.END}")
        place_fields = ['id', 'name', 'coordinates', 'address', 'type', 'transport_mode', 'order', 'marker']
        
        for place in route_data['places']:
            missing = [f for f in place_fields if f not in place]
            if not missing:
                print_success(f"  ✅ Place '{place['name']}' - все поля OK")
            else:
                print_error(f"  ❌ Place '{place['name']}' - отсутствуют: {', '.join(missing)}")
        
        # Проверяем segments
        print(f"\n{Colors.BOLD}Проверка структуры segments:{Colors.END}")
        segment_fields = ['from', 'to', 'geometry', 'distance', 'duration', 'mode', 'mode_display', 'instructions', 'style']
        
        for i, segment in enumerate(route_data['segments']):
            missing = [f for f in segment_fields if f not in segment]
            if not missing:
                print_success(f"  ✅ Segment {i+1} - все поля OK")
            else:
                print_error(f"  ❌ Segment {i+1} - отсутствуют: {', '.join(missing)}")
        
        # Проверяем summary
        print(f"\n{Colors.BOLD}Проверка summary:{Colors.END}")
        summary_fields = ['total_distance', 'total_duration', 'total_distance_km', 'total_duration_hours', 
                         'total_duration_minutes', 'number_of_places', 'number_of_segments']
        
        summary = route_data['summary']
        missing = [f for f in summary_fields if f not in summary]
        if not missing:
            print_success(f"  ✅ Summary - все поля OK")
        else:
            print_error(f"  ❌ Summary - отсутствуют: {', '.join(missing)}")
        
    except Exception as e:
        print_error(f"Исключение: {str(e)}")
        logger.exception(e)


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

async def run_all_tests():
    """Запуск всех тестов"""
    
    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("=" * 100)
    print(" ТЕСТИРОВАНИЕ НОВОГО БЭКЕНДА v2.1.0 ".center(100))
    print(" С ИНДИВИДУАЛЬНЫМИ РЕЖИМАМИ ТРАНСПОРТА И КАТЕГОРИЯМИ ".center(100))
    print(f" {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ".center(100))
    print("=" * 100)
    print(Colors.END)
    
    if not YANDEX_API_KEY:
        print_error("YANDEX_API_KEY не найден в .env!")
        return
    
    print_success(f"API ключ найден: {YANDEX_API_KEY[:20]}...")
    
    tests = [
        ("Реалистичный маршрут с разными режимами", test_realistic_route),
        ("Только категории (хардкор)", test_categories_only),
        ("Смешанный маршрут", test_mixed_route),
        ("Закончить в интересном месте", test_smart_ending),
        ("Валидация режимов транспорта", test_transport_modes_validation),
        ("Совместимость JSON с фронтендом", test_api_compatibility),
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
            await asyncio.sleep(2)
    
    # Итоги
    print_header("ИТОГИ ТЕСТИРОВАНИЯ")
    print(f"{Colors.GREEN}✅ Пройдено: {passed}{Colors.END}")
    print(f"{Colors.RED}❌ Провалено: {failed}{Colors.END}")
    print(f"{Colors.BOLD}📊 Всего: {len(tests)}{Colors.END}")
    
    if failed == 0:
        print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! БЭКЕНД ГОТОВ К ПРОДАКШЕНУ! 🎉{Colors.END}\n")
    else:
        print(f"\n{Colors.BOLD}{Colors.RED}⚠️  ЕСТЬ ОШИБКИ - ПРОВЕРЬ ЛОГИ! ⚠️{Colors.END}\n")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
