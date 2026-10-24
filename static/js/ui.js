/**
 * UI controller for Crypt-Crawler: hero gauges, paperdoll, backpack, status tray, and combat log.
 */

export class UIController {
  constructor() {
    // Top bar elements
    this.depthBadge = document.getElementById("depthBadge");
    this.turnCount = document.getElementById("turnCount");
    this.goldCount = document.getElementById("goldCount");

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
