/*
 * Deep Talk 題庫的回歸測試。
 *
 * 執行：npm test
 *
 * 這個作品的邏輯幾乎都在「挑哪幾題」上：爬坡曲線、主題偏好、快取。
 * 這些在正式環境很難觀察（要一直重抽才看得出分佈），所以測試寫得比較密。
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayHarness } from './harness.js';

const SPREADSHEET_ID_PROPERTY = 'DEEP_TALK_SPREADSHEET_ID';
const ADMIN_KEY_PROPERTY = 'DEEP_TALK_ADMIN_KEY';
const ADMIN_KEY = 'let-me-in';

const DECK_SIZE = 8; // 需與 app-deep-talk.gs 一致。
const CACHE_SECONDS = 300;
const DEPTHS = ['破冰', '認識', '深入', '坦白'];

const HEADER = ['id', '題目', '主題標籤', '深度', '關係階段', '上架', '來源', '建立時間', '讚', '跳過',
                '時事摘要', '出處', '時事日期'];

const COLUMN = { id: 0, text: 1, topics: 2, depth: 3, stages: 4, live: 5, likes: 8, skips: 9 };

function row(id, overrides = {}) {
  const question = {
    text: `題目 ${id}`,
    topics: '日常小習慣',
    depth: '破冰',
    stages: '',
    live: true,
    likes: 0,
    skips: 0,
    ...overrides
  };

  return [
    id,
    question.text,
    question.topics,
    question.depth,
    question.stages,
    question.live,
    'AI',
    '2026-08-23',
    question.likes,
    question.skips
  ];
}

/** 每一層深度各 12 題，足夠任何一種發牌計畫抽滿一疊。 */
const BALANCED = DEPTHS.flatMap((depth, index) =>
  Array.from({ length: 12 }, (_, n) => row(`${'abcd'[index]}${n}`, { depth })));

function makeHarness(rows = BALANCED, options = {}) {
  const { properties, ...rest } = options;

  return createGatewayHarness({
    properties: {
      [SPREADSHEET_ID_PROPERTY]: 'FAKE_SPREADSHEET_ID',
      [ADMIN_KEY_PROPERTY]: ADMIN_KEY,
      ...properties
    },
    sheets: { questions: [HEADER, ...rows] },
    ...rest
  });
}

const ask = (gs, payload) => gs.post({ app: 'deep-talk', payload });

const deck = (gs, payload = {}) => ask(gs, { action: 'deck', depth: '破冰', ...payload });

/** 一疊牌的深度組成，例如 { 破冰: 2, 認識: 3, 深入: 3 }。 */
function composition(cards) {
  const counts = {};

  for (const card of cards) {
    counts[card.depth] = (counts[card.depth] ?? 0) + 1;
  }

  return counts;
}

describe('Deep Talk：路由', () => {
  test('未知的 action 被拒絕', () => {
    assert.deepEqual(ask(makeHarness(), { action: 'nope' }), { ok: false, error: 'unknown_action' });
  });

  test('沒有 action 被拒絕', () => {
    assert.deepEqual(ask(makeHarness(), {}), { ok: false, error: 'unknown_action' });
  });
});

describe('Deep Talk：發牌的爬坡曲線', () => {
  const plans = [
    ['破冰', { 破冰: 8 }],
    ['認識', { 破冰: 3, 認識: 5 }],
    ['深入', { 破冰: 2, 認識: 3, 深入: 3 }],
    ['坦白', { 破冰: 1, 認識: 2, 深入: 3, 坦白: 2 }]
  ];

  for (const [depth, expected] of plans) {
    test(`深度上限 ${depth} 的組成`, () => {
      const result = deck(makeHarness(), { depth });

      assert.equal(result.cards.length, DECK_SIZE);
      assert.deepEqual(composition(result.cards), expected);
    });
  }

  test('牌序一定由淺到深', () => {
    const result = deck(makeHarness(), { depth: '坦白' });
    const ranks = result.cards.map((card) => DEPTHS.indexOf(card.depth));

    for (let index = 1; index < ranks.length; index += 1) {
      assert.ok(ranks[index] >= ranks[index - 1], `第 ${index + 1} 張比前一張淺`);
    }
  });

  test('每次發牌抽到的組合會不一樣', () => {
    const rows = Array.from({ length: 30 }, (_, n) => row(`q${n}`));
    const gs = makeHarness(rows);
    const first = deck(gs).cards.map((card) => card.id);
    const second = deck(gs).cards.map((card) => card.id);

    assert.notDeepEqual(first, second, '沒有洗牌的話每次都會抽到同樣的前八題');
  });

  test('絕不會出現超過深度上限的題目', () => {
    const result = deck(makeHarness(), { depth: '認識' });

    assert.ok(result.cards.every((card) => DEPTHS.indexOf(card.depth) <= DEPTHS.indexOf('認識')));
  });

  const warmPlans = [
    ['認識', { 認識: 8 }],
    ['深入', { 認識: 2, 深入: 6 }],
    ['坦白', { 深入: 3, 坦白: 5 }]
  ];

  for (const [depth, expected] of warmPlans) {
    test(`第二疊（warm）深度上限 ${depth} 直接往深處去`, () => {
      const result = deck(makeHarness(), { depth, warm: true });

      assert.deepEqual(composition(result.cards), expected);
    });
  }

  test('無效的深度被拒絕', () => {
    assert.deepEqual(deck(makeHarness(), { depth: '超深' }), { ok: false, error: 'invalid_depth' });
  });

  test('沒有指定深度被拒絕', () => {
    assert.deepEqual(
      ask(makeHarness(), { action: 'deck' }),
      { ok: false, error: 'invalid_depth' }
    );
  });
});

