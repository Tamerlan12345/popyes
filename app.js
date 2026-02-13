// ---- Lazy Loading Helpers ----
const LIBS = {
  turf: 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js'
};

// ---- Config ----
const OVERPASS_SERVERS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter', // Быстрый в СНГ
    'https://overpass.kumi.systems/api/interpreter', // Резерв
    'https://overpass-api.de/api/interpreter' // Стандартный
];
const OVERPASS_TIMEOUT_MS = 100000; // 100 seconds
const OVERPASS_QL_TIMEOUT = 90; // 90 seconds in query

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

async function fetchCommercialData(lat, lon) {
    const query = `
      [out:json][timeout:${OVERPASS_QL_TIMEOUT}];
      (
        node(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];
        way(around:500, ${lat}, ${lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];
        node(around:500, ${lat}, ${lon})["shop"~"mall|supermarket|marketplace"];
        way(around:500, ${lat}, ${lon})["shop"~"mall|supermarket|marketplace"];
        node(around:500, ${lat}, ${lon})["office"];
        way(around:500, ${lat}, ${lon})["office"];
        node(around:100, ${lat}, ${lon})["amenity"~"atm|bank"];
      );
      out center;
    `;
    return _executeOverpassQuery(query, "Commercial");
}

async function fetchInfrastructure(lat, lon) {
    const query = `
      [out:json][timeout:${OVERPASS_QL_TIMEOUT}];
      (
        node(around:500, ${lat}, ${lon})["amenity"~"school|university|college|kindergarten"];
        way(around:500, ${lat}, ${lon})["amenity"~"school|university|college|kindergarten"];
        node(around:100, ${lat}, ${lon})["highway"="crossing"];
        way(around:100, ${lat}, ${lon})["highway"="footway"];
        node(around:500, ${lat}, ${lon})["highway"="bus_stop"];
        node(around:500, ${lat}, ${lon})["railway"="subway_entrance"];
        node(around:500, ${lat}, ${lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];
        way(around:500, ${lat}, ${lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];
        node(around:500, ${lat}, ${lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
        way(around:500, ${lat}, ${lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
        node(around:100, ${lat}, ${lon})["natural"~"water|beach|wetland"];
        way(around:100, ${lat}, ${lon})["natural"~"water|beach|wetland"];
        node(around:100, ${lat}, ${lon})["landuse"~"forest"];
        way(around:100, ${lat}, ${lon})["landuse"~"forest"];
      );
      out center;
    `;
    return _executeOverpassQuery(query, "Infrastructure");
}

async function fetchHousing(lat, lon) {
    // Optimised radius: 300m
    const query = `
      [out:json][timeout:${OVERPASS_QL_TIMEOUT}];
      (
        way(around:300, ${lat}, ${lon})["building"~"apartments|residential"];
      );
      out center;
    `;
    return _executeOverpassQuery(query, "Housing");
}

