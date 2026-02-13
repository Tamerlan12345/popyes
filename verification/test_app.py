from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Subscribe to console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        # 1. Load the page
        print("Navigating to http://localhost:3000")
        try:
            page.goto("http://localhost:3000")
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # 2. Wait for map
        print("Waiting for map...")
        try:
            page.wait_for_selector(".leaflet-container", timeout=10000)
            print("Map loaded.")
        except:
            print("Map did not load.")
            return

        # 3. Switch to Audit Tab
        print("Clicking 'Smart Location' tab...")
        try:
            page.click("#tabAudit")
            time.sleep(1)
        except:
            print("Could not click Audit Tab")
            return

        # 4. Enable Audit Mode
        print("Clicking 'Start Analysis' button...")
        try:
            page.click("#btnToggleAudit")
            time.sleep(1)
        except:
             print("Could not click Start Analysis button")
             return

        # 5. Click on map
        print("Clicking on map...")
        page.mouse.click(500, 300)
        time.sleep(1)

        # 6. Click "Analyze"
        print("Clicking 'Analyze' in popup...")

        request_captured = False
        def handle_request(request):
            nonlocal request_captured
            if "/api/analyze" in request.url and request.method == "POST":
                print(f"Captured request to: {request.url}")
                request_captured = True

        page.on("request", handle_request)

        try:
            page.click("#btnRunAnalysis")
        except:
            print("Could not find/click Analyze button")

        # Wait longer (10s) to allow gatherData to potentially finish or fail fast
        print("Waiting for network activity (10s)...")
        time.sleep(10)

        if request_captured:
            print("SUCCESS: /api/analyze request was triggered.")
        else:
            print("FAILURE: /api/analyze request was NOT triggered within timeout.")

        page.screenshot(path="verification/verification_console.png")
        print("Screenshot saved to verification/verification_console.png")

        browser.close()

if __name__ == "__main__":
    run()
