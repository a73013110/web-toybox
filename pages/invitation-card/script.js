// ========================================
// DOM
// ========================================

const scenes = [...document.querySelectorAll('.scene')];
const mesh = document.getElementById('mesh');
const ambientDots = document.getElementById('ambientDots');
const ambientShapes = document.getElementById('ambientShapes');
const card = document.getElementById('card');
const stage = document.querySelector('.stage');
const backLink = document.querySelector('.back-link');
const progressBar = document.getElementById('progressBar');
const stepLabel = document.getElementById('stepLabel');
const previousBtn = document.getElementById('previousBtn');
const nameGate = document.getElementById('nameGate');
const nameForm = document.getElementById('nameForm');
const inviteeNameInput = document.getElementById('inviteeName');
const nameError = document.getElementById('nameError');
const inviteeNameLabel = document.getElementById('inviteeNameLabel');
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const subText = document.getElementById('subText');
const toScene3 = document.getElementById('toScene3');
const timingForm = document.getElementById('timingForm');
const timingInputs = [...document.querySelectorAll('input[name="timing"]')];
const timingError = document.getElementById('timingError');
const toScene4 = document.getElementById('toScene4');
const activityForm = document.getElementById('activityForm');
const activityFieldset = activityForm.querySelector('fieldset');
const activityInputs = [...document.querySelectorAll('input[name="activities"]')];
const customActivityToggle = document.getElementById('customActivityToggle');
const customActivityInput = document.getElementById('customActivityInput');
const activityError = document.getElementById('activityError');
const toScene5 = document.getElementById('toScene5');
const selectionCount = document.getElementById('selectionCount');
const confirmationStatus = document.getElementById('confirmationStatus');
const summaryTiming = document.getElementById('summaryTiming');
const summaryActivity = document.getElementById('summaryActivity');
const restartBtn = document.getElementById('restartBtn');

// ========================================
// State / Configuration
// ========================================

const query = new URLSearchParams(window.location.search);
const sceneOrder = ['scene1', 'scene2', 'scene3', 'scene4', 'scene5'];
const normalizeName = (value = '') => value.trim().slice(0, 40);
const state = {
  currentStep: 1,
  dodgeCount: 0,
  chosenTiming: '',
  chosenActivities: [],
  inviteeName: normalizeName(query.get('invite') || ''),
  lastSubmittedSignature: '',
  textToken: 0
};
const GOOGLE_SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxuIIPk4q0qd5EoHOBAZe606OrZtzo1m3gychjEGSfsaqxTzIY8RFMYS3097yUpu_gq/exec';
const SUBMISSION_TIMEOUT_MS = 30000; // Google Apps Script 冷啟動可能超過原本的 12 秒，避免資料已寫入卻被誤判失敗。
const declineReactions = [
  { message: '再考慮一下嘛，飲料我請', label: '你確定？' },
  { message: '這可能只是你的手滑了一下', label: '剛剛不算' },
  { message: '拒絕鍵開始懷疑自己的存在', label: '再想三秒' },
  { message: '它正在嘗試低調離開現場', label: '怎麼還在' },
  { message: '好啦，不勉強。邀請會一直保留', label: '本按鈕已下班' }
];
const confirmationReactions = [
  '先把工作行程請到旁邊坐。',
  '正在和臨時加班進行和平談判…',
  '檢查放鳥罰則是否具有嚇阻力…',
  '最後替這次出門蓋個章。'
];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');

