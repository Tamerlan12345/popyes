import time
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

            # Click Smart Location tab first
            tab = page.query_selector("#tabAudit")
            if tab:
                print("Clicking 'Smart Location' tab...")
                tab.click()
                time.sleep(1) # Wait for tab switch
            else:
                print("❌ 'Smart Location' tab not found!")
                return

            # Check 1: #proModeCheckbox should be gone
            # It's inside #auditIntro which is now visible
            if page.query_selector("#proModeCheckbox"):
                print("❌ #proModeCheckbox FOUND! It should be removed.")
            else:
                print("✅ #proModeCheckbox NOT found (Correct).")

            # Click "Start Analysis" button
            btn = page.query_selector("#btnToggleAudit")
            if btn:
                # Wait for visibility
                if btn.is_visible():
                    print("Clicking 'Start Analysis' button...")
                    btn.click()
                else:
                    print("❌ 'Start Analysis' button is NOT visible!")
                    return
            else:
                print("❌ 'Start Analysis' button NOT found!")
                return

            time.sleep(1)

            # Click on the map to trigger popup
            # Assuming map takes most of the screen
            print("Clicking on map...")
            page.mouse.click(600, 400)

            time.sleep(2) # Wait for popup

            # Check 2: Popup should appear
            popup_content = page.query_selector(".leaflet-popup-content")
            if popup_content:
                print("✅ Popup appeared.")

                # Check 3: #strictAuditCheckbox inside popup should be gone
                if page.query_selector("#strictAuditCheckbox"):
                    print("❌ #strictAuditCheckbox FOUND in popup! It should be removed.")
                else:
                    print("✅ #strictAuditCheckbox NOT found in popup (Correct).")
            else:
                print("❌ Popup did NOT appear.")

            # Take screenshot
            page.screenshot(path="verification.png")
            print("Screenshot saved to verification.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
