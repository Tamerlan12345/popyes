
// ---- Hexagon Data Service (Tier 1 Source: Kontur Population Mock) ----
class HexagonDataService {
    static getDensity(lat, lng, centerLat, centerLng) {
        // Simple distance-based density model
        // Distance in km
        const R = 6371;
        const dLat = (lat - centerLat) * Math.PI / 180;
        const dLng = (lng - centerLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanceKm = R * c;

        // Model:
        // Center (0km) -> 150 ppl/ha
        // Outskirts (10km) -> 5 ppl/ha
        // Mountains (South of center) -> drop faster

        let baseDensity = 150;

        // Decrease by distance
        // Linear drop: 150 - (14.5 * distance)
        let density = baseDensity - (14.5 * distanceKm);

        // Mountain check (South of 43.20 is mostly mountains/hills)
        if (lat < 43.20) {
            density = Math.min(density, 20); // Cap at 20 if South
            density -= (43.20 - lat) * 1000; // Rapid drop
        }

        // Noise/Variation based on coordinates to simulate "patchy" data
        const noise = (Math.sin(lat * 1000) + Math.cos(lng * 1000)) * 5;
        density += noise;

        return Math.max(Math.round(density), 0); // Ensure non-negative integer
    }
}

// ---- WorldPop Service (Tier 2 Source: Real Data) ----
class WorldPopService {
    static async getPopulation(lat, lng) {
        // Create 500m bounding box (approx 0.0045 deg)
        const r = 0.0045;
        const minLon = lng - r;
        const maxLon = lng + r;
        const minLat = lat - r;
        const maxLat = lat + r;

        // GeoJSON Polygon for WorldPop
        const geojson = {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [minLon, minLat],
                    [maxLon, minLat],
                    [maxLon, maxLat],
                    [minLon, maxLat],
                    [minLon, minLat]
                ]]
            }
        };

        // API Endpoint (Dataset 2020)
        const url = `https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&geojson=${JSON.stringify(geojson)}&runasync=false`;

        try {
            // Fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`WorldPop Error: ${response.status}`);
            const data = await response.json();

            // Expected format: { "data": { "total_population": 1234.5, ... } }
            if (data && data.data && typeof data.data.total_population === 'number') {
                console.log("WorldPop Success:", data.data.total_population);
                return {
                    population: Math.round(data.data.total_population),
                    is_projected: false
                };
            }
            throw new Error("Invalid Data Format");
        } catch (e) {
            console.warn("WorldPop Service failed:", e);
            return {
                population: null, // Return null to trigger fallback
                is_projected: true
            };
        }
    }
}

// ---- Geomarketing Pro Service (DataHunters Methodology) ----
class GeomarketingProService {

    static async runAudit(lat, lng, centerLat, centerLng) {
        console.log("Starting Pro Audit for:", lat, lng);

        // 1. Gather Data (Tier 1, 2, 3)
        const data = await this.gatherData(lat, lng, centerLat, centerLng);

        // 2. Ask AI (Strategy Mode)
        const aiResult = await this.askGeminiPro(data, 'strategy');

        return {
            ...aiResult,
            rawData: data
        };
    }

    static async runPopeyesAudit(lat, lng, centerLat, centerLng) {
        // Redirect to new GeoAudit 2.0 Logic
        return this.runGeoAudit2(lat, lng, centerLat, centerLng);
    }

    static async runGeoAudit2(lat, lng, centerLat, centerLng) {
        console.log("Starting GeoAudit 2.0 for:", lat, lng);

        // --- LEVEL 1: Gather Data & Engineering Filter ---

        // 1. Basic OSM Data (Levels 1 & 3)
        if (typeof getSurroundingData !== 'function') {
            throw new Error("Standard analysis function 'getSurroundingData' not found.");
        }
        let osmData = await getSurroundingData(lat, lng);
        let mapDataWarning = false;

        if (!osmData) {
            console.warn("OSM Data fetch failed completely. Using empty fallback.");
            osmData = {
                population: 0,
                apartments: { count: 0 },
                competitors: [],
                anchors: [],
                vibrancy: {},
                pointFeatures: [],
                hasRedFlag: false,
                redFlagReason: null
            };
            mapDataWarning = true;
        } else if (osmData.isPartial || osmData.osm_data_missing) {
             console.warn("OSM Data is partial or missing.");
             mapDataWarning = true;
        }

        // 2. Hard Reject Check (Taboo Zones)
        if (osmData.hasRedFlag) {
            console.warn("Hard Reject Triggered:", osmData.redFlagReason);
            return {
                isHardReject: true,
                rejectReason: osmData.redFlagReason,
                terrain_check: "Fail"
            };
        }

        // --- LEVEL 2: Real Demography (WorldPop) ---
        let popData = await WorldPopService.getPopulation(lat, lng);

        // Fallback: Roof Counting
        if (popData.population === null) {
            console.log("Using Roof Counting Fallback");
            // osmData.population was calculated as levels * 4. Requirement says levels * 3.5.
            // Let's recalculate based on apartments count and levels if possible,
            // but osmData.population is already summarized.
            // osmData.population = levels * 4.
            // So: population / 4 * 3.5 = population * 0.875.
            popData.population = Math.round(osmData.population * 0.875);
            popData.is_projected = true;
        }

        // --- LEVEL 3: Vibrancy & Scoring ---
        const vibrancyScore = this.calculateVibrancyScore(osmData.vibrancy || {});
        const geoScore = this.calculateGeoAuditScore(popData.population, vibrancyScore, osmData);

        // Prepare Data for AI
        const data = {
            lat, lng,
            real_population_500m: popData.population,
            is_projected: popData.is_projected,
            vibrancy_score: vibrancyScore,
            score: geoScore,
            osmData: osmData,
            competitors_list: osmData.competitors.join(", "),
            anchors_list: osmData.anchors.join(", "),
            map_data_warning: mapDataWarning
        };

        // --- AI PROMPT & EXECUTION ---
        const aiResult = await this.askGeminiPro(data, 'popeyes');

        // Merge Results
        return {
            ...aiResult, // AI Verdict, Proof Points, Risks
            score: geoScore,
            map_data_warning: mapDataWarning,
            metrics: {
                real_population_500m: popData.population,
                is_projected: popData.is_projected,
                vibrancy_score: vibrancyScore,
                competitors_count: osmData.competitors.length
            },
            rawData: {
                density: Math.round(popData.population / 78.5), // approx density
                estimatedPopulation: popData.population,
                competitorCount: osmData.competitors.length,
                generators: { totalScore: geoScore } // reuse structure for compatibility if needed
            }
        };
    }