function focusScene(scene) {
  const heading = scene.querySelector('h1, h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

// ========================================
// Background Effects
// ========================================

let lastSparkTime = 0;

document.addEventListener('pointermove', (event) => {
  mesh.style.setProperty('--mx', `${(event.clientX / window.innerWidth) * 100}%`);
  mesh.style.setProperty('--my', `${(event.clientY / window.innerHeight) * 100}%`);

  // 幾何裝飾只做小幅視差，避免搶走卡片焦點。
  const offsetX = (event.clientX / window.innerWidth - 0.5) * 16;
  const offsetY = (event.clientY / window.innerHeight - 0.5) * 12;
  ambientShapes.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;

  if (reduceMotion.matches || coarsePointer.matches || Date.now() - lastSparkTime < 55) return;
  lastSparkTime = Date.now();
  spawnPointerSpark(event.clientX, event.clientY);
});

function spawnPointerSpark(x, y) {
  const spark = document.createElement('span');
  spark.className = 'pointer-spark';
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  spark.style.setProperty('--spark-x', `${Math.random() * 18 - 9}px`);
  spark.style.setProperty('--spark-y', `${-10 - Math.random() * 18}px`);
  ambientDots.appendChild(spark);
  spark.addEventListener('animationend', () => spark.remove(), { once: true });
}

function spawnDot() {
  if (reduceMotion.matches || document.hidden) return;
  const dot = document.createElement('span');
  const size = 2 + Math.random() * 3;
  const duration = 7 + Math.random() * 6;
  dot.className = 'dot';
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.left = `${Math.random() * 100}%`;
  dot.style.top = `${Math.random() * 100}%`;
  dot.style.animationDuration = `${duration}s`;
  ambientDots.appendChild(dot);
  window.setTimeout(() => dot.remove(), duration * 1000);
}

// 先放入少量錯開的光點，避免初次進入時背景過於安靜。
if (!reduceMotion.matches) {
  for (let index = 0; index < (coarsePointer.matches ? 8 : 14); index += 1) {
    window.setTimeout(spawnDot, index * 120);
  }
  window.setInterval(spawnDot, coarsePointer.matches ? 850 : 420); // 減少動態模式下不啟動背景計時器。
}

// ========================================
// Scene Navigation
// ========================================

function showScene(id) {
  const nextScene = document.getElementById(id);
  if (!nextScene) return;
  const step = Number(nextScene.dataset.step);
  state.currentStep = step;
  scenes.forEach((scene) => {
    const isActive = scene === nextScene;
    scene.hidden = !isActive; // 隱藏非目前場景，避免鍵盤焦點誤入。
    scene.classList.toggle('active', isActive);
  });
  progressBar.style.width = `${step * 20}%`;
  stepLabel.textContent = `${String(step).padStart(2, '0')} / 05`;
  previousBtn.hidden = step === 1; // 第一頁就是邀請流程的起點，不再顯示上一步。
  focusScene(nextScene);
}

previousBtn.addEventListener('click', () => {
  const currentIndex = sceneOrder.indexOf(`scene${state.currentStep}`);
  if (currentIndex > 0) showScene(sceneOrder[currentIndex - 1]); // 保留已填內容並回到前一頁。
});

// ========================================
// Invitee Name
// ========================================

function applyInviteeName(name) {
  state.inviteeName = normalizeName(name); // URL 參數也限制為與輸入欄相同的長度。
  inviteeNameLabel.textContent = `${state.inviteeName}，`;
  inviteeNameLabel.hidden = !state.inviteeName; // 姓名只透過 textContent 寫入，避免注入 HTML。
}

if (state.inviteeName) {
  applyInviteeName(state.inviteeName);
} else {
  nameGate.hidden = false;
  stage.inert = true; // 輸入稱呼前，暫時禁止操作後方的邀請卡。
  backLink.inert = true;
  document.body.classList.add('name-gate-open');
  window.setTimeout(() => inviteeNameInput.focus(), 0);
}

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = inviteeNameInput.value.trim();
  if (!name) {
    nameError.textContent = '請填入姓名或稱呼。';
    inviteeNameInput.focus();
    return;
  }

  applyInviteeName(name);
  nameError.textContent = '';
  nameGate.hidden = true;
  stage.inert = false;
  backLink.inert = false;
  document.body.classList.remove('name-gate-open');
  focusScene(document.getElementById('scene1'));
});

inviteeNameInput.addEventListener('input', () => {
  if (inviteeNameInput.value.trim()) nameError.textContent = '';
});

// ========================================
// Invitation
// ========================================

function setSubText(text) {
  const currentToken = ++state.textToken;
  subText.classList.add('fading');
  window.setTimeout(() => {
    if (currentToken !== state.textToken) return; // 忽略已被更新呼叫取代的文字動畫。
    subText.textContent = text;
    void subText.offsetWidth;
    subText.classList.remove('fading');
  }, reduceMotion.matches ? 0 : 220);
}

