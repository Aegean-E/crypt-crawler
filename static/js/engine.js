/**
 * Main game engine for Crypt-Crawler: turn management, input handling, combat,
 * status effects, interactive shrines/urns, boss battles, and ambient music.
 */

import { sounds } from "./audio.js";
import { ClientDungeon, TileType } from "./dungeon.js";
import { DungeonRenderer } from "./renderer.js";
import { UIController } from "./ui.js";

/**
 * Floor omens: one deterministic modifier per floor, chosen from the run seed and depth.
 * `atkMult` scales enemy damage, `fov` replaces the lantern radius, `goldMult` scales
 * chest/urn coin, and `extraFoe` adds one more enemy at the start of the floor.
 */
export const OMENS = [
  {
    id: "blood_moon", name: "Blood Moon", icon: "🌑",
    desc: "The moon is red. Enemies strike 25% harder.",
    atkMult: 1.25, fov: 7, goldMult: 1, extraFoe: 0,
  },
  {
    id: "deep_fog", name: "Deep Fog", icon: "🌫️",
    desc: "The air is thick. Your lantern reaches only 5 tiles; a nearby wall sconce restores it to 7.",
    atkMult: 1, fov: 5, goldMult: 1, extraFoe: 0,
  },
  {
    id: "gilded_crypt", name: "Gilded Crypt", icon: "💰",
    desc: "The dead were buried rich. Chests and urns hold 50% more gold.",
    atkMult: 1, fov: 7, goldMult: 1.5, extraFoe: 0,
  },
  {
    id: "restless_dead", name: "Restless Dead", icon: "💀",
    desc: "Something followed you down. One extra enemy stalks this floor.",
    atkMult: 1, fov: 7, goldMult: 1, extraFoe: 1,
  },
];

