/**
 * Procedural Canvas 2D Renderer with Dynamic Lighting, Particle Effects,
 * Animated Sconces, Slash/Spell FX, and Radar Minimap.
 */

import { TileType } from "./dungeon.js";

export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tileSize = 38;
    this.floatingTexts = [];
    this.particles = [];
    this.slashes = [];
    this.projectiles = [];
  }

  addFloatingText(text, x, y, color = "#ff4444") {
    this.floatingTexts.push({
      text,
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
      color,
      alpha: 1.0,
      vy: -0.75,
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

  addSlash(x, y) {
    this.slashes.push({
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
      life: 14,
      maxLife: 14,
    });
  }

  addProjectile(startX, startY, targetX, targetY, color = "#f6ad55") {
    this.projectiles.push({
      sx: startX * this.tileSize + this.tileSize / 2,
      sy: startY * this.tileSize + this.tileSize / 2,
      tx: targetX * this.tileSize + this.tileSize / 2,
      ty: targetY * this.tileSize + this.tileSize / 2,
      color,
      progress: 0,
      speed: 0.09,
    });
  }

  render(dungeon, player, monsters, timestamp = 0) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ts = this.tileSize;

    // Clear background to deepest catacomb black
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
          ctx.fillStyle = "#000000";
          ctx.fillRect(x * ts, y * ts, ts, ts);
          continue;
        }

        const isVis = dungeon.isVisible(x, y);
        const tile = dungeon.tiles[y][x];

        this._drawTile(ctx, tile, x, y, ts, isVis, timestamp);

        if (!isVis) {
          ctx.fillStyle = "rgba(7, 10, 16, 0.72)";
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }

    // 2. Draw Interactive Dungeon Props
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
    for (const shrine of (dungeon.shrines || [])) {
      if (dungeon.isExplored(shrine.x, shrine.y)) {
        this._drawShrine(ctx, shrine, ts, timestamp, dungeon.isVisible(shrine.x, shrine.y));
      }
    }
    for (const urn of (dungeon.urns || [])) {
      if (dungeon.isExplored(urn.x, urn.y)) {
        this._drawUrn(ctx, urn, ts, dungeon.isVisible(urn.x, urn.y));
      }
    }
    for (const sconce of (dungeon.sconces || [])) {
      if (dungeon.isVisible(sconce.x, sconce.y)) {
        this._drawSconce(ctx, sconce, ts, timestamp);
      }
    }

    // 3. Draw Monsters (only if in active FOV)
    for (const monster of monsters) {
      if (monster.hp > 0 && dungeon.isVisible(monster.x, monster.y)) {
        this._drawMonster(ctx, monster, ts, timestamp);
      }
    }

    // 4. Draw Player
    this._drawPlayer(ctx, player, ts, timestamp);

    // 5. Dynamic Torchlight / Radial Lighting
    this._drawTorchlight(ctx, player, ts, timestamp);

    // 6. Draw Visual FX (Slashes, Projectiles, Particles, Floating Text)
    this._renderSlashes(ctx);
    this._renderProjectiles(ctx);
    this._renderParticles(ctx);
    this._renderFloatingTexts(ctx);

    ctx.restore();

    // 7. Render Radar Minimap in top-right HUD
    this._drawMinimap(ctx, dungeon, player, monsters);
  }

  _drawTile(ctx, tile, x, y, ts, isVis, timestamp) {
    const px = x * ts;
    const py = y * ts;

    if (tile === TileType.WALL) {
      // Beveled stone wall with brick patterns
      ctx.fillStyle = isVis ? "#232936" : "#141822";
      ctx.fillRect(px, py, ts, ts);

      ctx.strokeStyle = isVis ? "#363f52" : "#1e2330";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.beginPath();
      ctx.moveTo(px, py + ts / 2);
      ctx.lineTo(px + ts, py + ts / 2);
      ctx.stroke();

      // Moss creeping up some walls
      if ((x * 7 + y * 13) % 5 === 0) {
        ctx.fillStyle = isVis ? "#2f4838" : "#1b2820";
        ctx.fillRect(px + 2, py + ts - 5, ts - 4, 3);
      }
    } else if (tile === TileType.FLOOR || tile === TileType.CHEST || tile === TileType.TRAP || tile === TileType.SHRINE || tile === TileType.URN) {
      // Alternating flagstones
      const altColor = (x + y) % 2 === 0;
      ctx.fillStyle = isVis ? (altColor ? "#191f28" : "#151b24") : "#0d1117";
      ctx.fillRect(px, py, ts, ts);

      ctx.strokeStyle = isVis ? "#242c38" : "#131820";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, ts, ts);

      // Random ancient bone / skull scatter on occasional tiles
      if ((x * 11 + y * 17) % 9 === 0 && tile === TileType.FLOOR) {
        ctx.fillStyle = isVis ? "#4a5568" : "#2d3748";
        ctx.beginPath();
        ctx.arc(px + 8, py + 8, 2, 0, Math.PI * 2);
        ctx.arc(px + 12, py + 9, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tile === TileType.STAIRS_DOWN) {
      ctx.fillStyle = "#161b24";
      ctx.fillRect(px, py, ts, ts);

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

    ctx.fillStyle = isVis ? "#ecc94b" : "#975a16";
    ctx.fillRect(px + 2, py + (ts - 14) / 2 - 2, ts - 16, 4);
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

  _drawShrine(ctx, shrine, ts, timestamp, isVis) {
    const px = shrine.x * ts + 4;
    const py = shrine.y * ts + 4;
    const size = ts - 8;

    // Altar stone pedestal
    ctx.fillStyle = isVis ? "#2d3748" : "#1a202c";
    ctx.fillRect(px + 2, py + size - 6, size - 4, 6);
    ctx.fillRect(px + 4, py + 6, size - 8, size - 12);

    // Glowing mystical glyph on top
    if (!shrine.activated && isVis) {
      const pulse = Math.sin(timestamp * 0.006) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(56, 178, 172, ${pulse})`;
      ctx.beginPath();
      ctx.arc(px + size / 2, py + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (shrine.activated) {
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(px + size / 2 - 2, py + 4, 4, 4);
    }
  }

  _drawUrn(ctx, urn, ts, isVis) {
    const cx = urn.x * ts + ts / 2;
    const cy = urn.y * ts + ts / 2;

    if (urn.broken) {
      ctx.fillStyle = isVis ? "#744210" : "#3d2208";
      ctx.fillRect(cx - 5, cy + 2, 4, 2);
      ctx.fillRect(cx + 2, cy + 3, 3, 2);
      return;
    }

    // Terra-cotta urn body
    ctx.fillStyle = isVis ? "#9c4221" : "#4a1e0d";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gold rim
    ctx.fillStyle = isVis ? "#ecc94b" : "#744210";
    ctx.fillRect(cx - 5, cy - 8, 10, 2);
  }

  _drawSconce(ctx, sconce, ts, timestamp) {
    const cx = sconce.x * ts + ts / 2;
    const cy = sconce.y * ts + ts - 4;

    // Iron wall sconce bracket
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Flickering torch fire
    const flameH = 6 + Math.sin(timestamp * 0.02 + sconce.x) * 2;
    ctx.fillStyle = "#dd6b20";
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 6);
    ctx.lineTo(cx, cy - 6 - flameH);
    ctx.lineTo(cx + 3, cy - 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ecc94b";
    ctx.beginPath();
    ctx.arc(cx, cy - 7, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMonster(ctx, monster, ts, timestamp) {
    const px = monster.x * ts;
    const py = monster.y * ts;
    const bob = Math.sin(timestamp * 0.005 + monster.x * 2) * 2;

    ctx.save();
    ctx.translate(0, bob);

    if (monster.type === "boss_lich") {
      // Arch-Lich Boss: Majestic dark royal sorcerer
      ctx.fillStyle = "#44337a";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 4);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.lineTo(px + 4, py + ts - 2);
      ctx.closePath();
      ctx.fill();

      // Jagged Golden Crown
      ctx.fillStyle = "#d69e2e";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 8, py + 2);
      ctx.lineTo(px + ts / 2 - 5, py - 4);
      ctx.lineTo(px + ts / 2, py - 1);
      ctx.lineTo(px + ts / 2 + 5, py - 4);
      ctx.lineTo(px + ts / 2 + 8, py + 2);
      ctx.fill();

      // Floating skull face with glowing violet eyes
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b794f4";
      ctx.fillRect(px + ts / 2 - 3, py + 8, 2, 2);
      ctx.fillRect(px + ts / 2 + 1, py + 8, 2, 2);

      // Orbiting soul orb
      const orbAngle = timestamp * 0.004;
      const orbX = px + ts / 2 + Math.cos(orbAngle) * 16;
      const orbY = py + ts / 2 + Math.sin(orbAngle) * 12;
      ctx.fillStyle = "#9f7aea";
      ctx.beginPath();
      ctx.arc(orbX, orbY, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.type === "skeleton") {
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff2222";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 5, 2, 2);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 5, 2, 2);
      ctx.strokeStyle = "#cbd5e0";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + ts / 2 - 5, py + ts / 2 + 3, 10, 8);
    } else if (monster.type === "spider") {
      // Venomous Brood Spider
      ctx.fillStyle = "#2d3748";
      ctx.beginPath();
      ctx.ellipse(px + ts / 2, py + ts / 2, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glowing green eyes
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 - 4, 2, 2);
      ctx.fillRect(px + ts / 2 + 1, py + ts / 2 - 4, 2, 2);
      // Legs
      ctx.strokeStyle = "#4a5568";
      ctx.lineWidth = 1.5;
      [-5, -2, 2, 5].forEach((offset) => {
        ctx.beginPath();
        ctx.moveTo(px + ts / 2 + offset, py + ts / 2);
        ctx.lineTo(px + ts / 2 + offset * 2.2, py + ts / 2 - 5);
        ctx.stroke();
      });
    } else if (monster.type === "goblin") {
      ctx.fillStyle = "#48bb78";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, 8, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.fillStyle = "#6b46c1";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 4);
      ctx.lineTo(px + ts - 6, py + ts - 4);
      ctx.lineTo(px + 6, py + ts - 4);
      ctx.closePath();
      ctx.fill();
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
      ctx.fillStyle = "#718096";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Status effect visuals
    if (monster.status_effects && monster.status_effects.stun) {
      ctx.fillStyle = "#ecc94b";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("💫", px + ts / 2 - 5, py - 2);
    }
    if (monster.status_effects && monster.status_effects.burn) {
      ctx.fillStyle = "#dd6b20";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("🔥", px + 2, py + ts / 2);
    }

    // Health bar above monster
    if (monster.max_hp > 0) {
      const barW = ts - 8;
      const barH = monster.is_boss ? 5 : 3;
      const barX = px + 4;
      const barY = py + 2;
      const hpPct = Math.max(0, monster.hp / monster.max_hp);

      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = monster.is_boss ? "#9f7aea" : (hpPct > 0.4 ? "#e53e3e" : "#fc8181");
      ctx.fillRect(barX, barY, Math.floor(barW * hpPct), barH);
    }
    ctx.restore();
  }

  _drawPlayer(ctx, player, ts, timestamp) {
    const px = player.x * ts;
    const py = player.y * ts;
    const bob = Math.sin(timestamp * 0.005) * 1.5;

    ctx.save();
    ctx.translate(0, bob);

    // Shield Wall Aura (Golden defensive barrier)
    if (player.status_effects && player.status_effects.shield_wall) {
      ctx.strokeStyle = "rgba(236, 201, 75, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, ts / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Knight Paladin Armor
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

    // Shield on left arm
    ctx.fillStyle = "#d69e2e";
    ctx.beginPath();
    ctx.arc(px + 6, py + ts / 2 + 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3182ce";
    ctx.beginPath();
    ctx.arc(px + 6, py + ts / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Sword on right arm
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + ts - 6, py + ts / 2 + 8);
    ctx.lineTo(px + ts - 4, py + ts / 2 - 8);
    ctx.stroke();

    // Poison / Might status indicators on player
    if (player.status_effects && player.status_effects.poison) {
      ctx.fillStyle = "#48bb78";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("🧪", px + ts - 8, py);
    }
    if (player.status_effects && player.status_effects.might) {
      ctx.fillStyle = "#e53e3e";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("⚔️", px, py);
    }

    ctx.restore();
  }

  _drawTorchlight(ctx, player, ts, timestamp) {
    const flicker = Math.sin(timestamp * 0.006) * 6 + Math.cos(timestamp * 0.015) * 4;
    const radius = Math.max(160, 240 + flicker);

    const cx = player.x * ts + ts / 2;
    const cy = player.y * ts + ts / 2;

    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, radius);
    grad.addColorStop(0, "rgba(255, 210, 120, 0.15)");
    grad.addColorStop(0.5, "rgba(230, 150, 40, 0.05)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  _renderSlashes(ctx) {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= 1;
      if (s.life <= 0) {
        this.slashes.splice(i, 1);
        continue;
      }

      const progress = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 240, 200, ${1 - progress})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14, -Math.PI / 4, Math.PI / 4 + progress * Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  _renderProjectiles(ctx) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += p.speed;

      const currX = p.sx + (p.tx - p.sx) * p.progress;
      const currY = p.sy + (p.ty - p.sy) * p.progress;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(currX, currY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p.progress >= 1.0) {
        this.projectiles.splice(i, 1);
      }
    }
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

  _drawMinimap(ctx, dungeon, player, monsters) {
    const mw = 100;
    const mh = 70;
    const mx = this.canvas.width - mw - 10;
    const my = 10;

    // Minimap border container
    ctx.save();
    ctx.fillStyle = "rgba(10, 14, 20, 0.75)";
    ctx.strokeStyle = "#c89b3c";
    ctx.lineWidth = 1;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);

    const scaleX = mw / dungeon.width;
    const scaleY = mh / dungeon.height;

    // Explored tiles
    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        if (!dungeon.isExplored(x, y)) continue;
        const tile = dungeon.tiles[y][x];
        if (tile === TileType.FLOOR || tile === TileType.STAIRS_DOWN || tile === TileType.CHEST) {
          ctx.fillStyle = tile === TileType.STAIRS_DOWN ? "#ecc94b" : "#2d3748";
          ctx.fillRect(mx + x * scaleX, my + y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
        }
      }
    }

    // Visible monsters
    ctx.fillStyle = "#e53e3e";
    for (const m of monsters) {
      if (m.hp > 0 && dungeon.isVisible(m.x, m.y)) {
        ctx.fillRect(mx + m.x * scaleX, my + m.y * scaleY, 2, 2);
      }
    }

    // Player blip
    ctx.fillStyle = "#48bb78";
    ctx.fillRect(mx + player.x * scaleX - 1, my + player.y * scaleY - 1, 3, 3);

    ctx.restore();
  }
}
