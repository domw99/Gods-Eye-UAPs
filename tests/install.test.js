import { describe, it, expect } from 'vitest';
import { detectPlatform, installSteps } from '../src/app/install.js';

const win = (opts = {}) => ({ matchMedia: (q) => ({ matches: (q.includes('standalone') && opts.standalone) || (q.includes('coarse') && opts.coarse) || false }) });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

describe('install as an app', () => {
  it('tells iPhones, Android phones and desktops apart', () => {
    expect(detectPlatform({ userAgent: IPHONE, maxTouchPoints: 5 }, win({ coarse: true }))).toMatchObject({ ios: true, browser: 'safari', phone: true });
    expect(detectPlatform({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 }, win({ coarse: true }))).toMatchObject({ ios: true, browser: 'chrome' });
    expect(detectPlatform({ userAgent: ANDROID, maxTouchPoints: 5 }, win({ coarse: true }))).toMatchObject({ android: true, phone: true });
    expect(detectPlatform({ userAgent: DESKTOP, maxTouchPoints: 0 }, win())).toMatchObject({ ios: false, android: false, phone: false });
  });

  it('treats an iPad that says it is a Mac as an iPad', () => {
    expect(detectPlatform({ userAgent: DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 }, win({ coarse: true })).ios).toBe(true);
  });

  it('knows when it is already running as an installed app', () => {
    expect(detectPlatform({ userAgent: ANDROID, maxTouchPoints: 5 }, win({ standalone: true, coarse: true })).standalone).toBe(true);
    expect(detectPlatform({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }, win({ coarse: true })).standalone).toBe(true);
  });

  it('gives steps for each device', () => {
    const ios = installSteps({ ios: true, browser: 'safari' });
    expect(ios[0]).toMatch(/Share/);
    expect(ios[1]).toMatch(/Add to Home Screen/);
    expect(installSteps({ ios: true, browser: 'chrome' })[1]).toMatch(/Safari/);
    expect(installSteps({ android: true, browser: 'chrome' }).join(' ')).toMatch(/Install app|Add to Home screen/);
    expect(installSteps({}).length).toBe(3);
  });
});
