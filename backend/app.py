from flask import Flask, jsonify
from flask_cors import CORS
import csv
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import urlopen

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

OPENWEATHER_API_KEY = "97010b9706044d0ffccfedaae5c33b9f"
OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

# NCR and nearby focus cities requested for real-time dashboard updates.
TARGET_CITIES = [
    "Delhi",
    "Noida",
    "Gurugram",
    "Faridabad",
    "Ghaziabad",
    "Greater Noida",
]

FALLBACK_DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "weather_data.csv"
NCR_KEYWORDS = ("delhi", "noida", "gurugram", "gurgaon", "faridabad", "ghaziabad")


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
                    }
                )

    if rows:
        return rows

    # Last-resort static NCR rows to keep the dashboard usable.
    return [
        {
            "district": "Delhi",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "temperature": 39.0,
            "humidity": 40.0,
            "wave": detect_wave(39.0),
        },
        {
            "district": "Noida",
            "latitude": 28.5355,
            "longitude": 77.3910,
            "temperature": 38.0,
            "humidity": 42.0,
            "wave": detect_wave(38.0),
        },
        {
            "district": "Gurugram",
            "latitude": 28.4595,
            "longitude": 77.0266,
            "temperature": 40.0,
            "humidity": 35.0,
            "wave": detect_wave(40.0),
        },
        {
            "district": "Faridabad",
            "latitude": 28.4089,
            "longitude": 77.3178,
            "temperature": 37.0,
            "humidity": 44.0,
            "wave": detect_wave(37.0),
        },
        {
            "district": "Ghaziabad",
            "latitude": 28.6692,
            "longitude": 77.4538,
            "temperature": 38.5,
            "humidity": 43.0,
            "wave": detect_wave(38.5),
        },
    ]

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
    """Fetch weather for one city and map it to the frontend's expected shape."""
    encoded_city = quote_plus(f"{city_name},IN")
    request_url = (
        f"{OPENWEATHER_BASE_URL}?q={encoded_city}&appid={OPENWEATHER_API_KEY}&units=metric"
    )

    with urlopen(request_url, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    temperature = payload.get("main", {}).get("temp")
    humidity = payload.get("main", {}).get("humidity")
    latitude = payload.get("coord", {}).get("lat")
    longitude = payload.get("coord", {}).get("lon")
    district = payload.get("name") or city_name

    return {
        "district": district,
        "lat": latitude,
        "lon": longitude,
        "temperature": temperature,
        "humidity": humidity,
        "wave": detect_wave(temperature) if temperature is not None else "Normal",
    }

@app.route('/data')
def get_data():
    if not OPENWEATHER_API_KEY:
        return jsonify(load_fallback_weather_rows())

    try:
        weather_rows = []
        failed_cities = []

        for city in TARGET_CITIES:
            try:
                weather_rows.append(fetch_city_weather(city))
            except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError):
                failed_cities.append(city)

        if not weather_rows:
            return jsonify(load_fallback_weather_rows())

        return jsonify(weather_rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)