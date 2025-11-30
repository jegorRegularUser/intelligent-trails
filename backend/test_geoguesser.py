"""
ИСПРАВЛЕНО - Правильные ключи для разных API
"""

import asyncio
import aiohttp
import logging
import json
from typing import List, Dict, Optional, Tuple
import os
from dotenv import load_dotenv
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()
YANDEX_SUGGEST_API_KEY = os.getenv("YANDEX_SUGGEST_API_KEY")
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")  # Для Geocoder и Routing

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(100)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*100}{Colors.END}\n")


def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")


def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.END}")


async def get_city_name(center: List[float]) -> str:
    """Определяет название города - ИСПОЛЬЗУЕТ YANDEX_API_KEY"""
    url = "https://geocode-maps.yandex.ru/1.x/"

    params = {
        "apikey": YANDEX_API_KEY,  # ← ROUTING/GEOCODER ключ
        "geocode": f"{center[0]},{center[1]}",
        "format": "json",
        "kind": "locality",
        "results": 1
    }

    logger.debug(f"Getting city name for {center}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=3)) as response:
                if response.status == 200:
                    data = await response.json()
                    members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])

                    if members:
                        city = members[0].get("GeoObject", {}).get("name", "")
                        logger.info(f"✅ City detected: {city}")
                        return city
                else:
                    logger.error(f"Geocoder error {response.status}")
    except Exception as e:
        logger.error(f"City detection failed: {e}")

    logger.warning("⚠️  City detection failed")
    return ""


async def geocode_smart(name: str, address: str, city: str) -> Optional[Tuple[List[float], str]]:
    """Умное геокодирование - ИСПОЛЬЗУЕТ YANDEX_API_KEY"""
    url = "https://geocode-maps.yandex.ru/1.x/"

    # Стратегии (по приоритету)
    strategies = []

    if city and address:
        strategies.append((f"{address}, {city}", "address+city"))

    if city and name and address:
        strategies.append((f"{name}, {address}, {city}", "full"))

    if city and name:
        strategies.append((f"{name} {city}", "name+city"))

    if address:
        strategies.append((f"{address}", "address_only"))

    for query, method in strategies:
        params = {
            "apikey": YANDEX_API_KEY,  # ← ROUTING/GEOCODER ключ
            "geocode": query,
            "format": "json",
            "results": 1
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=3)) as response:
                    if response.status == 200:
                        data = await response.json()
                        members = data.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])

                        if members:
                            geo_obj = members[0].get("GeoObject", {})
                            pos = geo_obj.get("Point", {}).get("pos", "")

                            if pos:
                                lon, lat = map(float, pos.split())
                                logger.debug(f"       ✅ '{method}': {query[:60]}")
                                return ([lon, lat], method)
        except:
            continue

    return None


