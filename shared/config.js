/*
 * 後端設定。
 *
 * 這是 Apps Script Web App 的正式部署網址。它會出現在瀏覽器端程式碼中，
 * 不是私密金鑰 —— 任何人都能對它送出請求，因此所有驗證一律在 Apps Script 端做。
 *
 * 更新 .gs 程式後，若用「管理部署作業 → 編輯（鉛筆）→ 版本：新版本」重新部署，
 * 這個網址不會變，不需要動這個檔案。
 * 只有在「新增部署作業」建立全新部署時才會拿到新網址。
 *
 * 部署與遷移步驟見 apps-script/README.md。
 */
export const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycby-Do-rPfjTh9s45SBwuAY0H55DpOI6hoVPo8QPghnk45b1xtN_CtpYYUHUeWmmwCWKFg/exec';

// 送出請求的預設逾時。Apps Script 冷啟動可能要數秒，不要設太短。
export const SUBMIT_TIMEOUT_MS = 30000;
