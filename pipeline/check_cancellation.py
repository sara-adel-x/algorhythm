#!/usr/bin/env python3
"""Regression probes for observed asynchronous startup cancellation defects."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

async def main():
    results = {}
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        page = await browser.new_page(viewport={'width': 1440, 'height': 960})
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto('http://localhost:5173/', wait_until='networkidle')
        await page.evaluate('''() => {
            const engine = window.__engine;
            const original = engine.unlock.bind(engine);
            let calls = 0;
            engine.unlock = async () => {
                calls++;
                if (calls === 2) await new Promise(resolve => window.releaseOldStart = resolve);
                await original();
            };
        }''')
        await page.get_by_role('button', name='Begin listening', exact=True).click()
        await page.locator('.stage').wait_for()
        await page.get_by_role('button', name='AlgoRythm — return to introduction', exact=True).click()
        results['home_immediately_available'] = await page.get_by_role('button', name='Begin listening', exact=True).is_enabled()
        await page.evaluate('window.releaseOldStart()')
        await page.wait_for_timeout(700)
        results['canceled_start_stays_silent'] = await page.evaluate('!window.__engine.running && !window.__narrator.isSpeaking')
        await page.get_by_role('button', name='Screen reader mode', exact=True).click()
        await page.get_by_role('button', name='Begin listening', exact=True).click()
        await page.locator('.stage').wait_for()
        await page.wait_for_timeout(300)
        results['reentry_runs'] = await page.evaluate('window.__engine.running')
        await page.get_by_role('button', name='How it sounds', exact=True).click()
        await page.get_by_role('button', name='Warm a rounded pad', exact=False).click()
        await page.get_by_role('button', name='Back to listening', exact=True).click()
        await page.wait_for_timeout(250)
        results['preview_canceled'] = await page.evaluate('window.__engine.legendTimer === null')
        results['focus_restored_after_dialog'] = await page.evaluate('document.activeElement.textContent === "How it sounds"')
        await page.locator('.stage').focus()
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(700)
        results['escape_stops_music_and_narration'] = await page.evaluate('!window.__engine.running && !window.__narrator.isSpeaking')
        await browser.close()
    results['browser_errors'] = errors
    target = ROOT / 'design' / 'shots' / 'cancellation-checks.json'
    target.write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
    assert not errors and all(v for k, v in results.items() if k != 'browser_errors')

if __name__ == '__main__':
    asyncio.run(main())
