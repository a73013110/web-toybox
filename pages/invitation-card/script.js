// ========================================
// DOM
// ========================================

const scenes = [...document.querySelectorAll('.scene')];
const mesh = document.getElementById('mesh');
const ambientDots = document.getElementById('ambientDots');
const card = document.getElementById('card');
const progressBar = document.getElementById('progressBar');
const stepLabel = document.getElementById('stepLabel');
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const subText = document.getElementById('subText');
const toScene3 = document.getElementById('toScene3');
const dateForm = document.getElementById('dateForm');
const dateInput = document.getElementById('dateInput');
const dateError = document.getElementById('dateError');
const toScene4 = document.getElementById('toScene4');
const activityForm = document.getElementById('activityForm');
const activityInputs = [...document.querySelectorAll('input[name="activity"]')];
const activityError = document.getElementById('activityError');
const toScene5 = document.getElementById('toScene5');
const summaryDate = document.getElementById('summaryDate');
const summaryActivity = document.getElementById('summaryActivity');
const restartBtn = document.getElementById('restartBtn');

// ========================================
// State / Configuration
// ========================================

const state = { currentStep: 1, dodgeCount: 0, chosenActivity: '', textToken: 0 };
const declineReactions = [
  { message: '再考慮一下嘛，飲料我請', label: '你確定？' },
  { message: '這可能只是你的手滑了一下', label: '剛剛不算' },
  { message: '拒絕鍵開始懷疑自己的存在', label: '再想三秒' },
  { message: '它正在嘗試低調離開現場', label: '怎麼還在' },
  { message: '好啦，不勉強。邀請會一直保留', label: '本按鈕已下班' }
];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function toLocalISODate(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

function focusScene(scene) {
  const heading = scene.querySelector('h1, h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

// ========================================
// Background Effects
// ========================================

document.addEventListener('pointermove', (event) => {
  mesh.style.setProperty('--mx', `${(event.clientX / window.innerWidth) * 100}%`);
  mesh.style.setProperty('--my', `${(event.clientY / window.innerHeight) * 100}%`);
});

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

window.setInterval(spawnDot, 650);

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
  focusScene(nextScene);
}

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
// Date / Activity Selection
// ========================================

dateInput.min = toLocalISODate(new Date()); // 限制只能選擇今天或未來日期。
dateInput.addEventListener('input', () => {
  toScene4.disabled = !dateInput.value;
  dateError.textContent = '';
});
dateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!dateInput.value) {
    dateError.textContent = '請先選擇日期。';
    dateInput.focus();
    return;
  }
  showScene('scene4');
});

activityInputs.forEach((input) => {
  input.addEventListener('change', () => {
    state.chosenActivity = input.value;
    toScene5.disabled = false;
    activityError.textContent = '';
  });
});
activityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.chosenActivity) {
    activityError.textContent = '請先選擇一個項目。';
    activityInputs[0]?.focus();
    return;
  }
  summaryDate.textContent = formatDate(dateInput.value);
  summaryActivity.textContent = state.chosenActivity;
  showScene('scene5');
  burst(20);
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
  state.chosenActivity = '';
  state.textToken += 1;
  dateForm.reset();
  activityForm.reset();
  dateError.textContent = '';
  activityError.textContent = '';
  toScene4.disabled = true;
  toScene5.disabled = true;
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
