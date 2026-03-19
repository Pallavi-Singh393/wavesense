from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def detect_wave(temp):
    if temp > 40:
        return "Heatwave"
    elif temp < 5:
        return "Coldwave"
    else:
        return "Normal"

@app.route('/')
def home():
    return "WaveSense Backend Running 🚀"

@app.route('/data')
def get_data():
    try:
        df = pd.read_csv('../data/weather_data.csv')
        df['wave'] = df['temperature'].apply(detect_wave)
        return jsonify(df.to_dict(orient='records'))
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)