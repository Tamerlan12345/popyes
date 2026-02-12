
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
        console.log("Starting Popeyes Audit for:", lat, lng);

        // 1. Gather Data (Tier 1, 2, 3)
        const data = await this.gatherData(lat, lng);

        // 2. Generate Prompt (Popeyes Mode)
        const systemPrompt = this.generatePopeyesPrompt(data);

        // 3. Ask AI
        const aiResult = await this.askGeminiPro(systemPrompt, data);

        return {
            ...aiResult,
            rawData: data
        };
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
        const pointFeatures = data.osmData.pointFeatures || [];
        const barriers = data.osmData.barriers || [];
        const physical = data.osmData.physicalConstraints || [];
        const negatives = data.osmData.negatives || [];
        const anchors = data.osmData.anchors || [];

        const pointInfo = pointFeatures.length > 0 ? pointFeatures.join(", ") : "Чисто (нет явных преград в точке)";
        const barrierInfo = barriers.length > 0 ? barriers.join(", ") : "Нет барьеров в радиусе 300м";

        return `
Ты — Директор по развитию сети Popeyes (Fried Chicken). Твой подход: 'Строгий, но Справедливый'.
Твоя задача: Оценить локацию ИМЕННО для фастфуда, а не кофейни или бутика.

ВХОДНЫЕ ДАННЫЕ:
1. ТОЧЕЧНЫЙ АНАЛИЗ (0-10м): ${pointInfo}
2. БАРЬЕРЫ (до 300м): ${barrierInfo}
3. Физические ограничения (100м): ${physical.join(", ") || "Нет"}
4. Негативные факторы: ${negatives.join(", ") || "Нет"}
5. Плотность населения: ${data.density} чел/га.
6. Генераторы трафика: ${data.generators.description}.
7. Конкуренты: ${data.competitorTypes}.
8. Якоря (ТРЦ/ВУЗы): ${anchors.join(", ") || "Нет"}

КРИТИЧЕСКИЕ ПРАВИЛА:

ТРЦ (Shopping Mall): Если в радиусе 100м есть крупный ТРЦ — игнорируй низкую плотность населения. Люди едут в ТРЦ специально. Это High Potential.

Бизнес-модель: Popeyes — это жареная курица. Нам не нужна 'уютная атмосфера для работы' (как Starbucks). Нам нужен поток и видимость.

Конкуренты: Наличие KFC/Burger King рядом — это ХОРОШО (сформированный спрос), если мы не стоим 'дверь-в-дверь'. Если конкурентов нет вообще — это риск (нет рынка).

Барьеры: Трасса без перехода — смерть для стрит-ритейла, но норма для Drive-Thru. Учитывай это.

АЛГОРИТМ ПРИНЯТИЯ РЕШЕНИЯ:

ШАГ 1: ПЕРВИЧНЫЙ ФИЛЬТР (SANITY CHECK)
Если в "ТОЧЕЧНОМ АНАЛИЗЕ" указано: вода (water), болото (wetland), кладбище (cemetery) —
CRITICAL REJECT (Score 0).

ШАГ 2: ОЦЕНКА ПОТЕНЦИАЛА
- Высокая плотность + Конкуренты = High Potential.
- ТРЦ рядом = High Potential.
- Пустырь без генераторов = Reject.

ВЕРНИ ТОЛЬКО JSON (строго соблюдай структуру):
{
  "terrain_check": "Pass/Fail",
  "strategic_verdict": {
    "status": "APPROVED / REJECT / HIGH RISK",
    "recommendation": "Опиши вывод 2-3 полными предложениями. Почему да или нет?"
  },
  "traffic_score_audit": {
    "score": 0-100,
    "comment": "Оценка трафика..."
  },
  "competitor_analysis": {
    "list": [],
    "cannibalization_risk": "High/Medium/Low",
    "summary": "Вывод по конкуренции..."
  },
  "risk_factors": ["Риск 1", "Риск 2"],
  "growth_potential": "За счет чего будет рост...",
  "cannibalization_analysis": {
      "status": "...",
      "strategy": "..."
  }
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