describe('Deep Talk：題目不足時的補牌', () => {
  test('某一層不夠時用計畫內的其他層補滿', () => {
    // 深入只有 1 題，計畫要 3 題，缺的兩張要從破冰與認識補。
    const rows = [
      ...Array.from({ length: 12 }, (_, n) => row(`s${n}`, { depth: '破冰' })),
      ...Array.from({ length: 12 }, (_, n) => row(`m${n}`, { depth: '認識' })),
      row('d0', { depth: '深入' })
    ];
    const result = deck(makeHarness(rows), { depth: '深入' });

    assert.equal(result.cards.length, DECK_SIZE);
    assert.equal(composition(result.cards)['深入'], 1);
  });

  test('補完牌之後仍然由淺到深', () => {
    // 補上的牌是接在後面的，沒有重新排序的話這一疊會在中途忽然變淺。
    const rows = [
      ...Array.from({ length: 12 }, (_, n) => row(`s${n}`, { depth: '破冰' })),
      ...Array.from({ length: 12 }, (_, n) => row(`m${n}`, { depth: '認識' })),
      row('d0', { depth: '深入' })
    ];
    const ranks = deck(makeHarness(rows), { depth: '深入' })
      .cards.map((card) => DEPTHS.indexOf(card.depth));

    for (let index = 1; index < ranks.length; index += 1) {
      assert.ok(ranks[index] >= ranks[index - 1], `第 ${index + 1} 張比前一張淺`);
    }
  });

  test('補牌也不會超過深度上限', () => {
    const rows = [
      row('s0', { depth: '破冰' }),
      ...Array.from({ length: 12 }, (_, n) => row(`t${n}`, { depth: '坦白' }))
    ];
    const result = deck(makeHarness(rows), { depth: '破冰' });

    // 只有一題破冰，坦白層有一堆，但深度上限是破冰，不准借。
    assert.equal(result.cards.length, 1);
  });

  test('完全沒有可用題目時回傳空的一疊', () => {
    const result = deck(makeHarness([]), { depth: '破冰' });

    assert.deepEqual(result, { ok: true, cards: [], remaining: 0 });
  });
});

describe('Deep Talk：篩選', () => {
  test('未上架的題目不會出現', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, n) => row(`on${n}`)),
      row('off', { live: false })
    ];
    const result = deck(makeHarness(rows));

    assert.ok(result.cards.every((card) => card.id !== 'off'));
  });

  test('上架欄接受核取方塊之外的寫法', () => {
    const rows = ['TRUE', 'true', 'yes', '是', '1'].map((live, index) => row(`v${index}`, { live }));
    const result = deck(makeHarness(rows));

    assert.equal(result.cards.length, 5);
  });

  test('排除的主題絕不出現', () => {
    // 池子裡只放兩題，兩題都一定會被抽到 —— 剩下什麼完全由篩選決定。
    // 把 bad 混進一堆好題目裡，「沒抽到」有可能只是運氣好，斷言就變成擲骰子。
    const rows = [
      row('bad', { topics: '身體與親密、遺憾' }),
      row('ok', { topics: '童年與家庭' })
    ];
    const ids = deck(makeHarness(rows), { exclude: ['身體與親密'] }).cards.map((card) => card.id);

    assert.deepEqual(ids, ['ok']);
  });

  test('想聊的主題優先出牌', () => {
    // 30 題裡只有 2 題命中，純隨機幾乎不可能兩題都抽到。
    const rows = [
      ...Array.from({ length: 30 }, (_, n) => row(`plain${n}`, { topics: '日常小習慣' })),
      row('want1', { topics: '金錢觀' }),
      row('want2', { topics: '金錢觀、價值觀' })
    ];
    const ids = deck(makeHarness(rows), { prefer: ['金錢觀'] }).cards.map((card) => card.id);

    assert.ok(ids.includes('want1'));
    assert.ok(ids.includes('want2'));
  });

  test('想聊的主題不夠出牌時，其他題目會補上', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, n) => row(`plain${n}`, { topics: '日常小習慣' })),
      row('want', { topics: '金錢觀' })
    ];
    const result = deck(makeHarness(rows), { prefer: ['金錢觀'] });

    assert.equal(result.cards.length, DECK_SIZE);
    assert.equal(result.cards[0].id, 'want');
  });

  test('關係階段不符的題目不會出現', () => {
    // 同上：只放兩題，剩下什麼完全由篩選決定，不留運氣的空間。
    const rows = [
      row('later', { stages: '在一起很久了' }),
      row('now', { stages: '曖昧中、交往中' })
    ];
    const ids = deck(makeHarness(rows), { stage: '曖昧中' }).cards.map((card) => card.id);

    assert.deepEqual(ids, ['now']);
  });

  test('沒有標記階段的題目視為通用', () => {
    const rows = Array.from({ length: 12 }, (_, n) => row(`any${n}`, { stages: '' }));
    const result = deck(makeHarness(rows), { stage: '剛認識' });

    assert.equal(result.cards.length, DECK_SIZE);
  });

  test('已經看過的題目不會再抽到', () => {
    const gs = makeHarness();
    const first = deck(gs, { depth: '破冰' });
    const seen = first.cards.map((card) => card.id);
    const second = deck(gs, { depth: '破冰', seen, warm: true });

    assert.ok(second.cards.every((card) => !seen.includes(card.id)));
  });

  test('remaining 反映扣掉這一疊之後還剩幾題', () => {
    const rows = Array.from({ length: 20 }, (_, n) => row(`q${n}`));

    assert.equal(deck(makeHarness(rows)).remaining, 20 - DECK_SIZE);
  });

  test('跳過率過高的題目自動停止出牌', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, n) => row(`ok${n}`)),
      row('awkward', { likes: 3, skips: 20 })
    ];
    const result = deck(makeHarness(rows));

    assert.ok(result.cards.every((card) => card.id !== 'awkward'));
  });

  test('票數還少的時候不會被誤判為爛題目', () => {
    const rows = [row('young', { likes: 0, skips: 5 })];
    const result = deck(makeHarness(rows));

    assert.deepEqual(result.cards.map((card) => card.id), ['young']);
  });
});

