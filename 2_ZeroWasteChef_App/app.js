// 'জিরো ওয়েস্ট শেফ' - মূল অ্যাপ লজিক (app.js)

let selectedIngredients = new Set();
let searchQuery = '';
let activeRecipe = null;
let deferredPrompt = null;
let isSpeaking = false;
let lastBackPressTime = 0;
let isModalOpenByHistory = false;
let toastTimeout = null;

// Persistent Savings State
let totalGramsSaved = parseInt(localStorage.getItem('zwc_grams') || '0', 10);
let totalTakaSaved = parseInt(localStorage.getItem('zwc_taka') || '0', 10);

// --- DOM Elements ---
const ingredientsGrid = document.getElementById('ingredientsGrid');
const resetIngredientsBtn = document.getElementById('resetIngredientsBtn');
const selectedSummaryBar = document.getElementById('selectedSummaryBar');
const selectedCountText = document.getElementById('selectedCountText');
const recipesGrid = document.getElementById('recipesGrid');
const recipeSearch = document.getElementById('recipeSearch');
const noRecipes = document.getElementById('noRecipes');
const btnViewAll = document.getElementById('btnViewAll');
const recipeCountBadge = document.getElementById('recipeCountBadge');

// Tabs
const tabRecipesBtn = document.getElementById('tabRecipesBtn');
const tabHacksBtn = document.getElementById('tabHacksBtn');
const recipesSection = document.getElementById('recipesSection');
const hacksSection = document.getElementById('hacksSection');
const hacksGrid = document.getElementById('hacksGrid');

// Savings Banner
const totalGramsSavedEl = document.getElementById('totalGramsSaved');
const totalTakaSavedEl = document.getElementById('totalTakaSaved');

// Recipe Modal
const recipeModal = document.getElementById('recipeModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalRecipeIcon = document.getElementById('modalRecipeIcon');
const modalRecipeTitle = document.getElementById('modalRecipeTitle');
const modalRecipeSub = document.getElementById('modalRecipeSub');
const modalRecipeTime = document.getElementById('modalRecipeTime');
const modalRecipeDiff = document.getElementById('modalRecipeDiff');
const modalRecipeSaved = document.getElementById('modalRecipeSaved');
const modalRecipeDesc = document.getElementById('modalRecipeDesc');
const modalIngredientsList = document.getElementById('modalIngredientsList');
const modalStepsList = document.getElementById('modalStepsList');
const modalProTipText = document.getElementById('modalProTipText');
const recipeVoiceBtn = document.getElementById('recipeVoiceBtn');
const btnCookDone = document.getElementById('btnCookDone');

// PWA Install Elements
const installBtn = document.getElementById('installBtn');
const installBanner = document.getElementById('installBanner');
const bannerInstallBtn = document.getElementById('bannerInstallBtn');
const bannerDismissBtn = document.getElementById('bannerDismissBtn');
const offlineBadge = document.getElementById('offlineBadge');
const toastNotice = document.getElementById('toastNotice');

// --- 1. Service Worker & Offline Engine ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Chef Service Worker active:', reg.scope))
      .catch((err) => console.log('Service Worker failed:', err));
  });
}

function updateOnlineStatus() {
  if (navigator.onLine) {
    offlineBadge.innerHTML = '<span class="pulse-dot"></span> অফলাইন রেডি';
    offlineBadge.style.color = '#4ade80';
  } else {
    offlineBadge.innerHTML = '⚡ সম্পূর্ণ অফলাইন মোড';
    offlineBadge.style.color = '#fbbf24';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-flex';

  if (!sessionStorage.getItem('zwc_install_dismissed')) {
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
    sessionStorage.setItem('zwc_install_dismissed', 'true');
  });
}

// --- 2. Render Ingredient Chips ---
function renderIngredients() {
  ingredientsGrid.innerHTML = ingredientsData.map((ing) => {
    const isSelected = selectedIngredients.has(ing.id);
    return `
      <button class="ing-chip ${isSelected ? 'selected' : ''}" onclick="toggleIngredient('${ing.id}')" aria-pressed="${isSelected}">
        <span>${ing.icon}</span>
        <span>${ing.name}</span>
        <span class="chip-check">✓</span>
      </button>
    `;
  }).join('');

  updateSelectedSummary();
}

function toggleIngredient(id) {
  if (selectedIngredients.has(id)) {
    selectedIngredients.delete(id);
  } else {
    selectedIngredients.add(id);
  }
  renderIngredients();
  renderRecipes();
}

function updateSelectedSummary() {
  const count = selectedIngredients.size;
  if (count > 0) {
    selectedSummaryBar.style.display = 'flex';
    selectedCountText.textContent = `✓ ${toBanglaNumber(count)}টি উপকরণ নির্বাচিত হয়েছে`;
  } else {
    selectedSummaryBar.style.display = 'none';
  }
}

resetIngredientsBtn.addEventListener('click', () => {
  selectedIngredients.clear();
  renderIngredients();
  renderRecipes();
});