async def search_places_yandex(
    query: str,
    center: List[float],
    results: int = 10
) -> List[Dict]:
    """
    Поиск мест через Yandex API

    Args:
        query: Категория ("кафе", "парк", etc)
        center: [lon, lat] центр поиска
        results: Количество результатов

    Returns:
        List[Dict]: name, address, coordinates, distance_m, category
    """

    logger.info(f"🔍 Searching '{query}' near {center}")

    # Шаг 1: Определяем город (для точного геокодирования)
    city = await get_city_name(center)

    if not city:
        logger.warning("⚠️  Continuing without city name")

    # Шаг 2: Suggest API для поиска организаций
    suggest_url = "https://suggest-maps.yandex.ru/v1/suggest"

    suggest_params = {
        "apikey": YANDEX_SUGGEST_API_KEY,  # ← SUGGEST ключ
        "text": query,
        "ll": f"{center[0]},{center[1]}",
        "results": results,
        "types": "biz",
        "lang": "ru_RU"
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(suggest_url, params=suggest_params) as response:
                if response.status != 200:
                    logger.error(f"Suggest API error: {response.status}")
                    return []

                data = await response.json()
                suggest_results = data.get("results", [])

                logger.info(f"📝 Suggest returned {len(suggest_results)} results")

                if not suggest_results:
                    return []

                # Шаг 3: Получаем координаты для каждого
                places = []

                for i, result in enumerate(suggest_results, 1):
                    title = result.get("title", {})
                    subtitle = result.get("subtitle", {})

                    name = title.get("text", "") if isinstance(title, dict) else str(title)
                    subtitle_text = subtitle.get("text", "") if isinstance(subtitle, dict) else str(subtitle)

                    distance = result.get("distance", {})

                    # Парсим категорию и адрес из subtitle
                    category = ""
                    address = ""
                    if "·" in subtitle_text:
                        parts = subtitle_text.split("·")
                        category = parts[0].strip()
                        address = parts[1].strip() if len(parts) > 1 else ""
                    else:
                        address = subtitle_text

                    logger.debug(f"  {i}. {name}")
                    logger.debug(f"     Address: {address}")

                    # Геокодируем
                    result_coords = await geocode_smart(name, address, city)

                    if not result_coords:
                        logger.warning(f"     ⚠️  No coords for {name}")
                        continue

                    coords, method = result_coords

                    place = {
                        "name": name,
                        "address": address,
                        "category": category,
                        "coordinates": coords,
                        "distance_m": distance.get("value", 0),
                        "distance_text": distance.get("text", ""),
                        "coords_source": f"Geocoder ({method})"
                    }

                    places.append(place)
                    logger.info(f"  ✅ {i}. {name[:40]} - {coords} ({method})")

                logger.info(f"✅ Found {len(places)}/{len(suggest_results)} with coordinates")
                return places

    except Exception as e:
        logger.error(f"Exception: {str(e)}", exc_info=True)
        return []


# ============================================================================
# ТЕСТЫ
# ============================================================================

async def test_all():
    print_header("ТЕСТ С ПРАВИЛЬНЫМИ КЛЮЧАМИ")

    print(f"{Colors.BOLD}Проверка ключей:{Colors.END}")
    print(f"  YANDEX_API_KEY: {YANDEX_API_KEY[:20] if YANDEX_API_KEY else 'НЕТ'}...")
    print(f"  YANDEX_SUGGEST_API_KEY: {YANDEX_SUGGEST_API_KEY[:20] if YANDEX_SUGGEST_API_KEY else 'НЕТ'}...\n")

    if not YANDEX_API_KEY or not YANDEX_SUGGEST_API_KEY:
        print_error("❌ Нужны оба ключа!")
        print("   YANDEX_API_KEY - для Geocoder и Routing")
        print("   YANDEX_SUGGEST_API_KEY - для Suggest")
        return

    # Тест 1: Москва
    print(f"\n{Colors.BOLD}📍 ТЕСТ: Москва, кафе{Colors.END}")
    places = await search_places_yandex("кафе", [37.6173, 55.7558], results=5)

    if places:
        print_success(f"Найдено {len(places)} мест:")
        for i, p in enumerate(places[:3], 1):
            print(f"  {i}. {p['name']}")
            print(f"     📍 {p['coordinates']}")
            print(f"     🏠 {p['address']}")
            print(f"     🔧 {p['coords_source']}")
    else:
        print_error("Ничего не найдено")

    await asyncio.sleep(1)

    # Тест 2: Нижний Новгород
    print(f"\n{Colors.BOLD}📍 ТЕСТ: Нижний Новгород, ресторан{Colors.END}")
    places = await search_places_yandex("ресторан", [44.004014, 56.318773], results=5)

    if places:
        print_success(f"Найдено {len(places)} мест:")
        for i, p in enumerate(places[:3], 1):
            print(f"  {i}. {p['name']}")
            print(f"     📍 {p['coordinates']}")
    else:
        print_error("Ничего не найдено")

    print_header("ГОТОВО!")

    if places:
        print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 РАБОТАЕТ! Используй search_places_yandex() в бэкенде{Colors.END}\n")


if __name__ == "__main__":
    asyncio.run(test_all())