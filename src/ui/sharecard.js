/**
 * Share cards: a 1200×630 image of a case (the size link previews use), with
 * a snapshot of the globe at the case, its title, date, place, status,
 * evidence score and link. Shared through the system share sheet where the
 * browser supports files, otherwise downloaded.
 */
const W = 1200;
const H = 630;

/**
 * Grab the globe exactly as drawn: copy the WebGL canvas during the next
 * render. `focus` (a Cartesian3) is returned as a pixel position on the copy.
 */
export function snapshotGlobe(viewer, focus = null) {
  return new Promise((resolve) => {
    const remove = viewer.scene.postRender.addEventListener(() => {
      remove();
      const src = viewer.scene.canvas;
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      let at = null;
      if (focus) {
        const w = viewer.scene.cartesianToCanvasCoordinates(focus);
        const k = src.width / (src.clientWidth || src.width);
        if (w) at = { x: w.x * k, y: w.y * k };
      }
      resolve({ canvas: c, at });
    });
    viewer.scene.requestRender();
  });
}

/** Break text into at most `maxLines` lines of `width` pixels, with an ellipsis if cut. */
export function wrapText(measure, text, width, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(next) <= width || !line) line = next;
    else {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) {
        line = '';
        const last = lines[maxLines - 1];
        let cut = last;
        while (cut && measure(`${cut}…`) > width) cut = cut.slice(0, -1);
        lines[maxLines - 1] = `${cut.replace(/[\s,.;:—-]+$/, '')}…`;
        return lines;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw the card. `c`: { title, when, place, status, statusColor, score, summary, url, kind }.
 * `globe` is a canvas snapshot (or null).
 */
export async function drawCard(c, snap) {
  const globe = snap?.canvas || null;
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, W, H);

  // The globe on the left, cropped to fill, fading into the panel.
  const gw = 640;
  let mark = { x: gw / 2, y: H / 2 };
  let showMark = false;
  if (globe) {
    // Crop around the case when it is on screen, keeping the crop inside the image.
    const scale = Math.max(gw / globe.width, H / globe.height) * 1.15;
    const sw = gw / scale;
    const sh = H / scale;
    const at = snap.at && snap.at.x >= 0 && snap.at.y >= 0 && snap.at.x <= globe.width && snap.at.y <= globe.height ? snap.at : null;
    const cx = at ? at.x : globe.width / 2;
    const cy = at ? at.y : globe.height / 2;
    const sx = Math.min(Math.max(0, cx - sw / 2), globe.width - sw);
    const sy = Math.min(Math.max(0, cy - sh / 2), globe.height - sh);
    g.drawImage(globe, sx, sy, sw, sh, 0, 0, gw, H);
    if (at) {
      mark = { x: (cx - sx) * scale, y: (cy - sy) * scale };
      showMark = mark.x < gw - 120;
    }
  }
  const fade = g.createLinearGradient(gw - 260, 0, gw, 0);
  fade.addColorStop(0, 'rgba(5,7,12,0)');
  fade.addColorStop(1, 'rgba(5,7,12,1)');
  g.fillStyle = fade;
  g.fillRect(gw - 260, 0, 260, H);
  // Reticle over the case location.
  if (showMark) {
    g.strokeStyle = 'rgba(0,212,255,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mark.x, mark.y, 26, 0, Math.PI * 2);
    g.stroke();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.beginPath();
      g.moveTo(mark.x + dx * 32, mark.y + dy * 32);
      g.lineTo(mark.x + dx * 44, mark.y + dy * 44);
      g.stroke();
    }
  }

  const x = 600;
  const width = W - x - 56;
  let y = 64;
  g.fillStyle = '#00d4ff';
  g.font = '600 18px "JetBrains Mono", monospace';
  const brand = "GOD'S EYE // UAP";
  const bw = g.measureText(brand).width;
  g.fillText(brand, x, y);
  g.fillStyle = 'rgba(232,234,237,0.45)';
  g.font = '500 13px "JetBrains Mono", monospace';
  g.fillText(c.kind || 'CASE FILE', x + bw + 16, y);

  y += 58;
  g.fillStyle = '#e8eaed';
  g.font = '700 44px Inter, sans-serif';
  const titleLines = wrapText((t) => g.measureText(t).width, c.title, width, 3);
  for (const l of titleLines) {
    g.fillText(l, x, y);
    y += 52;
  }
  y += 4;
  g.fillStyle = 'rgba(232,234,237,0.7)';
  g.font = '500 18px "JetBrains Mono", monospace';
  for (const l of wrapText((t) => g.measureText(t).width, `${c.when} · ${c.place}`, width, 2)) {
    g.fillText(l, x, y);
    y += 26;
  }

  // Status pill and evidence meter.
  y += 18;
  g.font = '600 15px "JetBrains Mono", monospace';
  const pill = c.status.toUpperCase();
  const pw = g.measureText(pill).width + 24;
  g.strokeStyle = c.statusColor;
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(x, y - 20, pw, 30, 6);
  g.stroke();
  g.fillStyle = c.statusColor;
  g.fillText(pill, x + 12, y);
  if (c.score != null) {
    const mx = x + pw + 22;
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i < c.score ? '#00d4ff' : 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.roundRect(mx + i * 17, y - 14, 13, 18, 2);
      g.fill();
    }
    g.fillStyle = 'rgba(232,234,237,0.7)';
    g.fillText(`${c.score}/10 evidence`, mx + 178, y);
  }

  // Summary.
  y += 44;
  g.fillStyle = 'rgba(232,234,237,0.82)';
  g.font = '400 20px Inter, sans-serif';
  const room = Math.max(1, Math.floor((H - 70 - y) / 29));
  for (const l of wrapText((t) => g.measureText(t).width, c.summary, width, Math.min(6, room))) {
    g.fillText(l, x, y);
    y += 29;
  }

  // Link.
  g.fillStyle = 'rgba(0,212,255,0.9)';
  g.font = '500 15px "JetBrains Mono", monospace';
  g.fillText(c.url.replace(/^https?:\/\//, '').slice(0, 64), x, H - 40);
  return canvas;
}

/** Share the card image, or download it. Returns how it went: 'shared' | 'downloaded' | 'cancelled'. */
export async function shareCard(canvas, { title, url, filename }) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: `${title} — on God's Eye // UAP`, url });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}