function declineInvitation() {
  if (state.dodgeCount >= declineReactions.length) return;

  const reaction = declineReactions[state.dodgeCount];
  setSubText(reaction.message);
  noBtn.textContent = reaction.label;
  state.dodgeCount += 1;

  // 每次婉拒都讓按鈕換位置，也讓「願意」悄悄更有存在感。
  const direction = state.dodgeCount % 2 === 0 ? -1 : 1;
  const distance = 18 + state.dodgeCount * 8;
  noBtn.style.setProperty('--dodge-x', `${direction * distance}px`);
  noBtn.style.setProperty('--dodge-r', `${direction * (1 + state.dodgeCount * 0.6)}deg`);
  yesBtn.style.setProperty('--yes-grow', String(1 + state.dodgeCount * 0.025));

  card.classList.remove('is-teasing');
  void card.offsetWidth;
  card.classList.add('is-teasing');

  if (state.dodgeCount === declineReactions.length) noBtn.disabled = true;
}

yesBtn.addEventListener('click', () => {
  burst(12);
  window.setTimeout(() => showScene('scene2'), reduceMotion.matches ? 0 : 320);
});
noBtn.addEventListener('click', declineInvitation);
toScene3.addEventListener('click', () => showScene('scene3'));

// ========================================
// Timing / Activity Selection
// ========================================

timingInputs.forEach((input) => {
  input.addEventListener('change', () => {
    state.chosenTiming = input.value;
    toScene4.disabled = false;
    timingError.textContent = '';
    updateActivities(); // 修改時間後，允許重新送出更新後的選擇。
  });
});

timingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.chosenTiming) {
    timingError.textContent = '請先選一個成行暗號。';
    timingInputs[0]?.focus();
    return;
  }
  showScene('scene4');
});

function updateActivities() {
  const presetActivities = activityInputs
    .filter((item) => item.checked && item !== customActivityToggle)
    .map((item) => item.value);
  const customActivity = customActivityInput.value.trim();

  // 自訂項目只有在勾選且填有內容時才算入有效選擇。
  state.chosenActivities = customActivityToggle.checked && customActivity
    ? [...presetActivities, customActivity]
    : presetActivities;

  const count = state.chosenActivities.length;
  const customIncomplete = customActivityToggle.checked && !customActivity;
  const alreadySubmitted = getSelectionSignature() === state.lastSubmittedSignature;
  toScene5.disabled = count === 0 || customIncomplete || alreadySubmitted;
  toScene5.textContent = alreadySubmitted
    ? '已送出'
    : count > 0 ? `確認 ${count} 項選擇` : '確認選擇';
  selectionCount.textContent = count > 0 ? `已選擇 ${count} 項` : '尚未選擇';
  activityError.textContent = customIncomplete ? '請填寫自訂項目。' : '';
}

function getSelectionSignature() {
  return JSON.stringify([state.chosenTiming, state.chosenActivities]);
}

activityInputs.forEach((input) => input.addEventListener('change', updateActivities));

customActivityInput.addEventListener('focus', () => {
  customActivityToggle.checked = true; // 點入文字欄時自動選取「自己填寫」。
  updateActivities();
});

customActivityInput.addEventListener('input', () => {
  customActivityToggle.checked = Boolean(customActivityInput.value.trim());
  updateActivities();
});