    static calculateVibrancyScore(metrics) {
        if (!metrics) return 0;
        let score = 0;
        // 1. Financial (+2)
        if ((metrics.atms || 0) > 0 || (metrics.banks || 0) > 0) score += 2;
        // 2. Transport (+3)
        if ((metrics.transport_100m || 0) > 0) score += 3;
        // 3. Retail Neighbors > 3 (+3)
        if ((metrics.retail_count_50m || 0) > 3) score += 3;
        // 4. Pedestrian Network (+2)
        if ((metrics.crossings || 0) > 0 || (metrics.footways || 0) > 0) score += 2;

        return Math.min(score, 10);
    }

    static calculateGeoAuditScore(population, vibrancyScore, osmData) {
        let score = 0;

        // 1. Demography (Max 40)
        if (population > 5000) score += 40;
        else if (population >= 2000) score += 30;
        else score += 10;

        // 2. Traffic Generators (Max 30)
        let genScore = 0;
        // Check for Mall in anchors (heuristic string check)
        // Format "Name (dist)"
        const hasMall200 = osmData.anchors.some(a => {
            const isMall = a.toLowerCase().includes('mall') || a.toLowerCase().includes('тц') || a.toLowerCase().includes('plaza');
            const distMatch = a.match(/(\d+)m/);
            const dist = distMatch ? parseInt(distMatch[1]) : 999;
            return isMall && dist <= 200;
        });

        if (hasMall200) {
            genScore = 30;
        } else {
            if (osmData.universities > 0) genScore = Math.max(genScore, 20);
            if (osmData.offices > 0) genScore = Math.max(genScore, 15);
        }
        score += Math.min(genScore, 30);

        // 3. Micro-location (Max 30)
        let microScore = 0;
        // Stop/ATM < 100m (using 100m data as proxy for 50m request)
        if (osmData.vibrancy && osmData.vibrancy.transport_100m > 0) microScore += 10;
        if (osmData.vibrancy && (osmData.vibrancy.atms > 0 || osmData.vibrancy.banks > 0)) microScore += 10;

        // Visibility (1st line) - using pointFeatures for primary/secondary roads check
        const isMainRoad = osmData.pointFeatures.some(f =>
            f.includes('primary') || f.includes('secondary') || f.includes('trunk')
        );
        if (isMainRoad) microScore += 10;

        score += Math.min(microScore, 30);

        return Math.min(score, 100);
    }

    static async gatherData(lat, lng, centerLat, centerLng) {
        // Tier 1: Density
        const density = HexagonDataService.getDensity(lat, lng, centerLat, centerLng);

        // Tier 2: OSM Data (Re-using existing function from app.js)
        // Ensure getSurroundingData is available globally
        if (typeof getSurroundingData !== 'function') {
            throw new Error("Standard analysis function 'getSurroundingData' not found.");
        }

        const osmData = await getSurroundingData(lat, lng);

        // Calculate Weighted Generators
        const generators = this.calculateTrafficWeights(osmData);

        // Competitor Density (Competitors per 1000 people)
        // If density is per hectare (100x100m), and we look at 500m radius (~78.5 hectares)
        // Total Pop in 500m radius approx = density * 78.5
        const areaInHectares = Math.PI * 0.5 * 0.5 * 100; // 500m radius = 0.25 sq km = 25 hectares? Wait. 1 sq km = 100 ha. 0.25 * 3.14 = 0.785 sq km = 78.5 ha.
        const estimatedPopulation = density * 78.5;

        const competitorCount = osmData.competitors.length;
        const competitorDensity = estimatedPopulation > 0
            ? (competitorCount / (estimatedPopulation / 1000)).toFixed(2)
            : 0;

        return {
            lat,
            lng,
            density,
            estimatedPopulation: Math.round(estimatedPopulation),
            osmData,
            generators,
            competitorCount,
            competitorDensity,
            competitorTypes: osmData.competitors.join(", ")
        };
    }

