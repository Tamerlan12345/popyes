from playwright.sync_api import sync_playwright
import time

def verify_smart_location_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080")

        # Wait for map to load
        page.wait_for_selector("#map")

        # Click on "Smart Location" tab
        page.click("#tabAudit")

        # Click "Start Analysis" button
        page.click("#btnToggleAudit")

        # Click on the map (center)
        # map is at #map. get bounding box
        map_el = page.locator("#map")
        box = map_el.bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)

        # Wait for popup
        page.wait_for_selector(".popup-form")

        # Check for checkbox
        checkbox = page.locator("#chkProfessionalMode")
        if checkbox.is_visible():
            print("Checkbox is visible")
        else:
            print("Checkbox NOT visible")

        # Take screenshot of popup
        page.screenshot(path="verification.png")

        browser.close()

if __name__ == "__main__":
    verify_smart_location_ui()
