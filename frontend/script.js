const WEATHER_API_URL = "http://127.0.0.1:5006/data";
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
const alertBox = document.getElementById("alerts");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const trendChartCanvas = document.getElementById("trendChart");

let indiaMap = null;
let heatLayer = null;
let legendControl = null;
let trendChart = null;
let markerLayer = null;
let currentMode = "heat";
let latestHeatmapRows = [];

function updateModeToggleButton() {
  if (!modeToggleBtn) {
    return;
  }

  modeToggleBtn.textContent = currentMode === "heat" ? "Heatwave Mode" : "Coldwave Mode";
}

function toggleHeatmapMode() {
  currentMode = currentMode === "heat" ? "cold" : "heat";
  updateModeToggleButton();

  if (latestHeatmapRows.length) {
    renderHeatmap(latestHeatmapRows);
  }
}

if (modeToggleBtn) {
  modeToggleBtn.addEventListener("click", toggleHeatmapMode);
  updateModeToggleButton();
}

function getLatitude(row) {
  return Number(row.latitude ?? row.lat);
}

function getLongitude(row) {
  return Number(row.longitude ?? row.lon);
}

function getWaveStatus(row) {
  return row.wave ?? row.wave_type ?? "Normal";
}

function getPredictionStatus(row) {
  return row.prediction ?? "Normal";
}

function getPredictionColor(prediction) {
  if (prediction === "Heatwave Likely") {
    return "#ef4444";
  }
  if (prediction === "Warning") {
    return "#f97316";
  }
  return "#22c55e";
}

function isHeatAlert(row) {
  return Number(row.temperature) > 40;
}

