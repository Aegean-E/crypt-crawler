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
};

export class ClientDungeon {
  constructor(data) {
    this.width = data.width;
    this.height = data.height;
    this.seed = data.seed;
    this.depth = data.depth || 1;
    this.tiles = data.tiles;
    this.playerSpawn = data.player_spawn;
    this.stairsPos = data.stairs_pos;
    this.rooms = data.rooms || [];
    this.chests = (data.chests || []).map((c) => ({ x: c[0], y: c[1], opened: false }));
    this.traps = (data.traps || []).map((t) => ({ x: t[0], y: t[1], triggered: false }));

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
    return tile !== TileType.WALL;
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
}
