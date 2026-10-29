/**
 * UI controller for Crypt-Crawler: hero gauges, paperdoll, backpack, status tray, and combat log.
 */

export class UIController {
  constructor() {
    // Top bar elements
    this.depthBadge = document.getElementById("depthBadge");
    this.turnCount = document.getElementById("turnCount");
    this.goldCount = document.getElementById("goldCount");
    this.sigilPill = document.getElementById("sigilPill");
    this.sigilCount = document.getElementById("sigilCount");
    this.saveIndicator = document.getElementById("saveIndicator");
    this.streakPill = document.getElementById("streakPill");
    this.streakCount = document.getElementById("streakCount");

    // Hero identity
    this.heroName = document.getElementById("heroName");
    this.heroClass = document.getElementById("heroClass");
    this.heroAvatar = document.getElementById("heroAvatar");

    // Gauges
    this.hpBar = document.getElementById("hpBar");
    this.hpText = document.getElementById("hpText");
    this.manaBar = document.getElementById("manaBar");
    this.manaText = document.getElementById("manaText");
    this.xpBar = document.getElementById("xpBar");
    this.xpText = document.getElementById("xpText");
    this.levelVal = document.getElementById("levelVal");

    // Status Tray
    this.heroStatusTray = document.getElementById("heroStatusTray");

    // Attributes
    this.statAttack = document.getElementById("statAttack");
    this.statDefense = document.getElementById("statDefense");
    this.statKills = document.getElementById("statKills");

    // Equipment slots
    this.slotWeaponContent = document.getElementById("slotWeaponContent");
    this.slotArmorContent = document.getElementById("slotArmorContent");
    this.slotAmuletContent = document.getElementById("slotAmuletContent");
    this.slotRingContent = document.getElementById("slotRingContent");
    this.slotBootsContent = document.getElementById("slotBootsContent");
    this.currentEquipped = {};

    // Inventory grid & selection
    this.inventoryGrid = document.getElementById("inventoryGrid");
    this.inventoryCapacity = document.getElementById("inventoryCapacity");
    this.inventoryFilters = Array.from(document.querySelectorAll("[data-filter]"));
    this.btnSortInventory = document.getElementById("btnSortInventory");
    this.inventoryFilter = "all";
    this.inventorySort = "default";
    this._lastInventory = [];
    this._visibleIndices = new Set();
    this.itemCardName = document.getElementById("itemCardName");
    this.itemCardDiff = document.getElementById("itemCardDiff");
    this.itemCardDesc = document.getElementById("itemCardDesc");
    this.btnItemUse = document.getElementById("btnItemUse");
    this.btnItemDrop = document.getElementById("btnItemDrop");

    // Chronicle Log
    this.chronicleLog = document.getElementById("chronicleLog");

    // Bounties
    this.bountyBadge = document.getElementById("bountyBadge");
    this.bountiesList = document.getElementById("bountiesList");

    // Journal
    this.btnJournal = document.getElementById("btnJournal");
    this.journalBadge = document.getElementById("journalBadge");

    // Atmospheric & Juicing FX
    this.jackpotBanner = document.getElementById("jackpotBanner");
    this.adrenalineVignette = document.getElementById("adrenalineVignette");
    this.lowHpVignette = document.getElementById("lowHpVignette");
    this.damageFlash = document.getElementById("damageFlash");
    this._lastHp = null;
    this._damageFlashTimer = null;
    this.crtOverlay = document.getElementById("crtOverlay");
    this.crtActive = false;

    // Modal
    this.modalOverlay = document.getElementById("modalOverlay");
    this.modalTitle = document.getElementById("modalTitle");
    this.modalBody = document.getElementById("modalBody");
    this.btnModalClose = document.getElementById("btnModalClose");

    this.selectedItemIndex = -1;
    this.onUseItem = null;
    this.onDropItem = null;
    this.onUnequip = null;
    this.onModalClose = null;
    this.onJournal = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.btnItemUse.addEventListener("click", () => {
      if (this.selectedItemIndex >= 0 && this.onUseItem) {
        this.onUseItem(this.selectedItemIndex);
      }
    });

    this.btnItemDrop.addEventListener("click", () => {
      if (this.selectedItemIndex >= 0 && this.onDropItem) {
        this.onDropItem(this.selectedItemIndex);
      }
    });

    this.inventoryFilters.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.inventoryFilter = btn.dataset.filter || "all";
        this.inventoryFilters.forEach((other) => other.classList.toggle("active", other === btn));
        this.renderInventory(this._lastInventory);
      });
    });

    this.btnSortInventory?.addEventListener("click", () => {
      this.inventorySort = this.inventorySort === "rarity" ? "default" : "rarity";
      this.btnSortInventory.textContent = this.inventorySort === "rarity" ? "Sort: Rarity" : "Sort: Default";
      this.renderInventory(this._lastInventory);
    });

    document.getElementById("slotWeapon")?.addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("weapon");
    });
    document.getElementById("slotArmor")?.addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("armor");
    });
    document.getElementById("slotAmulet")?.addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("amulet");
    });
    document.getElementById("slotRing")?.addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("ring");
    });
    document.getElementById("slotBoots")?.addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("boots");
    });

    this.btnJournal?.addEventListener("click", () => {
      if (this.onJournal) this.onJournal();
    });

    this.btnModalClose.addEventListener("click", () => {
      this.closeModal();
      if (this.onModalClose) this.onModalClose();
    });
  }

  updateHero(player, turn, depth, kills = 0) {
    if (!player) return;

    this.depthBadge.textContent = `Depth: B${depth}F`;
    this.turnCount.textContent = turn;
    this.goldCount.textContent = player.gold;

    // Identity & Avatar
    if (this.heroName) this.heroName.textContent = player.name || "Champion";
    if (this.heroClass) this.heroClass.textContent = player.class_title || "Crypt Champion";
    if (this.heroAvatar) {
      const cls = player.hero_class || "paladin";
      this.heroAvatar.textContent = cls === "rogue" ? "🗡️" : (cls === "mage" ? "🔮" : "🛡️");
    }

    // Dynamic Action Deck
    this.updateActionDeck(player.hero_class || "paladin");

    // HP
    const hpPct = Math.max(0, Math.min(100, (player.hp / player.max_hp) * 100));
    this.hpBar.style.width = `${hpPct}%`;
    this.hpText.textContent = `${player.hp} / ${player.max_hp}`;
    this.hpBar.classList.toggle("low-hp", hpPct <= 30);
    if (this.lowHpVignette) this.lowHpVignette.classList.toggle("hidden", hpPct > 30);
    if (this._lastHp !== null && player.hp < this._lastHp && player.hp > 0) {
      this.flashDamage();
    }
    this._lastHp = player.hp;

    // Mana
    const manaPct = Math.max(0, Math.min(100, (player.mana / player.max_mana) * 100));
    this.manaBar.style.width = `${manaPct}%`;
    this.manaText.textContent = `${player.mana} / ${player.max_mana}`;

    // XP
    const xpPct = Math.max(0, Math.min(100, (player.xp / player.next_xp) * 100));
    this.xpBar.style.width = `${xpPct}%`;
    this.xpText.textContent = `${player.xp} / ${player.next_xp}`;
    this.levelVal.textContent = player.level;

    // Stats
    this.statAttack.textContent = player.attack;
    this.statDefense.textContent = player.defense;
    this.statKills.textContent = kills;

    // Status Tray
    this.renderStatusTray(player.status_effects || {});

    // Equipment
    const eq = player.equipped || {};
    this.currentEquipped = eq;
    if (this.slotWeaponContent) this.slotWeaponContent.textContent = eq.weapon ? `⚔️ ${eq.weapon.name}` : "Empty";
    if (this.slotArmorContent) this.slotArmorContent.textContent = eq.armor ? `🛡️ ${eq.armor.name}` : "Empty";
    if (this.slotAmuletContent) this.slotAmuletContent.textContent = eq.amulet ? `📿 ${eq.amulet.name}` : "Empty";
    if (this.slotRingContent) this.slotRingContent.textContent = eq.ring ? `💍 ${eq.ring.name}` : "Empty";
    if (this.slotBootsContent) this.slotBootsContent.textContent = eq.boots ? `👢 ${eq.boots.name}` : "Empty";

    // Inventory
    this.renderInventory(player.inventory);
  }

  updateActionDeck(heroClass) {
    const btn2 = document.getElementById("btnActionFireball");
    const btn3 = document.getElementById("btnActionBash");
    const btn4 = document.getElementById("btnActionHeal");
    const btn5 = document.getElementById("btnActionShieldWall");
    if (!btn2 || !btn3 || !btn4 || !btn5) return;

    if (heroClass === "rogue") {
      btn2.innerHTML = '<span class="deck-icon">🗡️</span><span class="deck-label">Shadow</span><span class="deck-hotkey">[2]</span>';
      btn2.title = "Shadow Strike (4 MP, +40% Crit, Poison) [2]";
      btn3.innerHTML = '<span class="deck-icon">💨</span><span class="deck-label">Smoke</span><span class="deck-hotkey">[3]</span>';
      btn3.title = "Smoke Bomb (6 MP, Stuns adjacent foes) [3]";
      btn4.innerHTML = '<span class="deck-icon">🔥</span><span class="deck-label">Fireball</span><span class="deck-hotkey">[4]</span>';
      btn4.title = "Cast Fireball (10 MP, Burn) [4]";
      btn5.innerHTML = '<span class="deck-icon">✨</span><span class="deck-label">Heal</span><span class="deck-hotkey">[5]</span>';
      btn5.title = "Divine Healing (8 MP, Cleanses statuses) [5]";
    } else if (heroClass === "mage") {
      btn2.innerHTML = '<span class="deck-icon">🔥</span><span class="deck-label">Fireball</span><span class="deck-hotkey">[2]</span>';
      btn2.title = "Cast Fireball (10 MP, Burn) [2]";
      btn3.innerHTML = '<span class="deck-icon">❄️</span><span class="deck-label">Frost</span><span class="deck-hotkey">[3]</span>';
      btn3.title = "Frost Nova (6 MP, Freezes foe for 2 turns) [3]";
      btn4.innerHTML = '<span class="deck-icon">🔮</span><span class="deck-label">Nova</span><span class="deck-hotkey">[4]</span>';
      btn4.title = "Arcane Nova (10 MP, 3-tile blast to all foes) [4]";
      btn5.innerHTML = '<span class="deck-icon">🛡️</span><span class="deck-label">Barrier</span><span class="deck-hotkey">[5]</span>';
      btn5.title = "Raise Shield Wall (6 MP, +6 DEF for 4 turns) [5]";
    } else {
      btn2.innerHTML = '<span class="deck-icon">🔥</span><span class="deck-label">Fireball</span><span class="deck-hotkey">[2]</span>';
      btn2.title = "Cast Fireball (10 MP, Burn) [2]";
      btn3.innerHTML = '<span class="deck-icon">💥</span><span class="deck-label">Bash</span><span class="deck-hotkey">[3]</span>';
      btn3.title = "Shield Bash target (4 MP, 1 Turn Stun) [3]";
      btn4.innerHTML = '<span class="deck-icon">✨</span><span class="deck-label">Heal</span><span class="deck-hotkey">[4]</span>';
      btn4.title = "Divine Healing (8 MP, Cleanses statuses) [4]";
      btn5.innerHTML = '<span class="deck-icon">🛡️</span><span class="deck-label">Barrier</span><span class="deck-hotkey">[5]</span>';
      btn5.title = "Raise Shield Wall (6 MP, +6 DEF for 4 turns) [5]";
    }
  }

  showSaveIndicator() {
    if (!this.saveIndicator) return;
    this.saveIndicator.classList.remove("hidden");
    this.saveIndicator.style.display = "inline-block";
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveIndicator.classList.add("hidden");
      this.saveIndicator.style.display = "none";
    }, 1600);
  }

  showClassSelectModal(onSelect) {
    const html = `
      <p style="color: #cbd5e0; font-size: 0.85rem; margin-bottom: 8px;">
        Choose your hero archetype to venture into the forsaken depths:
      </p>
      <div class="class-grid">
        <div class="class-card" data-class="paladin">
          <div class="class-avatar-badge">🛡️</div>
          <div class="class-details">
            <h3>Crusader Paladin</h3>
            <p>Holy knight with supreme defense, crushing shield stuns, and restorative prayers.</p>
            <div class="class-stats-row">
              <span>HP: <strong>65</strong></span>
              <span>MP: <strong>30</strong></span>
              <span>ATK: <strong>8</strong></span>
              <span>DEF: <strong>4</strong></span>
              <span>Crit: <strong>15%</strong></span>
            </div>
          </div>
        </div>
        <div class="class-card" data-class="rogue">
          <div class="class-avatar-badge">🗡️</div>
          <div class="class-details">
            <h3>Shadow Rogue</h3>
            <p>Lethal assassin with 30% base crit, venomous daggers, and blinding smoke bombs.</p>
            <div class="class-stats-row">
              <span>HP: <strong>48</strong></span>
              <span>MP: <strong>25</strong></span>
              <span>ATK: <strong>9</strong></span>
              <span>DEF: <strong>2</strong></span>
              <span>Crit: <strong>30%</strong></span>
            </div>
          </div>
        </div>
        <div class="class-card" data-class="mage">
          <div class="class-avatar-badge">🔮</div>
          <div class="class-details">
            <h3>Arcane Mage</h3>
            <p>Forbidden scholar commanding devastating fireballs, freezing frost, and arcane novas.</p>
            <div class="class-stats-row">
              <span>HP: <strong>42</strong></span>
              <span>MP: <strong>55</strong></span>
              <span>ATK: <strong>6</strong></span>
              <span>DEF: <strong>1</strong></span>
              <span>Crit: <strong>10%</strong></span>
            </div>
          </div>
        </div>
      </div>
    `;
    this.showModal("Select Hero Archetype", html);
    this.btnModalClose.textContent = "Cancel";

    const cards = this.modalBody.querySelectorAll(".class-card");
    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const cls = card.getAttribute("data-class");
        this.closeModal();
        if (onSelect) onSelect(cls);
      });
    });
  }

  showMerchantShopModal(merchantStock, playerGold, onBuy) {
    let itemsHtml = "";
    for (const entry of merchantStock) {
      const item = entry.item;
      const price = entry.price;
      const canAfford = playerGold >= price;
      const icon = this._getItemIcon(item);
      const rarity = item.rarity || "common";

      itemsHtml += `
        <div class="shop-item-row">
          <div class="shop-item-info">
            <span class="shop-item-icon">${icon}</span>
            <div class="shop-item-text">
              <h4>${item.name} <span class="rarity-pill pill-${rarity}">${rarity}</span></h4>
              <p>${item.description}</p>
            </div>
          </div>
          <div class="shop-buy-action">
            <span class="shop-price-tag">🪙 ${price}</span>
            <button class="btn-buy" data-item-id="${item.id}" ${canAfford ? "" : "disabled"}>
              Buy
            </button>
          </div>
        </div>
      `;
    }

    const html = `
      <div class="shop-container">
        <div class="shop-balance-bar">
          <span>Hermit Grimbold's Wares</span>
          <span>Your Gold: <strong style="color: #ecc94b;">🪙 ${playerGold}</strong></span>
        </div>
        ${itemsHtml}
      </div>
    `;

    this.showModal("Grimbold the Wandering Hermit", html);
    this.btnModalClose.textContent = "Leave Shop";

    const buyBtns = this.modalBody.querySelectorAll(".btn-buy");
    buyBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-item-id");
        if (onBuy) onBuy(itemId);
      });
    });
  }

  showSoulDialogueModal(soul, onChoice) {
    const html = `
      <p class="soul-whisper">The air thickens. A shape kneels in the dust, held together by embers and regret.</p>
      <p class="soul-text">"I kept the door," it says. "No one told me it was over."</p>
      <div class="soul-choices">
        <button class="btn btn-secondary soul-choice" data-choice="ember" type="button">
          🕯️ Offer the ember
          <span class="soul-choice-note">Mend your wounds and raise a brief barrier</span>
        </button>
        <button class="btn btn-secondary soul-choice" data-choice="toll" type="button">
          🪙 Demand the penitent's toll
          <span class="soul-choice-note">Take gold, and perhaps a relic</span>
        </button>
        <button class="btn btn-secondary soul-choice" data-choice="lore" type="button">
          🗣️ Ask what happened here
          <span class="soul-choice-note">Record its story; gain insight</span>
        </button>
      </div>
    `;
    this.showModal("🕯️ A Soul Without a Grave", html);
    this.btnModalClose.textContent = "Leave it to its rest";
    this.modalBody.querySelectorAll(".soul-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.choice;
        this.closeModal();
        if (onChoice) onChoice(choice);
      });
    });
  }

  showPactModal(pact, onChoice) {
    const html = `
      <p class="soul-whisper">A black altar drinks the torchlight. Three wounds in the stone wait to be fed.</p>
      <p class="soul-text">"Every gift has a price," it says in your own voice. "Choose what you can live without."</p>
      <div class="soul-choices pact-choices">
        <button class="btn btn-secondary soul-choice pact-choice" data-choice="wrath" type="button">
          🩸 Pact of Wrath
          <span class="soul-choice-note">+4 Attack forever, but 20% of your maximum HP is burned away</span>
        </button>
        <button class="btn btn-secondary soul-choice pact-choice" data-choice="ward" type="button">
          🦴 Pact of the Grave
          <span class="soul-choice-note">+18 Max HP, but 3 Max Mana is sealed inside the stone</span>
        </button>
        <button class="btn btn-secondary soul-choice pact-choice" data-choice="avarice" type="button">
          🪙 Pact of Avarice
          <span class="soul-choice-note">A heavy purse now, but two Pact-Bound Wraiths rise to collect</span>
        </button>
      </div>
    `;
    this.showModal("🕯️ The Black Altar", html);
    this.btnModalClose.textContent = "Refuse the bargain";
    this.modalBody.querySelectorAll(".pact-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.choice;
        this.closeModal();
        if (onChoice) onChoice(choice);
      });
    });
  }

  updateStreak(streak) {
    if (!this.streakPill || !this.streakCount) return;
    if (streak >= 2) {
      this.streakCount.textContent = streak;
      this.streakPill.classList.remove("hidden");
    } else {
      this.streakPill.classList.add("hidden");
    }
  }

  updateSigils(count = 0, need = 3) {
    if (this.sigilCount) this.sigilCount.textContent = count;
    if (this.sigilPill) {
      this.sigilPill.classList.toggle("ready", count >= need);
      this.sigilPill.title = count >= need
        ? "Three sigils gathered: the sealed vault can be opened"
        : `Sigils: ${count} of ${need} for the sealed vault`;
    }
  }

  toggleCrt() {
    this.crtActive = !this.crtActive;
    if (this.crtOverlay) {
      this.crtOverlay.classList.toggle("hidden", !this.crtActive);
    }
    document.body.classList.toggle("crt-active", this.crtActive);
    const btn = document.getElementById("btnCrtToggle");
    if (btn) {
      btn.style.color = this.crtActive ? "#4fd1c5" : "inherit";
    }
    return this.crtActive;
  }

  showJackpotBanner(text = "★★★ CRITICAL GOLD JACKPOT! 2.5X PAYOUT ★★★") {
    if (!this.jackpotBanner) return;
    this.jackpotBanner.textContent = text;
    this.jackpotBanner.classList.remove("hidden");
    clearTimeout(this._jackpotTimer);
    this._jackpotTimer = setTimeout(() => {
      this.jackpotBanner.classList.add("hidden");
    }, 2200);
  }

  triggerAdrenalineVignette() {
    if (!this.adrenalineVignette) return;
    this.adrenalineVignette.classList.remove("hidden");
    clearTimeout(this._adrenalineTimer);
    this._adrenalineTimer = setTimeout(() => {
      this.adrenalineVignette.classList.add("hidden");
    }, 1200);
  }

  renderBounties(bounties = []) {
    if (!this.bountiesList) return;
    this.bountiesList.innerHTML = "";

    const completedCount = bounties.filter((b) => b.completed).length;
    if (this.bountyBadge) {
      this.bountyBadge.textContent = `${completedCount}/${bounties.length}`;
    }

    for (const b of bounties) {
      const card = document.createElement("div");
      card.className = `bounty-card ${b.completed ? "completed" : ""}`;

      const pct = Math.min(100, Math.floor((b.progress / b.target) * 100));
      card.innerHTML = `
        <div class="bounty-card-header">
          <span>${b.completed ? "✓ " : ""}${b.title}</span>
          <span>${b.completed ? "DONE" : `${b.progress}/${b.target}`}</span>
        </div>
        <div class="bounty-card-desc">${b.desc} (+${b.reward_gold}🪙, +${b.reward_xp}XP)</div>
        <div class="bounty-progress-bar">
          <div class="bounty-progress-fill" style="width: ${pct}%;"></div>
        </div>
      `;
      this.bountiesList.appendChild(card);
    }
  }

  showBountiesModal(bounties = []) {
    let listHtml = "";
    for (const b of bounties) {
      const pct = Math.min(100, Math.floor((b.progress / b.target) * 100));
      listHtml += `
        <div class="bounty-card ${b.completed ? "completed" : ""}" style="padding: 10px; margin-bottom: 8px;">
          <div class="bounty-card-header" style="font-size: 0.9rem;">
            <span>${b.completed ? "✓ " : ""}${b.title}</span>
            <span>${b.completed ? "CLAIMED" : `${b.progress} / ${b.target}`}</span>
          </div>
          <p class="bounty-card-desc" style="font-size: 0.8rem; margin: 4px 0 6px 0;">${b.desc}</p>
          <div class="bounty-progress-bar" style="height: 6px;">
            <div class="bounty-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <div style="margin-top: 6px; font-size: 0.75rem; color: #ecc94b;">
            Bounty Reward: <strong>+${b.reward_gold} Gold</strong> & <strong>+${b.reward_xp} XP</strong>
          </div>
        </div>
      `;
    }

    const html = `
      <div style="font-size: 0.85rem; color: #cbd5e0;">
        <p style="margin-bottom: 10px;">
          Active contract bounties issued on every floor.
          Fulfill them before descending to reap instant gold and experience!
        </p>
        <div style="max-height: 280px; overflow-y: auto;">
          ${listHtml}
        </div>
      </div>
    `;

    this.showModal("📜 Floor Contract Bounties", html);
    this.btnModalClose.textContent = "Back to Dungeon";
  }

  showHallOfRecordsModal(records) {
    const r = records || {
      totalRuns: 0,
      victories: 0,
      bestDepth: 1,
      totalKills: 0,
      highestStreak: 0,
      totalGold: 0,
      bestiary: {},
    };

    const bestiaryDefs = [
      { id: "skeleton", name: "Crypt Skeleton", icon: "💀", desc: "Reanimated legionnaire. Susceptible to holy bash and crushing blunt force.", weakness: "Blunt / Stun" },
      { id: "goblin", name: "Sneaky Goblin", icon: "👺", desc: "Devious looter that pilfers coins upon strike. Low defense.", weakness: "Ranged / Piercing" },
      { id: "spider", name: "Venomous Brood-Spider", icon: "🕷️", desc: "Spits debilitating neurotoxin. Cleansing prayers counteract poison.", weakness: "Fire / Cleanse" },
      { id: "necromancer", name: "Dread Necromancer", icon: "🧙‍♂️", desc: "Chants dark spells from afar. High mana shields.", weakness: "Melee Rush" },
      { id: "wraith", name: "Pact-Bound Wraith", icon: "👻", desc: "A debt given shape. Rises from a Pact of Avarice and hunts the debtor.", weakness: "Holy / Fire" },
      { id: "boss_lich", name: "Arch-Lich Malakor", icon: "👑", desc: "Lord of the Sunken Crypt. Drains mortal souls to regenerate essence.", weakness: "Crown of Eternity" },
    ];

    let bestiaryHtml = "";
    for (const def of bestiaryDefs) {
      const kills = r.bestiary?.[def.id]?.slain || 0;
      const isKnown = kills > 0;
      bestiaryHtml += `
        <div class="bestiary-item ${isKnown ? "" : "locked"}">
          <div class="bestiary-icon">${isKnown ? def.icon : "❓"}</div>
          <div class="bestiary-info">
            <h4>${isKnown ? def.name : "Unknown Entity"}</h4>
            <p>${isKnown ? `${def.desc} (Weakness: ${def.weakness})` : "Encounter and defeat this creature in the catacombs to reveal its lore."}</p>
          </div>
          <div class="bestiary-count">${isKnown ? `Slayed: ${kills}` : "Locked"}</div>
        </div>
      `;
    }

    const html = `
      <div class="records-container">
        <h3 style="font-size: 0.9rem; color: #cbd5e0; margin-bottom: 8px;">Ancestral Career Records</h3>
        <div class="records-stat-grid">
          <div class="records-stat-box">
            <div class="stat-val">${r.totalRuns || 0}</div>
            <div class="stat-name">Runs Played</div>
          </div>
          <div class="records-stat-box">
            <div class="stat-val">${r.victories || 0}</div>
            <div class="stat-name">Crowns Claimed</div>
          </div>
          <div class="records-stat-box">
            <div class="stat-val">B${r.bestDepth || 1}F</div>
            <div class="stat-name">Deepest Floor</div>
          </div>
          <div class="records-stat-box">
            <div class="stat-val">${r.totalKills || 0}</div>
            <div class="stat-name">Monsters Slain</div>
          </div>
          <div class="records-stat-box">
            <div class="stat-val">x${r.highestStreak || 0}</div>
            <div class="stat-name">Best Streak</div>
          </div>
          <div class="records-stat-box">
            <div class="stat-val">🪙 ${r.totalGold || 0}</div>
            <div class="stat-name">Gold Amassed</div>
          </div>
        </div>

        <h3 style="font-size: 0.9rem; color: #cbd5e0; margin: 12px 0 8px 0;">Codex of Monsters (Bestiary)</h3>
        <div class="bestiary-list">
          ${bestiaryHtml}
        </div>
      </div>
    `;

    this.showModal("🏆 Ancestral Hall of Records", html);
    this.btnModalClose.textContent = "Close Chronicle";
  }

  flashDamage() {
    if (!this.damageFlash) return;
    this.damageFlash.classList.remove("active");
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add("active");
    if (this._damageFlashTimer) clearTimeout(this._damageFlashTimer);
    this._damageFlashTimer = setTimeout(() => this.damageFlash.classList.remove("active"), 240);
  }

  renderStatusTray(effects) {
    if (!this.heroStatusTray) return;
    this.heroStatusTray.innerHTML = "";

    const labels = {
      poison: "🧪 Poison",
      burn: "🔥 Burning",
      shield_wall: "🛡️ Barrier",
      might: "⚔️ Might",
      stun: "💫 Stunned",
    };
    const descriptions = {
      poison: "Poison: loses 3 HP at the start of each turn.",
      burn: "Burning: loses 4 HP at the start of each turn.",
      shield_wall: "Barrier: +6 DEF until the remaining turns expire.",
      might: "Might: +4 ATK until the remaining turns expire.",
      stun: "Stunned: skips its next action.",
    };

    for (const [key, turns] of Object.entries(effects)) {
      if (turns <= 0) continue;
      const badge = document.createElement("span");
      badge.className = `status-badge badge-${key}`;
      badge.textContent = `${labels[key] || key} (${turns})`;
      badge.title = descriptions[key] || key;
      this.heroStatusTray.appendChild(badge);
    }
  }

  renderInventory(items = []) {
    this._lastInventory = items;
    const totalSlots = 12;
    const view = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => this._matchesInventoryFilter(item));

    if (this.inventorySort === "rarity") {
      view.sort((a, b) => this._rarityRank(b.item) - this._rarityRank(a.item) || a.item.name.localeCompare(b.item.name));
    }

    this._visibleIndices = new Set(view.map((entry) => entry.index));
    if (this.selectedItemIndex >= 0 && !this._visibleIndices.has(this.selectedItemIndex)) {
      this.clearItemSelection();
    }

    if (this.inventoryCapacity) {
      this.inventoryCapacity.textContent = `${items.length} / ${totalSlots}`;
      this.inventoryCapacity.classList.toggle("full", items.length >= totalSlots);
      this.inventoryCapacity.title = items.length >= totalSlots ? "Backpack is full" : `${totalSlots - items.length} slot(s) free`;
    }

    this.inventoryGrid.innerHTML = "";
    for (let slot = 0; slot < totalSlots; slot++) {
      const slotDiv = document.createElement("div");
      slotDiv.className = "inv-slot";
      const entry = view[slot];

      if (entry) {
        const { item, index } = entry;
        slotDiv.dataset.index = String(index);
        slotDiv.classList.toggle("selected", index === this.selectedItemIndex);
        if (item.rarity && item.rarity !== "common") {
          slotDiv.classList.add(`rarity-${item.rarity}`);
        }
        slotDiv.textContent = this._getItemIcon(item);
        slotDiv.title = `${item.name} (${item.rarity ? item.rarity.toUpperCase() : "COMMON"} ${item.type})`;
        slotDiv.addEventListener("click", () => this.selectItem(index, item));
      } else {
        slotDiv.textContent = "";
      }

      this.inventoryGrid.appendChild(slotDiv);
    }
  }

  _matchesInventoryFilter(item) {
    if (this.inventoryFilter === "gear") {
      return ["weapon", "armor", "ring", "amulet", "boots"].includes(item.type);
    }
    if (this.inventoryFilter === "consumable") {
      return ["potion", "scroll"].includes(item.type);
    }
    return true;
  }

  _rarityRank(item) {
    return { common: 0, rare: 1, epic: 2, legendary: 3 }[item.rarity] ?? 0;
  }

  selectItem(index, item) {
    this.selectedItemIndex = index;
    const slots = this.inventoryGrid.querySelectorAll(".inv-slot");
    slots.forEach((s) => {
      s.classList.toggle("selected", s.dataset.index === String(index));
    });

    if (item) {
      const rarity = item.rarity || "common";
      this.itemCardName.innerHTML = `${item.name} <span class="rarity-pill pill-${rarity}">${rarity}</span>`;
      this.itemCardDesc.textContent = item.description;
      this.btnItemUse.classList.remove("hidden");
      this.btnItemDrop.classList.remove("hidden");

      if (["weapon", "armor", "ring", "amulet", "boots"].includes(item.type)) {
        this.btnItemUse.textContent = "Equip";
        this._renderItemComparison(item);
      } else {
        this.btnItemUse.textContent = "Use";
        if (this.itemCardDiff) this.itemCardDiff.classList.add("hidden");
      }
    } else {
      this.clearItemSelection();
    }
  }

  _renderItemComparison(item) {
    if (!this.itemCardDiff) return;
    const current = this.currentEquipped ? this.currentEquipped[item.type] : null;
    const curStats = current?.stats || {};
    const newStats = item.stats || {};

    const diffs = [];
    const statKeys = [
      { key: "attack", label: "ATK" },
      { key: "defense", label: "DEF" },
      { key: "max_hp", label: "Max HP" },
      { key: "max_mana", label: "Max MP" },
      { key: "crit_bonus", label: "Crit", suffix: "%" },
      { key: "stun_chance", label: "Stun", suffix: "%" },
      { key: "poison_chance", label: "Poison", suffix: "%" },
    ];

    statKeys.forEach(({ key, label, suffix = "" }) => {
      const vNew = newStats[key] || 0;
      const vOld = curStats[key] || 0;
      const delta = vNew - vOld;
      if (delta > 0) {
        diffs.push(`<span class="diff-badge diff-pos">+${delta}${suffix} ${label}</span>`);
      } else if (delta < 0) {
        diffs.push(`<span class="diff-badge diff-neg">${delta}${suffix} ${label}</span>`);
      }
    });

    const targetName = current ? current.name : "Empty Slot";
    if (diffs.length > 0) {
      this.itemCardDiff.innerHTML = `<div class="diff-target">vs ${targetName}:</div>${diffs.join(" ")}`;
    } else {
      this.itemCardDiff.innerHTML = `<div class="diff-target">vs ${targetName}:</div><span class="diff-badge diff-neutral">No stat change</span>`;
    }
    this.itemCardDiff.classList.remove("hidden");
  }

  clearItemSelection() {
    this.selectedItemIndex = -1;
    this.itemCardName.textContent = "No Item Selected";
    this.itemCardDesc.textContent = "Click an item in your backpack to view details, use, or equip.";
    if (this.itemCardDiff) this.itemCardDiff.classList.add("hidden");
    this.btnItemUse.classList.add("hidden");
    this.btnItemDrop.classList.add("hidden");

    const slots = this.inventoryGrid.querySelectorAll(".inv-slot");
    slots.forEach((s) => s.classList.remove("selected"));
  }

  _getItemIcon(item) {
    if (!item) return "";
    switch (item.type) {
      case "weapon":
        if (item.id === "dagger_poison") return "🗡️";
        if (item.id === "hammer_thunder") return "🔨";
        return "⚔️";
      case "armor":
        if (item.id === "shield_tower") return "🛡️";
        if (item.id === "cloak_ethereal") return "👘";
        return "🦺";
      case "amulet":
        if (item.id === "tome_pyromancy") return "📖";
        return "📿";
      case "boots":
        return "👢";
      case "ring":
        return item.id === "crown_eternity" ? "👑" : "💍";
      case "potion":
        if (item.id?.includes("mana")) return "🧪";
        if (item.id?.includes("rejuvenation")) return "✨";
        if (item.id?.includes("invulnerability")) return "🛡️";
        return "🍷";
      case "scroll": return "📜";
      default: return "📦";
    }
  }

  logMessage(text, type = "normal") {
    const entry = document.createElement("div");
    entry.className = "log-entry";

    if (type === "hit") entry.classList.add("log-hit");
    else if (type === "crit") entry.classList.add("log-crit");
    else if (type === "heal") entry.classList.add("log-heal");
    else if (type === "loot") entry.classList.add("log-loot");
    else if (type === "level") entry.classList.add("log-level");
    else if (type === "system") entry.classList.add("log-system");

    entry.textContent = text;
    this.chronicleLog.appendChild(entry);
    this.chronicleLog.scrollTop = this.chronicleLog.scrollHeight;
  }

  updateJournal(unlockedCount = 0, total = 0) {
    if (!this.journalBadge) return;
    this.journalBadge.textContent = total > 0 ? `${unlockedCount}/${total}` : `${unlockedCount}`;
    if (this.btnJournal) {
      this.btnJournal.title = total > 0
        ? `Lore journal: ${unlockedCount} of ${total} entries discovered`
        : "Read your discovered lore";
    }
    this.journalBadge.classList.toggle("complete", total > 0 && unlockedCount >= total);
  }

  showJournalModal(entries = [], unlocked = []) {
    const found = new Set(unlocked);
    const categoryOrder = ["Places", "The Fallen", "Relics", "Whispers"];
    let html = `<p class="lore-progress">Discovered <strong>${found.size}</strong> of <strong>${entries.length}</strong> entries.</p>`;

    if (entries.length === 0) {
      html += `<p class="lore-empty">The archive is silent. The crypt's records could not be read while the server is offline.</p>`;
    } else {
      for (const category of categoryOrder) {
        const group = entries.filter((entry) => entry.category === category);
        if (group.length === 0) continue;
        html += `<section class="lore-category"><h3>${category}</h3>`;
        for (const entry of group) {
          if (found.has(entry.id)) {
            html += `<article class="lore-card"><h4>${entry.title}</h4><p>${entry.text}</p></article>`;
          } else {
            html += `<article class="lore-card locked"><h4>???</h4><p>Undiscovered. Explore the depths, listen to the dead, and the crypt will tell you.</p></article>`;
          }
        }
        html += `</section>`;
      }
    }

    this.showModal("📖 The Chronicle of the Crypt", html);
    this.btnModalClose.textContent = "Close Tome";
  }

  isModalOpen() {
    return !this.modalOverlay.classList.contains("hidden");
  }

  showModal(title, contentHtml) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = contentHtml;
    this.modalOverlay.classList.remove("hidden");
  }

  closeModal() {
    this.modalOverlay.classList.add("hidden");
  }
}
