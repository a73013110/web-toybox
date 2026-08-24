/*
 * Deep Talk 的畫面流程。
 *
 * 題庫在 Google Sheet，後端在 apps-script/app-deep-talk.gs。
 * 這裡只做三件事：讓使用者挑條件、一張一張發牌、把回饋收集起來一次送出。
 *
 * 刻意只在「選完條件」時打一次後端，之後翻牌都在前端跑 ——
 * 每翻一張就連線一次會慢，也很快會吃掉全站的節流額度。
 */

import { submitToAppsScript, beaconToAppsScript, describeSubmitError } from '../../shared/api.js';
import { STAGES, DEPTHS, TOPICS } from './taxonomy.js';
import { renderQuestionCard, downloadBlob } from './card-image.js';

const SETUP_STEPS = 3;
const TRENDING_LIMIT = 20;
const SHUFFLE_MIN_MS = 900; // 洗牌動畫至少跑這麼久，免得後端太快回應時只閃一下。
const SEEN_LIMIT = 300; // 與 app-deep-talk.gs 的上限一致。
const LABEL_FLASH_MS = 1600;

const STORAGE_SETUP = 'deep-talk:setup';
const STORAGE_SEEN = 'deep-talk:seen';

const $ = (id) => document.getElementById(id);

const el = {
  screens: {
    setup: $('screenSetup'),
    shuffle: $('screenShuffle'),
    cards: $('screenCards'),
    end: $('screenEnd'),
    trending: $('screenTrending'),
    error: $('screenError')
  },
  setupProgress: $('setupProgress'),
  setupBack: $('setupBack'),
  stageGrid: $('stageGrid'),
  depthGrid: $('depthGrid'),
  topicGrid: $('topicGrid'),
  topicSummary: $('topicSummary'),
  setupError: $('setupError'),
  startBtn: $('startBtn'),
  toTrending: $('toTrending'),
  card: $('questionCard'),
  cardDepth: $('cardDepth'),
  cardCount: $('cardCount'),
  cardBrief: $('cardBrief'),
  cardQuestion: $('cardQuestion'),
  cardSource: $('cardSource'),
  cardTopics: $('cardTopics'),
  cardLoved: $('cardLoved'),
  copyBtn: $('copyBtn'),
  copyLabel: $('copyLabel'),
  imageBtn: $('imageBtn'),
  imageLabel: $('imageLabel'),
  likeBtn: $('likeBtn'),
  skipBtn: $('skipBtn'),
  endCount: $('endCount'),
  endSummary: $('endSummary'),
  sendStatus: $('sendStatus'),
  againBtn: $('againBtn'),
  restartBtn: $('restartBtn'),
  rankList: $('rankList'),
  rankEmpty: $('rankEmpty'),
  trendingBack: $('trendingBack'),
  errorMessage: $('errorMessage'),
  retryBtn: $('retryBtn'),
  errorBack: $('errorBack'),
  stageLabel: $('stageLabel')
};

const templates = {
  choice: $('choiceTemplate'),
  topic: $('topicTemplate'),
  rank: $('rankTemplate')
};

const state = {
  screen: 'setup',
  step: 1,
  stage: '',
  depth: '',
  topics: new Map(), // 主題 → 'want' | 'skip'；沒有鍵就是不指定。
  deck: [],
  index: 0,
  liked: 0,
  pending: [], // 已投但還沒送出的票。
  seen: [],
  warm: false, // 這組條件下已經發過牌，下一疊可以跳過暖場。
  retry: null
};

// ========================================
// 儲存
// ========================================

// 無痕模式下 localStorage 會直接丟例外，整頁不該因此掛掉。
function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);

    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // 存不了就算了，只是下次要重新選一遍。
  }
}

// ========================================
// 畫面切換
// ========================================

function showScreen(name) {
  for (const [key, node] of Object.entries(el.screens)) {
    node.classList.toggle('is-active', key === name);
  }

  state.screen = name;
}

function showStep(step) {
  state.step = step;

  for (const node of el.screens.setup.querySelectorAll('.step')) {
    node.classList.toggle('is-active', Number(node.dataset.step) === step);
  }

  el.setupProgress.style.width = `${(step / SETUP_STEPS) * 100}%`;
  el.setupBack.hidden = step === 1;
}

function showError(message, retry) {
  el.errorMessage.textContent = message;
  el.retryBtn.textContent = retry ? retry.label : '再試一次';
  el.errorBack.hidden = Boolean(retry?.hideBack);
  state.retry = retry ? retry.run : () => startDeck(state.warm);
  showScreen('error');
}

