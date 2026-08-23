/*
 * apps-script/ 的回歸測試。
 *
 * 執行：npm test
 *
 * 新增作品時，複製「邀請卡」那幾個 describe 的寫法建立自己的區塊，
 * 至少涵蓋：欄位驗證失敗時不寫入、長度上限、以及該作品特有的規則。
 */

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayHarness } from './harness.js';

const SPREADSHEET_ID_PROPERTY = 'INVITATION_RESPONSES_SPREADSHEET_ID';
const RATE_LIMIT_PER_MINUTE = 60; // 需與 main.gs 一致。

const VALID_INVITATION = {
  schemaVersion: 1,
  invite: 'amy',
  declineCount: 2,
  timing: '深夜限定',
  activities: ['散步', '用餐'],
  page: 'https://example.com/x'
};

let gs;

beforeEach(() => {
  gs = createGatewayHarness({
    properties: { [SPREADSHEET_ID_PROPERTY]: 'FAKE_SPREADSHEET_ID' },
    sheets: ['responses']
  });
});

const submit = (payload) => gs.post({ app: 'invitation-card', payload });

describe('載入', () => {
  test('所有 .gs 檔都被載入，lib.gs 在最前面', () => {
    assert.equal(gs.loadedFiles[0], 'lib.gs');
    assert.deepEqual(
      [...gs.loadedFiles].sort(),
      ['app-deep-talk.gs', 'app-invitation-card.gs', 'lib.gs', 'main.gs']
    );
  });
});

describe('健康檢查', () => {
  test('doGet 列出目前支援的作品', () => {
    assert.deepEqual(gs.get(), {
      ok: true,
      service: 'web-toybox',
      apps: ['invitation-card', 'deep-talk']
    });
  });

  test('doGet 不會寫入任何資料', () => {
    gs.get();
    assert.equal(gs.rows('responses').length, 0);
  });
});

describe('路由', () => {
  test('已註冊的作品會寫入一列', () => {
    assert.deepEqual(submit(VALID_INVITATION), { ok: true });
    assert.equal(gs.rows('responses').length, 1);
  });

  test('未知的作品被拒絕', () => {
    assert.deepEqual(gs.post({ app: 'nope', payload: {} }), { ok: false, error: 'unknown_app' });
  });

  test('缺少 app 欄位被拒絕', () => {
    assert.deepEqual(gs.post({ payload: VALID_INVITATION }), { ok: false, error: 'unknown_app' });
  });

  test('空的 body 被拒絕', () => {
    assert.deepEqual(gs.post({}), { ok: false, error: 'unknown_app' });
  });

  test('被拒絕時不寫入任何資料', () => {
    gs.post({ app: 'nope', payload: {} });
    gs.post({});
    assert.equal(gs.rows('responses').length, 0);
  });
});

describe('邀請卡：寫入內容', () => {
  test('欄位順序與試算表標題一致', () => {
    submit(VALID_INVITATION);
    const [receivedAt, ...rest] = gs.rows('responses')[0];

    assert.ok(receivedAt instanceof Date, '第一欄應該是伺服器時間');
    assert.deepEqual(rest, ['amy', 2, '深夜限定', '散步、用餐', 'https://example.com/x', 1]);
  });

  test('沒有指定對象時填入預設值', () => {
    submit({ ...VALID_INVITATION, invite: '' });
    assert.equal(gs.rows('responses')[0][1], '未指定');
  });

  test('活動以頓號串接', () => {
    submit({ ...VALID_INVITATION, activities: ['a', 'b', 'c'] });
    assert.equal(gs.rows('responses')[0][4], 'a、b、c');
  });
});

describe('邀請卡：欄位驗證', () => {
  const cases = [
    ['缺少 timing', { timing: '' }, 'missing_timing'],
    ['timing 只有空白', { timing: '   ' }, 'missing_timing'],
    ['activities 是空陣列', { activities: [] }, 'missing_activities'],
    ['activities 不是陣列', { activities: 'x' }, 'missing_activities'],
    ['activities 只有空字串', { activities: ['', '  '] }, 'missing_activities'],
    ['不支援的 schema', { schemaVersion: 99 }, 'unsupported_schema'],
    ['declineCount 是小數', { declineCount: 1.5 }, 'invalid_decline_count'],
    ['declineCount 是負數', { declineCount: -1 }, 'invalid_decline_count'],
    ['declineCount 超出上限', { declineCount: 101 }, 'invalid_decline_count'],
    ['declineCount 不是數字', { declineCount: 'x' }, 'invalid_decline_count']
  ];

  for (const [label, override, expected] of cases) {
    test(label + ' → ' + expected, () => {
      assert.deepEqual(submit({ ...VALID_INVITATION, ...override }), { ok: false, error: expected });
      assert.equal(gs.rows('responses').length, 0, '驗證失敗時不應寫入');
    });
  }

  test('省略 schemaVersion 時預設為 1', () => {
    const { schemaVersion, ...withoutVersion } = VALID_INVITATION;
    assert.deepEqual(submit(withoutVersion), { ok: true });
    assert.equal(gs.rows('responses')[0][6], 1);
  });

  test('省略 declineCount 時預設為 0', () => {
    const { declineCount, ...withoutCount } = VALID_INVITATION;
    submit(withoutCount);
    assert.equal(gs.rows('responses')[0][2], 0);
  });
});

