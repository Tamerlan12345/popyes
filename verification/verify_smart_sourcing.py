import time
import requests
import subprocess
import os
import signal
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to http://localhost:3000...")
        try:
            page.goto("http://localhost:3000")
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # Wait for map to load
        page.wait_for_selector("#map")

        # Click on Search Tab
        print("Clicking '🔍 Поиск' tab...")
        page.click("#tabSearch")

        # Verify Search Content is visible
        if page.is_visible("#contentSearch"):
            print("PASS: Search content is visible.")
        else:
            print("FAIL: Search content is hidden.")

        # Test Geo-Fence (Move to London)
        print("Moving map to London...")
        page.evaluate("map.setView([51.505, -0.09], 13)")
        time.sleep(1)

        # Click Find Button and handle alert
        print("Clicking Find Button (expecting alert)...")

        alert_message = None
        def handle_dialog(dialog):
            nonlocal alert_message
            alert_message = dialog.message
            print(f"Alert received: {alert_message}")
            dialog.accept()

        page.on("dialog", handle_dialog)
        page.click("#btnFindLocation")

        if alert_message and "Алматы" in alert_message:
             print("PASS: Geo-Fence Alert triggered correctly.")
        else:
             print(f"FAIL: Geo-Fence Alert not triggered or message wrong: {alert_message}")

        # Test Almaty Search (Move to Almaty Center)
        print("Moving map to Almaty Center...")
        page.evaluate("map.setView([43.238949, 76.889709], 14)")
        time.sleep(2) # Allow tiles/logic to settle

        # Click Find Button
        print("Clicking Find Button (expecting search start)...")

        # Reset alert handler to catch unexpected errors
        page.remove_listener("dialog", handle_dialog)

        # We need a new handler because 'handle_dialog' captures 'alert_message' from outer scope which we don't need anymore
        # but actually we can reuse a simple print lambda
        def log_alert(d):
            print(f"Unexpected alert during search: {d.message}")
            d.accept()

        page.on("dialog", log_alert)

        page.click("#btnFindLocation")

        # Check for loading state
        # Wait a bit for UI update
        time.sleep(0.5)
        if page.is_visible("#searchLoading"):
            print("PASS: Loading indicator visible.")
        else:
            # Maybe it was too fast? Or failed immediately.
            if page.is_visible("#searchResult"):
                 print("PASS: Results appeared immediately (Mocked?).")
            else:
                 print("FAIL: Loading indicator not visible.")

        # Wait for results (long timeout for real search)
        print("Waiting for results (up to 90s)...")
        try:
            # Wait for either result or intro (if failed and reset)
            # But mostly we wait for result
            page.wait_for_selector("#searchResult", state="visible", timeout=90000)

            print("PASS: Search Results appeared.")

            # Check for key elements
            content = page.inner_text("#searchResult")
            if "Совет Директоров" in content and "Вердикт" in content:
                print("PASS: Result content contains required sections.")
            else:
                print("FAIL: Result content missing sections.")
                print(f"Content found: {content[:200]}...")

        except Exception as e:
            print(f"FAIL: Search timed out or error: {e}")
            # Check if loading is still there
            if page.is_visible("#searchLoading"):
                print("Still loading...")

            # Check for any error text
            if page.is_visible("#searchIntro") and not page.is_hidden("#searchIntro"):
                 print("Search Intro is visible again (maybe search failed/reset).")

        browser.close()

if __name__ == "__main__":
    run_test()