async function sendInvitationResult() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS);

  try {
    await fetch(GOOGLE_SHEETS_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors', // Apps Script 不提供可供前端讀取的跨網域回應，因此使用不透明回應送出資料。
      signal: controller.signal, // 避免網路無回應時讓按鈕永久停在傳送狀態。
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // 使用簡單請求，避免瀏覽器先送出 Apps Script 不支援的 CORS 預檢。
      },
      body: JSON.stringify({
        schemaVersion: 1, // 只在資料結構改版時遞增，不與前端選項內容綁定。
        invite: state.inviteeName || '未指定',
        declineCount: state.dodgeCount, // 記錄這次流程按下「先不要」及其變化按鈕的總次數。
        timing: state.chosenTiming,
        activities: state.chosenActivities, // 保留陣列格式，交由 Apps Script 驗證並寫入試算表。
        page: window.location.href
      })
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

let confirmationToken = 0;

async function playConfirmationRitual() {
  const currentToken = ++confirmationToken;
  const delay = reduceMotion.matches ? 350 : 720;
  confirmationStatus.hidden = false;
  activityFieldset.disabled = true; // 過場期間固定本次選擇，避免送出內容與最後摘要不一致。
  toScene5.classList.add('is-confirming');
  toScene5.setAttribute('aria-busy', 'true');
  toScene5.textContent = '正在喬時間';

  for (const message of confirmationReactions) {
    if (currentToken !== confirmationToken) return; // 送出失敗或流程重設後，停止舊的等待文字。
    confirmationStatus.textContent = message;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }
}

function resetConfirmationRitual() {
  confirmationToken += 1; // 讓仍在等待中的舊流程立即失效。
  confirmationStatus.hidden = true;
  confirmationStatus.textContent = '';
  activityFieldset.disabled = false;
  toScene5.classList.remove('is-confirming');
  toScene5.removeAttribute('aria-busy');
}

activityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (customActivityToggle.checked && !customActivityInput.value.trim()) {
    activityError.textContent = '請填寫自訂項目。';
    customActivityInput.focus();
    return;
  }
  if (state.chosenActivities.length === 0) {
    activityError.textContent = '請至少選擇一個項目。';
    activityInputs[0]?.focus();
    return;
  }

  toScene5.disabled = true;
  toScene5.textContent = '正在傳送…';
  activityError.textContent = '';

  try {
    await Promise.all([
      sendInvitationResult(), // 在背景寫入 Google Sheet，不向填寫者顯示技術性的傳送狀態。
      playConfirmationRitual() // 保留一段有趣的行程確認過場，避免畫面瞬間跳轉。
    ]);
    summaryTiming.textContent = state.chosenTiming;
    summaryActivity.textContent = state.chosenActivities.join('、');
    state.lastSubmittedSignature = getSelectionSignature();
    resetConfirmationRitual();
    updateActivities(); // 回到選擇頁時顯示已送出，避免同一份結果重複提交。
    showScene('scene5');
    burst(20);
  } catch (error) {
    console.error(error);
    resetConfirmationRitual();
    activityError.textContent = '回覆剛剛沒有送達，請檢查網路後再試一次。'; // 此功能只收集回覆，不會直接建立行事曆行程。
    toScene5.disabled = false;
    toScene5.textContent = `確認 ${state.chosenActivities.length} 項選擇`;
  }
});

// ========================================
// Celebration / Restart
// ========================================

function burst(count = 12) {
  if (reduceMotion.matches) return;
  const colors = ['#141414', '#a8874f', '#7a7a7a'];
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('span');
    const size = 3 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 80;
    particle.className = 'particle';
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = '50%';
    particle.style.top = '30%';
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--rot', `${Math.random() * 360}deg`);
    card.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
  }
}

restartBtn.addEventListener('click', () => {
  state.currentStep = 1;
  state.dodgeCount = 0;
  state.chosenTiming = '';
  state.chosenActivities = [];
  state.lastSubmittedSignature = '';
  state.textToken += 1;
  resetConfirmationRitual();
  timingForm.reset();
  activityForm.reset();
  timingError.textContent = '';
  activityError.textContent = '';
  toScene4.disabled = true;
  toScene5.disabled = true;
  toScene5.textContent = '確認選擇';
  selectionCount.textContent = '尚未選擇';
  noBtn.disabled = false;
  noBtn.textContent = '先不要';
  noBtn.style.removeProperty('--dodge-x');
  noBtn.style.removeProperty('--dodge-r');
  yesBtn.style.removeProperty('--yes-grow');
  card.classList.remove('is-teasing');
  subText.classList.remove('fading');
  subText.textContent = '誠摯邀請，共度一段時光';
  showScene('scene1');
});
