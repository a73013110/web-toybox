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
 *   gs.rows('responses');                      // → 工作表目前的內容
 *
 * 需要預先放資料的工作表（例如題庫）改用物件形式：
 *   createGatewayHarness({ sheets: { questions: [['id', '題目'], ['q1', '你好嗎？']] } })
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

/*
 * 預設用固定種子的偽亂數，讓有洗牌的邏輯（例如發牌）每次跑出同樣結果。
 * 需要特定順序的測項可以自己傳一個 random 進來。
 */
function createSeededRandom(seed = 20260823) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

/*
 * 一張假的工作表。以二維陣列存內容，支援 Apps Script 常用的整段讀寫，
 * 列與欄都是 1 起算，跟真的 Range 一致。
 */
function createFakeSheet(data) {
  const columnCount = () => data.reduce((max, row) => Math.max(max, row.length), 0);

  const range = (row, column, numRows, numColumns) => ({
    getValues: () =>
      Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numColumns }, (_, c) => data[row - 1 + r]?.[column - 1 + c] ?? '')),

    setValues: (values) => {
      values.forEach((rowValues, r) => {
        const target = (data[row - 1 + r] ||= []);

        rowValues.forEach((value, c) => {
          target[column - 1 + c] = value;
        });
      });
    }
  });

  return {
    appendRow: (values) => data.push([...values]),
    getLastRow: () => data.length,
    getLastColumn: columnCount,
    getDataRange: () => range(1, 1, data.length, columnCount()),
    getRange: range
  };
}

export function createGatewayHarness({
  properties = {},
  sheets = [],
  now = DEFAULT_NOW,
  random = createSeededRandom()
} = {}) {
  const seeded = Array.isArray(sheets)
    ? Object.fromEntries(sheets.map((name) => [name, []]))
    : sheets;

  // 深拷貝，讓同一份種子資料可以餵給多個 harness 而互不影響。
  const tables = new Map(
    Object.entries(seeded).map(([name, rows]) => [name, rows.map((row) => [...row])])
  );

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

  const scriptCache = {
    get: (key) => {
      const entry = cache[key];

      return entry && entry.expiresAt > clock ? entry.value : null;
    },
    put: (key, value, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS) => {
      cache[key] = { value, expiresAt: clock + ttlSeconds * 1000 };
    },
    putAll: (entries, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS) => {
      for (const [key, value] of Object.entries(entries)) {
        scriptCache.put(key, value, ttlSeconds);
      }
    },
    removeAll: (keys) => {
      for (const key of keys) delete cache[key];
    }
  };

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
        getSheetByName: (name) => (tables.has(name) ? createFakeSheet(tables.get(name)) : null)
      })
    },

    // 測試是單執行緒的，鎖不需要真的做事。
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },

    // 有實作存活時間：節流靠它讓計數過期，忽略 TTL 會讓相關的錯誤測不出來。
    CacheService: { getScriptCache: () => scriptCache }
  };

  vm.createContext(sandbox);

  // Math 屬於執行環境自帶的內建物件，沒辦法從 sandbox 直接換掉，只能載入後覆寫。
  sandbox.__random = random;
  vm.runInContext('Math.random = __random;', sandbox);

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

    /** 取得指定工作表目前的所有列（包含預先放入的種子資料）。 */
    rows: (sheetName) => tables.get(sheetName) ?? [],

    /** 清空所有工作表，方便下一個測項從乾淨狀態開始。 */
    clearRows: () => { for (const rows of tables.values()) rows.length = 0; },

    /** 清空快取，用來驗證「快取失效後重讀試算表」的路徑。 */
    clearCache: () => { cache = {}; },

    /*
     * 刪掉單一個快取 key。
     * CacheService 不保證整批寫入的內容會一起存活，用來模擬只掉了其中一塊的情況。
     */
    dropCacheKey: (key) => { delete cache[key]; },

    /** 推進時間，用來測試以時間分桶的節流與快取過期。 */
    advanceTime: (ms) => { clock += ms; },

    /** 載入的 .gs 檔清單，確認沒有漏掉。 */
    loadedFiles: files
  };
}
