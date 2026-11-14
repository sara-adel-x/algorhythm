#!/usr/bin/env python3
"""Render the app states to PNGs for review."""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
OUT = Path("design/shots")
OUT.mkdir(parents=True, exist_ok=True)


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        errors: list[str] = []
        ctx = await browser.new_context(viewport={"width": 1440, "height": 940}, device_scale_factor=1)
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(900)
        await page.screenshot(path=str(OUT / "app-gate-desktop.png"))

        await page.get_by_role("button", name="Begin listening").click()
        await page.wait_for_timeout(2600)
        await page.screenshot(path=str(OUT / "app-explore-desktop.png"))

        await page.keyboard.press("h")
        await page.wait_for_timeout(1400)
        await page.screenshot(path=str(OUT / "app-hotspot.png"))

        await page.keyboard.press("?")
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(OUT / "app-help.png"))
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)

        await page.get_by_role("button", name="Journey", exact=True).click()
        await page.wait_for_timeout(9000)
        await page.screenshot(path=str(OUT / "app-journey.png"))

        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        await page.get_by_role("button", name="Blindfold", exact=True).click()
        await page.wait_for_timeout(1200)
        await page.screenshot(path=str(OUT / "app-blind.png"))
        await page.keyboard.press("Escape")

        # time machine on the amazon scene
        await page.get_by_role("button", name="Mato Grosso").click()
        await page.wait_for_timeout(1800)
        await page.screenshot(path=str(OUT / "app-amazon.png"))
        await page.get_by_role("button", name="Time machine", exact=True).click()
        await page.wait_for_timeout(12000)
        await page.screenshot(path=str(OUT / "app-time.png"))

        await page.get_by_role("button", name="How it sounds").click()
        await page.wait_for_timeout(700)
        await page.screenshot(path=str(OUT / "app-how.png"))
        await page.keyboard.press("Escape")
        await ctx.close()

        # mobile
        ctx = await browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(700)
        await page.screenshot(path=str(OUT / "app-gate-mobile.png"))
        await page.get_by_role("button", name="Begin listening").click()
        await page.wait_for_timeout(2200)
        await page.screenshot(path=str(OUT / "app-explore-mobile.png"))
        await ctx.close()

        await browser.close()
        for e in errors:
            print("[err]", e)
        print(f"done, {len(errors)} errors")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
