
from playwright.sync_api import sync_playwright
import time
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Define mock responses
    mock_osm_response = {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": 43.25,
                "lon": 76.92,
                "tags": { "amenity": "fast_food", "name": "Burger King" }
            },
            {
                "type": "node",
                "id": 2,
                "lat": 43.251,
                "lon": 76.921,
                "tags": { "building": "apartments", "building:levels": "5" }
            }
        ]
    }

    mock_gemini_response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps({
                                "score": 88,
                                "board_discussion": "The Board agrees this is a prime location. CEO loves the visibility. CFO is cautious about rent but approves the ROI. Ops confirms logistics are solid.",
                                "ceo_verdict": "Perfect Brand Fit. High Visibility.",
                                "cfo_verdict": "Cash Cow. High ROI potential.",
                                "ops_verdict": "Standard logistics. Good access.",
                                "final_decision": "APPROVED",
                                "zone": "Gold Zone",
                                "growth_potential": "Increasing due to new metro station.",
                                "risk_factors": ["High Rent", "Competitor Proximity"],
                                "competitor_analysis": {
                                    "list": [{"name": "Burger King", "dist": "100m", "type": "Fast Food", "risk": "Medium"}],
                                    "summary": "Moderate competition."
                                },
                                "strategic_verdict": {
                                    "status": "APPROVED",
                                    "recommendation": "Open immediately."
                                },
                                "rawData": {
                                     "density": 100,
                                     "estimatedPopulation": 5000,
                                     "competitorCount": 1,
                                     "competitorDensity": 0.5,
                                     "generators": { "totalScore": 50 }
                                }
                            })
                        }
                    ]
                }
            }
        ]
    }

    # Setup route interception
    def handle_route(route):
        url = route.request.url
        # Simple string matching for mocked endpoints
        if "overpass-api.de" in url:
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(mock_osm_response)
            )
        elif "generativelanguage.googleapis.com" in url:
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(mock_gemini_response)
            )
        else:
            route.continue_()

    page.route("**/*", handle_route)

    # Navigate to app
    page.goto("http://localhost:8080")

    # Set fake API key so check passes
    page.evaluate("window.GEMINI_API_KEY = 'TEST_KEY'")

    # Click Smart Location tab first
    page.click("#tabAudit")

    # Click Pro Mode checkbox (force click if obscured or use standard click if visible)
    page.click("#proModeCheckbox")

    # Click Start Analysis
    page.click("#btnToggleAudit")

    # Click on map (center)
    # The map div might be overlayed, so force click or check visibility
    # page.mouse.click(400, 300) might hit something else if responsive layout.
    # We can try clicking the map element.
    # Or just simulate a map click event via JS if needed, but mouse click is better.

    # Wait for map to be ready
    page.wait_for_selector("#map")

    # Click somewhere in the middle of the viewport
    viewport_size = page.viewport_size
    page.mouse.click(viewport_size['width'] / 2, viewport_size['height'] / 2)

    # Click Analyze in popup
    # Wait for popup
    page.wait_for_selector(".leaflet-popup-content", state="visible")

    # Click "Analyze"
    page.click("#btnRunAnalysis")

    # Wait for result container to appear and have content
    # The result container is hidden initially.
    page.wait_for_selector("#auditResult", state="visible")

    # Wait for the score card to appear inside
    page.wait_for_selector(".audit-score-card")

    # Take screenshot
    page.screenshot(path="verification/verification.png")

    print("Verification screenshot taken: verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
