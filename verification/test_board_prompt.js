const fs = require('fs');
const path = require('path');

// Read the service file
const servicePath = path.join(__dirname, '../GeomarketingProService.js');
let serviceContent = fs.readFileSync(servicePath, 'utf8');

// Mock HexagonDataService to avoid dependency issues if it's in the same file
// (It is in the same file, so we are good)

// Remove the window assignment
serviceContent = serviceContent.replace('window.GeomarketingProService = GeomarketingProService;', 'module.exports = GeomarketingProService;');

// We need to execute this content to get the class.
// Since it's not a module, we can use eval or write to a temp file.
// Let's write to a temp file.
const tempPath = path.join(__dirname, 'temp_service.js');
fs.writeFileSync(tempPath, serviceContent);

const GeomarketingProService = require(tempPath);

async function runTests() {
    console.log("Starting Verification for Board Meeting Prompt...\n");

    // Test Case 1: Critical Reject (Water)
    console.log("--- Test Case 1: Lake Sairan (Water) ---");
    const waterData = {
        lat: 43.24403,
        lng: 76.86484,
        density: 10,
        estimatedPopulation: 500,
        generators: { totalScore: 0, description: "None" },
        competitorTypes: "",
        osmData: {
            pointFeatures: ["Lake Sairan (water)"],
            barriers: [],
            physicalConstraints: ["Lake Sairan (water)"],
            negatives: [],
            apartments: { count: 0 },
            offices: 0,
            anchors: []
        }
    };

    const promptWater = GeomarketingProService.generateBoardMeetingPrompt(waterData);

    if (promptWater.includes("Если локация находится в воде") && promptWater.includes("Lake Sairan (water)")) {
        console.log("✅ Prompt includes critical filter instructions and data.");
    } else {
        console.error("❌ Prompt missing critical filter info.");
    }

    // Test Case 2: Critical Reject (Highway)
    console.log("\n--- Test Case 2: Highway (BAKAD) ---");
    const highwayData = {
        lat: 43.2384,
        lng: 76.9658,
        density: 5,
        estimatedPopulation: 100,
        generators: { totalScore: 0, description: "None" },
        competitorTypes: "",
        osmData: {
            pointFeatures: ["Big Almaty Ring (motorway)"],
            barriers: [],
            physicalConstraints: [],
            negatives: [],
            apartments: { count: 0 },
            offices: 0,
            anchors: []
        }
    };

    const promptHighway = GeomarketingProService.generateBoardMeetingPrompt(highwayData);
    if (promptHighway.includes("motorway/trunk") && promptHighway.includes("Big Almaty Ring (motorway)")) {
        console.log("✅ Prompt includes highway filter instructions and data.");
    } else {
        console.error("❌ Prompt missing highway filter info.");
    }

    // Test Case 3: Good Location (Center)
    console.log("\n--- Test Case 3: Center (Panfilova) ---");
    const centerData = {
        lat: 43.256,
        lng: 76.928,
        density: 150,
        estimatedPopulation: 12000,
        generators: { totalScore: 85, description: "Universities, Malls" },
        competitorTypes: "Burger King, KFC",
        osmData: {
            pointFeatures: [],
            barriers: [],
            physicalConstraints: [],
            negatives: [],
            apartments: { count: 50 },
            offices: 20,
            anchors: ["KBTU", "TsUM"]
        }
    };

    const promptCenter = GeomarketingProService.generateBoardMeetingPrompt(centerData);

    // Check for Roles
    const rolesToCheck = ["DEVELOPMENT MANAGER", "COO", "CFO", "CEO"];
    const allRolesPresent = rolesToCheck.every(role => promptCenter.includes(role));

    if (allRolesPresent) {
        console.log("✅ All Board Roles present in prompt.");
    } else {
        console.error("❌ Missing some board roles.");
    }

    if (promptCenter.includes("Score (0-100)") && promptCenter.includes("НИКОГДА не больше 100")) {
        console.log("✅ Scoring limit instruction present.");
    } else {
         console.error("❌ Missing scoring limit instruction. Found:\n" + promptCenter.substring(promptCenter.indexOf("ШАГ 4"), promptCenter.indexOf("OUTPUT FORMAT")));
    }

    // Cleanup
    fs.unlinkSync(tempPath);
    console.log("\n✅ Verification Complete.");
}

runTests();