export function omenFor(seed, depth) {
  let hash = (Number(seed) >>> 0) ^ Math.imul(Number(depth) || 1, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return OMENS[hash % OMENS.length];
}

/**
 * Difficulty profiles scale enemy health, damage and rewards exactly once per monster.
 * Normal leaves the generated data untouched; Hard trades a tougher floor for richer drops.
 */
export const DIFFICULTIES = {
  normal: { id: "normal", name: "Normal", hp: 1, attack: 1, reward: 1 },
  hard: { id: "hard", name: "Hard", hp: 1.4, attack: 1.25, reward: 1.15 },
};


export class GameEngine {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.renderer = new DungeonRenderer(this.canvas);
    this.ui = new UIController();

    this.dungeon = null;
    this.player = null;
    this.monsters = [];
    this.merchantStock = [];
    this.bounties = [];
    this.loreEntries = [];
    this.loreEvents = {};
    this.loreStart = [];
    this.loreUnlocked = [];
    this.sigilCount = 0;
    this.turn = 1;
    this.depth = 1;
    this.kills = 0;
    this.killStreak = 0;
    this.turnsSinceKill = 0;
    this.heroClass = "paladin";
    this.difficulty = "normal";
    this.gameOver = false;
    this.victory = false;
    this.animFrameId = null;
    this.musicStarted = false;
    this.transitioning = false;
    this.runToken = 0;
    this.omen = null;
    this.omenKey = "";
    this.fovRadius = 7;

    this._setupCallbacks();
    this._setupInputListeners();
    this._applyReducedMotion(this._loadReducedMotion(), false);
  }

  _loadReducedMotion() {
    try {
      return localStorage.getItem("crypt_crawler_reduced_motion") === "1";
    } catch (_) {
      return false;
    }
  }

  _applyReducedMotion(enabled, persist = true) {
    this.reducedMotion = Boolean(enabled);
    this.renderer.reducedMotion = this.reducedMotion;
    document.body.classList.toggle("reduced-motion", this.reducedMotion);
    const btn = document.getElementById("btnMotionToggle");
    if (btn) {
      btn.textContent = this.reducedMotion ? "🎞️" : "✨";
      btn.style.color = this.reducedMotion ? "#4fd1c5" : "inherit";
      btn.title = this.reducedMotion ? "Motion effects: reduced" : "Motion effects: full";
    }
    if (persist) {
      try {
        localStorage.setItem("crypt_crawler_reduced_motion", this.reducedMotion ? "1" : "0");
      } catch (_) {
        /* storage is optional */
      }
    }
  }

  async start(seed = null, depth = 1, heroClass = "paladin", allowResume = true, difficulty = "normal") {
    // A new run invalidates any in-flight floor descent: the pending fetch must not
    // overwrite this run's dungeon, and the flag must not stick true.
    this.runToken = (this.runToken || 0) + 1;
    const token = this.runToken;
    this.transitioning = false;
    this.depth = depth;
    this.turn = 1;
    this.killStreak = 0;
    this.turnsSinceKill = 0;
    this.gameOver = false;
    this.victory = false;
    this.heroClass = heroClass || "paladin";
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "normal";
    await this._loadLore();
    if (token !== this.runToken) return;
    const loreArchive = this.loadLoreArchive();

    // Attempt to resume saved run if starting fresh at depth 1 without explicit seed
    if (allowResume && depth === 1 && !seed) {
      const saved = this.loadSavedRun();
      if (saved) {
        this.player = saved.player;
        this.player.equipped = Object.assign({ weapon: null, armor: null, ring: null, amulet: null, boots: null }, this.player.equipped || {});
        this.dungeon = new ClientDungeon(saved.dungeon);
        this.monsters = saved.monsters;
        this.turn = saved.turn;
        this.depth = saved.depth;
        this.kills = saved.kills;
        this.merchantStock = saved.merchantStock || [];
        this.heroClass = saved.heroClass || this.player.hero_class || "paladin";
        this.difficulty = DIFFICULTIES[saved.difficulty] ? saved.difficulty : "normal";
        this.bounties = saved.bounties || this._generateOfflineBounties(this.depth);
        this.loreUnlocked = Array.from(new Set([
          ...(this.loreStart || []),
          ...loreArchive,
          ...(Array.isArray(saved.loreUnlocked) ? saved.loreUnlocked : []),
        ]));
        this.sigilCount = Number.isFinite(saved.sigilCount) ? saved.sigilCount : 0;
        sounds.setBiome(this.dungeon.biome);
        this._applyOmen({ announce: false, extraFoe: false });
        this.dungeon.updateFOV(this.player.x, this.player.y, this._effectiveFov());
        this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
        this.ui.renderBounties(this.bounties);
        this.ui.updateJournal(this.loreUnlocked.length, this.loreEntries.length);
        this.updateSigils();
        this.ui.updateDifficulty(this.difficulty);
        this.ui.logMessage("⚔️ Resumed your ongoing dungeon run from crystal memory.", "system");
        this._startRenderLoop();
        return;
      }
    }

    try {
      const url = `/api/new-game?seed=${seed || Date.now() % 1000000}&depth=${this.depth}&class=${this.heroClass}`;
      const res = await fetch(url);
      if (token !== this.runToken) return;
      if (!res.ok) throw new Error("Failed to load map from server");
      const data = await res.json();
      if (token !== this.runToken) return;

      this.dungeon = new ClientDungeon(data.dungeon);
      this.player = data.player;
      this.monsters = data.monsters;
      this.merchantStock = data.merchant_stock || [];
      this.bounties = data.bounties || this._generateOfflineBounties(this.depth);
    } catch (err) {
      if (token !== this.runToken) return;
      console.warn("Server API fallback to offline procedural generator:", err);
      this._generateOfflineState(seed, depth, this.heroClass);
      this.bounties = this._generateOfflineBounties(this.depth);
    }

    this._applyDifficulty();
    this.ui.updateDifficulty(this.difficulty);
    this.loreUnlocked = Array.from(new Set([
      ...(this.loreStart || []),
      ...loreArchive,
      "lore_verge",
    ]));
    this.sigilCount = 0;
    sounds.setBiome(this.dungeon.biome);

    // Initialize FOV
    this._applyOmen();
    this.dungeon.updateFOV(this.player.x, this.player.y, this._effectiveFov());

    // Initial UI update
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.ui.renderBounties(this.bounties);
    this.ui.updateJournal(this.loreUnlocked.length, this.loreEntries.length);
    this.updateSigils();
    this.ui.logMessage(`Entered Depth B${this.depth}F of the ancient catacombs as ${this.player.class_title || "Champion"}.`, "system");
    this.ui.logMessage("Prologue — Your father came down these stairs with this same lantern. He never came back up.", "system");
    this.ui.logMessage("📖 Your journal has begun. The Journal button records every truth the crypt lets slip.", "system");

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

    const sigils = [
      [rooms[0].center[0] + 1, rooms[0].center[1]],
      [rooms[2].center[0] - 1, rooms[2].center[1]],
      [rooms[3].center[0], rooms[3].center[1] - 1],
    ];
    sigils.forEach(([sx, sy]) => { tiles[sy][sx] = TileType.SIGIL; });
    const vault = [rooms[4].center[0], rooms[4].center[1] - 1];
    tiles[vault[1]][vault[0]] = TileType.VAULT;
    const souls = [[rooms[4].center[0] + 1, rooms[4].center[1]]];
    souls.forEach(([sx, sy]) => { tiles[sy][sx] = TileType.SOUL; });
    const pacts = [[rooms[2].center[0] + 1, rooms[2].center[1] + 1]];
    pacts.forEach(([px, py]) => { tiles[py][px] = TileType.PACT; });
    const traps = [[rooms[1].center[0] - 1, rooms[1].center[1] + 1]];
    traps.forEach(([tx, ty]) => { tiles[ty][tx] = TileType.TRAP; });

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
      traps: traps,
      shrines: [[rooms[2].center[0], rooms[2].center[1]]],
      urns: [[rooms[3].center[0], rooms[3].center[1]]],
      souls: souls,
      sigils: sigils,
      vault: vault,
      pacts: pacts,
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
        equipped: { weapon: null, armor: null, ring: null, amulet: null, boots: null },
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
        equipped: { weapon: null, armor: null, ring: null, amulet: null, boots: null },
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
        equipped: { weapon: null, armor: null, ring: null, amulet: null, boots: null },
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
          x: rooms[2].center[0],
          y: rooms[2].center[1] + 1,
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
          x: rooms[2].center[0] + 1,
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
      if (depth >= 2) {
        this.monsters.push(
          {
            name: "Crypt Hound", type: "hound",
            x: rooms[3].center[0] + 1, y: rooms[3].center[1] + 1,
            hp: 18, max_hp: 18, attack: 6, defense: 1,
            xp_reward: 22, gold_reward: 12, loot_drop: "potion_health",
            is_boss: false, is_champion: false, champion_affix: null, status_effects: {},
          },
          {
            name: "Skeletal Archer", type: "archer",
            x: rooms[4].center[0] - 1, y: rooms[4].center[1] + 1,
            hp: 16, max_hp: 16, attack: 7, defense: 1,
            xp_reward: 24, gold_reward: 14, loot_drop: "scroll_fireball",
            is_boss: false, is_champion: false, champion_affix: null, status_effects: {},
          },
        );
      }
    }
    this._applyDifficulty();
  }

  _setupCallbacks() {
    this.ui.onUseItem = (idx) => this.useInventoryItem(idx);
    this.ui.onDropItem = (idx) => this.dropInventoryItem(idx);
    this.ui.onUnequip = (slot) => this.unequipSlot(slot);
    this.ui.onJournal = () => this.ui.showJournalModal(this.loreEntries, this.loreUnlocked);
    this.ui.onModalClose = () => {
      if (this.gameOver || this.victory) {
        this.clearSavedRun();
        this.start(Date.now() % 1000000, 1, this.heroClass, false, this.difficulty);
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
      if (this.ui.isModalOpen()) {
        // QoL: Escape closes the dialog that already advertises a close button.
        if (e.key === "Escape") {
          e.preventDefault();
          this.ui.btnModalClose?.click();
        }
        return;
      }
      if (this.gameOver || this.victory || this.transitioning) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        document.getElementById("btnHelp")?.click();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.searchForTraps();
        return;
      }

      // Numpad movement is read from e.code so the 1-6 deck hotkeys on the
      // number row keep working; e.key would report the same digits.
      const numpadMoves = {
        Numpad8: [0, -1],
        Numpad2: [0, 1],
        Numpad4: [-1, 0],
        Numpad6: [1, 0],
        Numpad7: [-1, -1],
        Numpad9: [1, -1],
        Numpad1: [-1, 1],
        Numpad3: [1, 1],
      };
      if (numpadMoves[e.code]) {
        e.preventDefault();
        this.stepPlayer(...numpadMoves[e.code]);
        return;
      }

      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
        case "k":
          dy = -1;
          break;
        case "ArrowDown":
        case "s":
        case "S":
        case "j":
          dy = 1;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
        case "h":
          dx = -1;
          break;
        case "ArrowRight":
        case "d":
        case "D":
        case "l":
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
        case "8":
          dy = -1;
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
    document.getElementById("btnActionSearch").addEventListener("click", () => {
      this._triggerMusicStart();
      this.searchForTraps();
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

    const btnCrt = document.getElementById("btnCrtToggle");
    if (btnCrt) {
      btnCrt.addEventListener("click", () => this.ui.toggleCrt());
    }

    const btnMotion = document.getElementById("btnMotionToggle");
    if (btnMotion) {
      btnMotion.addEventListener("click", () => this._applyReducedMotion(!this.reducedMotion));
    }

    const btnBounties = document.getElementById("btnBounties");
    if (btnBounties) {
      btnBounties.addEventListener("click", () => this.ui.showBountiesModal(this.bounties));
    }

    const btnRec = document.getElementById("btnRecords");
    if (btnRec) {
      btnRec.addEventListener("click", () => {
        this.ui.showHallOfRecordsModal(this.loadRecords(), this.dungeon?.seed ?? null);
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
      this.ui.showClassSelectModal((chosenClass, chosenSeed, chosenDifficulty) => {
        this.clearSavedRun();
        const seed = Number.isInteger(chosenSeed) && chosenSeed > 0
          ? chosenSeed
          : Date.now() % 1000000;
        this.start(seed, 1, chosenClass, false, chosenDifficulty);
      });
    });

    document.getElementById("btnHelp").addEventListener("click", () => {
      this.ui.showModal(
        "Crypt-Crawler Guide",
        `<p>Welcome to <strong>Crypt-Crawler</strong>, a tactical turn-based dungeon crawler!</p>
         <br>
         <p><strong>Controls & Tactics:</strong></p>
         <ul style="margin-left: 20px; line-height: 1.6;">
           <li><strong>Move / Attack:</strong> Arrow keys, WASD, Vi keys (HJKL/YUBN), Numpad</li>
           <li><strong>Number row vs Numpad:</strong> 1-6 cast deck abilities; Numpad 1-9 moves and attacks in all eight directions</li>
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
           <li><strong>Black Pact Altars:</strong> Trade a permanent cost for permanent power. Wrath burns max HP for Attack, the Grave seals max Mana for health, Avarice pays gold and raises two Pact-Bound Wraiths. Refusing is free.</li>
           <li><strong>Lost Souls:</strong> Speak with the unburied to heal, take their toll, or learn what happened here.</li>
           <li><strong>Sigils & Sealed Vaults:</strong> Gather three floor sigils to open the vault for a legendary relic.</li>
           <li><strong>Journal:</strong> Every discovery is recorded in the codex and survives death.</li>
           <li><strong>Ancient Shrines:</strong> Bestow sacred blessings (Might, Aegis, Renewal)</li>
           <li><strong>Burial Urns:</strong> Shatter for hidden coins or relics</li>
           <li><strong>Traps &amp; Sconces:</strong> Watch out for concealed spike traps; press <strong>R</strong> to reveal them or to disarm a revealed trap beside you for a little XP. Wall sconces within two tiles restore the lantern to 7 tiles, even in Deep Fog!</li>
           <li><strong>Gilded Mimics:</strong> Some chests are teeth in a wooden lid; open one and fight instead of looting.</li>
           <li><strong>Class Passives:</strong> Paladin Zeal restores HP/MP on a kill; Rogue Executioner hits foes below 30% HP harder; Mage Arcane Focus boosts spell damage.</li>
           <li><strong>Status Combos:</strong> Frost on a burning foe shatters for +12+3×depth; Fireball or its scroll on a poisoned foe detonates for the same bonus, consuming the status.</li>
         </ul>
         <br>
         <p>Conquer Depth B3F and slay <strong>Arch-Lich Malakor</strong> to claim the <em>Crown of Eternity</em>!</p>
         <br>
         <p><strong>Floor Omens:</strong> every floor carries one omen — Blood Moon (enemies hit 25% harder), Deep Fog (lantern 5 tiles, or 7 near a sconce), Gilded Crypt (+50% chest and urn gold) or Restless Dead (one extra enemy). The omen pill in the header always names the current one.</p>
         <p><strong>Enemies:</strong> Skeletal Archers shoot across open rooms, Crypt Hounds lunge two tiles a turn, and Pact-Bound Wraiths rise from Avarice.</p>
         <p><strong>Shortcuts:</strong> <strong>?</strong> opens this guide, <strong>R</strong> searches for traps, <strong>Escape</strong> closes any dialog, and the 🎞️ button toggles reduced motion (persisted).</p>`
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
    if (this.gameOver || this.victory || this.transitioning || this.ui.isModalOpen()) return;
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

  async _loadLore() {
    try {
      const res = await fetch("/api/lore");
      if (!res.ok) throw new Error("lore archive unavailable");
      const data = await res.json();
      this.loreEntries = Array.isArray(data.entries) ? data.entries : [];
      this.loreEvents = data.events || {};
      this.loreStart = Array.isArray(data.starting) ? data.starting : [];
    } catch (err) {
      console.warn("Lore archive unavailable; the journal will show an offline notice:", err);
      this.loreEntries = [];
      this.loreEvents = {};
      this.loreStart = [];
    }
  }

  loadLoreArchive() {
    try {
      const raw = localStorage.getItem("crypt_crawler_lore_v1");
      const ids = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch (_) {
      return [];
    }
  }

  saveLoreArchive() {
    try {
      localStorage.setItem("crypt_crawler_lore_v1", JSON.stringify(this.loreUnlocked));
    } catch (_) {}
  }

  unlockLore(entryId, quiet = false) {
    if (!entryId || this.loreUnlocked.includes(entryId)) return false;
    if (this.loreEntries.length > 0 && !this.loreEntries.some((entry) => entry.id === entryId)) {
      return false;
    }
    this.loreUnlocked.push(entryId);
    this.saveLoreArchive();
    this.ui.updateJournal(this.loreUnlocked.length, this.loreEntries.length);
    if (!quiet) {
      const entry = this.loreEntries.find((item) => item.id === entryId);
      const title = entry ? entry.title : "New entry";
      this.renderer.addFloatingText("📖 NEW LORE", this.player.x, this.player.y, "#d6bcfa");
      this.ui.logMessage(`📖 Journal entry recorded: ${title} (open the Journal to read it)`, "level");
    }
    this.saveGameState();
    return true;
  }

  unlockRandomLore(quiet = false) {
    if (this.loreEntries.length === 0) return false;
    const locked = this.loreEntries.filter((entry) => !this.loreUnlocked.includes(entry.id));
    if (locked.length === 0) return false;
    const pick = locked[Math.floor(Math.random() * locked.length)];
    return this.unlockLore(pick.id, quiet);
  }

  recordMonsterDefeat(monsterType) {
    const rec = this.loadRecords();
    rec.totalKills = (rec.totalKills || 0) + 1;
    rec.highestStreak = Math.max(rec.highestStreak || 0, this.killStreak + 1);
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
    if (this.transitioning || this.gameOver || this.victory) return;
    this.transitioning = true;
    const token = this.runToken;
    const newDepth = this.depth + 1;
    this.ui.logMessage(`You descended into Depth B${newDepth}F! The catacombs grow colder...`, "system");

    try {
      let data = null;
      try {
        const url = `/api/new-game?seed=${Date.now() % 1000000}&depth=${newDepth}&class=${this.heroClass}`;
        const res = await fetch(url);
        if (token !== this.runToken) return;
        if (!res.ok) throw new Error("Failed to load map from server");
        data = await res.json();
        if (token !== this.runToken) return;
      } catch (err) {
        if (token !== this.runToken) return;
        console.warn("Server API fallback to offline procedural generator on descent:", err);
        data = null;
      }

      this.depth = newDepth;
      if (data) {
        this.dungeon = new ClientDungeon(data.dungeon);
        this.monsters = data.monsters;
        this.merchantStock = data.merchant_stock || this.merchantStock;
        this.bounties = data.bounties || this._generateOfflineBounties(this.depth);
        this.player.x = data.dungeon.player_spawn[0];
        this.player.y = data.dungeon.player_spawn[1];
      } else {
        const prevPlayer = this.player;
        this._generateOfflineState(Date.now() % 1000000, this.depth, this.heroClass);
        this.bounties = this._generateOfflineBounties(this.depth);
        prevPlayer.x = this.dungeon.playerSpawn[0];
        prevPlayer.y = this.dungeon.playerSpawn[1];
        this.player = prevPlayer;
      }
      this._applyDifficulty();

      sounds.setBiome(this.dungeon.biome);
      this._applyOmen();
      this.dungeon.updateFOV(this.player.x, this.player.y, this._effectiveFov());
      this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
      this.ui.renderBounties(this.bounties);
      this.sigilCount = 0;
      this.updateSigils();
      this.unlockLore(this.loreEvents?.[`depth${this.depth}`]);
      this.saveGameState();
    } finally {
      // Only the run that owns this descent clears its own flag.
      if (token === this.runToken) this.transitioning = false;
    }
  }

  updateBountyProgress(bountyId, amount = 1) {
    if (!this.bounties) return;
    for (const b of this.bounties) {
      if (b.id === bountyId && !b.completed) {
        b.progress = Math.min(b.target, b.progress + amount);
        if (b.progress >= b.target) {
          b.completed = true;
          this.player.gold += b.reward_gold;
          this._grantXp(b.reward_xp);
          sounds.playBountyComplete();
          this.renderer.addFloatingText(`BOUNTY DONE! +${b.reward_gold}🪙`, this.player.x, this.player.y, "#48bb78");
          this.ui.logMessage(`📜 BOUNTY COMPLETED: ${b.title}! Claimed +${b.reward_gold} Gold & +${b.reward_xp} XP!`, "level");
          this.renderer.addParticles(this.player.x, this.player.y, "#48bb78", 22);
        }
      }
    }
    this.ui.renderBounties(this.bounties);
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
  }

  _generateOfflineBounties(depth) {
    return [
      { id: "bounty_urns", title: "Catacomb Purifier", desc: "Shatter 3 Burial Urns in the depths", target: 3, progress: 0, completed: false, reward_gold: 25 + depth * 10, reward_xp: 20 + depth * 5 },
      { id: "bounty_streak", title: "Frenzy of Blades", desc: "Achieve a x3 Kill Streak in rapid combat", target: 3, progress: 0, completed: false, reward_gold: 35 + depth * 10, reward_xp: 30 + depth * 5 },
      { id: "bounty_chests", title: "Vault Plunderer", desc: "Unlock 2 Hidden Treasure Chests", target: 2, progress: 0, completed: false, reward_gold: 30 + depth * 10, reward_xp: 25 + depth * 5 },
      { id: "bounty_vault", title: "Seal Keeper", desc: "Gather 3 sigils and open a sealed vault", target: 1, progress: 0, completed: false, reward_gold: 60 + depth * 20, reward_xp: 50 + depth * 10 },
    ];
  }

  _triggerNearMissSurge() {
    sounds.playNearMissSurge();
    this.renderer.shake(10, 260);
    this.ui.triggerAdrenalineVignette();
    this.player.mana = Math.min(this.player.max_mana, this.player.mana + 2);
    this.player.status_effects.shield_wall = Math.max(this.player.status_effects.shield_wall || 0, 3);
    this._recalculatePlayerStats();
    this.renderer.addFloatingText("⚡ ADRENALINE SURGE!", this.player.x, this.player.y, "#e53e3e");
    this.ui.logMessage("⚡ NEAR-MISS ADRENALINE SURGE! Stared death in the face and rallied (+2 MP, +4 DEF Barrier)!", "crit");
  }

  _grantXp(amount) {
    if (!amount) return;
    this.player.xp += amount;
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
      this.renderer.addLevelUpCelebration(this.player.x, this.player.y, this.player.level);
      this.ui.logMessage(`⭐ LEVEL UP! You reached Level ${this.player.level}! (+12 HP, +6 MP, +2 ATK, +1 DEF)`, "level");
    }
  }

  updateSigils() {
    if (this.dungeon) this.dungeon.sigilsHeld = this.sigilCount;
    this.ui.updateSigils(this.sigilCount, 3);
  }

  openSigilVault(vault) {
    vault.opened = true;
    sounds.playJackpot();
    this.renderer.shake(9, 260);
    this.renderer.addJackpotExplosion(vault.x, vault.y);
    this.renderer.addShockwave(vault.x, vault.y, "#ecc94b", 120);

    const names = { 1: "Gate-Warden's Seal", 2: "Tidewrought Signet" };
    const relic = {
      id: `vault_relic_b${this.depth}`,
      name: names[this.depth] || "Emberheart Sigil-Crown",
      type: "ring",
      rarity: "legendary",
      description: `Legendary vault relic (+${4 + this.depth} ATK, +${2 + this.depth} DEF, +${10 + this.depth * 5} Max HP).`,
      stats: {
        attack: 4 + this.depth,
        defense: 2 + this.depth,
        max_hp: 10 + this.depth * 5,
      },
    };

    if (this.player.inventory.length < 12) {
      this.player.inventory.push(relic);
      this.renderer.addFloatingItemBadge(relic.name, relic.rarity, vault.x, vault.y);
      this.ui.logMessage(`🏆 THE VAULT OPENS: ${relic.name} (LEGENDARY) is yours!`, "level");
    } else {
      const payout = 80 + this.depth * 25;
      this.player.gold += payout;
      this.ui.logMessage(`🏆 The vault opens, but your pack is full; it pays ${payout} gold instead.`, "loot");
    }

    const gold = 40 + this.depth * 20;
    this.player.gold += gold;
    this._grantXp(30 + this.depth * 10);
    this.unlockLore(this.loreEvents?.vault);
    this.updateBountyProgress("bounty_vault", 1);
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
  }

  resolveSoul(soul, choice) {
    if (!soul || soul.resolved) return;
    if (!["ember", "toll", "lore"].includes(choice)) return;
    soul.resolved = true;

    if (choice === "ember") {
      const before = this.player.hp;
      const heal = Math.max(10, Math.floor(this.player.max_hp * 0.3));
      this.player.hp = Math.min(this.player.max_hp, this.player.hp + heal);
      this.player.status_effects = this.player.status_effects || {};
      this.player.status_effects.shield_wall = Math.max(
        this.player.status_effects.shield_wall || 0, 3
      );
      this._recalculatePlayerStats();
      sounds.playShrine();
      this.renderer.addParticles(soul.x, soul.y, "#f6ad55", 18);
      this.renderer.addFloatingText(`+${this.player.hp - before} EMBER`, this.player.x, this.player.y, "#f6ad55");
      this.ui.logMessage(`🕯️ The soul's ember seeps into your wounds (+${this.player.hp - before} HP) and hardens your guard (+6 DEF for 3 turns).`, "loot");
    } else if (choice === "toll") {
      const gold = 45 + this.depth * 15;
      this.player.gold += gold;
      sounds.playJackpot();
      this.renderer.addParticles(soul.x, soul.y, "#ecc94b", 16);
      this.renderer.addFloatingText(`+${gold} 🪙`, this.player.x, this.player.y, "#ecc94b");
      this.ui.logMessage(`🪙 The soul pays a debt it no longer remembers (+${gold} Gold).`, "loot");
      if (this.player.inventory.length < 12 && Math.random() < 0.5) {
        const relics = [
          { id: "potion_rejuvenation", name: "Draught of Rejuvenation", type: "potion", rarity: "rare", description: "Restores 30 HP & 20 MP, cleanses afflictions.", stats: { heal_hp: 30, restore_mana: 20 } },
          { id: "ring_shadow", name: "Band of the Shadowstalker", type: "ring", rarity: "rare", description: "+15% Crit Rate, +3 ATK.", stats: { attack: 3, crit_bonus: 15 } },
          { id: "boots_shadowstep", name: "Shadowstep Treads", type: "boots", rarity: "rare", description: "+2 DEF, +10% Crit Rate.", stats: { defense: 2, crit_bonus: 10 } },
          { id: "amulet_bloodstone", name: "Bloodstone Talisman", type: "amulet", rarity: "rare", description: "+18 Max HP, +2 ATK.", stats: { max_hp: 18, attack: 2 } },
        ];
        const relic = relics[Math.floor(Math.random() * relics.length)];
        this.player.inventory.push(relic);
        this.renderer.addFloatingItemBadge(relic.name, relic.rarity, soul.x, soul.y);
        this.ui.logMessage(`The soul's burden includes a relic: ${relic.name}.`, "loot");
      }
    } else if (choice === "lore") {
      this.unlockLore(this.loreEvents?.soul);
      this._grantXp(15);
      this.renderer.addParticles(soul.x, soul.y, "#d6bcfa", 14);
      this.renderer.addFloatingText("+15 XP", this.player.x, this.player.y, "#d6bcfa");
      this.ui.logMessage("🗣️ The soul speaks of the door it kept and the war it never heard end (+15 XP, journal updated).", "level");
    }

    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
  }

  resolvePact(pact, choice) {
    if (!pact || pact.used) return;
    if (!["wrath", "ward", "avarice"].includes(choice)) return;
    pact.used = true;
    this.player.status_effects = this.player.status_effects || {};

    if (choice === "wrath") {
      const burned = Math.max(5, Math.floor(this.player.max_hp * 0.2));
      this.player.perm_attack = (this.player.perm_attack || 0) + 4;
      this.player.bonus_max_hp = (this.player.bonus_max_hp || 0) - burned;
      this._recalculatePlayerStats();
      this.player.hp = Math.min(this.player.hp, this.player.max_hp);
      sounds.playLevelUp();
      this.renderer.shake(8, 220);
      this.renderer.addParticles(pact.x, pact.y, "#e53e3e", 20);
      this.renderer.addFloatingText(`+4 ATK  -${burned} MAX HP`, this.player.x, this.player.y, "#fc8181");
      this.ui.logMessage(`🩸 PACT OF WRATH: +4 Attack forever. The altar took ${burned} maximum HP as its tithe.`, "crit");
    } else if (choice === "ward") {
      const sealed = Math.min(3, this.player.max_mana);
      this.player.bonus_max_hp = (this.player.bonus_max_hp || 0) + 18;
      this.player.bonus_max_mana = (this.player.bonus_max_mana || 0) - sealed;
      this._recalculatePlayerStats();
      this.player.hp = Math.min(this.player.max_hp, this.player.hp + 18);
      sounds.playShrine();
      this.renderer.addParticles(pact.x, pact.y, "#e2e8f0", 18);
      this.renderer.addFloatingText("+18 MAX HP", this.player.x, this.player.y, "#e2e8f0");
      this.ui.logMessage(`🦴 PACT OF THE GRAVE: +18 Max HP and sealed wounds knit shut; ${sealed} Max Mana is entombed.`, "loot");
    } else {
      const gold = 120 + this.depth * 30;
      this.player.gold += gold;
      sounds.playJackpot();
      this.renderer.addJackpotExplosion(pact.x, pact.y);
      this.renderer.addFloatingText(`+${gold} 🪙`, this.player.x, this.player.y, "#ecc94b");
      const spots = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, 1], [1, -1], [-1, -1],
      ];
      let raised = 0;
      for (const [dx, dy] of spots) {
        if (raised >= 2) break;
        const wx = pact.x + dx;
        const wy = pact.y + dy;
        if (this.dungeon.isWalkable(wx, wy) && !this._isOccupied(wx, wy)) {
          this.monsters.push(this._spawnPactWraith(wx, wy));
          this.renderer.addParticles(wx, wy, "#f56565", 14);
          raised += 1;
        }
      }
      this.ui.logMessage(`🪙 PACT OF AVARICE: ${gold} gold fills your purse. ${raised} Pact-Bound Wraith${raised === 1 ? "" : "s"} rise to collect the debt.`, "crit");
    }

    this.unlockLore(this.loreEvents?.pact);
    this._recalculatePlayerStats();
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
  }

  _spawnPactWraith(x, y) {
    const scale = 1 + (this.depth - 1) * 0.3;
    const hp = Math.max(10, Math.floor(26 * scale));
    return this._scaleMonster({
      name: "Pact-Bound Wraith",
      type: "wraith",
      x,
      y,
      hp,
      max_hp: hp,
      attack: Math.max(4, Math.floor(8 * scale)),
      defense: Math.max(0, Math.floor(2 * scale)),
      xp_reward: 28,
      gold_reward: 12,
      loot_drop: null,
      is_boss: false,
      is_champion: false,
      champion_affix: null,
      ai_state: "idle",
      status_effects: {},
    });
  }

  _scaleMonster(monster) {
    if (!monster || monster.difficulty_scaled || this.difficulty === "normal") return monster;
    const profile = DIFFICULTIES[this.difficulty] || DIFFICULTIES.normal;
    monster.max_hp = Math.max(1, Math.round((monster.max_hp || monster.hp || 1) * profile.hp));
    monster.hp = monster.max_hp;
    monster.attack = Math.max(1, Math.round((monster.attack || 0) * profile.attack));
    monster.xp_reward = Math.round((monster.xp_reward || 0) * profile.reward);
    monster.gold_reward = Math.round((monster.gold_reward || 0) * profile.reward);
    monster.difficulty_scaled = true;
    return monster;
  }

  _applyDifficulty() {
    for (const monster of this.monsters || []) this._scaleMonster(monster);
  }

  _effectiveFov() {
    const base = this.fovRadius || 7;
    if (!this.dungeon || !this.player) return base;
    const nearSconce = (this.dungeon.sconces || []).some((sconce) =>
      Math.abs(sconce.x - this.player.x) + Math.abs(sconce.y - this.player.y) <= 2
    );
    return nearSconce ? Math.max(base, 7) : base;
  }

  _omenFor(seed, depth) {
    return omenFor(seed, depth);
  }

  _applyOmen({ announce = true, extraFoe = true } = {}) {
    if (!this.dungeon) return;
    const seed = Number(this.dungeon.seed ?? 0);
    const key = `${seed}:${this.depth}`;
    const omen = omenFor(seed, this.depth);
    this.omen = omen;
    this.fovRadius = omen.fov;
    this.ui.updateOmen(omen);
    if (this.omenKey === key) return;
    this.omenKey = key;
    if (announce) {
      this.unlockLore(this.loreEvents?.omen);
      this.ui.logMessage(`${omen.icon} Omen — ${omen.name}: ${omen.desc}`, "system");
    }
    if (extraFoe && omen.extraFoe) this._spawnOmenFoe();
  }

  _spawnOmenFoe() {
    const candidates = [];
    for (const room of this.dungeon.rooms || []) {
      if ((this.dungeon.merchants || []).some((m) => m.x === room.center[0] && m.y === room.center[1])) continue;
      for (let y = room.y + 1; y < room.y + room.h - 1; y += 1) {
        for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) {
          if (!this.dungeon.isWalkable(x, y) || this._isOccupied(x, y)) continue;
          if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) >= 6) {
            candidates.push([x, y]);
          }
        }
      }
    }
    if (!candidates.length) {
      for (let y = 0; y < this.dungeon.height; y += 1) {
        for (let x = 0; x < this.dungeon.width; x += 1) {
          if (!this.dungeon.isWalkable(x, y) || this._isOccupied(x, y)) continue;
          if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) >= 6) {
            candidates.push([x, y]);
          }
        }
      }
    }
    if (!candidates.length) return;
    const [x, y] = candidates[Math.floor(Math.random() * candidates.length)];
    const scale = 1 + (this.depth - 1) * 0.25;
    const hp = Math.max(6, Math.floor(14 * scale));
    this.monsters.push(this._scaleMonster({
      name: "Restless Shade",
      type: "bat",
      x,
      y,
      hp,
      max_hp: hp,
      attack: Math.max(2, Math.floor(5 * scale)),
      defense: 0,
      xp_reward: 12,
      gold_reward: 8,
      loot_drop: null,
      is_boss: false,
      is_champion: false,
      champion_affix: null,
      status_effects: {},
    }));
    this.renderer.addParticles(x, y, "#9ae6b4", 10);
  }

  _spawnMimic(x, y) {
    const scale = 1 + (this.depth - 1) * 0.35;
    const hp = Math.max(18, Math.floor(32 * scale));
    this.monsters.push(this._scaleMonster({
      name: "Gilded Mimic",
      type: "mimic",
      x,
      y,
      hp,
      max_hp: hp,
      attack: Math.max(3, Math.floor(8 * scale)),
      defense: 2,
      xp_reward: 35,
      gold_reward: 25,
      loot_drop: "potion_rejuvenation",
      is_boss: false,
      is_champion: false,
      champion_affix: null,
      status_effects: {},
    }));
    return this.monsters[this.monsters.length - 1];
  }

  stepPlayer(dx, dy) {
    if (this.gameOver || this.victory || this.transitioning) return;

    const fromX = this.player.x;
    const fromY = this.player.y;
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
      this.unlockLore(this.loreEvents?.shrine);

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
      this.updateBountyProgress("bounty_shrine", 1);
    }

    // Check Ceramic Urn
    const urn = (this.dungeon.urns || []).find((u) => u.x === nx && u.y === ny && !u.broken);
    if (urn) {
      urn.broken = true;
      sounds.playUrn();
      this.renderer.addParticles(nx, ny, "#9c4221", 10);
      const isUrnCrit = Math.random() < 0.18;
      const baseUrnGold = Math.floor(
        (6 + Math.floor(Math.random() * 12)) * (this.omen?.goldMult || 1)
      );
      const goldDrop = isUrnCrit ? Math.floor(baseUrnGold * 2.5) : baseUrnGold;
      this.player.gold += goldDrop;

      if (isUrnCrit) {
        sounds.playJackpot();
        this.renderer.addJackpotExplosion(nx, ny);
        this.renderer.addFloatingText(`CRIT URN! +${goldDrop} 🪙`, nx, ny, "#ecc94b");
        this.ui.logMessage(`✨ Shattered burial urn! CRITICAL JACKPOT: ${goldDrop} Gold!`, "loot");
      } else {
        this.renderer.addFloatingText(`+${goldDrop} 🪙`, nx, ny, "#ecc94b");
        this.ui.logMessage(`Shattered burial urn! Found ${goldDrop} gold coins.`, "loot");
      }
      this.updateBountyProgress("bounty_urns", 1);
      if (Math.random() < 0.22) {
        const found = this.unlockLore(this.loreEvents?.watchers);
        if (!found) this.unlockRandomLore();
      }
    }

    // Check floor sigil
    const sigil = (this.dungeon.sigils || []).find(
      (s) => s.x === nx && s.y === ny && !s.collected
    );
    if (sigil) {
      sigil.collected = true;
      this.sigilCount += 1;
      sounds.playShrine();
      this.renderer.addShockwave(nx, ny, "#63b3ed", 55);
      this.renderer.addParticles(nx, ny, "#63b3ed", 16);
      this.renderer.addFloatingText(`SIGIL ${this.sigilCount}/3`, nx, ny, "#90cdf4");
      this.ui.logMessage(`🔑 Sigil recovered (${this.sigilCount}/3). Somewhere, a sealed vault answers.`, "loot");
      this.unlockLore(this.loreEvents?.sigil);
      this.updateSigils();
    }

    // Sealed vault
    const vault = this.dungeon.vault;
    if (vault && vault.x === nx && vault.y === ny) {
      if (vault.opened) {
        this.ui.logMessage("The sealed vault stands open and empty.", "system");
      } else if (this.sigilCount >= 3) {
        this.sigilCount -= 3;
        this.openSigilVault(vault);
      } else {
        this.ui.logMessage(`🔒 Three sockets wait on the vault door; you carry ${this.sigilCount} sigils.`, "system");
      }
      this.updateSigils();
    }

    // Check Lost Soul: a dialogue, not a fight
    const soul = (this.dungeon.souls || []).find((s) => s.x === nx && s.y === ny && !s.resolved);
    if (soul) {
      this.ui.showSoulDialogueModal(soul, (choice) => this.resolveSoul(soul, choice));
      this.finishPlayerTurn();
      return;
    }

    // Black pact altar: a bargain, not loot
    const pact = (this.dungeon.pacts || []).find((p) => p.x === nx && p.y === ny && !p.used);
    if (pact) {
      this.ui.showPactModal(pact, (choice) => this.resolvePact(pact, choice));
      this.finishPlayerTurn();
      return;
    }

    // Check chest
    const chest = this.dungeon.chests.find((c) => c.x === nx && c.y === ny && !c.opened);
    if (chest) {
      if (this.dungeon.mimics?.has(`${nx},${ny}`)) {
        chest.opened = true;
        this.dungeon.mimics.delete(`${nx},${ny}`);
        this.player.x = fromX;
        this.player.y = fromY;
        this._spawnMimic(nx, ny);
        sounds.playHit(false);
        this.renderer.addFloatingText("MIMIC!", nx, ny, this.renderer.warningColor);
        this.renderer.addParticles(nx, ny, this.renderer.trapColor, 14);
        this.ui.logMessage("🦷 The chest was a mimic! It snaps shut and lunges from the lid!", "hit");
        this.finishPlayerTurn();
        return;
      }
      chest.opened = true;
      const roll = Math.random();
      const baseGold = Math.floor(
        (18 + Math.floor(Math.random() * 22) + (this.depth - 1) * 10)
        * (this.omen?.goldMult || 1)
      );
      let goldFound = baseGold;

      if (roll >= 0.15 && roll < 0.35) {
        // Critical 2.5x Jackpot!
        goldFound = Math.floor(baseGold * 2.5);
        sounds.playJackpot();
        this.renderer.shake(9, 240);
        this.renderer.addJackpotExplosion(nx, ny);
        this.ui.showJackpotBanner();
        this.renderer.addFloatingText(`JACKPOT! +${goldFound} 🪙`, nx, ny, "#ecc94b");
        this.ui.logMessage(`★★★ CRITICAL TREASURE JACKPOT! Found ${goldFound} Gold! ★★★`, "crit");
      } else {
        sounds.playChest();
        this.renderer.addFloatingText(`+${goldFound} 🪙`, nx, ny, "#ecc94b");
        this.renderer.addParticles(nx, ny, "#ecc94b", 16);
        this.ui.logMessage(`Opened a locked chest! Found ${goldFound} gold!`, "loot");
      }
      this.player.gold += goldFound;
      this.updateBountyProgress("bounty_chests", 1);

      if (roll < 0.15 && this.player.inventory.length < 12) {
        const pool = [
          { id: "potion_rejuvenation", name: "Draught of Rejuvenation", type: "potion", rarity: "rare", description: "Restores 30 HP & 20 Mana, cleanses afflictions.", stats: { heal_hp: 30, restore_mana: 20 } },
          { id: "potion_invulnerability", name: "Divine Aegis Draught", type: "potion", rarity: "rare", description: "Grants impenetrable Barrier (+6 DEF for 4 turns).", stats: { shield_wall_turns: 4 } },
          { id: "shield_tower", name: "Aegis Tower Shield", type: "armor", rarity: "rare", description: "+8 DEF bulwark.", stats: { defense: 8 } },
          { id: "ring_power", name: "Ring of Arcane Might", type: "ring", rarity: "rare", description: "+3 ATK, +10 Max Mana.", stats: { attack: 3, max_mana: 10 } },
          { id: "amulet_bloodstone", name: "Bloodstone Talisman", type: "amulet", rarity: "rare", description: "+18 Max HP, +2 ATK.", stats: { max_hp: 18, attack: 2 } },
          { id: "boots_shadowstep", name: "Shadowstep Treads", type: "boots", rarity: "rare", description: "+2 DEF, +10% Crit Rate.", stats: { defense: 2, crit_bonus: 10 } },
          { id: "hammer_thunder", name: "Stormforged Warhammer", type: "weapon", rarity: "epic", description: "+13 ATK, 25% stun chance.", stats: { attack: 13, stun_chance: 25 } },
          { id: "cloak_ethereal", name: "Spectral Shroud", type: "armor", rarity: "epic", description: "+7 DEF, +15 Max MP.", stats: { defense: 7, max_mana: 15 } },
          { id: "tome_pyromancy", name: "Tome of Blazing Embers", type: "amulet", rarity: "epic", description: "+4 ATK, +20 Max MP.", stats: { attack: 4, max_mana: 20 } },
          { id: "potion_elixir_str", name: "Elixir of the Titan", type: "potion", rarity: "rare", description: "Permanently increases base Attack by +2.", stats: { perm_attack: 2 } },
        ];
        const dropItem = pool[Math.floor(Math.random() * pool.length)];
        this.player.inventory.push(dropItem);
        this.renderer.addFloatingItemBadge(dropItem.name, dropItem.rarity, nx, ny);
        this.ui.logMessage(`Found rare relic: ${dropItem.name} (${dropItem.rarity.toUpperCase()})!`, "loot");
      }
    }

    // Check trap
    const trap = this.dungeon.traps.find((t) => t.x === nx && t.y === ny && !t.triggered && !t.disarmed);
    if (trap) {
      trap.triggered = true;
      trap.discovered = true;
      const trapDmg = 8 + Math.floor(Math.random() * 6);
      this.player.hp = Math.max(0, this.player.hp - trapDmg);
      sounds.playHit(false);
      this.renderer.addFloatingText(`-${trapDmg}`, nx, ny, "#ff2222");
      this.ui.logMessage(`⚠️ Triggered a spike trap! Took ${trapDmg} damage!`, "hit");

      if (this.player.hp <= 0) {
        this.handlePlayerDeath("a concealed spike trap");
        return;
      }

      // Check Near-Miss Adrenaline Surge on surviving trap
      if (this.player.hp <= Math.floor(this.player.max_hp * 0.28) && trapDmg >= 6) {
        this._triggerNearMissSurge();
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

  _classAttackMultiplier(target) {
    if (this.heroClass === "rogue" && target && target.max_hp > 0
        && target.hp <= target.max_hp * 0.3) {
      return 1.25;
    }
    return 1;
  }

  _spellMultiplier() {
    return this.heroClass === "mage" ? 1.15 : 1;
  }

  _comboBonus() {
    return 12 + this.depth * 3;
  }

  attackMonster(monster) {
    const atk = this.player.attack;
    const def = monster.defense;
    const baseDmg = Math.max(1, atk - def);
    const critChance = this.player.crit_chance || (this.heroClass === "rogue" ? 0.30 : (this.heroClass === "mage" ? 0.10 : 0.15));
    const isCrit = Math.random() < critChance;
    let dmg = Math.floor(baseDmg * (isCrit ? 1.5 : (0.85 + Math.random() * 0.3)));
    dmg = Math.floor(dmg * this._classAttackMultiplier(monster));

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

    // Weapon on-hit procs
    const weapon = this.player.equipped.weapon;
    if (weapon && monster.hp > 0) {
      const stats = weapon.stats || {};
      monster.status_effects = monster.status_effects || {};
      const poisonChance = stats.poison_chance || 0;
      if (poisonChance > 0 && Math.random() * 100 < poisonChance) {
        monster.status_effects.poison = Math.max(monster.status_effects.poison || 0, 3);
        this.renderer.addFloatingText("☠ POISON", monster.x, monster.y, "#48bb78");
        this.ui.logMessage(`${weapon.name} infected ${monster.name} with venom!`, "loot");
      }
      const stunChance = stats.stun_chance || 0;
      if (stunChance > 0 && Math.random() * 100 < stunChance) {
        monster.status_effects.stun = Math.max(monster.status_effects.stun || 0, 1);
        this.renderer.addFloatingText("⚡ STUN", monster.x, monster.y, "#f6e05e");
        this.renderer.shake(4, 120);
        this.ui.logMessage(`⚡ ${weapon.name} stunned ${monster.name}!`, "crit");
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

    // Paladin passive: Zeal restores a little health and mana on a kill.
    if (this.heroClass === "paladin" && !monster.is_boss) {
      const hpBefore = this.player.hp;
      const manaBefore = this.player.mana;
      this.player.hp = Math.min(this.player.max_hp, this.player.hp + 3);
      this.player.mana = Math.min(this.player.max_mana, this.player.mana + 1);
      const healed = this.player.hp - hpBefore;
      const mana = this.player.mana - manaBefore;
      if (healed > 0 || mana > 0) {
        this.renderer.addFloatingText(`+${healed} HP +${mana} MP`, this.player.x, this.player.y, this.renderer.healColor);
        this.ui.logMessage(`Zeal: the kill restores ${healed} HP and ${mana} MP.`, "heal");
      }
    }

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
      this.updateBountyProgress("bounty_champions", 1);
    }

    // Combo Kill Streak & Momentum
    this.killStreak += 1;
    this.turnsSinceKill = 0;
    this.ui.updateStreak(this.killStreak);

    if (this.killStreak >= 3) {
      this.updateBountyProgress("bounty_streak", this.killStreak);
    }

    if (this.killStreak === 2) {
      sounds.playCombo(2);
      this._grantXp(10);
      this.renderer.addFloatingText("DOUBLE SLAY! +10 XP", this.player.x, this.player.y, "#f6ad55");
      this.ui.logMessage("🔥 DOUBLE SLAY! Momentum surging (+10 Bonus XP)!", "loot");
    } else if (this.killStreak === 3) {
      sounds.playCombo(3);
      this.player.mana = Math.min(this.player.max_mana, this.player.mana + 1);
      this.renderer.addFloatingText("TRIPLE SLAY! +1 MP", this.player.x, this.player.y, "#63b3ed");
      this.ui.logMessage("⚡ TRIPLE SLAY! Battle adrenaline restored 1 Mana!", "loot");
    } else if (this.killStreak >= 5) {
      sounds.playCombo(5);
      this._grantXp(25);
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
      this.unlockLore(this.loreEvents?.boss);
      this.unlockLore(this.loreEvents?.crown);
      this.unlockLore(this.loreEvents?.debt);
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
        this.renderer.addFloatingItemBadge(crown.name, crown.rarity, monster.x, monster.y);
      }
      const victoryToken = this.runToken;
      setTimeout(() => { if (victoryToken === this.runToken && !this.gameOver && !this.victory) this.handleVictory(); }, 1500);
      return;
    }

    // XP & Level up
    this._grantXp(monster.xp_reward);
  }

  triggerSlotAction(slotNum) {
    if (this.gameOver || this.victory || this.transitioning) return;
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
    const isCrit = Math.random() < Math.min(0.95, (this.player.crit_chance || 0.30) + 0.40);
    const baseDmg = Math.max(3, this.player.attack - target.defense);
    let dmg = Math.floor(baseDmg * (isCrit ? 1.9 : 1.3));
    dmg = Math.floor(dmg * this._classAttackMultiplier(target));
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playHit(isCrit);

    this.renderer.addShockwave(target.x, target.y, "#48bb78", 65);
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
    let combo = 0;
    if (target.status_effects && target.status_effects.burn > 0) {
      combo = this._comboBonus();
      delete target.status_effects.burn;
      this.renderer.addFloatingText(`SHATTER +${combo}`, target.x, target.y, this.renderer.warningColor);
      this.ui.logMessage(`❄️ SHATTER! The burning target cracks under the frost (+${combo} damage).`, "crit");
    }
    const dmg = Math.floor((18 + Math.floor(Math.random() * 8)) * this._spellMultiplier()) + combo;
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playFreeze();

    this.renderer.addShockwave(target.x, target.y, "#63b3ed", 80);
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
    this.renderer.addShockwave(this.player.x, this.player.y, "#9f7aea", 130);

    let count = 0;
    for (const m of this.monsters) {
      if (m.hp > 0 && Math.hypot(m.x - this.player.x, m.y - this.player.y) <= 3.8) {
        const dmg = Math.floor((22 + Math.floor(Math.random() * 10)) * this._spellMultiplier());
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
        { item: { id: "potion_invulnerability", name: "Divine Aegis Draught", type: "potion", rarity: "rare", description: "Grants impenetrable Barrier (+6 DEF for 4 turns).", stats: { shield_wall_turns: 4 } }, price: 45 },
        { item: { id: "hammer_thunder", name: "Stormforged Warhammer", type: "weapon", rarity: "epic", description: "+13 ATK, 25% stun chance.", stats: { attack: 13, stun_chance: 25 } }, price: 130 },
        { item: { id: "cloak_ethereal", name: "Spectral Shroud", type: "armor", rarity: "epic", description: "+7 DEF, +15 Max MP.", stats: { defense: 7, max_mana: 15 } }, price: 120 },
        { item: { id: "amulet_bloodstone", name: "Bloodstone Talisman", type: "amulet", rarity: "rare", description: "+18 Max HP, +2 ATK.", stats: { max_hp: 18, attack: 2 } }, price: 75 },
        { item: { id: "boots_shadowstep", name: "Shadowstep Treads", type: "boots", rarity: "rare", description: "+2 DEF, +10% Crit Rate.", stats: { defense: 2, crit_bonus: 10 } }, price: 65 },
        { item: { id: "tome_pyromancy", name: "Tome of Blazing Embers", type: "amulet", rarity: "epic", description: "+4 ATK, +20 Max MP.", stats: { attack: 4, max_mana: 20 } }, price: 105 },
        { item: { id: "potion_elixir_str", name: "Elixir of the Titan", type: "potion", rarity: "rare", description: "Permanently increases base Attack by +2.", stats: { perm_attack: 2 } }, price: 70 },
        { item: { id: "potion_elixir_def", name: "Elixir of Ironhide", type: "potion", rarity: "rare", description: "Permanently increases base Defense by +2.", stats: { perm_defense: 2 } }, price: 70 },
      ];
    }
    this.unlockLore(this.loreEvents?.merchant);
    this.unlockLore(this.loreEvents?.lantern);
    sounds.playShopBuy();
    this._refreshMerchantShop();
  }

  _sellPrice(item) {
    const base = { common: 10, rare: 30, epic: 60, legendary: 100 }[item?.rarity] || 10;
    return base;
  }

  _refreshMerchantShop(activeTab = "buy") {
    const sellable = this.player.inventory
      .map((item, index) => ({ item, index, price: this._sellPrice(item) }))
      .filter((entry) => entry.item.id !== "crown_eternity");
    this.ui.showMerchantShopModal(
      this.merchantStock,
      this.player.gold,
      (itemId) => this.buyMerchantItem(itemId),
      sellable,
      (index) => this.sellInventoryItem(index),
      activeTab,
    );
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
    this._refreshMerchantShop();
  }

  sellInventoryItem(index) {
    if (!this.ui.shopOpen) return;
    if (this.gameOver || this.victory || this.transitioning) return;
    if (index < 0 || index >= this.player.inventory.length) return;
    const item = this.player.inventory[index];
    const price = this._sellPrice(item);
    this.player.inventory.splice(index, 1);
    this.player.gold += price;
    sounds.playShopBuy();
    this.renderer.addFloatingText(`+🪙${price}`, this.player.x, this.player.y, this.renderer.goldColor);
    this.ui.logMessage(`Sold ${item.name} to Hermit Grimbold for ${price} Gold.`, "loot");
    this.ui.clearItemSelection();
    this.ui.updateHero(this.player, this.turn, this.depth, this.kills);
    this.saveGameState();
    this._refreshMerchantShop("sell");
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
    let combo = 0;
    if (target.status_effects && target.status_effects.poison > 0) {
      combo = this._comboBonus();
      delete target.status_effects.poison;
      this.renderer.addFloatingText(`TOXIC +${combo}`, target.x, target.y, this.renderer.poisonColor);
      this.ui.logMessage(`☠️ TOXIC BLAST! The poison ignites (+${combo} damage).`, "crit");
    }
    const dmg = Math.floor((26 + Math.floor(Math.random() * 12)) * this._spellMultiplier()) + combo;
    target.hp = Math.max(0, target.hp - dmg);
    sounds.playSpell("fireball");

    this.renderer.addShockwave(target.x, target.y, "#dd6b20", 75);
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
    this.player.status_effects.shield_wall = Math.max(this.player.status_effects.shield_wall || 0, 4);
    this._recalculatePlayerStats();

    sounds.playShieldWall();
    this.renderer.addFloatingText("BARRIER (+6 DEF)", this.player.x, this.player.y, "#ecc94b");
    this.renderer.addParticles(this.player.x, this.player.y, "#d69e2e", 12);
    this.ui.logMessage("🛡️ Raised Shield Wall! Defense increased by +6 for 4 turns.", "loot");

    this.finishPlayerTurn();
  }

  quickPotion() {
    if (this.gameOver || this.victory || this.transitioning) return;
    const potIdx = this.player.inventory.findIndex((i) => i.type === "potion");
    if (potIdx >= 0) {
      this.useInventoryItem(potIdx);
    } else {
      this.ui.logMessage("No potions available in your backpack!", "system");
    }
  }

  waitTurn() {
    if (this.gameOver || this.victory || this.transitioning) return;
    if (this.player.mana < this.player.max_mana) {
      this.player.mana += 1;
    }
    this.ui.logMessage("You paused to catch your breath and recover focus.", "system");
    this.finishPlayerTurn();
  }

  searchForTraps() {
    if (this.gameOver || this.victory || this.transitioning) return;
    const adjacent = (this.dungeon.traps || []).find((trap) =>
      trap.discovered && !trap.triggered && !trap.disarmed
      && Math.abs(trap.x - this.player.x) + Math.abs(trap.y - this.player.y) === 1
    );
    if (adjacent) {
      adjacent.disarmed = true;
      sounds.playShrine();
      this.renderer.addFloatingText("DISARMED", adjacent.x, adjacent.y, this.renderer.warningColor);
      this.renderer.addParticles(adjacent.x, adjacent.y, this.renderer.trapColor, 10);
      this.ui.logMessage("🔧 You disarm the revealed spike trap and recover its mechanism.", "loot");
      this._grantXp(4 + this.depth * 2);
      this.finishPlayerTurn();
      return;
    }
    const radius = 3;
    const found = [];
    for (const trap of this.dungeon.traps || []) {
      if (trap.triggered || trap.discovered) continue;
      if (Math.hypot(trap.x - this.player.x, trap.y - this.player.y) > radius) continue;
      if (!this.dungeon.isVisible(trap.x, trap.y)) continue;
      trap.discovered = true;
      found.push(trap);
    }
    if (found.length > 0) {
      sounds.playShrine();
      for (const trap of found) {
        this.renderer.addFloatingText("TRAP!", trap.x, trap.y, this.renderer.warningColor);
        this.renderer.addParticles(trap.x, trap.y, this.renderer.trapColor, 8);
      }
      const label = found.length === 1 ? "trap" : "traps";
      this.ui.logMessage(`🔍 You search the floor and reveal ${found.length} ${label}.`, "system");
    } else {
      sounds.playStep();
      this.ui.logMessage("🔍 You search the floor and find nothing.", "system");
    }
    this.finishPlayerTurn();
  }

  useInventoryItem(idx) {
    if (this.gameOver || this.victory || this.transitioning) return;
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
      if (item.stats?.shield_wall_turns) {
        this.player.status_effects = this.player.status_effects || {};
        this.player.status_effects.shield_wall = Math.max(this.player.status_effects.shield_wall || 0, item.stats.shield_wall_turns);
        this.renderer.addFloatingText("BARRIER (+6 DEF)", this.player.x, this.player.y, "#ecc94b");
        this.ui.logMessage(`Drank ${item.name}: Raised impenetrable Divine Barrier (+6 DEF for ${item.stats.shield_wall_turns} turns)!`, "loot");
      }
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.finishPlayerTurn();
    } else if (item.type === "scroll" && item.id === "scroll_fireball") {
      const target = this._findTargetInRange(99);
      if (!target) {
        this.ui.logMessage("No visible enemy for the Scroll of Inferno.", "system");
        return;
      }
      let combo = 0;
      if (target.status_effects && target.status_effects.poison > 0) {
        combo = this._comboBonus();
        delete target.status_effects.poison;
        this.renderer.addFloatingText(`TOXIC +${combo}`, target.x, target.y, this.renderer.poisonColor);
        this.ui.logMessage(`☠️ TOXIC BLAST! The poison ignites (+${combo} damage).`, "crit");
      }
      const damage = Math.floor(
        (item.stats?.spell_damage || 30) * this._spellMultiplier()
      ) + combo;
      this.ui.logMessage(`📜 Read ${item.name}! ${damage} fire damage engulfs ${target.name}.`, "crit");
      sounds.playSpell("fireball");
      target.hp = Math.max(0, target.hp - damage);
      this.renderer.addFloatingText(`-${damage} FIRE`, target.x, target.y, this.renderer.emberColor);
      this.renderer.addParticles(target.x, target.y, this.renderer.emberColor, 14);
      if (target.hp <= 0) this._handleMonsterDefeat(target);
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.finishPlayerTurn();
    } else if (item.type === "scroll" && item.id === "scroll_nova") {
      // Arcane Nova scroll: deals 24 damage to all visible enemies
      this.ui.logMessage("📜 Read Scroll of Arcane Nova! Blinding magical shockwaves explode!", "crit");
      sounds.playSpell("fireball");
      const novaDamage = Math.floor(24 * this._spellMultiplier());
      for (const m of this.monsters) {
        if (m.hp > 0 && this.dungeon.isVisible(m.x, m.y)) {
          m.hp = Math.max(0, m.hp - novaDamage);
          this.renderer.addFloatingText(`-${novaDamage} NOVA`, m.x, m.y, this.renderer.arcaneColor);
          this.renderer.addParticles(m.x, m.y, "#b794f4", 10);
          if (m.hp <= 0) this._handleMonsterDefeat(m);
        }
      }
      this.player.inventory.splice(idx, 1);
      this.ui.clearItemSelection();
      this.finishPlayerTurn();
    } else if (["weapon", "armor", "ring", "amulet", "boots"].includes(item.type)) {
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
    // These bases mirror HERO_CLASSES in crawler/entities.py; a mismatch here silently
    // rewrote a fresh paladin from 65 HP / 4 DEF to 60 HP / 3 DEF on the first turn.
    let baseAtk = 8;
    let baseDef = 4;
    let baseHp = 65;
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
    let maxHpBonus = this.player.bonus_max_hp || 0;
    let maxMpBonus = this.player.bonus_max_mana || 0;

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
    this.player.max_hp = Math.max(1, baseHp + (this.player.level - 1) * 12 + maxHpBonus);
    this.player.max_mana = Math.max(0, baseMp + (this.player.level - 1) * 6 + maxMpBonus);
    this.player.hp = Math.min(this.player.hp, this.player.max_hp);
    this.player.mana = Math.min(this.player.mana, this.player.max_mana);
  }

  finishPlayerTurn() {
    this.turn += 1;
    this.dungeon.updateFOV(this.player.x, this.player.y, this._effectiveFov());

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
      if (m.hp > 0 && m.status_effects && m.status_effects.burn) {
        m.hp = Math.max(0, m.hp - 5);
        this.renderer.addFloatingText("-5 BURN", m.x, m.y, "#dd6b20");
        m.status_effects.burn -= 1;
        if (m.status_effects.burn <= 0) delete m.status_effects.burn;
        if (m.hp <= 0) this._handleMonsterDefeat(m);
      }
    }
  }

  processEnemyTurns() {
    const newMonsters = [];
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

      // Boss phases: the fight changes shape as Malakor weakens.
      if (monster.is_boss && !monster.phase_two && monster.hp <= monster.max_hp * 0.5) {
        monster.phase_two = true;
        monster.attack = Math.ceil(monster.attack * 1.2);
        const spots = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1]];
        let summoned = 0;
        for (const [sx, sy] of spots) {
          if (summoned >= 2) break;
          const tx = monster.x + sx;
          const ty = monster.y + sy;
          if (this.dungeon.isWalkable(tx, ty) && !this._isOccupied(tx, ty)) {
            newMonsters.push(this._summonSkeleton(tx, ty));
            this.renderer.addParticles(tx, ty, "#9f7aea", 16);
            summoned += 1;
          }
        }
        sounds.playNova();
        this.renderer.shake(8, 240);
        this.renderer.addShockwave(monster.x, monster.y, "#9f7aea", 110);
        this.renderer.addFloatingText("THE CROWN STIRS!", monster.x, monster.y, "#d6bcfa");
        this.ui.logMessage(`💀 Malakor tears open the vault floor and raises ${summoned} risen skeletons! His blows grow heavier.`, "crit");
      }

      if (monster.is_boss && !monster.phase_three && monster.hp <= monster.max_hp * 0.25) {
        monster.phase_three = true;
        monster.attack = Math.ceil(monster.attack * 1.3);
        sounds.playNova();
        this.renderer.shake(10, 300);
        this.renderer.addShockwave(monster.x, monster.y, "#e53e3e", 150);
        this.renderer.addFloatingText("MALAKOR ENRAGES!", monster.x, monster.y, "#fc8181");
        this.ui.logMessage("🔥 The Crown of Eternity flares crimson. Malakor fights like a cornered god!", "crit");
      }

      // Boss special ability: Soul Drain
      if (monster.is_boss && isVisible && dist <= 5 && Math.random() < 0.35) {
        const drain = Math.max(1, Math.round(12 * (this.omen?.atkMult || 1)));
        this.player.hp = Math.max(0, this.player.hp - drain);
        monster.hp = Math.min(monster.max_hp, monster.hp + 10);
        sounds.playSpell("fireball");
        this.renderer.addProjectile(monster.x, monster.y, this.player.x, this.player.y, "#9f7aea");
        this.renderer.addFloatingText(`-${drain} DRAIN`, this.player.x, this.player.y, "#b794f4");
        this.renderer.addFloatingText("+10 HP", monster.x, monster.y, "#9f7aea");
        this.ui.logMessage(`💀 Malakor casts Soul Drain! Drained ${drain} HP to empower himself!`, "hit");
        continue;
      }

      // Skeletal Archer: fires from a distance instead of closing to melee.
      if (
        monster.type === "archer" && isVisible && dist > 1 && dist <= 4
        && this._hasLineOfSight(monster.x, monster.y, this.player.x, this.player.y)
      ) {
        const baseDmg = Math.max(1, monster.attack - this.player.defense);
        const dmg = Math.max(
          1,
          Math.floor(baseDmg * (0.8 + Math.random() * 0.4) * (this.omen?.atkMult || 1))
        );
        this.player.hp = Math.max(0, this.player.hp - dmg);
        sounds.playHit(false);
        this.renderer.addProjectile(monster.x, monster.y, this.player.x, this.player.y, "#e2e8f0");
        this.renderer.addFloatingText(`-${dmg}`, this.player.x, this.player.y, "#ff3333");
        this.ui.logMessage(`${monster.name} looses a bone arrow for ${dmg} damage!`, "hit");
        continue;
      }

      // If adjacent: attack player
      if (Math.abs(monster.x - this.player.x) + Math.abs(monster.y - this.player.y) === 1) {
        const baseDmg = Math.max(1, monster.attack - this.player.defense);
        const dmg = Math.max(
          1,
          Math.floor(baseDmg * (0.8 + Math.random() * 0.4) * (this.omen?.atkMult || 1))
        );
        this.player.hp = Math.max(0, this.player.hp - dmg);
        sounds.playHit(false);

        if (dmg >= 8) {
          this.renderer.shake(6, 160);
        }

        this.renderer.addSlash(this.player.x, this.player.y);
        this.renderer.addFloatingText(`-${dmg}`, this.player.x, this.player.y, "#ff3333");
        this.ui.logMessage(`${monster.name} attacks you for ${dmg} damage!`, "hit");

        // Check Near-Miss Adrenaline Surge on surviving heavy combat blow
        if (this.player.hp > 0 && this.player.hp <= Math.floor(this.player.max_hp * 0.28) && dmg >= 6) {
          this._triggerNearMissSurge();
        }

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
        // Step toward player; a hound lunges two tiles per turn.
        this._stepToward(monster);
        if (monster.type === "hound") this._stepToward(monster);
      }
    }
    if (newMonsters.length) this.monsters.push(...newMonsters);
  }

  _stepToward(monster) {
    const dx = Math.sign(this.player.x - monster.x);
    const dy = Math.sign(this.player.y - monster.y);
    let nx = monster.x + dx;
    let ny = monster.y;
    if (dx !== 0 && this.dungeon.isWalkable(nx, ny) && !this._isOccupied(nx, ny)) {
      monster.x = nx;
      return true;
    }
    nx = monster.x;
    ny = monster.y + dy;
    if (dy !== 0 && this.dungeon.isWalkable(nx, ny) && !this._isOccupied(nx, ny)) {
      monster.y = ny;
      return true;
    }
    return false;
  }

  _hasLineOfSight(x0, y0, x1, y1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (steps === 0) return true;
    for (let i = 1; i < steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      if (!this.dungeon.isWalkable(x, y)) return false;
    }
    return true;
  }

  _summonSkeleton(x, y) {
    const scale = 1 + (this.depth - 1) * 0.25;
    const hp = Math.max(1, Math.floor(20 * scale));
    return this._scaleMonster({
      name: "Risen Skeleton",
      type: "skeleton",
      x,
      y,
      hp,
      max_hp: hp,
      attack: Math.max(1, Math.floor(6 * scale)),
      defense: Math.max(0, Math.floor(2 * scale)),
      xp_reward: 20,
      gold_reward: 10,
      loot_drop: null,
      is_boss: false,
      is_champion: false,
      champion_affix: null,
      ai_state: "idle",
      status_effects: {},
    });
  }

  _isOccupied(x, y) {
    if (this.player.x === x && this.player.y === y) return true;
    if (this.monsters.some((m) => m.x === x && m.y === y && m.hp > 0)) return true;

    // Interactive props are never covered by a moving or summoned monster.
    const dungeon = this.dungeon;
    if (!dungeon) return false;
    const props = [
      ...(dungeon.merchants || []),
      ...(dungeon.chests || []),
      ...(dungeon.shrines || []),
      ...(dungeon.urns || []),
      ...(dungeon.souls || []),
      ...(dungeon.sigils || []),
      ...(dungeon.pacts || []),
    ];
    if (dungeon.vault) props.push(dungeon.vault);
    return props.some((prop) => prop.x === x && prop.y === y);
  }

  handlePlayerDeath(cause = "unknown") {
    this.gameOver = true;
    this.unlockLore(this.loreEvents?.death, true);
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
    this.ui.btnModalClose.textContent = "Enter the Catacombs Anew";
  }

  handleVictory() {
    this.victory = true;
    const crownKept = this.player.inventory.some((item) => item.id === "crown_eternity")
      || (this.player.equipped?.ring?.id === "crown_eternity");
    sounds.stopMusic();
    this.clearSavedRun();
    this.recordRunEnd(true);
    this.ui.showModal(
      "🏆 TRIUMPH OF THE DUNGEON",
      `<p>You conquered the deepest vault, defeated Arch-Lich Malakor${crownKept ? ", and recovered the legendary <strong>Crown of Eternity</strong>" : ""}!</p>
       <br>
       <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 4px; border: 1px solid #d69e2e;">
         <p><strong>Hero Archetype:</strong> ${this.player.class_title || "Champion"}</p>
         <p><strong>Hero Level:</strong> ${this.player.level}</p>
         <p><strong>Monsters Slain:</strong> ${this.kills}</p>
         <p><strong>Total Gold:</strong> ${this.player.gold} 🪙</p>
         <p><strong>Relics Recovered:</strong> ${crownKept ? "Crown of Eternity" : "Crown of Eternity (left on the altar — backpack full)"}</p>
       </div>
       <br>
        <p>The ledger closes. Somewhere above, a lantern-keeper finally sets down a flame he has carried too long — and the debt of Malakor is paid in full.</p>
        <p>The light returns to the realm. Descend again for a new challenge?</p>`
    );
    this.ui.btnModalClose.textContent = "Descend Again";
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
        sigilCount: this.sigilCount,
        heroClass: this.heroClass,
        difficulty: this.difficulty,
        player: this.player,
        monsters: this.monsters,
        merchantStock: this.merchantStock,
        bounties: this.bounties,
        loreUnlocked: this.loreUnlocked,
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
          chests: this.dungeon.chests.map((c) => ({ x: c.x, y: c.y, opened: c.opened })),
          traps: this.dungeon.traps.map((t) => ({
            x: t.x,
            y: t.y,
            triggered: t.triggered,
            discovered: Boolean(t.discovered),
            disarmed: Boolean(t.disarmed),
          })),
          shrines: this.dungeon.shrines.map((s) => ({ x: s.x, y: s.y, activated: s.activated })),
          urns: this.dungeon.urns.map((u) => ({ x: u.x, y: u.y, broken: u.broken })),
          souls: (this.dungeon.souls || []).map((s) => ({ x: s.x, y: s.y, resolved: s.resolved })),
          sigils: (this.dungeon.sigils || []).map((s) => ({ x: s.x, y: s.y, collected: s.collected })),
          vault: this.dungeon.vault
            ? { x: this.dungeon.vault.x, y: this.dungeon.vault.y, opened: this.dungeon.vault.opened }
            : null,
          pacts: (this.dungeon.pacts || []).map((p) => ({ x: p.x, y: p.y, used: p.used })),
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
