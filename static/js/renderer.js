/**
 * Procedural Canvas 2D Renderer with Dynamic Lighting and Particle Effects.
 */

import { TileType } from "./dungeon.js";

export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tileSize = 36;
    this.floatingTexts = [];
    this.particles = [];
  }

  addFloatingText(text, x, y, color = "#ff4444") {
    this.floatingTexts.push({
      text,
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
      color,
      alpha: 1.0,
      vy: -0.8,
      life: 45,
    });
  }

  addParticles(x, y, color, count = 8) {
    const cx = x * this.tileSize + this.tileSize / 2;
    const cy = y * this.tileSize + this.tileSize / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 2.5;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.02,
      });
    }
  }

  render(dungeon, player, monsters, timestamp = 0) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ts = this.tileSize;

    // Clear background to deepest black
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);

    if (!dungeon || !player) return;

    // Camera offset: Center player on screen
    const camX = Math.floor(w / 2 - player.x * ts - ts / 2);
    const camY = Math.floor(h / 2 - player.y * ts - ts / 2);

    ctx.save();
    ctx.translate(camX, camY);

    // Visible tile bounds in camera
    const minTileX = Math.max(0, Math.floor(-camX / ts) - 1);
    const maxTileX = Math.min(dungeon.width - 1, Math.ceil((w - camX) / ts) + 1);
    const minTileY = Math.max(0, Math.floor(-camY / ts) - 1);
    const maxTileY = Math.min(dungeon.height - 1, Math.ceil((h - camY) / ts) + 1);

    // 1. Draw Map Tiles
    for (let y = minTileY; y <= maxTileY; y++) {
      for (let x = minTileX; x <= maxTileX; x++) {
        if (!dungeon.isExplored(x, y)) {
          // Unexplored: completely black
          ctx.fillStyle = "#000000";
          ctx.fillRect(x * ts, y * ts, ts, ts);
          continue;
        }

        const isVis = dungeon.isVisible(x, y);
        const tile = dungeon.tiles[y][x];

        // Base tile rendering
        this._drawTile(ctx, tile, x, y, ts, isVis);

        // Explored but out of current FOV: shroud in dark blue-gray fog
        if (!isVis) {
          ctx.fillStyle = "rgba(7, 10, 16, 0.72)";
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }

    // 2. Draw Chests & Traps (if visible or explored)
    for (const chest of dungeon.chests) {
      if (dungeon.isExplored(chest.x, chest.y)) {
        this._drawChest(ctx, chest, ts, dungeon.isVisible(chest.x, chest.y));
      }
    }
    for (const trap of dungeon.traps) {
      if (dungeon.isVisible(trap.x, trap.y) && trap.triggered) {
        this._drawTrap(ctx, trap, ts);
      }
    }

    // 3. Draw Monsters (only if in active FOV)
    for (const monster of monsters) {
      if (monster.hp > 0 && dungeon.isVisible(monster.x, monster.y)) {
        this._drawMonster(ctx, monster, ts);
      }
    }

    // 4. Draw Player
    this._drawPlayer(ctx, player, ts);

    // 5. Dynamic Torchlight / Radial Vignette over active FOV
    this._drawTorchlight(ctx, player, ts, timestamp);

    // 6. Draw Particle FX & Floating Damage Numbers
    this._renderParticles(ctx);
    this._renderFloatingTexts(ctx);

    ctx.restore();
  }

  _drawTile(ctx, tile, x, y, ts, isVis) {
    const px = x * ts;
    const py = y * ts;

    if (tile === TileType.WALL) {
      // Beveled stone wall
      ctx.fillStyle = isVis ? "#232936" : "#141822";
      ctx.fillRect(px, py, ts, ts);

      // Brick pattern accents
      ctx.strokeStyle = isVis ? "#363f52" : "#1e2330";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.beginPath();
      ctx.moveTo(px, py + ts / 2);
      ctx.lineTo(px + ts, py + ts / 2);
      ctx.stroke();
    } else if (tile === TileType.FLOOR) {
      // Dungeon stone flagstones
      ctx.fillStyle = isVis ? "#191f28" : "#0d1117";
      ctx.fillRect(px, py, ts, ts);

      ctx.strokeStyle = isVis ? "#242c38" : "#131820";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, ts, ts);
    } else if (tile === TileType.STAIRS_DOWN) {
      // Stone staircase leading downwards
      ctx.fillStyle = "#161b24";
      ctx.fillRect(px, py, ts, ts);

      // Steps
      ctx.fillStyle = isVis ? "#b7791f" : "#593c10";
      for (let s = 0; s < 4; s++) {
        const stepH = (ts / 4) * (s + 1);
        ctx.fillRect(px + s * (ts / 4), py + ts - stepH, ts / 4 - 1, stepH);
      }
    }
  }

  _drawChest(ctx, chest, ts, isVis) {
    const px = chest.x * ts + 6;
    const py = chest.y * ts + 8;
    ctx.fillStyle = chest.opened ? "#4a3b2c" : "#8c5b29";
    ctx.fillRect(px, py, ts - 12, ts - 14);

    // Gold trim
    ctx.fillStyle = isVis ? "#ecc94b" : "#975a16";
    ctx.fillRect(px + 2, py + (ts - 14) / 2 - 2, ts - 16, 4);
    // Keyhole
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(px + (ts - 12) / 2 - 1, py + (ts - 14) / 2 - 1, 2, 3);
  }

  _drawTrap(ctx, trap, ts) {
    const cx = trap.x * ts + ts / 2;
    const cy = trap.y * ts + ts / 2;
    ctx.fillStyle = "#e53e3e";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMonster(ctx, monster, ts) {
    const px = monster.x * ts;
    const py = monster.y * ts;

    // Monster sprite body
    ctx.save();
    if (monster.type === "skeleton") {
      // Pale bone ribs and skull
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      // Glowing red eyes
      ctx.fillStyle = "#ff2222";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 5, 2, 2);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 5, 2, 2);
      // Ribcage
      ctx.strokeStyle = "#cbd5e0";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + ts / 2 - 5, py + ts / 2 + 3, 10, 8);
    } else if (monster.type === "goblin") {
      // Goblin green
      ctx.fillStyle = "#48bb78";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      // Pointy ears
      ctx.fillStyle = "#38a169";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 9, py + ts / 2);
      ctx.lineTo(px + ts / 2 - 14, py + ts / 2 - 6);
      ctx.lineTo(px + ts / 2 - 5, py + ts / 2 - 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 + 9, py + ts / 2);
      ctx.lineTo(px + ts / 2 + 14, py + ts / 2 - 6);
      ctx.lineTo(px + ts / 2 + 5, py + ts / 2 - 4);
      ctx.fill();
    } else if (monster.type === "necromancer") {
      // Dark purple hooded sorcerer
      ctx.fillStyle = "#6b46c1";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 4);
      ctx.lineTo(px + ts - 6, py + ts - 4);
      ctx.lineTo(px + 6, py + ts - 4);
      ctx.closePath();
      ctx.fill();
      // Staff with glowing cyan orb
      ctx.strokeStyle = "#9f7aea";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 4, py + 4);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.stroke();
      ctx.fillStyle = "#00f0ff";
      ctx.beginPath();
      ctx.arc(px + ts - 4, py + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Bat
      ctx.fillStyle = "#718096";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mini health bar above monster
    if (monster.max_hp > 0) {
      const barW = ts - 8;
      const barH = 3;
      const barX = px + 4;
      const barY = py + 2;
      const hpPct = Math.max(0, monster.hp / monster.max_hp);

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.4 ? "#e53e3e" : "#fc8181";
      ctx.fillRect(barX, barY, Math.floor(barW * hpPct), barH);
    }
    ctx.restore();
  }

  _drawPlayer(ctx, player, ts) {
    const px = player.x * ts;
    const py = player.y * ts;

    ctx.save();
    // Knight Paladin: Polished Silver Armor & Gold Trim
    // Helm
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(px + ts / 2, py + ts / 2 - 3, 8, 0, Math.PI * 2);
    ctx.fill();

    // Visor slit
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 4, 8, 2);

    // Body armor
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(px + ts / 2 - 6, py + ts / 2 + 4, 12, 10);

    // Gold trimmed shield on left arm
    ctx.fillStyle = "#d69e2e";
    ctx.beginPath();
    ctx.arc(px + 6, py + ts / 2 + 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3182ce";
    ctx.beginPath();
    ctx.arc(px + 6, py + ts / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Gleaming blade on right arm
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + ts - 6, py + ts / 2 + 8);
    ctx.lineTo(px + ts - 4, py + ts / 2 - 8);
    ctx.stroke();

    ctx.restore();
  }

  _drawTorchlight(ctx, player, ts, timestamp) {
    // Dynamic flickering radial lighting around the hero
    const flicker = Math.sin(timestamp * 0.006) * 6 + Math.cos(timestamp * 0.015) * 4;
    const radius = Math.max(160, 240 + flicker);

    const cx = player.x * ts + ts / 2;
    const cy = player.y * ts + ts / 2;

    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, radius);
    grad.addColorStop(0, "rgba(255, 210, 120, 0.14)");
    grad.addColorStop(0.5, "rgba(230, 150, 40, 0.05)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  _renderParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _renderFloatingTexts(ctx) {
    ctx.save();
    ctx.font = "bold 13px 'SFMono-Regular', Consolas, monospace";
    ctx.textAlign = "center";

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= 1;
      ft.alpha = Math.max(0, ft.life / 45);

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = "#000";
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }
}
