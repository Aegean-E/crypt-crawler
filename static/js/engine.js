/**
 * Main game engine for Crypt-Crawler: turn management, input handling, combat,
 * status effects, interactive shrines/urns, boss battles, and ambient music.
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
    this.merchantStock = [];
    this.turn = 1;
    this.depth = 1;
    this.kills = 0;
    this.killStreak = 0;
    this.turnsSinceKill = 0;
    this.heroClass = "paladin";
    this.gameOver = false;
    this.victory = false;
    this.animFrameId = null;
    this.musicStarted = false;

    this._setupCallbacks();
    this._setupInputListeners();
  }

  async start(seed = null, depth = 1, heroClass = "paladin", allowResume = true) {
    this.depth = depth;
    this.turn = 1;
    this.killStreak = 0;
    this.turnsSinceKill = 0;
    this.gameOver = false;
    this.victory = false;
    this.heroClass = heroClass || "paladin";

    // Attempt to resume saved run if starting fresh at depth 1 without explicit seed
    if (allowResume && depth === 1 && !seed) {
      const saved = this.loadSavedRun();
      if (saved) {
        this.player = saved.player;
        this.dungeon = new ClientDungeon(saved.dungeon);
        this.monsters = saved.monsters;
        this.turn = saved.turn;
        this.depth = saved.depth;
        this.kills = saved.kills;
        this.heroClass = saved.heroClass || this.player.hero_class || "paladin";
        sounds.setBiome(this.dungeon.biome);
        this.dungeon.updateFOV(this.player.x, this.player.y, 7);
        this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
        this.ui.logMessage("⚔️ Resumed your ongoing dungeon run from crystal memory.", "system");
        this._startRenderLoop();
        return;
      }
    }

    try {
      const url = `/api/new-game?seed=${seed || Date.now() % 1000000}&depth=${this.depth}&class=${this.heroClass}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load map from server");
      const data = await res.json();

      this.dungeon = new ClientDungeon(data.dungeon);
      this.player = data.player;
      this.monsters = data.monsters;
      this.merchantStock = data.merchant_stock || [];
    } catch (err) {
      console.warn("Server API fallback to offline procedural generator:", err);
      this._generateOfflineState(seed, depth, this.heroClass);
    }

    sounds.setBiome(this.dungeon.biome);

    // Initialize FOV
    this.dungeon.updateFOV(this.player.x, this.player.y, 7);

    // Initial UI update
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.ui.logMessage(`Entered Depth B${this.depth}F of the ancient catacombs as ${this.player.class_title || "Champion"}.`, "system");

    this._startRenderLoop();
    this.saveGameState();
  }

  _startRenderLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = (ts) => {
      this.renderer.render(this.dungeon, this.player, this.monsters, ts);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  _generateOfflineState(seed, depth, heroClass = "paladin") {
    const w = 45;
    const h = 30;
    const tiles = Array.from({ length: h }, () => Array(w).fill(TileType.WALL));

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
        const px = rooms[r - 1].center[0];
        const py = rooms[r - 1].center[1];
        for (let x = Math.min(px, rx + 3); x <= Math.max(px, rx + 3); x++) tiles[py][x] = TileType.FLOOR;
        for (let y = Math.min(py, ry + 3); y <= Math.max(py, ry + 3); y++) tiles[y][rx + 3] = TileType.FLOOR;
      }
    }

    const spawn = rooms[0].center;
    const stairs = rooms[rooms.length - 1].center;
    tiles[stairs[1]][stairs[0]] = TileType.STAIRS_DOWN;

    const merchants = [];
    if (depth >= 2 && rooms.length >= 2) {
      const mx = rooms[1].center[0];
      const my = rooms[1].center[1];
      tiles[my][mx] = TileType.MERCHANT;
      merchants.push([mx, my]);
    }

    this.dungeon = new ClientDungeon({
      width: w,
      height: h,
      seed: seed || 1234,
      depth: depth,
      tiles: tiles,
      player_spawn: spawn,
      stairs_pos: stairs,
      rooms: rooms,
      chests: [[rooms[1].center[0] + 1, rooms[1].center[1] + 1]],
      traps: [],
      shrines: [[rooms[2].center[0], rooms[2].center[1]]],
      urns: [[rooms[3].center[0], rooms[3].center[1]]],
      sconces: [[rooms[0].center[0], rooms[0].y - 1]],
      merchants: merchants,
    });

    if (heroClass === "rogue") {
      this.player = {
        name: "Lyra",
        hero_class: "rogue",
        class_title: "Shadow Rogue",
        crit_chance: 0.30,
        x: spawn[0],
        y: spawn[1],
        hp: 48,
        max_hp: 48,
        mana: 25,
        max_mana: 25,
        level: 1,
        xp: 0,
        next_xp: 50,
        gold: 35,
        attack: 9,
        defense: 2,
        inventory: [
          { id: "potion_health", name: "Health Elixir", type: "potion", rarity: "common", description: "Restores 35 HP.", stats: { heal_hp: 35 } },
          { id: "dagger_poison", name: "Serpent's Fang Dagger", type: "weapon", rarity: "rare", description: "+5 ATK, poisons on strike.", stats: { attack: 5, poison_chance: 40 } },
          { id: "armor_leather", name: "Hardened Leather Armor", type: "armor", rarity: "common", description: "+2 DEF.", stats: { defense: 2 } },
        ],
        equipped: { weapon: null, armor: null, ring: null },
        status_effects: {},
      };
    } else if (heroClass === "mage") {
      this.player = {
        name: "Ignis",
        hero_class: "mage",
        class_title: "Arcane Mage",
        crit_chance: 0.10,
        x: spawn[0],
        y: spawn[1],
        hp: 42,
        max_hp: 42,
        mana: 55,
        max_mana: 55,
        level: 1,
        xp: 0,
        next_xp: 50,
        gold: 25,
        attack: 6,
        defense: 1,
        inventory: [
          { id: "potion_mana", name: "Aether Potion", type: "potion", rarity: "common", description: "Restores 25 MP.", stats: { restore_mana: 25 } },
          { id: "staff_arcane", name: "Staff of Arcane Focus", type: "weapon", rarity: "common", description: "+5 ATK, +15 Max Mana.", stats: { attack: 5, max_mana: 15 } },
          { id: "robe_mystic", name: "Runed Silk Robe", type: "armor", rarity: "common", description: "+2 DEF, +10 Max Mana.", stats: { defense: 2, max_mana: 10 } },
          { id: "scroll_fireball", name: "Scroll of Inferno", type: "scroll", rarity: "common", description: "Deals 30 fire damage.", stats: { spell_damage: 30 } },
        ],
        equipped: { weapon: null, armor: null, ring: null },
        status_effects: {},
      };
    } else {
      this.player = {
        name: "Valerius",
        hero_class: "paladin",
        class_title: "Crusader Paladin",
        crit_chance: 0.15,
        x: spawn[0],
        y: spawn[1],
        hp: 65,
        max_hp: 65,
        mana: 30,
        max_mana: 30,
        level: 1,
        xp: 0,
        next_xp: 50,
        gold: 25,
        attack: 8,
        defense: 4,
        inventory: [
          { id: "potion_health", name: "Health Elixir", type: "potion", rarity: "common", description: "Restores 35 HP.", stats: { heal_hp: 35 } },
          { id: "sword_iron", name: "Forged Iron Sword", type: "weapon", rarity: "common", description: "+4 ATK.", stats: { attack: 4 } },
          { id: "armor_leather", name: "Hardened Leather Armor", type: "armor", rarity: "common", description: "+2 DEF.", stats: { defense: 2 } },
        ],
        equipped: { weapon: null, armor: null, ring: null },
        status_effects: {},
      };
    }

    if (depth >= 3) {
      this.monsters = [
        { name: "Arch-Lich Malakor", type: "boss_lich", x: stairs[0], y: stairs[1], hp: 95, max_hp: 95, attack: 13, defense: 5, xp_reward: 200, gold_reward: 150, loot_drop: "crown_eternity", is_boss: true, status_effects: {} },
        { name: "Crypt Skeleton", type: "skeleton", x: stairs[0] - 1, y: stairs[1], hp: 20, max_hp: 20, attack: 6, defense: 2, xp_reward: 20, gold_reward: 10, loot_drop: null, is_boss: false, status_effects: {} },
      ];
    } else {
      const isChamp = Math.random() < 0.2;
      const affix = isChamp ? "Molten" : null;
      this.monsters = [
        {
          name: isChamp ? "Molten Crypt Skeleton" : "Crypt Skeleton",
          type: "skeleton",
          x: rooms[1].center[0] + 1,
          y: rooms[1].center[1],
          hp: isChamp ? 28 : 18,
          max_hp: isChamp ? 28 : 18,
          attack: 6,
          defense: 2,
          xp_reward: isChamp ? 40 : 20,
          gold_reward: isChamp ? 25 : 10,
          loot_drop: "potion_health",
          is_boss: false,
          is_champion: isChamp,
          champion_affix: affix,
          status_effects: {},
        },
        {
          name: "Venomous Brood-Spider",
          type: "spider",
          x: rooms[2].center[0],
          y: rooms[2].center[1],
          hp: 12,
          max_hp: 12,
          attack: 6,
          defense: 1,
          xp_reward: 18,
          gold_reward: 12,
          loot_drop: "dagger_poison",
          is_boss: false,
          is_champion: false,
          champion_affix: null,
          status_effects: {},
        },
      ];
    }
  }

  _setupCallbacks() {
    this.ui.onUseItem = (idx) => this.useInventoryItem(idx);
    this.ui.onDropItem = (idx) => this.dropInventoryItem(idx);
    this.ui.onUnequip = (slot) => this.unequipSlot(slot);
    this.ui.onModalClose = () => {
      if (this.gameOver || this.victory) {
        this.clearSavedRun();
        this.start(Date.now() % 1000000, 1, this.heroClass, false);
      }
    };
  }

  _triggerMusicStart() {
    if (!this.musicStarted) {
      this.musicStarted = true;
      sounds.startMusic();
    }
  }

  _setupInputListeners() {
    window.addEventListener("keydown", (e) => {
      this._triggerMusicStart();
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
          dx = -1;
          dy = 1;
          break;
        case "n":
          dx = 1;
          dy = 1;
          break;
        case "1":
          this.triggerSlotAction(1);
          return;
        case "2":
          this.triggerSlotAction(2);
          return;
        case "3":
          this.triggerSlotAction(3);
          return;
        case "4":
          this.triggerSlotAction(4);
          return;
        case "5":
          this.triggerSlotAction(5);
          return;
        case "6":
          this.quickPotion();
          return;
        case " ":
        case ".":
          this.waitTurn();
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
    document.getElementById("btnActionMelee").addEventListener("click", () => {
      this._triggerMusicStart();
      this.triggerSlotAction(1);
    });
    document.getElementById("btnActionFireball").addEventListener("click", () => {
      this._triggerMusicStart();
      this.triggerSlotAction(2);
    });
    document.getElementById("btnActionBash").addEventListener("click", () => {
      this._triggerMusicStart();
      this.triggerSlotAction(3);
    });
    document.getElementById("btnActionHeal").addEventListener("click", () => {
      this._triggerMusicStart();
      this.triggerSlotAction(4);
    });
    document.getElementById("btnActionShieldWall").addEventListener("click", () => {
      this._triggerMusicStart();
      this.triggerSlotAction(5);
    });
    document.getElementById("btnActionPotion").addEventListener("click", () => {
      this._triggerMusicStart();
      this.quickPotion();
    });
    document.getElementById("btnActionWait").addEventListener("click", () => {
      this._triggerMusicStart();
      this.waitTurn();
    });

    // D-Pad buttons
    document.getElementById("btnDpadUp").addEventListener("click", () => this.stepPlayer(0, -1));
    document.getElementById("btnDpadDown").addEventListener("click", () => this.stepPlayer(0, 1));
    document.getElementById("btnDpadLeft").addEventListener("click", () => this.stepPlayer(-1, 0));
    document.getElementById("btnDpadRight").addEventListener("click", () => this.stepPlayer(1, 0));
    document.getElementById("btnDpadCenter").addEventListener("click", () => this.waitTurn());

    // Header buttons
    document.getElementById("btnMusicToggle").addEventListener("click", (e) => {
      const isMuted = sounds.toggleMusic();
      e.target.textContent = isMuted ? "🔇" : "🎵";
    });

    document.getElementById("btnAudioToggle").addEventListener("click", (e) => {
      const isMuted = sounds.toggleSFX();
      e.target.textContent = isMuted ? "🔇" : "🔊";
    });

    const btnRec = document.getElementById("btnRecords");
    if (btnRec) {
      btnRec.addEventListener("click", () => {
        this.ui.showHallOfRecordsModal(this.loadRecords());
      });
    }

    // Canvas Interactive Hover & Click-to-Move
    this.canvas.addEventListener("mousemove", (e) => {
      const tile = this._getTileAtPointer(e);
      if (tile) {
        this.renderer.setHoverTile(tile.x, tile.y);
      } else {
        this.renderer.setHoverTile(null, null);
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.renderer.setHoverTile(null, null);
    });

    this.canvas.addEventListener("click", (e) => {
      this._handleCanvasClick(e);
    });

    document.getElementById("btnRestart").addEventListener("click", () => {
      this.ui.showClassSelectModal((chosenClass) => {
        this.clearSavedRun();
        this.start(Date.now() % 1000000, 1, chosenClass, false);
      });
    });

    document.getElementById("btnHelp").addEventListener("click", () => {
      this.ui.showModal(
        "Crypt-Crawler Guide",
        `<p>Welcome to <strong>Crypt-Crawler</strong>, a tactical turn-based dungeon crawler!</p>
         <br>
         <p><strong>Controls & Tactics:</strong></p>
         <ul style="margin-left: 20px; line-height: 1.6;">
           <li><strong>Move / Attack:</strong> Arrow keys, WASD, Vi keys (HJKL), Numpad</li>
           <li><strong>[1] Strike:</strong> Melee strike adjacent foe</li>
           <li><strong>[2] Fireball:</strong> Ranged fire blast (10 MP, Burn effect)</li>
           <li><strong>[3] Bash:</strong> Shield bash (4 MP, Stuns enemy for 1 turn)</li>
           <li><strong>[4] Heal:</strong> Divine light (8 MP, restores HP & cleanses Poison/Burn)</li>
           <li><strong>[5] Barrier:</strong> Shield Wall (6 MP, +6 DEF for 4 turns)</li>
           <li><strong>[6] Potion:</strong> Quick-drink health or mana elixir</li>
           <li><strong>[Space] Wait:</strong> Catch breath (+1 MP, ticks effects)</li>
         </ul>
         <br>
         <p><strong>Interactive Objects:</strong></p>
         <ul style="margin-left: 20px; line-height: 1.6;">
           <li><strong>Ancient Shrines:</strong> Bestow sacred blessings (Might, Aegis, Renewal)</li>
           <li><strong>Burial Urns:</strong> Shatter for hidden coins or relics</li>
           <li><strong>Traps & Sconces:</strong> Watch out for poison/spike traps; stay near wall sconces for light!</li>
         </ul>
         <br>
         <p>Conquer Depth B3F and slay <strong>Arch-Lich Malakor</strong> to claim the <em>Crown of Eternity</em>!</p>`
      );
    });
  }

  _getTileAtPointer(e) {
    if (!this.player || !this.dungeon) return null;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const ts = this.renderer.tileSize;
    const camX = Math.floor(this.canvas.width / 2 - this.player.x * ts - ts / 2);
    const camY = Math.floor(this.canvas.height / 2 - this.player.y * ts - ts / 2);

    const tx = Math.floor((mouseX - camX) / ts);
    const ty = Math.floor((mouseY - camY) / ts);

    if (tx >= 0 && tx < this.dungeon.width && ty >= 0 && ty < this.dungeon.height) {
      return { x: tx, y: ty };
    }
    return null;
  }

  _handleCanvasClick(e) {
    if (this.gameOver || this.victory) return;
    const tile = this._getTileAtPointer(e);
    if (!tile) return;

    const dx = tile.x - this.player.x;
    const dy = tile.y - this.player.y;

    // Adjacent direct move or attack
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) {
      this.stepPlayer(dx, dy);
      return;
    }

    // Distant step via BFS pathfinding
    if (this.dungeon.isExplored(tile.x, tile.y)) {
      const path = this.dungeon.findPath([this.player.x, this.player.y], [tile.x, tile.y]);
      if (path && path.length > 1) {
        const next = path[1];
        this.stepPlayer(next[0] - this.player.x, next[1] - this.player.y);
      }
    }
  }

  loadRecords() {
    try {
      const raw = localStorage.getItem("crypt_crawler_records_v1");
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      totalRuns: 0,
      victories: 0,
      bestDepth: 1,
      totalKills: 0,
      highestStreak: 0,
      totalGold: 0,
      bestiary: {},
    };
  }

  saveRecords(records) {
    try {
      localStorage.setItem("crypt_crawler_records_v1", JSON.stringify(records));
    } catch (_) {}
  }

  recordMonsterDefeat(monsterType) {
    const rec = this.loadRecords();
    rec.totalKills = (rec.totalKills || 0) + 1;
    rec.highestStreak = Math.max(rec.highestStreak || 0, this.killStreak);
    rec.bestiary = rec.bestiary || {};
    rec.bestiary[monsterType] = rec.bestiary[monsterType] || { slain: 0 };
    rec.bestiary[monsterType].slain += 1;
    this.saveRecords(rec);
  }

  recordRunEnd(isVictory) {
    const rec = this.loadRecords();
    rec.totalRuns = (rec.totalRuns || 0) + 1;
    if (isVictory) rec.victories = (rec.victories || 0) + 1;
    rec.bestDepth = Math.max(rec.bestDepth || 1, this.depth);
    rec.totalGold = (rec.totalGold || 0) + (this.player?.gold || 0);
    rec.highestStreak = Math.max(rec.highestStreak || 0, this.killStreak || 0);
    this.saveRecords(rec);
  }

  async descendFloor() {
    this.depth += 1;
    this.ui.logMessage(`You descended into Depth B${this.depth}F! The catacombs grow colder...`, "system");

    try {
      const url = `/api/new-game?seed=${Date.now() % 1000000}&depth=${this.depth}&class=${this.heroClass}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load map from server");
      const data = await res.json();

      this.dungeon = new ClientDungeon(data.dungeon);
      this.monsters = data.monsters;
      this.merchantStock = data.merchant_stock || this.merchantStock;
      this.player.x = data.dungeon.player_spawn[0];
      this.player.y = data.dungeon.player_spawn[1];
    } catch (err) {
      console.warn("Server API fallback to offline procedural generator on descent:", err);
      const prevPlayer = this.player;
      this._generateOfflineState(Date.now() % 1000000, this.depth, this.heroClass);
      prevPlayer.x = this.dungeon.playerSpawn[0];
      prevPlayer.y = this.dungeon.playerSpawn[1];
      this.player = prevPlayer;
    }

    sounds.setBiome(this.dungeon.biome);
    this.dungeon.updateFOV(this.player.x, this.player.y, 7);
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
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

    // Check Hermit Merchant
    const merchant = (this.dungeon.merchants || []).find((m) => m.x === nx && m.y === ny);
    if (merchant || this.dungeon.tiles[ny][nx] === TileType.MERCHANT) {
      this.openMerchantShop();
    }

    // Check Ancient Shrine
    const shrine = (this.dungeon.shrines || []).find((s) => s.x === nx && s.y === ny && !s.activated);
    if (shrine) {
      shrine.activated = true;
      sounds.playShrine();
      this.renderer.addParticles(nx, ny, "#38b2ac", 16);

      const roll = Math.random();
      if (roll < 0.35) {
        // Full heal & renewal
        this.player.hp = this.player.max_hp;
        this.player.mana = this.player.max_mana;
        this.player.status_effects = {};
        this.renderer.addFloatingText("FULL RENEWAL!", nx, ny, "#38b2ac");
        this.ui.logMessage("🏛️ Ancient Shrine bestowed Fountain of Renewal! HP & Mana fully restored!", "level");
      } else if (roll < 0.7) {
        // Blessing of Might
        this.player.status_effects.might = 25;
        this._recalculatePlayerStats();
        this.renderer.addFloatingText("+4 ATK MIGHT", nx, ny, "#e53e3e");
        this.ui.logMessage("🏛️ Ancient Shrine bestowed Blessing of Might (+4 ATK for 25 turns)!", "loot");
      } else {
        // Blessing of Aegis
        this.player.status_effects.shield_wall = 25;
        this._recalculatePlayerStats();
        this.renderer.addFloatingText("+6 DEF BARRIER", nx, ny, "#ecc94b");
        this.ui.logMessage("🏛️ Ancient Shrine bestowed Blessing of the Aegis (+6 DEF for 25 turns)!", "loot");
      }
    }

    // Check Ceramic Urn
    const urn = (this.dungeon.urns || []).find((u) => u.x === nx && u.y === ny && !u.broken);
    if (urn) {
      urn.broken = true;
      sounds.playUrn();
      this.renderer.addParticles(nx, ny, "#9c4221", 10);
      const goldDrop = 6 + Math.floor(Math.random() * 14);
      this.player.gold += goldDrop;
      this.renderer.addFloatingText(`+${goldDrop} 🪙`, nx, ny, "#ecc94b");
      this.ui.logMessage(`Shattered burial urn! Found ${goldDrop} gold coins.`, "loot");
    }

    // Check chest
    const chest = this.dungeon.chests.find((c) => c.x === nx && c.y === ny && !c.opened);
    if (chest) {
      chest.opened = true;
      sounds.playChest();
      const goldFound = 18 + Math.floor(Math.random() * 24);
      this.player.gold += goldFound;
      this.renderer.addFloatingText(`+${goldFound} 🪙`, nx, ny, "#ecc94b");
      this.renderer.addParticles(nx, ny, "#ecc94b", 14);
      this.ui.logMessage(`Opened a locked chest! Found ${goldFound} gold!`, "loot");

      if (Math.random() < 0.75 && this.player.inventory.length < 12) {
        const pool = [
          { id: "potion_rejuvenation", name: "Draught of Rejuvenation", type: "potion", rarity: "rare", description: "Restores 30 HP & 20 Mana, cleanses afflictions.", stats: { heal_hp: 30, restore_mana: 20 } },
          { id: "shield_tower", name: "Aegis Tower Shield", type: "armor", rarity: "rare", description: "+8 DEF bulwark.", stats: { defense: 8 } },
          { id: "ring_power", name: "Ring of Arcane Might", type: "ring", rarity: "rare", description: "+3 ATK, +10 Max Mana.", stats: { attack: 3, max_mana: 10 } },
        ];
        const dropItem = pool[Math.floor(Math.random() * pool.length)];
        this.player.inventory.push(dropItem);
        this.ui.logMessage(`Found rare relic: ${dropItem.name} (${dropItem.rarity.toUpperCase()})!`, "loot");
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
        // Check if boss defeated
        const bossAlive = this.monsters.some((m) => m.is_boss && m.hp > 0);
        if (bossAlive) {
          this.ui.logMessage("The vault barrier holds! You must slay Arch-Lich Malakor first!", "hit");
        } else {
          this.handleVictory();
          return;
        }
      } else {
        this.descendFloor();
        return;
      }
    }

    this.finishPlayerTurn();
  }

  attackMonster(monster) {
    const atk = this.player.attack;
    const def = monster.defense;
    const baseDmg = Math.max(1, atk - def);
    const critChance = this.player.crit_chance || (this.heroClass === "rogue" ? 0.30 : (this.heroClass === "mage" ? 0.10 : 0.15));
    const isCrit = Math.random() < critChance;
    const dmg = Math.floor(baseDmg * (isCrit ? 1.5 : (0.85 + Math.random() * 0.3)));

    monster.hp = Math.max(0, monster.hp - dmg);
    sounds.playHit(isCrit);

    if (isCrit) {
      this.renderer.shake(7, 180);
    }

    this.renderer.addSlash(monster.x, monster.y);
    this.renderer.addFloatingText(isCrit ? `CRIT! -${dmg}` : `-${dmg}`, monster.x, monster.y, isCrit ? "#f6ad55" : "#ff4444");
    this.renderer.addParticles(monster.x, monster.y, isCrit ? "#f6ad55" : "#e53e3e", isCrit ? 12 : 6);

    const critPrefix = isCrit ? "CRITICAL HIT! " : "";
    this.ui.logMessage(`You strike ${monster.name} for ${critPrefix}${dmg} damage.`, isCrit ? "crit" : "hit");

    // Molten Champion Counter-Burn
    if (monster.champion_affix === "Molten" && monster.hp > 0) {
      this.player.hp = Math.max(0, this.player.hp - 2);
      this.renderer.addFloatingText("-2 BURN", this.player.x, this.player.y, "#dd6b20");
      this.ui.logMessage(`🔥 Molten armor singed you for 2 burn damage!`, "hit");
      this.renderer.shake(5, 140);
    }

    // Weapon poison effect
    const weapon = this.player.equipped.weapon;
    if (weapon && weapon.id === "dagger_poison" && monster.hp > 0) {
      if (Math.random() < 0.45) {
        monster.status_effects.poison = 3;
        this.ui.logMessage(`Serpent's venom infected ${monster.name}!`, "loot");
      }
    }

    if (monster.hp <= 0) {
      this._handleMonsterDefeat(monster);
    }
  }

  _handleMonsterDefeat(monster) {
    this.kills += 1;
    this.player.gold += monster.gold_reward;
    this.ui.logMessage(`Defeated ${monster.name}! Gained ${monster.xp_reward} XP, ${monster.gold_reward} Gold.`, "loot");

    // Bestiary recording
    this.recordMonsterDefeat(monster.type);

    // Champion Elite Defeat
    if (monster.is_champion) {
      sounds.playChampionSlay();
      this.renderer.shake(8, 220);
      this.renderer.addFloatingText("CHAMPION SLAIN!", monster.x, monster.y, "#f6ad55");
      this.ui.logMessage(`🏆 ELITE CHAMPION FALLEN! Slew ${monster.name}!`, "crit");
      if (this.player.inventory.length < 12 && Math.random() < 0.8) {
        const dropPool = [
          { id: "potion_rejuvenation", name: "Draught of Rejuvenation", type: "potion", rarity: "rare", description: "Restores 30 HP & 20 MP, cleanses afflictions.", stats: { heal_hp: 30, restore_mana: 20 } },
          { id: "ring_shadow", name: "Band of the Shadowstalker", type: "ring", rarity: "rare", description: "+15% Crit Rate, +3 ATK.", stats: { attack: 3, crit_bonus: 15 } },
          { id: "potion_elixir_str", name: "Elixir of the Titan", type: "potion", rarity: "rare", description: "Permanently increases base Attack by +2.", stats: { perm_attack: 2 } },
        ];
        const bonusItem = dropPool[Math.floor(Math.random() * dropPool.length)];
        this.player.inventory.push(bonusItem);
        this.ui.logMessage(`Found rare champion relic: ${bonusItem.name}!`, "loot");
      }
    }

    // Combo Kill Streak & Momentum
    this.killStreak += 1;
    this.turnsSinceKill = 0;
    this.ui.updateStreak(this.killStreak);

    if (this.killStreak === 2) {
      sounds.playCombo(2);
      this.player.xp += 10;
      this.renderer.addFloatingText("DOUBLE SLAY! +10 XP", this.player.x, this.player.y, "#f6ad55");
      this.ui.logMessage("🔥 DOUBLE SLAY! Momentum surging (+10 Bonus XP)!", "loot");
    } else if (this.killStreak === 3) {
      sounds.playCombo(3);
      this.player.mana = Math.min(this.player.max_mana, this.player.mana + 1);
      this.renderer.addFloatingText("TRIPLE SLAY! +1 MP", this.player.x, this.player.y, "#63b3ed");
      this.ui.logMessage("⚡ TRIPLE SLAY! Battle adrenaline restored 1 Mana!", "loot");
    } else if (this.killStreak >= 5) {
      sounds.playCombo(5);
      this.player.xp += 25;
      this.player.gold += 5;
      this.renderer.shake(10, 250);
      this.renderer.addFloatingText("RAMPAGE! +25 XP +5🪙", this.player.x, this.player.y, "#ecc94b");
      this.ui.logMessage("💀 RAMPAGE! Slicing through foes like wheat in the scythe (+25 XP, +5 Gold)!", "level");
    }

    // Boss victory check
    if (monster.is_boss) {
      sounds.playLevelUp();
      this.renderer.addFloatingText("ARCH-LICH SLAIN!", monster.x, monster.y, "#d69e2e");
      this.ui.logMessage("🏆 ARCH-LICH MALAKOR HAS FALLEN! The realm is redeemed!", "level");
      // Add legendary drop
      const crown = {
        id: "crown_eternity",
        name: "Crown of Eternity",
        type: "ring",
        rarity: "legendary",
        description: "Imperial artifact of the Lich King (+25 Max HP, +15 Max MP, +5 ATK, +3 DEF).",
        stats: { max_hp: 25, max_mana: 15, attack: 5, defense: 3 },
      };
      if (this.player.inventory.length < 12) {
        this.player.inventory.push(crown);
      }
      setTimeout(() => this.handleVictory(), 1500);
      return;
    }

    // XP & Level up
    this.player.xp += monster.xp_reward;
    while (this.player.xp >= this.player.next_xp) {
      this.player.xp -= this.player.next_xp;
      this.player.level += 1;
      this.player.next_xp = Math.floor(this.player.next_xp * 1.5);
      this.player.max_hp += 12;
      this.player.hp = Math.min(this.player.hp + 12, this.player.max_hp);
      this.player.max_mana += 6;
      this.player.mana = Math.min(this.player.mana + 6, this.player.max_mana);
      this.player.attack += 2;
      this.player.defense += 1;
      sounds.playLevelUp();
      this.renderer.addFloatingText("LEVEL UP!", this.player.x, this.player.y, "#4fd1c5");
      this.ui.logMessage(`🌟 LEVEL UP! You reached Level ${this.player.level}!`, "level");
    }
  }

  triggerSlotAction(slotNum) {
    const cls = this.heroClass || this.player?.hero_class || "paladin";
    if (slotNum === 1) {
      this.tacticalStrike();
    } else if (slotNum === 2) {
      if (cls === "rogue") this.tacticalShadowStrike();
      else this.tacticalFireball();
    } else if (slotNum === 3) {
      if (cls === "rogue") this.tacticalSmokeBomb();
      else if (cls === "mage") this.tacticalFrostNova();
      else this.tacticalBash();
    } else if (slotNum === 4) {
      if (cls === "mage") this.tacticalArcaneNova();
      else if (cls === "rogue") this.tacticalFireball();
      else this.tacticalHeal();
    } else if (slotNum === 5) {
      if (cls === "rogue") this.tacticalHeal();
      else this.tacticalShieldWall();
    }
  }

  tacticalShadowStrike() {
    if (this.player.mana < 4) {
      this.ui.logMessage("Not enough mana for Shadow Strike! (Needs 4 MP)", "system");
      return;
    }
    const target = this._findTargetInRange(3);
    if (!target) {
      this.ui.logMessage("No enemy in range for Shadow Strike.", "system");
      return;
    }

    this.player.mana -= 4;
    const isCrit = Math.random() < 0.70;
    const baseDmg = Math.max(3, this.player.attack - target.defense);
    const dmg = Math.floor(baseDmg * (isCrit ? 1.9 : 1.3));
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playHit(isCrit);

    this.renderer.addSlash(target.x, target.y);
    this.renderer.addFloatingText(isCrit ? `SHADOW CRIT! -${dmg}` : `-${dmg}`, target.x, target.y, isCrit ? "#f6ad55" : "#48bb78");
    this.renderer.addParticles(target.x, target.y, "#48bb78", 14);

    if (Math.random() < 0.65 && target.hp > 0) {
      target.status_effects = target.status_effects || {};
      target.status_effects.poison = 3;
      this.ui.logMessage(`🗡️ Shadow Strike hit ${target.name} for ${dmg} damage! (${target.name} poisoned!)`, "crit");
    } else {
      this.ui.logMessage(`🗡️ Shadow Strike hit ${target.name} for ${dmg} damage!`, "crit");
    }

    if (target.hp <= 0) {
      this._handleMonsterDefeat(target);
    }
    this.finishPlayerTurn();
  }

  tacticalSmokeBomb() {
    if (this.player.mana < 6) {
      this.ui.logMessage("Not enough mana for Smoke Bomb! (Needs 6 MP)", "system");
      return;
    }

    this.player.mana -= 6;
    sounds.playSmoke();

    let count = 0;
    for (const m of this.monsters) {
      if (m.hp > 0 && Math.hypot(m.x - this.player.x, m.y - this.player.y) <= 2.5) {
        m.status_effects = m.status_effects || {};
        m.status_effects.stun = 2;
        this.renderer.addFloatingText("💫 STUNNED", m.x, m.y, "#ecc94b");
        this.renderer.addParticles(m.x, m.y, "#a0aec0", 14);
        count++;
      }
    }

    this.renderer.addParticles(this.player.x, this.player.y, "#cbd5e0", 25);
    this.renderer.addFloatingText("💨 SMOKE BOMB", this.player.x, this.player.y, "#e2e8f0");

    if (count > 0) {
      this.ui.logMessage(`💨 Dense smoke billowed out! Stunned ${count} foes for 2 turns!`, "loot");
    } else {
      this.ui.logMessage("💨 Dense smoke filled the hall, cloaking your movements.", "system");
    }

    this.finishPlayerTurn();
  }

  tacticalFrostNova() {
    if (this.player.mana < 6) {
      this.ui.logMessage("Not enough mana for Frost Nova! (Needs 6 MP)", "system");
      return;
    }
    const target = this._findTargetInRange(4);
    if (!target) {
      this.ui.logMessage("No enemy in range for Frost Nova.", "system");
      return;
    }

    this.player.mana -= 6;
    const dmg = 18 + Math.floor(Math.random() * 8);
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playFreeze();

    this.renderer.addProjectile(this.player.x, this.player.y, target.x, target.y, "#63b3ed");
    this.renderer.addFloatingText(`❄️ -${dmg} FROZEN`, target.x, target.y, "#90cdf4");
    this.renderer.addParticles(target.x, target.y, "#63b3ed", 16);

    target.status_effects = target.status_effects || {};
    target.status_effects.stun = 2;
    this.ui.logMessage(`❄️ Frost Nova blasted ${target.name} for ${dmg} cold damage! (Frozen for 2 turns!)`, "crit");

    if (target.hp <= 0) {
      this._handleMonsterDefeat(target);
    }
    this.finishPlayerTurn();
  }

  tacticalArcaneNova() {
    if (this.player.mana < 10) {
      this.ui.logMessage("Not enough mana for Arcane Nova! (Needs 10 MP)", "system");
      return;
    }

    this.player.mana -= 10;
    sounds.playNova();

    let count = 0;
    for (const m of this.monsters) {
      if (m.hp > 0 && Math.hypot(m.x - this.player.x, m.y - this.player.y) <= 3.8) {
        const dmg = 22 + Math.floor(Math.random() * 10);
        m.hp = Math.max(0, m.hp - dmg);
        this.renderer.addFloatingText(`🔮 -${dmg}`, m.x, m.y, "#b794f4");
        this.renderer.addParticles(m.x, m.y, "#9f7aea", 12);
        count++;
        if (m.hp <= 0) this._handleMonsterDefeat(m);
      }
    }

    this.renderer.addParticles(this.player.x, this.player.y, "#9f7aea", 30);
    this.renderer.addFloatingText("🔮 ARCANE NOVA", this.player.x, this.player.y, "#d6bcfa");

    if (count > 0) {
      this.ui.logMessage(`🔮 Cataclysmic Arcane Nova exploded! Obliterated ${count} foes in a 3-tile radius!`, "crit");
    } else {
      this.ui.logMessage("🔮 Arcane Nova pulsed into empty corridors.", "system");
    }

    this.finishPlayerTurn();
  }

  _findTargetInRange(range = 4) {
    let closest = null;
    let minDist = 999;
    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      const d = Math.hypot(m.x - this.player.x, m.y - this.player.y);
      if (d <= range && this.dungeon.isVisible(m.x, m.y) && d < minDist) {
        minDist = d;
        closest = m;
      }
    }
    return closest;
  }

  openMerchantShop() {
    if (!this.merchantStock || this.merchantStock.length === 0) {
      this.merchantStock = [
        { item: { id: "potion_health", name: "Health Elixir", type: "potion", rarity: "common", description: "Restores 35 HP.", stats: { heal_hp: 35 } }, price: 18 },
        { item: { id: "potion_mana", name: "Aether Potion", type: "potion", rarity: "common", description: "Restores 25 MP.", stats: { restore_mana: 25 } }, price: 18 },
        { item: { id: "potion_rejuvenation", name: "Draught of Rejuvenation", type: "potion", rarity: "rare", description: "Restores 30 HP & 20 MP, cleanses afflictions.", stats: { heal_hp: 30, restore_mana: 20 } }, price: 40 },
        { item: { id: "sword_runic", name: "Runic Claymore", type: "weapon", rarity: "rare", description: "+10 ATK.", stats: { attack: 10 } }, price: 85 },
        { item: { id: "armor_plate", name: "Knightly Plate Mail", type: "armor", rarity: "rare", description: "+6 DEF.", stats: { defense: 6 } }, price: 75 },
        { item: { id: "ring_shadow", name: "Band of the Shadowstalker", type: "ring", rarity: "rare", description: "+15% Crit Rate, +3 ATK.", stats: { attack: 3, crit_bonus: 15 } }, price: 95 },
        { item: { id: "potion_elixir_str", name: "Elixir of the Titan", type: "potion", rarity: "rare", description: "Permanently increases base Attack by +2.", stats: { perm_attack: 2 } }, price: 70 },
        { item: { id: "potion_elixir_def", name: "Elixir of Ironhide", type: "potion", rarity: "rare", description: "Permanently increases base Defense by +2.", stats: { perm_defense: 2 } }, price: 70 },
      ];
    }
    sounds.playShopBuy();
    this.ui.showMerchantShopModal(this.merchantStock, this.player.gold, (itemId) => this.buyMerchantItem(itemId));
  }

  buyMerchantItem(itemId) {
    const entry = this.merchantStock.find((e) => e.item.id === itemId);
    if (!entry) return;
    if (this.player.gold < entry.price) {
      this.ui.logMessage("Not enough gold to purchase this item!", "system");
      return;
    }
    if (this.player.inventory.length >= 12) {
      this.ui.logMessage("Your backpack is full! Free up space first.", "system");
      return;
    }
    this.player.gold -= entry.price;
    this.player.inventory.push(JSON.parse(JSON.stringify(entry.item)));
    sounds.playShopBuy();
    this.renderer.addFloatingText(`-🪙${entry.price}`, this.player.x, this.player.y, "#ecc94b");
    this.ui.logMessage(`Purchased ${entry.item.name} from Hermit Grimbold for ${entry.price} Gold.`, "loot");
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
    this.ui.showMerchantShopModal(this.merchantStock, this.player.gold, (id) => this.buyMerchantItem(id));
  }

  tacticalStrike() {
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
    const dmg = 26 + Math.floor(Math.random() * 12);
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playSpell("fireball");

    this.renderer.addProjectile(this.player.x, this.player.y, target.x, target.y, "#dd6b20");
    this.renderer.addFloatingText(`🔥 -${dmg}`, target.x, target.y, "#f6ad55");
    this.renderer.addParticles(target.x, target.y, "#dd6b20", 16);

    // Apply burn
    if (Math.random() < 0.7 && target.hp > 0) {
      target.status_effects = target.status_effects || {};
      target.status_effects.burn = 3;
      this.ui.logMessage(`Cast Fireball at ${target.name} for ${dmg} fire damage! (${target.name} is burning!)`, "crit");
    } else {
      this.ui.logMessage(`Cast Fireball at ${target.name} for ${dmg} fire damage!`, "crit");
    }

    if (target.hp <= 0) {
      this._handleMonsterDefeat(target);
    }

    this.finishPlayerTurn();
  }

  tacticalBash() {
    if (this.player.mana < 4) {
      this.ui.logMessage("Not enough mana for Shield Bash! (Needs 4 MP)", "system");
      return;
    }

    const adj = this.monsters.find((m) => {
      if (m.hp <= 0) return false;
      const d = Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y);
      return d === 1;
    });

    if (!adj) {
      this.ui.logMessage("No adjacent enemy to Shield Bash.", "system");
      return;
    }

    this.player.mana -= 4;
    const dmg = Math.max(2, Math.floor(this.player.attack * 0.75) - adj.defense);
    adj.hp = Math.max(0, adj.hp - dmg);
    sounds.playStun();

    this.renderer.addSlash(adj.x, adj.y);
    this.renderer.addFloatingText(`💥 -${dmg} STUN`, adj.x, adj.y, "#ecc94b");
    this.renderer.addParticles(adj.x, adj.y, "#ecc94b", 12);

    adj.status_effects = adj.status_effects || {};
    adj.status_effects.stun = 1;
    this.ui.logMessage(`🛡️ Slammed ${adj.name} for ${dmg} damage! (${adj.name} is Stunned for 1 turn!)`, "crit");

    if (adj.hp <= 0) {
      this._handleMonsterDefeat(adj);
    }

    this.finishPlayerTurn();
  }

  tacticalHeal() {
    if (this.player.mana < 8) {
      this.ui.logMessage("Not enough mana for Divine Healing! (Needs 8 MP)", "system");
      return;
    }

    this.player.mana -= 8;
    const healAmt = 26 + Math.floor(Math.random() * 12);
    const oldHp = this.player.hp;
    this.player.hp = Math.min(this.player.max_hp, this.player.hp + healAmt);
    const restored = this.player.hp - oldHp;

    // Cleanse status
    const cleansed = [];
    if (this.player.status_effects.poison) {
      delete this.player.status_effects.poison;
      cleansed.push("Poison");
    }
    if (this.player.status_effects.burn) {
      delete this.player.status_effects.burn;
      cleansed.push("Burn");
    }

    sounds.playSpell("heal");
    this.renderer.addFloatingText(`+${restored} HP`, this.player.x, this.player.y, "#68d391");
    this.renderer.addParticles(this.player.x, this.player.y, "#38a169", 14);

    const clTxt = cleansed.length ? ` (Cleansed ${cleansed.join(", ")})` : "";
    this.ui.logMessage(`Divine light restored ${restored} HP${clTxt}.`, "heal");

    this.finishPlayerTurn();
  }

  tacticalShieldWall() {
    if (this.player.mana < 6) {
      this.ui.logMessage("Not enough mana for Shield Wall! (Needs 6 MP)", "system");
      return;
    }

    this.player.mana -= 6;
    this.player.status_effects = this.player.status_effects || {};
    this.player.status_effects.shield_wall = 4;
    this._recalculatePlayerStats();

    sounds.playShieldWall();
    this.renderer.addFloatingText("BARRIER (+6 DEF)", this.player.x, this.player.y, "#ecc94b");
    this.renderer.addParticles(this.player.x, this.player.y, "#d69e2e", 12);
    this.ui.logMessage("🛡️ Raised Shield Wall! Defense increased by +6 for 4 turns.", "loot");

    this.finishPlayerTurn();
  }

  quickPotion() {
    const potIdx = this.player.inventory.findIndex((i) => i.type === "potion");
    if (potIdx >= 0) {
      this.useInventoryItem(potIdx);
    } else {
      this.ui.logMessage("No potions available in your backpack!", "system");
    }
  }

  waitTurn() {
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
      if (item.id === "potion_rejuvenation") {
        delete this.player.status_effects.poison;
        delete this.player.status_effects.burn;
        this.ui.logMessage("Purified body of all poisons and burning wounds.", "heal");
      }
      if (item.stats?.perm_attack) {
        this.player.perm_attack = (this.player.perm_attack || 0) + item.stats.perm_attack;
        this.renderer.addFloatingText(`+${item.stats.perm_attack} ATK PERM`, this.player.x, this.player.y, "#e53e3e");
        this.ui.logMessage(`Gained +${item.stats.perm_attack} Permanent Attack!`, "level");
      }
      if (item.stats?.perm_defense) {
        this.player.perm_defense = (this.player.perm_defense || 0) + item.stats.perm_defense;
        this.renderer.addFloatingText(`+${item.stats.perm_defense} DEF PERM`, this.player.x, this.player.y, "#ecc94b");
        this.ui.logMessage(`Gained +${item.stats.perm_defense} Permanent Defense!`, "level");
      }
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.finishPlayerTurn();
    } else if (item.type === "scroll" && item.id === "scroll_nova") {
      // Arcane Nova scroll: deals 24 damage to all visible enemies
      this.ui.logMessage("📜 Read Scroll of Arcane Nova! Blinding magical shockwaves explode!", "crit");
      sounds.playSpell("fireball");
      for (const m of this.monsters) {
        if (m.hp > 0 && this.dungeon.isVisible(m.x, m.y)) {
          m.hp = Math.max(0, m.hp - 24);
          this.renderer.addFloatingText("-24 NOVA", m.x, m.y, "#9f7aea");
          this.renderer.addParticles(m.x, m.y, "#b794f4", 10);
          if (m.hp <= 0) this._handleMonsterDefeat(m);
        }
      }
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.finishPlayerTurn();
    } else if (["weapon", "armor", "ring"].includes(item.type)) {
      const slot = item.type;
      const oldEquip = this.player.equipped[slot];
      this.player.inventory.splice(idx, 1);
      if (oldEquip) {
        this.player.inventory.push(oldEquip);
      }
      this.player.equipped[slot] = item;

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
    const cls = this.heroClass || this.player?.hero_class || "paladin";
    let baseAtk = 8;
    let baseDef = 3;
    let baseHp = 60;
    let baseMp = 30;
    let critChance = 0.15;

    if (cls === "rogue") {
      baseAtk = 9;
      baseDef = 2;
      baseHp = 48;
      baseMp = 25;
      critChance = 0.30;
    } else if (cls === "mage") {
      baseAtk = 6;
      baseDef = 1;
      baseHp = 42;
      baseMp = 55;
      critChance = 0.10;
    }

    let atk = baseAtk + (this.player.level - 1) * 2 + (this.player.perm_attack || 0);
    let def = baseDef + (this.player.level - 1) * 1 + (this.player.perm_defense || 0);
    let maxHpBonus = 0;
    let maxMpBonus = 0;

    for (const slot of Object.values(this.player.equipped)) {
      if (slot && slot.stats) {
        if (slot.stats.attack) atk += slot.stats.attack;
        if (slot.stats.defense) def += slot.stats.defense;
        if (slot.stats.max_hp) maxHpBonus += slot.stats.max_hp;
        if (slot.stats.max_mana) maxMpBonus += slot.stats.max_mana;
        if (slot.stats.crit_bonus) critChance += slot.stats.crit_bonus / 100;
      }
    }

    if (this.player.status_effects && this.player.status_effects.might) {
      atk += 4;
    }
    if (this.player.status_effects && this.player.status_effects.shield_wall) {
      def += 6;
    }

    this.player.attack = atk;
    this.player.defense = def;
    this.player.crit_chance = critChance;
    this.player.max_hp = baseHp + (this.player.level - 1) * 12 + maxHpBonus;
    this.player.max_mana = baseMp + (this.player.level - 1) * 6 + maxMpBonus;
  }

  finishPlayerTurn() {
    this.turn += 1;
    this.dungeon.updateFOV(this.player.x, this.player.y, 7);

    // 1. Tick Player Status Effects
    this._tickPlayerStatuses();

    // 2. Enemy AI Turns
    this.processEnemyTurns();

    // 3. Tick Monster Status Effects
    this._tickMonsterStatuses();

    // 4. Check player death
    if (this.player.hp <= 0) {
      this.handlePlayerDeath("in mortal combat");
      return;
    }

    // 5. Streak cool-down
    this.turnsSinceKill += 1;
    if (this.turnsSinceKill > 4 && this.killStreak > 0) {
      this.killStreak = 0;
      this.ui.updateStreak(0);
    }

    this._recalculatePlayerStats();
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
  }

  _tickPlayerStatuses() {
    if (!this.player.status_effects) return;
    const effects = this.player.status_effects;

    if (effects.poison) {
      this.player.hp = Math.max(0, this.player.hp - 3);
      this.renderer.addFloatingText("-3 POISON", this.player.x, this.player.y, "#48bb78");
      this.ui.logMessage("Venom burns in your veins! (-3 HP)", "hit");
      effects.poison -= 1;
      if (effects.poison <= 0) delete effects.poison;
    }
    if (effects.burn) {
      this.player.hp = Math.max(0, this.player.hp - 4);
      this.renderer.addFloatingText("-4 BURN", this.player.x, this.player.y, "#f6ad55");
      this.ui.logMessage("Fire singes your armor! (-4 HP)", "hit");
      effects.burn -= 1;
      if (effects.burn <= 0) delete effects.burn;
    }
    if (effects.shield_wall) {
      effects.shield_wall -= 1;
      if (effects.shield_wall <= 0) {
        delete effects.shield_wall;
        this.ui.logMessage("Shield Wall collapsed.", "system");
      }
    }
    if (effects.might) {
      effects.might -= 1;
      if (effects.might <= 0) {
        delete effects.might;
        this.ui.logMessage("Blessing of Might expired.", "system");
      }
    }
  }

  _tickMonsterStatuses() {
    for (const m of this.monsters) {
      if (m.hp <= 0 || !m.status_effects) continue;
      if (m.status_effects.poison) {
        m.hp = Math.max(0, m.hp - 4);
        this.renderer.addFloatingText("-4 POISON", m.x, m.y, "#48bb78");
        m.status_effects.poison -= 1;
        if (m.status_effects.poison <= 0) delete m.status_effects.poison;
        if (m.hp <= 0) this._handleMonsterDefeat(m);
      }
      if (m.status_effects && m.status_effects.burn) {
        m.hp = Math.max(0, m.hp - 5);
        this.renderer.addFloatingText("-5 BURN", m.x, m.y, "#dd6b20");
        m.status_effects.burn -= 1;
        if (m.status_effects.burn <= 0) delete m.status_effects.burn;
        if (m.hp <= 0) this._handleMonsterDefeat(m);
      }
    }
  }

  processEnemyTurns() {
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue;

      // Handle Stun
      if (monster.status_effects && monster.status_effects.stun) {
        monster.status_effects.stun -= 1;
        if (monster.status_effects.stun <= 0) delete monster.status_effects.stun;
        this.ui.logMessage(`${monster.name} is stunned and unable to act!`, "system");
        continue;
      }

      const dist = Math.hypot(monster.x - this.player.x, monster.y - this.player.y);
      const isVisible = this.dungeon.isVisible(monster.x, monster.y);

      // Boss special ability: Soul Drain
      if (monster.is_boss && isVisible && dist <= 5 && Math.random() < 0.35) {
        const drain = 12;
        this.player.hp = Math.max(0, this.player.hp - drain);
        monster.hp = Math.min(monster.max_hp, monster.hp + 10);
        sounds.playSpell("fireball");
        this.renderer.addProjectile(monster.x, monster.y, this.player.x, this.player.y, "#9f7aea");
        this.renderer.addFloatingText(`-${drain} DRAIN`, this.player.x, this.player.y, "#b794f4");
        this.renderer.addFloatingText("+10 HP", monster.x, monster.y, "#9f7aea");
        this.ui.logMessage(`💀 Malakor casts Soul Drain! Drained ${drain} HP to empower himself!`, "hit");
        continue;
      }

      // If adjacent: attack player
      if (Math.abs(monster.x - this.player.x) + Math.abs(monster.y - this.player.y) === 1) {
        const baseDmg = Math.max(1, monster.attack - this.player.defense);
        const dmg = Math.max(1, Math.floor(baseDmg * (0.8 + Math.random() * 0.4)));
        this.player.hp = Math.max(0, this.player.hp - dmg);
        sounds.playHit(false);

        if (dmg >= 8) {
          this.renderer.shake(6, 160);
        }

        this.renderer.addSlash(this.player.x, this.player.y);
        this.renderer.addFloatingText(`-${dmg}`, this.player.x, this.player.y, "#ff3333");
        this.ui.logMessage(`${monster.name} attacks you for ${dmg} damage!`, "hit");

        // Vampiric champion leech
        if (monster.champion_affix === "Vampiric" && monster.hp < monster.max_hp) {
          monster.hp = Math.min(monster.max_hp, monster.hp + 3);
          this.renderer.addFloatingText("+3 HP", monster.x, monster.y, "#9f7aea");
          this.ui.logMessage(`🩸 ${monster.name} leeched your blood to restore 3 HP!`, "hit");
        }

        // Spider poison chance
        if (monster.type === "spider" && Math.random() < 0.45) {
          this.player.status_effects.poison = 3;
          this.ui.logMessage("⚠️ Spider venom coursed into your veins! Afflicted with Poison!", "hit");
        }
        // Goblin theft chance
        if (monster.type === "goblin" && this.player.gold > 5 && Math.random() < 0.5) {
          const stolen = Math.min(this.player.gold, 5 + Math.floor(Math.random() * 5));
          this.player.gold -= stolen;
          this.ui.logMessage(`🪙 Sneaky Goblin stole ${stolen} gold from your coin pouch!`, "hit");
        }
      } else if (isVisible && dist <= 7) {
        // Step toward player
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
    if (this.dungeon?.merchants?.some((m) => m.x === x && m.y === y)) return true;
    return this.monsters.some((m) => m.x === x && m.y === y && m.hp > 0);
  }

  handlePlayerDeath(cause = "unknown") {
    this.gameOver = true;
    sounds.stopMusic();
    this.clearSavedRun();
    this.recordRunEnd(false);
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
    sounds.stopMusic();
    this.clearSavedRun();
    this.recordRunEnd(true);
    this.ui.showModal(
      "🏆 TRIUMPH OF THE DUNGEON",
      `<p>You conquered the deepest vault, defeated Arch-Lich Malakor, and recovered the legendary <strong>Crown of Eternity</strong>!</p>
       <br>
       <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 4px; border: 1px solid #d69e2e;">
         <p><strong>Hero Archetype:</strong> ${this.player.class_title || "Champion"}</p>
         <p><strong>Hero Level:</strong> ${this.player.level}</p>
         <p><strong>Monsters Slain:</strong> ${this.kills}</p>
         <p><strong>Total Gold:</strong> ${this.player.gold} 🪙</p>
         <p><strong>Relics Recovered:</strong> Crown of Eternity</p>
       </div>
       <br>
       <p>The light returns to the realm. Descend again for a new challenge?</p>`
    );
  }

  saveGameState() {
    if (this.gameOver || this.victory || !this.player || !this.dungeon) return;
    try {
      const state = {
        version: 2,
        savedAt: Date.now(),
        turn: this.turn,
        depth: this.depth,
        kills: this.kills,
        heroClass: this.heroClass,
        player: this.player,
        monsters: this.monsters,
        merchantStock: this.merchantStock,
        dungeon: {
          width: this.dungeon.width,
          height: this.dungeon.height,
          seed: this.dungeon.seed,
          depth: this.dungeon.depth,
          biome: this.dungeon.biome,
          tiles: this.dungeon.tiles,
          player_spawn: this.dungeon.playerSpawn,
          stairs_pos: this.dungeon.stairsPos,
          rooms: this.dungeon.rooms,
          chests: this.dungeon.chests.map((c) => [c.x, c.y]),
          traps: this.dungeon.traps.map((t) => [t.x, t.y]),
          shrines: this.dungeon.shrines.map((s) => [s.x, s.y]),
          urns: this.dungeon.urns.map((u) => [u.x, u.y]),
          sconces: this.dungeon.sconces.map((sc) => [sc.x, sc.y]),
          merchants: (this.dungeon.merchants || []).map((m) => [m.x, m.y]),
        },
      };
      localStorage.setItem("crypt_crawler_save_v2", JSON.stringify(state));
      this.ui.showSaveIndicator();
    } catch (err) {
      console.warn("Failed to persist save to localStorage:", err);
    }
  }

  loadSavedRun() {
    try {
      const raw = localStorage.getItem("crypt_crawler_save_v2");
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.player || !data.dungeon) return null;
      return data;
    } catch (err) {
      console.warn("Failed to parse saved game:", err);
      return null;
    }
  }

  clearSavedRun() {
    try {
      localStorage.removeItem("crypt_crawler_save_v2");
    } catch (_) {}
  }
}

// Start game on page load and expose globally for Playwright headless inspection
window.addEventListener("DOMContentLoaded", () => {
  const engine = new GameEngine();
  window.gameEngine = engine;
  engine.start();
});
