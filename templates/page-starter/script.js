// ========================================
// DOM
// ========================================

const demoForm = document.getElementById('demoForm');
const demoInput = document.getElementById('demoInput');
const demoError = document.getElementById('demoError');
const statusText = document.getElementById('statusText');

// ========================================
// Interaction
// ========================================

demoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = demoInput.value.trim();

  if (!value) {
    demoError.textContent = '請先輸入內容。';
    demoInput.focus();
    return;
  }

  demoError.textContent = '';
  statusText.textContent = `收到了：${value}`; // 只用 textContent 寫入，避免使用者輸入被當成 HTML。
});

demoInput.addEventListener('input', () => {
  if (demoInput.value.trim()) demoError.textContent = '';
});

// ========================================
// 需要把資料寫進 Google Sheet 時
// ========================================
//
// 1. 在 apps-script/ 建立 app-<作品名稱>.gs，實作 handle<作品名稱>(payload)
// 2. 在 apps-script/main.gs 的 routeRequest() 與 supportedApps() 各加一筆
// 3. 重新部署（管理部署作業 → 編輯 → 版本：新版本，網址不會變）
// 4. 前端改用下面的寫法，並把 <script> 改成 type="module"
//
// import { submitToAppsScript, describeSubmitError } from '../../shared/api.js';
//
// try {
//   await submitToAppsScript('page-starter', { schemaVersion: 1, value });
//   // 成功：Apps Script 已確認寫入
// } catch (error) {
//   console.error(error);
//   demoError.textContent = describeSubmitError(error);
// }
//
// submitToAppsScript 會處理逾時、跨網域與回應判讀。
// 送出期間記得停用按鈕，失敗時再解鎖讓使用者重試。
// 可參考 pages/invitation-card/script.js 的完整流程。
