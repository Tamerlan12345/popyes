
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

    static async runBoardAudit(lat, lng) {
        console.log("Starting Board of Directors Audit for:", lat, lng);

        // 1. Gather Data
        const data = await this.gatherData(lat, lng);

        // 2. Generate Board Meeting Prompt
        const systemPrompt = this.generateBoardMeetingPrompt(data);

        // 3. Ask AI
        const aiResult = await this.askGeminiPro(systemPrompt, data);

        return {
            ...aiResult,
            rawData: data
        };
    }

    static async runStrictAudit(lat, lng) {
        console.log("Starting STRICT Audit for:", lat, lng);

        // 1. Gather Data (Tier 1, 2, 3)
        const data = await this.gatherData(lat, lng);

        // 2. Generate Prompt (Strict Mode)
        const systemPrompt = this.generateStrictPrompt(data);

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

    static generateBoardMeetingPrompt(data) {
        const pointFeatures = data.osmData.pointFeatures || [];
        const barriers = data.osmData.barriers || [];
        const physical = data.osmData.physicalConstraints || [];
        const negatives = data.osmData.negatives || [];

        const pointInfo = pointFeatures.length > 0 ? pointFeatures.join(", ") : "Чисто (нет явных преград в точке)";
        const barrierInfo = barriers.length > 0 ? barriers.join(", ") : "Нет барьеров в радиусе 300м";
        const constraints = [...physical, ...negatives];
        const constraintInfo = constraints.length > 0 ? constraints.join(", ") : "Нет критических ограничений";

        const existingPopeyes = data.osmData.existingPopeyesPoints && data.osmData.existingPopeyesPoints.length > 0
             ? data.osmData.existingPopeyesPoints.join(", ")
             : "Нет существующих точек Popeyes";

        return `
CONTEXT: Ты — эмулятор Совета Директоров (Board of Directors) международной QSR сети (Popeyes).
Твоя задача — провести мульти-ролевой аудит локации {${data.lat}, ${data.lng}} и вынести коллективное решение.

INPUT DATA:
1. Точка (0-15м): ${pointInfo}
2. Барьеры (300м): ${barrierInfo}
3. Ограничения: ${constraintInfo}
4. Плотность: ${data.density} чел/га.
5. Генераторы трафика (Score: ${data.generators.totalScore}): ${data.generators.description}.
6. Конкуренты: ${data.competitorTypes}.
7. Существующие точки Popeyes: ${existingPopeyes}

PROTOCOL:

ШАГ 0: CRITICAL FILTER (Автоматическая система безопасности)
Если локация находится в воде (water/lake/river), лесу (forest), на шоссе (motorway/trunk) или кладбище (cemetery) — НЕМЕДЛЕННО вернуть Score: 0 и Status: "Technical Error / Invalid Location". Без обсуждений.
(Проверь поле "Точка" и "Ограничения").

ШАГ 1: ОТЧЕТ DEVELOPMENT MANAGER (Оценка потенциала)
- Анализ плотности населения. Если < 40 чел/га — это риск (Low Density).
- Анализ генераторов (ВУЗы, Офисы).
- Вердикт по трафику: Low / Medium / High.

ШАГ 2: ОТЧЕТ COO (Операционный директор)
- Каннибализация: Есть ли наши точки ближе 1 км? Если да — это оправдано (кластер) или глупость?
- Барьеры: Есть ли река/забор/ж-д пути между жильем и точкой? Если да — клиенты не дойдут.

ШАГ 3: ОТЧЕТ CFO (Финансовый директор)
- Оцени риск потери инвестиций (Capital Loss Risk): High/Low.
- Обоснование: "Мы заморозим деньги в мертвой зоне" ИЛИ "Риск оправдан высоким потенциалом".
- НЕ считай P&L, оценивай Opportunity Cost.

ШАГ 4: ВЕРДИКТ CEO (Синтез)
- Итоговый Score (0-100). Строгое ограничение: НИКОГДА не больше 100.
- Решение: Approved / Conditional Approval / Reject.
- Взвесь риски CFO и возможности Development Manager.

OUTPUT FORMAT: ВЕРНИ ТОЛЬКО JSON (строго соблюдай структуру):
{
  "terrain_check": "Pass/Fail",
  "board_opinions": {
      "development_manager": {
          "traffic_verdict": "Low/Medium/High",
          "density_analysis": "Комментарий по плотности...",
          "generators_analysis": "Комментарий по генераторам..."
      },
      "coo": {
          "cannibalization_risk": "High/Medium/Low",
          "barriers_analysis": "Комментарий по доступности...",
          "logistics_comment": "Мнение COO..."
      },
      "cfo": {
          "capital_loss_risk": "High/Low",
          "opportunity_cost_analysis": "Мнение CFO..."
      }
  },
  "ceo_verdict": {
      "score": 0-100,
      "decision": "Approved / Conditional Approval / Reject",
      "synthesis": "Финальное решение, объединяющее все мнения..."
  },
  "competitor_analysis": {
    "list": [
      {"name": "Competitor Name", "dist": "120m", "type": "fast_food", "risk": "High"}
    ],
    "summary": "Краткий вывод по конкуренции"
  },
  "risk_factors": ["Риск 1", "Риск 2"],
  "growth_potential": "За счет чего будет рост..."
}
`;
    }

    static generateStrictPrompt(data) {
        const pointFeatures = data.osmData.pointFeatures || [];
        const barriers = data.osmData.barriers || [];
        const physical = data.osmData.physicalConstraints || [];
        const negatives = data.osmData.negatives || [];

        const pointInfo = pointFeatures.length > 0 ? pointFeatures.join(", ") : "Чисто (нет явных преград в точке)";
        const barrierInfo = barriers.length > 0 ? barriers.join(", ") : "Нет барьеров в радиусе 300м";

        return `
Ты — Скептичный Инвестиционный Директор со строгими стандартами безопасности и рентабельности.
Твоя задача: Провести жесткий аудит локации {${data.lat}, ${data.lng}} и найти причины ОТКАЗАТЬ.

ВХОДНЫЕ ДАННЫЕ:
1. ТОЧЕЧНЫЙ АНАЛИЗ (0-10м): ${pointInfo}
2. БАРЬЕРЫ (до 300м): ${barrierInfo}
3. Физические ограничения (100м): ${physical.join(", ") || "Нет"}
4. Негативные факторы: ${negatives.join(", ") || "Нет"}
5. Плотность населения: ${data.density} чел/га.
6. Генераторы трафика: ${data.generators.description}.
7. Конкуренты: ${data.competitorTypes}.

АЛГОРИТМ ПРИНЯТИЯ РЕШЕНИЯ:

ШАГ 1: ПЕРВИЧНЫЙ ФИЛЬТР (SANITY CHECK) - CRITICAL REJECT
Если в "ТОЧЕЧНОМ АНАЛИЗЕ" указано: вода (water), болото (wetland), трасса (motorway/trunk), кладбище (cemetery), промзона (industrial), лес (forest) или ж/д пути (railway) —
НЕМЕДЛЕННО ставь Score 0 и Verdict "CRITICAL REJECT".
Не смотри на окружающие дома. Точка в воде или на трассе = 0 баллов.

ШАГ 2: ЛОГИКА ПЕШЕХОДА И БАРЬЕРЫ
Оцени доступность. Если люди живут в 300м, но между ними и точкой есть БАРЬЕРЫ (река, ж/д, забор), эти клиенты не придут. Снижай Score.

ШАГ 3: ШКАЛА ОЦЕНКИ (STRICT SCORING)
- 90-100: Идеально (Центр, Пешеходная зона, 1 этаж, нет барьеров).
- 70-89: Хорошо, но есть нюансы.
- 40-69: Средне, высокий риск.
- 0-39: Непригодно (Парк без инфраструктуры, промзона, трасса, пустырь).

Запрещено ставить 80-100 баллов просто за наличие людей вокруг, если сама точка проблемная.

ВЕРНИ ТОЛЬКО JSON (строго соблюдай структуру):
{
  "terrain_check": "Pass/Fail",
  "strategic_verdict": {
    "status": "APPROVED / REJECT / HIGH RISK",
    "recommendation": "Жесткое обоснование..."
  },
  "traffic_score_audit": {
    "score": 0-100,
    "comment": "Оценка с учетом барьеров..."
  },
  "competitor_analysis": {
    "list": [],
    "cannibalization_risk": "High/Medium/Low",
    "summary": "Вывод по конкуренции..."
  },
  "risk_factors": ["Риск 1", "Риск 2"],
  "growth_potential": "Только если есть реальный потенциал...",
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
