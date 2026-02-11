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

const toggleBtn = document.getElementById('toggleEarthquakesList');
const toggleHandler = () => {
    const listEl = document.getElementById('earthquakeList');
    const iconEl = document.getElementById('earthquakeToggleIcon');
    const isVisible = !listEl.classList.contains('collapsed');

    if (isVisible) {
        listEl.classList.add('collapsed');
        iconEl.classList.remove('rotated');
        toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
        listEl.classList.remove('collapsed');
        iconEl.classList.add('rotated');
        toggleBtn.setAttribute('aria-expanded', 'true');
    }
};

toggleBtn.addEventListener('click', toggleHandler);

toggleBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleHandler();
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
    // Увеличили таймаут до 45 секунд
    const query = `
      [out:json][timeout:45];
      (
        node(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];
        way(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];

        node(around:500, ${lat}, ${lon})["amenity"~"school|university|college|kindergarten"];
        way(around:500, ${lat}, ${lon})["amenity"~"school|university|college|kindergarten"];

        node(around:500, ${lat}, ${lon})["shop"~"mall|supermarket|marketplace"];
        way(around:500, ${lat}, ${lon})["shop"~"mall|supermarket|marketplace"];

        node(around:500, ${lat}, ${lon})["office"];
        way(around:500, ${lat}, ${lon})["office"];

        node(around:500, ${lat}, ${lon})["highway"="bus_stop"];
        node(around:500, ${lat}, ${lon})["railway"="subway_entrance"];

        way(around:500, ${lat}, ${lon})["building"~"apartments|residential"];

        node(around:500, ${lat}, ${lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];
        way(around:500, ${lat}, ${lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];

        node(around:500, ${lat}, ${lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
        way(around:500, ${lat}, ${lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
      );
      out center;
    `;

    const url = 'https://overpass-api.de/api/interpreter';

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: query
            // Убрали headers, чтобы избежать лишних проблем с CORS/OPTIONS
        });

        if (!response.ok) {
            console.warn(`Overpass API returned status ${response.status}. Skipping map data.`);
            return null; // Возвращаем null, но НЕ ошибку, чтобы программа работала дальше
        }

        const text = await response.text();
        
        // Проверяем, не вернул ли сервер HTML (ошибку) вместо JSON
        if (text.trim().startsWith('<')) {
             console.warn("Overpass API returned HTML error. Skipping.");
             return null;
        }

        try {
            const data = JSON.parse(text);
            return parseOverpassData(data, lat, lon);
        } catch (jsonError) {
            console.warn("Failed to parse Overpass JSON:", jsonError);
            return null;
        }

    } catch (e) {
        console.error("Overpass API connection failed:", e);
        // Не выбрасываем ошибку (throw e), а возвращаем null, чтобы Gemini мог работать через поиск
        return null; 
    }
}

