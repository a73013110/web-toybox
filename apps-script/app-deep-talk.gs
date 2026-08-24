/*
 * Deep Talk 問題產生器：題庫存在 Google Sheet，這裡負責發牌、收回饋與熱門排行。
 *
 * 前端：pages/deep-talk/script.js
 * 說明：pages/deep-talk/README.md
 *
 * 題庫唯一的真相來源是試算表，改題目不需要動這份程式碼，也不需要重新部署。
 * 為了避免每次抽牌都重讀試算表，整份題庫會快取數分鐘；
 * 改完試算表想立刻生效，用 flush 動作清掉快取。
 */

const DEEPTALK_SPREADSHEET_ID_PROPERTY = 'DEEP_TALK_SPREADSHEET_ID';
const DEEPTALK_ADMIN_KEY_PROPERTY = 'DEEP_TALK_ADMIN_KEY';
const DEEPTALK_SHEET_NAME = 'questions';

const DEEPTALK_CACHE_KEY = 'deep-talk:questions';
const DEEPTALK_CACHE_SECONDS = 300;

const DEEPTALK_DECK_SIZE = 8;
const DEEPTALK_MAX_VOTES = 40;
const DEEPTALK_TRENDING_SIZE = 20;
const DEEPTALK_TRENDING_MAX = 50;

// 票數太少時比例不可信，排行用貝氏平均往 0.5 拉，需要足夠票數才能爬上去。
const DEEPTALK_MIN_VOTES_TO_RANK = 3;
const DEEPTALK_RANK_PRIOR = 5;

// 被跳過的比例過高代表題目本身有問題（尷尬、看不懂、重複），自動停止出牌。
const DEEPTALK_MIN_VOTES_TO_RETIRE = 10;
const DEEPTALK_MAX_SKIP_RATIO = 0.6;

// 試算表欄位順序，1 起算。調整欄位時只需要改這裡。
const DEEPTALK_COLUMN = {
  id: 1,
  text: 2,
  topics: 3,
  depth: 4,
  stages: 5,
  live: 6,
  source: 7,
  createdAt: 8,
  likes: 9,
  skips: 10
};

/** 由淺到深。順序決定發牌的爬坡曲線，也決定深度上限涵蓋哪些層級。 */
function deepTalkDepths() {
  return ['破冰', '認識', '深入', '坦白'];
}

/*
 * 一疊 8 張的組成。
 *
 * 使用者選的深度是「這疊最深到哪」，不是「每張都這麼深」——
 * 第一張就丟最私密的問題沒有人接得住，前面幾張輕鬆的題目是在暖場。
 *
 * warm 代表這不是今天的第一疊，暖場已經做過了，直接往深的地方去。
 */
function deepTalkDeckPlan(depth, warm) {
  if (warm) {
    switch (depth) {
      case '破冰': return [['破冰', 8]];
      case '認識': return [['認識', 8]];
      case '深入': return [['認識', 2], ['深入', 6]];
      case '坦白': return [['深入', 3], ['坦白', 5]];
      default: return null;
    }
  }

  switch (depth) {
    case '破冰': return [['破冰', 8]];
    case '認識': return [['破冰', 3], ['認識', 5]];
    case '深入': return [['破冰', 2], ['認識', 3], ['深入', 3]];
    case '坦白': return [['破冰', 1], ['認識', 2], ['深入', 3], ['坦白', 2]];
    default: return null;
  }
}

function handleDeepTalk(payload) {
  const action = normalizeText(payload.action, 20);

  switch (action) {
    case 'deck':
      return deepTalkDeck(payload);
    case 'feedback':
      return deepTalkFeedback(payload);
    case 'trending':
      return deepTalkTrending(payload);
    case 'flush':
      return deepTalkFlush(payload);
    case 'followup':
      return deepTalkFollowup(payload); // app-deep-talk-ai.gs
    case 'followup-history':
      return deepTalkFollowupHistory(payload); // app-deep-talk-ai.gs
    case 'generate':
      return deepTalkGenerateAction(payload); // app-deep-talk-ai.gs
    default:
      throw requestError('unknown_action');
  }
}

// ========================================
// 題庫讀取
// ========================================

/*
 * 讀出所有已上架的題目。
 *
 * 試算表讀取要數百毫秒又計入配額，因此整份結果會快取；
 * 快取內容只包含前端會用到的欄位，順便避免把來源、建立時間這類欄位外流。
 */
