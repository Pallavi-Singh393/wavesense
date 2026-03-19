# WaveSense

WaveSense is a beginner-friendly full-stack climate analytics project.
It detects Heat Waves and Cold Waves from weather data and shows insights in a dashboard.

## Project Structure

```text
wavesense/
│
├── backend/
│   ├── app.py
│   ├── wave_detector.py
│
├── data/
│   └── weather_data.csv
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│
└── README.md
```

## Tech Stack

- Backend: Flask + Pandas
- Frontend: HTML, CSS, JavaScript
- Charts: Chart.js

## Detection Rules

- Heat Wave: temperature >= 40°C
- Severe Heat Wave: temperature >= 45°C
- Cold Wave: temperature <= 10°C
- Otherwise: Normal

## API Endpoints

- GET /weather
- GET /heatwaves
- GET /coldwaves
- GET /cities

All endpoints also support an optional city filter:

- Example: `/weather?city=Delhi`

## Setup Instructions

### 1. Create and activate virtual environment (recommended)

```bash
cd wavesense
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install flask pandas
```

### 3. Run backend server

```bash
cd backend
python app.py
```

Backend will run at: `http://127.0.0.1:5000`

### 4. Open frontend dashboard

Option A (quick): open `frontend/index.html` directly in your browser.

Option B (recommended local server):

```bash
cd frontend
python3 -m http.server 5500
```

Then open: `http://127.0.0.1:5500`

## What You Can Do in Dashboard

- Select a city
- View temperature trend chart
- See heat wave/cold wave alerts
- View event summary by city

## Beginner Notes

- The backend reads and classifies CSV data in `backend/wave_detector.py`
- The API routes are defined in `backend/app.py`
- Frontend API calls and chart rendering are in `frontend/script.js`
