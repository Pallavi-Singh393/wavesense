import os
from flask import Flask
from dotenv import load_dotenv

load_dotenv()   # 🔥 MUST be before using API key

API_KEY = os.getenv("OPENWEATHER_API_KEY")

from flask import jsonify
from flask_cors import CORS
import csv
import json
import requests
from requests.exceptions import RequestException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

OPENWEATHER_API_KEY = API_KEY
if not OPENWEATHER_API_KEY:
    print("ERROR: OPENWEATHER_API_KEY is missing. Please set it in your .env file.")

OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"

# NCR and nearby focus cities requested for real-time dashboard updates.
TARGET_CITIES = [
    "Delhi",
    "Noida",
    "Gurugram",
    "Faridabad",
    "Ghaziabad",
    "Greater Noida",
]

CITY_QUERY_ALIASES = {
    "Delhi": ["Delhi", "New Delhi"],
    "Noida": ["Noida"],
    "Gurugram": ["Gurugram", "Gurgaon"],
    "Faridabad": ["Faridabad"],
    "Ghaziabad": ["Ghaziabad"],
    "Greater Noida": ["Greater Noida", "Noida Extension"],
}

STATIC_NCR_DEFAULTS = {
    "Delhi": {"latitude": 28.6139, "longitude": 77.2090, "temperature": 39.0, "humidity": 40.0},
    "Noida": {"latitude": 28.5355, "longitude": 77.3910, "temperature": 38.0, "humidity": 42.0},
    "Gurugram": {"latitude": 28.4595, "longitude": 77.0266, "temperature": 40.0, "humidity": 35.0},
    "Faridabad": {"latitude": 28.4089, "longitude": 77.3178, "temperature": 37.0, "humidity": 44.0},
    "Ghaziabad": {"latitude": 28.6692, "longitude": 77.4538, "temperature": 38.5, "humidity": 43.0},
    "Greater Noida": {"latitude": 28.4744, "longitude": 77.5040, "temperature": 38.2, "humidity": 41.0},
}

FALLBACK_DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "weather_data.csv"
NCR_KEYWORDS = ("delhi", "noida", "gurugram", "gurgaon", "faridabad", "ghaziabad")


def city_row_from_defaults(city_name):
    defaults = STATIC_NCR_DEFAULTS[city_name]
    temp = defaults["temperature"]
    return {
        "district": city_name,
        "latitude": defaults["latitude"],
        "longitude": defaults["longitude"],
        "temperature": temp,
        "humidity": defaults["humidity"],
        "wave": detect_wave(temp),
        "forecast_temperatures": [],
        "forecast_avg_temperature": None,
        "prediction": "Normal",
    }


def is_city_match(target_city, district_name):
    district_lower = str(district_name or "").strip().lower()
    aliases = CITY_QUERY_ALIASES.get(target_city, [target_city])
    return any(alias.lower() in district_lower for alias in aliases)