describe('Deep Talk：回饋', () => {
  const votes = (gs, list) => ask(gs, { action: 'feedback', votes: list });

  const counts = (gs, id) => {
    const found = gs.rows('questions').find((entry) => entry[COLUMN.id] === id);

    return { likes: found[COLUMN.likes], skips: found[COLUMN.skips] };
  };

  test('讚與跳過會累加到對應的題目', () => {
    const gs = makeHarness([row('a', { likes: 4, skips: 1 }), row('b')]);

    assert.deepEqual(
      votes(gs, [{ id: 'a', vote: 'like' }, { id: 'b', vote: 'skip' }]),
      { ok: true, counted: 2 }
    );
    assert.deepEqual(counts(gs, 'a'), { likes: 5, skips: 1 });
    assert.deepEqual(counts(gs, 'b'), { likes: 0, skips: 1 });
  });

  test('同一個 id 在一次請求裡最多各加一票', () => {
    const gs = makeHarness([row('a')]);

    votes(gs, Array.from({ length: 20 }, () => ({ id: 'a', vote: 'like' })));

    assert.deepEqual(counts(gs, 'a'), { likes: 1, skips: 0 });
  });

  test('未上架的題目一樣收得到票', () => {
    // 票數是淘汰題目的依據，不該因為當下沒上架就漏掉。
    const gs = makeHarness([row('hidden', { live: false })]);

    votes(gs, [{ id: 'hidden', vote: 'skip' }]);

    assert.deepEqual(counts(gs, 'hidden'), { likes: 0, skips: 1 });
  });

  test('不存在的 id 被忽略，不影響其他票', () => {
    const gs = makeHarness([row('a')]);

    assert.deepEqual(
      votes(gs, [{ id: 'ghost', vote: 'like' }, { id: 'a', vote: 'like' }]),
      { ok: true, counted: 1 }
    );
  });

  test('沒有任何票被拒絕', () => {
    assert.deepEqual(votes(makeHarness(), []), { ok: false, error: 'missing_votes' });
  });

  test('票數全都無效時被拒絕', () => {
    assert.deepEqual(
      votes(makeHarness(), [{ id: 'a', vote: '亂寫' }, { vote: 'like' }]),
      { ok: false, error: 'missing_votes' }
    );
  });

  test('一次送太多票被拒絕', () => {
    const list = Array.from({ length: 41 }, (_, n) => ({ id: `q${n}`, vote: 'like' }));

    assert.deepEqual(votes(makeHarness(), list), { ok: false, error: 'too_many_votes' });
  });

  test('只有標題列時不會出錯', () => {
    assert.deepEqual(votes(makeHarness([]), [{ id: 'a', vote: 'like' }]), { ok: true, counted: 0 });
  });
});

