// 'মুহূর্তের ফার্স্ট-এইড' - প্রধান অ্যাপ লজিক (app.js)

let currentCategory = 'all';
let searchQuery = '';
let activeCase = null;
let deferredPrompt = null;
let isSpeaking = false;
let cprInterval = null;
let audioCtx = null;

// Double Back Press Variables
let lastBackPressTime = 0;
let toastTimeout = null;
let isModalOpenByHistory = false;

// --- DOM References ---
const casesGrid = document.getElementById('casesGrid');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const categoryPills = document.getElementById('categoryPills');
const sectionTitle = document.getElementById('sectionTitle');
const itemCount = document.getElementById('itemCount');
const noResults = document.getElementById('noResults');

// Modal Elements
const detailModal = document.getElementById('detailModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalIcon = document.getElementById('modalIcon');
const modalCategory = document.getElementById('modalCategory');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const modalQuickSummary = document.getElementById('modalQuickSummary');
const modalDosList = document.getElementById('modalDosList');
const modalDontsList = document.getElementById('modalDontsList');
const modalHospitalList = document.getElementById('modalHospitalList');
const voicePlayBtn = document.getElementById('voicePlayBtn');
const audioStatusText = document.getElementById('audioStatusText');

// CPR Elements
const btnCprRhythm = document.getElementById('btnCprRhythm');
const cprModal = document.getElementById('cprModal');
const cprCloseBtn = document.getElementById('cprCloseBtn');
const cprToggleBtn = document.getElementById('cprToggleBtn');
const cprHeart = document.getElementById('cprHeart');

// PWA Install Elements
const installBtn = document.getElementById('installBtn');
const installBanner = document.getElementById('installBanner');
const bannerInstallBtn = document.getElementById('bannerInstallBtn');
const bannerDismissBtn = document.getElementById('bannerDismissBtn');
const offlineBadge = document.getElementById('offlineBadge');

// --- 1. PWA & Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker Registered successfully:', reg.scope))
      .catch((err) => console.log('Service Worker registration failed:', err));
  });
}

// Online / Offline Status Detection
function updateOnlineStatus() {
  if (navigator.onLine) {
    offlineBadge.innerHTML = '<span class="pulse-dot"></span> অফলাইন রেডি';
    offlineBadge.style.color = '#34d399';
    offlineBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else {
    offlineBadge.innerHTML = '⚡ সম্পূর্ণ অফলাইন মোড';
    offlineBadge.style.color = '#fbbf24';
    offlineBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// PWA Install Prompt Listener
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-flex';
  
  if (!sessionStorage.getItem('pwa_dismissed')) {
    setTimeout(() => {
      if (deferredPrompt && installBanner) {
        installBanner.style.display = 'flex';
      }
    }, 4000);
  }
});

function triggerInstall() {
  if (!deferredPrompt) {
    alert('মোবাইল বা ব্রাউজারের মেনু (তিনটি ডট) থেকে "Install App" বা "Add to Home screen" নির্বাচন করে সহজেই ইনস্টল করতে পারেন!');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User installed the PWA');
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
    sessionStorage.setItem('pwa_dismissed', 'true');
  });
}

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed successfully');
  if (installBtn) installBtn.style.display = 'none';
  if (installBanner) installBanner.style.display = 'none';
});

