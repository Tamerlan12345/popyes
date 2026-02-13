import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Assume server is running at http://localhost:3000
        url = "http://localhost:3000"
        print(f"Navigating to {url}...")
        try:
            page.goto(url)
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        print("Page loaded.")

        # Move map to Almaty
        print("Moving map to Almaty...")
        page.evaluate("if(window.map) map.setView([43.238949, 76.889709], 13)")
        time.sleep(2)

        # 1. Click Search Tab
        if page.is_visible("#tabSearch"):
            page.click("#tabSearch")
            print("Switched to Search Tab.")
        else:
            print("Error: Search tab button not found.")
            exit(1)

        # 2. Check UI Elements
        if not page.is_visible("#searchRadiusInput"):
            print("Error: Slider not found")
            exit(1)
        if not page.is_visible("#btnScanArea"):
            print("Error: Scan button not found")
            exit(1)

        print("Search UI elements visible.")

        # 3. Trigger Scan
        print("Clicking Scan Area button...")

        # Handle alerts (e.g., if outside Almaty or API error)
        def handle_dialog(dialog):
            print(f"Alert displayed: {dialog.message}")
            dialog.accept()

        page.on("dialog", handle_dialog)

        page.click("#btnScanArea")

        # 4. Wait for Loading
        try:
            page.wait_for_selector("#searchLoading", state="visible", timeout=5000)
            print("Loading indicator appeared.")
        except:
            print("Warning: Loading indicator did not appear (or too fast).")

        # 5. Wait for Result
        print("Waiting for results (timeout 60s)...")
        try:
            # Check for success card OR hard block
            # Success: .audit-score-card
            # Hard Block: .audit-hard-block

            element = page.wait_for_selector("#searchResult > div", state="visible", timeout=60000)

            if element:
                html_class = element.get_attribute("class")
                print(f"Result container populated with class: {html_class}")

                content = element.inner_text()
                print("Result Content Summary:")
                print(content[:200] + "...")

                if "Score:" in content or "/100" in content:
                    print("SUCCESS: Score found in result.")
                elif "ЛОКАЦИЯ ОТКЛОНЕНА" in content:
                    print("SUCCESS: Hard block displayed.")
                else:
                    print("Result displayed but format unknown.")

                print("Taking screenshot...")
                page.screenshot(path="verification/search_result.png")

        except Exception as e:
            print(f"Timeout or error waiting for result: {e}")

        browser.close()

if __name__ == "__main__":
    run()
