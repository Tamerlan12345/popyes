from playwright.sync_api import sync_playwright, expect
import time

def verify_strict_mode_ui(page):
    # 1. Navigate to the map
    page.goto("http://localhost:8080")

    # 2. Wait for map to load (leaflet map container)
    page.wait_for_selector("#map")

    # 3. Click "Start Analysis" (Audit mode)
    # The button ID is btnToggleAudit. Text "📍 Начать анализ" or "Smart Location" tab?
    # Default tab is "Earthquakes". We need to switch tab first.

    # Switch tab
    page.click("#tabAudit")
    time.sleep(0.5)

    # Enable Audit Mode
    page.click("#btnToggleAudit")
    time.sleep(0.5)

    # 4. Click on the map to open popup
    # Use mouse click at center of map
    map_el = page.locator("#map")
    box = map_el.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    # 5. Wait for popup
    page.wait_for_selector(".leaflet-popup-content")

    # 6. Check for "Strict Mode" checkbox
    checkbox = page.locator("#strictAuditCheckbox")
    expect(checkbox).to_be_visible()

    label = page.locator("label[for='strictAuditCheckbox']")
    expect(label).to_contain_text("Строгий режим")

    # 7. Take screenshot
    page.screenshot(path="verification.png")
    print("Screenshot saved to verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_strict_mode_ui(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification_error.png")
        finally:
            browser.close()
