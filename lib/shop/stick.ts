/** Pixels from where the thumb landed to full deflection, as in musicmaze. */
export const STICK_RANGE = 56;

/**
 * A floating thumb stick: its centre is wherever the thumb first landed, and
 * the deflection is clamped to the unit circle.
 */
export function stickVector(
  origin: { x: number; y: number },
  point: { x: number; y: number },
  range = STICK_RANGE,
): { x: number; y: number } {
  const dx = (point.x - origin.x) / range;
  const dy = (point.y - origin.y) / range;
  const length = Math.hypot(dx, dy);
  const scale = length > 1 ? 1 / length : 1;
  return { x: dx * scale, y: dy * scale };
}
