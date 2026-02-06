// ---- Lazy Loading Helpers ----
const LIBS = {
  turf: 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js'
};

async function ensureLibraryLoaded(windowVar, url) {
  if (window[windowVar]) return;
  // If loading is already in progress, wait for it
  if (window[`_loading_${windowVar}`]) {
     await window[`_loading_${windowVar}`];
     return;
  }

  const promise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => {
      resolve();
    };
    s.onerror = (e) => {
      console.error(`Failed to load library: ${windowVar}`, e);
      reject(e);
    };
    document.head.appendChild(s);
  });

  window[`_loading_${windowVar}`] = promise;
  await promise;
}

// Expose to window for testing/debugging
window.ensureLibraryLoaded = ensureLibraryLoaded;


// ---- Map ----
const map = L.map('map', {
  minZoom: 2,
  // maxBounds removed
  scrollWheelZoom: true,
  dragging: true
}).setView([48.0196, 66.9237], 5);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// ---- Layers ----
let regionsGeoJSON = null;
let regionLayer = L.geoJSON(null, {
    style: f => {
      return {
        weight: 1,
        color: '#334155',
        fillColor: f.properties.hasSeismicRisk ? '#ef4444' : '#6b7280',
        fillOpacity: 0.4
      };
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties.shapeName || feature.properties.NAME_1;
      const riskStatus = feature.properties.hasSeismicRisk ? 'Высокий риск' : 'Низкий риск';
      const html = `
        <div class="hover-card">
          <div class="title">${name}</div>
          <div>Сейсмичность: <b>${riskStatus}</b></div>
        </div>`;
      layer.bindTooltip(html, { sticky:true });
      layer.on('mouseover', () => { layer.setStyle({ weight:2, fillOpacity: 0.6 }); });
      layer.on('mouseout',  () => { layer.setStyle({ weight:1, fillOpacity: 0.4 }); });
    }
});

let seismicZonesGeoJSON = null;
let earthquakeLayer = L.layerGroup().addTo(map);
let earthquakeEvents = [];

// ---- Weather Modules (Flood & Rain) ----
let floodLayer = L.layerGroup();
// Regions centers for weather check
const KZ_REGIONS = {
  'Шымкент': { lat: 42.3, lon: 69.6 },
  'Алматы': { lat: 43.2, lon: 76.9 },
  'Астана': { lat: 51.1, lon: 71.4 },
  'Акмолинская': { lat: 51.9, lon: 69.4 },
  'Актюбинская': { lat: 50.3, lon: 57.2 },
  'Алматинская': { lat: 45.0, lon: 78.0 },
  'Атырауская': { lat: 47.1, lon: 51.9 },
  'Западно-Казахстанская': { lat: 51.2, lon: 51.4 },
  'Жамбылская': { lat: 43.3, lon: 71.4 },
  'Карагандинская': { lat: 49.8, lon: 73.1 },
  'Костанайская': { lat: 53.2, lon: 63.6 },
  'Кызылординская': { lat: 44.8, lon: 62.5 },
  'Мангистауская': { lat: 44.6, lon: 54.1 },
  'Павлодарская': { lat: 52.3, lon: 76.9 },
  'Северо-Казахстанская': { lat: 54.9, lon: 69.2 },
  'Туркестанская': { lat: 43.3, lon: 68.3 },
  'Восточно-Казахстанская': { lat: 49.9, lon: 82.6 },
  'Абайская': { lat: 48.9, lon: 80.2 }, // Approximate
  'Жетысуская': { lat: 45.5, lon: 79.0 }, // Approximate
  'Улытауская': { lat: 48.0, lon: 67.0 } // Approximate
};

