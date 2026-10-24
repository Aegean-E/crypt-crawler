/**
 * Main game engine for Crypt-Crawler: turn management, input handling, and loop.
 */

import { sounds } from "./audio.js";
import { ClientDungeon, TileType } from "./dungeon.js";
import { DungeonRenderer } from "./renderer.js";
import { UIController } from "./ui.js";

export class GameEngine {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.renderer = new DungeonRenderer(this.canvas);
    this.ui = new UIController();

    this.dungeon = null;
    this.player = null;
    this.monsters = [];
    this.turn = 1;
    this.depth = 1;
    this.kills = 0;
    this.gameOver = false;
    this.victory = false;
    this.animFrameId = null;

    this._setupCallbacks();
    this._setupInputListeners();
  }

  async start(seed = null, depth = 1) {
    this.depth = depth;
    this.turn = 1;
    this.gameOver = false;
    this.victory = false;

    try {
      const url = `/api/new-game?seed=${seed || Date.now() % 1000000}&depth=${this.depth}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load map from server");
      const data = await res.json();

      this.dungeon = new ClientDungeon(data.dungeon);
      this.player = data.player;
      this.monsters = data.monsters;
    } catch (err) {
      console.warn("Server API fallback to offline procedural generator:", err);
      this._generateOfflineState(seed, depth);
    }

    // Initialize FOV
    this.dungeon.updateFOV(this.player.x, this.player.y, 7);

    // Initial UI update
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.ui.logMessage(`Entered Depth B${this.depth}F of the ancient catacombs.`, "system");

    // Start animation render loop
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = (ts) => {
      this.renderer.render(this.dungeon, this.player, this.monsters, ts);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  _generateOfflineState(seed, depth) {
    // Robust client-side fallback if server API is unavailable
    const w = 45;
    const h = 30;
    const tiles = Array.from({ length: h }, () => Array(w).fill(TileType.WALL));

    // Carve 5 simple rooms
    const rooms = [];
    for (let r = 0; r < 5; r++) {
      const rw = 6;
      const rh = 6;
      const rx = 2 + r * 8;
      const ry = 4 + (r % 2) * 8;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, center: [rx + 3, ry + 3] });
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          tiles[y][x] = TileType.FLOOR;
        }
      }
      if (r > 0) {
        // connect to prev room
        const px = rooms[r - 1].center[0];
        const py = rooms[r - 1].center[1];
        for (let x = Math.min(px, rx + 3); x <= Math.max(px, rx + 3); x++) tiles[py][x] = TileType.FLOOR;
        for (let y = Math.min(py, ry + 3); y <= Math.max(py, ry + 3); y++) tiles[y][rx + 3] = TileType.FLOOR;
      }
    }

    const spawn = rooms[0].center;
    const stairs = rooms[rooms.length - 1].center;
    tiles[stairs[1]][stairs[0]] = TileType.STAIRS_DOWN;

    this.dungeon = new ClientDungeon({
      width: w,
      height: h,
      seed: seed || 1234,
      depth: depth,
      tiles: tiles,
      player_spawn: spawn,
      stairs_pos: stairs,
      rooms: rooms,
      chests: [[rooms[1].center[0], rooms[1].center[1]]],
      traps: [],
    });

    this.player = {
      name: "Champion",
      x: spawn[0],
      y: spawn[1],
      hp: 60,
      max_hp: 60,
      mana: 30,
      max_mana: 30,
      level: 1,
      xp: 0,
      next_xp: 50,
      gold: 20,
      attack: 8,
      defense: 3,
      inventory: [
        { id: "potion_health", name: "Health Elixir", type: "potion", description: "Restores 35 HP.", stats: { heal_hp: 35 } },
        { id: "sword_iron", name: "Forged Iron Sword", type: "weapon", description: "+4 ATK.", stats: { attack: 4 } },
      ],
      equipped: { weapon: null, armor: null, ring: null },
    };

    this.monsters = [
      { name: "Crypt Skeleton", type: "skeleton", x: rooms[1].center[0] + 1, y: rooms[1].center[1], hp: 18, max_hp: 18, attack: 6, defense: 2, xp_reward: 20, gold_reward: 10, loot_drop: "potion_health" },
      { name: "Sneaky Goblin", type: "goblin", x: rooms[2].center[0], y: rooms[2].center[1], hp: 12, max_hp: 12, attack: 5, defense: 1, xp_reward: 15, gold_reward: 15, loot_drop: null },
    ];
  }

  _setupCallbacks() {
    this.ui.onUseItem = (idx) => this.useInventoryItem(idx);
    this.ui.onDropItem = (idx) => this.dropInventoryItem(idx);
    this.ui.onUnequip = (slot) => this.unequipSlot(slot);
    this.ui.onModalClose = () => {
      if (this.gameOver || this.victory) {
        this.start(Date.now() % 1000000, 1);
      }
    };
  }

  _setupInputListeners() {
    window.addEventListener("keydown", (e) => {
      if (this.gameOver || this.victory) return;

      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
        case "k":
        case "8":
          dy = -1;
          break;
        case "ArrowDown":
        case "s":
        case "S":
        case "j":
        case "2":
          dy = 1;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
        case "h":
        case "4":
          dx = -1;
          break;
        case "ArrowRight":
        case "d":
        case "D":
        case "l":
        case "6":
          dx = 1;
          break;
        case "y":
        case "7":
          dx = -1;
          dy = -1;
          break;
        case "u":
        case "9":
          dx = 1;
          dy = -1;
          break;
        case "b":
        case "1":
          if (e.key === "1") {
            this.tacticalStrike();
            return;
          }
          dx = -1;
          dy = 1;
          break;
        case "n":
        case "3":
          if (e.key === "3") {
            this.tacticalHeal();
            return;
          }
          dx = 1;
          dy = 1;
          break;
        case " ":
        case "5":
        case ".":
          this.waitTurn();
          return;
        case "2":
          this.tacticalFireball();
          return;
        case "4":
          this.quickPotion();
          return;
        default:
          return;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        this.stepPlayer(dx, dy);
      }
    });

    // Action deck buttons
    document.getElementById("btnActionMelee").addEventListener("click", () => this.tacticalStrike());
    document.getElementById("btnActionFireball").addEventListener("click", () => this.tacticalFireball());
    document.getElementById("btnActionHeal").addEventListener("click", () => this.tacticalHeal());
    document.getElementById("btnActionPotion").addEventListener("click", () => this.quickPotion());
    document.getElementById("btnActionWait").addEventListener("click", () => this.waitTurn());

    // D-Pad buttons
    document.getElementById("btnDpadUp").addEventListener("click", () => this.stepPlayer(0, -1));
    document.getElementById("btnDpadDown").addEventListener("click", () => this.stepPlayer(0, 1));
    document.getElementById("btnDpadLeft").addEventListener("click", () => this.stepPlayer(-1, 0));
    document.getElementById("btnDpadRight").addEventListener("click", () => this.stepPlayer(1, 0));
    document.getElementById("btnDpadCenter").addEventListener("click", () => this.waitTurn());

    // Header buttons
    document.getElementById("btnAudioToggle").addEventListener("click", (e) => {
      const isMuted = sounds.toggleMute();
      e.target.textContent = isMuted ? "🔇" : "🔊";
    });

    document.getElementById("btnRestart").addEventListener("click", () => {
      this.start(Date.now() % 1000000, 1);
    });

    document.getElementById("btnHelp").addEventListener("click", () => {
      this.ui.showModal(
        "Crypt-Crawler Guide",
        `<p>Welcome to <strong>Crypt-Crawler</strong>, a tactical turn-based dungeon crawler!</p>
         <br>
         <p><strong>Controls:</strong></p>
         <ul style="margin-left: 20px; line-height: 1.6;">
           <li><strong>Move / Attack:</strong> Arrow keys, WASD, Vi keys (HJKL), Numpad</li>
           <li><strong>Wait Turn:</strong> Spacebar or 5</li>
           <li><strong>Action Deck:</strong> [1] Strike, [2] Fireball, [3] Heal, [4] Potion, [5] Wait</li>
           <li><strong>Inventory:</strong> Click an item on the right panel to Equip or Use</li>
         </ul>
         <br>
         <p>Descend stairs to reach deeper floors, defeat monsters for XP and loot, and survive the tomb!</p>`
      );
    });
  }

  stepPlayer(dx, dy) {
    if (this.gameOver || this.victory) return;

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    // Check monster in target tile
    const monster = this.monsters.find((m) => m.x === nx && m.y === ny && m.hp > 0);
    if (monster) {
      this.attackMonster(monster);
      this.finishPlayerTurn();
      return;
    }

    // Check walkable tile
    if (!this.dungeon.isWalkable(nx, ny)) {
      return;
    }

    // Move player
    this.player.x = nx;
    this.player.y = ny;
    sounds.playStep();

    // Check chest
    const chest = this.dungeon.chests.find((c) => c.x === nx && c.y === ny && !c.opened);
    if (chest) {
      chest.opened = true;
      sounds.playChest();
      const goldFound = 15 + Math.floor(Math.random() * 20);
      this.player.gold += goldFound;
      this.renderer.addFloatingText(`+${goldFound} 🪙`, nx, ny, "#ecc94b");
      this.renderer.addParticles(nx, ny, "#ecc94b", 12);
      this.ui.logMessage(`Opened a locked chest! Found ${goldFound} gold!`, "loot");

      // Chance for potion or relic drop
      if (Math.random() < 0.7 && this.player.inventory.length < 12) {
        const dropItem = {
          id: "potion_mana",
          name: "Aether Potion",
          type: "potion",
          description: "Restores 25 Mana.",
          stats: { restore_mana: 25 },
        };
        this.player.inventory.push(dropItem);
        this.ui.logMessage(`Found item in chest: ${dropItem.name}!`, "loot");
      }
    }

    // Check trap
    const trap = this.dungeon.traps.find((t) => t.x === nx && t.y === ny && !t.triggered);
    if (trap) {
      trap.triggered = true;
      const trapDmg = 8 + Math.floor(Math.random() * 6);
      this.player.hp = Math.max(0, this.player.hp - trapDmg);
      sounds.playHit(false);
      this.renderer.addFloatingText(`-${trapDmg}`, nx, ny, "#ff2222");
      this.ui.logMessage(`⚠️ Triggered a spike trap! Took ${trapDmg} damage!`, "hit");
      if (this.player.hp <= 0) {
        this.handlePlayerDeath("a concealed spike trap");
        return;
      }
    }

    // Check stairs down
    if (this.dungeon.tiles[ny][nx] === TileType.STAIRS_DOWN) {
      if (this.depth >= 3) {
        this.handleVictory();
        return;
      } else {
        this.depth += 1;
        this.ui.logMessage(`You descended into Depth B${this.depth}F! The air grows colder...`, "system");
        this.start(Date.now() % 1000000, this.depth);
        return;
      }
    }

    this.finishPlayerTurn();
  }

  attackMonster(monster) {
    const atk = this.player.attack;
    const def = monster.defense;
    const baseDmg = Math.max(1, atk - def);
    const isCrit = Math.random() < 0.15;
    const dmg = Math.floor(baseDmg * (isCrit ? 1.5 : (0.85 + Math.random() * 0.3)));

    monster.hp = Math.max(0, monster.hp - dmg);
    sounds.playHit(isCrit);
    this.renderer.addFloatingText(isCrit ? `CRIT! -${dmg}` : `-${dmg}`, monster.x, monster.y, isCrit ? "#f6ad55" : "#ff4444");
    this.renderer.addParticles(monster.x, monster.y, isCrit ? "#f6ad55" : "#e53e3e", isCrit ? 12 : 6);

    const critPrefix = isCrit ? "CRITICAL HIT! " : "";
    this.ui.logMessage(`You strike ${monster.name} for ${critPrefix}${dmg} damage.`, isCrit ? "crit" : "hit");

    if (monster.hp <= 0) {
      this.kills += 1;
      this.player.gold += monster.gold_reward;
      this.ui.logMessage(`Defeated ${monster.name}! Gained ${monster.xp_reward} XP, ${monster.gold_reward} Gold.`, "loot");

      // XP & Level up
      this.player.xp += monster.xp_reward;
      while (this.player.xp >= this.player.next_xp) {
        this.player.xp -= this.player.next_xp;
        this.player.level += 1;
        this.player.next_xp = Math.floor(this.player.next_xp * 1.5);
        this.player.max_hp += 10;
        this.player.hp = Math.min(this.player.hp + 10, this.player.max_hp);
        this.player.max_mana += 5;
        this.player.mana = Math.min(this.player.mana + 5, this.player.max_mana);
        this.player.attack += 2;
        this.player.defense += 1;
        sounds.playLevelUp();
        this.renderer.addFloatingText("LEVEL UP!", this.player.x, this.player.y, "#4fd1c5");
        this.ui.logMessage(`🌟 LEVEL UP! You reached Level ${this.player.level}!`, "level");
      }
    }
  }

  tacticalStrike() {
    // Attack adjacent monster
    const adj = this.monsters.find((m) => {
      if (m.hp <= 0) return false;
      const d = Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y);
      return d === 1;
    });
    if (adj) {
      this.attackMonster(adj);
      this.finishPlayerTurn();
    } else {
      this.ui.logMessage("No enemy in melee range to strike.", "system");
    }
  }

  tacticalFireball() {
    if (this.player.mana < 10) {
      this.ui.logMessage("Not enough mana for Fireball! (Needs 10 MP)", "system");
      return;
    }

    // Find nearest visible monster
    let target = null;
    let minDist = 999;
    for (const m of this.monsters) {
      if (m.hp > 0 && this.dungeon.isVisible(m.x, m.y)) {
        const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
        if (d < minDist) {
          minDist = d;
          target = m;
        }
      }
    }

    if (!target) {
      this.ui.logMessage("No visible enemies within sight to target Fireball.", "system");
      return;
    }

    this.player.mana -= 10;
    const dmg = 24 + Math.floor(Math.random() * 10);
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playSpell("fireball");
    this.renderer.addFloatingText(`🔥 -${dmg}`, target.x, target.y, "#f6ad55");
    this.renderer.addParticles(target.x, target.y, "#dd6b20", 16);
    this.ui.logMessage(`Cast Fireball at ${target.name} for ${dmg} fire damage!`, "crit");

    if (target.hp <= 0) {
      this.kills += 1;
      this.player.gold += target.gold_reward;
      this.player.xp += target.xp_reward;
      this.ui.logMessage(`${target.name} incinerated! Gained ${target.xp_reward} XP.`, "loot");
    }

    this.finishPlayerTurn();
  }

  tacticalHeal() {
    if (this.player.mana < 8) {
      this.ui.logMessage("Not enough mana for Divine Healing! (Needs 8 MP)", "system");
      return;
    }

    this.player.mana -= 8;
    const healAmt = 22 + Math.floor(Math.random() * 12);
    const oldHp = this.player.hp;
    this.player.hp = Math.min(this.player.max_hp, this.player.hp + healAmt);
    const restored = this.player.hp - oldHp;

    sounds.playSpell("heal");
    this.renderer.addFloatingText(`+${restored} HP`, this.player.x, this.player.y, "#68d391");
    this.renderer.addParticles(this.player.x, this.player.y, "#38a169", 14);
    this.ui.logMessage(`Divine light restored ${restored} HP.`, "heal");

    this.finishPlayerTurn();
  }

  quickPotion() {
    const potIdx = this.player.inventory.findIndex((i) => i.type === "potion");
    if (potIdx >= 0) {
      this.useInventoryItem(potIdx);
      this.finishPlayerTurn();
    } else {
      this.ui.logMessage("No potions available in your backpack!", "system");
    }
  }

  waitTurn() {
    // Regenerate 1 MP on wait
    if (this.player.mana < this.player.max_mana) {
      this.player.mana += 1;
    }
    this.ui.logMessage("You paused to catch your breath and recover focus.", "system");
    this.finishPlayerTurn();
  }

  useInventoryItem(idx) {
    if (idx < 0 || idx >= this.player.inventory.length) return;
    const item = this.player.inventory[idx];

    if (item.type === "potion") {
      sounds.playPotion();
      const heal = item.stats?.heal_hp || 0;
      const mana = item.stats?.restore_mana || 0;
      if (heal > 0) {
        this.player.hp = Math.min(this.player.max_hp, this.player.hp + heal);
        this.renderer.addFloatingText(`+${heal} HP`, this.player.x, this.player.y, "#68d391");
        this.ui.logMessage(`Drank ${item.name}: Restored ${heal} HP.`, "heal");
      }
      if (mana > 0) {
        this.player.mana = Math.min(this.player.max_mana, this.player.mana + mana);
        this.renderer.addFloatingText(`+${mana} MP`, this.player.x, this.player.y, "#63b3ed");
        this.ui.logMessage(`Drank ${item.name}: Restored ${mana} Mana.`, "heal");
      }
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
      this.finishPlayerTurn();
    } else if (["weapon", "armor", "ring"].includes(item.type)) {
      const slot = item.type;
      const oldEquip = this.player.equipped[slot];
      this.player.inventory.splice(idx, 1);
      if (oldEquip) {
        this.player.inventory.push(oldEquip);
      }
      this.player.equipped[slot] = item;

      // Recalculate stats
      this._recalculatePlayerStats();
      this.ui.clearItemSelection();
      this.ui.logMessage(`Equipped ${item.name}.`, "system");
      this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    }
  }

  dropInventoryItem(idx) {
    if (idx < 0 || idx >= this.player.inventory.length) return;
    const item = this.player.inventory.splice(idx, 1)[0];
    this.ui.clearItemSelection();
    this.ui.logMessage(`Dropped ${item.name} onto the stone floor.`, "system");
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
  }

  unequipSlot(slot) {
    const item = this.player.equipped[slot];
    if (!item) return;
    if (this.player.inventory.length >= 12) {
      this.ui.logMessage("Backpack is completely full! Cannot unequip.", "system");
      return;
    }
    this.player.equipped[slot] = null;
    this.player.inventory.push(item);
    this._recalculatePlayerStats();
    this.ui.logMessage(`Unequipped ${item.name}.`, "system");
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
  }

  _recalculatePlayerStats() {
    let atk = 8 + (this.player.level - 1) * 2;
    let def = 3 + (this.player.level - 1) * 1;
    for (const slot of Object.values(this.player.equipped)) {
      if (slot && slot.stats) {
        if (slot.stats.attack) atk += slot.stats.attack;
        if (slot.stats.defense) def += slot.stats.defense;
      }
    }
    this.player.attack = atk;
    this.player.defense = def;
  }

  finishPlayerTurn() {
    this.turn += 1;
    this.dungeon.updateFOV(this.player.x, this.player.y, 7);

    // Enemy AI Turns
    this.processEnemyTurns();

    // Check player status
    if (this.player.hp <= 0) {
      this.handlePlayerDeath("in mortal combat");
    }

    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
  }

  processEnemyTurns() {
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue;

      const dist = Math.hypot(monster.x - this.player.x, monster.y - this.player.y);
      const isVisible = this.dungeon.isVisible(monster.x, monster.y);

      // If adjacent: attack player
      if (Math.abs(monster.x - this.player.x) + Math.abs(monster.y - this.player.y) === 1) {
        const baseDmg = Math.max(1, monster.attack - this.player.defense);
        const dmg = Math.max(1, Math.floor(baseDmg * (0.8 + Math.random() * 0.4)));
        this.player.hp = Math.max(0, this.player.hp - dmg);
        sounds.playHit(false);
        this.renderer.addFloatingText(`-${dmg}`, this.player.x, this.player.y, "#ff3333");
        this.ui.logMessage(`${monster.name} attacks you for ${dmg} damage!`, "hit");
      } else if (isVisible && dist <= 6) {
        // Simple chase: step toward player
        const dx = Math.sign(this.player.x - monster.x);
        const dy = Math.sign(this.player.y - monster.y);

        let nx = monster.x + dx;
        let ny = monster.y;
        if (dx !== 0 && this.dungeon.isWalkable(nx, ny) && !this._isOccupied(nx, ny)) {
          monster.x = nx;
        } else {
          nx = monster.x;
          ny = monster.y + dy;
          if (dy !== 0 && this.dungeon.isWalkable(nx, ny) && !this._isOccupied(nx, ny)) {
            monster.y = ny;
          }
        }
      }
    }
  }

  _isOccupied(x, y) {
    if (this.player.x === x && this.player.y === y) return true;
    return this.monsters.some((m) => m.x === x && m.y === y && m.hp > 0);
  }

  handlePlayerDeath(cause = "unknown") {
    this.gameOver = true;
    this.ui.showModal(
      "💀 YOU PERISHED IN THE CRYPT",
      `<p>Your torch flickers and dies... You fell to ${cause}.</p>
       <br>
       <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 4px; border: 1px solid #742a2a;">
         <p><strong>Final Depth:</strong> B${this.depth}F</p>
         <p><strong>Turns Survived:</strong> ${this.turn}</p>
         <p><strong>Monsters Slain:</strong> ${this.kills}</p>
         <p><strong>Gold Gathered:</strong> ${this.player.gold} 🪙</p>
       </div>
       <br>
       <p>Click below to enter the catacombs anew.</p>`
    );
  }

  handleVictory() {
    this.victory = true;
    this.ui.showModal(
      "🏆 TRIUMPH OF THE PALADIN",
      `<p>You conquered the deepest vault and recovered the legendary Runic Relic!</p>
       <br>
       <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 4px; border: 1px solid #d69e2e;">
         <p><strong>Final Level:</strong> ${this.player.level}</p>
         <p><strong>Monsters Slain:</strong> ${this.kills}</p>
         <p><strong>Total Gold:</strong> ${this.player.gold} 🪙</p>
       </div>
       <br>
       <p>The light returns to the realm. Play again?</p>`
    );
  }
}

// Start game on page load and expose globally for Playwright headless inspection
window.addEventListener("DOMContentLoaded", () => {
  const engine = new GameEngine();
  window.gameEngine = engine;
  engine.start();
});
