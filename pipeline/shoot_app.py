#!/usr/bin/env python3
"""Render the running app to PNGs, including the gate and the explore state."""
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

        for label, w, h, dpr in (("desktop", 1440, 900, 1), ("mobile", 430, 932, 2)):
            ctx = await browser.new_context(
                viewport={"width": w, "height": h}, device_scale_factor=dpr
            )
            page = await ctx.new_page()
            page.on("console", lambda m: errors.append(f"{label} console.{m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"{label} pageerror: {e}"))

            await page.goto(URL, wait_until="networkidle")
            await page.wait_for_timeout(700)
            await page.screenshot(path=str(OUT / f"app-gate-{label}.png"))

            await page.get_by_role("button", name="Begin listening").click()
            await page.wait_for_timeout(1400)
            await page.screenshot(path=str(OUT / f"app-explore-{label}.png"))

            if label == "desktop":
                # move around with the keyboard, then a hotspot jump
                for _ in range(6):
                    await page.keyboard.press("ArrowRight")
                for _ in range(3):
                    await page.keyboard.press("ArrowDown")
                await page.wait_for_timeout(500)
                await page.screenshot(path=str(OUT / "app-explore-moved.png"))

                await page.keyboard.press("h")
                await page.wait_for_timeout(900)
                await page.screenshot(path=str(OUT / "app-hotspot.png"))

                await page.keyboard.press("?")
                await page.wait_for_timeout(300)
                await page.screenshot(path=str(OUT / "app-help.png"))

            await ctx.close()

        await browser.close()
        for e in errors:
            print("[err]", e)
        print(f"done, {len(errors)} errors")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
