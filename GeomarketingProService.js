
// ---- Hexagon Data Service (Tier 1 Source: Kontur Population Mock) ----
class HexagonDataService {
    static getDensity(lat, lng) {
        // Almaty Center coordinates
        const centerLat = 43.25654;
        const centerLng = 76.92848;

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

    static async runAudit(lat, lng) {
        console.log("Starting Pro Audit for:", lat, lng);

        // 1. Gather Data (Tier 1, 2, 3)
        const data = await this.gatherData(lat, lng);

        // 2. Generate Prompt (New Strategy Director Mode)
        const systemPrompt = this.generateStrategyPrompt(data);

        // 3. Ask AI
        const aiResult = await this.askGeminiPro(systemPrompt, data);

        return {
            ...aiResult,
            rawData: data
        };
    }

    static async runPopeyesAudit(lat, lng) {
        // Redirect to new GeoAudit 2.0 Logic
        return this.runGeoAudit2(lat, lng);
    }

    static async runGeoAudit2(lat, lng) {
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
        } else if (osmData.isPartial) {
             console.warn("OSM Data is partial.");
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
        const systemPrompt = this.generatePopeyesPrompt(data);
        const aiResult = await this.askGeminiPro(systemPrompt, data);

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

    static async gatherData(lat, lng) {
        // Tier 1: Density
        const density = HexagonDataService.getDensity(lat, lng);

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

    static generateStrategyPrompt(data) {
        const physical = data.osmData.physicalConstraints || [];
        const negatives = data.osmData.negatives || [];
        const combinedConstraints = [...physical, ...negatives];

        const constraints = combinedConstraints.length > 0
             ? combinedConstraints.join(", ")
             : "Нет явных ограничений (вода/лес/кладбище)";

        const existingPopeyes = data.osmData.existingPopeyesPoints && data.osmData.existingPopeyesPoints.length > 0
             ? data.osmData.existingPopeyesPoints.join(", ")
             : "Нет существующих точек Popeyes";

        return `
Ты — Директор по стратегии развития сети Popeyes (QSR). Твоя цель — агрессивный, но умный рост.
Твоя задача: Принять решение о согласовании локации {${data.lat}, ${data.lng}}.

ВХОДНЫЕ ДАННЫЕ:
1. Физические ограничения и Негативные факторы: ${constraints}
2. Существующие Popeyes (500м): ${existingPopeyes}
3. Плотность населения (Kontur): ${data.density} чел/га.
4. Генераторы трафика (Score: ${data.generators.totalScore}): ${data.generators.description}.
5. Конкуренты: ${data.competitorTypes}.
6. Инфраструктура: Жилье (${data.osmData.apartments.count} домов), Офисы (${data.osmData.offices}), Якоря (${data.osmData.anchors.length}).

АЛГОРИТМ ПРИНЯТИЯ РЕШЕНИЯ:

ШАГ 1: САНИТАРНАЯ ПРОВЕРКА (Sanity Check)
Проверь "Физические ограничения". Если точка находится в воде (lake, river), на пляже без инфраструктуры, посреди трассы или на кладбище — немедленно ставь VERDICT: REJECT. Никакие соседние здания не имеют значения, если в самой точке нельзя строить.
Верни результат в поле "terrain_check": "Pass" или "Fail".

ШАГ 2: АНАЛИЗ КАННИБАЛИЗАЦИИ (Popeyes Strategy)
Проанализируй список существующих точек Popeyes.
- Если точка Popeyes ближе 500м: Это каннибализация или усиление кластера? Если это фудкорт в ТЦ, а новая точка — стрит-ритейл, это может быть допустимо. Если оба стрит-ритейл — высокий риск.
- Если точек нет — это выход на новый рынок ("Greenfield").

ШАГ 3: ОЦЕНКА ТРАФИКА (Traffic Inference)
Пользователь не ввел данные о трафике. Ты должен вывести оценку (Low/Medium/High) на основе:
- Плотности (Density > 80 = High Potential).
- Наличия ВУЗов/Офисов/ТЦ.
- Метро рядом.
Пример: "Высокая плотность + Метро = High Traffic".

ВЕРНИ ТОЛЬКО JSON (строго соблюдай структуру):
{
  "terrain_check": "Pass/Fail",
  "cannibalization_analysis": {
      "status": "Cannibalization Risk / Cluster Growth / Greenfield",
      "strategy": "Твоя аргументация стратега..."
  },
  "traffic_score_audit": {
    "score": 0-100,
    "comment": "Твоя оценка трафика и генераторов..."
  },
  "competitor_analysis": {
    "list": [
      {"name": "Competitor Name", "dist": "120m", "type": "fast_food", "risk": "High"}
    ],
    "cannibalization_risk": "High/Medium/Low",
    "summary": "Вывод по конкуренции..."
  },
  "strategic_verdict": {
    "status": "High Potential / Risky / No Go",
    "recommendation": "Финальное решение директора..."
  },
  "risk_factors": ["Риск 1", "Риск 2"],
  "growth_potential": "За счет чего будет рост..."
}
`;
    }

    static generatePopeyesPrompt(data) {
        // Prepare constraints string
        const physical = data.osmData.physicalConstraints || [];
        const negatives = data.osmData.negatives || [];
        const combinedConstraints = [...physical, ...negatives];
        const constraintsStr = combinedConstraints.length > 0 ? combinedConstraints.join(", ") : "Нет явных ограничений";

        const warningMsg = data.map_data_warning
            ? "\n!!! WARNING: Detailed map data unavailable. Rely on WorldPop density. !!!\n"
            : "";

        return `
ТЫ — ОПЫТНЫЙ ДЕВЕЛОПЕР МЕЖДУНАРОДНОЙ СЕТИ POPEYES.
${warningMsg}
Твоя задача: Объективно оценить локацию на основе ФАКТОВ.
Ты должен не просто критиковать, а искать ПОТЕНЦИАЛ. Твоя цель — подтвердить, можно ли здесь заработать деньги.

ВХОДНЫЕ ДАННЫЕ:
1. НАСЕЛЕНИЕ (WorldPop/Real Data): ${data.real_population_500m} чел. (В радиусе 500м). ${data.is_projected ? "(Расчетное значение)" : "(Точные данные)"}
2. АКТИВНОСТЬ (Vibrancy Score): ${data.vibrancy_score}/10. (Наличие банкоматов, остановок, соседей).
3. КОНКУРЕНТЫ: ${data.competitors_list || "Нет данных"}.
4. ЯКОРЯ: ${data.anchors_list || "Нет данных"} (Школы, Офисы, ТЦ).
5. ОГРАНИЧЕНИЯ: ${constraintsStr}.
6. МАТЕМАТИЧЕСКИЙ СКОР: ${data.score}/100.

АЛГОРИТМ ПРИНЯТИЯ РЕШЕНИЯ (Proof-of-Success):

ШАГ 1: ОЦЕНКА ЕМКОСТИ РЫНКА
- Если Население > 3000 чел: Это база для Strong Hold.
- Если Население < 1000, НО есть Офисы/ВУЗы: Это Lunch-локация. Потенциал есть.
- Если Население < 1000 и нет якорей: Только тогда пиши Reject.

ШАГ 2: АНАЛИЗ КОНКУРЕНТОВ (Сигнал спроса)
- Если рядом KFC/Burger King: ЭТО ХОРОШО. Значит, трафик уже сформирован. Мы встаем рядом и забираем долю рынка.
- Если конкурентов нет вообще: Это риск "Первопроходца". Нужно проверить, есть ли там люди вообще.

ШАГ 3: ВЕРДИКТ (OUTPUT)
Сформируй ответ в формате JSON.
Поле "verdict_title": Короткий, мощный заголовок (напр. "Высокий потенциал: Битва с KFC" или "Скрытая жемчужина спального района").
Поле "proof_points": 3 конкретных факта, ПОЧЕМУ здесь стоит открыться (напр. "Огромная плотность по WorldPop", "Готовый трафик от остановки").
Поле "recommendation": Четкая инструкция (напр. "Требуется агрессивный маркетинг, чтобы переманить людей из Burger King").
Поле "risk_factors": Список рисков (напр. "Низкий пешеходный трафик", "Мало парковок").

ВЕРНИ ТОЛЬКО JSON (строго соблюдай структуру):
{
  "verdict_title": "...",
  "proof_points": ["Факт 1", "Факт 2", "Факт 3"],
  "recommendation": "...",
  "risk_factors": ["Риск 1", "Риск 2"]
}
`;
    }

    static generateProPrompt(data) {
        return `
Ты — Инвестиционный Аналитик и Эксперт по Геомаркетингу (DataHunters Methodology).
Твоя задача: Оценить качественный потенциал локации для общепита/ритейла в координатах {${data.lat}, ${data.lng}}.

ВХОДНЫЕ ДАННЫЕ:

Плотность населения (Kontur): ${data.density} чел/га.
Оценка населения в радиусе 500м: ~${data.estimatedPopulation} чел.

Конкуренты (Raw List): ${data.competitorTypes}.
(Это список в формате "Название (Тип) - Расстояние").

Генераторы трафика (Score: ${data.generators.totalScore}): ${data.generators.description}.

Соц-дем профиль района (по данным OSM):
- Жилье: ${data.osmData.apartments.count} домов.
- Офисы: ${data.osmData.offices}.
- Якоря: ${data.osmData.anchors.length}.

ЗАДАЧА:

1. Анализ трафика и скоринг: Скорректируй базовый Score (${data.generators.totalScore}) с учетом реальной ситуации (например, если генераторы есть, но они далеко или за рекой — снижай балл). Максимум 100.
2. Анализ конкурентов: Разбери предоставленный список конкурентов. Верни его в структурированном виде (JSON). Оцени риск каннибализации.
3. Стратегический вердикт: Дай развернутую рекомендацию (2-3 предложения). Не просто "Рискованно", а ПОЧЕМУ и ЧТО ДЕЛАТЬ (например, "Нужен агрессивный маркетинг" или "Идеально для формата Coffee-to-go").

ВАЖНО:
- НЕ делай финансовых прогнозов (выручка, окупаемость). Это запрещено.
- Будь критичен. Если плотность ниже 40 чел/га — пиши 'Низкий потенциал'.

ВЕРНИ ТОЛЬКО JSON:
{
  "traffic_score_audit": {
    "score": 85,
    "comment": "Высокий трафик благодаря ВУЗу рядом, но..."
  },
  "competitor_analysis": {
    "list": [
      {"name": "Doner King", "dist": "120m", "type": "fast_food", "risk": "High"},
      {"name": "Coffee Boom", "dist": "300m", "type": "cafe", "risk": "Medium"}
    ],
    "cannibalization_risk": "High/Medium/Low",
    "summary": "Насыщенный рынок..."
  },
  "strategic_verdict": {
    "status": "High Potential / Risky / No Go",
    "recommendation": "Локация подходит для..."
  },
  "risk_factors": ["Отсутствие парковки", "..."],
  "growth_potential": "Рост трафика после..."
}
`;
    }

    static async askGeminiPro(systemPrompt, data) {
        const apiKey = window.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API Key required");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: "Проведи профессиональный аудит локации." }] }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Gemini API Error");

        const result = await response.json();
        const text = result.candidates[0].content.parts[0].text;

        // Extract JSON
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');

        if (firstBrace === -1) throw new Error("No JSON in AI response");

        const jsonString = text.substring(firstBrace, lastBrace + 1);

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("JSON Parse Error:", jsonString);
            throw new Error("AI returned invalid JSON");
        }
    }
}

// Expose to window
window.GeomarketingProService = GeomarketingProService;
