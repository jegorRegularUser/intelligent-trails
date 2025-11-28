#!/usr/bin/env python3
"""
Intelligent Trails - ПОЛНОЕ ТЕСТИРОВАНИЕ ВСЕХ ЭНДПОИНТОВ
Тестирует как новые, так и legacy эндпоинты

Использование:
    python test_all_endpoints.py
    python test_all_endpoints.py --host https://your-backend.onrender.com
"""

import requests
import json
import sys
from typing import Dict, Any
import argparse


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class APITester:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.passed = 0
        self.failed = 0
        
    def print_header(self, text: str):
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
    
    def print_test(self, name: str, status: str, details: str = ""):
        if status == "PASS":
            icon = "✅"
            color = Colors.GREEN
            self.passed += 1
        else:
            icon = "❌"
            color = Colors.RED
            self.failed += 1
            
        print(f"{icon} {color}{status}{Colors.RESET} - {name}")
        if details:
            print(f"  {Colors.YELLOW}{details}{Colors.RESET}")
    
    def test_get(self, endpoint: str, name: str):
        try:
            response = requests.get(f"{self.base_url}{endpoint}", timeout=10)
            if response.status_code == 200:
                self.print_test(name, "PASS", f"Status: {response.status_code}")
                return response.json()
            else:
                self.print_test(name, "FAIL", f"Status: {response.status_code}")
                return None
        except Exception as e:
            self.print_test(name, "FAIL", str(e))
            return None
    
    def test_post(self, endpoint: str, name: str, data: Dict[str, Any]):
        try:
            response = requests.post(
                f"{self.base_url}{endpoint}",
                json=data,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            if response.status_code == 200:
                self.print_test(name, "PASS", f"Status: {response.status_code}")
                return response.json()
            else:
                self.print_test(name, "FAIL", f"Status: {response.status_code}, Body: {response.text[:200]}")
                return None
        except Exception as e:
            self.print_test(name, "FAIL", str(e))
            return None
    
    def run_all_tests(self):
        print(f"{Colors.BOLD}\n🚀 Тестирование API: {self.base_url}{Colors.RESET}\n")
        
        # ===================================================================
        # BASIC ENDPOINTS
        # ===================================================================
        self.print_header("🔍 БАЗОВЫЕ ЭНДПОИНТЫ")
        
        self.test_get("/", "Root endpoint")
        self.test_get("/status", "Status endpoint")
        self.test_get("/health", "Health check endpoint")
        self.test_get("/api/route/modes", "Get routing modes")
        
        # ===================================================================
        # NEW API - ROUTE BUILDING
        # ===================================================================
        self.print_header("🆕 НОВЫЙ API - ПОСТРОЕНИЕ МАРШРУТОВ")
        
        # Test 1: Simple route with 2 places (pedestrian)
        route_data_simple = {
            "places": [
                {
                    "name": "Красная площадь",
                    "coordinates": [37.6173, 55.7539],
                    "type": "must_visit"
                },
                {
                    "name": "ГУМ",
                    "coordinates": [37.6211, 55.7558],
                    "type": "must_visit"
                }
            ],
            "mode": "pedestrian",
            "optimize": False
        }
        result1 = self.test_post("/api/route/build", "Build simple pedestrian route (2 places)", route_data_simple)
        
        # Test 2: Route with 3 places (driving)
        route_data_3places = {
            "places": [
                {"name": "Кремль", "coordinates": [37.6173, 55.7520], "type": "must_visit"},
                {"name": "Большой театр", "coordinates": [37.6195, 55.7603], "type": "must_visit"},
                {"name": "Парк Горького", "coordinates": [37.6093, 55.7310], "type": "must_visit"}
            ],
            "mode": "driving",
            "optimize": True
        }
        result2 = self.test_post("/api/route/build", "Build driving route (3 places, optimized)", route_data_3places)
        
        # Test 3: Masstransit mode
        route_data_transit = {
            "places": [
                {"name": "ВДНХ", "coordinates": [37.6343, 55.8215], "type": "must_visit"},
                {"name": "МГУ", "coordinates": [37.5337, 55.7030], "type": "must_visit"}
            ],
            "mode": "masstransit",
            "optimize": False
        }
        result3 = self.test_post("/api/route/build", "Build masstransit route", route_data_transit)
        
        # ===================================================================
        # LEGACY API - SMART WALK
        # ===================================================================
        self.print_header("👴 LEGACY API - SMART WALK")
        
        smart_walk_data = {
            "start_point": {
                "name": "Красная площадь",
                "coords": [37.6173, 55.7539]
            },
            "activities": [
                {
                    "type": "place",
                    "duration_minutes": 15,
                    "specific_place": {
                        "name": "ГУМ",
                        "coords": [37.6211, 55.7558]
                    },
                    "transport_mode": "pedestrian",
                    "time_at_place": 30
                },
                {
                    "type": "walk",
                    "duration_minutes": 20,
                    "walking_style": "scenic",
                    "transport_mode": "pedestrian"
                }
            ],
            "return_to_start": False
        }
        result4 = self.test_post("/calculate_smart_walk", "Legacy: Calculate smart walk", smart_walk_data)
        
        # ===================================================================
        # LEGACY API - REBUILD SEGMENT
        # ===================================================================
        self.print_header("🔄 LEGACY API - REBUILD SEGMENT")
        
        rebuild_data = {
            "activity_index": 0,
            "new_place": {
                "name": "Центральный парк",
                "coords": [37.6150, 55.7540]
            },
            "prev_place_coords": [37.6173, 55.7539],
            "transport_mode": "pedestrian"
        }
        result5 = self.test_post("/rebuild_route_segment", "Legacy: Rebuild route segment", rebuild_data)
        
        # ===================================================================
        # DETAILED RESULTS
        # ===================================================================
        self.print_header("📊 ДЕТАЛИ РЕЗУЛЬТАТОВ")
        
        if result1:
            print(f"\n{Colors.BOLD}Пешеходный маршрут:{Colors.RESET}")
            summary = result1.get('summary', {})
            print(f"  • Дистанция: {summary.get('total_distance_km')} км")
            print(f"  • Время: {summary.get('total_duration_minutes')} мин")
            print(f"  • Мест: {summary.get('number_of_places')}")
            print(f"  • Сегментов: {summary.get('number_of_segments')}")
            
        if result2:
            print(f"\n{Colors.BOLD}Автомобильный маршрут (оптимизированный):{Colors.RESET}")
            summary = result2.get('summary', {})
            print(f"  • Дистанция: {summary.get('total_distance_km')} км")
            print(f"  • Время: {summary.get('total_duration_minutes')} мин")
            print(f"  • Оптимизация: {result2.get('optimization_applied')}")
            
        if result4:
            print(f"\n{Colors.BOLD}Smart Walk:{Colors.RESET}")
            print(f"  • Активностей: {len(result4.get('activities', []))}")
            print(f"  • Общая длительность: {result4.get('total_duration_minutes')} мин")
            print(f"  • Расстояние: {result4.get('total_distance_meters')} м")
            warnings = result4.get('warnings', [])
            if warnings:
                print(f"  ⚠️  Предупреждения: {len(warnings)}")
        
        # ===================================================================
        # SUMMARY
        # ===================================================================
        self.print_header("🏁 ИТОГИ ТЕСТИРОВАНИЯ")
        
        total = self.passed + self.failed
        success_rate = (self.passed / total * 100) if total > 0 else 0
        
        print(f"\n{Colors.BOLD}Результаты:{Colors.RESET}")
        print(f"  {Colors.GREEN}✅ Успешно: {self.passed}{Colors.RESET}")
        print(f"  {Colors.RED}❌ Провалено: {self.failed}{Colors.RESET}")
        print(f"  {Colors.BLUE}🎯 Успешность: {success_rate:.1f}%{Colors.RESET}")
        
        if self.failed == 0:
            print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!{Colors.RESET}\n")
            return 0
        else:
            print(f"\n{Colors.BOLD}{Colors.RED}⚠️  НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛЕНЫ{Colors.RESET}\n")
            return 1


def main():
    parser = argparse.ArgumentParser(description='Test Intelligent Trails API')
    parser.add_argument(
        '--host',
        default='http://localhost:8000',
        help='Backend URL (default: http://localhost:8000)'
    )
    
    args = parser.parse_args()
    
    tester = APITester(args.host)
    exit_code = tester.run_all_tests()
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
