const WEATHER_API_URL = "http://127.0.0.1:5001/data";
const NCR_CENTER = [28.6139, 77.2090];
const NCR_DEFAULT_ZOOM = 9;
const NCR_BOUNDS = {
  minLat: 27.9,
  maxLat: 29.9,
  minLon: 76.4,
  maxLon: 78.4,
};
const NCR_KEYWORDS = [
  "delhi",
  "new delhi",
  "gurugram",
  "gurgaon",
  "noida",
  "greater noida",
  "ghaziabad",
  "faridabad",
  "sonipat",
  "sonepat",
  "rohtak",
  "jhajjar",
  "baghpat",
  "meerut",
  "bulandshahr",
  "palwal",
  "rewari",
  "mewat",
  "nuh",
  "alwar",
  "panipat",
];

const weatherCards = document.getElementById("weatherCards");
const weatherTableBody = document.getElementById("weatherTableBody");
const mapContainer = document.getElementById("map");
const highestTempValue = document.getElementById("highestTempValue");
const heatwaveCountValue = document.getElementById("heatwaveCountValue");
const alertBanner = document.getElementById("alertBanner");
const alertMessage = document.getElementById("alertMessage");
const trendChartCanvas = document.getElementById("trendChart");

let indiaMap = null;
let heatLayer = null;
let legendControl = null;
let trendChart = null;

function getWaveStatus(row) {
  return row.wave ?? row.wave_type ?? "Normal";
}

function isHeatAlert(row) {
  return Number(row.temperature) > 40;
}

function renderAlertBanner(rows) {
  if (!alertBanner || !alertMessage) {
    return;
  }

  const hasHeatwaveAlert = rows.some(isHeatAlert);
  if (!hasHeatwaveAlert) {
    alertBanner.hidden = true;
    alertMessage.textContent = "⚠️ Heatwave Alert in NCR";
    return;
  }

  alertBanner.hidden = false;
  alertMessage.textContent = "⚠️ Heatwave Alert in NCR";
}

function isWithinNcrBounds(latitude, longitude) {
  return (
    latitude >= NCR_BOUNDS.minLat &&
    latitude <= NCR_BOUNDS.maxLat &&
    longitude >= NCR_BOUNDS.minLon &&
    longitude <= NCR_BOUNDS.maxLon
  );
}

function isNcrDistrict(district) {
  const districtName = String(district || "").toLowerCase();
  return NCR_KEYWORDS.some((keyword) => districtName.includes(keyword));
}

function filterNcrRows(rows) {
  return rows.filter((row) => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return false;
    }

    return isNcrDistrict(row.district) || isWithinNcrBounds(latitude, longitude);
  });
}

function renderSummary(rows) {
  if (!rows.length) {
    highestTempValue.textContent = "--";
    heatwaveCountValue.textContent = "0";
    return;
  }

  const rowsWithTemp = rows.filter((row) => Number.isFinite(Number(row.temperature)));
  if (!rowsWithTemp.length) {
    highestTempValue.textContent = "--";
  } else {
    const hottestRow = rowsWithTemp.reduce((hottest, current) => {
      return Number(current.temperature) > Number(hottest.temperature) ? current : hottest;
    }, rowsWithTemp[0]);
    highestTempValue.textContent = `${hottestRow.temperature} deg C (${hottestRow.district ?? "Unknown"})`;
  }

  const heatwaveCount = rows.filter((row) => getWaveStatus(row).toLowerCase() === "heatwave").length;
  heatwaveCountValue.textContent = String(heatwaveCount);
}

function renderWeatherTable(rows) {
  if (!rows.length) {
    weatherTableBody.innerHTML = "<tr><td colspan=\"7\">No NCR weather data found.</td></tr>";
    return;
  }

  let html = "";
  rows.forEach((row) => {
    const waveStatus = getWaveStatus(row);
    const alertClass = isHeatAlert(row) ? " row-alert" : "";
    const rowClass = `row-${waveStatus.toLowerCase()}${alertClass}`;
    html += `
      <tr class="${rowClass}">
        <td>${row.district ?? "-"}</td>
        <td>${row.latitude ?? "-"}</td>
        <td>${row.longitude ?? "-"}</td>
        <td>${row.temperature ?? "-"}</td>
        <td>${row.humidity ?? "-"}</td>
        <td>${row.predicted_temperature ?? "-"}</td>
        <td><span class="status-pill ${waveStatus.toLowerCase()}">${waveStatus}</span></td>
      </tr>
    `;
  });

  weatherTableBody.innerHTML = html;
}

function renderWeatherCards(rows) {
  if (!rows.length) {
    weatherCards.innerHTML = '<p class="loading-text">No NCR weather data found.</p>';
    return;
  }

  weatherCards.innerHTML = rows
    .map((row) => {
      const waveStatus = getWaveStatus(row);
      const alertClass = isHeatAlert(row) ? " heat-alert" : "";
      return `
        <article class="weather-card${alertClass}">
          <p class="meta">${row.district ?? "Unknown District"}</p>
          <p class="temperature">${row.temperature ?? "-"} deg C</p>
          <p class="prediction">Predicted next: ${row.predicted_temperature ?? "-"} deg C</p>
          <p class="status ${waveStatus.toLowerCase()}">${waveStatus}</p>
        </article>
      `;
    })
    .join("");
}

function getHeatIntensity(temperature, minTemperature, maxTemperature) {
  const tempValue = Number(temperature);
  if (!Number.isFinite(tempValue)) {
    return 0.2;
  }

  if (maxTemperature === minTemperature) {
    return 0.65;
  }

  const intensity = (tempValue - minTemperature) / (maxTemperature - minTemperature);
  return Math.max(0.2, Math.min(1, intensity));
}

