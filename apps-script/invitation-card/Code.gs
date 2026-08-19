const SPREADSHEET_ID_PROPERTY = 'INVITATION_RESPONSES_SPREADSHEET_ID'; // 從 Apps Script 指令碼屬性讀取，不把試算表 ID 提交到公開儲存庫。
const SHEET_NAME = 'responses'; // 寫入的工作表名稱。
const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const data = JSON.parse(e.postData?.contents || '{}');
    const schemaVersion = normalizeInteger(data.schemaVersion ?? 1, '資料版本', 1, 999);
    const invite = normalizeText(data.invite, 40);
    const timing = normalizeText(data.timing, 30);
    const page = normalizeText(data.page, 500);
    const declineCount = normalizeInteger(data.declineCount ?? 0, '先不要點擊次數', 0, 100);
    const activities = Array.isArray(data.activities)
      ? data.activities
          .map((item) => normalizeText(item, 50))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // 只驗證資料結構版本，不限制前端選項文案。
    if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
      throw new Error('不支援的資料格式');
    }

    if (!timing) {
      throw new Error('沒有選擇時間');
    }

    if (activities.length === 0) {
      throw new Error('沒有選擇活動');
    }

    const spreadsheetId = PropertiesService
      .getScriptProperties()
      .getProperty(SPREADSHEET_ID_PROPERTY);

    if (!spreadsheetId) {
      throw new Error(`缺少指令碼屬性：${SPREADSHEET_ID_PROPERTY}`);
    }

    const sheet = SpreadsheetApp
      .openById(spreadsheetId)
      .getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error(`找不到工作表：${SHEET_NAME}`);
    }

    lock.waitLock(10000); // 避免多人同時送出時資料互相交錯。

    try {
      sheet.appendRow([
        new Date(), // 使用伺服器時間，避免使用者修改裝置時間。
        toSheetText(invite || '未指定'),
        declineCount,
        toSheetText(timing),
        toSheetText(activities.join('、')),
        toSheetText(page),
        schemaVersion
      ]);
    } finally {
      lock.releaseLock();
    }

    return createResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return createResponse({ ok: false, error: 'invalid_request' });
  }
}

function normalizeText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeInteger(value, fieldName, min, max) {
  const number = Number(value);

  // 拒絕小數、負數與不合理的大值，避免寫入非預期內容。
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${fieldName}格式錯誤`);
  }

  return number;
}

function toSheetText(value) {
  const text = String(value);

  // 防止使用者輸入被 Google Sheet 當成公式執行。
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