async function initFloodLayer() {
  floodLayer.clearLayers();
  const regionNames = Object.keys(KZ_REGIONS);
  const lats = [];
  const lons = [];

  for (const coords of Object.values(KZ_REGIONS)) {
    lats.push(coords.lat);
    lons.push(coords.lon);
  }

  try {
    const rainUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&daily=precipitation_sum&forecast_days=3&timezone=auto`;
    const rainResp = await fetch(rainUrl);
    const rainData = await rainResp.json();

    // The API returns an array of objects if multiple coords are requested.
    // However, if only 1 location is requested, it returns a single object.
    // We should handle both, although KZ_REGIONS has multiple entries.
    const results = Array.isArray(rainData) ? rainData : [rainData];

    results.forEach((data, index) => {
        if (!data || !data.daily || !data.daily.precipitation_sum) return;

        const maxRain = Math.max(...data.daily.precipitation_sum);
        let risk = 'low';
        if (maxRain > 30) risk = 'high';
        else if (maxRain > 10) risk = 'medium';

        if (risk === 'low') return;

        const name = regionNames[index];
        const lat = lats[index];
        const lon = lons[index];

        let color = '#22c55e'; // Green
        let iconType = '🌧';
        if (risk === 'medium') { color = '#eab308'; } // Yellow
        if (risk === 'high') { color = '#ef4444'; iconType = '🌊'; } // Red

        const icon = L.divIcon({
          className: 'weather-icon',
          html: `<div style="background:${color}; color:white; border-radius:50%; width:24px; height:24px; text-align:center; line-height:24px; font-size:14px; border:1px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${iconType}</div>`
        });

        const marker = L.marker([lat, lon], { icon });

        marker.bindTooltip(`
          <div><b>${iconType} ${name}</b></div>
          <div>Осадки (макс 24ч): ${maxRain.toFixed(1)} мм</div>
          <div style="margin-top:5px; font-size:0.8em; color:#555;">
            ${risk === 'high' ? '⚠️ Опасность паводка' : '⚠️ Сильный дождь'}
          </div>
        `, {
          className: 'risk-tooltip-flood',
          direction: 'top'
        });

        marker.addTo(floodLayer);
    });

  } catch (e) {
    console.warn('Meteo fetch failed', e);
  }
}


// ---- Regions (ADM1) ----
async function loadRegions() {
  const resp = await fetch('./kaz_adm1_simplified.geojson');
  regionsGeoJSON = await resp.json();
  renderRegions();
}

function precomputeSeismicRisk() {
  if (!regionsGeoJSON || !seismicZonesGeoJSON) return;
  // Simple check if region intersects any seismic zone
  // We need turf for this
  if (typeof turf === 'undefined' && !window.turf) return;
  const t = window.turf || turf;

  for (const region of regionsGeoJSON.features) {
    region.properties.hasSeismicRisk = false;
    for (const zone of seismicZonesGeoJSON.features) {
      // Very simple intersection check or centroid check to speed up if polygons are complex
      // turf.intersect can be slow.
      // Let's use booleanIntersects
      try {
          if (t.booleanIntersects(region, zone)) {
            region.properties.hasSeismicRisk = true;
            break;
          }
      } catch (e) {
          console.warn('Turf intersection error', e);
      }
    }
  }
}

function renderRegions() {
  if (!regionsGeoJSON) return;
  regionLayer.clearLayers();
  regionLayer.addData(regionsGeoJSON);
}

// ---- Seismic ----
async function loadSeismicZones() {
  const resp = await fetch('./kz_risk_zones.geojson');
  seismicZonesGeoJSON = await resp.json();
}

