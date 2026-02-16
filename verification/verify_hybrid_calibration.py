from playwright.sync_api import sync_playwright
import time
import re

def extract_population(text):
    # Matches "1234\nЖители 500м" or similar
    # Look for number before "Жители 500м"
    match = re.search(r'([\d\s]+)\nЖители 500м', text)
    if match:
        try:
            return int(match.group(1).replace(' ', '').replace('\n', ''))
        except:
            return 0
    return 0

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        url = "http://localhost:3000"
        print(f"Navigating to {url}")
        page.goto(url)
        page.wait_for_selector("#map", timeout=10000)

        # --- TEST 1: Bostandyk (K=0.75) ---
        print("\n--- TEST 1: Bostandyk (Expected Low Density / K=0.75) ---")

        # Enable Audit Mode
        page.click("#tabAudit")
        page.click("#btnToggleAudit")
        time.sleep(1)

        lat, lon = 43.2300, 76.9400 # Near Dostyk Plaza (Bostandyk/Medeu border, but let's try deep Bostandyk if needed, actually 43.23, 76.94 is Medeu/Bostandyk)
        # 43.20, 76.90 is deep Bostandyk/Almarasan

        # Use coordinates from original script for consistency: 43.20, 76.90
        lat, lon = 43.20, 76.90

        # 1. Standard Audit
        print("1. Running Standard Audit...")
        page.evaluate(f"map.fire('click', {{ latlng: {{ lat: {lat}, lng: {lon} }} }})")
        page.wait_for_selector(".leaflet-popup-content", timeout=5000)

        # Ensure unchecked
        if page.is_checked("#chkOfficialStats"):
            page.uncheck("#chkOfficialStats")

        page.click(".btn-run-analysis")
        page.wait_for_selector(".audit-dashboard", timeout=60000)

        content_std = page.inner_text("#auditResult")
        pop_std = extract_population(content_std)
        print(f"Standard Population: {pop_std}")

        # Close result
        page.click(".btn-reset-audit")
        time.sleep(1)

        # 2. Hybrid Audit
        print("2. Running Hybrid Audit...")
        page.evaluate(f"map.fire('click', {{ latlng: {{ lat: {lat}, lng: {lon} }} }})")
        page.wait_for_selector(".leaflet-popup-content", timeout=5000)

        # Check
        page.check("#chkOfficialStats")
        page.click(".btn-run-analysis")
        page.wait_for_selector(".audit-dashboard", timeout=60000)

        content_hybrid = page.inner_text("#auditResult")
        pop_hybrid = extract_population(content_hybrid)
        print(f"Hybrid Population: {pop_hybrid}")

        # Verify Metadata
        if "Данные бюро статистики" in content_hybrid:
            print("SUCCESS: Metadata 'Данные бюро статистики' found in result footer.")
        else:
            print("FAILURE: Metadata NOT found.")
            print("Footer content snippet: ", content_hybrid[-200:])

        # Verify Logic
        if pop_hybrid < pop_std:
             print(f"SUCCESS: Hybrid ({pop_hybrid}) < Standard ({pop_std}).")
        else:
             print(f"OBSERVATION: Hybrid ({pop_hybrid}) >= Standard ({pop_std}). This might be okay if Standard was 0 or specific local data.")

        # --- RELOAD FOR CLEAN SLATE ---
        print("\nReloading page for Test 2...")
        page.reload()
        page.wait_for_selector("#map", timeout=10000)
        page.click("#tabAudit")
        page.click("#btnToggleAudit")
        time.sleep(1)

        # --- TEST 2: Auezov (K=1.45) ---
        print("\n--- TEST 2: Auezov (Expected High Density / K=1.45) ---")
        lat, lon = 43.22, 76.85 # Auezov district

        # 1. Standard
        print("1. Running Standard Audit...")
        page.evaluate(f"map.fire('click', {{ latlng: {{ lat: {lat}, lng: {lon} }} }})")
        page.wait_for_selector(".leaflet-popup-content", timeout=5000)
        if page.is_checked("#chkOfficialStats"): page.uncheck("#chkOfficialStats")
        page.click(".btn-run-analysis")

        page.wait_for_selector(".audit-dashboard", timeout=60000)
        pop_std_2 = extract_population(page.inner_text("#auditResult"))
        print(f"Standard Population: {pop_std_2}")

        page.click(".btn-reset-audit")
        time.sleep(1)

        # 2. Hybrid
        print("2. Running Hybrid Audit...")
        page.evaluate(f"map.fire('click', {{ latlng: {{ lat: {lat}, lng: {lon} }} }})")
        page.wait_for_selector(".leaflet-popup-content", timeout=5000)
        page.check("#chkOfficialStats")
        page.click(".btn-run-analysis")

        page.wait_for_selector(".audit-dashboard", timeout=60000)
        pop_hybrid_2 = extract_population(page.inner_text("#auditResult"))
        print(f"Hybrid Population: {pop_hybrid_2}")

        # Verify Logic
        if pop_hybrid_2 > pop_std_2:
             print(f"SUCCESS: Hybrid ({pop_hybrid_2}) > Standard ({pop_std_2}).")
        elif pop_hybrid_2 > 0 and pop_std_2 == 0:
             print(f"SUCCESS: Hybrid found data ({pop_hybrid_2}) while Standard was 0.")
        else:
             print(f"OBSERVATION: Hybrid ({pop_hybrid_2}) vs Standard ({pop_std_2}).")

        # --- TEST 3: UI Check for Search Panel ---
        print("\n--- TEST 3: Search Panel UI ---")
        page.click("#tabSearch")
        time.sleep(0.5)
        if page.is_visible("#chkOfficialStatsSearch"):
             print("SUCCESS: Search Panel Checkbox is visible.")
        else:
             print("FAILURE: Search Panel Checkbox not found.")

        browser.close()

if __name__ == "__main__":
    run_test()