def load_fallback_weather_rows():
    """Load fallback rows from local CSV when live API data is unavailable."""
    rows = []

    if FALLBACK_DATASET_PATH.exists():
        with open(FALLBACK_DATASET_PATH, newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            for row in reader:
                district = (row.get("district") or "").strip()
                district_lower = district.lower()
                if not any(keyword in district_lower for keyword in NCR_KEYWORDS):
                    continue

                temperature = float(row.get("temperature")) if row.get("temperature") else None
                humidity = float(row.get("humidity")) if row.get("humidity") else None
                latitude = float(row.get("latitude")) if row.get("latitude") else None
                longitude = float(row.get("longitude")) if row.get("longitude") else None

                rows.append(
                    {
                        "district": district,
                        "latitude": latitude,
                        "longitude": longitude,
                        "temperature": temperature,
                        "humidity": humidity,
                        "wave": detect_wave(temperature) if temperature is not None else "Normal",
                        "forecast_temperatures": [],
                        "forecast_avg_temperature": None,
                        "prediction": "Normal",
                    }
                )

    if rows:
        completed_rows = list(rows)
        for city in TARGET_CITIES:
            city_exists = any(is_city_match(city, row.get("district")) for row in completed_rows)
            if not city_exists:
                completed_rows.append(city_row_from_defaults(city))
        return completed_rows

    # Last-resort static NCR rows to keep the dashboard usable.
    return [city_row_from_defaults(city) for city in TARGET_CITIES]

def detect_wave(temp):
    if temp >= 40:
        return "Heatwave"
    elif temp < 5:
        return "Coldwave"
    else:
        return "Normal"

@app.route('/')
def home():
    return "WaveSense Backend Running 🚀"


def fetch_city_weather(city_name):
    encoded_city = quote_plus(f"{city_name},IN")
    url = f"{OPENWEATHER_BASE_URL}?q={encoded_city}&appid={OPENWEATHER_API_KEY}&units=metric"

    response = requests.get(url, timeout=10)

    response.raise_for_status()
    payload = response.json()

    temperature = payload.get("main", {}).get("temp")   # ✅ FIXED
    humidity = payload.get("main", {}).get("humidity")
    latitude = payload.get("coord", {}).get("lat")
    longitude = payload.get("coord", {}).get("lon")
    district = payload.get("name") or city_name
    prediction = get_prediction(city_name)

    return {
        "district": district,
        "lat": latitude,
        "lon": longitude,
        "temperature": temperature,
        "humidity": humidity,
        "wave": detect_wave(temperature) if temperature else "Normal",
        "prediction": prediction,
    }


def build_prediction(avg_temperature):
    if avg_temperature is None:
        return "Normal"
    if avg_temperature > 38:
        return "Heatwave Likely"
    if avg_temperature > 30:
        return "Warning"
    return "Normal"


def get_prediction(city_name):
    try:
        encoded_city = quote_plus(f"{city_name},IN")
        url = (
            f"{OPENWEATHER_FORECAST_URL}?q={encoded_city}&appid={OPENWEATHER_API_KEY}&units=metric"
        )

        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        temps = []
        for item in data.get("list", [])[:5]:
            temp = item.get("main", {}).get("temp")
            if temp is not None:
                temps.append(temp)

        if not temps:
            return "Normal"

        avg_temp = sum(temps) / len(temps)
        return build_prediction(avg_temp)
    except Exception:
        return "Normal"


def fetch_city_forecast_summary(city_name):
    encoded_city = quote_plus(f"{city_name},IN")
    url = f"{OPENWEATHER_FORECAST_URL}?q={encoded_city}&appid={OPENWEATHER_API_KEY}&units=metric"

    response = requests.get(url, timeout=10)
    response.raise_for_status()
    payload = response.json()

    forecast_items = payload.get("list", [])
    next_temperatures = [
        item.get("main", {}).get("temp")
        for item in forecast_items
        if item.get("main", {}).get("temp") is not None
    ][:5]

    if not next_temperatures:
        return {
            "forecast_temperatures": [],
            "forecast_avg_temperature": None,
            "prediction": "Normal",
        }

    avg_temperature = round(sum(next_temperatures) / len(next_temperatures), 2)

    return {
        "forecast_temperatures": next_temperatures,
        "forecast_avg_temperature": avg_temperature,
        "prediction": build_prediction(avg_temperature),
    }

def fetch_city_weather_with_aliases(city_name):
    aliases = CITY_QUERY_ALIASES.get(city_name, [city_name])
    last_error = None

    for query_name in aliases:
        try:
            weather_data = fetch_city_weather(query_name)
            try:
                forecast_data = fetch_city_forecast_summary(query_name)
            except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError, RequestException):
                forecast_data = {
                    "forecast_temperatures": [],
                    "forecast_avg_temperature": None,
                    "prediction": "Normal",
                }

            weather_data.update(forecast_data)
            return weather_data
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError, RequestException) as error:
            last_error = error

    if last_error:
        raise last_error

    raise ValueError(f"Unable to fetch weather for {city_name}")

@app.route('/data')
def get_data():
    if not OPENWEATHER_API_KEY:
        return jsonify(load_fallback_weather_rows())

    try:
        weather_rows = []

        for city in TARGET_CITIES:
            try:
                weather_rows.append(fetch_city_weather_with_aliases(city))
            except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError, RequestException):
                continue

        if not weather_rows:
            return jsonify(load_fallback_weather_rows())

        for city in TARGET_CITIES:
            city_exists = any(is_city_match(city, row.get("district")) for row in weather_rows)
            if not city_exists:
                weather_rows.append(city_row_from_defaults(city))

        return jsonify(weather_rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5006)