import { state, update, YEAR_MIN, YEAR_MAX } from '../state.js';

/**
 * Year histogram with brush selection. Bars: curated + official + user items
 * (after non-year filters). Overlays, each on its own scale: NUFORC reports
 * per year (orange area) and a line each for Blue Book, GEIPAN and MUFON.
 */
const LINES = [
  { key: 'bluebook', color: '#ffb547', label: 'Blue Book' },
  { key: 'geipan', color: '#5f8bff', label: 'GEIPAN' },
  { key: 'mufon', color: '#b58cff', label: 'MUFON' },
  { key: 'journals', color: '#3fd4b0', label: 'archives' },
];
export function createTimeline({ onPlayToggle }) {
  const canvas = document.getElementById('tl-canvas');
  const label = document.getElementById('tl-range');
  const g = canvas.getContext('2d');
  const N = YEAR_MAX - YEAR_MIN + 1;
  let bars = new Array(N).fill(0);
  let barKinds = new Array(N).fill(null).map(() => ({ case: 0, official: 0, user: 0 }));
  const lines = {}; // key -> counts per year, for the layers that are on
  let nuforc = null;
  let drag = null;
  let hoverYear = null;

  const pad = { l: 26, r: 8, t: 4, b: 14 };
  const xOf = (year, w) => pad.l + ((year - YEAR_MIN) / N) * (w - pad.l - pad.r);
  const yearAt = (x, w) =>
    Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.floor(YEAR_MIN + ((x - pad.l) / (w - pad.l - pad.r)) * N)));

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    g.clearRect(0, 0, w, h);
    const plotH = h - pad.t - pad.b;
    const bw = Math.max(1, (w - pad.l - pad.r) / N - 1);

    // Selected range backdrop.
    if (state.yearRange) {
      const [a, b] = state.yearRange;
      g.fillStyle = 'rgba(0,212,255,0.10)';
      g.fillRect(xOf(a, w), pad.t, xOf(b + 1, w) - xOf(a, w), plotH);
    }
    // NUFORC area.
    if (nuforc) {
      const max = Math.max(1, ...nuforc);
      g.beginPath();
      g.moveTo(xOf(YEAR_MIN, w), pad.t + plotH);
      nuforc.forEach((v, i) => g.lineTo(xOf(YEAR_MIN + i, w) + bw / 2, pad.t + plotH - (v / max) * plotH * 0.95));
      g.lineTo(xOf(YEAR_MAX, w), pad.t + plotH);
      g.closePath();
      g.fillStyle = 'rgba(255,122,69,0.18)';
      g.fill();
    }
    // Bars (stacked by kind).
    const max = Math.max(1, ...bars);
    const colors = { case: '#00d4ff', official: '#ff5ce1', user: '#c6ff5c' };
    barKinds.forEach((k, i) => {
      let y = pad.t + plotH;
      for (const kind of ['case', 'official', 'user']) {
        if (!k[kind]) continue;
        const bh = Math.max(2, (k[kind] / max) * plotH);
        g.fillStyle = colors[kind];
        g.globalAlpha = inRange(YEAR_MIN + i) ? 0.95 : 0.3;
        g.fillRect(xOf(YEAR_MIN + i, w), y - bh, bw, bh);
        y -= bh;
      }
    });
    g.globalAlpha = 1;
    // One line per archive layer.
    for (const { key, color } of LINES) {
      const counts = lines[key];
      if (!counts) continue;
      const lmax = Math.max(1, ...counts);
      g.beginPath();
      counts.forEach((v, i) => {
        const x = xOf(YEAR_MIN + i, w) + bw / 2;
        const y = pad.t + plotH - (v / lmax) * plotH * 0.95;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Axis labels.
    g.fillStyle = 'rgba(232,234,237,0.45)';
    g.font = '10px JetBrains Mono, monospace';
    g.textAlign = 'center';
    for (let y = 1900; y <= YEAR_MAX; y += w < 520 ? 40 : 20) g.fillText(String(y), xOf(y, w), h - 2);
    g.textAlign = 'left';
    g.fillText('≤', 4, h - 2);
    if (hoverYear != null) {
      const i = hoverYear - YEAR_MIN;
      const x = xOf(hoverYear, w);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(x + bw / 2, pad.t, 1, plotH);
      const parts = [`${hoverYear}: ${bars[i]} records`];
      for (const { key, label } of LINES) if (lines[key]) parts.push(`${lines[key][i]} ${label}`);
      if (nuforc) parts.push(`${nuforc[i]} NUFORC`);
      const text = parts.join(' · ');
      g.font = '10.5px JetBrains Mono, monospace';
      const tw = g.measureText(text).width + 10;
      const tx = Math.min(w - tw - 2, Math.max(pad.l, x - tw / 2));
      g.fillStyle = 'rgba(5,7,12,0.9)';
      g.fillRect(tx, pad.t, tw, 15);
      g.fillStyle = '#e8eaed';
      g.fillText(text, tx + 5, pad.t + 11);
    }
    label.textContent = state.yearRange ? `${state.yearRange[0]} – ${state.yearRange[1]}` : 'ALL YEARS';
  }

  function inRange(year) {
    if (!state.yearRange) return true;
    return year >= state.yearRange[0] && year <= state.yearRange[1];
  }

  canvas.addEventListener('pointerdown', (e) => {
    const w = canvas.getBoundingClientRect().width;
    drag = { start: yearAt(e.offsetX, w) };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone; pointerup/cancel still end the drag */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const w = canvas.getBoundingClientRect().width;
    hoverYear = yearAt(e.offsetX, w);
    if (drag) {
      const a = Math.min(drag.start, hoverYear);
      const b = Math.max(drag.start, hoverYear);
      state.yearRange = [a, b];
    }
    draw();
  });
  canvas.addEventListener('pointerleave', () => {
    hoverYear = null;
    draw();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    update({ yearRange: state.yearRange }, 'yearRange');
  };
  canvas.addEventListener('pointerup', endDrag);
  // A cancelled touch never sends pointerup; without this the brush stayed live.
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('dblclick', () => update({ yearRange: null }, 'yearRange'));
  document.getElementById('tl-play').addEventListener('click', onPlayToggle);
  new ResizeObserver(resize).observe(canvas);

  return {
    setItems(items) {
      bars = new Array(N).fill(0);
      barKinds = new Array(N).fill(null).map(() => ({ case: 0, official: 0, user: 0 }));
      for (const it of items) {
        const i = Math.max(0, Math.min(N - 1, it.year - YEAR_MIN));
        bars[i]++;
        barKinds[i][it.kind]++;
      }
      draw();
    },
    setBlueBook(counts) {
      lines.bluebook = counts;
      draw();
    },
    setGeipan(counts) {
      lines.geipan = counts;
      draw();
    },
    setMufon(counts) {
      lines.mufon = counts;
      draw();
    },
    setJournals(counts) {
      lines.journals = counts;
      draw();
    },
    setNuforc(counts) {
      nuforc = counts;
      draw();
    },
    draw,
    setPlaying(on) {
      document.getElementById('tl-play').textContent = on ? '❚❚' : '▶';
    },
  };
}

export function countByYear(years) {
  const N = YEAR_MAX - YEAR_MIN + 1;
  const out = new Array(N).fill(0);
  for (const y of years) if (y != null) out[Math.max(0, Math.min(N - 1, y - YEAR_MIN))]++;
  return out;
}