function deepTalkQuestions() {
  const cached = readCachedJson(DEEPTALK_CACHE_KEY);

  if (cached) return cached;

  const sheet = openSheet(DEEPTALK_SPREADSHEET_ID_PROPERTY, DEEPTALK_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const questions = [];

  // 第一列是標題列。
  for (let index = 1; index < values.length; index += 1) {
    const question = deepTalkParseRow(values[index]);

    if (question) questions.push(question);
  }

  writeCachedJson(DEEPTALK_CACHE_KEY, questions, DEEPTALK_CACHE_SECONDS);

  return questions;
}

function deepTalkParseRow(row) {
  const cell = (column) => row[column - 1];
  const id = normalizeText(cell(DEEPTALK_COLUMN.id), 20);
  const text = normalizeText(cell(DEEPTALK_COLUMN.text), 200);

  if (!id || !text) return null;
  if (!deepTalkIsLive(cell(DEEPTALK_COLUMN.live))) return null;

  return {
    id,
    text,
    topics: deepTalkSplitTags(cell(DEEPTALK_COLUMN.topics)),
    depth: normalizeText(cell(DEEPTALK_COLUMN.depth), 10),
    stages: deepTalkSplitTags(cell(DEEPTALK_COLUMN.stages)),
    likes: Math.max(0, Math.trunc(Number(cell(DEEPTALK_COLUMN.likes))) || 0),
    skips: Math.max(0, Math.trunc(Number(cell(DEEPTALK_COLUMN.skips))) || 0)
  };
}

/** 「上架」欄可能是核取方塊（布林）或手打的文字，兩種都接受。 */
function deepTalkIsLive(value) {
  if (value === true) return true;

  const text = String(value ?? '').trim().toLowerCase();

  return text === 'true' || text === 'yes' || text === 'y' || text === '1' || text === '是';
}

/** 多值欄位以頓號分隔，容忍半形逗號與多餘空白。 */
function deepTalkSplitTags(value) {
  return String(value ?? '')
    .split(/[、,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function deepTalkIsRetired(question) {
  const votes = question.likes + question.skips;

  return votes >= DEEPTALK_MIN_VOTES_TO_RETIRE && question.skips / votes > DEEPTALK_MAX_SKIP_RATIO;
}

// ========================================
// 發牌
// ========================================

function deepTalkDeck(payload) {
  const stage = normalizeText(payload.stage, 20);
  const depth = normalizeText(payload.depth, 10);
  const plan = deepTalkDeckPlan(depth, payload.warm === true);

  if (!plan) {
    throw requestError('invalid_depth');
  }

  const preferSet = deepTalkToSet(normalizeTextList(payload.prefer, 20, 20));
  const excludeSet = deepTalkToSet(normalizeTextList(payload.exclude, 20, 20));
  const seenSet = deepTalkToSet(normalizeTextList(payload.seen, 20, 300));

  const pool = deepTalkQuestions().filter((question) =>
    !seenSet[question.id] &&
    !deepTalkIsRetired(question) &&
    // 沒有標記適用階段的題目視為通用。
    (!stage || question.stages.length === 0 || question.stages.indexOf(stage) >= 0) &&
    !question.topics.some((topic) => excludeSet[topic])
  );

  const deck = deepTalkBuildDeck(pool, plan, preferSet);

  return {
    cards: deck.map((question) => ({
      id: question.id,
      text: question.text,
      topics: question.topics,
      depth: question.depth,
      likes: question.likes,
      skips: question.skips
    })),
    // 讓前端知道還抽不抽得出下一疊。
    remaining: pool.length - deck.length
  };
}

function deepTalkBuildDeck(pool, plan, preferSet) {
  const used = {};
  const deck = [];

  const take = (depth, count) => {
    if (count <= 0) return;

    const layer = pool.filter((question) => question.depth === depth && !used[question.id]);
    const preferred = (question) => question.topics.some((topic) => preferSet[topic]);

    // 想聊的主題排在前面，其餘的接在後面 —— 主題不夠出牌時仍然能湊滿一疊。
    const ordered = shuffled(layer.filter(preferred))
      .concat(shuffled(layer.filter((question) => !preferred(question))));

    for (const question of ordered.slice(0, count)) {
      used[question.id] = true;
      deck.push(question);
    }
  };

  for (const step of plan) {
    take(step[0], step[1]);
  }

  // 某一層題目不夠時，用計畫涵蓋的其他層級補滿。
  // 只補計畫裡出現過的層級，絕不超過使用者設定的深度上限。
  for (const step of plan) {
    take(step[0], DEEPTALK_DECK_SIZE - deck.length);
  }

  // 補牌會打亂順序，重新排回由淺到深，暖場的爬坡才成立。
  const order = deepTalkDepths();

  return deck.sort((a, b) => order.indexOf(a.depth) - order.indexOf(b.depth));
}

function deepTalkToSet(items) {
  const set = {};

  for (const item of items) {
    set[item] = true;
  }

  return set;
}

// ========================================
// 回饋
// ========================================

/*
 * 一場結束時一次回報整疊的讚／跳過。
 *
 * 同一個 id 在一次請求裡最多各加一票，避免一個請求就把票數灌上去；
 * 更根本的限制是 main.gs 的全站節流。票數只用來排序與淘汰題目，
 * 不是需要嚴格防偽的資料。
 */
function deepTalkFeedback(payload) {
  const votes = Array.isArray(payload.votes) ? payload.votes : [];

  if (votes.length === 0) {
    throw requestError('missing_votes');
  }

  if (votes.length > DEEPTALK_MAX_VOTES) {
    throw requestError('too_many_votes');
  }

  const tally = {};

  for (const vote of votes) {
    const id = normalizeText(vote && vote.id, 20);
    const kind = normalizeText(vote && vote.vote, 10);

    if (!id || (kind !== 'like' && kind !== 'skip')) continue;

    if (!tally[id]) tally[id] = { like: 0, skip: 0 };

    tally[id][kind] = 1;
  }

  if (Object.keys(tally).length === 0) {
    throw requestError('missing_votes');
  }

  return { counted: deepTalkApplyVotes(tally) };
}

function deepTalkApplyVotes(tally) {
  const sheet = openSheet(DEEPTALK_SPREADSHEET_ID_PROPERTY, DEEPTALK_SHEET_NAME);
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();

    // 只有標題列。
    if (lastRow < 2) return 0;

    const rowCount = lastRow - 1;
    const ids = sheet.getRange(2, DEEPTALK_COLUMN.id, rowCount, 1).getValues();
    // 讚與跳過相鄰，整段讀出來改完再一次寫回，省下每一票各一次 API 呼叫。
    const counts = sheet.getRange(2, DEEPTALK_COLUMN.likes, rowCount, 2).getValues();
    let counted = 0;

    for (let index = 0; index < rowCount; index += 1) {
      const vote = tally[normalizeText(ids[index][0], 20)];

      if (!vote) continue;

      counts[index][0] = (Number(counts[index][0]) || 0) + vote.like;
      counts[index][1] = (Number(counts[index][1]) || 0) + vote.skip;
      counted += 1;
    }

    if (counted > 0) {
      sheet.getRange(2, DEEPTALK_COLUMN.likes, rowCount, 2).setValues(counts);
    }

    return counted;
  } finally {
    lock.releaseLock();
  }
}

// ========================================
// 熱門排行
// ========================================

/*
 * 熱門度來自真實使用者投票，不是 AI 猜的。
 *
 * 直接用讚數排序會讓上架久的題目永遠佔前排，用純比例則會讓「一讚零跳過」
 * 衝到 100%。這裡用貝氏平均：票數少的往 0.5 拉，要同時有高比例與足夠票數才排得上。
 */
function deepTalkTrending(payload) {
  const limit = deepTalkClamp(payload.limit, 1, DEEPTALK_TRENDING_MAX, DEEPTALK_TRENDING_SIZE);

  const ranked = deepTalkQuestions()
    .filter((question) =>
      !deepTalkIsRetired(question) &&
      question.likes + question.skips >= DEEPTALK_MIN_VOTES_TO_RANK)
    .map((question) => ({ question, score: deepTalkScore(question) }))
    .sort((a, b) => b.score - a.score || b.question.likes - a.question.likes)
    .slice(0, limit);

  return {
    cards: ranked.map((entry) => ({
      id: entry.question.id,
      text: entry.question.text,
      topics: entry.question.topics,
      depth: entry.question.depth,
      likes: entry.question.likes,
      skips: entry.question.skips
    }))
  };
}

function deepTalkScore(question) {
  const votes = question.likes + question.skips;

  return (question.likes + DEEPTALK_RANK_PRIOR * 0.5) / (votes + DEEPTALK_RANK_PRIOR);
}

function deepTalkClamp(value, min, max, fallback) {
  const number = Math.trunc(Number(value));

  if (!Number.isFinite(number) || number < min) return fallback;

  return Math.min(number, max);
}

// ========================================
// 管理
// ========================================

/*
 * 清掉題庫快取。改完試算表想立刻生效時用，需要管理密鑰。
 * 平常不需要 —— 快取本來就會在幾分鐘內過期。
 */
function deepTalkFlush(payload) {
  requireAdminKey(payload.key, DEEPTALK_ADMIN_KEY_PROPERTY);
  clearCachedJson(DEEPTALK_CACHE_KEY);
  clearCachedJson(DEEPTALK_FOLLOWUP_CACHE_KEY); // 在試算表上下架某一則追問時也要立刻生效。

  return { flushed: true };
}