/** 共用的錯誤訊息，加上這個作品自己的說法。 */
function describeError(error) {
  if (error?.code === 'invalid_depth') {
    return '這個頁面的版本太舊了，請重新整理後再試一次。';
  }

  if (error?.name === 'AbortError' || error?.code === 'rate_limited') {
    return describeSubmitError(error);
  }

  return '沒能連上題庫，請檢查網路後再試一次。';
}

// ========================================
// 開場：挑條件
// ========================================

function renderChoices(container, options, name, onPick) {
  const nodes = options.map((option) => {
    const node = templates.choice.content.firstElementChild.cloneNode(true);
    const input = node.querySelector('input');

    input.name = name;
    input.value = option.value;
    node.querySelector('strong').textContent = option.value;
    node.querySelector('small').textContent = option.hint;

    /*
     * 聽 click 而不是 change：從下一步倒回來時，原本挑的那一顆已經是選中狀態，
     * 再點一次不會觸發 change，使用者就卡在這一步 —— 但他的意思明明是「就這個，繼續」。
     * click 在「換一顆」與「再點同一顆」兩種情況都收得到。
     */
    input.addEventListener('click', () => onPick(option.value));

    return node;
  });

  container.replaceChildren(...nodes);
}

function renderTopics() {
  const nodes = TOPICS.map((topic) => {
    const node = templates.topic.content.firstElementChild.cloneNode(true);

    node.querySelector('.topic-name').textContent = topic;
    node.addEventListener('click', () => cycleTopic(topic, node));
    paintTopic(topic, node);

    return node;
  });

  el.topicGrid.replaceChildren(...nodes);
  updateTopicSummary();
}

function paintTopic(topic, node) {
  const value = state.topics.get(topic) ?? 'none';
  const label = { want: '想聊', skip: '不要', none: '未指定' }[value];

  node.dataset.state = value;
  node.querySelector('.topic-state').textContent = value === 'none' ? '' : label;
  node.setAttribute('aria-label', `${topic}：${label}`);
}

function cycleTopic(topic, node) {
  const next = { none: 'want', want: 'skip', skip: 'none' }[state.topics.get(topic) ?? 'none'];

  if (next === 'none') {
    state.topics.delete(topic);
  } else {
    state.topics.set(topic, next);
  }

  paintTopic(topic, node);
  updateTopicSummary();
}

function topicsBy(kind) {
  return [...state.topics].filter(([, value]) => value === kind).map(([topic]) => topic);
}

function updateTopicSummary() {
  const want = topicsBy('want');
  const skip = topicsBy('skip');
  const parts = [];

  if (want.length > 0) parts.push(`想聊 ${want.join('、')}`);
  if (skip.length > 0) parts.push(`不碰 ${skip.join('、')}`);

  el.topicSummary.textContent = parts.join('　·　') || '沒有特別指定，什麼都可能抽到';
}

function updateStageLabel() {
  el.stageLabel.textContent = [state.stage, state.depth].filter(Boolean).join(' · ');
}

function restoreSetup() {
  const saved = readStorage(STORAGE_SETUP, null);

  state.seen = readStorage(STORAGE_SEEN, []);

  if (!saved) return;

  if (STAGES.some((option) => option.value === saved.stage)) state.stage = saved.stage;
  if (DEPTHS.some((option) => option.value === saved.depth)) state.depth = saved.depth;

  for (const [topic, value] of Object.entries(saved.topics ?? {})) {
    if (TOPICS.includes(topic) && (value === 'want' || value === 'skip')) {
      state.topics.set(topic, value);
    }
  }

  for (const input of el.screens.setup.querySelectorAll('input[type="radio"]')) {
    input.checked = input.value === state.stage || input.value === state.depth;
  }
}

function saveSetup() {
  writeStorage(STORAGE_SETUP, {
    stage: state.stage,
    depth: state.depth,
    topics: Object.fromEntries(state.topics)
  });
}

// ========================================
// 發牌
// ========================================

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function startDeck(warm) {
  showScreen('shuffle');

  const startedAt = Date.now();

  try {
    const result = await submitToAppsScript('deep-talk', {
      action: 'deck',
      stage: state.stage,
      depth: state.depth,
      prefer: topicsBy('want'),
      exclude: topicsBy('skip'),
      seen: state.seen,
      warm
    });

    await wait(Math.max(0, SHUFFLE_MIN_MS - (Date.now() - startedAt)));

    if (result.cards.length === 0) {
      showEmptyDeck();
      return;
    }

    state.deck = result.cards;
    state.index = 0;
    state.liked = 0;
    state.warm = true;

    // 記住看過哪些題目，下次回來才不會又抽到同一批。
    state.seen = [...result.cards.map((card) => card.id), ...state.seen].slice(0, SEEN_LIMIT);
    writeStorage(STORAGE_SEEN, state.seen);

    renderCard();
    showScreen('cards');
  } catch (error) {
    await wait(Math.max(0, SHUFFLE_MIN_MS - (Date.now() - startedAt)));
    showError(describeError(error));
  }
}