describe('Deep Talk：熱門排行', () => {
  const trending = (gs, payload = {}) => ask(gs, { action: 'trending', ...payload });

  test('票數不足的題目不上榜', () => {
    const gs = makeHarness([row('few', { likes: 2, skips: 0 }), row('enough', { likes: 3, skips: 0 })]);

    assert.deepEqual(trending(gs).cards.map((card) => card.id), ['enough']);
  });

  test('票多的高比例贏過票少的滿分', () => {
    const gs = makeHarness([
      row('lucky', { likes: 3, skips: 0 }), // 100%，但只有三票
      row('loved', { likes: 40, skips: 4 }) // 91%，票數紮實
    ]);

    assert.deepEqual(trending(gs).cards.map((card) => card.id), ['loved', 'lucky']);
  });

  test('跳過率過高的題目不上榜', () => {
    const gs = makeHarness([row('good', { likes: 10, skips: 1 }), row('bad', { likes: 3, skips: 20 })]);

    assert.deepEqual(trending(gs).cards.map((card) => card.id), ['good']);
  });

  test('未上架的題目不上榜', () => {
    const gs = makeHarness([row('hidden', { likes: 50, skips: 0, live: false })]);

    assert.deepEqual(trending(gs).cards, []);
  });

  test('limit 生效', () => {
    const rows = Array.from({ length: 30 }, (_, n) => row(`q${n}`, { likes: 30 - n, skips: 0 }));

    assert.equal(trending(makeHarness(rows), { limit: 5 }).cards.length, 5);
  });

  test('limit 超出上限時被截到 50', () => {
    const rows = Array.from({ length: 60 }, (_, n) => row(`q${n}`, { likes: 60 - n, skips: 0 }));

    assert.equal(trending(makeHarness(rows), { limit: 999 }).cards.length, 50);
  });

  test('沒指定 limit 時預設 20', () => {
    const rows = Array.from({ length: 30 }, (_, n) => row(`q${n}`, { likes: 30 - n, skips: 0 }));

    assert.equal(trending(makeHarness(rows)).cards.length, 20);
  });
});

describe('Deep Talk：快取', () => {
  const addRow = (gs, entry) => gs.rows('questions').push(entry);

  test('第二次發牌不會重讀試算表', () => {
    const gs = makeHarness([row('a')]);

    deck(gs);
    addRow(gs, row('b'));

    assert.equal(deck(gs).cards.length, 1, '新增的題目不該在快取有效期內出現');
  });

  test('快取過期後會重讀試算表', () => {
    const gs = makeHarness([row('a')]);

    deck(gs);
    addRow(gs, row('b'));
    gs.advanceTime(CACHE_SECONDS * 1000 + 1000);

    assert.equal(deck(gs).cards.length, 2);
  });

  test('flush 之後立刻讀到新題目', () => {
    const gs = makeHarness([row('a')]);

    deck(gs);
    addRow(gs, row('b'));

    assert.deepEqual(ask(gs, { action: 'flush', key: ADMIN_KEY }), { ok: true, flushed: true });
    assert.equal(deck(gs).cards.length, 2);
  });

  test('flush 需要正確的密鑰', () => {
    assert.deepEqual(
      ask(makeHarness(), { action: 'flush', key: '猜的' }),
      { ok: false, error: 'unauthorized' }
    );
  });

  test('flush 沒帶密鑰也被拒絕', () => {
    assert.deepEqual(ask(makeHarness(), { action: 'flush' }), { ok: false, error: 'unauthorized' });
  });

  test('快取只掉了其中一塊時整份重讀', () => {
    const gs = makeHarness([row('a')]);

    deck(gs);
    addRow(gs, row('b'));
    // CacheService 不保證整批寫入的內容會一起存活。
    gs.dropCacheKey('deep-talk:questions:0');

    // 重點是不能回傳半截或錯亂的題庫，退回重讀試算表才是對的。
    assert.equal(deck(gs).cards.length, 2);
  });

  test('題庫大到需要分塊時仍能正確還原', () => {
    // 單一快取 key 上限 100KB，這份題庫序列化後遠超過一塊的長度。
    const rows = Array.from({ length: 400 }, (_, n) =>
      row(`big${n}`, { text: `這是一個刻意寫得很長的題目，用來把快取內容撐過單塊上限，編號 ${n}。`.repeat(2) }));
    const gs = makeHarness(rows);

    assert.equal(deck(gs).remaining, 400 - DECK_SIZE);

    addRow(gs, row('extra'));

    // 讀得回來就代表分塊寫入與拼回都正確；壞掉的話會退回重讀試算表而看到 401 題。
    assert.equal(deck(gs).remaining, 400 - DECK_SIZE);
  });
});

describe('Deep Talk：與其他作品互不干擾', () => {
  test('deep-talk 用掉的節流額度不影響邀請卡', () => {
    const gs = createGatewayHarness({
      properties: {
        [SPREADSHEET_ID_PROPERTY]: 'FAKE_SPREADSHEET_ID',
        INVITATION_RESPONSES_SPREADSHEET_ID: 'FAKE'
      },
      sheets: { questions: [HEADER, ...BALANCED], responses: [] }
    });

    for (let index = 0; index < 60; index += 1) deck(gs);

    assert.deepEqual(deck(gs), { ok: false, error: 'rate_limited' });
    assert.deepEqual(
      gs.post({
        app: 'invitation-card',
        payload: { timing: '深夜限定', activities: ['散步'] }
      }),
      { ok: true }
    );
  });
});

