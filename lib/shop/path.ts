import type { ShopLayout } from "./layout";

/**
 * Finding a way round the bins, for tap-to-walk and "take it to the
 * turntable". A* over a coarse grid of the shop floor, then pulled tight so
 * the walk runs in straight lines between corners rather than stepping cell to
 * cell.
 */

const CELL = 0.2;
/** Clearance kept from anything solid, a little more than the body's radius. */
const CLEARANCE = 0.32;

type Point = { x: number; z: number };

interface Grid {
  columns: number;
  rows: number;
  blocked: Uint8Array;
  toCell: (p: Point) => [number, number];
  toPoint: (column: number, row: number) => Point;
}

function buildGrid(layout: Pick<ShopLayout, "room" | "obstacles">): Grid {
  const { width, depth } = layout.room;
  const columns = Math.ceil(width / CELL);
  const rows = Math.ceil(depth / CELL);
  const blocked = new Uint8Array(columns * rows);

  const toPoint = (column: number, row: number): Point => ({
    x: -width / 2 + (column + 0.5) * CELL,
    z: -depth / 2 + (row + 0.5) * CELL,
  });
  const toCell = (p: Point): [number, number] => [
    Math.min(columns - 1, Math.max(0, Math.floor((p.x + width / 2) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.floor((p.z + depth / 2) / CELL))),
  ];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const { x, z } = toPoint(column, row);
      const nearWall =
        Math.abs(x) > width / 2 - CLEARANCE || Math.abs(z) > depth / 2 - CLEARANCE;
      const inside = layout.obstacles.some(
        (box) =>
          Math.abs(x - box.x) < box.width / 2 + CLEARANCE &&
          Math.abs(z - box.z) < box.depth / 2 + CLEARANCE,
      );
      if (nearWall || inside) blocked[row * columns + column] = 1;
    }
  }

  return { columns, rows, blocked, toCell, toPoint };
}

/** The nearest open cell, for a start or goal that sits just inside a margin. */
function nearestOpen(grid: Grid, column: number, row: number): [number, number] | null {
  for (let radius = 0; radius < 8; radius++) {
    let best: [number, number] | null = null;
    let bestDistance = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const c = column + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
        if (grid.blocked[r * grid.columns + c]) continue;
        const distance = dc * dc + dr * dr;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [c, r];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Whether a straight walk between two points stays on open floor. */
function clear(grid: Grid, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const [c, r] = grid.toCell({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (grid.blocked[r * grid.columns + c]) return false;
  }
  return true;
}

const grids = new WeakMap<object, Grid>();

/**
 * Waypoints from `from` to `to`, not including `from`. Ends exactly at `to`
 * when it is open floor. Null when there is no way there at all.
 */
export function findPath(
  layout: Pick<ShopLayout, "room" | "obstacles">,
  from: Point,
  to: Point,
): Point[] | null {
  let grid = grids.get(layout);
  if (!grid) {
    grid = buildGrid(layout);
    grids.set(layout, grid);
  }
  const g = grid;

  const start = nearestOpen(g, ...g.toCell(from));
  const goal = nearestOpen(g, ...g.toCell(to));
  if (!start || !goal) return null;

  const index = (c: number, r: number) => r * g.columns + c;
  const startIndex = index(...start);
  const goalIndex = index(...goal);

  const cost = new Float32Array(g.columns * g.rows).fill(Infinity);
  const came = new Int32Array(g.columns * g.rows).fill(-1);
  const closed = new Uint8Array(g.columns * g.rows);
  const heuristic = (i: number) =>
    Math.hypot((i % g.columns) - goal[0], Math.floor(i / g.columns) - goal[1]);

  // A small binary heap keyed on estimated total cost.
  const heap: [number, number][] = [];
  const push = (priority: number, i: number) => {
    heap.push([priority, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heap[parent][0] <= heap[k][0]) break;
      [heap[parent], heap[k]] = [heap[k], heap[parent]];
      k = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };

  cost[startIndex] = 0;
  push(heuristic(startIndex), startIndex);

  while (heap.length) {
    const [, current] = pop();
    if (current === goalIndex) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const c = current % g.columns;
    const r = Math.floor(current / g.columns);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= g.columns || nr >= g.rows) continue;
        const next = index(nc, nr);
        if (g.blocked[next] || closed[next]) continue;
        // No cutting a corner between two blocked cells.
        if (dr && dc && (g.blocked[index(c + dc, r)] || g.blocked[index(c, r + dr)])) continue;
        const step = dr && dc ? Math.SQRT2 : 1;
        if (cost[current] + step < cost[next]) {
          cost[next] = cost[current] + step;
          came[next] = current;
          push(cost[next] + heuristic(next), next);
        }
      }
    }
  }

  if (startIndex !== goalIndex && came[goalIndex] === -1) return null;

  const cells: Point[] = [];
  for (let i = goalIndex; i !== -1 && i !== startIndex; i = came[i]) {
    cells.push(g.toPoint(i % g.columns, Math.floor(i / g.columns)));
  }
  cells.reverse();

  const end = clear(g, cells.at(-1) ?? from, to) ? to : cells.at(-1) ?? from;
  const raw = [...cells.slice(0, -1), end];

  // Pull the string tight: skip every waypoint you can see past.
  const path: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < raw.length) {
    let furthest = i;
    for (let j = raw.length - 1; j > i; j--) {
      if (clear(g, anchor, raw[j])) {
        furthest = j;
        break;
      }
    }
    path.push(raw[furthest]);
    anchor = raw[furthest];
    i = furthest + 1;
  }
  return path;
}
