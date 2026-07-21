export type PixelPoint = { x: number; y: number };

type TraceOptions = {
  seedX: number;
  seedY: number;
  tolerance: number;
  minimumPixels?: number;
  simplifyTolerance?: number;
};

const key = (x: number, y: number) => `${x},${y}`;

function colorDistance(data: Uint8ClampedArray, offset: number, seed: number[]) {
  const red = data[offset] - seed[0];
  const green = data[offset + 1] - seed[1];
  const blue = data[offset + 2] - seed[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function perpendicularDistance(point: PixelPoint, start: PixelPoint, end: PixelPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  return Math.abs(
    dy * point.x - dx * point.y + end.x * start.y - end.y * start.x
  ) / Math.hypot(dx, dy);
}

function simplify(points: PixelPoint[], tolerance: number): PixelPoint[] {
  if (points.length <= 3) return points;

  let furthestDistance = 0;
  let furthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }

  if (furthestDistance <= tolerance) {
    return [points[0], points[points.length - 1]];
  }

  const left = simplify(points.slice(0, furthestIndex + 1), tolerance);
  const right = simplify(points.slice(furthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function traceBoundary(mask: Uint8Array, width: number, height: number) {
  const edges = new Map<string, PixelPoint[]>();
  const addEdge = (from: PixelPoint, to: PixelPoint) => {
    const start = key(from.x, from.y);
    edges.set(start, [...(edges.get(start) ?? []), to]);
  };
  const selected = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!selected(x, y)) continue;
      if (!selected(x, y - 1)) addEdge({ x, y }, { x: x + 1, y });
      if (!selected(x + 1, y)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!selected(x, y + 1)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!selected(x - 1, y)) addEdge({ x, y: y + 1 }, { x, y });
    }
  }

  const loops: PixelPoint[][] = [];
  while (edges.size > 0) {
    const firstEntry = edges.entries().next().value as [string, PixelPoint[]] | undefined;
    if (!firstEntry) break;
    const [startKey] = firstEntry;
    const [startX, startY] = startKey.split(',').map(Number);
    const start = { x: startX, y: startY };
    const loop = [start];
    let currentKey = startKey;
    let guard = 0;

    while (guard < width * height * 4) {
      guard += 1;
      const destinations = edges.get(currentKey);
      if (!destinations?.length) break;
      const next = destinations.pop()!;
      if (destinations.length === 0) edges.delete(currentKey);
      currentKey = key(next.x, next.y);
      if (currentKey === startKey) break;
      loop.push(next);
    }
    if (loop.length >= 4) loops.push(loop);
  }

  return loops.sort((a, b) => b.length - a.length)[0] ?? [];
}

export function magicTrace(image: ImageData, options: TraceOptions): PixelPoint[] {
  const { width, height, data } = image;
  const seedX = Math.max(0, Math.min(width - 1, Math.round(options.seedX)));
  const seedY = Math.max(0, Math.min(height - 1, Math.round(options.seedY)));
  const seedOffset = (seedY * width + seedX) * 4;
  const seed = [
    data[seedOffset],
    data[seedOffset + 1],
    data[seedOffset + 2],
  ];
  const mask = new Uint8Array(width * height);
  const queued = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 1;
  let selectedPixels = 0;
  queueX[0] = seedX;
  queueY[0] = seedY;
  queued[seedY * width + seedX] = 1;

  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;
    const index = y * width + x;
    const offset = index * 4;
    if (data[offset + 3] === 0 || colorDistance(data, offset, seed) > options.tolerance) {
      continue;
    }

    mask[index] = 1;
    selectedPixels += 1;
    const neighbours = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nextX, nextY] of neighbours) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const nextIndex = nextY * width + nextX;
      if (queued[nextIndex]) continue;
      queued[nextIndex] = 1;
      queueX[tail] = nextX;
      queueY[tail] = nextY;
      tail += 1;
    }
  }

  if (selectedPixels < (options.minimumPixels ?? 20)) return [];
  const boundary = traceBoundary(mask, width, height);
  if (boundary.length < 4) return [];

  const closed = [...boundary, boundary[0]];
  const simplified = simplify(closed, options.simplifyTolerance ?? 2);
  return simplified.slice(0, -1);
}
