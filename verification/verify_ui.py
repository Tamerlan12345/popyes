import os
from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        # 1. Load Page
        print("Loading page...")
        page.goto("http://localhost:8080")
        page.wait_for_timeout(2000) # Wait for map

        # 2. Click "Smart Location" tab
        print("Clicking Smart Location tab...")
        page.click("#tabAudit")

        # 3. Mock the Pro Service
        print("Injecting mock...")
        mock_script = """
        console.log("Overwriting GeomarketingProService...");
        try {
            window.GeomarketingProService = {
                runAudit: async (lat, lng) => {
                    console.log("Mock runAudit called with", lat, lng);
                    return {
                        terrain_check: "Pass",
                        traffic_score_audit: { score: 85, comment: "High Traffic Mock" },
                        competitor_analysis: { list: [], summary: "Mock Comp" },
                        strategic_verdict: { status: "Go", recommendation: "Mock Rec" },
                        cannibalization_analysis: { status: "Cluster Growth", strategy: "Mock Popeyes Strategy" },
                        risk_factors: [],
                        growth_potential: "Mock Growth",
                        rawData: {
                            density: 100, estimatedPopulation: 5000, competitorCount: 5,
                            competitorDensity: 1, generators: { totalScore: 50 }
                        }
                    };
                }
            };
            // Also try to assign to global scope directly if window reference is not enough
            GeomarketingProService = window.GeomarketingProService;
            console.log("Overwrite complete. Current type:", typeof GeomarketingProService);
        } catch (e) {
            console.error("Failed to overwrite:", e);
        }

        const cb = document.getElementById('proModeCheckbox');
        if(cb) {
            cb.checked = true;
            console.log("Checkbox checked via script");
        } else {
            console.error("Checkbox not found!");
        }
        """
        page.evaluate(mock_script)

        # 4. Enable Audit Mode
        if page.locator("#btnToggleAudit").is_visible():
            print("Enabling Audit Mode...")
            page.click("#btnToggleAudit")

        # 5. Click on Map
        print("Clicking on map...")
        page.mouse.click(400, 300)
        page.wait_for_timeout(1000)

        # 6. Verify Popup
        if page.locator(".popup-form").is_visible():
            print("Popup visible.")
            page.screenshot(path="verification/popup_clean.png")
        else:
            print("Popup NOT visible!")
            page.screenshot(path="verification/popup_error.png")
            browser.close()
            return

        # 7. Click Analyze
        print("Clicking Analyze button...")
        try:
            page.click("#btnRunAnalysis")
            print("Analyze button clicked.")
        except Exception as e:
            print(f"Failed to click Analyze button: {e}")

        # 8. Wait for Result
        print("Waiting for result...")
        try:
            # Check if auditResult is visible and has content
            page.wait_for_selector("#auditResult .audit-score-card", timeout=5000)
            page.screenshot(path="verification/result_rendered.png")
            print("Result screenshot taken.")
        except Exception as e:
            print(f"Result not found! Error: {e}")
            page.screenshot(path="verification/result_error.png")
            # Dump HTML of sidebar for debugging
            sidebar_html = page.locator("#panel").inner_html()
            print("Sidebar HTML content:", sidebar_html[:500]) # Print first 500 chars

        browser.close()

if __name__ == "__main__":
    os.makedirs("verification", exist_ok=True)
    verify_ui()
