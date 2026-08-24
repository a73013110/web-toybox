/*
 * 各作品共用的工具函式：回應格式、欄位驗證、試算表寫入與節流。
 * 這裡不放任何特定作品的邏輯。
 */

// ========================================
// 回應
// ========================================

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
 * 標記成「可以回報給前端的錯誤」。
 *
 * 用一般 Error 加旗標，而不是自訂 class：class 宣告不像函式宣告會被提升，
 * 跨 .gs 檔使用時可能還沒初始化。
 */
function requestError(code) {
  const error = new Error(code);
  error.isRequestError = true;
  return error;
}

// ========================================
// 欄位驗證
// ========================================

function normalizeText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeInteger(value, fieldName, min, max) {
  const number = Number(value);

  // 拒絕小數、負數與不合理的大值，避免寫入非預期內容。
  if (!Number.isInteger(number) || number < min || number > max) {
    throw requestError(`invalid_${fieldName}`);
  }

  return number;
}

function normalizeTextList(value, maxLength, maxItems) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

// ========================================
// 試算表
// ========================================

/*
 * 從指令碼屬性取得試算表 ID 並開啟指定工作表。
 * ID 不寫進程式碼，避免提交到公開儲存庫。
 */
function openSheet(spreadsheetIdProperty, sheetName) {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty(spreadsheetIdProperty);

  if (!spreadsheetId) {
    throw new Error(`缺少指令碼屬性：${spreadsheetIdProperty}`);
  }

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`找不到工作表：${sheetName}`);
  }

  return sheet;
}

/*
 * 防止使用者輸入被 Google Sheet 當成公式執行。
 * 以 = + - @ 開頭的字串加上前綴單引號後會被當成純文字。
 */
function toSheetText(value) {
  const text = String(value);

  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

/*
 * 寫入一列。字串會先做防公式注入處理，Date 與數字原樣寫入。
 * 用 LockService 序列化，避免多人同時送出時資料互相交錯。
 */
function appendRowSafely(sheet, values) {
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    sheet.appendRow(values.map((value) => (typeof value === 'string' ? toSheetText(value) : value)));
  } finally {
    lock.releaseLock();
  }
}

// ========================================
// 節流
// ========================================

/*
 * 以固定時間分桶計數：每分鐘換一把 key，計數自然歸零。
 *
 * 限制：
 * - Apps Script 讀不到用戶端 IP，這是全站共用的上限，不是針對個別使用者。
 * - 讀取後再寫入之間有競態，計數只是近似值。
 * 目的只是擋住暴衝把試算表灌爆或吃光配額，不是嚴謹的防濫用機制。
 */
function withinRateLimit(app) {
  const cache = CacheService.getScriptCache();
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rate:${app}:${bucket}`;
  const count = Number(cache.get(key) || 0) + 1;

  cache.put(key, String(count), 120); // 略長於一分鐘，讓過期時間涵蓋整個時間桶。

  return count <= RATE_LIMIT_PER_MINUTE;
}

// ========================================
// 快取
// ========================================

/*
 * CacheService 每個 key 上限 100KB。中文在 UTF-8 佔 3 bytes，
 * 因此以 30000 字為一塊，最壞情況約 90KB，仍在上限內。
 */
const CACHE_CHUNK_CHARS = 30000;

/*
 * 讀取先前快取的 JSON，沒有或已過期時回傳 null。
 *
 * 分塊儲存，任何一塊遺失就整份視為失效 —— 拼出半截 JSON 比重讀一次糟得多。
 * 少一塊之後通常也過不了 JSON.parse，但明確地判斷比依賴解析失敗可靠。
 */
function readCachedJson(key) {
  const cache = CacheService.getScriptCache();
  const chunkCount = Number(cache.get(`${key}:chunks`));

  if (!chunkCount) return null;

  let text = '';

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = cache.get(`${key}:${index}`);

    if (chunk === null) return null;

    text += chunk;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function writeCachedJson(key, value, ttlSeconds) {
  const text = JSON.stringify(value);
  const entries = {};
  let chunkCount = 0;

  for (let start = 0; start < text.length; start += CACHE_CHUNK_CHARS) {
    entries[`${key}:${chunkCount}`] = text.slice(start, start + CACHE_CHUNK_CHARS);
    chunkCount += 1;
  }

  entries[`${key}:chunks`] = String(chunkCount);

  CacheService.getScriptCache().putAll(entries, ttlSeconds);
}

function clearCachedJson(key) {
  const cache = CacheService.getScriptCache();
  const chunkCount = Number(cache.get(`${key}:chunks`)) || 0;
  const keys = [`${key}:chunks`];

  for (let index = 0; index < chunkCount; index += 1) {
    keys.push(`${key}:${index}`);
  }

  cache.removeAll(keys);
}

// ========================================
// 管理用動作
// ========================================

/*
 * 全站共用的 Gemini 設定。作品可以各自覆寫，但預設共用同一組。
 *
 * 共用而不是每個作品一把金鑰，是因為 Gemini 的速率限制綁在 Google Cloud 專案上，
 * 不是綁在金鑰上 —— 同一個專案底下開幾把金鑰都吃同一份額度，分開只是多一個要輪替
 * 的東西。而且所有作品共用同一個 Apps Script 專案與同一份指令碼屬性，金鑰真的外洩
 * 是整份一起沒，分開也縮不了爆炸半徑。
 *
 * 要真的隔離額度得開不同的 Cloud 專案，那是另一個層級的決定。
 */
const GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';
const GEMINI_MODEL_PROPERTY = 'GEMINI_MODEL';

/*
 * 讀設定：先看作品專屬的，沒有才用共用的。
 *
 * 留著作品專屬的覆寫，是為了讓「共用一把」這個決定可以反悔 ——
 * 哪天某個作品真的需要獨立的額度或計費，加一個屬性就好，不用改程式碼。
 */
function appOrSharedProperty(appProperty, sharedProperty) {
  const properties = PropertiesService.getScriptProperties();

  return properties.getProperty(appProperty) || properties.getProperty(sharedProperty);
}

/*
 * 驗證管理用密鑰。密鑰存在指令碼屬性，不寫進程式碼也不出現在前端。
 * 用於清快取、觸發 AI 生成這類只有作者該執行的動作。
 */
function requireAdminKey(provided, keyProperty) {
  const expected = PropertiesService.getScriptProperties().getProperty(keyProperty);

  if (!expected) {
    throw new Error(`缺少指令碼屬性：${keyProperty}`);
  }

  if (normalizeText(provided, 200) !== expected) {
    throw requestError('unauthorized');
  }
}

// ========================================
// 其他
// ========================================

/*
 * 帶權重的洗牌：權重高的比較容易排在前面，但不保證一定在前面。
 *
 * 用的是 Efraimidis-Spirakis 演算法 —— 每個元素抽一個 [0,1) 隨機數再開 1/w 次方
 * 當排序鍵，由大到小排。權重 w 的元素排在最前面的機率恰好正比於 w，
 * 這正是「偏好但不獨佔」要的效果：直接照權重排序會讓最新的那題每次都第一張。
 *
 * 權重全部相同時退化成一般的隨機洗牌，所以可以安全地取代 shuffled()。
 */
function weightedShuffle(items, weightOf) {
  return items
    .map((item) => {
      const weight = Math.max(weightOf(item), Number.MIN_VALUE);

      // Math.random() 可能回傳 0，取 0 的任何次方都是 0，會讓元素永遠墊底。
      return { item, key: Math.pow(Math.random() || Number.MIN_VALUE, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}
