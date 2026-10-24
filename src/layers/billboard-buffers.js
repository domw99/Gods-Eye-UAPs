import * as Cesium from 'cesium';

/**
 * A fixed GPU buffer layout for the big marker layers (NUFORC's 80,000
 * points, Blue Book's 10,000), which change in only two ways once drawn: a
 * filter shows or hides markers, and the horizon distance (how far markers
 * skip the depth test) steps while the camera zooms.
 *
 * Left alone, Cesium answers any changed property by switching the
 * collection's buffers between "static" and "stream" use, which rebuilds them
 * and writes every marker again in full, and on the next frame it switches
 * back and rebuilds them again. For `show` and `disableDepthTestDistance` the
 * rebuilt buffers come out as they were, so that was two full rewrites (some
 * 12 MB of upload each for NUFORC) on every filter change and every horizon
 * step. Here the attributes those two write get buffers of their own and the
 * layout never switches: a filter uploads only the show attributes, a horizon
 * step only the depth-distance one, and nothing is rebuilt unless markers are
 * added or removed.
 *
 * This leans on BillboardCollection internals (`_buffersUsage`,
 * `computeNewBuffersUsage`); tests/billboard-buffers.test.js fails if a Cesium
 * update renames them, and without them the collection simply behaves as
 * before.
 */
export function fixBufferLayout(collection) {
  const usage = collection._buffersUsage;
  if (!Array.isArray(usage) || typeof collection.computeNewBuffersUsage !== 'function') return collection;
  const { Billboard, BufferUsage } = Cesium;
  // `show` is written with the pixel-offset attribute and the eye offset; `disableDepthTestDistance`
  // with the distance-display-condition one. Each usage is a separate GPU buffer.
  usage[Billboard.PIXEL_OFFSET_INDEX] = BufferUsage.STREAM_DRAW;
  usage[Billboard.EYE_OFFSET_INDEX] = BufferUsage.STREAM_DRAW;
  usage[Billboard.DISTANCE_DISPLAY_CONDITION] = BufferUsage.DYNAMIC_DRAW;
  collection.computeNewBuffersUsage = () => false;
  return collection;
}
