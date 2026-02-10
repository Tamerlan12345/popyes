from playwright.sync_api import sync_playwright
import time
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock Overpass API
    overpass_response = {
        "elements": [
            {"lat": 43.25, "lon": 76.90, "tags": {"building": "apartments", "building:levels": "5"}},
            {"lat": 43.2505, "lon": 76.9005, "tags": {"amenity": "school", "name": "School #1"}},
            {"lat": 43.251, "lon": 76.901, "tags": {"amenity": "fast_food", "name": "BurgerKing"}}
        ]
    }

    # Mock Gemini API
    gemini_response = {
        "candidates": [{
            "content": {
                "parts": [{
                    "text": json.dumps({
                        "analyzed_address": "Test Address",
                        "score": 85,
                        "verdict": "Great location!",
                        "location_vibe": "Busy student area",
                        "audience": {"who": "Students", "needs": "Cheap food", "peak_hours": "Lunch"},
                        "analysis": {"traffic_drivers": "School", "barriers": "None", "competition_level": "Medium"},
                        "marketing_advice": "Offer student discounts"
                    })
                }]
            }
        }]
    }

    # Mock Nominatim
    nominatim_response = {"display_name": "Test Address, Almaty"}

    def handle_route(route):
        url = route.request.url
        if "overpass-api.de" in url:
            print(f"Intercepted Overpass: {url}")
            route.fulfill(status=200, body=json.dumps(overpass_response))
        elif "generativelanguage.googleapis.com" in url:
            print(f"Intercepted Gemini: {url}")
            route.fulfill(status=200, body=json.dumps(gemini_response))
        elif "nominatim.openstreetmap.org" in url:
            print(f"Intercepted Nominatim: {url}")
            route.fulfill(status=200, body=json.dumps(nominatim_response))
        else:
            route.continue_()

    page.route("**/*", handle_route)
    page.on("console", lambda msg: print(f"JS Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"JS Error: {err}"))

    # 1. Open App
    page.goto("http://localhost:8080")

    # 2. Switch to "Smart Location" tab
    page.click("#tabAudit")
    time.sleep(1)

    # 3. Start Analysis Mode
    page.click("#btnToggleAudit")
    time.sleep(1) # wait for mode to activate

    # 4. Click on Map (somewhere in center)
    # Map container size might vary, let's click center of viewport
    page.mouse.click(600, 400)
    time.sleep(1)

    # 5. Check Popup Form
    # Check if inputs exist
    assert page.is_visible("#locationType"), "Location Type select missing"
    assert page.is_visible("#trafficLevel"), "Traffic input missing"

    # Fill form
    page.select_option("#locationType", "Центр города")
    page.fill("#trafficLevel", "50")

    # Take screenshot of the popup form
    page.screenshot(path="verification/popup_form.png")
    print("Popup form screenshot saved.")

    # 6. Click Analyze
    # Check if button is visible inside popup
    assert page.is_visible(".popup-btn"), "Analyze button missing"
    page.click(".popup-btn")

    # Wait for result
    try:
        page.wait_for_selector("#auditResult:not(.hidden)", timeout=15000)
    except:
        page.screenshot(path="verification/timeout_debug.png")
        print("Timeout waiting for results. Check screenshot.")
        raise

    # 7. Check Result Content
    # Check for Raw Data section
    assert page.is_visible(".raw-data-container"), "Raw Data container missing"

    # Check specifically for population (calc: 1 building * 5 floors * 4 = 20)
    # Raw Data uses `~${summary.population}` -> "~20"
    content = page.content()
    if "~20" not in content and "20" not in content:
        print("WARNING: Population estimate 20 not found exactly.")
        print(content[:1000]) # print start of content for debug

    # Take screenshot of result
    page.screenshot(path="verification/verification.png")
    print("Result screenshot saved.")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