describe('邀請卡：長度與數量上限', () => {
  test('對象代號截到 40 字', () => {
    submit({ ...VALID_INVITATION, invite: 'x'.repeat(200) });
    assert.equal(gs.rows('responses')[0][1].length, 40);
  });

  test('活動最多 10 項', () => {
    submit({ ...VALID_INVITATION, activities: Array(30).fill('項目') });
    assert.equal(gs.rows('responses')[0][4].split('、').length, 10);
  });

  test('單一活動截到 50 字', () => {
    submit({ ...VALID_INVITATION, activities: ['y'.repeat(120)] });
    assert.equal(gs.rows('responses')[0][4].length, 50);
  });

  test('頁面網址截到 500 字', () => {
    submit({ ...VALID_INVITATION, page: 'p'.repeat(999) });
    assert.equal(gs.rows('responses')[0][5].length, 500);
  });
});

describe('防公式注入', () => {
  for (const prefix of ['=', '+', '-', '@']) {
    test('以 ' + prefix + ' 開頭的輸入會被加上前綴單引號', () => {
      submit({ ...VALID_INVITATION, invite: prefix + 'HYPERLINK("evil")' });
      assert.equal(gs.rows('responses')[0][1], "'" + prefix + 'HYPERLINK("evil")');
    });
  }

  test('活動欄位同樣受保護', () => {
    submit({ ...VALID_INVITATION, activities: ['@SUM(A1)'] });
    assert.equal(gs.rows('responses')[0][4], "'@SUM(A1)");
  });

  test('一般文字不會被加上引號', () => {
    submit(VALID_INVITATION);
    assert.equal(gs.rows('responses')[0][1], 'amy');
  });

  test('數字與日期不會被轉成字串', () => {
    submit(VALID_INVITATION);
    const row = gs.rows('responses')[0];

    assert.equal(typeof row[2], 'number', 'declineCount 應維持數字');
    assert.equal(typeof row[6], 'number', 'schemaVersion 應維持數字');
    assert.ok(row[0] instanceof Date, '時間應維持 Date');
  });
});

describe('節流', () => {
  test('第 ' + RATE_LIMIT_PER_MINUTE + ' 筆仍可通過', () => {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) submit(VALID_INVITATION);
    assert.equal(gs.rows('responses').length, RATE_LIMIT_PER_MINUTE);
  });

  test('超過上限後被擋下且不寫入', () => {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) submit(VALID_INVITATION);
    assert.deepEqual(submit(VALID_INVITATION), { ok: false, error: 'rate_limited' });
    assert.equal(gs.rows('responses').length, RATE_LIMIT_PER_MINUTE);
  });

  test('進入下一分鐘後恢復', () => {
    for (let i = 0; i <= RATE_LIMIT_PER_MINUTE; i += 1) submit(VALID_INVITATION);
    gs.advanceTime(60_000);
    assert.deepEqual(submit(VALID_INVITATION), { ok: true });
  });

  test('計數的存活時間涵蓋整個時間桶', () => {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) submit(VALID_INVITATION);
    gs.advanceTime(59_000); // 仍在同一分鐘內

    // 快取存活時間若短於時間桶，計數會提早歸零，節流就形同虛設。
    assert.deepEqual(submit(VALID_INVITATION), { ok: false, error: 'rate_limited' });
  });
});

describe('內部錯誤不外洩細節', () => {
  test('缺少指令碼屬性時只回傳 invalid_request', () => {
    const broken = createGatewayHarness({ properties: {}, sheets: ['responses'] });

    assert.deepEqual(
      broken.post({ app: 'invitation-card', payload: VALID_INVITATION }),
      { ok: false, error: 'invalid_request' }
    );
  });

  test('找不到工作表時只回傳 invalid_request', () => {
    const broken = createGatewayHarness({
      properties: { [SPREADSHEET_ID_PROPERTY]: 'FAKE' },
      sheets: ['wrong-name']
    });

    assert.deepEqual(
      broken.post({ app: 'invitation-card', payload: VALID_INVITATION }),
      { ok: false, error: 'invalid_request' }
    );
  });
});
