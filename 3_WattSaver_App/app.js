// 'ওয়াট-সেভার' - মূল অ্যাপ লজিক (app.js)

let unitRate = parseFloat(localStorage.getItem('ws_unit_rate') || '7.50');
let userAppliances = [];
let lastBackPressTime = 0;
let toastTimeout = null;
let deferredPrompt = null;

// BLDC Interactive State
let bldcQty = 3;
let bldcHours = 12;

// Palette for breakdown bar segments
const segmentColors = [
  '#38bdf8', '#f59e0b', '#10b981', '#ec4899', 
  '#8b5cf6', '#f97316', '#14b8a6', '#eab308',
  '#6366f1', '#06b6d4'
];

// --- DOM References ---
const appliancesList = document.getElementById('appliancesList');
const unitRateInput = document.getElementById('unitRateInput');
const totalMonthlyBill = document.getElementById('totalMonthlyBill');
const totalMonthlyUnits = document.getElementById('totalMonthlyUnits');
const dailyBillText = document.getElementById('dailyBillText');
const activeAppliancesCount = document.getElementById('activeAppliancesCount');
const drainAlertBox = document.getElementById('drainAlertBox');
const drainAlertText = document.getElementById('drainAlertText');
const breakdownBar = document.getElementById('breakdownBar');
const breakdownLegend = document.getElementById('breakdownLegend');
const btnResetDefaults = document.getElementById('btnResetDefaults');

// Tabs
const tabCalcBtn = document.getElementById('tabCalcBtn');
const tabCompareBtn = document.getElementById('tabCompareBtn');
const calcView = document.getElementById('calcView');
const compareView = document.getElementById('compareView');
const hacksGrid = document.getElementById('hacksGrid');

// BLDC Calculator DOMs
const bldcQtyVal = document.getElementById('bldcQtyVal');
const bldcHoursVal = document.getElementById('bldcHoursVal');
const bldcNormalCost = document.getElementById('bldcNormalCost');
const bldcModernCost = document.getElementById('bldcModernCost');
const bldcTotalSaved = document.getElementById('bldcTotalSaved');
const bldcQtyMinus = document.getElementById('bldcQtyMinus');
const bldcQtyPlus = document.getElementById('bldcQtyPlus');
const bldcHoursMinus = document.getElementById('bldcHoursMinus');
const bldcHoursPlus = document.getElementById('bldcHoursPlus');

// PWA & Toast
const installBtn = document.getElementById('installBtn');
const installBanner = document.getElementById('installBanner');
const bannerInstallBtn = document.getElementById('bannerInstallBtn');
const bannerDismissBtn = document.getElementById('bannerDismissBtn');
const offlineBadge = document.getElementById('offlineBadge');
const toastNotice = document.getElementById('toastNotice');

// --- 1. State Initialization ---
function initAppliancesState() {
  const saved = localStorage.getItem('ws_appliances');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      userAppliances = appliancesData.map(def => {
        const found = parsed.find(p => p.id === def.id);
        if (found) {
          return {
            ...def,
            watt: found.watt !== undefined ? found.watt : def.defaultWatt,
            qty: found.qty !== undefined ? found.qty : def.defaultQty,
            hours: found.hours !== undefined ? found.hours : def.defaultHours,
            enabled: found.enabled !== undefined ? found.enabled : def.enabled,
            isCustom: found.isCustom || false
          };
        }
        return {
          ...def,
          watt: def.defaultWatt,
          qty: def.defaultQty,
          hours: def.defaultHours,
          isCustom: false
        };
      });
      return;
    } catch (e) {
      console.log('Error parsing saved appliances', e);
    }
  }

  // Default fallback
  userAppliances = appliancesData.map(def => ({
    ...def,
    watt: def.defaultWatt,
    qty: def.defaultQty,
    hours: def.defaultHours,
    isCustom: false
  }));
}

function saveState() {
  const minimal = userAppliances.map(a => ({
    id: a.id,
    watt: a.watt,
    qty: a.qty,
    hours: a.hours,
    enabled: a.enabled,
    isCustom: a.isCustom
  }));
  localStorage.setItem('ws_appliances', JSON.stringify(minimal));
  localStorage.setItem('ws_unit_rate', unitRate.toString());
}

