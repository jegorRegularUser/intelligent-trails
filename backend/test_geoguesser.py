"""
ТЕСТ ГЕОГЕССЕР - Проверка поиска мест через Yandex Search API

Этот тест проверяет работу поиска мест с разными параметрами:
- Разные города/координаты
- Разные категории поиска
- Разные радиусы поиска
- Разное количество результатов
"""

import asyncio
import aiohttp
import logging
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Загружаем API ключ
load_dotenv()
YANDEX_API_KEY = os.getenv("YANDEX_SUGGEST_API_KEY")

# Цвета для вывода
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
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(100)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}\n")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.END}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")

def print_info(text: str):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.END}")


# ============================================================================
# YANDEX SEARCH API
# ============================================================================

async def search_places_yandex(
    query: str,
    center: List[float],
    radius_m: int = 5000,
    results: int = 10,
    api_key: str = None
) -> List[Dict]:
    """
    Поиск мест через Yandex Search API

    Args:
        query: Поисковый запрос (например "кафе", "парк", "музей")
        center: [longitude, latitude] центр поиска
        radius_m: Радиус поиска в метрах
        results: Максимальное количество результатов
        api_key: API ключ Яндекса

    Returns:
        List[Dict]: Список найденных мест
    """
    if not api_key:
        api_key = YANDEX_API_KEY

    url = "https://search-maps.yandex.ru/v1/"

    params = {
        "apikey": api_key,
        "text": query,
        "lang": "ru_RU",
        "ll": f"{center[0]},{center[1]}",  # longitude,latitude
        "spn": f"{radius_m/111000},{radius_m/111000}",  # примерный span
        "results": results,
        "type": "biz"  # business search
    }

    logger.info(f"🔍 Searching for '{query}' near {center}, radius={radius_m}m, results={results}")
    logger.debug(f"Request params: {params}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"API Error {response.status}: {error_text}")
                    return []

                data = await response.json()

                # Парсим результаты
                features = data.get("features", [])
                places = []

                for feature in features:
                    props = feature.get("properties", {})
                    geom = feature.get("geometry", {})
                    coords = geom.get("coordinates", [])

                    place = {
                        "name": props.get("name", "Без названия"),
                        "description": props.get("description", ""),
                        "coordinates": coords,  # [lon, lat]
                        "category": props.get("GeocoderMetaData", {}).get("kind", "unknown"),
                        "address": props.get("CompanyMetaData", {}).get("address", "")
                    }
                    places.append(place)

                logger.info(f"✅ Found {len(places)} places for '{query}'")
                return places

    except Exception as e:
        logger.error(f"Exception during search: {str(e)}", exc_info=True)
        return []


# ============================================================================
# ТЕСТОВЫЕ СЦЕНАРИИ
# ============================================================================

# Тестовые локации (город, координаты [lon, lat])
TEST_LOCATIONS = {
    "Нижний Новгород": [44.004014, 56.318773],
    "Москва (Красная площадь)": [37.6173, 55.7558],
    "Санкт-Петербург (Эрмитаж)": [30.3141, 59.9398],
    "Екатеринбург": [60.5974, 56.8389],
    "Казань": [49.1221, 55.7887]
}

# Тестовые категории
TEST_CATEGORIES = [
    "кафе",
    "ресторан",
    "парк",
    "музей",
    "торговый центр",
    "аптека",
    "банк",
    "гостиница"
]

# Тестовые радиусы (метры)
TEST_RADII = [
    1000,   # 1 км
    5000,   # 5 км
    10000,  # 10 км
    20000   # 20 км
]

# Количество результатов
TEST_RESULT_COUNTS = [5, 10, 20, 50]


async def test_basic_search():
    """Тест 1: Базовый поиск в разных городах"""
    print_header("ТЕСТ 1: БАЗОВЫЙ ПОИСК В РАЗНЫХ ГОРОДАХ")

    query = "кафе"
    radius = 5000
    results_count = 10

    for city_name, coords in TEST_LOCATIONS.items():
        print(f"\n{Colors.BOLD}📍 {city_name}{Colors.END}")
        print(f"   Координаты: {coords}")

        places = await search_places_yandex(
            query=query,
            center=coords,
            radius_m=radius,
            results=results_count,
            api_key=YANDEX_API_KEY
        )

        if places:
            print_success(f"Найдено {len(places)} мест:")
            for i, place in enumerate(places[:3], 1):  # Показываем первые 3
                print(f"   {i}. {place['name']}")
                print(f"      📍 {place['coordinates']}")
                if place.get('address'):
                    print(f"      🏠 {place['address']}")
        else:
            print_error(f"Не найдено мест для '{query}'")

        # Пауза между запросами
        await asyncio.sleep(1)


async def test_different_categories():
    """Тест 2: Разные категории в одном городе"""
    print_header("ТЕСТ 2: РАЗНЫЕ КАТЕГОРИИ В ОДНОМ ГОРОДЕ")

    city_name = "Нижний Новгород"
    coords = TEST_LOCATIONS[city_name]
    radius = 5000
    results_count = 5

    print(f"{Colors.BOLD}Город: {city_name}{Colors.END}")
    print(f"Координаты: {coords}")
    print(f"Радиус: {radius}м, Результатов: {results_count}\n")

    for category in TEST_CATEGORIES:
        print(f"\n{Colors.CYAN}🔍 Категория: {category}{Colors.END}")

        places = await search_places_yandex(
            query=category,
            center=coords,
            radius_m=radius,
            results=results_count,
            api_key=YANDEX_API_KEY
        )

        if places:
            print_success(f"✅ Найдено {len(places)} мест")
            for place in places[:2]:  # Показываем первые 2
                print(f"   • {place['name']}")
        else:
            print_error(f"❌ Ничего не найдено")

        await asyncio.sleep(0.5)


async def test_different_radii():
    """Тест 3: Разные радиусы поиска"""
    print_header("ТЕСТ 3: РАЗНЫЕ РАДИУСЫ ПОИСКА")

    city_name = "Нижний Новгород"
    coords = TEST_LOCATIONS[city_name]
    query = "кафе"
    results_count = 20

    print(f"{Colors.BOLD}Город: {city_name}{Colors.END}")
    print(f"Категория: {query}\n")

    for radius in TEST_RADII:
        print(f"\n{Colors.YELLOW}📏 Радиус: {radius}м ({radius/1000:.1f}км){Colors.END}")

        places = await search_places_yandex(
            query=query,
            center=coords,
            radius_m=radius,
            results=results_count,
            api_key=YANDEX_API_KEY
        )

        if places:
            print_success(f"Найдено {len(places)} мест")
            # Показываем самое ближнее и самое дальнее
            if len(places) > 1:
                print(f"   Ближайшее: {places[0]['name']}")
                print(f"   Дальнее: {places[-1]['name']}")
        else:
            print_error("Ничего не найдено")

        await asyncio.sleep(0.5)


async def test_different_result_counts():
    """Тест 4: Разное количество результатов"""
    print_header("ТЕСТ 4: РАЗНОЕ КОЛИЧЕСТВО РЕЗУЛЬТАТОВ")

    city_name = "Москва (Красная площадь)"
    coords = TEST_LOCATIONS[city_name]
    query = "ресторан"
    radius = 5000

    print(f"{Colors.BOLD}Город: {city_name}{Colors.END}")
    print(f"Категория: {query}, Радиус: {radius}м\n")

    for count in TEST_RESULT_COUNTS:
        print(f"\n{Colors.MAGENTA}📊 Запрашиваем {count} результатов{Colors.END}")

        places = await search_places_yandex(
            query=query,
            center=coords,
            radius_m=radius,
            results=count,
            api_key=YANDEX_API_KEY
        )

        if places:
            print_success(f"Получено {len(places)} мест")
            if len(places) >= 3:
                print(f"   1. {places[0]['name']}")
                print(f"   2. {places[1]['name']}")
                print(f"   ...")
                print(f"   {len(places)}. {places[-1]['name']}")
        else:
            print_error("Ничего не найдено")

        await asyncio.sleep(0.5)


async def test_edge_cases():
    """Тест 5: Крайние случаи"""
    print_header("ТЕСТ 5: КРАЙНИЕ СЛУЧАИ")

    coords = TEST_LOCATIONS["Нижний Новгород"]

    # 1. Очень маленький радиус
    print(f"\n{Colors.BOLD}1. Очень маленький радиус (100м){Colors.END}")
    places = await search_places_yandex("кафе", coords, radius_m=100, results=10)
    print(f"Найдено: {len(places)}")

    await asyncio.sleep(0.5)

    # 2. Очень большой радиус
    print(f"\n{Colors.BOLD}2. Очень большой радиус (50км){Colors.END}")
    places = await search_places_yandex("кафе", coords, radius_m=50000, results=10)
    print(f"Найдено: {len(places)}")

    await asyncio.sleep(0.5)

    # 3. Несуществующая категория
    print(f"\n{Colors.BOLD}3. Несуществующая категория{Colors.END}")
    places = await search_places_yandex("аькнпимрщтьл", coords, radius_m=5000, results=10)
    print(f"Найдено: {len(places)}")

    await asyncio.sleep(0.5)

    # 4. Пустой запрос
    print(f"\n{Colors.BOLD}4. Пустой запрос{Colors.END}")
    places = await search_places_yandex("", coords, radius_m=5000, results=10)
    print(f"Найдено: {len(places)}")

    await asyncio.sleep(0.5)

    # 5. Очень специфичный запрос
    print(f"\n{Colors.BOLD}5. Очень специфичный запрос{Colors.END}")
    places = await search_places_yandex("пиццерия с доставкой", coords, radius_m=5000, results=10)
    print(f"Найдено: {len(places)}")


async def test_coordinates_format():
    """Тест 6: Проверка формата координат"""
    print_header("ТЕСТ 6: ПРОВЕРКА ФОРМАТА КООРДИНАТ В ОТВЕТЕ")

    coords = TEST_LOCATIONS["Нижний Новгород"]
    query = "кафе"

    places = await search_places_yandex(query, coords, radius_m=5000, results=5)

    if places:
        print_success(f"Найдено {len(places)} мест\n")

        for i, place in enumerate(places, 1):
            print(f"{Colors.BOLD}{i}. {place['name']}{Colors.END}")
            print(f"   Координаты: {place['coordinates']}")

            # Проверяем формат
            coords_list = place['coordinates']
            if isinstance(coords_list, list) and len(coords_list) == 2:
                lon, lat = coords_list
                print(f"   ✅ Формат OK: lon={lon}, lat={lat}")

                # Проверяем диапазон
                if -180 <= lon <= 180 and -90 <= lat <= 90:
                    print(f"   ✅ Диапазон OK")
                else:
                    print_error(f"   ❌ Координаты вне диапазона!")
            else:
                print_error(f"   ❌ Неверный формат координат!")
            print()
    else:
        print_error("Места не найдены")


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

async def run_all_tests():
    """Запуск всех тестов"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("=" * 100)
    print(" ТЕСТ ГЕОГЕССЕР - ПРОВЕРКА YANDEX SEARCH API ".center(100))
    print("=" * 100)
    print(Colors.END)

    if not YANDEX_API_KEY:
        print_error("❌ YANDEX_API_KEY не найден в .env!")
        return

    print_success(f"API ключ найден: {YANDEX_API_KEY[:20]}...\n")

    tests = [
        ("Базовый поиск в разных городах", test_basic_search),
        ("Разные категории в одном городе", test_different_categories),
        ("Разные радиусы поиска", test_different_radii),
        ("Разное количество результатов", test_different_result_counts),
        ("Крайние случаи", test_edge_cases),
        ("Проверка формата координат", test_coordinates_format),
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
        print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! 🎉{Colors.END}\n")
    else:
        print(f"\n{Colors.BOLD}{Colors.RED}⚠️  ЕСТЬ ОШИБКИ - ПРОВЕРЬ ЛОГИ! ⚠️{Colors.END}\n")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
