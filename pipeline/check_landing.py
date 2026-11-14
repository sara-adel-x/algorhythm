#!/usr/bin/env python3
"""Focused browser probes for the new landing/listening connection, not real iOS QA."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'design' / 'shots'
URL = 'http://127.0.0.1:5173/'

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    errors = []
    findings = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        page = await browser.new_page(viewport={'width': 1440, 'height': 960}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto(URL, wait_until='networkidle')
        await page.screenshot(path=str(OUT / 'landing-desktop.png'))
        findings['initially_silent'] = await page.evaluate('window.__engine && !window.__engine.running && !window.__narrator.isSpeaking')
        await page.keyboard.press('Tab')
        findings['tab_stays_home'] = await page.locator('.landing').count() == 1
        await page.get_by_role('button', name='Screen reader mode', exact=True).click()
        findings['screen_reader_before_entry'] = await page.get_by_role('button', name='Screen reader on', exact=True).get_attribute('aria-pressed') == 'true'
        await page.get_by_role('button', name='Take a guided journey', exact=True).click()
        await page.locator('.stage').wait_for()
        await page.wait_for_timeout(700)
        findings['guided_entry'] = await page.locator('.panel-title').inner_text() == 'Hurricane Irma' and await page.get_by_role('button', name='Pause journey', exact=True).count() == 1
        findings['focus_in_stage'] = await page.evaluate('document.activeElement.classList.contains("stage")')
        await page.get_by_role('button', name='Pause journey', exact=True).focus()
        await page.keyboard.press('Space')
        findings['single_space_activation'] = await page.get_by_role('button', name='Resume journey', exact=True).count() == 1
        await page.get_by_role('button', name='AlgoRythm — return to introduction', exact=True).click()
        findings['home_retains_screen_reader'] = await page.get_by_role('button', name='Screen reader on', exact=True).count() == 1
        await page.get_by_role('button', name='Listen to A forest, changed', exact=True).click()
        await page.locator('.stage').wait_for()
        await page.get_by_role('button', name='Time machine', exact=True).click()
        await page.wait_for_timeout(300)
        findings['real_comparison_frames'] = await page.locator('.stage-img').first.get_attribute('src') == '/scenes/amazon-then/image.webp' and await page.locator('.stage-img-morph').get_attribute('src') == '/scenes/amazon-now/image.webp'
        await page.get_by_role('button', name='AlgoRythm — return to introduction', exact=True).click()
        await page.evaluate('''() => { document.querySelector('.landing').style.height = 'auto'; document.querySelector('.landing').style.overflow = 'visible'; document.body.style.overflow = 'auto'; }''')
        await page.screenshot(path=str(OUT / 'landing-full-desktop.png'), full_page=True)
        mobile = await browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1, reduced_motion='reduce')
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        await mobile.goto(URL, wait_until='networkidle')
        findings['mobile_no_horizontal_overflow'] = await mobile.evaluate('document.querySelector(".landing").scrollWidth <= window.innerWidth')
        await mobile.screenshot(path=str(OUT / 'landing-mobile.png'))
        await mobile.evaluate('''() => { document.querySelector('.landing').style.height = 'auto'; document.querySelector('.landing').style.overflow = 'visible'; document.body.style.overflow = 'auto'; }''')
        await mobile.screenshot(path=str(OUT / 'landing-full-mobile.png'), full_page=True)
        await browser.close()
    findings['browser_errors'] = errors
    (OUT / 'landing-checks.json').write_text(json.dumps(findings, indent=2) + '\n')
    print(json.dumps(findings, indent=2))
    assert not errors and all(v for k, v in findings.items() if k != 'browser_errors'), 'A focused landing regression probe failed'

if __name__ == '__main__':
    asyncio.run(main())