describe('Deep Talk：用 AI 生題目', () => {
  const GEMINI_KEY_PROPERTY = 'DEEP_TALK_GEMINI_API_KEY';

  /** 包成 Gemini 的回應格式：題目陣列被序列化成 parts[0].text。 */
  const geminiReply = (questions) => ({
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify(questions) }] } }] }
  });

  function makeAiHarness(rows, responses) {
    return makeHarness(rows, {
      properties: { [GEMINI_KEY_PROPERTY]: 'FAKE_API_KEY' },
      fetch: responses
    });
  }

  const generate = (gs, payload = {}) =>
    ask(gs, { action: 'generate', key: ADMIN_KEY, topic: '金錢觀', depth: '深入', ...payload });

  test('生成的題目寫進試算表，但一律待審', () => {
    const gs = makeAiHarness([], [geminiReply(['你上一次為錢焦慮是什麼時候？'])]);

    assert.deepEqual(generate(gs), { ok: true, added: 1, skipped: 0 });

    const [, written] = gs.rows('questions');

    assert.equal(written[COLUMN.text], '你上一次為錢焦慮是什麼時候？');
    assert.equal(written[COLUMN.topics], '金錢觀');
    assert.equal(written[COLUMN.depth], '深入');
    assert.equal(written[COLUMN.live], false, '不該直接上架');
    assert.equal(written[6], 'AI');
  });

  test('id 接在既有編號後面', () => {
    const gs = makeAiHarness(
      [row('q007'), row('q041'), row('手動加的')],
      [geminiReply(['第一題？', '第二題？'])]
    );

    generate(gs);

    const ids = gs.rows('questions').slice(1).map((entry) => entry[COLUMN.id]);

    assert.deepEqual(ids.slice(-2), ['q042', 'q043']);
  });

  test('與既有題目重複的被丟掉', () => {
    const gs = makeAiHarness(
      [row('q001', { text: '你上一次為錢焦慮是什麼時候？' })],
      [geminiReply(['你上一次為錢焦慮是什麼時候？', '你怎麼決定一筆錢值不值得花？'])]
    );

    assert.deepEqual(generate(gs), { ok: true, added: 1, skipped: 1 });
  });

  test('只差標點也算重複', () => {
    const gs = makeAiHarness(
      [row('q001', { text: '你上一次為錢焦慮，是什麼時候？' })],
      [geminiReply(['你上一次為錢焦慮是什麼時候'])]
    );

    assert.deepEqual(generate(gs), { ok: true, added: 0, skipped: 1 });
  });

  test('同一批裡自己重複的也只留一題', () => {
    const gs = makeAiHarness([], [geminiReply(['一樣的題目？', '一樣的題目？'])]);

    assert.deepEqual(generate(gs), { ok: true, added: 1, skipped: 1 });
  });

  test('提示詞帶上主題、深度說明與既有題目', () => {
    const gs = makeAiHarness(
      [row('q001', { text: '你怎麼看待借錢給朋友？', topics: '金錢觀' }),
       row('q002', { text: '你最近睡得好嗎？', topics: '日常小習慣' })],
      [geminiReply(['新的題目？'])]
    );

    generate(gs, { count: 7, stage: '交往中' });

    const prompt = JSON.parse(gs.fetchCalls[0].body).contents[0].parts[0].text;

    assert.match(prompt, /金錢觀/);
    assert.match(prompt, /產生 7 個/);
    // 用整行比對：句型規則裡也提到「交往中」，只比對詞會讓這個斷言失去意義。
    assert.match(prompt, /關係階段：交往中/);
    assert.match(prompt, /碰到價值觀、過去的選擇與代價/, '應該附上該深度的定義');
    assert.match(prompt, /你怎麼看待借錢給朋友？/, '同主題的既有題目要當反例');
    assert.doesNotMatch(prompt, /你最近睡得好嗎/, '別的主題不必塞進去');
  });

  /*
   * 句型規則是題目品質的關鍵：少了它，模型會寫出「你怎麼看待○○？」這種
   * 當場答不出來的論說文題目。這一段被刪掉不會讓任何功能壞掉，所以特別測。
   */
  test('提示詞帶上句型規則與正反範例', () => {
    const gs = makeAiHarness([], [geminiReply(['新的題目？'])]);

    generate(gs);

    const prompt = JSON.parse(gs.fetchCalls[0].body).contents[0].parts[0].text;

    for (const pattern of ['情境假設', '二選一', '具體記憶', '尺度', '釘住抽象詞', '第三人稱代入']) {
      assert.match(prompt, new RegExp(pattern), `應該列出「${pattern}」句型`);
    }

    assert.match(prompt, /禁止的句型/, '要明確擋掉論說文題型');
    assert.match(prompt, /你怎麼看待○○？/, '要點名最常見的爛句型');
    assert.match(prompt, /對照範例/, '成對範例比抽象規則有效，不能省');
    assert.match(prompt, /存款到多少，你才會覺得自己是安全的？/, '要給改寫後的正例');
  });

  test('要求輸出 JSON 陣列', () => {
    const gs = makeAiHarness([], [geminiReply(['題目？'])]);

    generate(gs);

    const request = JSON.parse(gs.fetchCalls[0].body);

    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(request.generationConfig.responseSchema, { type: 'ARRAY', items: { type: 'STRING' } });
    assert.equal(gs.fetchCalls[0].options.headers['x-goog-api-key'], 'FAKE_API_KEY');
  });

  test('生成後清掉快取，新題目不會被舊快取蓋住', () => {
    const gs = makeAiHarness([row('q001')], [geminiReply(['新題目？'])]);

    deck(gs); // 先讓快取存在
    generate(gs, { depth: '破冰' }); // 與下面抽的那一疊同一層，才驗得到
    gs.rows('questions').at(-1)[COLUMN.live] = true;

    assert.equal(deck(gs).cards.length, 2);
  });

  test('沒有管理密鑰不能生成', () => {
    const gs = makeAiHarness([], []);

    assert.deepEqual(
      ask(gs, { action: 'generate', topic: '金錢觀', depth: '深入' }),
      { ok: false, error: 'unauthorized' }
    );
    assert.equal(gs.fetchCalls.length, 0, '沒過驗證就不該打 Gemini');
  });

  test('缺少主題或深度無效時被拒絕', () => {
    assert.deepEqual(
      generate(makeAiHarness([], []), { topic: '' }),
      { ok: false, error: 'missing_topic' }
    );
    assert.deepEqual(
      generate(makeAiHarness([], []), { depth: '超深' }),
      { ok: false, error: 'invalid_depth' }
    );
  });

  test('Gemini 出錯時不外洩細節，但執行紀錄查得到原因', () => {
    const gs = makeAiHarness([], [{ status: 429, body: { error: { message: 'quota exceeded' } } }]);

    assert.deepEqual(generate(gs), { ok: false, error: 'invalid_request' });
    assert.equal(gs.rows('questions').length, 1, '只剩標題列，不該寫入任何東西');

    // 前端拿不到細節，但你在執行紀錄裡要看得出是配額用完還是別的問題。
    const logged = gs.logs.join(' ');

    assert.match(logged, /429/);
    assert.match(logged, /quota exceeded/);
  });

  test('Gemini 回傳的不是陣列時不寫入', () => {
    // 用字串而不是物件：字串是可迭代的，少了型別檢查會被逐字當成三個題目寫進去。
    const gs = makeAiHarness([], [{ body: { candidates: [{ content: { parts: [{ text: '"你好嗎"' }] } }] } }]);

    assert.deepEqual(generate(gs), { ok: false, error: 'invalid_request' });
    assert.equal(gs.rows('questions').length, 1);
  });

  test('沒有設定 API 金鑰時不外洩細節', () => {
    const gs = makeHarness([], { fetch: [geminiReply(['題目？'])] });

    assert.deepEqual(generate(gs), { ok: false, error: 'invalid_request' });
  });
});