function prepareMapPoints(rows) {
  return rows
    .filter((row) => {
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude);
    })
    .map((row) => ({
      district: row.district ?? "Unknown District",
      wave: getWaveStatus(row),
      temperature: row.temperature,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }));
}

function initializeMap() {
  if (indiaMap || !mapContainer) {
    return;
  }

  indiaMap = L.map("map").setView(NCR_CENTER, NCR_DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(indiaMap);

  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = function onAdd() {
    const legend = L.DomUtil.create("div", "heatmap-legend");
    legend.innerHTML =
      '<h4>Temperature Intensity</h4>' +
      '<p><span class="legend-swatch cold"></span> Blue = Lower temperature</p>' +
      '<p><span class="legend-swatch normal"></span> Yellow = Medium temperature</p>' +
      '<p><span class="legend-swatch high"></span> Red = Higher temperature</p>';
    return legend;
  };
  legendControl.addTo(indiaMap);
}

function renderHeatmap(rows) {
  initializeMap();
  if (!indiaMap) {
    return;
  }

  if (heatLayer) {
    indiaMap.removeLayer(heatLayer);
  }

  const mapPoints = prepareMapPoints(rows);
  if (!mapPoints.length) {
    indiaMap.setView(NCR_CENTER, NCR_DEFAULT_ZOOM);
    return;
  }

  const temperatureValues = mapPoints
    .map((point) => Number(point.temperature))
    .filter((value) => Number.isFinite(value));
  if (!temperatureValues.length) {
    return;
  }

  const minTemperature = Math.min(...temperatureValues);
  const maxTemperature = Math.max(...temperatureValues);

  const heatPoints = mapPoints.map((point) => [
    point.latitude,
    point.longitude,
    getHeatIntensity(point.temperature, minTemperature, maxTemperature),
  ]);

  heatLayer = L.heatLayer(heatPoints, {
    radius: 34,
    blur: 28,
    minOpacity: 0.35,
    gradient: {
      0.25: "#1d4ed8",
      0.6: "#facc15",
      1.0: "#b91c1c",
    },
  }).addTo(indiaMap);

  const bounds = L.latLngBounds(heatPoints.map((point) => [point[0], point[1]]));
  if (bounds.isValid()) {
    indiaMap.fitBounds(bounds.pad(0.2));
  }
}

function addPredictions(rows) {
  const validTemperatures = rows
    .map((row) => Number(row.temperature))
    .filter((temp) => Number.isFinite(temp));

  const averageTemp = validTemperatures.length
    ? validTemperatures.reduce((sum, value) => sum + value, 0) / validTemperatures.length
    : 0;

  return rows.map((row) => {
    const currentTemp = Number(row.temperature);
    if (!Number.isFinite(currentTemp)) {
      return { ...row, predicted_temperature: "-" };
    }

    const drift = currentTemp - averageTemp;
    const trendStep = drift * 0.35;
    const heatBoost = currentTemp > 40 ? 0.8 : 0.25;
    const predicted = currentTemp + trendStep + heatBoost;

    return {
      ...row,
      predicted_temperature: Number(predicted.toFixed(1)),
    };
  });
}

function renderTrendGraph(rows) {
  if (!trendChartCanvas || typeof Chart === "undefined") {
    return;
  }

  if (trendChart) {
    trendChart.destroy();
  }

  const graphRows = rows.filter(
    (row) => Number.isFinite(Number(row.temperature)) && Number.isFinite(Number(row.predicted_temperature))
  );

  if (!graphRows.length) {
    return;
  }

  trendChart = new Chart(trendChartCanvas, {
    type: "line",
    data: {
      labels: graphRows.map((row) => row.district ?? "Unknown"),
      datasets: [
        {
          label: "Current Temp",
          data: graphRows.map((row) => Number(row.temperature)),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96, 165, 250, 0.2)",
          borderWidth: 2,
          tension: 0.35,
        },
        {
          label: "Predicted Next Temp",
          data: graphRows.map((row) => Number(row.predicted_temperature)),
          borderColor: "#f87171",
          backgroundColor: "rgba(248, 113, 113, 0.2)",
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#cbd5e1",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9fb3cc",
          },
          grid: {
            color: "rgba(100, 116, 139, 0.2)",
          },
        },
        y: {
          ticks: {
            color: "#9fb3cc",
          },
          grid: {
            color: "rgba(100, 116, 139, 0.2)",
          },
        },
      },
    },
  });
}

async function loadWeatherData() {
  try {
    const response = await fetch(WEATHER_API_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const rows = await response.json();
    console.log("WaveSense /data response:", rows);

    const ncrRows = filterNcrRows(rows);
    const predictedRows = addPredictions(ncrRows);

    const mapData = prepareMapPoints(predictedRows);
    console.log("Map-ready points:", mapData);

    renderSummary(predictedRows);
    renderAlertBanner(predictedRows);
    renderWeatherCards(predictedRows);
    renderWeatherTable(predictedRows);
    renderHeatmap(predictedRows);
    renderTrendGraph(predictedRows);
  } catch (error) {
    highestTempValue.textContent = "--";
    heatwaveCountValue.textContent = "0";
    if (alertBanner && alertMessage) {
      alertBanner.hidden = true;
      alertMessage.textContent = "⚠️ Heatwave Alert in NCR";
    }
    weatherCards.innerHTML = `<p class="loading-text">Failed to load data: ${error.message}</p>`;
    weatherTableBody.innerHTML = `<tr><td colspan="7">Failed to load data: ${error.message}</td></tr>`;
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }
    console.error(error);
  }
}

loadWeatherData();