// --- 2. Render Cards & Filter Logic ---
function renderCases() {
  const filtered = firstAidData.filter((item) => {
    const matchCategory = currentCategory === 'all' || item.category === currentCategory;
    const query = searchQuery.trim().toLowerCase();
    
    if (!query) return matchCategory;

    const matchText = 
      item.title.toLowerCase().includes(query) ||
      item.titleEn.toLowerCase().includes(query) ||
      item.quickSummary.toLowerCase().includes(query) ||
      item.categoryName.toLowerCase().includes(query) ||
      item.dos.some(d => d.toLowerCase().includes(query)) ||
      item.donts.some(d => d.toLowerCase().includes(query));

    return matchCategory && matchText;
  });

  itemCount.textContent = `${toBanglaNumber(filtered.length)}টি বিষয়`;

  if (filtered.length === 0) {
    casesGrid.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';
  casesGrid.innerHTML = filtered.map((item) => `
    <article class="case-card" onclick="openCaseModal('${item.id}')" tabindex="0" role="button" aria-label="${item.title}">
      <div>
        <div class="card-top">
          <div class="card-icon-wrap">${item.icon}</div>
          <span class="severity-tag sev-${item.severity.replace(/\s+/g, '-')}">${item.severity}</span>
        </div>
        <h3>${item.title}</h3>
        <p class="english-title">${item.titleEn}</p>
        <p class="card-summary">${item.quickSummary}</p>
      </div>
      <div class="card-footer-action">
        <span class="view-guide-link">জরুরি গাইড দেখুন ➔</span>
        <span class="card-voice-indicator">🔊 অডিও</span>
      </div>
    </article>
  `).join('');
}

function toBanglaNumber(n) {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return n.toString().replace(/\d/g, (d) => bnDigits[d]);
}

categoryPills.addEventListener('click', (e) => {
  const target = e.target.closest('.pill-btn');
  if (!target) return;

  document.querySelectorAll('.pill-btn').forEach((btn) => btn.classList.remove('active'));
  target.classList.add('active');

  currentCategory = target.dataset.category;
  renderCases();
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
  renderCases();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
  renderCases();
});

// --- 3. Modal Detail View with History Support ---
function openCaseModal(id) {
  const item = firstAidData.find((c) => c.id === id);
  if (!item) return;

  activeCase = item;
  stopVoice();

  modalIcon.textContent = item.icon;
  modalCategory.textContent = item.categoryName;
  modalTitle.textContent = item.title;
  modalSub.textContent = item.titleEn;
  modalQuickSummary.textContent = item.quickSummary;

  modalDosList.innerHTML = item.dos.map((step) => `<li>${step}</li>`).join('');
  modalDontsList.innerHTML = item.donts.map((step) => `<li>${step}</li>`).join('');
  modalHospitalList.innerHTML = item.whenToHospital.map((step) => `<li>${step}</li>`).join('');

  detailModal.classList.add('active');
  detailModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Push history state so Android back button closes modal first
  isModalOpenByHistory = true;
  window.history.pushState({ modal: 'detail' }, '');
}

function closeModal(isTriggeredByPopState = false) {
  if (!detailModal.classList.contains('active')) return;
  
  detailModal.classList.remove('active');
  detailModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  stopVoice();
  activeCase = null;

  // If closed by X button or click outside, pop the history state
  if (!isTriggeredByPopState && isModalOpenByHistory) {
    isModalOpenByHistory = false;
    window.history.back();
  } else {
    isModalOpenByHistory = false;
  }
}

modalCloseBtn.addEventListener('click', () => closeModal(false));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeModal(false);
});

// --- 4. Text-to-Speech (Bangla Voice Assistant) ---
function toggleVoice() {
  if (isSpeaking) {
    stopVoice();
  } else {
    playVoice();
  }
}

function playVoice() {
  if (!activeCase || !('speechSynthesis' in window)) {
    alert('দুঃখিত, আপনার ব্রাউজারে স্পিচ সিন্থেসিস সমর্থন করছে না।');
    return;
  }

  window.speechSynthesis.cancel();

  const textToRead = `${activeCase.title}। ${activeCase.audioText}`;
  const utterance = new SpeechSynthesisUtterance(textToRead);
  
  utterance.lang = 'bn-BD';
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const banglaVoice = voices.find(v => v.lang.startsWith('bn'));
  if (banglaVoice) {
    utterance.voice = banglaVoice;
  }

  utterance.onstart = () => {
    isSpeaking = true;
    voicePlayBtn.classList.add('speaking');
    voicePlayBtn.querySelector('.voice-btn-text').textContent = 'থামুন';
    audioStatusText.textContent = '🔊 নির্দেশিকা পড়া হচ্ছে...';
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
  if (voicePlayBtn) {
    voicePlayBtn.classList.remove('speaking');
    const textSpan = voicePlayBtn.querySelector('.voice-btn-text');
    if (textSpan) textSpan.textContent = 'শুনুন';
  }
  if (audioStatusText) {
    audioStatusText.textContent = 'জরুরি বাংলায় শুনুন:';
  }
}

voicePlayBtn.addEventListener('click', toggleVoice);

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// --- 5. Interactive CPR Metronome Guide (110 BPM) ---
let isCprPlaying = false;

function playCprBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch (err) {
    console.log('AudioContext not supported or allowed', err);
  }
}

