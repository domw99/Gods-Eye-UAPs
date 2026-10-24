import * as Cesium from 'cesium';

/*
 * Cesium answers any changed marker property by switching the collection's GPU
 * buffers between "static" and "stream" use, which rebuilds them and writes
 * every marker again in full, and on the next frame (nothing changed any more)
 * it switches back and rebuilds them again. So one change cost two full
 * rebuilds: on every filter change and every horizon step for NUFORC's 80,000
 * points (some 12 MB of upload each), and on every regrouping or label change
 * while the camera moves for the case labels' 3,500 letters. The usage switch
 * is only a hint to the driver; the markers draw the same without it.
 *
 * This leans on collection internals (`computeNewBuffersUsage`,
 * `_buffersUsage`); tests/billboard-buffers.test.js fails if a Cesium update
 * renames them or changes how they are used, and without them the collections
 * simply behave as before.
 */

/** Stop every billboard collection (markers, labels' letters) and point collection from switching buffer use. */
export function keepBuffersInPlace(C = Cesium) {
  for (const Collection of [C.BillboardCollection, C.PointPrimitiveCollection]) {
    if (typeof Collection?.prototype?.computeNewBuffersUsage === 'function') Collection.prototype.computeNewBuffersUsage = () => false;
  }
}

/**
 * A fixed buffer layout for the big marker layers, which change in only two
 * ways once drawn: a filter shows or hides markers, and the horizon distance
 * (how far markers skip the depth test) steps while the camera zooms. The
 * attributes those two write get buffers of their own, so a filter uploads
 * only the show attributes and a horizon step only the depth-distance one,
 * instead of every attribute of every marker.
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