function parseOverpassData(data, centerLat, centerLon) {
    let summary = {
        population: 0,
        apartments: { count: 0, total_levels: 0 },
        schools: 0,
        universities: 0,
        malls: 0,
        offices: 0,
        transport: { bus_stops: 0, subway: 0 },
        competitors: [],
        anchors: [],
        negatives: [],
        hasRedFlag: false,
        redFlagReason: null,
        lowDensity: false
    };

    if (!data.elements) return summary;

    let residentialCount300m = 0;
    let officeCount300m = 0;

    data.elements.forEach(el => {
        const tags = el.tags || {};

        let lat = el.lat;
        let lon = el.lon;
        if (!lat && el.center) {
            lat = el.center.lat;
            lon = el.center.lon;
        }

        if (!lat || !lon) return;

        // Use existing calculateDistance (returns KM) -> convert to Meters
        const dist = calculateDistance(centerLat, centerLon, lat, lon) * 1000;

        // --- 1. Population (Heuristic) ---
        if (tags.building === 'apartments' || tags.building === 'residential') {
            summary.apartments.count++;
            let levels = parseInt(tags['building:levels']);
            if (isNaN(levels)) levels = 5;
            summary.apartments.total_levels += levels;
            summary.population += (levels * 4); // 4 people per floor/unit footprint approx

            if (dist <= 300) residentialCount300m++;
        }

        // --- 2. Categorization ---

        // Competitors
        if (['fast_food', 'cafe', 'restaurant', 'pub', 'bar', 'food_court', 'biergarten'].includes(tags.amenity)) {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || 'Unnamed';
            summary.competitors.push(`${name} (${tags.amenity}) - ${Math.round(dist)}m`);
        }

        // Anchors
        let isAnchor = false;
        if (['school', 'university', 'college', 'kindergarten'].includes(tags.amenity)) {
            summary.schools++;
            isAnchor = true;
        }
        if (tags.amenity === 'university') summary.universities++;

        if (['mall', 'supermarket', 'marketplace'].includes(tags.shop)) {
            summary.malls++;
            isAnchor = true;
        }

        if (tags.office) {
            summary.offices++;
            isAnchor = true;
            if (dist <= 300) officeCount300m++;
        }

        if (tags.highway === 'bus_stop') {
            summary.transport.bus_stops++;
            isAnchor = true;
        }
        if (tags.railway === 'subway_entrance') {
            summary.transport.subway++;
            isAnchor = true;
        }

        if (isAnchor) {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || tags.amenity || tags.shop || tags.office;
            summary.anchors.push(`${name} (${Math.round(dist)}m)`);
        }

        // Negatives & Red Flags
        let isNegative = false;
        const negativeLanduse = ['cemetery', 'industrial', 'garages', 'landfill', 'brownfield'];
        const negativeAmenity = ['prison', 'grave_yard', 'waste_disposal', 'mortuary'];

        if (negativeLanduse.includes(tags.landuse) || negativeAmenity.includes(tags.amenity)) {
            isNegative = true;
            const name = tags.name || tags.landuse || tags.amenity;
            summary.negatives.push(`${name} (${Math.round(dist)}m)`);

            if (dist <= 100) {
                summary.hasRedFlag = true;
                if (!summary.redFlagReason) {
                    summary.redFlagReason = `Обнаружен запретный объект: ${name} в радиусе ${Math.round(dist)}м`;
                }
            }
        }
    });

    // --- 3. Density Check ---
    if (residentialCount300m === 0 && officeCount300m === 0) {
        summary.lowDensity = true;
    }

    return summary;
}