function renderAlertBanner(rows) {
  if (!alertBanner || !alertMessage) {
    return;
  }

  const hasPredictedHeatwave = rows.some((row) => getPredictionStatus(row) === "Heatwave Likely");
  if (hasPredictedHeatwave) {
    alertBanner.hidden = false;
    alertMessage.textContent = "⚠️ Heatwave expected soon";
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

function renderHeatwaveAlerts(data) {
  if (!alertBox) {
    return;
  }

  alertBox.innerHTML = "";

  data.forEach((city) => {
    const temperature = Number(city.temperature);
    if (!Number.isFinite(temperature) || temperature <= 40) {
      return;
    }

    const district = city.district ?? "Unknown District";
    const alertMsg = document.createElement("div");
    alertMsg.innerHTML = `🔥 Heatwave in ${district}: ${temperature}°C`;
    alertMsg.style.color = "red";
    alertBox.appendChild(alertMsg);
  });
}

function showAlert(data) {
  const alertElement = document.getElementById("alert") || alertBanner;
  if (!alertElement) {
    return;
  }

  const hasHeatwave = data.some((city) => city.prediction === "Heatwave Likely");

  if (hasHeatwave) {
    alertElement.innerText = "⚠️ Heatwave expected soon in NCR!";
    alertElement.style.display = "block";
  } else {
    alertElement.style.display = "none";
  }
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
    const latitude = getLatitude(row);
    const longitude = getLongitude(row);
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
    const latitude = getLatitude(row);
    const longitude = getLongitude(row);
    html += `
      <tr class="${rowClass}">
        <td>${row.district ?? "-"}</td>
        <td>${Number.isFinite(latitude) ? latitude : "-"}</td>
        <td>${Number.isFinite(longitude) ? longitude : "-"}</td>
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

function getModeHeatIntensity(temperature, minTemperature, maxTemperature) {
  const baseIntensity = getHeatIntensity(temperature, minTemperature, maxTemperature);
  if (currentMode === "cold") {
    return Math.max(0.2, Math.min(1, 1 - baseIntensity + 0.2));
  }

  return baseIntensity;
}

function getHeatmapGradient() {
  return {
    0.2: "#2563eb",
    0.4: "#22c55e",
    0.6: "#fde047",
    0.8: "#f97316",
    1.0: "red",
  };
}

function normalizeTemperatureIntensity(temperature) {
  const tempValue = Number(temperature);
  if (!Number.isFinite(tempValue)) {
    return 0.15;
  }

  // Normalize by a realistic upper bound and boost high temperatures slightly.
  return Math.max(0.15, Math.min(1, (tempValue / 50) * 1.1));
}

function prepareMapPoints(rows) {
  return rows
    .filter((row) => {
      const latitude = getLatitude(row);
      const longitude = getLongitude(row);
      return Number.isFinite(latitude) && Number.isFinite(longitude);
    })
    .map((row) => ({
      district: row.district ?? "Unknown District",
      wave: getWaveStatus(row),
      prediction: getPredictionStatus(row),
      humidity: row.humidity,
      temperature: row.temperature,
      latitude: getLatitude(row),
      longitude: getLongitude(row),
    }));
}

function getMarkerColorByPrediction(prediction) {
  if (prediction === "Heatwave Likely" || prediction === "Warning" || prediction === "Normal") {
    return getPredictionColor(prediction);
  }

  return "#22c55e";
}

function getMarkerAnimationClass(prediction) {
  if (prediction === "Heatwave Likely") {
    return "pulse-red";
  }
  if (prediction === "Warning") {
    return "pulse-orange";
  }
  return "";
}

function getMarkerSize(prediction) {
  if (prediction === "Heatwave Likely") {
    return 22;
  }
  if (prediction === "Warning") {
    return 20;
  }
  return 18;
}

function createTemperatureMarker(point) {
  const prediction = point?.prediction ?? "Normal";
  const markerColor = getMarkerColorByPrediction(prediction);
  const animationClass = getMarkerAnimationClass(prediction);
  const markerSize = getMarkerSize(prediction);

  const html = `<span class="wx-marker ${animationClass}" style="--marker-color:${markerColor}; width:${markerSize}px; height:${markerSize}px;"></span>`;
  const icon = L.divIcon({
    className: "wx-marker-wrap",
    html,
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    popupAnchor: [0, -Math.round(markerSize / 2)],
  });

  return L.marker([point.latitude, point.longitude], {
    icon,
    riseOnHover: true,
    keyboard: false,
  });
}

function getMarkerPopupHtml(point) {
  const district = point.district ?? "Unknown District";
  const temperature = Number.isFinite(Number(point.temperature)) ? `${point.temperature}` : "-";
  const humidity = Number.isFinite(Number(point.humidity)) ? `${point.humidity}%` : "-";
  const wave = point.wave ?? "Normal";
  const prediction = point.prediction ?? "Normal";

  return `
    <b>${district}</b><br>
    Temp: ${temperature}°C<br>
    Humidity: ${humidity}<br>
    Status: ${wave}<br>
    🔮 Prediction: ${prediction}
  `;
}

function renderCityMarkers(rows) {
  initializeMap();
  if (!indiaMap) {
    console.warn("Map instance not available; skipping marker rendering.");
    return;
  }

  if (!markerLayer) {
    markerLayer = L.layerGroup().addTo(indiaMap);
  }
  markerLayer.clearLayers();

  const mapPoints = prepareMapPoints(rows);
  console.log(`Rendering ${mapPoints.length} city markers.`);

  if (!mapPoints.length) {
    indiaMap.setView(NCR_CENTER, NCR_DEFAULT_ZOOM);
    return;
  }

  const bounds = L.latLngBounds([]);
  mapPoints.forEach((point) => {
    const marker = createTemperatureMarker(point);
    marker.bindPopup(getMarkerPopupHtml(point));
    marker.addTo(markerLayer);
    bounds.extend([point.latitude, point.longitude]);
  });

  if (bounds.isValid()) {
    indiaMap.fitBounds(bounds.pad(0.2));
  }
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

  latestHeatmapRows = rows;

  const mapPoints = prepareMapPoints(rows);
  if (!mapPoints.length) {
    if (heatLayer) {
      indiaMap.removeLayer(heatLayer);
      heatLayer = null;
    }
    indiaMap.setView(NCR_CENTER, NCR_DEFAULT_ZOOM);
    return;
  }

  const temperatureValues = mapPoints
    .map((point) => Number(point.temperature))
    .filter((value) => Number.isFinite(value));
  if (!temperatureValues.length) {
    return;
  }

  const heatPoints = mapPoints.map((point) => [
    point.latitude,
    point.longitude,
    normalizeTemperatureIntensity(point.temperature),
  ]);

  const heatmapGradient = getHeatmapGradient();

  if (!heatLayer) {
    heatLayer = L.heatLayer(heatPoints, {
      radius: 50,
      blur: 34,
      minOpacity: 0.35,
      gradient: heatmapGradient,
    });
  } else {
    heatLayer.setOptions({
      radius: 50,
      blur: 34,
      minOpacity: 0.35,
      gradient: heatmapGradient,
    });
    heatLayer.setLatLngs(heatPoints);
  }

  if (!indiaMap.hasLayer(heatLayer)) {
    heatLayer.addTo(indiaMap);
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

  const data = rows.filter((city) => Number.isFinite(Number(city.temperature)));

  if (!data.length) {
    return;
  }

  const labels = data.map((city) => city.district ?? "Unknown");
  const currentTemps = data.map((city) => Number(city.temperature));
  const predictedTemps = currentTemps.map((t) => t + 0.8);

  const ctx = document.getElementById("trendChart").getContext("2d");

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Current Temp",
          data: currentTemps,
          borderColor: "#60a5fa",
          borderWidth: 2,
        },
        {
          label: "Predicted Temp",
          data: predictedTemps,
          borderColor: "#f87171",
          borderWidth: 2,
        },
      ],
    },
  });
}

async function loadWeatherData() {
  try {
    console.log(`Fetching weather data from ${WEATHER_API_URL}`);
    const response = await fetch(WEATHER_API_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error("Invalid API response: expected an array of weather objects.");
    }
    console.log("WaveSense /data response:", rows);
    console.log(`Received ${rows.length} weather rows from API.`);

    const ncrRows = filterNcrRows(rows);
    console.log(`Filtered NCR rows: ${ncrRows.length}`);
    const rowsToRender = ncrRows.length ? ncrRows : rows;
    if (!ncrRows.length) {
      console.warn("No rows matched NCR filter. Rendering all API rows instead.");
    }

    const predictedRows = addPredictions(rowsToRender);
    const data = predictedRows;

    const temps = data
      .map((city) => Number(city.temperature))
      .filter((temperature) => Number.isFinite(temperature));

    const maxTemp = temps.length ? Math.max(...temps) : null;
    document.getElementById("highestTempValue").innerText = maxTemp !== null ? `${maxTemp}°C` : "--";

    const heatwaveCount = data.filter((city) => Number(city.temperature) >= 40).length;
    document.getElementById("heatwaveCountValue").innerText = heatwaveCount;

    const mapData = prepareMapPoints(predictedRows);
    console.log("Map-ready points:", mapData);

    renderSummary(predictedRows);
    renderAlertBanner(predictedRows);
    showAlert(data);
    renderHeatwaveAlerts(predictedRows);
    renderWeatherCards(predictedRows);
    renderWeatherTable(predictedRows);
    renderHeatmap(predictedRows);
    renderCityMarkers(predictedRows);
    renderTrendGraph(predictedRows);
  } catch (error) {
    console.error("Failed to load weather data:", error);
    highestTempValue.textContent = "--";
    heatwaveCountValue.textContent = "0";
    if (alertBanner && alertMessage) {
      alertBanner.hidden = true;
      alertMessage.textContent = "⚠️ Heatwave Alert in NCR";
    }
    weatherCards.innerHTML = `<p class="loading-text">Failed to load data: ${error.message}</p>`;
    weatherTableBody.innerHTML = `<tr><td colspan="7">Failed to load data: ${error.message}</td></tr>`;
    if (alertBox) {
      alertBox.innerHTML = "";
    }
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }
    if (markerLayer) {
      markerLayer.clearLayers();
    }
  }
}

function loadData() {
  return loadWeatherData();
}

loadData();
setInterval(() => {
  loadData();
}, 300000); // refresh every 5 min
