import requests
import json

API_URL = "http://127.0.0.1:8000/calculate_route"

mock_request_data = {
    "start_point": {
        "name": "Московский Кремль",
        "coords": [55.751574, 37.573856] # LAT, LON
    },
    "categories": ["кафе", "парк", "музей"],
    "time_limit_minutes": 120, # 2 часа
    "return_to_start": True,
    "mode": "pedestrian",
    "settings": {
        "pace": "active",      # ЗАСТАВЛЯЕМ его ходить
        "time_strictness": 1   # РАЗРЕШАЕМ опаздывать
    }
}

def run_test():
    print("--- ОТПРАВКА ТЕСТОВОГО ЗАПРОСА ---")
    try:
        response = requests.post(API_URL, json=mock_request_data, timeout=60) # Тайм-аут побольше
        print(f"Статус-код: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            print("\n--- МАРШРУТ ---")
            if not data['ordered_route']:
                print("ПУСТОЙ МАРШРУТ!")
            else:
                for i, p in enumerate(data['ordered_route']):
                    print(f"{i+1}. {p['name']}")
        else:
            print(response.text)

    except Exception as e:
        print(f"Ошибка: {e}")

if __name__ == "__main__":
    run_test()