async function askGemini(summaryData, lat, lon, address, locationType, visualTraffic, densityWarning) {
    const apiKey = window.GEMINI_API_KEY;

    if (!apiKey || apiKey.includes("Env.GEMINI_API_KEY") || apiKey.trim() === "") {
        console.error("API Key не найден!");
        alert("Ошибка: API Key не найден.");
        throw new Error("API Key required");
    }

    const mapDataText = summaryData 
        ? JSON.stringify({
            population_estimate: summaryData.population,
            competitors: summaryData.competitors,
            anchors: summaryData.anchors,
            negatives: summaryData.negatives,
            transport: summaryData.transport,
            low_density_flag: summaryData.lowDensity
          }, null, 2)
        : "НЕТ ДАННЫХ С КАРТЫ (OSM недоступен).";

    const systemPrompt = `
    Ты — циничный и скептический риск-менеджер, инвестиционный аналитик QSR сетей (Fast Food).
    Твоя задача — найти причины ОТКАЗАТЬ в открытии точки. Ты не веришь в успех, пока факты не докажут обратное.
    Структура анализа: Сначала ищи МИНУСЫ (Стоп-факторы), потом Плюсы.
    Оценка 0-100. Будь строгим. 60 баллов — это уже хорошо. 80 — идеально.
    `;

    const userPrompt = `
    АУДИТ ЛОКАЦИИ ДЛЯ ОБЩЕПИТА.
    АДРЕС: ${address} (${lat}, ${lon})

    ВВОДНЫЕ ОТ ПОЛЬЗОВАТЕЛЯ:
    - Тип локации: ${locationType}
    - Визуальный трафик: ${visualTraffic} чел/5мин

    ${densityWarning ? "!!! ПРЕДУПРЕЖДЕНИЕ СИСТЕМЫ: " + densityWarning + " !!!" : ""}

    ДАННЫЕ OSM (РАДИУС 500м):
    ${mapDataText}

    ПРАВИЛА ОЦЕНКИ:
    1. Если нет Якорей (Школы, Офисы, ТЦ) — Score не выше 40.
    2. Если плотность населения низкая (Population < 100) и нет офисов — Score не выше 30.
    3. Если рядом (100-200м) есть негативные факторы (свалка, тюрьма) — снижай оценку на 20-30 баллов.
    4. Если конкурентов много (>5) — это хорошо (есть рынок), но нужен дифференциатор.

    ЗАДАЧА:
    1. Критически оцени локацию.
    2. Проверь наличие конкурентов.
    3. Оцени трафик-генераторы.

    ВЕРНИ ТОЛЬКО JSON (без Markdown):
    {
      "analyzed_address": "Адрес",
      "score": 0-100,
      "verdict": "Краткий вердикт (Почему НЕТ или ДА)",
      "location_vibe": "Атмосфера",
      "audience": {
        "who": "...",
        "needs": "...",
        "peak_hours": "..."
      },
      "analysis": {
        "traffic_drivers": "...",
        "barriers": "...",
        "competition_level": "..."
      },
      "marketing_advice": "..."
    }
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        tools: [{ google_search: {} }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates");
        const candidate = data.candidates[0];
        if (candidate.finishReason === "SAFETY") throw new Error("Safety Block");

        let textPart = "";
        if (candidate.content && candidate.content.parts) {
            textPart = candidate.content.parts.map(p => p.text || "").join(" ");
        }

        if (!textPart.trim()) throw new Error("Empty AI response");

        console.log("Raw AI Response:", textPart);

        const firstBrace = textPart.indexOf('{');
        const lastBrace = textPart.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
             throw new Error("JSON not found in response");
        }

        let jsonString = textPart.substring(firstBrace, lastBrace + 1);
        
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn("JSON Parse Error. Raw:", jsonString);
            throw new Error("Ошибка чтения ответа от ИИ. Попробуйте еще раз.");
        }

    } catch (e) {
        console.error("Analysis failed", e);
        if (e.message.includes("Overpass")) {
             alert("Сервер карт не отвечает. Попробуйте позже.");
        } else {
             alert("Ошибка анализа: " + e.message);
        }
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
        <div class="popup-form">
            <div style="text-align:center; font-size:0.9em; margin-bottom:5px;">
                <b>Координаты:</b> ${lat.toFixed(5)}, ${lng.toFixed(5)}
            </div>

            <div class="popup-label">Тип локации:</div>
            <select id="locationType" class="popup-select">
                <option value="Спальный район">Спальный район</option>
                <option value="Центр города">Центр города</option>
                <option value="Трасса">Трасса</option>
                <option value="Промзона">Промзона</option>
                <option value="Пригород">Пригород</option>
            </select>

            <div class="popup-label">Трафик (чел/5мин):</div>
            <input id="trafficLevel" type="number" class="popup-input" placeholder="0" min="0">

            <button id="btnRunAnalysis" class="primary-btn popup-btn">📊 Анализировать</button>
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
                 const typeEl = document.getElementById('locationType');
                 const trafficEl = document.getElementById('trafficLevel');
                 const typeVal = typeEl ? typeEl.value : 'Не указано';
                 const trafficVal = trafficEl ? trafficEl.value : '0';

                 runAnalysis(latlng, typeVal, trafficVal);
                 map.closePopup();
             }
        };
    }
});
// --- Новая функция для получения адреса ---

async function getAddress(lat, lon) {
    try {
        // Используем бесплатный геокодер OSM (Nominatim)
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ru`);
        if (!response.ok) throw new Error('Geocoding failed');
        const data = await response.json();
        return data.display_name || "Адрес не определен";
    } catch (e) {
        console.warn("Geocoding error:", e);
        return "Адрес не определен (координаты: " + lat.toFixed(4) + ", " + lon.toFixed(4) + ")";
    }
}

async function runAnalysis(latlng, locationType, visualTraffic) {
    const { lat, lng } = latlng;

    // UI Update
    document.getElementById('auditIntro').classList.add('hidden');
    document.getElementById('auditResult').classList.add('hidden');
    document.getElementById('auditLoading').classList.remove('hidden');

    try {
        // 1. Параллельно получаем данные карты и точный адрес
        const [summary, address] = await Promise.all([
            getSurroundingData(lat, lng),
            getAddress(lat, lng)
        ]);

        // 2. Hard Block Check
        if (summary && summary.hasRedFlag) {
            renderHardBlockResult(summary.redFlagReason);
            return;
        }

        // 3. Density Warning
        let densityWarning = "";
        if (summary && summary.lowDensity) {
            densityWarning = "ВНИМАНИЕ: Низкая плотность застройки! (Мало жилья/офисов в 300м).";
        }

        // 4. Отправляем всё в ИИ
        const aiResult = await askGemini(summary, lat, lng, address, locationType, visualTraffic, densityWarning);

        // 5. Рисуем результат
        renderAuditResult(aiResult, summary, locationType, visualTraffic);

    } catch (error) {
        console.error(error);
        alert("Ошибка анализа: " + error.message);
        document.getElementById('auditIntro').classList.remove('hidden');
    } finally {
        document.getElementById('auditLoading').classList.add('hidden');
    }
}