    static calculateTrafficWeights(osmData) {
        // Weights: University=10, School=5, Mall=8, Office=6, Metro=7, Bus=2
        let score = 0;
        let details = [];

        if (osmData.universities > 0) {
            score += osmData.universities * 10;
            details.push(`${osmData.universities} ВУЗов (x10)`);
        }
        if (osmData.schools > 0) {
            score += osmData.schools * 5;
            details.push(`${osmData.schools} Школ (x5)`);
        }
        if (osmData.malls > 0) {
            score += osmData.malls * 8;
            details.push(`${osmData.malls} ТРЦ (x8)`);
        }
        if (osmData.offices > 0) {
            score += osmData.offices * 6;
            details.push(`${osmData.offices} Офисов (x6)`);
        }
        if (osmData.transport.subway > 0) {
            score += osmData.transport.subway * 7;
            details.push(`${osmData.transport.subway} Метро (x7)`);
        }
        if (osmData.transport.bus_stops > 0) {
            score += osmData.transport.bus_stops * 2;
            details.push(`${osmData.transport.bus_stops} Остановок (x2)`);
        }

        return {
            totalScore: Math.min(score, 100),
            description: details.join(", ") || "Нет значимых генераторов"
        };
    }

    static async askGeminiPro(data, promptType) {
        const url = `/api/analyze`;

        const payload = {
            data: data,
            promptType: promptType
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Server API Error");

            return await response.json();
        } catch (e) {
            console.error("AI Request Failed", e);
            throw e;
        }
    }

    static async findBestLocationsInBounds(bounds) {
        console.log("Auto-Sourcing: Scanning bounds:", bounds);
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();

        // 1. Scan for Anchors (Mall, Uni, Metro)
        // We only fetch centroids (out center) to be light
        const query = `
          [out:json][timeout:25];
          (
            node["shop"="mall"](${south},${west},${north},${east});
            way["shop"="mall"](${south},${west},${north},${east});
            relation["shop"="mall"](${south},${west},${north},${east});

            node["amenity"="university"](${south},${west},${north},${east});
            way["amenity"="university"](${south},${west},${north},${east});
            relation["amenity"="university"](${south},${west},${north},${east});

            node["station"="subway"](${south},${west},${north},${east});
            node["railway"="subway_entrance"](${south},${west},${north},${east});
          );
          out center;
        `;

        // Local list of servers to avoid external dependency issues
        const SERVERS = [
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass-api.de/api/interpreter'
        ];

        let data = null;
        for (const url of SERVERS) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

                const response = await fetch(url, {
                    method: 'POST',
                    body: query,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    data = await response.json();
                    break;
                }
            } catch (e) {
                console.warn("Auto-Sourcing: Overpass fetch failed", e);
            }
        }

        if (!data || !data.elements) {
            console.warn("Auto-Sourcing: No data returned from Overpass");
            return [];
        }

        // 2. Process Candidates
        let candidates = [];
        data.elements.forEach(el => {
            const lat = el.lat || (el.center ? el.center.lat : null);
            const lon = el.lon || (el.center ? el.center.lon : null);
            if (!lat || !lon) return;

            const tags = el.tags || {};
            let type = 'unknown';
            let score = 0; // Priority Score for Selection

            if (tags.shop === 'mall') {
                type = 'Торговый Центр';
                score = 3;
            } else if (tags.amenity === 'university') {
                type = 'Университет';
                score = 2;
            } else if (tags.station === 'subway' || tags.railway === 'subway_entrance') {
                type = 'Метро';
                score = 1;
            }

            const name = tags.name || tags['name:ru'] || tags['name:en'] || "Без названия";

            candidates.push({ lat, lng: lon, type, name, score });
        });

        // 3. Sort by Importance
        candidates.sort((a, b) => b.score - a.score);

        // 4. Deduplicate & Limit to Top 3
        const finalCandidates = [];

        // Helper distance function (Haversine)
        const getDist = (lat1, lon1, lat2, lon2) => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c; // km
        };

        for (const c of candidates) {
            let isTooClose = false;
            for (const existing of finalCandidates) {
                const d = getDist(c.lat, c.lng, existing.lat, existing.lng);
                if (d < 0.2) { // 200m
                    isTooClose = true;
                    break;
                }
            }

            if (!isTooClose) {
                finalCandidates.push(c);
            }

            if (finalCandidates.length >= 3) break;
        }

        console.log("Auto-Sourcing: Candidates found:", finalCandidates);
        return finalCandidates;
    }
}

// Expose to window
window.GeomarketingProService = GeomarketingProService;
