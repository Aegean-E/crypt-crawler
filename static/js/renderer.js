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
    this.shockwaves = [];
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeStartTime = 0;
    this.hoverTile = null;
  }

  addJackpotExplosion(x, y) {
    const cx = x * this.tileSize + this.tileSize / 2;
    const cy = y * this.tileSize + this.tileSize / 2;
    for (let i = 0; i < 36; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.5;
      const isCoin = Math.random() < 0.6;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        color: isCoin ? "#ecc94b" : (Math.random() < 0.5 ? "#f6ad55" : "#fff"),
        size: isCoin ? 3.5 : 2,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.01,
        gravity: 0.08,
      });
    }
  }

  addLevelUpCelebration(x, y, level) {
    const cx = x * this.tileSize + this.tileSize / 2;
    const cy = y * this.tileSize + this.tileSize / 2;
    const colors = ["#ecc94b", "#f6ad55", "#63b3ed", "#b794f4", "#ffffff"];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.0;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        color: colors[i % colors.length],
        size: 3 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.018 + Math.random() * 0.012,
        gravity: 0.09,
      });
    }
    this.addShockwave(x, y, "#ecc94b", 120);
    this.addShockwave(x, y, "#63b3ed", 85);
    this.addFloatingText(`⭐ LEVEL UP! (Lvl ${level}) ⭐`, x, y - 0.7, "#ecc94b");
    this.shake(5, 250);
  }

  addFloatingItemBadge(name, rarity, x, y) {
    let color = "#cbd5e0";
    if (rarity === "rare") color = "#63b3ed";
    else if (rarity === "epic") color = "#b794f4";
    else if (rarity === "legendary") color = "#f6e05e";
    this.addFloatingText(`📦 ${name}`, x, y - 0.5, color);
  }

  addShockwave(x, y, color = "#9f7aea", maxRadius = 90) {
    this.shockwaves.push({
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
      radius: 4,
      maxRadius,
      color,
      alpha: 0.95,
    });
  }

  shake(intensity = 6, duration = 200) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeStartTime = performance.now();
  }

  setHoverTile(x, y) {
    if (x === null || y === null || x === undefined || y === undefined) {
      this.hoverTile = null;
    } else {
      this.hoverTile = { x, y };
    }
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

    // Camera shake calculation
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeDuration > 0) {
      const elapsed = performance.now() - this.shakeStartTime;
      if (elapsed < this.shakeDuration) {
        const decay = 1.0 - elapsed / this.shakeDuration;
        shakeX = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
        shakeY = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
      } else {
        this.shakeDuration = 0;
      }
    }

    // Camera offset: Center player on screen with dynamic shake
    const camX = Math.floor(w / 2 - player.x * ts - ts / 2 + shakeX);
    const camY = Math.floor(h / 2 - player.y * ts - ts / 2 + shakeY);
    const biome = dungeon.biome || (dungeon.depth <= 1 ? "crypt" : (dungeon.depth === 2 ? "cavern" : "inferno"));

    // Spawn floating embers in inferno biome
    if (biome === "inferno" && Math.random() < 0.22) {
      this.particles.push({
        x: (player.x + (Math.random() - 0.5) * 12) * ts,
        y: (player.y + (Math.random() - 0.5) * 10) * ts,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.7 - Math.random() * 0.7,
        color: Math.random() < 0.5 ? "#f6ad55" : "#e53e3e",
        size: 1.5 + Math.random() * 2,
        alpha: 0.85,
        decay: 0.02,
      });
    }

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

        this._drawTile(ctx, tile, x, y, ts, isVis, timestamp, biome);

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
    for (const soul of (dungeon.souls || [])) {
      if (dungeon.isExplored(soul.x, soul.y)) {
        this._drawSoul(ctx, soul, ts, timestamp, dungeon.isVisible(soul.x, soul.y));
      }
    }

    for (const pact of (dungeon.pacts || [])) {
      if (dungeon.isExplored(pact.x, pact.y)) {
        this._drawPact(ctx, pact, ts, timestamp, dungeon.isVisible(pact.x, pact.y));
      }
    }
    for (const sigil of (dungeon.sigils || [])) {
      if (!sigil.collected && dungeon.isExplored(sigil.x, sigil.y)) {
        this._drawSigil(ctx, sigil, ts, timestamp, dungeon.isVisible(sigil.x, sigil.y));
      }
    }
    if (dungeon.vault && dungeon.isExplored(dungeon.vault.x, dungeon.vault.y)) {
      this._drawVault(
        ctx, dungeon.vault, ts, timestamp,
        dungeon.isVisible(dungeon.vault.x, dungeon.vault.y),
        dungeon.sigilsHeld || 0
      );
    }
    for (const sconce of (dungeon.sconces || [])) {
      if (dungeon.isVisible(sconce.x, sconce.y)) {
        this._drawSconce(ctx, sconce, ts, timestamp, biome);
      }
    }
    for (const merchant of (dungeon.merchants || [])) {
      if (dungeon.isExplored(merchant.x, merchant.y)) {
        this._drawMerchant(ctx, merchant, ts, timestamp, dungeon.isVisible(merchant.x, merchant.y));
      }
    }

    // 2.5 Draw Hover Reticle (underneath characters)
    if (this.hoverTile && dungeon.isExplored(this.hoverTile.x, this.hoverTile.y)) {
      this._drawHoverReticle(ctx, this.hoverTile.x, this.hoverTile.y, ts, timestamp);
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
    this._drawTorchlight(ctx, player, ts, timestamp, biome);

    // 6. Draw Visual FX (Slashes, Shockwaves, Projectiles, Particles, Floating Text)
    this._renderSlashes(ctx);
    this._renderShockwaves(ctx);
    this._renderProjectiles(ctx);
    this._renderParticles(ctx);
    this._renderFloatingTexts(ctx);

    // 6.5 Draw Hover Tooltip for Monster or Interactive Prop
    if (this.hoverTile && dungeon.isVisible(this.hoverTile.x, this.hoverTile.y)) {
      this._drawHoverTooltip(ctx, this.hoverTile.x, this.hoverTile.y, ts, monsters, dungeon);
    }

    ctx.restore();

    // 7. Render Radar Minimap in top-right HUD
    this._drawMinimap(ctx, dungeon, player, monsters);
  }

  _drawTile(ctx, tile, x, y, ts, isVis, timestamp, biome = "crypt") {
    const px = x * ts;
    const py = y * ts;

    if (tile === TileType.WALL) {
      if (biome === "cavern") {
        ctx.fillStyle = isVis ? "#122629" : "#091517";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#1e3c40" : "#112225";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
        // Bioluminescent cyan lichen
        if ((x * 7 + y * 13) % 4 === 0) {
          ctx.fillStyle = isVis ? "#234e52" : "#132729";
          ctx.fillRect(px + 2, py + ts - 5, ts - 4, 3);
        }
      } else if (biome === "inferno") {
        ctx.fillStyle = isVis ? "#271418" : "#15090c";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#4a1e26" : "#240d12";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
        // Basalt crack vein
        if ((x * 7 + y * 13) % 4 === 0) {
          ctx.fillStyle = isVis ? "#742a2a" : "#3c1515";
          ctx.fillRect(px + 2, py + ts - 4, ts - 4, 2);
        }
      } else {
        // Crypt default
        ctx.fillStyle = isVis ? "#232936" : "#141822";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#363f52" : "#1e2330";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
        ctx.beginPath();
        ctx.moveTo(px, py + ts / 2);
        ctx.lineTo(px + ts, py + ts / 2);
        ctx.stroke();

        if ((x * 7 + y * 13) % 5 === 0) {
          ctx.fillStyle = isVis ? "#2f4838" : "#1b2820";
          ctx.fillRect(px + 2, py + ts - 5, ts - 4, 3);
        }
      }
    } else if (
      tile === TileType.FLOOR ||
      tile === TileType.CHEST ||
      tile === TileType.TRAP ||
      tile === TileType.SHRINE ||
      tile === TileType.URN ||
      tile === TileType.SOUL ||
      tile === TileType.SIGIL ||
      tile === TileType.VAULT ||
      tile === TileType.PACT ||
      tile === TileType.MERCHANT
    ) {
      const altColor = (x + y) % 2 === 0;

      if (biome === "cavern") {
        ctx.fillStyle = isVis ? (altColor ? "#0e1c20" : "#0a1619") : "#060e10";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#172e35" : "#0e1c21";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, ts, ts);

        // Water puddle with animated shimmer
        if ((x * 11 + y * 7) % 6 === 0 && tile === TileType.FLOOR) {
          const shimmer = Math.sin(timestamp * 0.003 + x + y) * 0.15 + 0.35;
          ctx.fillStyle = isVis ? `rgba(49, 130, 206, ${shimmer})` : "rgba(20, 50, 80, 0.2)";
          ctx.beginPath();
          ctx.ellipse(px + ts / 2, py + ts / 2, ts / 3, ts / 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (biome === "inferno") {
        ctx.fillStyle = isVis ? (altColor ? "#1b0e12" : "#13080b") : "#0a0406";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#2c1218" : "#18080b";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, ts, ts);

        // Molten lava fissures
        if ((x * 13 + y * 11) % 5 === 0 && tile === TileType.FLOOR) {
          const glow = Math.sin(timestamp * 0.005 + x) * 0.2 + 0.6;
          ctx.strokeStyle = isVis ? `rgba(221, 107, 32, ${glow})` : "rgba(100, 30, 10, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + ts / 2);
          ctx.lineTo(px + ts - 4, py + ts / 2 + 2);
          ctx.stroke();
        }
      } else {
        // Crypt default
        ctx.fillStyle = isVis ? (altColor ? "#191f28" : "#151b24") : "#0d1117";
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = isVis ? "#242c38" : "#131820";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, ts, ts);

        if ((x * 11 + y * 17) % 9 === 0 && tile === TileType.FLOOR) {
          ctx.fillStyle = isVis ? "#4a5568" : "#2d3748";
          ctx.beginPath();
          ctx.arc(px + 8, py + 8, 2, 0, Math.PI * 2);
          ctx.arc(px + 12, py + 9, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Merchant Rug Tile
      if (tile === TileType.MERCHANT) {
        ctx.fillStyle = isVis ? "#552222" : "#2d1111";
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.strokeStyle = isVis ? "#ecc94b" : "#744210";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 4, py + 4, ts - 8, ts - 8);
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
    const px = chest.x * ts + 5;
    const py = chest.y * ts + 8;
    const w = ts - 10;
    const h = ts - 14;

    if (chest.opened) {
      // Opened chest base
      ctx.fillStyle = isVis ? "#3a2d21" : "#1f1811";
      ctx.fillRect(px, py + 4, w, h - 4);
      // Tilted open lid
      ctx.fillStyle = isVis ? "#5c432d" : "#2f2216";
      ctx.fillRect(px - 1, py - 2, w + 2, 5);
      // Interior gold glitter
      ctx.fillStyle = isVis ? "#d69e2e" : "#593c10";
      ctx.fillRect(px + 3, py + 5, w - 6, 2);
    } else {
      // Closed ornate chest
      ctx.fillStyle = isVis ? "#7b4f2c" : "#382312";
      ctx.fillRect(px, py, w, h);

      // Iron band reinforcements
      ctx.fillStyle = isVis ? "#4a5568" : "#212733";
      ctx.fillRect(px + 3, py, 2.5, h);
      ctx.fillRect(px + w - 5.5, py, 2.5, h);

      // Gold lock latch
      ctx.fillStyle = isVis ? "#ecc94b" : "#744210";
      ctx.fillRect(px + w / 2 - 2, py + h / 2 - 2, 4, 5);
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + w / 2 - 0.5, py + h / 2, 1, 2);

      // Treasure glint sparkle
      if (isVis && Math.random() < 0.08) {
        this.particles.push({
          x: px + w / 2 + (Math.random() - 0.5) * 8,
          y: py + h / 2 + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.4 - Math.random() * 0.4,
          color: "#ecc94b",
          size: 1.5,
          alpha: 0.9,
          decay: 0.03,
        });
      }
    }
  }

  _drawTrap(ctx, trap, ts) {
    const px = trap.x * ts + 4;
    const py = trap.y * ts + 4;
    const size = ts - 8;

    // Iron floor grille
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, size, size);

    // Grille bars
    ctx.beginPath();
    ctx.moveTo(px, py + size / 2);
    ctx.lineTo(px + size, py + size / 2);
    ctx.moveTo(px + size / 2, py);
    ctx.lineTo(px + size / 2, py + size);
    ctx.stroke();

    // Retractable razor spikes
    ctx.fillStyle = "#e53e3e";
    const spikes = [
      [px + 4, py + 4],
      [px + size - 4, py + 4],
      [px + 4, py + size - 4],
      [px + size - 4, py + size - 4],
      [px + size / 2, py + size / 2],
    ];
    spikes.forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawShrine(ctx, shrine, ts, timestamp, isVis) {
    const px = shrine.x * ts + 4;
    const py = shrine.y * ts + 4;
    const size = ts - 8;

    // Granite stone altar pedestal with runic carving
    ctx.fillStyle = isVis ? "#2d3748" : "#1a202c";
    ctx.fillRect(px + 2, py + size - 5, size - 4, 5);
    ctx.fillRect(px + 4, py + 7, size - 8, size - 12);
    ctx.strokeStyle = isVis ? "#4a5568" : "#2d3748";
    ctx.strokeRect(px + 4, py + 7, size - 8, size - 12);

    // Hovering rotating magical crystal
    if (!shrine.activated && isVis) {
      const pulse = Math.sin(timestamp * 0.006) * 0.25 + 0.75;
      const bob = Math.sin(timestamp * 0.004) * 2;
      const crystalY = py + 6 + bob;

      // Outer glow
      ctx.fillStyle = `rgba(56, 178, 172, ${pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(px + size / 2, crystalY, 7, 0, Math.PI * 2);
      ctx.fill();

      // Diamond crystal
      ctx.fillStyle = "#38b2ac";
      ctx.beginPath();
      ctx.moveTo(px + size / 2, crystalY - 5);
      ctx.lineTo(px + size / 2 + 4, crystalY);
      ctx.lineTo(px + size / 2, crystalY + 5);
      ctx.lineTo(px + size / 2 - 4, crystalY);
      ctx.closePath();
      ctx.fill();

      // Crystal facet highlight
      ctx.fillStyle = "#e6fffa";
      ctx.beginPath();
      ctx.moveTo(px + size / 2, crystalY - 4);
      ctx.lineTo(px + size / 2 + 2, crystalY);
      ctx.lineTo(px + size / 2, crystalY);
      ctx.closePath();
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
      ctx.fillRect(cx - 6, cy + 2, 5, 2);
      ctx.fillRect(cx + 2, cy + 3, 4, 2);
      ctx.fillRect(cx - 2, cy + 4, 3, 2);
      return;
    }

    // Grecian double-handled terracotta urn
    // Handles
    ctx.strokeStyle = isVis ? "#7b341e" : "#3d190d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 1, 4, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 6, cy - 1, 4, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();

    // Body
    ctx.fillStyle = isVis ? "#9c4221" : "#4a1e0d";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 7.5, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ancient geometric band
    ctx.fillStyle = isVis ? "#742a2a" : "#381313";
    ctx.fillRect(cx - 6, cy, 12, 2);

    // Gilded lip rim
    ctx.fillStyle = isVis ? "#ecc94b" : "#744210";
    ctx.fillRect(cx - 5.5, cy - 8, 11, 2);
  }

  _drawInteractMarker(ctx, cx, topY, color, timestamp) {
    const pulse = 0.55 + Math.sin(timestamp * 0.007) * 0.35;
    ctx.save();
    ctx.globalAlpha = Math.max(0.45, pulse);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, topY - 5.5);
    ctx.lineTo(cx + 4.2, topY - 1.2);
    ctx.lineTo(cx, topY + 3);
    ctx.lineTo(cx - 4.2, topY - 1.2);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  _drawSoul(ctx, soul, ts, timestamp, isVis) {
    const cx = soul.x * ts + ts / 2;
    const cy = soul.y * ts + ts / 2;

    if (soul.resolved) {
      ctx.fillStyle = isVis ? "#3b2f4a" : "#1e1826";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 5, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const bob = Math.sin(timestamp * 0.004 + soul.x) * 2;
    const pulse = 0.65 + Math.sin(timestamp * 0.006 + soul.y) * 0.2;

    // Wide violet aura so the ghost reads at a glance
    const glow = ctx.createRadialGradient(cx, cy + bob, 1, cx, cy + bob, 22);
    glow.addColorStop(0, `rgba(183, 148, 244, ${pulse * 0.55})`);
    glow.addColorStop(0.6, `rgba(159, 122, 234, ${pulse * 0.28})`);
    glow.addColorStop(1, "rgba(139, 92, 246, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 22, 0, Math.PI * 2);
    ctx.fill();

    // Wispy tail below the robe
    ctx.fillStyle = `rgba(167, 139, 250, ${0.3 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 8);
    ctx.quadraticCurveTo(cx - 2, cy + 15, cx, cy + 12);
    ctx.quadraticCurveTo(cx + 2, cy + 15, cx + 5, cy + 8);
    ctx.closePath();
    ctx.fill();

    // Kneeling shroud, larger and lighter than the floor
    ctx.fillStyle = isVis ? "#7c5cbf" : "#3a2b5c";
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 10);
    ctx.quadraticCurveTo(cx - 11, cy - 6 + bob, cx, cy - 11 + bob);
    ctx.quadraticCurveTo(cx + 11, cy - 6 + bob, cx + 9, cy + 10);
    ctx.closePath();
    ctx.fill();

    // Shroud highlight
    ctx.fillStyle = "rgba(233, 216, 253, 0.22)";
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 2 + bob, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ember heart with a halo
    ctx.fillStyle = "rgba(246, 173, 85, 0.45)";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isVis ? "#fbd38d" : "#7b4a1d";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = isVis ? "#fefcbf" : "#5b5340";
    ctx.fillRect(cx - 5, cy - 6 + bob, 2.6, 2.6);
    ctx.fillRect(cx + 2.4, cy - 6 + bob, 2.6, 2.6);

    // Interactable pip
    this._drawInteractMarker(ctx, cx, cy - 14 + bob, "#d6bcfa", timestamp);
  }

  _drawPact(ctx, pact, ts, timestamp, isVis) {
    const cx = pact.x * ts + ts / 2;
    const cy = pact.y * ts + ts / 2;

    if (pact.used) {
      ctx.fillStyle = isVis ? "#2a1a1a" : "#150d0d";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const pulse = 0.55 + Math.sin(timestamp * 0.006 + pact.x) * 0.25;

    // Crimson halo: the altar is visible across a dark room
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 20);
    glow.addColorStop(0, `rgba(245, 101, 101, ${pulse * 0.5})`);
    glow.addColorStop(0.6, `rgba(155, 44, 44, ${pulse * 0.25})`);
    glow.addColorStop(1, "rgba(120, 30, 30, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();

    // Obsidian slab
    ctx.fillStyle = isVis ? "#1a1218" : "#0d090c";
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy + 9);
    ctx.lineTo(cx + 11, cy + 9);
    ctx.lineTo(cx + 8, cy - 4);
    ctx.lineTo(cx - 8, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isVis ? "#742a2a" : "#3a1414";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Three red votive candles
    for (const offset of [-6, 0, 6]) {
      const flicker = 2 + Math.sin(timestamp * 0.01 + offset) * 1.2;
      ctx.fillStyle = isVis ? "#feb2b2" : "#5b2020";
      ctx.fillRect(cx + offset - 1.5, cy - 4, 3, 5);
      ctx.fillStyle = isVis ? "#f6ad55" : "#7b341e";
      ctx.beginPath();
      ctx.ellipse(cx + offset, cy - 6, 1.4, flicker, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Offer bowl with a bone hand
    ctx.strokeStyle = isVis ? "#e2e8f0" : "#4a5568";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 3.5, 0, Math.PI);
    ctx.stroke();

    this._drawInteractMarker(ctx, cx, cy - 15, "#fc8181", timestamp);
  }

  _drawSigil(ctx, sigil, ts, timestamp, isVis) {
    const cx = sigil.x * ts + ts / 2;
    const cy = sigil.y * ts + ts / 2;
    const bob = Math.sin(timestamp * 0.005 + sigil.x) * 2;
    const pulse = 0.6 + Math.sin(timestamp * 0.007 + sigil.y) * 0.25;

    const glow = ctx.createRadialGradient(cx, cy + bob, 1, cx, cy + bob, 13);
    glow.addColorStop(0, `rgba(99, 179, 237, ${pulse * 0.55})`);
    glow.addColorStop(1, "rgba(99, 179, 237, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isVis ? "#63b3ed" : "#2c5282";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isVis ? "#e6f6ff" : "#3b6a8f";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4 + bob);
    ctx.lineTo(cx + 3, cy + bob);
    ctx.lineTo(cx, cy + 4 + bob);
    ctx.lineTo(cx - 3, cy + bob);
    ctx.closePath();
    ctx.fill();
  }

  _drawVault(ctx, vault, ts, timestamp, isVis, sigilsHeld) {
    const px = vault.x * ts + 2;
    const py = vault.y * ts + 2;
    const w = ts - 4;
    const h = ts - 4;

    // Recessed shadow so the door sits below the floor line
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(px - 1, py - 1, w + 2, h + 2);

    // Stone body with warm gold trim
    ctx.fillStyle = isVis ? "#3b4252" : "#1b202a";
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = isVis ? "#b7791f" : "#4a3410";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);

    // Inner panel
    ctx.fillStyle = isVis ? "#242b38" : "#12161d";
    ctx.fillRect(px + 4, py + 4, w - 8, h - 8);

    if (vault.opened) {
      const light = ctx.createLinearGradient(px, py, px, py + h);
      light.addColorStop(0, "rgba(236, 201, 75, 0.8)");
      light.addColorStop(1, "rgba(236, 201, 75, 0.12)");
      ctx.fillStyle = light;
      ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
      ctx.fillStyle = "#fefcbf";
      ctx.fillRect(px + w / 2 - 1, py + 5, 2, h - 10);
      return;
    }

    // Three sockets on the right edge, lit by carried sigils
    const lit = Math.max(0, Math.min(3, sigilsHeld));
    const pulse = 0.55 + Math.sin(timestamp * 0.006) * 0.25;
    const socketX = px + w - 9;
    for (let i = 0; i < 3; i++) {
      const sy = py + 9 + i * 7;
      ctx.strokeStyle = "#0a0d12";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(socketX, sy, 4.2, 0, Math.PI * 2);
      ctx.stroke();
      if (i < lit) {
        ctx.fillStyle = `rgba(99, 179, 237, ${pulse * 0.6})`;
        ctx.beginPath();
        ctx.arc(socketX, sy, 7.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = i < lit ? "#e6f6ff" : "#151a22";
      ctx.beginPath();
      ctx.arc(socketX, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gold lock diamond and two short seams
    const lockX = px + 10;
    const lockY = py + h / 2;
    ctx.fillStyle = isVis ? "#ecc94b" : "#5c4a14";
    ctx.beginPath();
    ctx.moveTo(lockX, lockY - 5);
    ctx.lineTo(lockX + 4, lockY);
    ctx.lineTo(lockX, lockY + 5);
    ctx.lineTo(lockX - 4, lockY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isVis ? "#11151c" : "#07090d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 7);
    ctx.lineTo(px + w - 15, py + 7);
    ctx.moveTo(px + 5, py + h - 7);
    ctx.lineTo(px + w - 15, py + h - 7);
    ctx.stroke();

    this._drawInteractMarker(ctx, px + w / 2, py - 4, "#ecc94b", timestamp);
  }

  _drawSconce(ctx, sconce, ts, timestamp, biome = "crypt") {
    const cx = sconce.x * ts + ts / 2;
    const cy = sconce.y * ts + ts - 4;

    // Iron wall sconce bracket
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Flickering torch fire tuned to biome
    const flameH = 6 + Math.sin(timestamp * 0.02 + sconce.x) * 2;
    let outerColor = "#dd6b20";
    let innerColor = "#ecc94b";
    if (biome === "cavern") {
      outerColor = "#38b2ac";
      innerColor = "#81e6d9";
    } else if (biome === "inferno") {
      outerColor = "#e53e3e";
      innerColor = "#f6ad55";
    }

    ctx.fillStyle = outerColor;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 6);
    ctx.lineTo(cx, cy - 6 - flameH);
    ctx.lineTo(cx + 3, cy - 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 7, 2, 0, Math.PI * 2);
    ctx.fill();

    // Spawn subtle ambient embers that drift upward
    if (Math.random() < 0.04) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 4,
        y: cy - 8,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.6 - Math.random() * 0.5,
        color: innerColor,
        size: 1 + Math.random() * 1.5,
        alpha: 0.8,
        decay: 0.025,
      });
    }
  }

  _drawMerchant(ctx, merchant, ts, timestamp, isVis) {
    const px = merchant.x * ts;
    const py = merchant.y * ts;
    const bob = Math.sin(timestamp * 0.004) * 1.5;

    ctx.save();
    ctx.translate(0, bob);

    // Deep hooded traveling cloak
    ctx.fillStyle = isVis ? "#322659" : "#1a1330";
    ctx.beginPath();
    ctx.moveTo(px + ts / 2, py + 4);
    ctx.lineTo(px + ts - 5, py + ts - 4);
    ctx.lineTo(px + 5, py + ts - 4);
    ctx.closePath();
    ctx.fill();

    // Cowl Hood
    ctx.fillStyle = isVis ? "#44337a" : "#21193d";
    ctx.beginPath();
    ctx.arc(px + ts / 2, py + ts / 2 - 3, 7, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Golden Eyes in darkness of cowl
    if (isVis) {
      ctx.fillStyle = "#ecc94b";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 4, 2, 2);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 4, 2, 2);
    }

    // Heavy traveling pack on back
    ctx.fillStyle = isVis ? "#744210" : "#3b2108";
    ctx.fillRect(px + 4, py + ts / 2 - 2, 5, 8);

    // Brass Lantern hanging from wooden staff
    const lanX = px + ts - 6;
    const lanY = py + ts / 2 + 2;
    ctx.strokeStyle = "#ecc94b";
    ctx.lineWidth = 1;
    ctx.strokeRect(lanX - 2, lanY - 3, 4, 6);
    if (isVis) {
      ctx.fillStyle = "rgba(236, 201, 75, 0.7)";
      ctx.fillRect(lanX - 1, lanY - 2, 2, 4);
    }

    // Floating SHOP Pill Label
    if (isVis) {
      ctx.fillStyle = "rgba(26, 32, 44, 0.85)";
      ctx.fillRect(px + 2, py - 6, ts - 4, 11);
      ctx.strokeStyle = "#ecc94b";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2, py - 6, ts - 4, 11);

      ctx.fillStyle = "#ecc94b";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🪙 SHOP", px + ts / 2, py + 2);
      ctx.textAlign = "start";
    }

    ctx.restore();
  }

  _drawMonster(ctx, monster, ts, timestamp) {
    const px = monster.x * ts;
    const py = monster.y * ts;
    const bob = Math.sin(timestamp * 0.005 + monster.x * 2) * 2;

    ctx.save();
    ctx.translate(0, bob);

    // Champion Elite Glowing Aura & Crown
    if (monster.is_champion) {
      const affix = monster.champion_affix || "Molten";
      let auraColor = "rgba(229, 62, 62, 0.45)";
      let starColor = "#feb2b2";
      if (affix === "Vampiric") {
        auraColor = "rgba(159, 122, 234, 0.45)";
        starColor = "#d6bcfa";
      } else if (affix === "Swift") {
        auraColor = "rgba(72, 187, 120, 0.45)";
        starColor = "#9ae6b4";
      } else if (affix === "Fortified") {
        auraColor = "rgba(214, 158, 46, 0.45)";
        starColor = "#faf089";
      }

      const pulse = Math.sin(timestamp * 0.007) * 3;
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, ts / 2 + 2 + pulse, 0, Math.PI * 2);
      ctx.fill();

      // Crown / Star badge above head
      ctx.fillStyle = starColor;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", px + ts / 2, py - 3);
      ctx.textAlign = "start";
    }

    if (monster.type === "boss_lich") {
      // Arch-Lich Boss: Majestic dark royal necromancer
      // Royal burial robes
      ctx.fillStyle = "#322659";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 4);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.lineTo(px + 4, py + ts - 2);
      ctx.closePath();
      ctx.fill();

      // Gold embroidered hem
      ctx.strokeStyle = "#d69e2e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + ts - 2);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.stroke();

      // High spectral collar
      ctx.fillStyle = "#44337a";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 8, py + 12);
      ctx.lineTo(px + ts / 2 - 11, py + 4);
      ctx.lineTo(px + ts / 2 + 11, py + 4);
      ctx.lineTo(px + ts / 2 + 8, py + 12);
      ctx.closePath();
      ctx.fill();

      // Serrated 5-point Golden Crown with ruby jewel
      ctx.fillStyle = "#d69e2e";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 9, py + 3);
      ctx.lineTo(px + ts / 2 - 7, py - 4);
      ctx.lineTo(px + ts / 2 - 3, py);
      ctx.lineTo(px + ts / 2, py - 6);
      ctx.lineTo(px + ts / 2 + 3, py);
      ctx.lineTo(px + ts / 2 + 7, py - 4);
      ctx.lineTo(px + ts / 2 + 9, py + 3);
      ctx.closePath();
      ctx.fill();

      // Crown central ruby
      ctx.fillStyle = "#e53e3e";
      ctx.fillRect(px + ts / 2 - 1.5, py - 2, 3, 3);

      // Skull face with burning amethyst flame eyes
      ctx.fillStyle = "#f7fafc";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 4, py + 8, 3, 3);
      ctx.fillRect(px + ts / 2 + 1, py + 8, 3, 3);
      ctx.fillStyle = "#d6bcfa";
      ctx.fillRect(px + ts / 2 - 3, py + 9, 2, 2);
      ctx.fillRect(px + ts / 2 + 2, py + 9, 2, 2);

      // Two counter-rotating orbiting soul orbs
      // 1. Violet soul-drain orb
      const orb1Angle = timestamp * 0.004;
      const orb1X = px + ts / 2 + Math.cos(orb1Angle) * 17;
      const orb1Y = py + ts / 2 + Math.sin(orb1Angle) * 13;
      ctx.fillStyle = "#9f7aea";
      ctx.beginPath();
      ctx.arc(orb1X, orb1Y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 2. Frost-cyan stasis orb
      const orb2Angle = -timestamp * 0.0055;
      const orb2X = px + ts / 2 + Math.cos(orb2Angle) * 13;
      const orb2Y = py + ts / 2 + Math.sin(orb2Angle) * 17;
      ctx.fillStyle = "#63b3ed";
      ctx.beginPath();
      ctx.arc(orb2X, orb2Y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.type === "skeleton") {
      // Ivory skull with hollow black sockets and pinpoint red soul-fires
      ctx.fillStyle = "#f7fafc";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 4, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 6, 3, 3);
      ctx.fillRect(px + ts / 2 + 1, py + ts / 2 - 6, 3, 3);
      ctx.fillStyle = "#e53e3e";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 - 5, 1.5, 1.5);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 5, 1.5, 1.5);

      // Ribcage & spine
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + ts / 2 + 3);
      ctx.lineTo(px + ts / 2, py + ts / 2 + 12);
      // Rib pairs
      ctx.moveTo(px + ts / 2 - 5, py + ts / 2 + 5);
      ctx.lineTo(px + ts / 2 + 5, py + ts / 2 + 5);
      ctx.moveTo(px + ts / 2 - 4, py + ts / 2 + 8);
      ctx.lineTo(px + ts / 2 + 4, py + ts / 2 + 8);
      ctx.stroke();

      // Curved steel scimitar on right arm
      ctx.strokeStyle = "#cbd5e0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 5, py + ts / 2 + 10);
      ctx.quadraticCurveTo(px + ts - 2, py + ts / 2, px + ts - 5, py + ts / 2 - 6);
      ctx.stroke();

      // Round studded wooden buckler on left arm
      ctx.fillStyle = "#744210";
      ctx.beginPath();
      ctx.arc(px + 6, py + ts / 2 + 5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a0aec0";
      ctx.beginPath();
      ctx.arc(px + 6, py + ts / 2 + 5, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.type === "spider") {
      // Venomous Brood-Spider with animated 8-leg crawling cycle
      // Abdomen
      ctx.fillStyle = "#1a202c";
      ctx.beginPath();
      ctx.ellipse(px + ts / 2, py + ts / 2 + 2, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Toxic abdominal markings
      ctx.fillStyle = "#68d391";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Cephalothorax
      ctx.fillStyle = "#2d3748";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 3, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 6 glowing emerald eyes
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 - 5, 1.5, 1.5);
      ctx.fillRect(px + ts / 2 + 1.5, py + ts / 2 - 5, 1.5, 1.5);
      ctx.fillRect(px + ts / 2 - 2, py + ts / 2 - 3, 1.5, 1.5);
      ctx.fillRect(px + ts / 2 + 0.5, py + ts / 2 - 3, 1.5, 1.5);

      // Dripping venom fangs
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(px + ts / 2 - 2.5, py + ts / 2, 1.5, 2.5);
      ctx.fillRect(px + ts / 2 + 1, py + ts / 2, 1.5, 2.5);
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + ts / 2 - 2.5, py + ts / 2 + 2.5, 1.5, 1.5);
      ctx.fillRect(px + ts / 2 + 1, py + ts / 2 + 2.5, 1.5, 1.5);

      // 8 animated creeping legs
      ctx.strokeStyle = "#4a5568";
      ctx.lineWidth = 1.5;
      for (let leg = 0; leg < 4; leg++) {
        const legSway = Math.sin(timestamp * 0.007 + leg * 0.8) * 2.5;
        // Left legs
        ctx.beginPath();
        ctx.moveTo(px + ts / 2 - 3, py + ts / 2 - 3 + leg * 2.5);
        ctx.lineTo(px + ts / 2 - 8, py + ts / 2 - 5 + leg * 3 + legSway);
        ctx.lineTo(px + ts / 2 - 13, py + ts / 2 - 2 + leg * 3.5);
        ctx.stroke();
        // Right legs
        ctx.beginPath();
        ctx.moveTo(px + ts / 2 + 3, py + ts / 2 - 3 + leg * 2.5);
        ctx.lineTo(px + ts / 2 + 8, py + ts / 2 - 5 + leg * 3 - legSway);
        ctx.lineTo(px + ts / 2 + 13, py + ts / 2 - 2 + leg * 3.5);
        ctx.stroke();
      }
    } else if (monster.type === "goblin") {
      // Sneaky Goblin with large pointed ears, fangs, and earring
      // Body
      ctx.fillStyle = "#276749";
      ctx.fillRect(px + ts / 2 - 5, py + ts / 2 + 3, 10, 8);

      // Head
      ctx.fillStyle = "#38a169";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 2, 7, 0, Math.PI * 2);
      ctx.fill();

      // Pointed ears
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 6, py + ts / 2 - 2);
      ctx.lineTo(px + ts / 2 - 13, py + ts / 2 - 6);
      ctx.lineTo(px + ts / 2 - 4, py + ts / 2 + 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(px + ts / 2 + 6, py + ts / 2 - 2);
      ctx.lineTo(px + ts / 2 + 13, py + ts / 2 - 6);
      ctx.lineTo(px + ts / 2 + 4, py + ts / 2 + 2);
      ctx.fill();

      // Golden ring earring on left ear
      ctx.strokeStyle = "#ecc94b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px + ts / 2 - 11, py + ts / 2 - 3, 2, 0, Math.PI * 2);
      ctx.stroke();

      // Cunning yellow eyes
      ctx.fillStyle = "#faf089";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 4, 2.5, 2);
      ctx.fillRect(px + ts / 2 + 1.5, py + ts / 2 - 4, 2.5, 2);
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 - 4, 1, 2);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 4, 1, 2);

      // Underbite fangs
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2, 1.5, 2);
      ctx.fillRect(px + ts / 2 + 1.5, py + ts / 2, 1.5, 2);

      // Jagged dagger
      ctx.strokeStyle = "#cbd5e0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 5, py + ts / 2 + 7);
      ctx.lineTo(px + ts - 3, py + ts / 2 - 3);
      ctx.stroke();
    } else if (monster.type === "wraith") {
      // Pact-Bound Wraith: a crimson debt given shape. It must read as a different
      // threat from the violet Lost Soul and the grey skeleton at a glance.
      const drift = Math.sin(timestamp * 0.004 + monster.y) * 1.5;
      ctx.save();
      ctx.translate(0, drift);

      const glow = ctx.createRadialGradient(
        px + ts / 2, py + ts / 2, 1, px + ts / 2, py + ts / 2, ts * 0.6
      );
      glow.addColorStop(0, "rgba(245, 101, 101, 0.45)");
      glow.addColorStop(1, "rgba(245, 101, 101, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2, ts * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Tattered shroud tapering into a ragged tail
      ctx.fillStyle = "rgba(120, 32, 40, 0.92)";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 3);
      ctx.quadraticCurveTo(px + ts - 3, py + ts / 2, px + ts / 2, py + ts - 1);
      ctx.quadraticCurveTo(px + 3, py + ts / 2, px + ts / 2, py + 3);
      ctx.fill();

      // Bone-white mask and hollow sockets with red pinpoints
      ctx.fillStyle = "#f7fafc";
      ctx.beginPath();
      ctx.ellipse(px + ts / 2, py + 8, 4.4, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 2.4, py + 6, 1.8, 2.2);
      ctx.fillRect(px + ts / 2 + 0.6, py + 6, 1.8, 2.2);
      ctx.fillStyle = "#fc8181";
      ctx.fillRect(px + ts / 2 - 1.9, py + 6.5, 1, 1);
      ctx.fillRect(px + ts / 2 + 1, py + 6.5, 1, 1);

      // Debt chains hanging from the wrists
      ctx.strokeStyle = "rgba(236, 201, 75, 0.8)";
      ctx.lineWidth = 1.2;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px + ts / 2 + sign * 6, py + ts / 2);
        ctx.lineTo(px + ts / 2 + sign * 7, py + ts - 3);
        ctx.stroke();
      }
      ctx.restore();
    } else if (monster.type === "necromancer") {
      // Dread Necromancer with bone skull staff and hovering runes
      // Shroud
      ctx.fillStyle = "#2d1b4e";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 3);
      ctx.lineTo(px + ts - 5, py + ts - 3);
      ctx.lineTo(px + 5, py + ts - 3);
      ctx.closePath();
      ctx.fill();

      // Hood
      ctx.fillStyle = "#44337a";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + 8, 6, 0, Math.PI * 2);
      ctx.fill();

      // Glowing cyan eyes
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(px + ts / 2 - 3, py + 7, 2, 2);
      ctx.fillRect(px + ts / 2 + 1, py + 7, 2, 2);

      // Bone staff with soul flame
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 4, py + 3);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.stroke();

      // Staff skull & cyan flame
      ctx.fillStyle = "#00f0ff";
      const flamePulse = Math.sin(timestamp * 0.01) * 1.5;
      ctx.beginPath();
      ctx.arc(px + ts - 4, py + 2, 3.5 + flamePulse * 0.5, 0, Math.PI * 2);
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
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("💫", px + ts / 2 - 5, py - 4);
    }
    if (monster.status_effects && monster.status_effects.burn) {
      ctx.fillStyle = "#dd6b20";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("🔥", px + 1, py + ts / 2);
    }
    if (monster.status_effects && monster.status_effects.poison) {
      ctx.fillStyle = "#48bb78";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("🧪", px + ts - 8, py + ts / 2);
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
    const heroClass = player.hero_class || "paladin";

    ctx.save();
    ctx.translate(0, bob);

    // Shield Wall Barrier (Shimmering golden translucent octagonal shield)
    if (player.status_effects && player.status_effects.shield_wall) {
      const barrierPulse = Math.sin(timestamp * 0.008) * 0.15 + 0.55;
      ctx.fillStyle = `rgba(236, 201, 75, ${barrierPulse * 0.25})`;
      ctx.strokeStyle = `rgba(236, 201, 75, ${barrierPulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = 8;
      const rad = ts / 2 + 3;
      for (let i = 0; i < sides; i++) {
        const a = (i * Math.PI * 2) / sides + timestamp * 0.002;
        const bx = px + ts / 2 + Math.cos(a) * rad;
        const by = py + ts / 2 + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (heroClass === "rogue") {
      // Shadow Rogue Sprite: Obsidian stealth cowl with emerald assassin eyes, dual daggers & shadow smoke
      // Ambient shadow smoke at feet
      if (Math.random() < 0.15) {
        this.particles.push({
          x: px + ts / 2 + (Math.random() - 0.5) * 6,
          y: py + ts - 4,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.35 - Math.random() * 0.3,
          color: "#4a5568",
          size: 2,
          alpha: 0.6,
          decay: 0.04,
        });
      }

      // Trailing cowl scarf
      ctx.fillStyle = "#1a202c";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 5, py + ts / 2 + 2);
      ctx.lineTo(px + 2, py + ts - 2);
      ctx.lineTo(px + ts / 2 - 2, py + ts / 2 + 5);
      ctx.fill();

      // Stealth Hood
      ctx.fillStyle = "#2d3748";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 4, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Mask
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 5, py + ts / 2 - 2, 10, 5);

      // Glowing venomous green slit eyes
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 4, 2, 2);
      ctx.fillRect(px + ts / 2 + 2, py + ts / 2 - 4, 2, 2);

      // Studded leather brigandine
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(px + ts / 2 - 5, py + ts / 2 + 3, 10, 9);
      // Crossed belts
      ctx.strokeStyle = "#744210";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 5, py + ts / 2 + 3);
      ctx.lineTo(px + ts / 2 + 5, py + ts / 2 + 12);
      ctx.stroke();

      // Left poison wavy Kris dagger
      ctx.strokeStyle = "#cbd5e0";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(px + 5, py + ts / 2 + 8);
      ctx.lineTo(px + 3, py + ts / 2 - 5);
      ctx.stroke();
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + 2, py + ts / 2 - 6, 2.5, 2.5);

      // Right poison wavy Kris dagger
      ctx.strokeStyle = "#cbd5e0";
      ctx.beginPath();
      ctx.moveTo(px + ts - 5, py + ts / 2 + 8);
      ctx.lineTo(px + ts - 3, py + ts / 2 - 5);
      ctx.stroke();
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(px + ts - 4.5, py + ts / 2 - 6, 2.5, 2.5);
    } else if (heroClass === "mage") {
      // Arcane Mage Sprite: Royal purple robes, tall wizard hat with gold buckle & floating mana crystal
      // Flowing robe with gold embroidery
      ctx.fillStyle = "#553c9a";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 3);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.lineTo(px + 4, py + ts - 2);
      ctx.closePath();
      ctx.fill();

      // Gold embroidery hem
      ctx.strokeStyle = "#d69e2e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + ts - 2);
      ctx.lineTo(px + ts - 4, py + ts - 2);
      ctx.stroke();

      // Wizard Hat with wide curved brim
      ctx.fillStyle = "#44337a";
      ctx.beginPath();
      ctx.ellipse(px + ts / 2, py + 8, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pointed cone
      ctx.fillStyle = "#6b46c1";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 7, py + 8);
      ctx.lineTo(px + ts / 2 + 2, py - 6);
      ctx.lineTo(px + ts / 2 + 7, py + 8);
      ctx.closePath();
      ctx.fill();

      // Golden star buckle on hat band
      ctx.fillStyle = "#ecc94b";
      ctx.fillRect(px + ts / 2 - 2, py + 5, 4, 3);

      // Glowing sapphire eyes in cowl shadow
      ctx.fillStyle = "#63b3ed";
      ctx.fillRect(px + ts / 2 - 3, py + 8, 2, 2);
      ctx.fillRect(px + ts / 2 + 1, py + 8, 2, 2);

      // Gnarled ash staff on right arm
      ctx.strokeStyle = "#744210";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 5, py + ts - 3);
      ctx.lineTo(px + ts - 5, py + 2);
      ctx.stroke();

      // Floating illuminated mana crystal orbiting staff tip
      const crystalPulse = Math.sin(timestamp * 0.008) * 0.25 + 0.75;
      ctx.fillStyle = `rgba(0, 240, 255, ${crystalPulse})`;
      ctx.beginPath();
      ctx.arc(px + ts - 5, py, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Swirling arcane spark in left hand
      const sparkAngle = timestamp * 0.01;
      const sparkX = px + 6 + Math.cos(sparkAngle) * 3;
      const sparkY = py + ts / 2 + 2 + Math.sin(sparkAngle) * 3;
      ctx.fillStyle = "#b794f4";
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Crusader Paladin: Knight Greathelm with blue crest plume, cross breastplate, heater shield & broadsword
      // Royal blue crest plume
      const plumeWag = Math.sin(timestamp * 0.006) * 2;
      ctx.fillStyle = "#3182ce";
      ctx.beginPath();
      ctx.moveTo(px + ts / 2 - 2, py - 5);
      ctx.lineTo(px + ts / 2 + 2, py - 5);
      ctx.lineTo(px + ts / 2 + 4 + plumeWag, py + 2);
      ctx.lineTo(px + ts / 2 - 3, py + 2);
      ctx.closePath();
      ctx.fill();

      // Greathelm
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(px + ts / 2, py + ts / 2 - 3, 8, 0, Math.PI * 2);
      ctx.fill();

      // Golden visor rim
      ctx.fillStyle = "#d69e2e";
      ctx.fillRect(px + ts / 2 - 5, py + ts / 2 - 5, 10, 1.5);

      // Visor slit with piercing blue eyes
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(px + ts / 2 - 4, py + ts / 2 - 3, 8, 2);
      ctx.fillStyle = "#63b3ed";
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 - 3, 2, 1.5);
      ctx.fillRect(px + ts / 2 + 1, py + ts / 2 - 3, 2, 1.5);

      // Silver breastplate
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(px + ts / 2 - 6, py + ts / 2 + 4, 12, 10);

      // Embossed golden Crusader Cross on chest
      ctx.fillStyle = "#ecc94b";
      ctx.fillRect(px + ts / 2 - 1, py + ts / 2 + 5, 2, 6);
      ctx.fillRect(px + ts / 2 - 3, py + ts / 2 + 7, 6, 2);

      // Heraldic heater shield on left arm (gold border, white field, crimson cross)
      ctx.fillStyle = "#d69e2e";
      ctx.beginPath();
      ctx.moveTo(px + 2, py + ts / 2 - 2);
      ctx.lineTo(px + 11, py + ts / 2 - 2);
      ctx.lineTo(px + 10, py + ts / 2 + 7);
      ctx.lineTo(px + 6, py + ts / 2 + 11);
      ctx.lineTo(px + 2, py + ts / 2 + 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#f7fafc";
      ctx.beginPath();
      ctx.moveTo(px + 3.5, py + ts / 2 - 1);
      ctx.lineTo(px + 9.5, py + ts / 2 - 1);
      ctx.lineTo(px + 8.5, py + ts / 2 + 6);
      ctx.lineTo(px + 6, py + ts / 2 + 9.5);
      ctx.lineTo(px + 3.5, py + ts / 2 + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#e53e3e";
      ctx.fillRect(px + 5.5, py + ts / 2, 1.5, 7);
      ctx.fillRect(px + 3.5, py + ts / 2 + 2, 5.5, 1.5);

      // Steel broadsword on right arm
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + ts - 6, py + ts / 2 + 9);
      ctx.lineTo(px + ts - 4, py + ts / 2 - 8);
      ctx.stroke();

      // Gold crossguard & pommel
      ctx.fillStyle = "#d69e2e";
      ctx.fillRect(px + ts - 7, py + ts / 2 + 3, 5, 2);
      ctx.beginPath();
      ctx.arc(px + ts - 6, py + ts / 2 + 10, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Status effect badges on player
    if (player.status_effects && player.status_effects.poison) {
      ctx.fillStyle = "#48bb78";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("🧪", px + ts - 8, py);
    }
    if (player.status_effects && player.status_effects.might) {
      ctx.fillStyle = "#e53e3e";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("⚔️", px, py);
    }

    ctx.restore();
  }

  _drawTorchlight(ctx, player, ts, timestamp, biome = "crypt") {
    const flicker = Math.sin(timestamp * 0.006) * 6 + Math.cos(timestamp * 0.015) * 4;
    const radius = Math.max(160, 240 + flicker);

    const cx = player.x * ts + ts / 2;
    const cy = player.y * ts + ts / 2;

    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, radius);

    if (biome === "cavern") {
      grad.addColorStop(0, "rgba(56, 178, 172, 0.14)");
      grad.addColorStop(0.5, "rgba(35, 110, 115, 0.05)");
    } else if (biome === "inferno") {
      grad.addColorStop(0, "rgba(229, 62, 62, 0.16)");
      grad.addColorStop(0.5, "rgba(180, 50, 40, 0.06)");
    } else {
      grad.addColorStop(0, "rgba(255, 210, 120, 0.15)");
      grad.addColorStop(0.5, "rgba(230, 150, 40, 0.05)");
    }
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

  _renderShockwaves(ctx) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += 4.5;
      sw.alpha -= 0.035;

      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.lineWidth = 2.5;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
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

      // Emit flight sparks
      if (Math.random() < 0.6) {
        this.particles.push({
          x: currX + (Math.random() - 0.5) * 4,
          y: currY + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          color: p.color,
          size: 1.5 + Math.random() * 2,
          alpha: 0.85,
          decay: 0.06,
        });
      }

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
      if (p.gravity) {
        p.vy += p.gravity;
      }
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
        if (
          tile === TileType.FLOOR ||
          tile === TileType.STAIRS_DOWN ||
          tile === TileType.CHEST ||
          tile === TileType.MERCHANT ||
          tile === TileType.SHRINE ||
          tile === TileType.URN ||
          tile === TileType.PACT ||
          tile === TileType.SOUL ||
          tile === TileType.SIGIL ||
          tile === TileType.VAULT
        ) {
          if (tile === TileType.STAIRS_DOWN) ctx.fillStyle = "#ecc94b";
          else if (tile === TileType.MERCHANT) ctx.fillStyle = "#b794f4";
          else if (tile === TileType.SHRINE) ctx.fillStyle = "#38b2ac";
          else if (tile === TileType.CHEST) ctx.fillStyle = "#ed8936";
          else if (tile === TileType.PACT) ctx.fillStyle = "#f56565";
          else if (tile === TileType.SOUL) ctx.fillStyle = "#d6bcfa";
          else if (tile === TileType.SIGIL) ctx.fillStyle = "#63b3ed";
          else if (tile === TileType.VAULT) ctx.fillStyle = "#d69e2e";
          else ctx.fillStyle = "#2d3748";
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

  _drawHoverReticle(ctx, tx, ty, ts, timestamp) {
    const px = tx * ts;
    const py = ty * ts;
    const pulse = (Math.sin(timestamp * 0.007) + 1) * 0.5;

    ctx.save();
    ctx.strokeStyle = `rgba(236, 201, 75, ${0.45 + pulse * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);

    // Corner brackets
    const cLen = 6;
    ctx.strokeStyle = "#ecc94b";
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(px, py + cLen);
    ctx.lineTo(px, py);
    ctx.lineTo(px + cLen, py);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(px + ts - cLen, py);
    ctx.lineTo(px + ts, py);
    ctx.lineTo(px + ts, py + cLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(px, py + ts - cLen);
    ctx.lineTo(px, py + ts);
    ctx.lineTo(px + cLen, py + ts);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(px + ts - cLen, py + ts);
    ctx.lineTo(px + ts, py + ts);
    ctx.lineTo(px + ts, py + ts - cLen);
    ctx.stroke();

    ctx.restore();
  }

  _drawHoverTooltip(ctx, tx, ty, ts, monsters, dungeon) {
    const monster = monsters.find((m) => m.x === tx && m.y === ty && m.hp > 0);
    const px = tx * ts;
    const py = ty * ts;

    if (monster) {
      ctx.save();
      const effects = [];
      if (monster.status_effects) {
        for (const key of ["poison", "burn", "stun"]) {
          const turns = monster.status_effects[key];
          if (turns) effects.push(`${key} ${turns}`);
        }
      }
      const affix = monster.champion_affix || (monster.is_boss ? "Boss" : "");
      const cardW = 148;
      const cardH = effects.length ? 62 : 50;
      const cardX = px + ts / 2 - cardW / 2;
      const cardY = py - cardH - 10;

      ctx.fillStyle = "rgba(10, 14, 22, 0.94)";
      ctx.strokeStyle = monster.is_champion ? "#d69e2e" : (monster.is_boss ? "#9f7aea" : "#4a5568");
      ctx.lineWidth = 1.5;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      // Title
      ctx.fillStyle = monster.is_champion ? "#f6ad55" : (monster.is_boss ? "#b794f4" : "#e2e8f0");
      ctx.font = "bold 11px sans-serif";
      const title = monster.is_champion ? `★ ${monster.name}` : monster.name;
      ctx.fillText(title, cardX + 6, cardY + 14);
      if (affix) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#f6ad55";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(affix.toUpperCase(), cardX + cardW - 6, cardY + 13);
        ctx.textAlign = "start";
      }

      // HP Bar inside tooltip
      const barX = cardX + 6;
      const barY = cardY + 20;
      const barW = cardW - 12;
      const barH = 7;
      const hpPct = Math.max(0, monster.hp / monster.max_hp);

      ctx.fillStyle = "#1a202c";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.4 ? "#e53e3e" : "#fc8181";
      ctx.fillRect(barX, barY, Math.floor(barW * hpPct), barH);

      ctx.fillStyle = "#fff";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${monster.hp}/${monster.max_hp} HP`, barX + barW / 2, barY + 6.5);
      ctx.textAlign = "start";

      // Stats
      ctx.fillStyle = "#a0aec0";
      ctx.font = "10px sans-serif";
      const statTxt = `ATK: ${monster.attack}   DEF: ${monster.defense}`;
      ctx.fillText(statTxt, cardX + 6, cardY + 41);
      if (effects.length) {
        ctx.fillStyle = "#68d391";
        ctx.font = "9px sans-serif";
        ctx.fillText(effects.join("   "), cardX + 6, cardY + 56);
      }

      ctx.restore();
      return;
    }

    // Interactive props: the altar and the objective props explain themselves on hover
    // so a player does not have to step into a bargain to learn its price.
    const prop = this._propAt(tx, ty, dungeon);
    if (prop) {
      const cardW = 176;
      const cardH = 58;
      // World coordinates: the caller has already applied the camera translation, so a
      // screen-space clamp here would draw the card far from the prop it explains.
      const cardX = px + ts / 2 - cardW / 2;
      const cardY = py - cardH - 10;
      ctx.save();
      ctx.fillStyle = "rgba(10, 14, 22, 0.94)";
      ctx.strokeStyle = prop.border;
      ctx.lineWidth = 1.5;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      ctx.fillStyle = prop.color;
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(prop.title, cardX + 6, cardY + 14);
      ctx.fillStyle = "#cbd5e0";
      ctx.font = "10px sans-serif";
      prop.lines.forEach((line, index) => {
        ctx.fillText(line, cardX + 6, cardY + 29 + index * 13);
      });
      ctx.restore();
    }
  }

  _propAt(tx, ty, dungeon) {
    if (!dungeon) return null;
    const at = (entry) => entry && entry.x === tx && entry.y === ty;
    const pact = (dungeon.pacts || []).find((p) => at(p) && !p.used);
    if (pact) {
      return {
        title: "🕯️ Black Pact Altar",
        border: "#742a2a",
        color: "#fc8181",
        lines: ["Three bargains, each with a price.", "Step onto it to choose or refuse."],
      };
    }
    const soul = (dungeon.souls || []).find((s) => at(s) && !s.resolved);
    if (soul) {
      return {
        title: "🕯️ A Soul Without a Grave",
        border: "#6b46c1",
        color: "#d6bcfa",
        lines: ["It kept a door no one came through.", "Speak with it for a gift or a story."],
      };
    }
    const sigil = (dungeon.sigils || []).find((s) => at(s) && !s.collected);
    if (sigil) {
      return {
        title: "🔑 Floor Sigil",
        border: "#2b6cb0",
        color: "#90cdf4",
        lines: ["Three sigils open the sealed vault.", "Carry it to the vault door."],
      };
    }
    if (at(dungeon.vault) && !dungeon.vault.opened) {
      return {
        title: "🔒 Sealed Vault",
        border: "#975a16",
        color: "#fbd38d",
        lines: [`Sockets filled: ${dungeon.sigilsHeld || 0}/3.`, "A legendary relic waits inside."],
      };
    }
    return null;
  }
}