function renderSeismicLegend() {
  const el = document.getElementById('legendSeismic');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div><b>Сейсмические зоны</b></div>
    <div class="row"><i style="background:#ef4444; opacity:0.4;"></i> Высокий риск</div>
    <div class="row"><i style="background:#6b7280; opacity:0.4;"></i> Низкий риск</div>
    <div style="margin-top:10px;"><b>Погода</b></div>
    <div class="row">🌧 Дождь (>10мм)</div>
    <div class="row">🌊 Паводок (>30мм)</div>
  `;
}

// ---- Earthquake Data ----
async function loadEarthquakeData() {
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson');
        const data = await response.json();

        let newEvents = data.features.filter(event => {
            return !earthquakeEvents.some(existing => existing.id === event.id);
        });

        // Use all events without distance filtering
        earthquakeEvents = data.features;

        renderEarthquakes();
        renderEarthquakeList();

        // Process ShakeMap for NEW events
        for (const event of newEvents) {
             if (event.properties.mag >= 5.0) {
                 processShakeMap(event.properties.detail);
             }
        }

    } catch (error) {
        console.error("Failed to load earthquake data:", error);
        showToast("Не удалось обновить данные о землетрясениях");
    }
}

function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 9999;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 4000);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function renderEarthquakes() {
    earthquakeLayer.clearLayers();
    earthquakeEvents.forEach(event => {
        const { geometry, properties } = event;
        if (geometry) {
            const [lon, lat] = geometry.coordinates;
            const magnitude = properties.mag;
            const marker = L.circleMarker([lat, lon], {
                radius: magnitude * 1.5,
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.5,
                weight: 1
            }).addTo(earthquakeLayer);

            const eventTime = new Date(properties.time).toLocaleString('ru-RU');
            marker.bindPopup(`
                <b>Магнитуда:</b> ${properties.mag}<br>
                <b>Местоположение:</b> ${properties.place}<br>
                <b>Время:</b> ${eventTime}<br>
                <a href="${properties.url}" target="_blank">Подробнее на USGS</a>
            `);
        }
    });
}

function renderEarthquakeList() {
    const el = document.getElementById('earthquakeList');
    el.innerHTML = '';
    if (!earthquakeEvents || earthquakeEvents.length === 0) {
        el.innerHTML = '<div style="padding:10px; color:#666;">Нет данных за последние 24ч</div>';
        return;
    }

    earthquakeEvents.forEach((event, index) => {
        const { geometry, properties } = event;
        const div = document.createElement('div');
        div.className = 'contract-card';
        const eventDate = new Date(properties.time).toLocaleDateString('ru-RU');
        const eventTime = new Date(properties.time).toLocaleTimeString('ru-RU');

        div.innerHTML = `
            <div><b>M ${properties.mag}</b> - ${properties.place}</div>
            <div class="meta">${eventDate} ${eventTime}</div>
        `;

        div.addEventListener('click', () => {
            const [lon, lat] = geometry.coordinates;
            map.flyTo([lat, lon], 7);
            const marker = earthquakeLayer.getLayers()[index];
            if (marker) {
                marker.openPopup();
            }
        });

        el.appendChild(div);
    });
}

document.getElementById('toggleEarthquakesList').addEventListener('click', () => {
    const listEl = document.getElementById('earthquakeList');
    const iconEl = document.getElementById('earthquakeToggleIcon');
    const isVisible = !listEl.classList.contains('collapsed');

    if (isVisible) {
        listEl.classList.add('collapsed');
        iconEl.classList.remove('rotated');
    } else {
        listEl.classList.remove('collapsed');
        iconEl.classList.add('rotated');
    }
});

async function processShakeMap(detailUrl) {
    try {
        const response = await fetch(detailUrl);
        const eventDetail = await response.json();

        if (!eventDetail.properties || !eventDetail.properties.products || !eventDetail.properties.products.shakemap) {
            return;
        }
        const shakemapProduct = eventDetail.properties.products.shakemap[0];
        const intensityGridUrl = shakemapProduct.contents['application/json']?.url;

        if (intensityGridUrl) {
            await fetchAndDisplayShakeMap(intensityGridUrl, eventDetail.properties.title);
        }
    } catch (error) {
        console.error("Ошибка при получении ShakeMap:", error);
    }
}

function getIntensityColor(intensity) {
    if (intensity > 7.5) return '#d73027';
    if (intensity > 6.5) return '#fc8d59';
    if (intensity > 5.5) return '#fee08b';
    if (intensity > 4.5) return '#d9ef8b';
    if (intensity > 3.5) return '#91cf60';
    return '#1a9850';
}

async function fetchAndDisplayShakeMap(gridUrl, eventTitle) {
    try {
        await ensureLibraryLoaded('turf', LIBS.turf);
        const response = await fetch(gridUrl);
        const intensityData = await response.json();

        L.geoJSON(intensityData, {
            style: function(feature) {
                const intensity = feature.properties.value;
                return {
                    fillColor: getIntensityColor(intensity),
                    fillOpacity: 0.5,
                    weight: 0
                };
            }
        }).addTo(earthquakeLayer); // Add to earthquake layer group so it can be toggled
    } catch (error) {
        console.error("Ошибка при отображении ShakeMap:", error);
    }
}

function setupLayerControl() {
    const baseLayers = {
        "OpenStreetMap": osmLayer,
        "Sputnik (Esri)": esriLayer
    };

    const overlayLayers = {
        "Регионы": regionLayer,
        "Землетрясения (USGS)": earthquakeLayer,
        "💧 Погода (Open-Meteo)": floodLayer
    };

    L.control.layers(baseLayers, overlayLayers, { collapsed: false }).addTo(map);
}

// ---- Init ----
async function init() {
  osmLayer.addTo(map);
  regionLayer.addTo(map);
  earthquakeLayer.addTo(map);
  floodLayer.addTo(map);

  // Default load
  await Promise.all([
      loadRegions(),
      loadSeismicZones(),
      loadEarthquakeData(),
      initFloodLayer()
  ]);

  await ensureLibraryLoaded('turf', LIBS.turf);
  precomputeSeismicRisk();
  renderRegions(); // re-render with risk colors
  renderSeismicLegend();
  setupLayerControl();

  // Auto-refresh earthquakes
  setInterval(loadEarthquakeData, 10 * 60 * 1000);
}

// ---- Smart Location Analysis ----

async function getSurroundingData(lat, lon) {
    const query = `
      [out:json][timeout:25];
      (
        node(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|school|university"];
        way(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|school|university"];
        node(around:500, ${lat}, ${lon})["shop"="mall"];
        way(around:500, ${lat}, ${lon})["shop"="mall"];
        node(around:500, ${lat}, ${lon})["office"];
        way(around:500, ${lat}, ${lon})["office"];
        node(around:500, ${lat}, ${lon})["highway"="bus_stop"];
        node(around:500, ${lat}, ${lon})["railway"="subway_entrance"];
        way(around:500, ${lat}, ${lon})["building"="apartments"];
      );
      out center;
    `;

    const url = 'https://overpass-api.de/api/interpreter';

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        return parseOverpassData(data);
    } catch (e) {
        console.error("Overpass API error:", e);
        throw e;
    }
}

function parseOverpassData(data) {
    let summary = {
        apartments: { count: 0, total_levels: 0 },
        schools: 0,
        universities: 0,
        malls: 0,
        offices: 0,
        transport: { bus_stops: 0, subway: 0 },
        competitors: []
    };

    if (!data.elements) return summary;

    data.elements.forEach(el => {
        const tags = el.tags || {};

        // Residential
        if (tags.building === 'apartments') {
            summary.apartments.count++;
            const levels = parseInt(tags['building:levels']);
            if (!isNaN(levels)) {
                summary.apartments.total_levels += levels;
            } else {
                summary.apartments.total_levels += 5; // Default estimate
            }
        }

        // Amenities
        if (tags.amenity === 'school') summary.schools++;
        if (tags.amenity === 'university') summary.universities++;

        // Malls
        if (tags.shop === 'mall') summary.malls++;

        // Offices
        if (tags.office) summary.offices++;

        // Transport
        if (tags.highway === 'bus_stop') summary.transport.bus_stops++;
        if (tags.railway === 'subway_entrance') summary.transport.subway++;

        // Competitors
        if (tags.amenity === 'fast_food' || tags.amenity === 'cafe') {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || 'Unnamed';
            // Avoid duplicates slightly if multiple nodes for same place, but simple list is fine
            summary.competitors.push(`${name} (${tags.amenity})`);
        }
    });

    return summary;
}

async function askGemini(summaryData, lat, lon) {
    // 1. ИСПОЛЬЗУЕМ КЛЮЧ ИЗ WINDOW (переданный через Caddy)
    const apiKey = window.GEMINI_API_KEY;

    // Проверка наличия ключа
    if (!apiKey || apiKey.includes("Env.GEMINI_API_KEY") || apiKey.trim() === "") {
        console.error("API Key не найден! Убедитесь, что переменная окружения GEMINI_API_KEY задана в start.sh или Docker.");
        alert("Ошибка настройки сервера: API Key не найден.");
        throw new Error("API Key required");
    }

    const systemPrompt = `
Ты — Эксперт по локациям для фаст-фуда. Твоя цель — защита инвестиций.
Я отправлю тебе JSON с данными вокруг точки (дома, школы, конкуренты).
Твоя задача:
1. Использовать Google Search для поиска новостей по этому району (координаты: ${lat}, ${lon}). Ищи проблемы: криминал, долгий ремонт дорог, скандалы.
2. Проанализировать состав конкурентов. Если рядом McDonald's/KFC — это хорошо (они уже проверили трафик), если только шаурма — средний риск.
3. Рассчитать "Confidence Score" (0-100%) открытия точки.

ВЕРНИ ОТВЕТ СТРОГО В JSON:
{
  "score": 85,
  "verdict": "Рекомендую к открытию",
  "reasoning": {
    "traffic": "Высокий (рядом ВУЗ + 2 остановки)",
    "audience": "Студенты и офисные клерки (средний чек низкий, оборот высокий)",
    "competition": "Умеренная (есть Burger King, значит трафик есть)"
  },
  "risks": ["В новостях пишут о ремонте теплотрассы летом — перекроют проход"],
  "economics": {
    "daily_checks": 350,
    "monthly_revenue_kzt": 25000000
  }
}
`;

    const userPrompt = `Анализ локации (${lat}, ${lon}). Данные: ${JSON.stringify(summaryData)}`;

    // 2. ИСПОЛЬЗУЕМ СТАБИЛЬНУЮ МОДЕЛЬ (gemini-2.0-flash) ВМЕСТО EXP
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const payload = {
        system_instruction: {
            parts: [{ text: systemPrompt }]
        },
        contents: [{
            role: "user",
            parts: [{ text: userPrompt }]
        }],
        tools: [{
            google_search_retrieval: {
                dynamic_retrieval_config: {
                    mode: "mode_dynamic",
                    dynamic_threshold: 0.6
                }
            }
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
             throw new Error("No candidates returned from Gemini");
        }

        const textPart = data.candidates[0].content.parts[0].text;
        return JSON.parse(textPart);
    } catch (e) {
        console.error("Gemini interaction failed", e);
        throw e;
    }
}

// ---- UI Logic & Event Handling ----

const tabEarthquakes = document.getElementById('tabEarthquakes');
const tabAudit = document.getElementById('tabAudit');
const contentEarthquakes = document.getElementById('contentEarthquakes');
const contentAudit = document.getElementById('contentAudit');

function switchTab(tab) {
    if (tab === 'earthquakes') {
        tabEarthquakes.classList.add('active');
        tabAudit.classList.remove('active');
        contentEarthquakes.classList.remove('hidden');
        contentAudit.classList.add('hidden');
        disableAuditMode();
    } else {
        tabEarthquakes.classList.remove('active');
        tabAudit.classList.add('active');
        contentEarthquakes.classList.add('hidden');
        contentAudit.classList.remove('hidden');
    }
}

if (tabEarthquakes && tabAudit) {
    tabEarthquakes.addEventListener('click', () => switchTab('earthquakes'));
    tabAudit.addEventListener('click', () => switchTab('audit'));
}

let auditModeEnabled = false;
let auditMarker = null;

const btnToggleAudit = document.getElementById('btnToggleAudit');

if (btnToggleAudit) {
    btnToggleAudit.addEventListener('click', () => {
        auditModeEnabled = !auditModeEnabled;
        updateAuditButtonState();
    });
}

function updateAuditButtonState() {
    const mapEl = document.getElementById('map');
    if (auditModeEnabled) {
        btnToggleAudit.innerText = "❌ Выключить режим (Кликните на карту)";
        btnToggleAudit.classList.add('active');
        mapEl.classList.add('map-cursor-audit');
    } else {
        btnToggleAudit.innerText = "📍 Начать анализ";
        btnToggleAudit.classList.remove('active');
        mapEl.classList.remove('map-cursor-audit');
        if (auditMarker) {
            map.removeLayer(auditMarker);
            auditMarker = null;
        }
    }
}

function disableAuditMode() {
    auditModeEnabled = false;
    if (btnToggleAudit) updateAuditButtonState();
}

map.on('click', (e) => {
    if (!auditModeEnabled) return;

    const { lat, lng } = e.latlng;

    if (auditMarker) {
        auditMarker.setLatLng(e.latlng);
    } else {
        auditMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    }

    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <div style="text-align:center;">
            <b>Координаты:</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}<br><br>
            <button id="btnRunAnalysis" class="primary-btn" style="padding: 5px 10px; font-size: 0.9em;">📊 Анализировать</button>
        </div>
    `;

    auditMarker.bindPopup(popupContent).openPopup();
});

map.on('popupopen', (e) => {
    const btn = document.getElementById('btnRunAnalysis');
    if (btn) {
        let latlng = e.popup.getLatLng();
        if (!latlng && e.popup._source) {
             latlng = e.popup._source.getLatLng();
        }

        btn.onclick = () => {
             if(latlng) {
                 runAnalysis(latlng);
                 map.closePopup();
             }
        };
    }
});

async function runAnalysis(latlng) {
    const { lat, lng } = latlng;

    // UI Update
    document.getElementById('auditIntro').classList.add('hidden');
    document.getElementById('auditResult').classList.add('hidden');
    document.getElementById('auditLoading').classList.remove('hidden');

    try {
        // 1. Get Data
        const summary = await getSurroundingData(lat, lng);

        // 2. Ask AI
        const aiResult = await askGemini(summary, lat, lng);

        // 3. Render Result
        renderAuditResult(aiResult);

    } catch (error) {
        console.error(error);
        alert("Ошибка анализа: " + error.message);
        document.getElementById('auditIntro').classList.remove('hidden');
    } finally {
        document.getElementById('auditLoading').classList.add('hidden');
    }
}

function renderAuditResult(data) {
    const container = document.getElementById('auditResult');
    container.innerHTML = '';

    // Score Color
    let colorClass = 'score-yellow';
    if (data.score >= 75) colorClass = 'score-green';
    if (data.score < 40) colorClass = 'score-red';

    const html = `
        <div class="audit-score-card ${colorClass}">
            <div style="font-size: 2.5rem; font-weight: bold;">${data.score}%</div>
            <div style="font-size: 1.2rem;">${data.verdict}</div>
        </div>

        <div class="audit-section-title">📊 Обоснование</div>
        <div style="font-size: 0.9em; margin-bottom: 10px;">
            <p><b>Трафик:</b> ${data.reasoning.traffic}</p>
            <p><b>Аудитория:</b> ${data.reasoning.audience}</p>
            <p><b>Конкуренция:</b> ${data.reasoning.competition}</p>
        </div>

        <div class="audit-section-title">⚠️ Риски</div>
        <ul style="font-size: 0.9em; padding-left: 20px;">
            ${data.risks.map(r => `<li>${r}</li>`).join('')}
        </ul>

        <div class="audit-section-title">💰 Прогноз (мес.)</div>
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-val">${data.economics.daily_checks}</div>
                <div class="stat-label">Чеков/день</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">${(data.economics.monthly_revenue_kzt / 1000000).toFixed(1)} млн ₸</div>
                <div class="stat-label">Выручка</div>
            </div>
        </div>

        <button id="btnResetAudit" class="primary-btn" style="margin-top: 15px; background-color: #6c757d;">🔄 Новый поиск</button>
    `;

    container.innerHTML = html;
    container.classList.remove('hidden');

    const btnReset = document.getElementById('btnResetAudit');
    if(btnReset) {
        btnReset.addEventListener('click', () => {
            container.classList.add('hidden');
            document.getElementById('auditIntro').classList.remove('hidden');
        });
    }
}

init();
