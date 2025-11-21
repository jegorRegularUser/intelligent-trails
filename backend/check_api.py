import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("YANDEX_API_KEY")
URL = "https://api.routing.yandex.net/v2/directions"

# Координаты (Кремль и ГУМ - они рядом)
LAT1, LON1 = 55.751574, 37.573856
LAT2, LON2 = 55.754724, 37.621380

def test_format(name, wp_val):
    print(f"\n--- Тест формата: {name} ---")
    print(f"Waypoints: {wp_val}")
    params = {
        "apikey": API_KEY,
        "waypoints": wp_val,
        "mode": "pedestrian"
    }
    try:
        resp = requests.get(URL, params=params)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("УСПЕХ! Время пути:", resp.json()['routes'][0]['legs'][0]['duration'])
            return True
        else:
            print("Ошибка:", resp.text)
            return False
    except Exception as e:
        print("Exception:", e)
        return False

# Тест 1: LAT,LON (как сейчас в коде)
test_format("LAT,LON", f"{LAT1},{LON1}|{LAT2},{LON2}")

# Тест 2: LON,LAT (альтернатива)
test_format("LON,LAT", f"{LON1},{LAT1}|{LON2},{LAT2}")
