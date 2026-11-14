#!/usr/bin/env python3
"""Render the design directions to PNGs for review."""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "design" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

PAGES = ["a-jukebox.html", "b-observatory.html", "c-garden.html"]
VIEWPORTS = [("desktop", 1440, 900, 1), ("mobile", 430, 932, 2)]


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name in PAGES:
            for label, w, h, dpr in VIEWPORTS:
                ctx = await browser.new_context(
                    viewport={"width": w, "height": h}, device_scale_factor=dpr
                )
                page = await ctx.new_page()
                await page.goto((ROOT / "design" / name).as_uri(), wait_until="load")
                await page.wait_for_timeout(900)
                # full page
                await page.screenshot(
                    path=str(OUT / f"{name.replace('.html', '')}-{label}.png"),
                    full_page=True,
                )
                # first screen only
                await page.screenshot(
                    path=str(OUT / f"{name.replace('.html', '')}-{label}-fold.png")
                )
                print(f"[shot] {name} {label}")
                await ctx.close()
        await browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
