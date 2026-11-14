#!/usr/bin/env python3
"""Plan and build AlgoRythm's recorded narration.

Every clip is a real TTS recording of the exact sentence the app displays. The
narrator only plays a clip whose text matches the live sentence, so a stale
recording can never contradict NASA's current data.

  python3 pipeline/bake_narration.py plan    # -> pipeline/narration_todo.json (clips still to record)
  # record each todo entry to its .wav path (warm narrator voice "Sulafat", en-US)
  python3 pipeline/bake_narration.py build   # wav -> public/narration/*.mp3 + manifest.json

Sources of text:
  * shared/narration.mjs           fixed lines (welcome, intros, modes)
  * the running /api/nasa proxy    EONET event narrations (by event id), SVS facts
  * pipeline/narration_lines.json  Time Machine results measured in the browser by pipeline/e2e.py
"""
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'narration'
WAV = ROOT / 'pipeline' / 'wav'
TODO = ROOT / 'pipeline' / 'narration_todo.json'
API = 'http://localhost:5173/api/nasa'
EVENTS_PER_DATASET = {'storms': 12, 'wildfires': 8, 'volcanoes': 8}

norm = lambda t: re.sub(r'\s+', ' ', t).strip()


def get(path):
    with urllib.request.urlopen(f'{API}{path}', timeout=120) as r:
        return json.load(r)


def fixed_lines():
    js = (
        "import('./shared/narration.mjs').then(m => console.log(JSON.stringify({"
        "welcome: m.WELCOME, blindfold: m.BLINDFOLD, 'no-time-machine': m.NO_TIME_MACHINE,"
        "'intro-volcanoes-open': m.VOLCANO_INTRO_OPEN,"
        "...Object.fromEntries(Object.entries(m.DATASET_INTROS).map(([k, v]) => ['intro-' + k, v])),"
        "...Object.fromEntries(Object.entries(m.TIME_MACHINE_INTRO).map(([k, v]) => ['time-' + k, v])),"
        "})))"
    )
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT, text=True))


def live_lines():
    out = {}
    cat = get('/datasets')
    for d in cat['datasets']:
        if d.get('svs'):
            try:
                out[f"svs-{d['id']}"] = get(f"/svs?id={d['svs']}")['fact']
            except Exception as e:  # noqa: BLE001
                print('svs failed', d['id'], e, file=sys.stderr)
        n = EVENTS_PER_DATASET.get(d['id'])
        if n:
            for e in get(f"/events?dataset={d['id']}&limit={n}")['events']:
                out[f"event-{e['id'].lower()}"] = e['narration']
    measured = ROOT / 'pipeline' / 'narration_lines.json'
    if measured.exists():
        for k, v in json.loads(measured.read_text()).items():
            if k.startswith('summary-'):
                out[k] = v
    return out


def wanted():
    lines = {**fixed_lines(), **live_lines()}
    seen, out = set(), {}
    for k, v in lines.items():
        t = norm(v)
        if t and t not in seen:
            seen.add(t)
            out[k] = t
    return out


def manifest():
    f = OUT / 'manifest.json'
    return json.loads(f.read_text()) if f.exists() else {'clips': []}


def plan():
    want = wanted()
    have = {norm(c['text']): c for c in manifest()['clips'] if (OUT / Path(c['src']).name).exists()}
    todo = [
        {'id': k, 'text': t, 'wav': str(WAV / f'{k}.wav')}
        for k, t in want.items()
        if t not in have and not (WAV / f'{k}.wav').exists()
    ]
    TODO.write_text(json.dumps({'all': want, 'todo': todo}, indent=2, ensure_ascii=False))
    print(f'{len(want)} lines wanted, {len(have)} recorded, {len(todo)} to record -> {TODO.relative_to(ROOT)}')
    for t in todo:
        print(f"  {t['id']}: {len(t['text'])} chars")


def duration(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], capture_output=True, text=True)
    return round(float(r.stdout.strip() or 0), 2)


def build():
    want = json.loads(TODO.read_text())['all'] if TODO.exists() else wanted()
    OUT.mkdir(parents=True, exist_ok=True)
    old = {norm(c['text']): c for c in manifest()['clips']}
    clips, missing = [], []
    for k, t in want.items():
        mp3 = OUT / f'{k}.mp3'
        wav = WAV / f'{k}.wav'
        if wav.exists() and (not mp3.exists() or wav.stat().st_mtime > mp3.stat().st_mtime):
            subprocess.run(
                ['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-af', 'loudnorm=I=-18:TP=-2:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '80k', str(mp3)],
                check=True,
            )
        if mp3.exists() and (wav.exists() or (t in old and Path(old[t]['src']).name == mp3.name)):
            clips.append({'id': k, 'text': t, 'src': f'/narration/{mp3.name}', 'seconds': duration(mp3)})
        else:
            missing.append(k)
    keep = {Path(c['src']).name for c in clips}
    for f in OUT.glob('*.mp3'):
        if f.name not in keep:
            f.unlink()
    (OUT / 'manifest.json').write_text(json.dumps({'voice': 'Sulafat (warm, en-US)', 'clips': clips}, indent=2, ensure_ascii=False))
    total = sum(c['seconds'] for c in clips)
    print(f'{len(clips)} clips, {total / 60:.1f} min of narration -> public/narration/manifest.json')
    if missing:
        print('missing recordings (shown as text only):', ', '.join(missing))


if __name__ == '__main__':
    {'plan': plan, 'build': build}[sys.argv[1] if len(sys.argv) > 1 else 'plan']()