describe('Deep Talk：時事題出牌', () => {
  // 固定時鐘，時事題的年齡才算得準。
  const NOW = Date.UTC(2026, 7, 24);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);

  /** 一般題目後面接上第 11～13 欄。 */
  function newsRow(id, overrides = {}) {
    const {
      brief = '某件最近被討論的事。',
      sourceUrl = 'https://example.com/post',
      days = 1,
      ...rest
    } = overrides;

    return [...row(id, { topics: '最近發生的事', ...rest }), brief, sourceUrl, daysAgo(days)];
  }

  const newsHarness = (rows) => makeHarness(rows, { now: NOW });

  test('摘要與出處會跟著卡片回到前端', () => {
    const gs = newsHarness([newsRow('n1', { brief: '房租又漲了。', sourceUrl: 'https://example.com/rent' })]);
    const [card] = deck(gs).cards;

    assert.equal(card.brief, '房租又漲了。');
    assert.equal(card.sourceUrl, 'https://example.com/rent');
  });

  test('一般題目的摘要與出處是空的', () => {
    const gs = newsHarness([row('q1')]);
    const [card] = deck(gs).cards;

    assert.equal(card.brief, '');
    assert.equal(card.sourceUrl, '');
  });

  test('超過 90 天的時事題不再出牌', () => {
    const gs = newsHarness([newsRow('n1', { days: 91 }), row('q1')]);
    const ids = deck(gs).cards.map((card) => card.id);

    assert.deepEqual(ids, ['q1'], '過期的時事題應該整個消失');
  });

  test('90 天內的時事題還在', () => {
    const gs = newsHarness([newsRow('n1', { days: 89 })]);

    assert.equal(deck(gs).cards.length, 1);
  });

  test('沒有時事日期的題目永遠不會過期', () => {
    // 建立時間是 2026-08-23，但那一欄跟出牌無關，只有第 13 欄的時事日期算數。
    const gs = newsHarness([row('q1')]);

    assert.equal(deck(gs).cards.length, 1);
  });

  test('出處只收 http(s)，其餘一律當成沒有', () => {
    const rows = [
      newsRow('n1', { sourceUrl: 'javascript:alert(1)' }),
      newsRow('n2', { sourceUrl: 'https://example.com/ok' })
    ];
    const cards = deck(newsHarness(rows)).cards;
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]));

    assert.equal(byId.n1.sourceUrl, '', 'javascript: 會變成前端卡片上一個可以點的連結，必須擋掉');
    assert.equal(byId.n2.sourceUrl, 'https://example.com/ok');
  });

  /*
   * 新鮮度是機率性的偏好，不是硬排序 —— 直接照日期排會讓最新那題每次都第一張。
   * 所以這裡抽很多次看分佈，而不是看單一結果。
   */
  test('越新的時事題越容易被抽到', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, n) => newsRow(`new${n}`, { days: 1 })),
      ...Array.from({ length: 10 }, (_, n) => newsRow(`old${n}`, { days: 85 }))
    ];
    // 同一個 harness 連抽多次，隨機源才會往前走。
    const gs = newsHarness(rows);
    let fresh = 0;
    let stale = 0;

    for (let i = 0; i < 40; i += 1) {
      for (const card of deck(gs).cards) {
        if (card.id.startsWith('new')) fresh += 1;
        else stale += 1;
      }
    }

    assert.ok(fresh > stale * 2, `新的應該明顯多於舊的，實際 ${fresh} vs ${stale}`);
    assert.ok(stale > 0, '舊的只是變少，不該完全抽不到');
  });

  test('權重相同時退化成一般隨機，不會固定順序', () => {
    const rows = Array.from({ length: 20 }, (_, n) => row(`q${n}`));
    const gs = newsHarness(rows);
    const first = deck(gs).cards.map((card) => card.id).join();
    const second = deck(gs).cards.map((card) => card.id).join();

    assert.notEqual(first, second);
  });
});