function showEmptyDeck() {
  if (state.seen.length > 0) {
    showError('符合這些條件的題目都聊過了。', {
      label: '把看過的重新洗回去',
      run: () => {
        state.seen = [];
        writeStorage(STORAGE_SEEN, state.seen);
        startDeck(false);
      }
    });
    return;
  }

  showError('這個組合目前沒有題目，試著少排除幾個主題，或把深度調淺一點。', {
    label: '回去改條件',
    hideBack: true,
    run: () => {
      showStep(1);
      showScreen('setup');
    }
  });
}

function renderCard() {
  const card = state.deck[state.index];
  const votes = card.likes + card.skips;

  el.cardDepth.textContent = card.depth;
  el.cardCount.textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(state.deck.length).padStart(2, '0')}`;
  el.cardQuestion.textContent = card.text;

  // 摘要與出處只有時事題有，一般題目兩個都是空字串。
  el.cardBrief.textContent = card.brief ?? '';
  el.cardBrief.hidden = !card.brief;

  // 後端只放行 http(s)，這裡再檢查一次 —— 這個值最終會變成使用者點得下去的連結。
  const source = /^https?:\/\//.test(card.sourceUrl ?? '') ? card.sourceUrl : '';

  el.cardSource.href = source || '#';
  el.cardSource.hidden = !source;

  el.cardTopics.replaceChildren(...card.topics.map((topic) => {
    const item = document.createElement('li');

    item.textContent = topic;

    return item;
  }));

  // 票數太少的比例沒有意義，不如不要顯示。
  if (votes >= 5) {
    el.cardLoved.textContent = `${Math.round((card.likes / votes) * 100)}% 的人說這題很讚`;
    el.cardLoved.hidden = false;
  } else {
    el.cardLoved.hidden = true;
  }

  el.copyLabel.textContent = '複製題目';
  el.imageLabel.textContent = '存成卡片';
}

function vote(kind) {
  const card = state.deck[state.index];

  state.pending.push({ id: card.id, vote: kind });

  if (kind === 'like') state.liked += 1;

  if (state.index + 1 >= state.deck.length) {
    finish();
    return;
  }

  state.index += 1;

  el.card.classList.remove('is-turning');
  void el.card.offsetWidth; // 重新觸發動畫。
  el.card.classList.add('is-turning');

  renderCard();
}

function finish() {
  el.endCount.textContent = String(state.deck.length);
  el.endSummary.textContent = state.liked > 0
    ? `其中 ${state.liked} 題你們按了讚，這會影響大家看到的熱門排行。`
    : '這一疊沒有特別喜歡的，換個主題也許會更對味。';

  showScreen('end');
  sendFeedback();
}

async function sendFeedback() {
  if (state.pending.length === 0) {
    el.sendStatus.textContent = '';
    return;
  }

  const votes = state.pending;

  state.pending = [];
  el.sendStatus.textContent = '正在送出回饋…';

  try {
    await submitToAppsScript('deep-talk', { action: 'feedback', votes });
    el.sendStatus.textContent = '回饋收到了，謝謝。';
  } catch (error) {
    el.sendStatus.textContent = '回饋沒送出去，不影響你們剛剛聊的內容。';
  }
}

/*
 * 中途離開時把還沒送出的票補送。
 * 送不到也無所謂 —— 票數只是用來排序，不是必須完整的資料。
 */
function flushOnLeave() {
  if (state.pending.length === 0) return;

  const votes = state.pending;

  state.pending = [];
  beaconToAppsScript('deep-talk', { action: 'feedback', votes });
}

// ========================================
// 分享
// ========================================

function flashLabel(node, text, revert) {
  node.textContent = text;
  window.setTimeout(() => {
    node.textContent = revert;
  }, LABEL_FLASH_MS);
}

/*
 * 時事題複製出去要連摘要與出處一起帶走 ——
 * 貼到聊天室只有一句「如果房租再漲三成…」，對方會不知道在講哪件事。
 */
function shareText(card) {
  return [card.brief, card.text, card.sourceUrl].filter(Boolean).join('\n');
}

async function copyQuestion() {
  const text = shareText(state.deck[state.index]);

  try {
    await navigator.clipboard.writeText(text);
    flashLabel(el.copyLabel, '已複製', '複製題目');
  } catch (error) {
    // 剪貼簿 API 在非安全來源或權限被擋時會失敗，退回舊做法。
    const field = document.createElement('textarea');

    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();

    const copied = document.execCommand('copy');

    field.remove();
    flashLabel(el.copyLabel, copied ? '已複製' : '複製失敗', '複製題目');
  }
}

async function saveImage() {
  const card = state.deck[state.index];

  el.imageBtn.disabled = true;
  el.imageLabel.textContent = '產生中…';

  try {
    const blob = await renderQuestionCard(card);

    downloadBlob(blob, `deep-talk-${card.id}.png`);
    flashLabel(el.imageLabel, '已存下', '存成卡片');
  } catch (error) {
    flashLabel(el.imageLabel, '沒能產生', '存成卡片');
  } finally {
    el.imageBtn.disabled = false;
  }
}

// ========================================
// 熱門排行
// ========================================

let trendingFrom = 'setup';

async function showTrending() {
  trendingFrom = state.screen;
  el.rankList.replaceChildren();
  el.rankEmpty.hidden = false;
  el.rankEmpty.textContent = '載入中…';
  showScreen('trending');

  try {
    const result = await submitToAppsScript('deep-talk', {
      action: 'trending',
      limit: TRENDING_LIMIT
    });

    if (result.cards.length === 0) {
      el.rankEmpty.textContent = '還沒有累積到足夠的票數。去玩一疊，這裡就會長出來。';
      return;
    }

    el.rankEmpty.hidden = true;
    el.rankList.replaceChildren(...result.cards.map((card, index) => {
      const node = templates.rank.content.firstElementChild.cloneNode(true);
      const votes = card.likes + card.skips;

      node.querySelector('.rank-number').textContent = String(index + 1).padStart(2, '0');
      node.querySelector('.rank-question').textContent = card.text;
      node.querySelector('.rank-meta').textContent =
        `${Math.round((card.likes / votes) * 100)}% 說很讚 · ${votes} 票 · ${card.depth}`;

      return node;
    }));
  } catch (error) {
    el.rankEmpty.textContent = describeError(error);
  }
}

// ========================================
// 綁定
// ========================================

function bind() {
  // 重點同一顆只是「確認並繼續」，條件其實沒變，不該把暖場狀態一起洗掉。
  renderChoices(el.stageGrid, STAGES, 'stage', (value) => {
    if (value !== state.stage) {
      state.stage = value;
      state.warm = false; // 條件變了，下一疊要重新暖場。
      updateStageLabel();
    }

    window.setTimeout(() => showStep(2), 220);
  });

  renderChoices(el.depthGrid, DEPTHS, 'depth', (value) => {
    if (value !== state.depth) {
      state.depth = value;
      state.warm = false;
      updateStageLabel();
    }

    window.setTimeout(() => showStep(3), 220);
  });

  el.setupBack.addEventListener('click', () => showStep(Math.max(1, state.step - 1)));

  el.startBtn.addEventListener('click', () => {
    if (!state.stage || !state.depth) {
      el.setupError.textContent = '先回去把關係與深度選一選。';
      showStep(state.stage ? 2 : 1);
      return;
    }

    el.setupError.textContent = '';
    saveSetup();
    startDeck(state.warm);
  });

  el.likeBtn.addEventListener('click', () => vote('like'));
  el.skipBtn.addEventListener('click', () => vote('skip'));
  el.copyBtn.addEventListener('click', copyQuestion);
  el.imageBtn.addEventListener('click', saveImage);

  el.againBtn.addEventListener('click', () => startDeck(true));
  el.restartBtn.addEventListener('click', () => {
    state.warm = false;
    showStep(1);
    showScreen('setup');
  });

  el.toTrending.addEventListener('click', showTrending);
  el.trendingBack.addEventListener('click', () => showScreen(trendingFrom));

  el.retryBtn.addEventListener('click', () => state.retry?.());
  el.errorBack.addEventListener('click', () => {
    showStep(1);
    showScreen('setup');
  });

  // pagehide 在行動瀏覽器比 unload 可靠，桌機切分頁則靠 visibilitychange。
  window.addEventListener('pagehide', flushOnLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
  });
}

bind();
restoreSetup();
renderTopics();
updateStageLabel();
showStep(1);