async function _executeOverpassQuery(query, label) {
    for (const url of OVERPASS_SERVERS) {
        try {
            // console.log(`Fetching ${label} from: ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

            const response = await fetch(url, {
                method: 'POST',
                body: query,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 429 || response.status === 504) {
                console.warn(`${label}: Overpass API ${url} returned status ${response.status}. Retrying...`);
                continue;
            }

            if (!response.ok) {
                console.warn(`${label}: Overpass API ${url} returned status ${response.status}. Skipping.`);
                continue;
            }

            const text = await response.text();
            if (text.trim().startsWith('<')) {
                 console.warn(`${label}: Overpass API ${url} returned HTML error.`);
                 continue;
            }

            try {
                return JSON.parse(text);
            } catch (jsonError) {
                console.warn(`${label}: Failed to parse JSON from ${url}:`, jsonError);
                continue;
            }

        } catch (e) {
            console.error(`${label}: Connection failed for ${url}:`, e);
        }
    }
    // Return null if all failed
    return null;
}

async function getSurroundingData(lat, lon) {
    const [mainSummary, pointFeatures, barriers] = await Promise.all([
        _fetchMainData(lat, lon),
        _fetchPointData(lat, lon),
        _fetchBarrierData(lat, lon)
    ]);

    if (!mainSummary) return null;

    mainSummary.pointFeatures = pointFeatures;
    mainSummary.barriers = barriers;
    return mainSummary;
}

async function _fetchMainData(lat, lon) {
    console.log("Fetching map data in 3 chunks...");
    const results = await Promise.allSettled([
        fetchCommercialData(lat, lon),
        fetchInfrastructure(lat, lon),
        fetchHousing(lat, lon)
    ]);

    let combinedElements = [];
    let failedCount = 0;

    results.forEach((res, index) => {
        if (res.status === 'fulfilled' && res.value && res.value.elements) {
            combinedElements = combinedElements.concat(res.value.elements);
        } else {
            failedCount++;
            console.warn(`Chunk ${index} failed or returned no data.`);
        }
    });

    if (failedCount === 3) {
        console.error("All map data chunks failed. Using fallback.");
        return {
            isPartial: true,
            osm_data_missing: true,
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
            existingPopeyesPoints: [],
            physicalConstraints: [],
            pointFeatures: [],
            barriers: [],
            hasRedFlag: false,
            redFlagReason: null,
            lowDensity: false,
            vibrancy: {
                atms: 0,
                banks: 0,
                crossings: 0,
                footways: 0,
                retail_count_50m: 0,
                transport_100m: 0
            }
        };
    }

    // Combine into a mock Overpass response structure
    const combinedData = { elements: combinedElements };
    const summary = parseOverpassData(combinedData, lat, lon);

    if (failedCount > 0) {
        summary.isPartial = true;
        console.warn("Map data is partial.");
    }

    return summary;
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
        existingPopeyesPoints: [],
        physicalConstraints: [], // General constraints in 100m
        pointFeatures: [],       // Specific features at 0-10m
        barriers: [],            // Barriers in 300m
        hasRedFlag: false,
        redFlagReason: null,
        lowDensity: false,
        vibrancy: {
            atms: 0,
            banks: 0,
            crossings: 0,
            footways: 0,
            retail_count_50m: 0,
            transport_100m: 0
        }
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

        // Competitors & Own Brand
        if (['fast_food', 'cafe', 'restaurant', 'pub', 'bar', 'food_court', 'biergarten'].includes(tags.amenity)) {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || 'Unnamed';
            summary.competitors.push(`${name} (${tags.amenity}) - ${Math.round(dist)}m`);

            if (name && name.toLowerCase().includes('popeyes')) {
                summary.existingPopeyesPoints.push(`${name} (${Math.round(dist)}m)`);
            }

            // Vibrancy: Retail/Food within 50m
            if (dist <= 50) {
                summary.vibrancy.retail_count_50m++;
            }
        }

        // Vibrancy: Shops
        if (tags.shop) {
             if (dist <= 50) {
                 summary.vibrancy.retail_count_50m++;
             }
        }

        // Vibrancy: Financial
        if (tags.amenity === 'atm' || tags.amenity === 'bank') {
            if (dist <= 100) {
                 if (tags.amenity === 'atm') summary.vibrancy.atms++;
                 if (tags.amenity === 'bank') summary.vibrancy.banks++;
            }
        }

        // Vibrancy: Walking
        if (tags.highway === 'crossing') {
             if (dist <= 100) summary.vibrancy.crossings++;
        }
        if (tags.highway === 'footway') {
             if (dist <= 100) summary.vibrancy.footways++;
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
            if (dist <= 100) summary.vibrancy.transport_100m++;
        }
        if (tags.railway === 'subway_entrance') {
            summary.transport.subway++;
            isAnchor = true;
            if (dist <= 100) summary.vibrancy.transport_100m++;
        }

        if (isAnchor) {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || tags.amenity || tags.shop || tags.office;
            summary.anchors.push(`${name} (${Math.round(dist)}m)`);
        }

        // Negatives & Red Flags
        let isNegative = false;
        const negativeLanduse = ['cemetery', 'industrial', 'garages', 'landfill', 'brownfield'];
        const negativeAmenity = ['prison', 'grave_yard', 'waste_disposal', 'mortuary'];
        const physicalBad = ['water', 'beach', 'wetland']; // natural

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

        // Physical Constraints (Water, Forest, etc)
        if (physicalBad.includes(tags.natural) || tags.landuse === 'forest') {
             const name = tags.name || tags.natural || tags.landuse;
             summary.physicalConstraints.push(`${name} (${Math.round(dist)}m)`);

             if (dist <= 50) {
                 summary.hasRedFlag = true;
                 summary.redFlagReason = `Локация непригодна: ${name} (вода/лес) в ${Math.round(dist)}м`;
             }
        }

        // --- Point Specific Check (0-10m) ---
        if (dist <= 15) { // Slightly generous 15m to catch point features
            const pointNatural = ['water', 'beach', 'wetland', 'wood', 'scrub', 'heath', 'grassland'];
            const pointLanduse = ['cemetery', 'industrial', 'forest', 'meadow', 'military', 'railway', 'quarry'];
            const pointLeisure = ['park', 'garden', 'playground', 'pitch', 'nature_reserve'];
            const pointHighway = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link'];

            if (pointNatural.includes(tags.natural) ||
                pointLanduse.includes(tags.landuse) ||
                pointLeisure.includes(tags.leisure) ||
                pointHighway.includes(tags.highway)) {

                const type = tags.natural || tags.landuse || tags.leisure || tags.highway;
                const name = tags.name || type;
                summary.pointFeatures.push(`${name} (${type})`);
            }
        }

        // --- Barrier Check (300m) ---
        if (dist <= 300) {
            const barrierWater = ['river', 'canal', 'stream', 'drain', 'ditch'];
            const barrierRail = ['rail', 'tram', 'light_rail', 'subway'];
            const barrierWall = ['wall', 'fence', 'gate', 'hedge'];

            if (barrierWater.includes(tags.waterway) ||
                barrierRail.includes(tags.railway) ||
                barrierWall.includes(tags.barrier)) {

                const type = tags.waterway || tags.railway || tags.barrier;
                const name = tags.name || type;
                summary.barriers.push(`${name} (${type}) - ${Math.round(dist)}m`);
            }
        }
    });

    // --- 3. Density Check ---
    if (residentialCount300m === 0 && officeCount300m === 0) {
        summary.lowDensity = true;
    }

    return summary;
}

