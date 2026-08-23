/*
 * 邀請卡：把回覆寫進 Google Sheet 的 responses 工作表。
 *
 * 前端：pages/invitation-card/script.js
 * 說明：pages/invitation-card/README.md
 */

const INVITATION_SPREADSHEET_ID_PROPERTY = 'INVITATION_RESPONSES_SPREADSHEET_ID';
const INVITATION_SHEET_NAME = 'responses';
const INVITATION_SUPPORTED_SCHEMA_VERSIONS = [1];

function handleInvitationCard(payload) {
  const schemaVersion = normalizeInteger(payload.schemaVersion ?? 1, 'schema_version', 1, 999);

  // 只驗證資料結構版本，不限制前端的選項文案。
  if (!INVITATION_SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw requestError('unsupported_schema');
  }

  const invite = normalizeText(payload.invite, 40);
  const timing = normalizeText(payload.timing, 30);
  const page = normalizeText(payload.page, 500);
  const declineCount = normalizeInteger(payload.declineCount ?? 0, 'decline_count', 0, 100);
  const activities = normalizeTextList(payload.activities, 50, 10);

  if (!timing) {
    throw requestError('missing_timing');
  }

  if (activities.length === 0) {
    throw requestError('missing_activities');
  }

  const sheet = openSheet(INVITATION_SPREADSHEET_ID_PROPERTY, INVITATION_SHEET_NAME);

  appendRowSafely(sheet, [
    new Date(), // 使用伺服器時間，避免使用者修改裝置時間。
    invite || '未指定',
    declineCount,
    timing,
    activities.join('、'),
    page,
    schemaVersion
  ]);
}
