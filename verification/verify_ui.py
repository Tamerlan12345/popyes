from playwright.sync_api import sync_playwright

def verify_board_audit_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Open the page
            page.goto("http://localhost:8080/index.html")

            # 2. Click on "Smart Location" tab
            page.click("#tabAudit")

            # 3. Wait for the audit content to be visible
            page.wait_for_selector("#contentAudit:not(.hidden)")

            # 4. Check if the "Board of Directors" checkbox exists
            checkbox = page.locator("#boardAuditCheckbox")

            if checkbox.is_visible():
                print("✅ Board Audit Checkbox is visible.")
            else:
                print("❌ Board Audit Checkbox is NOT visible.")

            # 5. Take a screenshot
            page.screenshot(path="verification/ui_verification.png")
            print("📸 Screenshot saved to verification/ui_verification.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_board_audit_ui()
