
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        print("Launching browser...")
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to app...")
        try:
            await page.goto("http://localhost:3000", timeout=60000)
        except Exception as e:
            print(f"Navigation failed: {e}")
            await browser.close()
            return

        # Wait for map
        print("Waiting for map...")
        await expect(page.locator("#map")).to_be_visible(timeout=30000)

        # Click Search Tab
        print("Clicking Search tab...")
        await page.click("#tabAutoSource")

        # Verify content visible
        print("Verifying Search content...")
        await expect(page.locator("#contentAutoSource")).to_be_visible()
        await expect(page.locator("#btnStartAutoSource")).to_be_visible()

        # Start Search
        print("Starting Auto-Source...")
        await page.click("#btnStartAutoSource")

        # Verify Loading State
        print("Verifying Loading state...")
        await expect(page.locator("#autoSourceLoading")).to_be_visible()

        # Verify Progress Bar moves (check width > 10% eventually)
        # Initially 10%
        # After candidates found -> 30%
        print("Waiting for progress...")

        try:
            # Wait for at least finding candidates (30%) or result or failure
            # Giving it 45s as Overpass can be slow
            # We check if progress bar style contains 'width: 30%' or 'width: 100%'
            # or simply wait for the text to change
            await expect(page.locator("#autoSourceStatusText")).not_to_have_text("Сканирование территории...", timeout=45000)
            print("Progress detected!")
        except Exception as e:
            print(f"Progress timeout or error: {e}")

        # Take screenshot
        await page.screenshot(path="verification_autosource.png")
        print("Screenshot saved to verification_autosource.png")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
