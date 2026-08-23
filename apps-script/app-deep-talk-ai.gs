/*
 * 用 Gemini 生成新的題目，寫進題庫的待審區。
 *
 * 只有帶管理密鑰才叫得動，也可以直接在 Apps Script 編輯器裡執行
 * deepTalkGenerateFromEditor() —— 那條路徑不需要密鑰，因為能開編輯器的人本來就是你。
 *
 * 生出來的題目「上架」欄一律留空，要你自己在試算表掃過一遍才會出現在網站上。
 * AI 生的東西品質會飄，這道人工關卡是刻意保留的。
 *
 * 需要兩個指令碼屬性：
 *   DEEP_TALK_GEMINI_API_KEY   從 Google AI Studio 申請
 *   DEEP_TALK_GEMINI_MODEL     選填，預設 gemini-2.5-flash
 */

const DEEPTALK_GEMINI_KEY_PROPERTY = 'DEEP_TALK_GEMINI_API_KEY';
const DEEPTALK_GEMINI_MODEL_PROPERTY = 'DEEP_TALK_GEMINI_MODEL';
const DEEPTALK_GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const DEEPTALK_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEEPTALK_GENERATE_MAX = 20;
const DEEPTALK_GENERATE_DEFAULT = 10;
// 餵回去當「別重複這些」的既有題目數量。全部塞進去會讓提示詞爆掉。
const DEEPTALK_AVOID_LIMIT = 60;

/** 每一層深度該問到什麼程度。這段直接寫進提示詞，是題目品質的關鍵。 */
function deepTalkDepthBrief(depth) {
  switch (depth) {
    case '破冰':
      return '輕鬆、具體、沒有壓力，陌生人也答得出來。問日常、偏好、最近發生的小事。';
    case '認識':
      return '開始問對方的想法與感受，而不只是事實。答案會透露一點性格，但不會讓人不安。';
    case '深入':
      return '碰到價值觀、過去的選擇與代價。需要想一下才答得出來，答案可能會改變對方對你的理解。';
    case '坦白':
      return '平常不會主動說出口的事：脆弱、羞愧、渴望、後悔。要真誠而不是獵奇，不能讓人覺得被冒犯或被審問。';
    default:
      return '';
  }
}

function deepTalkGeminiPrompt(options) {
  const lines = [
    '你在為一款「deep talk 問題卡」設計題目，使用者是兩個想更認識彼此的人。',
    '',
    `請產生 ${options.count} 個繁體中文的問題。`,
    `主題：${options.topic}`,
    `深度：${options.depth} —— ${deepTalkDepthBrief(options.depth)}`,
    `關係階段：${options.stage || '不限'}`,
    '',
    '規則：',
    '- 一題一句話，30 個字以內。',
    '- 必須是開放式問題，不能用「是／否」回答完。',
    '- 用「你」稱呼對方，不要用「您」。',
    '- 問對方的實際經驗或想法，不要問假設性的腦筋急轉彎。',
    '- 不要預設對方的處境（例如不要預設對方有伴侶、有小孩、有工作）。',
    '- 不要說教、不要在題目裡夾帶建議或評價。',
    '- 語氣自然，像朋友在問，不要像問卷或心理測驗。',
    '- 台灣用語，不要用中國大陸的慣用詞。'
  ];

  if (options.avoid.length > 0) {
    lines.push(
      '',
      '以下題目已經存在，不要重複，也不要只是換句話說：',
      ...options.avoid.map((text) => `- ${text}`)
    );
  }

  return lines.join('\n');
}

/*
 * 呼叫 Gemini 並回傳題目字串陣列。
 * 指定 responseSchema 讓模型直接輸出 JSON 陣列，省去解析自由文字的麻煩。
 */
function deepTalkAskGemini(prompt) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty(DEEPTALK_GEMINI_KEY_PROPERTY);

  if (!apiKey) {
    throw new Error(`缺少指令碼屬性：${DEEPTALK_GEMINI_KEY_PROPERTY}`);
  }

  const model = properties.getProperty(DEEPTALK_GEMINI_MODEL_PROPERTY) || DEEPTALK_GEMINI_DEFAULT_MODEL;
  const url = `${DEEPTALK_GEMINI_ENDPOINT}/${model}:generateContent`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        // 題目要有變化，溫度調高一點。
        temperature: 1.1,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } }
      }
    })
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status !== 200) {
    throw new Error(`Gemini 回應 ${status}：${body.slice(0, 300)}`);
  }

  const parsed = JSON.parse(body);
  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error(`Gemini 沒有回傳內容：${body.slice(0, 300)}`);
  }

  const questions = JSON.parse(text);

  if (!Array.isArray(questions)) {
    throw new Error('Gemini 回傳的不是陣列');
  }

  return questions;
}