// --- 2. Calculations & Live Meter ---
function calculateAll() {
  let totalKwh = 0;
  let totalCost = 0;
  let activeCount = 0;
  let applianceStats = [];

  userAppliances.forEach((app, idx) => {
    if (!app.enabled || app.qty <= 0 || app.hours <= 0) {
      app.monthlyKwh = 0;
      app.monthlyCost = 0;
      return;
    }

    activeCount++;
    const effectiveH = app.effectiveHours ? app.effectiveHours : app.hours;
    const dailyKwh = (app.watt * app.qty * effectiveH) / 1000;
    const monthlyKwh = dailyKwh * 30;
    const monthlyCost = monthlyKwh * unitRate;

    app.monthlyKwh = monthlyKwh;
    app.monthlyCost = monthlyCost;

    totalKwh += monthlyKwh;
    totalCost += monthlyCost;

    applianceStats.push({
      app,
      cost: monthlyCost,
      color: segmentColors[idx % segmentColors.length]
    });
  });

  // Update Top Metrics
  totalMonthlyBill.textContent = toBanglaNumber(Math.round(totalCost));
  totalMonthlyUnits.textContent = toBanglaNumber(Math.round(totalKwh));
  dailyBillText.textContent = `দৈনিক খরচ: ৳ ${toBanglaNumber(Math.round(totalCost / 30))}`;
  activeAppliancesCount.textContent = `${toBanglaNumber(activeCount)}টি যন্ত্র চালু`;

  // Determine Most Power-Hungry Drain
  applianceStats.sort((a, b) => b.cost - a.cost);
  if (applianceStats.length > 0 && totalCost > 0) {
    const topDrain = applianceStats[0];
    const percentage = Math.round((topDrain.cost / totalCost) * 100);
    if (percentage >= 20) {
      drainAlertBox.style.display = 'flex';
      drainAlertText.textContent = `${topDrain.app.name} (মোট বিলের ${toBanglaNumber(percentage)}% খাচ্ছে!)`;
    } else {
      drainAlertBox.style.display = 'none';
    }
  } else {
    drainAlertBox.style.display = 'none';
  }

  // Render Visual Breakdown Bar
  renderBreakdown(applianceStats, totalCost);

  // Update Individual Card Cost Badges
  userAppliances.forEach(app => {
    const costEl = document.getElementById(`cost_${app.id}`);
    const unitsEl = document.getElementById(`units_${app.id}`);
    if (costEl) {
      if (app.enabled) {
        costEl.textContent = `৳ ${toBanglaNumber(Math.round(app.monthlyCost))}/মাস`;
        unitsEl.textContent = `${toBanglaNumber(Math.round(app.monthlyKwh))} KWh`;
      } else {
        costEl.textContent = `বন্ধ`;
        unitsEl.textContent = `০ KWh`;
      }
    }
  });

  // Recalculate BLDC Comparison
  calculateBldcSavings();
}

function renderBreakdown(stats, totalCost) {
  if (totalCost <= 0 || stats.length === 0) {
    breakdownBar.innerHTML = `<div class="bar-segment" style="width: 100%; background: #334155;"></div>`;
    breakdownLegend.innerHTML = `<span class="legend-chip">কোনো যন্ত্র চালু নেই</span>`;
    return;
  }

  // Filter items with at least 2% share for visual neatness
  let barHtml = '';
  let legendHtml = '';

  stats.forEach(({ app, cost, color }) => {
    const pct = ((cost / totalCost) * 100).toFixed(1);
    if (pct > 0.5) {
      barHtml += `<div class="bar-segment" style="width: ${pct}%; background: ${color};" title="${app.name}: ${pct}%"></div>`;
      legendHtml += `
        <span class="legend-chip">
          <span class="legend-color" style="background: ${color};"></span>
          ${app.name} (${toBanglaNumber(Math.round(pct))}%)
        </span>
      `;
    }
  });

  breakdownBar.innerHTML = barHtml;
  breakdownLegend.innerHTML = legendHtml;
}

