import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as Cesium from 'cesium';
import { fixBufferLayout } from '../src/layers/billboard-buffers.js';

const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve('@cesium/engine/Source/Scene/BillboardCollection.js'), 'utf8');

/** Which property's usage decides the buffer an attribute goes in, as Cesium's createVAF says. */
function usageOf(attribute) {
  const m = source.match(new RegExp(`index: attributeLocations\\.${attribute},[^}]*?usage: buffersUsage\\[(\\w+)\\]`, 's'));
  return m?.[1];
}

describe('fixed buffer layout for the big marker layers', () => {
  it('gives the show and depth-distance attributes buffers of their own and never switches', () => {
    const c = fixBufferLayout(new Cesium.BillboardCollection());
    const u = c._buffersUsage;
    expect(u[Cesium.Billboard.PIXEL_OFFSET_INDEX]).toBe(Cesium.BufferUsage.STREAM_DRAW);
    expect(u[Cesium.Billboard.EYE_OFFSET_INDEX]).toBe(Cesium.BufferUsage.STREAM_DRAW);
    expect(u[Cesium.Billboard.DISTANCE_DISPLAY_CONDITION]).toBe(Cesium.BufferUsage.DYNAMIC_DRAW);
    expect(u[Cesium.Billboard.POSITION_INDEX]).toBe(Cesium.BufferUsage.STATIC_DRAW);
    c.add({ position: Cesium.Cartesian3.fromDegrees(0, 0) }).show = false;
    expect(c.computeNewBuffersUsage()).toBe(false);
  });

  it('still matches the Cesium internals it relies on', () => {
    // A Cesium update that renames these would quietly bring the full rewrites back.
    expect(Array.isArray(new Cesium.BillboardCollection()._buffersUsage)).toBe(true);
    expect(typeof Cesium.BillboardCollection.prototype.computeNewBuffersUsage).toBe('function');
    // `show` is written into compressedAttribute0 and eyeOffset, `disableDepthTestDistance` into compressedAttribute3.
    expect(source).toMatch(/properties\[SHOW_INDEX\]\s*\)\s*\{\s*writers\.push\(writeCompressedAttrib0\);\s*writers\.push\(writeEyeOffset\);/);
    expect(source).toMatch(/properties\[DISABLE_DEPTH_DISTANCE\][\s\S]{0,200}writers\.push\(writeCompressedAttribute3\)/);
    expect(usageOf('compressedAttribute0')).toBe('PIXEL_OFFSET_INDEX');
    expect(usageOf('eyeOffset')).toBe('EYE_OFFSET_INDEX');
    expect(usageOf('compressedAttribute3')).toBe('DISTANCE_DISPLAY_CONDITION_INDEX');
    expect(source).toMatch(/const DISTANCE_DISPLAY_CONDITION_INDEX\s*=\s*Billboard\.DISTANCE_DISPLAY_CONDITION;/);
  });

  it('leaves a collection without those internals as it was', () => {
    const plain = { computeNewBuffersUsage: () => true };
    expect(fixBufferLayout(plain).computeNewBuffersUsage()).toBe(true);
  });
});
