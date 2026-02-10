
const assert = require('assert');

// ---- Helper Functions (Proposed for app.js) ----

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
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

        // Determine coordinates (node vs way/relation)
        let lat = el.lat;
        let lon = el.lon;
        if (!lat && el.center) {
            lat = el.center.lat;
            lon = el.center.lon;
        }

        // If no coords, skip distance checks but might count for general area?
        // Better to skip if we can't place it.
        if (!lat || !lon) return;

        const dist = calculateDistance(centerLat, centerLon, lat, lon);

        // --- 1. Population (Heuristic) ---
        // building = apartments | residential
        if (tags.building === 'apartments' || tags.building === 'residential') {
            summary.apartments.count++;
            let levels = parseInt(tags['building:levels']);
            if (isNaN(levels)) levels = 5; // Default
            summary.apartments.total_levels += levels;

            // Formula: Levels * 4 residents per floor (approx)
            // If it's a house (levels=1 or 2), 4 people is reasonable.
            // If it's an apartment block (5 floors), 20 people per footprint unit?
            // Overpass returns nodes/ways. A way is a footprint. A node is a point.
            // We'll stick to the TZ: "Count buildings * Levels * Coeff".
            summary.population += (levels * 4);

            if (dist <= 300) residentialCount300m++;
        }

        // --- 2. Categorization ---

        // Competitors
        if (['fast_food', 'cafe', 'restaurant', 'pub', 'bar', 'food_court', 'biergarten'].includes(tags.amenity)) {
            const name = tags.name || tags['name:ru'] || tags['name:en'] || 'Unnamed';
            summary.competitors.push(`${name} (${tags.amenity}) - ${Math.round(dist)}m`);
        }

        // Anchors (Traffic Generators)
        let isAnchor = false;
        if (['school', 'university', 'college', 'kindergarten'].includes(tags.amenity)) {
            summary.schools++; // broad category
            isAnchor = true;
        }
        if (tags.amenity === 'university') summary.universities++;

        if (tags.shop === 'mall' || tags.shop === 'supermarket' || tags.shop === 'marketplace') {
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

            // Check Red Flag Distance (100m)
            if (dist <= 100) {
                summary.hasRedFlag = true;
                // Keep the closest reason or just the first found
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

// ---- TESTS ----

async function runTests() {
    console.log("Running Logic Verification...");

    // Scenario 1: Red Flag (Cemetery at 50m)
    const dataRedFlag = {
        elements: [
            { lat: 43.25, lon: 76.90, tags: { landuse: 'cemetery', name: 'Old Cemetery' } },
            { lat: 43.251, lon: 76.901, tags: { building: 'apartments', 'building:levels': '5' } } // Some housing nearby
        ]
    };
    // Center is (43.25, 76.90) -> Distance 0m
    const res1 = parseOverpassData(dataRedFlag, 43.25, 76.90);
    assert.strictEqual(res1.hasRedFlag, true, "Scenario 1: Should have Red Flag");
    assert.ok(res1.redFlagReason.includes('Cemetery'), "Scenario 1: Reason should mention Cemetery");
    console.log("✅ Scenario 1 Passed (Red Flag)");


    // Scenario 2: Empty Field (Low Density)
    const dataEmpty = { elements: [] };
    const res2 = parseOverpassData(dataEmpty, 43.25, 76.90);
    assert.strictEqual(res2.lowDensity, true, "Scenario 2: Should be Low Density");
    assert.strictEqual(res2.population, 0, "Scenario 2: Population should be 0");
    console.log("✅ Scenario 2 Passed (Empty/Low Density)");


    // Scenario 3: High Density (Population Math)
    // 2 buildings:
    // 1. 5 floors at 50m -> 5*4 = 20 pop
    // 2. 10 floors at 200m -> 10*4 = 40 pop
    // Total = 60
    const dataDensity = {
        elements: [
            { lat: 43.2505, lon: 76.90, tags: { building: 'apartments', 'building:levels': '5' } },
            { lat: 43.2520, lon: 76.90, tags: { building: 'residential', 'building:levels': '10' } }
        ]
    };
    // Approx distance check: 0.0005 deg lat is roughly 55m. 0.0020 is ~220m. Both < 300m.
    const res3 = parseOverpassData(dataDensity, 43.25, 76.90);
    assert.strictEqual(res3.population, 60, `Scenario 3: Population should be 60. Got ${res3.population}`);
    assert.strictEqual(res3.lowDensity, false, "Scenario 3: Should NOT be Low Density");
    console.log("✅ Scenario 3 Passed (Population Math)");


    // Scenario 4: Anchors & Competitors
    const dataAnchors = {
        elements: [
            { lat: 43.2505, lon: 76.90, tags: { amenity: 'school', name: 'School #1' } },
            { lat: 43.2510, lon: 76.90, tags: { amenity: 'fast_food', name: 'BurgerKing' } }
        ]
    };
    const res4 = parseOverpassData(dataAnchors, 43.25, 76.90);
    assert.strictEqual(res4.anchors.length, 1, "Scenario 4: Should have 1 anchor");
    assert.strictEqual(res4.competitors.length, 1, "Scenario 4: Should have 1 competitor");
    assert.ok(res4.anchors[0].includes('School #1'), "Scenario 4: Anchor name check");
    console.log("✅ Scenario 4 Passed (Anchors)");


    // Scenario 5: Red Flag outside 100m (but inside 500m) -> Should NOT trigger hard block
    // 0.002 deg lat is approx 220m
    const dataFarRed = {
        elements: [
            { lat: 43.252, lon: 76.90, tags: { landuse: 'industrial' } }
        ]
    };
    const res5 = parseOverpassData(dataFarRed, 43.25, 76.90);
    assert.strictEqual(res5.hasRedFlag, false, "Scenario 5: Far negative should not trigger Red Flag");
    assert.strictEqual(res5.negatives.length, 1, "Scenario 5: Should still list negative in array");
    console.log("✅ Scenario 5 Passed (Far Red Flag ignored)");

    console.log("\nALL TESTS PASSED");
}

runTests().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
