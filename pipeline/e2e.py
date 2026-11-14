#!/usr/bin/env python3
"""End-to-end check of AlgoRythm against the live /api/nasa proxy.

Drives the real UI in Chromium: gate -> selector -> all seven datasets ->
Time Machine on sea ice and air temperature -> Blindfold -> dialogs. Fails on
console errors, page errors, failed requests or any request that leaves our
own origin (that would mean a CORS-prone direct call to NASA).

It also writes pipeline/narration_lines.json: every sentence the app would
speak right now, so pipeline/bake_narration.py can record exactly those.

  python3 pipeline/e2e.py [--url http://localhost:5173] [--shots design/shots]
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:5173')
    ap.add_argument('--shots', default=str(ROOT / 'design' / 'shots'))
    ap.add_argument('--quick', action='store_true', help='skip the Time Machine runs')
    args = ap.parse_args()
    shots = Path(args.shots)
    shots.mkdir(parents=True, exist_ok=True)
    origin = urlparse(args.url).netloc

    problems: list[str] = []
    foreign: set[str] = set()
    lines: dict[str, str] = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        page = await ctx.new_page()

        page.on('console', lambda m: m.type == 'error' and problems.append(f'console: {m.text[:300]}'))
        page.on('pageerror', lambda e: problems.append(f'pageerror: {e}'))
        # A narration clip cut short by the next line (fast key presses) aborts its fetch by design.
        page.on('requestfailed', lambda r: (not r.url.startswith('blob:'))
                and not ('/narration/' in r.url and 'ABORTED' in str(r.failure))
                and problems.append(f'failed: {r.url[:160]} {r.failure}'))

        def on_response(r):
            if r.status >= 400 and not r.url.endswith('favicon.ico'):
                problems.append(f'http {r.status}: {r.url[:160]}')

        def on_request(r):
            u = urlparse(r.url)
            if u.scheme in ('http', 'https') and u.netloc != origin:
                foreign.add(u.netloc)

        page.on('response', on_response)
        page.on('request', on_request)

        async def transcript():
            return await page.evaluate("Array.from(document.querySelectorAll('.caption-text')).map(e => e.textContent)")

        # ---- gate ------------------------------------------------------------------------
        await page.goto(args.url, wait_until='networkidle')
        imgs = await page.evaluate("document.querySelectorAll('img').length")
        if imgs:
            problems.append(f'gate shows {imgs} <img> elements; expected none')
        focused = await page.evaluate("document.activeElement?.className")
        print('gate focus:', focused)
        await page.screenshot(path=str(shots / 'live-gate.png'))
        await page.keyboard.press('Enter')
        await page.wait_for_selector('.datasets', timeout=60000)
        await page.wait_for_timeout(600)
        badge = await page.evaluate("document.querySelector('.caption-badge')?.textContent")
        mp3s = await page.evaluate("performance.getEntriesByType('resource').filter(e => e.name.includes('/narration/') && e.name.endsWith('.mp3')).map(e => e.name.split('/').pop())")
        print('welcome narration:', badge, mp3s)
        if badge != 'Narrator' or 'welcome.mp3' not in mp3s:
            problems.append(f'welcome narration did not play a recording (badge={badge}, mp3={mp3s})')
        tone = await page.evaluate("window.Tone ? Tone.getContext().state : 'n/a'")
        print('audio after gesture:', tone)
        await page.screenshot(path=str(shots / 'live-select.png'))
        cat = await page.evaluate("fetch('/api/nasa/datasets').then(r => r.json())")
        datasets = cat['datasets']
        print('datasets:', [d['id'] for d in datasets])

        # ---- each dataset ------------------------------------------------------------------
        for ds in datasets:
            n = ds['number']
            await page.keyboard.press(str(n))
            try:
                await page.wait_for_function(
                    "() => document.querySelector('.stage') && !document.querySelector('.stage-status') && document.querySelector('.readout-value')",
                    timeout=120000,
                )
            except Exception as e:  # noqa: BLE001
                status = await page.evaluate("document.querySelector('.stage-status')?.textContent")
                problems.append(f'{ds["id"]}: frame did not load ({status}) {e}')
                continue
            await page.wait_for_timeout(500)
            for _ in range(6):
                await page.keyboard.press('Shift+ArrowRight')
            await page.keyboard.press('Shift+ArrowUp')
            await page.wait_for_timeout(250)
            info = await page.evaluate(
                """() => ({
                  value: document.querySelector('.readout-value')?.textContent,
                  place: document.querySelector('.readout-place')?.textContent,
                  grid: Array.from(document.querySelectorAll('.readout-grid dd')).map(e => e.textContent),
                  stats: Array.from(document.querySelectorAll('.stats > div')).map(d => d.innerText.replace(/\\n/g, ': ')),
                  marks: document.querySelectorAll('.mark').length,
                  layers: Array.from(document.querySelectorAll('.stage-layers img')).map(i => i.naturalWidth + 'x' + i.naturalHeight),
                })"""
            )
            print(f"\n[{n}] {ds['id']}: {info['value']} @ {info['place']} | {info['grid']}")
            print('    stats:', info['stats'])
            print('    marks:', info['marks'], 'layers:', info['layers'])
            if any(l.startswith('0x') for l in info['layers']):
                problems.append(f"{ds['id']}: an image layer failed to decode {info['layers']}")
            await page.screenshot(path=str(shots / f"live-{ds['id']}.png"))

            # H jumps to a landmark/event and describes it.
            await page.keyboard.press('h')
            await page.wait_for_timeout(300)

            if ds.get('timeMachine') and not args.quick:
                await page.wait_for_function("() => !document.querySelector('.time-controls .btn-primary')?.disabled", timeout=120000)
                await page.keyboard.press('t')
                await page.wait_for_timeout(4500)
                await page.screenshot(path=str(shots / f"live-{ds['id']}-time.png"))
                await page.wait_for_function("() => document.querySelector('.time-summary')", timeout=60000)
                summary = await page.evaluate("document.querySelector('.time-summary').textContent")
                values = await page.evaluate("document.querySelector('.time-values')?.innerText")
                print('    time machine:', values.replace('\n', ' | ') if values else None)
                print('    summary:', summary)
                lines[f"summary-{ds['id']}"] = summary
                await page.screenshot(path=str(shots / f"live-{ds['id']}-time-done.png"))
                await page.keyboard.press('Escape')  # leave time mode

            if n == 1:
                await page.keyboard.press('b')
                await page.wait_for_timeout(400)
                hidden = await page.evaluate("getComputedStyle(document.querySelector('.stage-layers')).visibility")
                if hidden != 'hidden':
                    problems.append('blindfold did not hide the picture')
                await page.screenshot(path=str(shots / 'live-blindfold.png'))
                await page.keyboard.press('v')
                await page.wait_for_timeout(200)
                await page.keyboard.press('Escape')
                await page.keyboard.press('l')
                await page.wait_for_timeout(500)
                await page.screenshot(path=str(shots / 'live-legend.png'))
                await page.keyboard.press('Escape')
                await page.click('text=How it works')
                await page.wait_for_timeout(300)
                await page.screenshot(path=str(shots / 'live-how.png'))
                await page.keyboard.press('Escape')

        print('\ncaption now:', await transcript())
        kinds = await page.evaluate("Array.from(document.querySelectorAll('.tr-kind')).map(e => e.textContent)")
        played = await page.evaluate("[...new Set(performance.getEntriesByType('resource').filter(e => e.name.includes('/narration/') && e.name.endsWith('.mp3')).map(e => e.name.split('/').pop()))]")
        print(f'transcript lines: {len(kinds)} ({kinds.count("voice")} voiced)  recordings fetched: {len(played)}')
        print('   ', ', '.join(sorted(played)))

        # ---- mobile layout ---------------------------------------------------------------
        m = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        mp = await m.new_page()
        await mp.goto(args.url, wait_until='networkidle')
        await mp.screenshot(path=str(shots / 'live-gate-mobile.png'))
        await mp.tap('.gate-start')
        await mp.wait_for_selector('.datasets')
        await mp.wait_for_timeout(400)
        await mp.screenshot(path=str(shots / 'live-select-mobile.png'))
        await mp.tap('.dataset >> nth=2')
        await mp.wait_for_function("() => document.querySelector('.readout-value')", timeout=120000)
        await mp.wait_for_timeout(500)
        over = await mp.evaluate("document.documentElement.scrollWidth - innerWidth")
        if over > 1:
            problems.append(f'mobile horizontal overflow {over}px')
        await mp.screenshot(path=str(shots / 'live-sst-mobile.png'))
        await m.close()

        # ---- the lines to record ----------------------------------------------------------
        from_proxy = await page.evaluate(
            """async () => {
              const out = {}
              const cat = await (await fetch('/api/nasa/datasets')).json()
              for (const d of cat.datasets) {
                if (d.svs) {
                  try { const s = await (await fetch('/api/nasa/svs?id=' + d.svs)).json(); out['svs-' + d.id] = s.fact } catch {}
                }
                if (d.kind === 'event' || d.eventOverlay) {
                  try {
                    const l = await (await fetch('/api/nasa/events?dataset=' + d.id + '&limit=12')).json()
                    l.events.forEach((e, i) => { out['event-' + d.id + '-' + i] = e.narration })
                    out['scope-' + d.id] = l.scope
                  } catch {}
                }
              }
              return out
            }"""
        )
        lines.update(from_proxy)
        await browser.close()

    out = ROOT / 'pipeline' / 'narration_lines.json'
    out.write_text(json.dumps(lines, indent=2, ensure_ascii=False))
    print(f'\nwrote {len(lines)} live lines to {out.relative_to(ROOT)}')
    print('requests outside our origin:', sorted(foreign) or 'none')
    if foreign:
        problems.append(f'direct third-party requests: {sorted(foreign)}')
    if problems:
        print('\nPROBLEMS:')
        for pr in problems:
            print(' -', pr)
        sys.exit(1)
    print('\nOK: no console errors, no failed requests, no CORS-prone direct calls.')


asyncio.run(main())