btnViewAll.addEventListener('click', () => {
  selectedIngredients.clear();
  recipeSearch.value = '';
  searchQuery = '';
  renderIngredients();
  renderRecipes();
});

// --- 3. Recipe Matching Algorithm & Rendering ---
function renderRecipes() {
  const query = searchQuery.trim().toLowerCase();

  const scoredRecipes = recipesData.map((recipe) => {
    let matchCount = 0;
    let requiredCount = recipe.requiredIngredients.length;

    recipe.requiredIngredients.forEach((req) => {
      if (selectedIngredients.has(req)) matchCount++;
    });

    const isFullMatch = selectedIngredients.size > 0 && matchCount === requiredCount;
    const isPartialMatch = selectedIngredients.size > 0 && matchCount > 0 && !isFullMatch;

    return {
      recipe,
      matchCount,
      requiredCount,
      isFullMatch,
      isPartialMatch
    };
  });

  // Filter based on selection and search
  let filtered = scoredRecipes.filter(({ recipe, matchCount }) => {
    const matchesSearch = !query || 
      recipe.title.toLowerCase().includes(query) ||
      recipe.titleEn.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query);

    if (selectedIngredients.size === 0) {
      return matchesSearch;
    }
    // If ingredients are picked, show matches with at least 1 ingredient matched
    return matchesSearch && matchCount > 0;
  });

  // Sort: 100% full matches first, then partial matches by matchCount, then others
  filtered.sort((a, b) => {
    if (a.isFullMatch && !b.isFullMatch) return -1;
    if (!a.isFullMatch && b.isFullMatch) return 1;
    return b.matchCount - a.matchCount;
  });

  recipeCountBadge.textContent = toBanglaNumber(filtered.length);

  if (filtered.length === 0) {
    recipesGrid.innerHTML = '';
    noRecipes.style.display = 'block';
    return;
  }

  noRecipes.style.display = 'none';

  recipesGrid.innerHTML = filtered.map(({ recipe, isFullMatch, isPartialMatch, matchCount }) => {
    let badgeHtml = '';
    if (isFullMatch) {
      badgeHtml = `<span class="match-badge badge-full">🟢 ১০০% মিলে গেছে!</span>`;
    } else if (isPartialMatch) {
      badgeHtml = `<span class="match-badge badge-partial">🟡 ${toBanglaNumber(matchCount)}টি উপাদান মিলেছে</span>`;
    } else {
      badgeHtml = `<span class="match-badge badge-all">🍲 রেসিপি</span>`;
    }

    const tagsHtml = recipe.requiredIngredients.map((ingId) => {
      const ing = ingredientsData.find(i => i.id === ingId);
      const isMatched = selectedIngredients.has(ingId);
      return `<span class="ing-tag ${isMatched ? 'matched' : ''}">${ing ? ing.name : ingId}</span>`;
    }).join('');

    return `
      <article class="recipe-card" onclick="openRecipeModal('${recipe.id}')" tabindex="0" role="button">
        <div>
          <div class="card-badge-row">
            ${badgeHtml}
            <span class="time-badge">⏱️ ${recipe.time}</span>
          </div>
          <div class="recipe-header-title">
            <span class="recipe-icon">${recipe.icon}</span>
            <div>
              <h3>${recipe.title}</h3>
              <span class="recipe-sub">${recipe.titleEn}</span>
            </div>
          </div>
          <p class="card-recipe-desc">${recipe.description}</p>
          <div class="card-ingredients-tags">
            ${tagsHtml}
          </div>
        </div>
        <div class="card-bottom-row">
          <span class="savings-tag">🌱 সাশ্রয়: ~${toBanglaNumber(recipe.savedGrams)} গ্রাম</span>
          <span class="view-recipe-btn">প্রণালী দেখুন ➔</span>
        </div>
      </article>
    `;
  }).join('');
}

recipeSearch.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderRecipes();
});

// --- 4. Recipe Modal & Cooking Finished Action ---
function openRecipeModal(id) {
  const recipe = recipesData.find((r) => r.id === id);
  if (!recipe) return;

  activeRecipe = recipe;
  stopVoice();

  modalRecipeIcon.textContent = recipe.icon;
  modalRecipeTitle.textContent = recipe.title;
  modalRecipeSub.textContent = recipe.titleEn;
  modalRecipeTime.textContent = recipe.time;
  modalRecipeDiff.textContent = recipe.difficulty;
  modalRecipeSaved.textContent = `~${toBanglaNumber(recipe.savedGrams)} গ্রাম ও ৳ ${toBanglaNumber(recipe.savedTaka)} সাশ্রয়`;
  modalRecipeDesc.textContent = recipe.description;

  // Ingredients List
  modalIngredientsList.innerHTML = recipe.ingredientsList
    .map((ing) => `<li>${ing}</li>`)
    .join('');

  // Steps List
  modalStepsList.innerHTML = recipe.steps
    .map((step) => `<li>${step}</li>`)
    .join('');

  // Pro Tip
  modalProTipText.textContent = recipe.proTip;

  recipeModal.classList.add('active');
  recipeModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Push history state so Android back button closes modal first
  isModalOpenByHistory = true;
  window.history.pushState({ modal: 'recipe' }, '');
}