function toggleCprMetronome() {
  if (isCprPlaying) {
    clearInterval(cprInterval);
    cprInterval = null;
    isCprPlaying = false;
    cprToggleBtn.textContent = '▶ বিট চালু করুন';
    cprToggleBtn.style.background = 'var(--primary)';
    cprHeart.classList.remove('beating');
  } else {
    isCprPlaying = true;
    cprToggleBtn.textContent = '⏹ বিট বন্ধ করুন';
    cprToggleBtn.style.background = '#dc2626';
    cprHeart.classList.add('beating');

    playCprBeep();
    cprInterval = setInterval(playCprBeep, 545);
  }
}

btnCprRhythm.addEventListener('click', () => {
  cprModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  isModalOpenByHistory = true;
  window.history.pushState({ modal: 'cpr' }, '');
});

function closeCprModal(isTriggeredByPopState = false) {
  if (!cprModal.classList.contains('active')) return;
  if (isCprPlaying) toggleCprMetronome();
  cprModal.classList.remove('active');
  document.body.style.overflow = '';

  if (!isTriggeredByPopState && isModalOpenByHistory) {
    isModalOpenByHistory = false;
    window.history.back();
  } else {
    isModalOpenByHistory = false;
  }
}

cprCloseBtn.addEventListener('click', () => closeCprModal(false));
cprModal.addEventListener('click', (e) => {
  if (e.target === cprModal) closeCprModal(false);
});
cprToggleBtn.addEventListener('click', toggleCprMetronome);

// --- 6. Android Double-Back to Exit & Smart History Handling ---
function showToast(message) {
  let toast = document.getElementById('backToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'backToast';
    toast.className = 'back-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Arm the initial history guard
function setupHistoryGuard() {
  window.history.replaceState({ page: 'home_base' }, '');
  window.history.pushState({ page: 'home_active' }, '');
}

window.addEventListener('popstate', (event) => {
  // ১. যদি ডিটেইল মোডাল খোলা থাকে -> মোডাল বন্ধ করো, অ্যাপে থাকো
  if (detailModal.classList.contains('active')) {
    closeModal(true);
    return;
  }

  // ২. যদি সিপিআর মোডাল খোলা থাকে -> সিপিআর বন্ধ করো, অ্যাপে থাকো
  if (cprModal.classList.contains('active')) {
    closeCprModal(true);
    return;
  }

  // ৩. যদি হোম পেজে থাকে -> ডাবল ক্লিক যাচাই করো
  const now = Date.now();
  if (now - lastBackPressTime < 2000) {
    // ২ সেকেন্ডের মধ্যে আবার ব্যাক চাপ দিয়েছে -> অ্যাপ থেকে বের হতে দাও
    window.history.back();
  } else {
    // প্রথম চাপ: সতর্কবার্তা দেখাও এবং অ্যাপে ধরে রাখো
    lastBackPressTime = now;
    showToast('⚠️ অ্যাপ থেকে বের হতে আবার ব্যাক চাপুন');
    window.history.pushState({ page: 'home_active' }, '');
  }
});

// ESC Key support for desktop
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (detailModal.classList.contains('active')) closeModal(false);
    if (cprModal.classList.contains('active')) closeCprModal(false);
  }
});

// Init
window.addEventListener('DOMContentLoaded', () => {
  renderCases();
  setupHistoryGuard();

  const urlParams = new URLSearchParams(window.location.search);
  const issueParam = urlParams.get('issue');
  if (issueParam) {
    openCaseModal(issueParam);
  }
});
