"""Wave detection utilities for the WaveSense project.

This module is intentionally simple and heavily commented so beginners can
understand each step of the data processing pipeline.
"""

from pathlib import Path
import pandas as pd

# Threshold values used to classify weather events.
HEAT_WAVE_THRESHOLD = 40
SEVERE_HEAT_WAVE_THRESHOLD = 45
COLD_WAVE_THRESHOLD = 10

# Default dataset location required for this beginner project.
DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "weather_data.csv"


def classify_temperature(temperature: float) -> str:
    """Return the wave label for a single temperature value."""
    if pd.isna(temperature):
        return "Unknown"

    if temperature >= SEVERE_HEAT_WAVE_THRESHOLD:
        return "Severe Heat Wave"
    if temperature >= HEAT_WAVE_THRESHOLD:
        return "Heat Wave"
    if temperature <= COLD_WAVE_THRESHOLD:
        return "Cold Wave"
    return "Normal"


def detect_waves() -> pd.DataFrame:
    """Load data/weather_data.csv and classify each row by temperature.

    Returns a dataframe with a new column named wave_type.
    """
    df = pd.read_csv(DATASET_PATH)

    # Validate required columns for this module.
    required_columns = {"date", "city", "temperature"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        missing_list = ", ".join(sorted(missing_columns))
        raise ValueError(f"Missing required columns: {missing_list}")

    # Convert date to datetime for safer sorting/filtering.
    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    # Ensure temperature is numeric if CSV has accidental text values.
    df["temperature"] = pd.to_numeric(df["temperature"], errors="coerce")

    # Add event classification for each row.
    df["wave_type"] = df["temperature"].apply(classify_temperature)

    # Sort for cleaner chart lines on the frontend.
    df = df.sort_values(by=["city", "date"]).reset_index(drop=True)
    return df


def load_and_process_data(csv_path: Path | None = None) -> pd.DataFrame:
    """Compatibility wrapper used by the Flask backend.

    If csv_path is provided, it is used. Otherwise it loads the default dataset.
    """
    if csv_path is None:
        return detect_waves()

    df = pd.read_csv(csv_path)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["temperature"] = pd.to_numeric(df["temperature"], errors="coerce")
    df["wave_type"] = df["temperature"].apply(classify_temperature)
    return df.sort_values(by=["city", "date"]).reset_index(drop=True)


def filter_by_city(df: pd.DataFrame, city: str | None) -> pd.DataFrame:
    """Filter the dataframe by city name (case-insensitive)."""
    if not city:
        return df

    city_normalized = city.strip().lower()
    return df[df["city"].str.lower() == city_normalized]


def to_records(df: pd.DataFrame) -> list[dict]:
    """Convert dataframe rows to JSON-safe dictionaries."""
    json_df = df.copy()

    # Datetime is not directly JSON serializable, so format as YYYY-MM-DD.
    if "date" in json_df.columns:
        json_df["date"] = json_df["date"].dt.strftime("%Y-%m-%d")

    return json_df.to_dict(orient="records")