function closeRecipeModal(isTriggeredByPopState = false) {
  if (!recipeModal.classList.contains('active')) return;

  recipeModal.classList.remove('active');
  recipeModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  stopVoice();
  activeRecipe = null;

  if (!isTriggeredByPopState && isModalOpenByHistory) {
    isModalOpenByHistory = false;
    window.history.back();
  } else {
    isModalOpenByHistory = false;
  }
}

modalCloseBtn.addEventListener('click', () => closeRecipeModal(false));
recipeModal.addEventListener('click', (e) => {
  if (e.target === recipeModal) closeRecipeModal(false);
});

// Mark as Cooked & Increment Savings
btnCookDone.addEventListener('click', () => {
  if (!activeRecipe) return;

  totalGramsSaved += activeRecipe.savedGrams;
  totalTakaSaved += activeRecipe.savedTaka;

  localStorage.setItem('zwc_grams', totalGramsSaved.toString());
  localStorage.setItem('zwc_taka', totalTakaSaved.toString());

  updateSavingsDisplay();
  closeRecipeModal(false);

  showToast(`🎉 দারুণ! আপনার মোট সঞ্চয়ে ${toBanglaNumber(activeRecipe.savedGrams)} গ্রাম খাবার ও ৳${toBanglaNumber(activeRecipe.savedTaka)} যোগ হয়েছে!`);
});

function updateSavingsDisplay() {
  totalGramsSavedEl.textContent = `${toBanglaNumber(totalGramsSaved)} গ্রাম`;
  totalTakaSavedEl.textContent = `৳ ${toBanglaNumber(totalTakaSaved)}`;
}

// --- 5. Kitchen Hacks Section Rendering ---
function renderHacks() {
  hacksGrid.innerHTML = kitchenHacksData.map((hack) => `
    <div class="hack-card">
      <div class="hack-header">
        <span class="hack-icon">${hack.icon}</span>
        <h4>${hack.title}</h4>
      </div>
      <p>${hack.summary}</p>
    </div>
  `).join('');
}

// Tab Switching
tabRecipesBtn.addEventListener('click', () => {
  tabRecipesBtn.classList.add('active');
  tabHacksBtn.classList.remove('active');
  recipesSection.style.display = 'block';
  hacksSection.style.display = 'none';
});

tabHacksBtn.addEventListener('click', () => {
  tabHacksBtn.classList.add('active');
  tabRecipesBtn.classList.remove('active');
  recipesSection.style.display = 'none';
  hacksSection.style.display = 'block';
});

// --- 6. Bangla Voice Synthesis ---
function toggleVoice() {
  if (isSpeaking) {
    stopVoice();
  } else {
    playVoice();
  }
}

function playVoice() {
  if (!activeRecipe || !('speechSynthesis' in window)) {
    alert('দুঃখিত, আপনার ব্রাউজারে স্পিচ সিন্থেসিস সমর্থন করছে না।');
    return;
  }

  window.speechSynthesis.cancel();

  const stepsText = activeRecipe.steps.join('। ');
  const textToRead = `${activeRecipe.title} তৈরির নিয়ম। ${stepsText}। শেফের টিপ: ${activeRecipe.proTip}`;

  const utterance = new SpeechSynthesisUtterance(textToRead);
  utterance.lang = 'bn-BD';
  utterance.rate = 0.9;

  const voices = window.speechSynthesis.getVoices();
  const banglaVoice = voices.find(v => v.lang.startsWith('bn'));
  if (banglaVoice) utterance.voice = banglaVoice;

  utterance.onstart = () => {
    isSpeaking = true;
    recipeVoiceBtn.querySelector('.voice-btn-text').textContent = 'থামুন';
  };
  utterance.onend = () => stopVoice();
  utterance.onerror = () => stopVoice();

  window.speechSynthesis.speak(utterance);
}

function stopVoice() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  if (recipeVoiceBtn) {
    recipeVoiceBtn.querySelector('.voice-btn-text').textContent = 'শুনুন';
  }
}

recipeVoiceBtn.addEventListener('click', toggleVoice);

// --- 7. Toast & Android Double-Back Exit ---
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
  // If Recipe Modal is active, close modal and stay in app
  if (recipeModal.classList.contains('active')) {
    closeRecipeModal(true);
    return;
  }

  // If on home page, check double-tap back to exit
  const now = Date.now();
  if (now - lastBackPressTime < 2000) {
    window.history.back();
  } else {
    lastBackPressTime = now;
    showToast('⚠️ অ্যাপ থেকে বের হতে আবার ব্যাক চাপুন');
    window.history.pushState({ page: 'home_active' }, '');
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && recipeModal.classList.contains('active')) {
    closeRecipeModal(false);
  }
});

// Utility
function toBanglaNumber(n) {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return n.toString().replace(/\d/g, (d) => bnDigits[d]);
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  renderIngredients();
  renderRecipes();
  renderHacks();
  updateSavingsDisplay();
  setupHistoryGuard();
});
