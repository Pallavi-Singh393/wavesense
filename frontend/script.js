const WEATHER_API_URL = "http://127.0.0.1:5000/data";

const weatherCards = document.getElementById("weatherCards");
const weatherTableBody = document.getElementById("weatherTableBody");
const mapContainer = document.getElementById("map");

let indiaMap = null;
let markerLayer = null;
let heatLayer = null;
let legendControl = null;
let districtMarkerLayer = null;

function getWaveStatus(row) {
  return row.wave ?? row.wave_type ?? "Normal";
}

function renderWeatherTable(rows) {
  if (!rows.length) {
    weatherTableBody.innerHTML = "<tr><td colspan=\"6\">No weather data found.</td></tr>";
    return;
  }

  let html = "";
  rows.forEach((row) => {
    const waveStatus = getWaveStatus(row);
    const rowClass = `row-${waveStatus.toLowerCase()}`;
    html += `
      <tr class="${rowClass}">
        <td>${row.district ?? "-"}</td>
        <td>${row.latitude ?? "-"}</td>
        <td>${row.longitude ?? "-"}</td>
        <td>${row.temperature ?? "-"}</td>
        <td>${row.humidity ?? "-"}</td>
        <td><span class="status-pill ${waveStatus.toLowerCase()}">${waveStatus}</span></td>
      </tr>
    `;
  });

  weatherTableBody.innerHTML = html;
}

function renderWeatherCards(rows) {
  if (!rows.length) {
    weatherCards.innerHTML = '<p class="loading-text">No weather data found.</p>';
    return;
  }

  weatherCards.innerHTML = rows
    .map((row) => {
      const waveStatus = getWaveStatus(row);
      return `
        <article class="weather-card">
          <p class="meta">${row.district ?? "Unknown District"}</p>
          <p class="temperature">${row.temperature ?? "-"} deg C</p>
          <p class="status ${waveStatus.toLowerCase()}">${waveStatus}</p>
        </article>
      `;
    })
    .join("");
}

function getMarkerColor(waveStatus) {
  const status = (waveStatus || "").toLowerCase();
  if (status === "heatwave") {
    return "#ff0000";
  }
  if (status === "coldwave") {
    return "#0000ff";
  }
  return "#008000";
}

function getHeatIntensity(temperature) {
  const tempValue = Number(temperature);
  if (!Number.isFinite(tempValue)) {
    return 0.3;
  }

  const intensity = (tempValue - 20) / 25;
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
      intensity: getHeatIntensity(row.temperature),
    }));
}

function initializeMap() {
  if (indiaMap || !mapContainer) {
    return;
  }

  indiaMap = L.map("map").setView([22.9734, 78.6569], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(indiaMap);

  markerLayer = L.layerGroup().addTo(indiaMap);
  districtMarkerLayer = L.layerGroup().addTo(indiaMap);

  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = function onAdd() {
    const legend = L.DomUtil.create("div", "heatmap-legend");
    legend.innerHTML =
      '<h4>Wave Legend</h4>' +
      '<p><span class="legend-swatch high"></span> Red = Heatwave</p>' +
      '<p><span class="legend-swatch cold"></span> Blue = Coldwave</p>' +
      '<p><span class="legend-swatch normal"></span> Green = Normal</p>';
    return legend;
  };
  legendControl.addTo(indiaMap);
}

function renderDistrictMarkers(rows) {
  initializeMap();
  if (!indiaMap || !districtMarkerLayer) {
    return;
  }

  districtMarkerLayer.clearLayers();

  const mapPoints = prepareMapPoints(rows);
  mapPoints.forEach((point) => {
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 9,
      color: "#ffffff",
      weight: 1,
      fillColor: getMarkerColor(point.wave),
      fillOpacity: 0.95,
    });

    marker.bindPopup(
      `<strong>${point.district}</strong><br/>` +
        `Temperature: ${point.temperature ?? "-"} deg C<br/>` +
        `Wave Status: ${point.wave}`
    );

    districtMarkerLayer.addLayer(marker);
  });
}

function renderHeatmap(rows) {
  initializeMap();
  if (!indiaMap || !markerLayer) {
    return;
  }

  markerLayer.clearLayers();
  if (heatLayer) {
    indiaMap.removeLayer(heatLayer);
  }

  const mapPoints = prepareMapPoints(rows);

  const heatPoints = mapPoints.map((point) => [point.latitude, point.longitude, point.intensity]);

  heatLayer = L.heatLayer(heatPoints, {
    radius: 28,
    blur: 22,
    minOpacity: 0.45,
    gradient: {
      0.3: "#1d4ed8",
      0.6: "#f59e0b",
      1.0: "#b91c1c",
    },
  }).addTo(indiaMap);

  mapPoints.forEach((point) => {
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 7,
      color: "#ffffff",
      weight: 1,
      fillColor: getMarkerColor(point.wave),
      fillOpacity: 0.95,
    });

    marker.bindPopup(
      `<strong>${point.district}</strong><br/>` +
        `Temperature: ${point.temperature ?? "-"} deg C<br/>` +
        `Wave Status: ${point.wave}`
    );

    marker.bindTooltip(
      `<strong>${point.district}</strong><br/>` +
        `Temperature: ${point.temperature ?? "-"} deg C<br/>` +
        `Wave: ${point.wave}<br/>` +
        `Lat: ${point.latitude}, Lon: ${point.longitude}`,
      {
        direction: "top",
        offset: [0, -8],
      }
    );

    markerLayer.addLayer(marker);
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

    const mapData = prepareMapPoints(rows);
    console.log("Map-ready points:", mapData);

    renderWeatherCards(rows);
    renderWeatherTable(rows);
    renderHeatmap(rows);
    renderDistrictMarkers(rows);
  } catch (error) {
    weatherCards.innerHTML = `<p class="loading-text">Failed to load data: ${error.message}</p>`;
    weatherTableBody.innerHTML = `<tr><td colspan="6">Failed to load data: ${error.message}</td></tr>`;
    console.error(error);
  }
}

loadWeatherData();
