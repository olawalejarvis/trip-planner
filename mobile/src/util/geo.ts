import type { LngLat } from "@maplibre/maplibre-react-native";

function squaredDistance(a: LngLat, b: LngLat): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function nearestIndex(shape: LngLat[], point: LngLat): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d = squaredDistance(shape[i], point);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** A route's full GTFS shape covers its whole run, not just one rider's leg.
 * Snaps the board/alight points to their nearest shape vertices and slices
 * between them, so the map only highlights the segment actually ridden.
 * The sliced ends are then replaced with the exact board/alight coordinates
 * (shape vertices are sampled along the road, not necessarily at the stop
 * itself) so the line visibly starts and ends right at the real stops,
 * always ordered board -> alight regardless of the shape's own direction. */
export function trimShapeToSegment(shape: LngLat[], boardPoint: LngLat, alightPoint: LngLat): LngLat[] {
  if (shape.length < 2) return [boardPoint, alightPoint];

  const boardIdx = nearestIndex(shape, boardPoint);
  const alightIdx = nearestIndex(shape, alightPoint);
  const forward = boardIdx <= alightIdx;
  const [startIdx, endIdx] = forward ? [boardIdx, alightIdx] : [alightIdx, boardIdx];

  const segment = shape.slice(startIdx, endIdx + 1);
  if (!forward) segment.reverse();
  if (segment.length < 2) return [boardPoint, alightPoint];

  segment[0] = boardPoint;
  segment[segment.length - 1] = alightPoint;
  return segment;
}
