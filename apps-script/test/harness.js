/*
 * 在 Node 裡模擬 Apps Script 的執行環境，讓 .gs 的邏輯可以在本機測試。
 *
 * Apps Script 沒辦法在本機執行，正常只能「部署 → 手動送一筆 → 去試算表看」，
 * 而且測防公式注入、節流、長度上限這些路徑會在試算表留下垃圾資料。
 * 這個模擬器把 SpreadsheetApp 等全域物件換成假的，就能直接驗證。
 *
 * 用法：
 *   const gs = createGatewayHarness({ properties: { MY_SHEET_ID: 'x' }, sheets: ['responses'] });
 *   gs.post({ app: 'my-toy', payload: {} });   // → 已解析的 JSON 回應
 *   gs.rows('responses');                      // → 寫入的列
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const BUCKET_MS = 60_000;
// 從時間桶的邊界開始，測試才能明確控制「同一分鐘內」與「跨到下一分鐘」。
const DEFAULT_NOW = Math.floor(1_700_000_000_000 / BUCKET_MS) * BUCKET_MS;
const DEFAULT_CACHE_TTL_SECONDS = 600; // 與 Apps Script CacheService 的預設值一致。

export function createGatewayHarness({ properties = {}, sheets = [], now = DEFAULT_NOW } = {}) {
  const written = new Map(sheets.map((name) => [name, []]));
  let cache = {};
  let clock = now;

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  }

  const sandbox = {
    console: { error() {}, log() {}, warn() {} },
    Date: FakeDate,

    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({
        setMimeType() { return this; },
        getContent: () => text
      })
    },

    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key) => properties[key] ?? null })
    },

    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) =>
          written.has(name) ? { appendRow: (values) => written.get(name).push(values) } : null
      })
    },

    // 測試是單執行緒的，鎖不需要真的做事。
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },

    // 有實作存活時間：節流靠它讓計數過期，忽略 TTL 會讓相關的錯誤測不出來。
    CacheService: {
      getScriptCache: () => ({
        get: (key) => {
          const entry = cache[key];
          return entry && entry.expiresAt > clock ? entry.value : null;
        },
        put: (key, value, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS) => {
          cache[key] = { value, expiresAt: clock + ttlSeconds * 1000 };
        }
      })
    }
  };

  vm.createContext(sandbox);

  // Apps Script 會把所有 .gs 檔載入同一個全域範圍。
  // lib.gs 先載入，讓相依關係與線上一致。
  const files = readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.gs'))
    .sort((a, b) => (a === 'lib.gs' ? -1 : b === 'lib.gs' ? 1 : a.localeCompare(b)));

  for (const file of files) {
    vm.runInContext(readFileSync(join(SOURCE_DIR, file), 'utf8'), sandbox, { filename: file });
  }

  const call = (expression) => JSON.parse(vm.runInContext(expression, sandbox));

  return {
    /** 送出一筆 POST，回傳已解析的 JSON 回應。 */
    post: (body) =>
      call(`doPost({ postData: { contents: ${JSON.stringify(JSON.stringify(body))} } }).getContent()`),

    /** 呼叫健康檢查端點。 */
    get: () => call('doGet().getContent()'),

    /** 取得寫入指定工作表的所有列。 */
    rows: (sheetName) => written.get(sheetName) ?? [],

    /** 清空已寫入的列，方便下一個測項從乾淨狀態開始。 */
    clearRows: () => { for (const rows of written.values()) rows.length = 0; },

    /** 推進時間，用來測試以時間分桶的節流。 */
    advanceTime: (ms) => { clock += ms; },

    /** 載入的 .gs 檔清單，確認沒有漏掉。 */
    loadedFiles: files
  };
}
