import time
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to http://localhost:3000...")
        page.goto("http://localhost:3000")

        # Wait for map to load
        try:
            page.wait_for_selector("#map", timeout=10000)
        except:
            print("Map selector not found.")

        # Click on Search Tab
        print("Clicking '🔍 Поиск' tab...")
        try:
            page.click("#tabSearch", timeout=5000)
        except:
             print("Tab Search not found or clickable.")
             page.screenshot(path="verification/error_tab.png")
             return

        # Move map to Almaty Center
        print("Moving map to Almaty Center...")
        # Check if map variable is available
        page.evaluate("if(window.map) { map.setView([43.238949, 76.889709], 14); } else { console.log('Map not found'); }")
        time.sleep(2)

        # Click Find Button
        print("Clicking Find Button...")
        try:
            page.click("#btnFindLocation", timeout=5000)
        except:
            print("Find Button not found.")
            page.screenshot(path="verification/error_btn.png")
            return

        # Wait for results
        print("Waiting for results...")
        try:
            page.wait_for_selector("#searchResult", state="visible", timeout=60000)
            print("Results appeared. Taking screenshot...")
            time.sleep(1) # Wait for animation/render

            # Take screenshot of the sidebar
            page.locator("aside#panel").screenshot(path="verification/search_result.png")
            print("Screenshot saved to verification/search_result.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_timeout.png")

        browser.close()

if __name__ == "__main__":
    run_test()
