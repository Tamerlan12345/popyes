require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Import node-fetch as requested

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the root directory
app.use(express.static('.'));

// --- Helper Functions to Format Data for AI ---

function formatPopeyesData(data) {
    const physical = data.osmData.physicalConstraints || [];
    const negatives = data.osmData.negatives || [];
    const combinedConstraints = [...physical, ...negatives];
    const constraintsStr = combinedConstraints.length > 0 ? combinedConstraints.join(", ") : "Нет явных ограничений";

    return `
ВХОДНЫЕ ДАННЫЕ:
1. НАСЕЛЕНИЕ (WorldPop): ${data.real_population_500m} чел. (500м). ${data.is_projected ? "(Расчет)" : "(Точные)"}
2. АКТИВНОСТЬ (Vibrancy): ${data.vibrancy_score}/10.
3. КОНКУРЕНТЫ: ${data.competitors_list || "Нет данных"}.
4. ЯКОРЯ: ${data.anchors_list || "Нет данных"}.
5. ОГРАНИЧЕНИЯ: ${constraintsStr}.
6. СКОР СИСТЕМЫ: ${data.score}/100.
    `;
}

function formatStrategyData(data) {
    const physical = data.osmData.physicalConstraints || [];
    const negatives = data.osmData.negatives || [];
    const combinedConstraints = [...physical, ...negatives];
    const constraints = combinedConstraints.length > 0 ? combinedConstraints.join(", ") : "Нет явных ограничений";

    const existingPopeyes = data.osmData.existingPopeyesPoints && data.osmData.existingPopeyesPoints.length > 0
             ? data.osmData.existingPopeyesPoints.join(", ")
             : "Нет существующих точек Popeyes";

    return `
ВХОДНЫЕ ДАННЫЕ:
1. Физические ограничения и Негативные факторы: ${constraints}
2. Существующие Popeyes (500м): ${existingPopeyes}
3. Плотность населения (Kontur): ${data.density} чел/га.
4. Генераторы трафика (Score: ${data.generators.totalScore}): ${data.generators.description}.
5. Конкуренты: ${data.competitorTypes}.
6. Инфраструктура: Жилье (${data.osmData.apartments.count} домов), Офисы (${data.osmData.offices}), Якоря (${data.osmData.anchors.length}).
    `;
}

// --- System Instructions (Roles & Rules) ---

