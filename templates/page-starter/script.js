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
// 目前每個作品各自呼叫 Apps Script。送出時要注意兩件事：
//
// 1. 用一般的 CORS 請求，並維持「簡單請求」
//    （Content-Type: text/plain;charset=utf-8），
//    否則瀏覽器會先送出 Apps Script 不支援的預檢而失敗。
// 2. Apps Script 驗證失敗時仍回傳 HTTP 200，
//    因此必須檢查 body 的 ok 欄位才知道有沒有真的寫入。
//
// 可參考 pages/invitation-card/script.js 的 sendInvitationResult()。