describe('Deep Talk：生成時事題', () => {
  const GEMINI_KEY_PROPERTY = 'DEEP_TALK_GEMINI_API_KEY';

  const candidate = (overrides = {}) => ({
    text: '如果房租再漲三成，你會先砍掉生活裡的哪一項？',
    brief: '雙北房租連續第三季上漲。',
    sourceUrl: 'https://example.com/rent',
    eventDate: '2026-08-20',
    depth: '認識',
    topics: ['金錢觀'],
    ...overrides
  });

  const reply = (items) => ({
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }
  });

  const rawReply = (text) => ({ body: { candidates: [{ content: { parts: [{ text }] } }] } });

  const makeNewsHarness = (rows, responses) =>
    makeHarness(rows, {
      properties: { [GEMINI_KEY_PROPERTY]: 'FAKE_API_KEY' },
      fetch: responses
    });

  const generateNews = (gs, payload = {}) =>
    ask(gs, { action: 'generate-news', key: ADMIN_KEY, ...payload });

  /*
   * 金鑰預設是全站共用的：Gemini 的額度綁在 Cloud 專案上，
   * 同一個專案開幾把金鑰都吃同一份配額，分開只是多一個要輪替的東西。
   * 作品專屬的覆寫留著，是為了讓這個決定可以反悔。
   */
  describe('金鑰來源', () => {
    const callWith = (properties) => {
      const gs = makeHarness([], { properties, fetch: [reply([candidate()])] });
      const result = generateNews(gs);

      return { result, gs };
    };

    test('只設共用金鑰就能用', () => {
      const { result, gs } = callWith({ GEMINI_API_KEY: 'SHARED' });

      assert.equal(result.ok, true);
      assert.equal(gs.fetchCalls[0].options.headers['x-goog-api-key'], 'SHARED');
    });

    test('作品專屬的金鑰蓋過共用的', () => {
      const { gs } = callWith({ GEMINI_API_KEY: 'SHARED', [GEMINI_KEY_PROPERTY]: 'MINE' });

      assert.equal(gs.fetchCalls[0].options.headers['x-goog-api-key'], 'MINE');
    });

    test('共用的模型也吃得到', () => {
      const { gs } = callWith({ GEMINI_API_KEY: 'SHARED', GEMINI_MODEL: 'gemini-x-flash' });

      assert.match(gs.fetchCalls[0].url, /gemini-x-flash/);
    });

    test('兩個都沒設時，錯誤訊息要講得出該設哪一個', () => {
      const { result, gs } = callWith({});

      assert.equal(result.ok, false);
      assert.equal(gs.fetchCalls.length, 0);
      assert.match(gs.logs.join(' '), /GEMINI_API_KEY/);
    });
  });

  test('同時開搜尋與讀網頁兩個工具', () => {
    const gs = makeNewsHarness([], [reply([candidate()])]);

    generateNews(gs);

    const request = JSON.parse(gs.fetchCalls[0].body);
    const tools = JSON.stringify(request.tools);

    assert.match(tools, /googleSearch/, '沒有搜尋就找不到時事');
    assert.match(tools, /urlContext/, '只靠搜尋摘要碰不到留言區');
    assert.ok(request.generationConfig.responseSchema, '仍然要結構化輸出');
  });

  test('寫進試算表時一律待審，來源標成 AI/時事', () => {
    const gs = makeNewsHarness([], [reply([candidate()])]);

    assert.deepEqual(generateNews(gs), { ok: true, added: 1, skipped: 0, blocked: 0 });

    const [, written] = gs.rows('questions');

    assert.equal(written[COLUMN.live], false, '時事題尤其不能自動上架');
    assert.equal(written[6], 'AI/時事');
  });

  test('摘要、出處、時事日期寫在第 11～13 欄', () => {
    const gs = makeNewsHarness([], [reply([candidate()])]);

    generateNews(gs);

    const [, written] = gs.rows('questions');

    assert.equal(written[10], '雙北房租連續第三季上漲。');
    assert.equal(written[11], 'https://example.com/rent');
    assert.equal(new Date(written[12]).toISOString().slice(0, 10), '2026-08-20');
  });

  test('一律掛上時事標籤，模型給的其他主題接在後面', () => {
    const gs = makeNewsHarness([], [reply([candidate({ topics: ['金錢觀', '未來規劃'] })])]);

    generateNews(gs);

    const [, written] = gs.rows('questions');

    assert.equal(written[COLUMN.topics], '最近發生的事、金錢觀、未來規劃');
  });

  test('模型自己加了時事標籤也不會重複', () => {
    const gs = makeNewsHarness([], [reply([candidate({ topics: ['最近發生的事'] })])]);

    generateNews(gs);

    assert.equal(gs.rows('questions')[1][COLUMN.topics], '最近發生的事');
  });

  for (const [label, overrides] of [
    ['沒有摘要', { brief: '' }],
    ['沒有出處', { sourceUrl: '' }],
    ['出處不是網址', { sourceUrl: '不確定' }],
    ['沒有時事日期', { eventDate: '' }],
    ['時事日期看不懂', { eventDate: '前幾天' }],
    ['深度不在清單裡', { depth: '超深' }]
  ]) {
    test(`${label}的題目直接丟掉`, () => {
      const gs = makeNewsHarness([], [reply([candidate(overrides)])]);

      assert.deepEqual(generateNews(gs), { ok: true, added: 0, skipped: 1, blocked: 0 });
      assert.equal(gs.rows('questions').length, 1, '只剩標題列');
    });
  }

  /*
   * 這是整條路徑上最重要的一道檢查：AI 自己找時事，等於讓模型決定什麼東西
   * 出現在這個網站上，而熱門話題裡永遠混著命案與天災。
   */
  test('題材黑名單擋下不適合的時事，而且分開計數', () => {
    const gs = makeNewsHarness([], [reply([
      candidate({ text: '你上一次覺得治安變差是什麼時候？', brief: '某地發生一起命案。' }),
      candidate({ text: '看到空難新聞你會改變出遊計畫嗎？', brief: '本週發生空難。' }),
      candidate()
    ])]);

    assert.deepEqual(generateNews(gs), { ok: true, added: 1, skipped: 0, blocked: 2 });

    const written = gs.rows('questions').slice(1);

    assert.equal(written.length, 1);
    assert.match(written[0][COLUMN.text], /房租/);
  });

  test('題目沒踩黑名單但摘要踩了，一樣擋掉', () => {
    const gs = makeNewsHarness([], [reply([
      candidate({ text: '你多久沒跟家人吃飯了？', brief: '一名死者的家屬出面說明。' })
    ])]);

    assert.deepEqual(generateNews(gs), { ok: true, added: 0, skipped: 0, blocked: 1 });
  });

  test('跟既有題目重複的不會再寫一次', () => {
    const existing = row('q1', { text: '如果房租再漲三成，你會先砍掉生活裡的哪一項？' });
    const gs = makeNewsHarness([existing], [reply([candidate()])]);

    assert.deepEqual(generateNews(gs), { ok: true, added: 0, skipped: 1, blocked: 0 });
  });

  /*
   * 開著搜尋工具時模型有機率在 JSON 前後多吐字。這條路徑一失敗整批題目就沒了，
   * 所以解析要能從雜訊裡把 JSON 撈出來。
   */
  test('JSON 前面多一段說明文字仍然解析得出來', () => {
    const noisy = `好的，我查到以下幾則：\n${JSON.stringify([candidate()])}\n希望有幫助。`;
    const gs = makeNewsHarness([], [rawReply(noisy)]);

    assert.deepEqual(generateNews(gs), { ok: true, added: 1, skipped: 0, blocked: 0 });
  });

  test('完全不是 JSON 就報錯，不會靜靜地寫入垃圾', () => {
    const gs = makeNewsHarness([], [rawReply('今天沒有查到什麼特別的事')]);

    assert.equal(generateNews(gs).ok, false);
    assert.equal(gs.rows('questions').length, 1);
  });

  test('沒帶管理密鑰就不會打 Gemini', () => {
    const gs = makeNewsHarness([], [reply([candidate()])]);

    assert.equal(ask(gs, { action: 'generate-news' }).ok, false);
    assert.equal(gs.fetchCalls.length, 0);
  });

  test('生成後清掉快取，稽核上架的時事題立刻抽得到', () => {
    const gs = makeNewsHarness([row('q1')], [reply([candidate({ depth: '破冰' })])]);

    deck(gs); // 先讓題庫進快取。
    generateNews(gs);
    gs.rows('questions').at(-1)[COLUMN.live] = true;

    assert.equal(deck(gs).cards.length, 2, '舊快取沒清的話只會抽到 1 張');
  });
});
