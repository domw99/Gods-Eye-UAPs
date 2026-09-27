#!/usr/bin/env python3
"""
Make the sky behind the globe: six cube faces for Cesium's SkyBox from NASA's
Deep Star Maps 2020 (NASA/Goddard Space Flight Center Scientific
Visualization Studio; stars from Hipparcos-2, Tycho-2 and Gaia DR2,
https://svs.gsfc.nasa.gov/4851).

    curl -O https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_8k.exr
    pip install numpy OpenEXR pillow
    python3 scripts/build-skybox.py starmap_2020_8k.exr public/skybox

The map is in celestial coordinates (ICRF right ascension and declination,
plate carrée, centred on 0h with RA increasing to the left). Cesium samples
the cube in the same inertial frame with standard GL cube-map directions and
uploads faces flipped vertically, which the face directions below account
for. A dark tone curve keeps the Milky Way subtle behind the markers.
"""
import sys
from pathlib import Path

import numpy as np
import OpenEXR
from PIL import Image

SIZE = 2048  # pixels per face: about one texel per screen pixel at a 60° view
BLACK, GAIN, QUALITY = 0.006, 0.9, 80


def face_dirs(face, n):
    t = (np.arange(n) + 0.5) / n * 2 - 1
    u, v = np.meshgrid(t, t)  # u across the image, v down it
    one = np.ones_like(u)
    return {
        'px': (one, v, -u), 'mx': (-one, v, u),
        'py': (u, one, -v), 'my': (u, -one, v),
        'pz': (u, v, one), 'mz': (-u, v, -one),
    }[face]


def sample(img, x, y, z):
    h, w, _ = img.shape
    r = np.sqrt(x * x + y * y + z * z)
    ra = np.arctan2(y, x)
    dec = np.arcsin(z / r)
    col = ((0.5 - ra / (2 * np.pi)) % 1.0) * w - 0.5
    row = (0.5 - dec / np.pi) * h - 0.5
    c0 = np.floor(col).astype(int)
    r0 = np.clip(np.floor(row).astype(int), 0, h - 2)
    fc = (col - c0)[..., None]
    fr = (row - r0)[..., None]
    c0m, c1m = c0 % w, (c0 + 1) % w
    top = img[r0, c0m] * (1 - fc) + img[r0, c1m] * fc
    bottom = img[r0 + 1, c0m] * (1 - fc) + img[r0 + 1, c1m] * fc
    return top * (1 - fr) + bottom * fr


def main(src, out):
    img = OpenEXR.File(src).channels()['RGB'].pixels.astype(np.float32)
    Path(out).mkdir(parents=True, exist_ok=True)
    for face in ['px', 'mx', 'py', 'my', 'pz', 'mz']:
        v = sample(img, *face_dirs(face, SIZE))
        v = np.clip((v - BLACK) * GAIN, 0, 1) ** (1 / 2.2)
        Image.fromarray((v * 255 + 0.5).astype(np.uint8)).save(f'{out}/{face}.jpg', quality=QUALITY, optimize=True, progressive=True)
        print(face)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'public/skybox')