function renderAuditResult(data, summary, locationType, visualTraffic) {
    const container = document.getElementById('auditResult');
    container.innerHTML = '';

    // Цвета для светофора
    let colorClass = 'score-yellow';
    if (data.score >= 75) colorClass = 'score-green';
    if (data.score < 40) colorClass = 'score-red';

    // --- Raw Data HTML ---
    const rawDataHtml = `
    <div class="raw-data-container">
        <div class="raw-data-title">📊 Сырые данные (OSM + Ввод)</div>
        <div class="raw-data-item"><span>👥 Население (оценка):</span> <b>~${summary.population}</b></div>
        <div class="raw-data-item"><span>🏠 Жилье (300м):</span> <b>${summary.apartments.count} зд.</b></div>
        <div class="raw-data-item"><span>🍔 Конкуренты:</span> <b>${summary.competitors.length}</b></div>
        <div class="raw-data-item"><span>⚓ Якоря:</span> <b>${summary.anchors.length}</b></div>
        <div class="raw-data-item"><span>🏭 Офисы:</span> <b>${summary.offices}</b></div>
        <div class="raw-data-item"><span>🚶 Трафик (ввод):</span> <b>${visualTraffic}</b></div>
        <div class="raw-data-item"><span>📍 Тип (ввод):</span> <b>${locationType}</b></div>
        ${summary.lowDensity ? '<div class="low-density-warning">⚠️ Низкая плотность застройки</div>' : ''}
    </div>
    `;

    const html = `
        <div class="audit-score-card ${colorClass}">
            <div style="font-size: 2.5rem; font-weight: bold;">${data.score}/100</div>
            <div style="font-size: 1.1rem; opacity: 0.9;">${data.verdict}</div>
        </div>

        ${rawDataHtml}

        <div style="background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #3b82f6;">
            <div class="audit-section-title" style="margin-top:0;">📍 Атмосфера (Vibe)</div>
            <div style="font-size: 0.9em; font-style: italic;">"${data.location_vibe}"</div>
        </div>

        <div class="audit-section-title">👤 Портрет клиента</div>
        <div class="stat-grid" style="grid-template-columns: 1fr; gap: 8px; text-align: left;">
            <div class="stat-item" style="align-items: flex-start; padding: 10px;">
                <div class="stat-label">Кто они?</div>
                <div style="font-weight: 600;">${data.audience.who}</div>
            </div>
            <div class="stat-item" style="align-items: flex-start; padding: 10px;">
                <div class="stat-label">Потребность</div>
                <div>${data.audience.needs}</div>
            </div>
            <div class="stat-item" style="align-items: flex-start; padding: 10px;">
                <div class="stat-label">Пик трафика</div>
                <div>⏰ ${data.audience.peak_hours}</div>
            </div>
        </div>

        <div class="audit-section-title">📊 Глубокий анализ</div>
        <ul style="font-size: 0.9em; padding-left: 20px; color: #334155;">
            <li style="margin-bottom: 5px;"><b>Магнит трафика:</b> ${data.analysis.traffic_drivers}</li>
            <li style="margin-bottom: 5px;"><b>Барьеры:</b> ${data.analysis.barriers}</li>
            <li style="margin-bottom: 5px;"><b>Конкуренция:</b> ${data.analysis.competition_level}</li>
        </ul>

        <div style="margin-top: 15px; padding: 12px; background: #ecfdf5; border-radius: 8px; border: 1px solid #10b981;">
            <div style="color: #047857; font-weight: bold; font-size: 0.9em;">💡 Совет маркетолога:</div>
            <div style="font-size: 0.9em; color: #065f46;">${data.marketing_advice}</div>
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

function renderHardBlockResult(reason) {
    const container = document.getElementById('auditResult');
    container.innerHTML = `
        <div class="audit-hard-block">
            <div class="icon">⛔</div>
            <div class="title">ЛОКАЦИЯ ОТКЛОНЕНА</div>
            <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">Score: 0/100</div>
            <div style="font-size:0.95em; color:#a00;">${reason}</div>
        </div>
        <button id="btnResetAudit" class="primary-btn" style="margin-top: 15px; background-color: #6c757d;">🔄 Новый поиск</button>
    `;
    container.classList.remove('hidden');
    document.getElementById('auditLoading').classList.add('hidden');

    const btnReset = document.getElementById('btnResetAudit');
    if(btnReset) {
        btnReset.addEventListener('click', () => {
            container.classList.add('hidden');
            document.getElementById('auditIntro').classList.remove('hidden');
        });
    }
}

init();