async function _fetchPointData(lat, lon) {
    const query = `
      [out:json][timeout:25];
      (
        node(around:15, ${lat}, ${lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];
        way(around:15, ${lat}, ${lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];
        relation(around:15, ${lat}, ${lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];

        node(around:15, ${lat}, ${lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];
        way(around:15, ${lat}, ${lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];
        relation(around:15, ${lat}, ${lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];

        way(around:15, ${lat}, ${lon})["highway"~"motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link"];

        node(around:15, ${lat}, ${lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
        way(around:15, ${lat}, ${lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
        relation(around:15, ${lat}, ${lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
      );
      out tags;
    `;

    const data = await _executeOverpassQuery(query, "PointData");
    const features = [];
    if (data && data.elements) {
        data.elements.forEach(el => {
            const tags = el.tags || {};
            const type = tags.natural || tags.landuse || tags.highway || tags.leisure;
            const name = tags.name || type;
            if (type) features.push(`${name} (${type})`);
        });
    }
    return features;
}

async function _fetchBarrierData(lat, lon) {
    const query = `
      [out:json][timeout:25];
      (
        way(around:300, ${lat}, ${lon})["waterway"~"river|canal|stream|drain|ditch"];
        way(around:300, ${lat}, ${lon})["railway"~"rail|tram|light_rail|subway"];
        way(around:300, ${lat}, ${lon})["barrier"~"wall|fence|gate|hedge"];
      );
      out geom;
    `;

    const data = await _executeOverpassQuery(query, "BarrierData");
    const barriers = [];

    if (!data) return barriers;

    try {
        await ensureLibraryLoaded('turf', LIBS.turf);
        const t = window.turf || turf;

        if (data.elements) {
            data.elements.forEach(el => {
                if (!el.geometry) return;
                const tags = el.tags || {};
                // Convert geometry to GeoJSON LineString
                const coords = el.geometry.map(p => [p.lon, p.lat]);
                const line = t.lineString(coords);
                const pt = t.point([lon, lat]);
                const distMeters = t.pointToLineDistance(pt, line, {units: 'kilometers'}) * 1000;

                if (distMeters <= 300) {
                    const type = tags.waterway || tags.railway || tags.barrier;
                    const name = tags.name || type;
                    barriers.push(`${name} (${type}) - ${Math.round(distMeters)}m`);
                }
            });
        }
    } catch (e) {
        console.warn("Turf processing failed", e);
    }
    return barriers;
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
const tabSearch = document.getElementById('tabSearch');
const contentEarthquakes = document.getElementById('contentEarthquakes');
const contentAudit = document.getElementById('contentAudit');
const contentSearch = document.getElementById('contentSearch');

function switchTab(tab) {
    // Reset all
    tabEarthquakes.classList.remove('active');
    tabAudit.classList.remove('active');
    if (tabSearch) tabSearch.classList.remove('active');

    contentEarthquakes.classList.add('hidden');
    contentAudit.classList.add('hidden');
    if (contentSearch) contentSearch.classList.add('hidden');

    disableAuditMode();
    disableSearchMode();

    if (tab === 'earthquakes') {
        tabEarthquakes.classList.add('active');
        contentEarthquakes.classList.remove('hidden');
    } else if (tab === 'audit') {
        tabAudit.classList.add('active');
        contentAudit.classList.remove('hidden');
    } else if (tab === 'search') {
        if (tabSearch) tabSearch.classList.add('active');
        if (contentSearch) contentSearch.classList.remove('hidden');
        enableSearchMode();
    }
}

if (tabEarthquakes && tabAudit) {
    tabEarthquakes.addEventListener('click', () => switchTab('earthquakes'));
    tabAudit.addEventListener('click', () => switchTab('audit'));
    if (tabSearch) tabSearch.addEventListener('click', () => switchTab('search'));
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
        btnToggleAudit.innerText = "📍 Начать анализ"; // Keep text static as requested
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
                 runAnalysis(latlng);
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

async function runAnalysis(latlng) {
    const { lat, lng } = latlng;
    const center = map.getCenter();

    // UI Update
    document.getElementById('auditIntro').classList.add('hidden');
    document.getElementById('auditResult').classList.add('hidden');
    document.getElementById('auditLoading').classList.remove('hidden');

    try {
        if (typeof GeomarketingProService === 'undefined') {
            throw new Error("Pro Service not loaded");
        }

        // Always run Popeyes Audit
        const proResult = await GeomarketingProService.runPopeyesAudit(lat, lng, center.lat, center.lng);

        renderProAuditResult(proResult);

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

function renderHardBlockResult(reason, containerId = 'auditResult') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="audit-hard-block">
            <div class="icon">⛔</div>
            <div class="title">ЛОКАЦИЯ ОТКЛОНЕНА</div>
            <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">Score: 0/100</div>
            <div style="font-size:0.95em; color:#a00;">${reason}</div>
        </div>
        <button class="primary-btn btn-reset-audit" style="margin-top: 15px; background-color: #6c757d;">🔄 Новый поиск</button>
    `;
    container.classList.remove('hidden');

    // Hide loading
    const loadingId = containerId === 'auditResult' ? 'auditLoading' : 'searchLoading';
    const loading = document.getElementById(loadingId);
    if (loading) loading.classList.add('hidden');

    const btnReset = container.querySelector('.btn-reset-audit');
    if(btnReset) {
        btnReset.addEventListener('click', () => {
            container.classList.add('hidden');
            const introId = containerId === 'auditResult' ? 'auditIntro' : 'searchIntro';
            const intro = document.getElementById(introId);
            if (intro) intro.classList.remove('hidden');
        });
    }
}

// ---- Search Mode Logic ----
let searchModeEnabled = false;
let searchCircle = null;
const searchRadiusInput = document.getElementById('searchRadiusInput');
const searchRadiusValue = document.getElementById('searchRadiusValue');

function enableSearchMode() {
    searchModeEnabled = true;
    updateSearchCircle();

    map.on('move', updateSearchCircle);
    map.on('zoom', updateSearchCircle);
}

function disableSearchMode() {
    searchModeEnabled = false;
    if (searchCircle) {
        map.removeLayer(searchCircle);
        searchCircle = null;
    }
    map.off('move', updateSearchCircle);
    map.off('zoom', updateSearchCircle);
}

function updateSearchCircle() {
    if (!searchModeEnabled) return;

    const center = map.getCenter();
    let radius = 1000;
    if (searchRadiusInput) {
        radius = parseInt(searchRadiusInput.value);
    }

    if (!searchCircle) {
        searchCircle = L.circle(center, {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            weight: 1,
            radius: radius
        }).addTo(map);
    } else {
        searchCircle.setLatLng(center);
        searchCircle.setRadius(radius);
        if (!map.hasLayer(searchCircle)) {
            searchCircle.addTo(map);
        }
    }
}

if (searchRadiusInput) {
    searchRadiusInput.addEventListener('input', () => {
        const r = searchRadiusInput.value;
        if (searchRadiusValue) {
            if (r >= 1000) {
                searchRadiusValue.innerText = (r / 1000).toFixed(1) + ' км';
            } else {
                searchRadiusValue.innerText = r + ' м';
            }
        }
        updateSearchCircle();
    });
}

const searchIntro = document.getElementById('searchIntro');
const searchLoading = document.getElementById('searchLoading');
const searchResult = document.getElementById('searchResult');
const btnScanArea = document.getElementById('btnScanArea');

if (btnScanArea) {
    btnScanArea.addEventListener('click', runAreaScan);
}

async function runAreaScan() {
    if (!searchModeEnabled) return;

    const center = map.getCenter();
    let radius = 1000;
    if (searchRadiusInput) {
        radius = parseInt(searchRadiusInput.value);
    }

    if (searchIntro) searchIntro.classList.add('hidden');
    if (searchResult) searchResult.classList.add('hidden');
    if (searchLoading) searchLoading.classList.remove('hidden');
    if (btnScanArea) btnScanArea.disabled = true;

    try {
        if (typeof GeomarketingProService === 'undefined' || !GeomarketingProService.scanArea) {
             throw new Error("Служба поиска не готова (функция scanArea не найдена)");
        }

        const result = await GeomarketingProService.scanArea(center.lat, center.lng, radius);

        renderProAuditResult(result, 'searchResult');

    } catch (e) {
        console.error("Scan failed", e);
        alert(e.message);
        if (searchIntro) searchIntro.classList.remove('hidden');
    } finally {
        if (searchLoading) searchLoading.classList.add('hidden');
        if (btnScanArea) btnScanArea.disabled = false;
    }
}

init();

function renderProAuditResult(data, containerId = 'auditResult') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // 1. Sanity Check / Terrain Block (Level 1)
    // The service might return a special object for Hard Reject
    if (data.isHardReject) {
        renderHardBlockResult(data.rejectReason, containerId);
        return;
    }

    // Determine Color Class
    let colorClass = 'score-yellow';
    let bgColor = '#fef08a'; // Yellow 200
    let textColor = '#854d0e'; // Yellow 800

    if (data.score >= 70) {
        colorClass = 'score-green';
        bgColor = '#bbf7d0'; // Green 200
        textColor = '#166534'; // Green 800
    } else if (data.score < 40) {
        colorClass = 'score-red';
        bgColor = '#fecaca'; // Red 200
        textColor = '#991b1b'; // Red 800
    }

    const metrics = data.metrics || {};
    const proofPoints = data.proof_points || [];
    const risks = data.risk_factors || [];

    // --- Metrics HTML ---
    // WorldPop
    const popSource = metrics.is_projected ? '(Расчет)' : '(WorldPop)';

    // Warning HTML
    const warningHtml = data.map_data_warning
        ? `<div style="background: #fff7ed; color: #c2410c; padding: 10px; border-radius: 8px; border: 1px solid #fdba74; margin-bottom: 15px; text-align: center; font-size: 0.9em;">
            ⚠️ Детальная карта недоступна. Анализ выполнен на основе спутниковых данных (WorldPop).
           </div>`
        : '';

    const html = `
        <div class="audit-dashboard" style="font-family: 'Inter', sans-serif;">
            <!-- Header -->
            ${warningHtml}
            <div style="background: ${bgColor}; color: ${textColor}; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05);">
                <div style="font-size: 3rem; font-weight: 800; line-height: 1;">${data.score}</div>
                <div style="font-size: 0.9rem; text-transform: uppercase; font-weight: 600; opacity: 0.8; margin-top:5px;">Score</div>
                <div style="font-size: 1.2rem; font-weight: 700; margin-top: 10px; line-height: 1.3;">${data.verdict_title}</div>
            </div>

            <!-- Metrics Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                    <div style="font-size: 1.2rem; font-weight: 700; color: #334155;">${metrics.real_population_500m}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">Жители 500м<br>${popSource}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                    <div style="font-size: 1.2rem; font-weight: 700; color: #334155;">${metrics.vibrancy_score}/10</div>
                    <div style="font-size: 0.75rem; color: #64748b;">Vibrancy<br>Score</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                    <div style="font-size: 1.2rem; font-weight: 700; color: #334155;">${metrics.competitors_count}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">Конкуренты<br>(Рынок)</div>
                </div>
            </div>

            <!-- Proof Points (Why YES) -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85rem; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 10px;">🏆 Доказательная база (Why YES?)</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${proofPoints.map(point => `
                        <div style="display: flex; align-items: start; gap: 10px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="color: #22c55e;">✅</div>
                            <div style="font-size: 0.95rem; color: #334155; font-weight: 500;">${point}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Recommendation -->
            <div style="background: #eff6ff; padding: 15px; border-radius: 12px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
                <div style="color: #1e40af; font-weight: 700; font-size: 0.9rem; margin-bottom: 5px;">💡 РЕКОМЕНДАЦИЯ</div>
                <div style="color: #1e3a8a; font-size: 0.95rem; line-height: 1.5;">${data.recommendation}</div>
            </div>

            <!-- Risks (Attention) -->
            ${risks.length > 0 ? `
            <div style="background: #fff1f2; padding: 15px; border-radius: 12px; border: 1px solid #fda4af;">
                <div style="color: #9f1239; font-weight: 700; font-size: 0.9rem; margin-bottom: 10px;">⚠️ ВНИМАНИЕ (РИСКИ)</div>
                <ul style="margin: 0; padding-left: 20px; color: #881337; font-size: 0.9rem;">
                    ${risks.map(r => `<li style="margin-bottom: 5px;">${r}</li>`).join('')}
                </ul>
            </div>
            ` : ''}

            <!-- C-Level Debate -->
            ${data.c_level_debate ? `
            <div style="margin-top: 20px;">
                 <div style="font-size: 0.85rem; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 10px;">👔 Совет Директоров (C-Level Debate)</div>
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                     <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1;">
                         <div style="font-weight: 700; color: #334155; margin-bottom: 5px;">COO (Операционный)</div>
                         <div style="font-size: 0.85rem; color: #475569; font-style: italic;">"${data.c_level_debate.COO_opinion}"</div>
                     </div>
                     <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1;">
                         <div style="font-weight: 700; color: #334155; margin-bottom: 5px;">CFO (Финансовый)</div>
                         <div style="font-size: 0.85rem; color: #475569; font-style: italic;">"${data.c_level_debate.CFO_opinion}"</div>
                     </div>
                 </div>
            </div>
            ` : ''}

            <!-- Marketing 5P -->
            ${data.marketing_5p ? `
            <div style="margin-top: 20px;">
                 <div style="font-size: 0.85rem; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 10px;">📈 Маркетинг 5P</div>
                 <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                     ${Object.entries(data.marketing_5p).map(([key, val], idx) => {
                         let label = key.replace('_', ' ').toUpperCase();
                         if(key === 'place_audit') label = 'PLACE (Место)';
                         if(key === 'people_audit') label = 'PEOPLE (Люди)';
                         if(key === 'product_fit') label = 'PRODUCT (Продукт)';
                         if(key === 'price_potential') label = 'PRICE (Цена)';
                         if(key === 'promotion_strategy') label = 'PROMOTION (Промо)';

                         const bg = idx % 2 === 0 ? '#f8fafc' : 'white';
                         return `
                         <div style="padding: 10px; background: ${bg}; border-bottom: 1px solid #e2e8f0; display: flex; flex-direction: column;">
                             <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; margin-bottom: 2px;">${label}</div>
                             <div style="font-size: 0.9rem; color: #334155;">${val}</div>
                         </div>`;
                     }).join('')}
                 </div>
            </div>
            ` : ''}

            <!-- Analyst Verdict -->
            ${(() => {
                if (!data.executive_summary) return '';
                let summaryColor = '#334155'; // Default dark gray
                let summaryBg = '#f1f5f9';
                let summaryBorder = '#cbd5e1';
                const summaryText = data.executive_summary.toUpperCase();

                if (summaryText.includes('NO-GO') || summaryText.includes('NO GO') || summaryText.includes('RED')) {
                     summaryColor = '#991b1b'; // Red
                     summaryBg = '#fee2e2';
                     summaryBorder = '#fca5a5';
                } else if (summaryText.includes('CAUTION') || summaryText.includes('YELLOW')) {
                     summaryColor = '#854d0e'; // Yellow
                     summaryBg = '#fef9c3';
                     summaryBorder = '#fde047';
                } else if (summaryText.includes('GO')) {
                     summaryColor = '#166534'; // Green
                     summaryBg = '#dcfce7';
                     summaryBorder = '#86efac';
                }

                return `
                <div style="margin-top: 20px; border: 2px solid ${summaryBorder}; background: ${summaryBg}; padding: 15px; border-radius: 12px;">
                    <div style="color: ${summaryColor}; font-weight: 800; font-size: 0.95rem; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <span>👨‍💼</span> ВЕРДИКТ ГЕНЕРАЛЬНОГО АНАЛИТИКА
                    </div>
                    <div style="color: ${summaryColor}; font-size: 0.95rem; line-height: 1.5; font-weight: 500;">
                        ${data.executive_summary}
                    </div>
                </div>
                `;
            })()}

            <!-- Data Sources Footer -->
            <div style="margin-top: 20px; font-size: 0.7rem; color: #94a3b8; text-align: center;">
                Данные: WorldPop API (2020), OpenStreetMap, AI Analysis
            </div>

            <button class="primary-btn btn-reset-audit" style="margin-top: 20px; width: 100%; background-color: #475569;">🔄 Новый поиск</button>
        </div>
    `;

    container.innerHTML = html;
    container.classList.remove('hidden');

    const btnReset = container.querySelector('.btn-reset-audit');
    if(btnReset) {
        btnReset.addEventListener('click', () => {
            container.classList.add('hidden');
            const introId = containerId === 'auditResult' ? 'auditIntro' : 'searchIntro';
            const intro = document.getElementById(introId);
            if (intro) intro.classList.remove('hidden');
        });
    }
}
