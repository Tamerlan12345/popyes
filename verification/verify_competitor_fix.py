import time
import sys
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        try:
            print("Navigating to http://localhost:8080/index.html")
            page.goto("http://localhost:8080/index.html")

            # Allow map to initialize
            time.sleep(2)

            # Inject Mock Service
            mock_script = """
            window.GeomarketingProService.runPopeyesAudit = async (lat, lng) => {
                console.log("Mock Service Called");
                return {
                    traffic_score_audit: { score: 85, comment: "Test Comment" },
                    competitor_analysis: {
                        list: [
                            { name: "Comp 1", type: "Burger", risk: "Low", dist: 150 },
                            { name: "Comp 2", risk: "High" },
                            { name: "Comp 3", dist: "500m" }
                        ],
                        summary: "Test Summary"
                    },
                    strategic_verdict: { status: "OK", recommendation: "Go ahead" },
                    risk_factors: [],
                    growth_potential: "None",
                    rawData: {
                        density: 100,
                        estimatedPopulation: 5000,
                        competitorCount: 3,
                        competitorDensity: 0.6,
                        generators: { totalScore: 50 }
                    }
                };
            };
            """
            page.evaluate(mock_script)
            print(" injected mock service.")

            # Click Smart Location tab first
            tab = page.query_selector("#tabAudit")
            if tab:
                print("Clicking 'Smart Location' tab...")
                tab.click()
                time.sleep(1) # Wait for tab switch
            else:
                print("❌ 'Smart Location' tab not found!")
                sys.exit(1)

            # Click "Start Analysis" button
            btn = page.query_selector("#btnToggleAudit")
            if btn and btn.is_visible():
                print("Clicking 'Start Analysis' button...")
                btn.click()
            else:
                print("❌ 'Start Analysis' button NOT visible!")
                sys.exit(1)

            time.sleep(1)

            # Click on the map to trigger popup
            print("Clicking on map...")
            page.mouse.click(600, 400)

            time.sleep(1)

            # Click "Analyze" inside popup
            analyze_btn = page.query_selector("#btnRunAnalysis")
            if analyze_btn:
                print("Clicking 'Analyze' button...")
                analyze_btn.click()
            else:
                print("❌ 'Analyze' button NOT found inside popup!")
                sys.exit(1)

            # Wait for results
            try:
                page.wait_for_selector("#auditResult", state="visible", timeout=5000)
            except:
                print("❌ Audit Result did not appear in time!")
                sys.exit(1)

            time.sleep(1) # Extra wait for rendering

            content = page.text_content("#auditResult")
            html_content = page.inner_html("#auditResult")

            # Verification 1: No undefined
            if "undefined" in content:
                print("❌ FAILED: 'undefined' found in result text.")
                sys.exit(1)
            else:
                print("✅ PASSED: No 'undefined' in result.")

            # Verification 2: Competitors present
            if "Comp 1" in content and "Comp 2" in content and "Comp 3" in content:
                print("✅ PASSED: All mock competitors found.")
            else:
                print("❌ FAILED: Not all competitors found.")
                sys.exit(1)

            # Verification 3: Distance formatting
            # Comp 1 has dist: 150 (number) -> should be "150 м" or similar
            # Note: innerText might normalize spaces.
            if "150" in content:
                print("✅ PASSED: Distance number found.")
                # Ideally check for "150 м" specifically, but let's be lenient on spacing first
            else:
                 print("❌ FAILED: Distance 150 not found.")

            # Verification 4: Data Sources
            if "Kontur Population" in content and "OpenStreetMap" in content:
                print("✅ PASSED: Data source text found.")
            else:
                print("❌ FAILED: Data source text MISSING.")
                sys.exit(1)

            if "kontur.io" in html_content and "openstreetmap.org" in html_content:
                print("✅ PASSED: Data source links found.")
            else:
                print("❌ FAILED: Data source links MISSING.")
                sys.exit(1)

        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
