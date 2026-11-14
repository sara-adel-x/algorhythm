#!/usr/bin/env python3
"""
Build one scene from a NASA image.

  image ──► 16 x 12 grid of (hue, saturation, lightness, edge)
        ──► global histogram (used for the drone character)
        ──► hotspot candidates (proposed by CV, then hand-reviewed in meta/<id>.json)
        ──► public/scenes/<id>/{image.webp, scene.json}

The grid is what the browser reads; nothing is analysed at runtime.

Usage:
  python3 pipeline/build_scene.py --image pipeline/source/m74.jpg \
      --meta pipeline/meta/m74.json --id m74 --out public/scenes/m74
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

COLS, ROWS = 16, 12


# ---------------------------------------------------------------- image maths
def to_hsl_array(img: Image.Image) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=-1)
    mn = arr.min(axis=-1)
    l = (mx + mn) / 2.0
    d = mx - mn
    s = np.where(d == 0, 0.0, d / (1.0 - np.abs(2 * l - 1) + 1e-9))
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rmax = nz & (mx == r)
    gmax = nz & (mx == g) & ~rmax
    bmax = nz & (mx == b) & ~rmax & ~gmax
    h[rmax] = ((g[rmax] - b[rmax]) / d[rmax]) % 6
    h[gmax] = (b[gmax] - r[gmax]) / d[gmax] + 2
    h[bmax] = (r[bmax] - g[bmax]) / d[bmax] + 4
    h = (h * 60.0) % 360.0
    return h, np.clip(s, 0, 1), np.clip(l, 0, 1)


def sobel(gray: np.ndarray) -> np.ndarray:
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    ky = kx.T
    pad = np.pad(gray, 1, mode="edge")
    gx = sum(kx[i, j] * pad[i : i + gray.shape[0], j : j + gray.shape[1]] for i in range(3) for j in range(3))
    gy = sum(ky[i, j] * pad[i : i + gray.shape[0], j : j + gray.shape[1]] for i in range(3) for j in range(3))
    return np.clip(np.hypot(gx, gy) / 4.0, 0, 1)


def block_mean(a: np.ndarray, cols: int, rows: int) -> np.ndarray:
    h, w = a.shape
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    out = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        for c in range(cols):
            blk = a[ys[r] : max(ys[r] + 1, ys[r + 1]), xs[c] : max(xs[c] + 1, xs[c + 1])]
            out[r, c] = float(blk.mean()) if blk.size else 0.0
    return out


def block_stat(a: np.ndarray, cols: int, rows: int, q: float = 0.75, mix: float = 0.45) -> np.ndarray:
    """Mean blended with a high percentile.

    A plain mean erases thin bright structures: a spiral filament crossing a
    16 x 12 block averages away into the black around it, and the listener hears
    silence exactly where the picture is brightest. Mixing in the 75th
    percentile keeps the structure while still describing the block as a whole.
    """
    h, w = a.shape
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    out = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        for c in range(cols):
            blk = a[ys[r] : max(ys[r] + 1, ys[r + 1]), xs[c] : max(xs[c] + 1, xs[c + 1])]
            if blk.size:
                out[r, c] = float((1 - mix) * blk.mean() + mix * np.percentile(blk, q * 100))
    return out


def circular_mean_hue(h: np.ndarray, weight: np.ndarray) -> float:
    ang = np.deg2rad(h)
    x = float((np.cos(ang) * weight).sum())
    y = float((np.sin(ang) * weight).sum())
    return float(np.rad2deg(np.arctan2(y, x)) % 360.0)


# ---------------------------------------------------------------- hotspots
def propose_hotspots(l: np.ndarray, k: int = 6) -> list[dict]:
    """Brightest local maxima, spread out. These are *candidates* only — every
    one of them must be named and described by hand in meta/<id>.json."""
    h, w = l.shape
    blur = l.copy()
    for _ in range(2):  # cheap 3x3 box blur
        blur = (
            np.roll(blur, 1, 0) + np.roll(blur, -1, 0) + np.roll(blur, 1, 1) + np.roll(blur, -1, 1) + blur
        ) / 5.0
    cand: list[tuple[float, int, int]] = []
    step = 4
    for y in range(step, h - step, step):
        for x in range(step, w - step, step):
            if blur[y, x] >= blur[y - step : y + step, x - step : x + step].max() - 1e-6:
                cand.append((float(blur[y, x]), y, x))
    cand.sort(reverse=True)
    picked: list[dict] = []
    for score, y, x in cand:
        if score < 0.12:
            break
        if any((x - p["px"]) ** 2 + (y - p["py"]) ** 2 < (0.16 * w) ** 2 for p in picked):
            continue
        picked.append({"px": x, "py": y, "x": round(x / w, 4), "y": round(y / h, 4), "score": round(score, 3)})
        if len(picked) >= k:
            break
    return picked


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=COLS)
    ap.add_argument("--rows", type=int, default=ROWS)
    ap.add_argument("--max-width", type=int, default=1600)
    args = ap.parse_args()

    src = Image.open(args.image).convert("RGB")
    meta = json.loads(Path(args.meta).read_text())

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # 1. web image
    img = src
    if img.width > args.max_width:
        img = img.resize((args.max_width, round(img.height * args.max_width / img.width)), Image.LANCZOS)
    img.save(out / "image.webp", "WEBP", quality=86, method=6)

    # 2. analysis grids
    h, s, l = to_hsl_array(src)
    gray = np.asarray(src.convert("L"), dtype=np.float32) / 255.0
    e = sobel(gray)

    gh = block_mean(h, args.cols, args.rows)
    gs = block_mean(s, args.cols, args.rows)
    gl = block_stat(l, args.cols, args.rows)
    ge = block_stat(e, args.cols, args.rows, q=0.8, mix=0.5)

    cells = []
    for r in range(args.rows):
        for c in range(args.cols):
            cells.append(
                {
                    "h": round(float(gh[r, c]), 1),
                    "s": round(float(gs[r, c]), 3),
                    "l": round(float(gl[r, c]), 3),
                    "e": round(float(ge[r, c]), 3),
                }
            )

    lit = gl.reshape(-1)
    histogram = {
        "brightness": round(float(lit.mean()), 3),
        "brightest": round(float(lit.max()), 3),
        "dark_fraction": round(float((lit < 0.06).mean()), 3),
        "edge_density": round(float(ge.mean()), 3),
        "hue": round(circular_mean_hue(gh.reshape(-1), gs.reshape(-1) + 0.05), 1),
        "warmth": round(
            float(((gh.reshape(-1) < 60) | (gh.reshape(-1) > 320)).mean()), 3
        ),
    }

    # 3. hotspots: the human-authored list is authoritative. The CV candidates
    #    are kept only as provenance (how much structure the detector agreed on).
    candidates = propose_hotspots(np.asarray(src.convert("L"), dtype=np.float32) / 255.0)
    hotspots = []
    for hs in meta.get("hotspots", []):
        near = min(
            ((hs["x"] - c["x"]) ** 2 + (hs["y"] - c["y"]) ** 2) ** 0.5 for c in candidates
        ) if candidates else None
        hotspots.append(
            {
                "id": hs["id"],
                "x": hs["x"],
                "y": hs["y"],
                "name": hs["name"],
                "text": hs["text"],
                "cue": hs.get("cue", "chime"),
                "sourced": hs.get("sourced", "image"),
                "cv_agreement": None if near is None else round(1 - min(near / 0.3, 1), 2),
                "verified": True,
            }
        )

    scene = {
        "id": args.id,
        "title": meta["title"],
        "subtitle": meta.get("subtitle", ""),
        "source": meta["source"],
        "image": {
            "src": f"/scenes/{args.id}/image.webp",
            "w": img.width,
            "h": img.height,
            "alt": meta["alt"],
        },
        "sound": meta["sound"],
        "grid": {"cols": args.cols, "rows": args.rows, "cells": cells},
        "histogram": histogram,
        "hotspots": hotspots,
        "journey": meta.get("journey", [h["id"] for h in hotspots]),
        "facts": meta["facts"],
    }

    (out / "scene.json").write_text(json.dumps(scene, indent=1, ensure_ascii=False))
    print(f"[scene] {args.id}: {len(cells)} cells, {len(hotspots)} hotspots, image {img.width}x{img.height}")
    print(f"[scene] brightness {histogram['brightness']}  dark {histogram['dark_fraction']}  hue {histogram['hue']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
