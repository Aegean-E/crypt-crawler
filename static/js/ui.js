/**
 * UI controller for Crypt-Crawler: hero gauges, paperdoll, backpack, status tray, and combat log.
 */

export class UIController {
  constructor() {
    // Top bar elements
    this.depthBadge = document.getElementById("depthBadge");
    this.turnCount = document.getElementById("turnCount");
    this.goldCount = document.getElementById("goldCount");
    this.saveIndicator = document.getElementById("saveIndicator");

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
    this.slotRingContent = document.getElementById("slotRingContent");

    // Inventory grid & selection
    this.inventoryGrid = document.getElementById("inventoryGrid");
    this.itemCardName = document.getElementById("itemCardName");
    this.itemCardDesc = document.getElementById("itemCardDesc");
    this.btnItemUse = document.getElementById("btnItemUse");
    this.btnItemDrop = document.getElementById("btnItemDrop");

    // Chronicle Log
    this.chronicleLog = document.getElementById("chronicleLog");

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

    document.getElementById("slotWeapon").addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("weapon");
    });
    document.getElementById("slotArmor").addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("armor");
    });
    document.getElementById("slotRing").addEventListener("click", () => {
      if (this.onUnequip) this.onUnequip("ring");
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
    this.slotWeaponContent.textContent = eq.weapon ? `⚔️ ${eq.weapon.name}` : "Empty";
    this.slotArmorContent.textContent = eq.armor ? `🛡️ ${eq.armor.name}` : "Empty";
    this.slotRingContent.textContent = eq.ring ? `💍 ${eq.ring.name}` : "Empty";

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

    for (const [key, turns] of Object.entries(effects)) {
      if (turns <= 0) continue;
      const badge = document.createElement("span");
      badge.className = `status-badge badge-${key}`;
      badge.textContent = `${labels[key] || key} (${turns})`;
      this.heroStatusTray.appendChild(badge);
    }
  }

  renderInventory(items = []) {
    this.inventoryGrid.innerHTML = "";
    const totalSlots = 12;

    for (let i = 0; i < totalSlots; i++) {
      const slotDiv = document.createElement("div");
      slotDiv.className = "inv-slot";
      if (i === this.selectedItemIndex) {
        slotDiv.classList.add("selected");
      }

      if (i < items.length) {
        const item = items[i];
        if (item.rarity && item.rarity !== "common") {
          slotDiv.classList.add(`rarity-${item.rarity}`);
        }
        slotDiv.textContent = this._getItemIcon(item);
        slotDiv.title = `${item.name} (${item.rarity ? item.rarity.toUpperCase() : "COMMON"} ${item.type})`;
        slotDiv.addEventListener("click", () => this.selectItem(i, item));
      } else {
        slotDiv.textContent = "";
      }

      this.inventoryGrid.appendChild(slotDiv);
    }
  }

  selectItem(index, item) {
    this.selectedItemIndex = index;
    const slots = this.inventoryGrid.querySelectorAll(".inv-slot");
    slots.forEach((s, idx) => {
      s.classList.toggle("selected", idx === index);
    });

    if (item) {
      const rarity = item.rarity || "common";
      this.itemCardName.innerHTML = `${item.name} <span class="rarity-pill pill-${rarity}">${rarity}</span>`;
      this.itemCardDesc.textContent = item.description;
      this.btnItemUse.classList.remove("hidden");
      this.btnItemDrop.classList.remove("hidden");

      if (["weapon", "armor", "ring"].includes(item.type)) {
        this.btnItemUse.textContent = "Equip";
      } else {
        this.btnItemUse.textContent = "Use";
      }
    } else {
      this.clearItemSelection();
    }
  }

  clearItemSelection() {
    this.selectedItemIndex = -1;
    this.itemCardName.textContent = "No Item Selected";
    this.itemCardDesc.textContent = "Click an item in your backpack to view details, use, or equip.";
    this.btnItemUse.classList.add("hidden");
    this.btnItemDrop.classList.add("hidden");

    const slots = this.inventoryGrid.querySelectorAll(".inv-slot");
    slots.forEach((s) => s.classList.remove("selected"));
  }

  _getItemIcon(item) {
    if (!item) return "";
    switch (item.type) {
      case "weapon": return item.id === "dagger_poison" ? "🗡️" : "⚔️";
      case "armor": return item.id === "shield_tower" ? "🛡️" : "🦺";
      case "ring": return item.id === "crown_eternity" ? "👑" : "💍";
      case "potion": return item.id.includes("mana") ? "🧪" : (item.id.includes("rejuvenation") ? "✨" : "🍷");
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

  showModal(title, contentHtml) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = contentHtml;
    this.modalOverlay.classList.remove("hidden");
  }

  closeModal() {
    this.modalOverlay.classList.add("hidden");
  }
}
