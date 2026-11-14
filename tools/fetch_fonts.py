#!/usr/bin/env python3
"""Download the webfonts used by the design directions and rewrite the CSS to
point at local woff2 files, so every mockup renders with no network access."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

OUT = Path("design/assets/fonts")
OUT.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

FAMILIES = [
    "Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400",
    "Space+Grotesk:wght@400;500;700",
    "IBM+Plex+Mono:wght@400;500",
    "Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300",
    "Inter:wght@400;500;600",
    "Noto+Kufi+Arabic:wght@400;600",
]

css_out: list[str] = []
for fam in FAMILIES:
    url = f"https://fonts.googleapis.com/css2?family={fam}&display=swap"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=30).read().decode()
    # keep only the latin / arabic subsets to stay small
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css)
    for subset, block in blocks:
        if subset not in ("latin", "arabic"):
            continue
        m = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        if not m:
            continue
        src = m.group(1)
        name = src.rsplit("/", 1)[-1]
        dest = OUT / name
        if not dest.exists():
            dest.write_bytes(urllib.request.urlopen(src, timeout=30).read())
        css_out.append(block.replace(src, f"fonts/{name}"))
        print(f"[font] {subset:<7} {name}")

Path("design/assets/fonts.css").write_text("\n".join(css_out) + "\n")
print(f"{len(css_out)} faces -> design/assets/fonts.css")
