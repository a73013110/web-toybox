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
