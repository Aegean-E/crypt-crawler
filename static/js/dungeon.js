/**
 * Client Dungeon Model and Fog-of-War Management.
 */

export const TileType = {
  WALL: 0,
  FLOOR: 1,
  DOOR_CLOSED: 2,
  DOOR_OPEN: 3,
  STAIRS_DOWN: 4,
  CHEST: 5,
  TRAP: 6,
  SHRINE: 7,
  URN: 8,
  MERCHANT: 9,
  SOUL: 10,
  SIGIL: 11,
  VAULT: 12,
  PACT: 13,
};

export function mimicChestIndex(seed, depth, chestCount) {
  if (!chestCount) return -1;
  let hash = (Number(seed) >>> 0) ^ Math.imul(Number(depth) || 1, 0x9e3779b1) ^ 0x6d2b79f5;
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  if (hash % 4 !== 0) return -1;
  return hash % chestCount;
}

export class ClientDungeon {
  constructor(data) {
    this.width = data.width;
    this.height = data.height;
    this.seed = data.seed;
    this.depth = data.depth || 1;
    this.biome = data.biome || (this.depth <= 1 ? "crypt" : (this.depth === 2 ? "cavern" : "inferno"));
    this.tiles = data.tiles;
    this.playerSpawn = data.player_spawn;
    this.stairsPos = data.stairs_pos;
    this.rooms = data.rooms || [];
    const point = (entry) => (Array.isArray(entry)
      ? { x: entry[0], y: entry[1] }
      : { x: entry.x, y: entry.y });
    this.chests = (data.chests || []).map((c) => ({
      ...point(c),
      opened: Array.isArray(c) ? false : Boolean(c.opened),
    }));
    this.mimics = new Set();
    const mimicIndex = mimicChestIndex(this.seed, this.depth, this.chests.length);
    if (mimicIndex >= 0) {
      const mimicChest = this.chests[mimicIndex];
      if (mimicChest && !mimicChest.opened) {
        this.mimics.add(`${mimicChest.x},${mimicChest.y}`);
      }
    }
    this.traps = (data.traps || []).map((t) => ({
      ...point(t),
      triggered: Array.isArray(t) ? false : Boolean(t.triggered),
      discovered: Array.isArray(t) ? false : Boolean(t.discovered),
    }));
    this.shrines = (data.shrines || []).map((s) => ({
      ...point(s),
      activated: Array.isArray(s) ? false : Boolean(s.activated),
    }));
    this.urns = (data.urns || []).map((u) => ({
      ...point(u),
      broken: Array.isArray(u) ? false : Boolean(u.broken),
    }));
    this.souls = (data.souls || []).map((s) => ({
      ...point(s),
      resolved: Array.isArray(s) ? false : Boolean(s.resolved),
    }));
    this.sigils = (data.sigils || []).map((s) => ({
      ...point(s),
      collected: Array.isArray(s) ? false : Boolean(s.collected),
    }));
    this.vault = data.vault
      ? { ...point(data.vault), opened: Array.isArray(data.vault) ? false : Boolean(data.vault.opened) }
      : null;
    this.pacts = (data.pacts || []).map((p) => ({
      ...point(p),
      used: Array.isArray(p) ? false : Boolean(p.used),
    }));
    this.sigilsHeld = 0;
    this.sconces = (data.sconces || []).map(point);
    this.merchants = (data.merchants || []).map(point);

    // Fog of War: explored (2D boolean array) and visible (Set of "x,y" keys)
    this.explored = Array.from({ length: this.height }, () =>
      Array(this.width).fill(false)
    );
    this.visible = new Set();
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const tile = this.tiles[y][x];
    return tile !== TileType.WALL && tile !== TileType.DOOR_CLOSED;
  }

  isTransparent(x, y) {
    if (!this.inBounds(x, y)) return false;
    const tile = this.tiles[y][x];
    return tile !== TileType.WALL && tile !== TileType.DOOR_CLOSED;
  }

  updateFOV(px, py, radius = 7) {
    this.visible.clear();
    this.visible.add(`${px},${py}`);
    this.explored[py][px] = true;

    const numRays = Math.max(72, radius * 16);
    for (let i = 0; i < numRays; i++) {
      const angle = (2 * Math.PI * i) / numRays;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      let cx = px + 0.5;
      let cy = py + 0.5;

      for (let r = 1; r <= radius; r++) {
        cx += dx;
        cy += dy;
        const tx = Math.floor(cx);
        const ty = Math.floor(cy);

        if (!this.inBounds(tx, ty)) break;

        const distSq = (tx - px) * (tx - px) + (ty - py) * (ty - py);
        if (distSq <= radius * radius) {
          this.visible.add(`${tx},${ty}`);
          this.explored[ty][tx] = true;
        }

        if (!this.isTransparent(tx, ty)) {
          break;
        }
      }
    }
  }

  isVisible(x, y) {
    return this.visible.has(`${x},${y}`);
  }

  isExplored(x, y) {
    return this.inBounds(x, y) && this.explored[y][x];
  }

  findPath(start, goal) {
    const [sx, sy] = start;
    const [gx, gy] = goal;
    if (sx === gx && sy === gy) return [[sx, sy]];

    const queue = [[sx, sy]];
    const cameFrom = new Map();
    cameFrom.set(`${sx},${sy}`, null);

    const dirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      if (cx === gx && cy === gy) {
        const path = [];
        let curr = `${gx},${gy}`;
        while (curr) {
          const [px, py] = curr.split(",").map(Number);
          path.unshift([px, py]);
          curr = cameFrom.get(curr);
        }
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (!cameFrom.has(key) && this.inBounds(nx, ny) && (this.isWalkable(nx, ny) || (nx === gx && ny === gy))) {
          cameFrom.set(key, `${cx},${cy}`);
          queue.push([nx, ny]);
        }
      }
    }
    return null;
  }
}