// --- 3. Render Appliance Cards ---
function renderApplianceCards() {
  appliancesList.innerHTML = userAppliances.map((app) => {
    const optionsHtml = app.presets.map((preset) => {
      const isSelected = (!app.isCustom && app.watt === preset.watt) || (app.isCustom && preset.watt === 'custom');
      return `<option value="${preset.watt}" ${isSelected ? 'selected' : ''}>${preset.label}</option>`;
    }).join('');

    return `
      <article class="appliance-card ${app.enabled ? 'active' : 'disabled'}" id="card_${app.id}">
        <div class="card-main-header">
          <div class="app-title-area">
            <span class="app-icon">${app.icon}</span>
            <div>
              <span class="app-name">${app.name}</span>
              <span class="app-name-sub">${app.nameEn}</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="app-cost-badge">
              <span class="cost-taka" id="cost_${app.id}">৳ ০/মাস</span>
              <span class="cost-units" id="units_${app.id}">০ KWh</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" ${app.enabled ? 'checked' : ''} onchange="toggleAppliance('${app.id}')">
              <span class="slider-round"></span>
            </label>
          </div>
        </div>

        <div class="card-controls-grid">
          <!-- Wattage Control -->
          <div class="control-item">
            <label>ওয়াটেজ (Watt):</label>
            <select class="preset-select" onchange="handlePresetChange('${app.id}', this.value)">
              ${optionsHtml}
            </select>
            <div class="custom-watt-wrap" id="custom_wrap_${app.id}" style="display: ${app.isCustom ? 'flex' : 'none'};">
              <span>কাস্টম:</span>
              <input type="number" min="1" max="10000" value="${app.watt}" onchange="handleCustomWatt('${app.id}', this.value)" oninput="handleCustomWatt('${app.id}', this.value)">
              <span>W</span>
            </div>
          </div>

          <!-- Quantity Stepper -->
          <div class="control-item">
            <label>সংখ্যা (টি):</label>
            <div class="stepper-row">
              <button class="step-btn" onclick="stepQty('${app.id}', -1)">-</button>
              <span class="step-val" id="qty_val_${app.id}">${toBanglaNumber(app.qty)}</span>
              <button class="step-btn" onclick="stepQty('${app.id}', 1)">+</button>
            </div>
          </div>

          <!-- Hours Stepper -->
          <div class="control-item">
            <label>দৈনিক চলার সময় (ঘণ্টা):</label>
            <div class="stepper-row">
              <button class="step-btn" onclick="stepHours('${app.id}', -1)">-</button>
              <span class="step-val" id="hours_val_${app.id}">${toBanglaNumber(app.hours)} ঘণ্টা</span>
              <button class="step-btn" onclick="stepHours('${app.id}', 1)">+</button>
            </div>
          </div>
        </div>

        <div class="app-tip-box">
          <span>💡</span> <span>${app.tip}</span>
        </div>
      </article>
    `;
  }).join('');
}

// User Interactions
function toggleAppliance(id) {
  const app = userAppliances.find(a => a.id === id);
  if (!app) return;
  app.enabled = !app.enabled;

  const card = document.getElementById(`card_${id}`);
  if (card) {
    card.classList.toggle('active', app.enabled);
    card.classList.toggle('disabled', !app.enabled);
  }

  saveState();
  calculateAll();
}

function handlePresetChange(id, value) {
  const app = userAppliances.find(a => a.id === id);
  if (!app) return;

  const customWrap = document.getElementById(`custom_wrap_${id}`);

  if (value === 'custom') {
    app.isCustom = true;
    if (customWrap) customWrap.style.display = 'flex';
  } else {
    app.isCustom = false;
    app.watt = parseInt(value, 10);
    if (customWrap) customWrap.style.display = 'none';
  }

  saveState();
  calculateAll();
}

function handleCustomWatt(id, val) {
  const app = userAppliances.find(a => a.id === id);
  if (!app) return;
  const num = parseInt(val, 10);
  if (!isNaN(num) && num > 0) {
    app.watt = num;
    saveState();
    calculateAll();
  }
}

function stepQty(id, delta) {
  const app = userAppliances.find(a => a.id === id);
  if (!app) return;
  let next = app.qty + delta;
  if (next < 1) next = 1;
  if (next > 100) next = 100;
  app.qty = next;

  const valEl = document.getElementById(`qty_val_${id}`);
  if (valEl) valEl.textContent = toBanglaNumber(next);

  saveState();
  calculateAll();
}

function stepHours(id, delta) {
  const app = userAppliances.find(a => a.id === id);
  if (!app) return;
  let next = app.hours + delta;
  if (next < 0.5) next = 0.5;
  if (next > 24) next = 24;
  app.hours = next;

  const valEl = document.getElementById(`hours_val_${id}`);
  if (valEl) valEl.textContent = `${toBanglaNumber(next)} ঘণ্টা`;

  saveState();
  calculateAll();
}

unitRateInput.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    unitRate = val;
    saveState();
    calculateAll();
  }
});

btnResetDefaults.addEventListener('click', () => {
  if (confirm('আপনি কি সব যন্ত্রপাতির মান পূর্বাবস্থায় (Default) ফিরিয়ে নিতে চান?')) {
    localStorage.removeItem('ws_appliances');
    localStorage.removeItem('ws_unit_rate');
    unitRate = 7.50;
    unitRateInput.value = '7.50';
    initAppliancesState();
    renderApplianceCards();
    calculateAll();
    showToast('সব যন্ত্রের মান ডিফল্ট অবস্থায় ফিরে গেছে');
  }
});

