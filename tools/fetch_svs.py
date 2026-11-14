#!/usr/bin/env python3
"""
Fetch metadata + still frames for the NASA EIC / SVS visualisations named in the
Space Apps 2026 "Earth Information Jukebox" resources tab.

Source of truth: https://svs.gsfc.nasa.gov/api/<id>/
Every field we keep is either verbatim from that API or a URL to the original.

Usage:  python3 tools/fetch_svs.py [--out data/svs]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

# The 10 visualisations listed in the official Resources tab (+ 1 deep-space
# reference example). id -> local slug used across the app.
SOURCES = {
    5313: "night-lights",
    3912: "sea-currents",
    5669: "geos-aerosols",
    4950: "gedi-forest-height",
    5196: "dyamond-co2",
    5011: "iss-lightning",
    4960: "atmospheric-river",
    5425: "perpetual-ocean",
    5533: "air-quality",
    13786: "caldwell-73",
}

API = "https://svs.gsfc.nasa.gov/api/{}/"
UA = {"User-Agent": "3Sama/0.1 (NASA Space Apps Cairo 2026)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def best_still(doc: dict) -> dict | None:
    """Prefer the page's main image; fall back to the largest image in media groups."""
    mi = doc.get("main_image")
    if mi and mi.get("media_type") == "Image":
        return mi
    for g in doc.get("media_groups", []):
        for item in g.get("items", []):
            inst = item.get("instance") or {}
            if inst.get("media_type") == "Image" and inst.get("filename", "").endswith(
                (".jpg", ".png")
            ):
                if "searchweb" in inst["filename"] or "print" in inst["filename"]:
                    continue
                return inst
    return None


def alt_texts(doc: dict) -> list[str]:
    out: list[str] = []
    mi = doc.get("main_image") or {}
    if mi.get("alt_text"):
        out.append(mi["alt_text"].strip())
    for g in doc.get("media_groups", []):
        for item in g.get("items", []):
            inst = item.get("instance") or {}
            at = (inst.get("alt_text") or "").strip()
            if at and at not in out:
                out.append(at)
    return out


def clean(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def titled(items) -> list[str]:
    """SVS sometimes returns objects with `title`, sometimes bare strings."""
    out = []
    for it in items or []:
        out.append(clean(it.get("title") if isinstance(it, dict) else it))
    return [x for x in out if x]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/svs")
    ap.add_argument("--only", default="", help="comma separated SVS ids")
    args = ap.parse_args()

    out = Path(args.out)
    (out / "img").mkdir(parents=True, exist_ok=True)
    only = {int(x) for x in args.only.split(",") if x.strip()}

    manifest = []
    for sid, slug in SOURCES.items():
        if only and sid not in only:
            continue
        try:
            doc = json.loads(get(API.format(sid)))
        except Exception as e:  # noqa: BLE001
            print(f"[skip] {sid} {slug}: {e}", file=sys.stderr)
            continue

        still = best_still(doc)
        local_img = None
        if still:
            ext = Path(still["filename"]).suffix or ".jpg"
            local_img = f"img/{slug}{ext}"
            try:
                (out / local_img).write_bytes(get(still["url"].replace("http://", "https://")))
            except Exception as e:  # noqa: BLE001
                print(f"[warn] image {sid}: {e}", file=sys.stderr)
                local_img = None

        entry = {
            "svs_id": sid,
            "slug": slug,
            "title": clean(doc.get("title")),
            "page_url": f"https://svs.gsfc.nasa.gov/{sid}/",
            "release_date": doc.get("release_date"),
            "description": clean(doc.get("description")),
            "alt_texts": [clean(t) for t in alt_texts(doc)],
            "credits": [
                {"role": c.get("type"), "who": clean(c.get("text"))}
                for c in (doc.get("credits") or [])
            ],
            "datasets": titled(doc.get("datasets")),
            "keywords": doc.get("keywords") or [],
            "missions": titled(doc.get("missions")),
            "image": {
                "local": local_img,
                "source_url": still["url"].replace("http://", "https://") if still else None,
                "filename": still["filename"] if still else None,
            },
        }
        manifest.append(entry)
        print(f"[ok] {sid:>5} {slug:<20} {entry['title'][:60]}  img={'y' if local_img else 'n'}")

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n{len(manifest)} entries -> {out/'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