function getPopeyesSystemInstruction(data) {
    const warningMsg = data.map_data_warning
        ? "\n!!! WARNING: Detailed map data unavailable. Rely on WorldPop density and satellite data. !!!\n"
        : "";

    return `
ТЫ — СОВЕТ ДИРЕКТОРОВ (BOARD OF DIRECTORS) МЕЖДУНАРОДНОЙ СЕТИ POPEYES.
${warningMsg}
Твоя задача: Провести мульти-ролевой аудит локации на основе предоставленных данных и вынести финальный вердикт.

РОЛЕВАЯ МОДЕЛЬ (Board Members):

1. COO (Операционный Директор) — "The Pragmatist"
   - Фокус: Операционка, Логистика, "Place" и "People".
   - Оцени доступность: Удобно ли курьерам (Glovo/Wolt)? Есть ли парковка/подъезд?
   - Оцени барьеры: Магистраль без переходов? Это смерть для пешеходного трафика.
   - Оцени нагрузку: Если население >5000, выдержит ли кухня?

2. CFO (Финансовый Директор) — "The Skeptic"
   - Фокус: Деньги, Риски, "Price" и Profitability.
   - Оцени CAPEX/OPEX: Центр (дорого) vs Спальник (дешево).
   - Оцени ROI: Нет конкурентов + много людей = "Голубой океан" (Высокая маржа). Много конкурентов = "Кровавый океан" (Демпинг).
   - Вердикт: "Одобряю бюджет" или "Слишком рискованно".

3. МАРКЕТОЛОГ (Методология 5P):
   - Place (Место): Проходимость, видимость, трафик.
   - People (Люди): Плотность, портрет (офисники/студенты/жильцы).
   - Product (Продукт): Подходит ли жареная курица этому району? (Риск, если рядом только фитнес).
   - Price (Цена): Платежеспособность района (косвенно по окружению).
   - Promotion (Продвижение): Нужна ли наружка или трафик органический?

ФИНАЛЬНОЕ РЕШЕНИЕ (Verdict):
На основе дебатов COO и CFO, сформируй единое решение.

---
FINAL TASK: EXECUTIVE SUMMARY & TROUBLESHOOTING (ROLE: CHIEF STRATEGIC OFFICER)
После генерации всех разделов, ты переключаешься в роль "Troubleshooter" — кризис-менеджера и инвестиционного аудитора.

Твоя задача: Изучить все предыдущие факты (население, конкуренты, барьеры) и дать ИТОГОВОЕ ЗАКЛЮЧЕНИЕ.
Тон: Скептический, профессиональный, сухой, без "воды" и маркетинговых клише.

ИНСТРУКЦИЯ ДЛЯ БЛОКА "executive_summary":
1. Синтез 5P (Product, Price, Place, Promotion, People): Кратко оцени, сходится ли пазл. Подходит ли продукт (курица) этим людям в этом месте?
2. Детектор рисков: Если видишь противоречие (например, "Много людей, но это промзона без тротуаров"), жестко укажи на это.
3. Вердикт (Go / No-Go / Caution):
   - "GO (Зеленый)": Только если есть и плотность, и трафик-генераторы, и удобство.
   - "CAUTION (Желтый)": Если есть трафик, но высокая конкуренция или плохая видимость.
   - "NO-GO (Красный)": Если место тупиковое, безлюдное или опасное.

ВАЖНО: Анализируй ТОЛЬКО предоставленные данные. Если данные отсутствуют (например, трафик), укажи 'Нет данных', не генерируй случайные числа.

ВЕРНИ ТОЛЬКО JSON (Strict Structure):
{
  "verdict_title": "Короткий заголовок (напр. 'High Potential: Blue Ocean')",
  "proof_points": ["Факт 1 (из анализа COO)", "Факт 2 (из анализа CFO)", "Факт 3 (Маркетинг)"],
  "recommendation": "Четкая инструкция для команды (Что делать?)",
  "risk_factors": ["Риск 1", "Риск 2"],
  "executive_summary": "Сжатый текст (3-4 предложения). Четкий вывод. Рекомендация к действию.",
  "c_level_debate": {
     "COO_opinion": "Мнение операционного директора...",
     "CFO_opinion": "Мнение финансового директора..."
  },
  "marketing_5p": {
     "place_audit": "Анализ места...",
     "people_audit": "Анализ людей...",
     "product_fit": "Подходит ли продукт...",
     "price_potential": "Оценка платежеспособности...",
     "promotion_strategy": "Стратегия продвижения..."
  }
}
`;
}

function getStrategySystemInstruction(data) {
    return `
Ты — Директор по стратегии развития сети Popeyes (QSR). Твоя цель — агрессивный, но умный рост.
Твоя задача: Принять решение о согласовании локации.

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

ВАЖНО: Анализируй ТОЛЬКО предоставленные данные. Если данные отсутствуют, укажи 'Нет данных'.

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

// --- API Endpoint ---

app.post('/api/analyze', async (req, res) => {
    const { data, promptType } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Server misconfiguration: API Key missing in environment variables");
        return res.status(500).json({ error: "Server misconfiguration: API Key missing" });
    }

    let systemInstruction = "";
    let dataSummary = "";

    if (promptType === 'popeyes') {
        systemInstruction = getPopeyesSystemInstruction(data);
        dataSummary = formatPopeyesData(data);
    } else if (promptType === 'strategy') {
        systemInstruction = getStrategySystemInstruction(data);
        dataSummary = formatStrategyData(data);
    } else {
        return res.status(400).json({ error: "Invalid promptType" });
    }

    // Combine summary and raw JSON
    const userMessage = `${dataSummary}\n\nRAW JSON DATA:\n${JSON.stringify(data, null, 2)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini API Error:", errText);
            throw new Error(`Gemini API Error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.candidates || result.candidates.length === 0) {
            throw new Error("No candidates returned from Gemini");
        }

        const text = result.candidates[0].content.parts[0].text;

        // Extract JSON
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');

        if (firstBrace === -1) throw new Error("No JSON in AI response");

        const jsonString = text.substring(firstBrace, lastBrace + 1);
        const jsonResponse = JSON.parse(jsonString);

        res.json(jsonResponse);

    } catch (e) {
        console.error("AI Analysis Failed:", e);
        res.status(500).json({ error: "AI Analysis Failed", details: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