// --- 4. BLDC Calculator Logic ---
function calculateBldcSavings() {
  const normalYearlyKwh = (75 * bldcQty * bldcHours * 365) / 1000;
  const modernYearlyKwh = (28 * bldcQty * bldcHours * 365) / 1000;

  const normalCost = Math.round(normalYearlyKwh * unitRate);
  const modernCost = Math.round(modernYearlyKwh * unitRate);
  const savedCost = normalCost - modernCost;

  bldcQtyVal.textContent = toBanglaNumber(bldcQty);
  bldcHoursVal.textContent = `${toBanglaNumber(bldcHours)} ঘণ্টা`;
  bldcNormalCost.textContent = `৳ ${toBanglaNumber(normalCost)}`;
  bldcModernCost.textContent = `৳ ${toBanglaNumber(modernCost)}`;
  bldcTotalSaved.textContent = `৳ ${toBanglaNumber(savedCost)} টাকা!`;
}

bldcQtyMinus.addEventListener('click', () => {
  if (bldcQty > 1) {
    bldcQty--;
    calculateBldcSavings();
  }
});
bldcQtyPlus.addEventListener('click', () => {
  if (bldcQty < 50) {
    bldcQty++;
    calculateBldcSavings();
  }
});

bldcHoursMinus.addEventListener('click', () => {
  if (bldcHours > 1) {
    bldcHours--;
    calculateBldcSavings();
  }
});
bldcHoursPlus.addEventListener('click', () => {
  if (bldcHours < 24) {
    bldcHours++;
    calculateBldcSavings();
  }
});

// --- 5. Render Energy Hacks ---
function renderHacks() {
  hacksGrid.innerHTML = energyHacksData.map(h => `
    <div class="hack-card">
      <div class="hack-header">
        <span class="hack-icon">${h.icon}</span>
        <h4>${h.title}</h4>
      </div>
      <span class="hack-badge">${h.badge}</span>
      <p>${h.desc}</p>
    </div>
  `).join('');
}

// --- 6. Tab Navigation ---
tabCalcBtn.addEventListener('click', () => {
  tabCalcBtn.classList.add('active');
  tabCompareBtn.classList.remove('active');
  calcView.style.display = 'block';
  compareView.style.display = 'none';
});

tabCompareBtn.addEventListener('click', () => {
  tabCompareBtn.classList.add('active');
  tabCalcBtn.classList.remove('active');
  calcView.style.display = 'none';
  compareView.style.display = 'block';
  calculateBldcSavings();
});

// --- 7. Service Worker & PWA Install ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('WattSaver SW Registered:', reg.scope))
      .catch((err) => console.log('SW Registration failed:', err));
  });
}

function updateOnlineStatus() {
  if (navigator.onLine) {
    offlineBadge.innerHTML = '<span class="pulse-dot"></span> অফলাইন রেডি';
    offlineBadge.style.color = '#38bdf8';
  } else {
    offlineBadge.innerHTML = '⚡ সম্পূর্ণ অফলাইন মোড';
    offlineBadge.style.color = '#fbbf24';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-flex';

  if (!sessionStorage.getItem('ws_install_dismissed')) {
    setTimeout(() => {
      if (deferredPrompt && installBanner) {
        installBanner.style.display = 'flex';
      }
    }, 4000);
  }
});

function triggerInstall() {
  if (!deferredPrompt) {
    alert('মোবাইলের ব্রাউজার মেনু (তিনটি ডট) থেকে "Install App" বা "Add to Home screen" নির্বাচন করে সহজেই ইনস্টল করতে পারেন!');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
      if (installBtn) installBtn.style.display = 'none';
      if (installBanner) installBanner.style.display = 'none';
    }
    deferredPrompt = null;
  });
}

if (installBtn) installBtn.addEventListener('click', triggerInstall);
if (bannerInstallBtn) bannerInstallBtn.addEventListener('click', triggerInstall);
if (bannerDismissBtn) {
  bannerDismissBtn.addEventListener('click', () => {
    installBanner.style.display = 'none';
    sessionStorage.setItem('ws_install_dismissed', 'true');
  });
}

// --- 8. Double-Back Exit & Toast ---
function showToast(message) {
  toastNotice.textContent = message;
  toastNotice.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastNotice.classList.remove('show');
  }, 2500);
}

function setupHistoryGuard() {
  window.history.replaceState({ page: 'home_base' }, '');
  window.history.pushState({ page: 'home_active' }, '');
}

window.addEventListener('popstate', () => {
  const now = Date.now();
  if (now - lastBackPressTime < 2000) {
    window.history.back();
  } else {
    lastBackPressTime = now;
    showToast('⚠️ অ্যাপ থেকে বের হতে আবার ব্যাক চাপুন');
    window.history.pushState({ page: 'home_active' }, '');
  }
});

function toBanglaNumber(n) {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return n.toString().replace(/\d/g, (d) => bnDigits[d]);
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  initAppliancesState();
  renderApplianceCards();
  renderHacks();
  calculateAll();
  setupHistoryGuard();
});