/*
 * 比對用的正規化：拿掉標點與空白。
 * 只擋得住「一模一樣」與「只差標點」，語意相近的重複還是要靠提示詞與人工審核。
 */
function deepTalkNormalizeForCompare(text) {
  return String(text ?? '').replace(/[\s，。、？！,.?!~～「」『』（）()]/g, '');
}

/** 沿用既有 id 的編號往下接，例如 q037 之後給 q038。 */
function deepTalkNextIdNumber(rows) {
  let max = 0;

  for (const row of rows) {
    const match = /^q(\d+)$/.exec(String(row[DEEPTALK_COLUMN.id - 1] ?? '').trim());

    if (match) max = Math.max(max, Number(match[1]));
  }

  return max + 1;
}

/*
 * 生成一批題目並寫進試算表。
 *
 * options: { topic, depth, stage, count }
 * 回傳 { added, skipped }：skipped 是與既有題目重複而被丟掉的數量。
 */
function deepTalkGenerate(options) {
  const topic = normalizeText(options.topic, 20);
  const depth = normalizeText(options.depth, 10);
  const stage = normalizeText(options.stage, 20);
  const count = deepTalkClamp(options.count, 1, DEEPTALK_GENERATE_MAX, DEEPTALK_GENERATE_DEFAULT);

  if (!topic) throw requestError('missing_topic');
  if (!deepTalkDepthBrief(depth)) throw requestError('invalid_depth');

  const sheet = openSheet(DEEPTALK_SPREADSHEET_ID_PROPERTY, DEEPTALK_SHEET_NAME);
  const rows = sheet.getDataRange().getValues().slice(1);

  // 已經存在的題目：全部拿來擋重複，同主題的優先餵給模型當反例。
  const existing = {};
  const sameTopic = [];

  for (const row of rows) {
    const text = String(row[DEEPTALK_COLUMN.text - 1] ?? '').trim();

    if (!text) continue;

    existing[deepTalkNormalizeForCompare(text)] = true;

    if (String(row[DEEPTALK_COLUMN.topics - 1] ?? '').indexOf(topic) >= 0) {
      sameTopic.push(text);
    }
  }

  const generated = deepTalkAskGemini(deepTalkGeminiPrompt({
    topic,
    depth,
    stage,
    count,
    avoid: sameTopic.slice(-DEEPTALK_AVOID_LIMIT)
  }));

  let nextNumber = deepTalkNextIdNumber(rows);
  const fresh = [];

  for (const raw of generated) {
    const text = normalizeText(raw, 200);
    const key = deepTalkNormalizeForCompare(text);

    if (!text || existing[key]) continue;

    existing[key] = true;
    fresh.push([
      `q${String(nextNumber).padStart(3, '0')}`,
      text,
      topic,
      depth,
      stage,
      false, // 上架：一律待審。
      'AI',
      new Date(),
      0,
      0
    ]);
    nextNumber += 1;
  }

  for (const row of fresh) {
    appendRowSafely(sheet, row);
  }

  // 題庫變了，讓下一次發牌讀到新內容。
  clearCachedJson(DEEPTALK_CACHE_KEY);

  return { added: fresh.length, skipped: generated.length - fresh.length };
}

/*
 * 從網站呼叫的版本，需要管理密鑰。
 * 生成會花好幾秒又燒配額，刻意不做成排程 —— 你按一次才跑一次。
 */
function deepTalkGenerateAction(payload) {
  requireAdminKey(payload.key, DEEPTALK_ADMIN_KEY_PROPERTY);

  return deepTalkGenerate(payload);
}

/*
 * 在 Apps Script 編輯器裡直接執行用。
 * 改下面這幾個值，按執行，再去試算表看結果。
 */
function deepTalkGenerateFromEditor() {
  const result = deepTalkGenerate({
    topic: '童年與家庭',
    depth: '深入',
    stage: '',
    count: 10
  });

  console.log(`新增 ${result.added} 題，跳過重複 ${result.skipped} 題。`);

  return result;
}
