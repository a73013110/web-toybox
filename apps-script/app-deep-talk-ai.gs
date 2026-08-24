/*
 * 用 Gemini 生成新的題目，寫進題庫的待審區。
 *
 * 兩條生成路徑：
 *   deepTalkGenerate()      指定主題與深度，靠模型自己的知識寫題目，不連網。
 *   deepTalkGenerateNews()  連網找最近被討論的事，轉成帶摘要與出處的時事題。
 *
 * 兩條都只有帶管理密鑰才叫得動，也都可以直接在 Apps Script 編輯器裡執行對應的
 * ...FromEditor() —— 那條路徑不需要密鑰，因為能開編輯器的人本來就是你。
 *
 * 生出來的題目「上架」欄一律留空，要你自己在試算表掃過一遍才會出現在網站上。
 * AI 生的東西品質會飄，這道人工關卡是刻意保留的，時事題尤其不能放寬。
 *
 * 需要兩個指令碼屬性：
 *   DEEP_TALK_GEMINI_API_KEY   從 Google AI Studio 申請
 *   DEEP_TALK_GEMINI_MODEL     選填，預設 gemini-3.7-flash
 *
 * 模型必須是 Gemini 3 以上：時事題要在同一個請求裡同時用搜尋工具與結構化輸出，
 * 2.5 會直接回 400（Search Grounding can't be used with JSON mode）。
 */

const DEEPTALK_GEMINI_KEY_PROPERTY = 'DEEP_TALK_GEMINI_API_KEY';
const DEEPTALK_GEMINI_MODEL_PROPERTY = 'DEEP_TALK_GEMINI_MODEL';
const DEEPTALK_GEMINI_DEFAULT_MODEL = 'gemini-3.7-flash';
const DEEPTALK_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEEPTALK_GENERATE_MAX = 20;
const DEEPTALK_GENERATE_DEFAULT = 10;
// 餵回去當「別重複這些」的既有題目數量。全部塞進去會讓提示詞爆掉。
const DEEPTALK_AVOID_LIMIT = 60;

/** 每一層深度該問到什麼程度。這段直接寫進提示詞，是題目品質的關鍵。 */
function deepTalkDepthBrief(depth) {
  switch (depth) {
    case '破冰':
      return '輕鬆、具體、沒有壓力，陌生人也答得出來。問手邊的、今天的、身上帶著的東西，答案是事實不是想法。';
    case '認識':
      return '開始問想法與感受，而不只是事實。答案會透露一點性格與行為模式，但不會讓人不安。';
    case '深入':
      return '碰到價值觀、過去的選擇與代價。要指向一個具體的人、一次具體的事，不是抽象的立場。';
    case '坦白':
      return '平常不會主動說出口的事：脆弱、羞愧、渴望、後悔。要真誠而不是獵奇，不能讓人覺得被冒犯或被審問。';
    default:
      return '';
  }
}

/*
 * 題目的句型規則。
 *
 * 這一段是整個生成品質的核心，來自一個觀察：AI 預設會寫出「你怎麼看待誠實？」
 * 這種論說文題目 —— 看起來很深，但當場答不出來，因為它要求對方先歸納自己的
 * 一生再給結論。真正聊得起來的問題都指向一個具體的座標：一次記憶、一個數字、
 * 一個二選一、一個假設情境。
 *
 * 抽象規則模型記不住，所以下面用「爛題 → 好題」的成對範例來教，比條列有效得多。
 */
function deepTalkStyleRules() {
  return [
    '寫題規則（最重要的部分）：',
    '每一題都必須落在下面六種句型的其中一種。不屬於任何一種的題目一律不要。',
    '',
    '1. 情境假設：先給一個具體處境，再問對方會怎麼做或怎麼想。',
    '2. 二選一：給兩個都合理的選項，逼出立場。',
    '3. 具體記憶：問「上一次」某件事，逼出真實事件而不是立場宣示。',
    '4. 尺度：問多少錢、多久、幾歲、幾成，把形容詞換成可以回答的單位。',
    '5. 釘住抽象詞：把一個大詞問成「具體是指什麼狀態」。',
    '6. 第三人稱代入：問朋友遇到這件事你會怎麼做，降低防衛。',
    '',
    '禁止的句型（這些是論說文題目，當場沒有人答得出來）：',
    '- 「你怎麼看待○○？」',
    '- 「你如何定義○○？」',
    '- 「對你來說○○是什麼？」',
    '- 「你覺得○○重不重要？」',
    '- 任何要對方先總結自己一生才能回答的問題。',
    '',
    '對照範例（左邊是不要的，右邊是要的）：',
    '- 「你怎麼看待金錢與自由的關係？」→「存款到多少，你才會覺得自己是安全的？」',
    '- 「你會怎麼定義安全感？」→「被秒回訊息跟被記得小事，哪一個比較有安全感？」',
    '- 「你什麼時候會覺得孤單？」→「你上一次打了字又刪掉，是想跟誰說什麼？」',
    '- 「你怎麼決定要不要原諒一個人？」→「你上一次真心道歉，對方原諒你了嗎？」',
    '- 「你重視誠實嗎？」→「如果我做了一件你不能接受的事，但事前就誠實告訴你，你會怎麼看我？」',
    '- 「你覺得自己是什麼樣的人？」→「你說一個人「很好相處」的時候，具體是指他做了什麼？」',
    '- 「你有什麼遺憾？」→「有沒有一個人，你欠他一句對不起卻一直沒說？」'
  ];
}

function deepTalkGeminiPrompt(options) {
  const lines = [
    '你在為一款「deep talk 問題卡」設計題目，使用者是兩個想更認識彼此的人。',
    '他們面對面輪流抽卡，抽到就要當場回答，所以題目必須讓人五秒內就知道要從哪裡講起。',
    '',
    `請產生 ${options.count} 個繁體中文的問題。`,
    `主題：${options.topic}`,
    `深度：${options.depth} —— ${deepTalkDepthBrief(options.depth)}`,
    `關係階段：${options.stage || '不限'}`,
    '',
    ...deepTalkStyleRules(),
    '',
    '其他規則：',
    '- 一題一句話，40 個字以內。',
    '- 必須是開放式問題，不能用「是／否」回答完。',
    '- 用「你」稱呼對方，不要用「您」。',
    '- 不要預設對方的處境（例如不要預設對方有伴侶、有小孩、有工作）。',
    '- 不要說教、不要在題目裡夾帶建議或評價。',
    '- 語氣自然，像朋友在問，不要像問卷或心理測驗。',
    '- 台灣用語，不要用中國大陸的慣用詞。',
    '- 只有在關係階段是「曖昧中」「交往中」「在一起很久了」時，才可以在題目裡用「我」直接問對方；' +
      '「剛認識」或不限階段時一律不要。'
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
 * 容錯的 JSON 解析。
 *
 * 開著搜尋工具時，模型有機率在 JSON 前後多吐一些字（Google 自己的論壇上
 * 有人回報過開頭幾個字被吃掉、或前面多一段說明）。responseSchema 大多數
 * 時候會擋住，但這條路徑一失敗整批題目就沒了，值得多寫這幾行。
 */
function deepTalkParseJsonLoosely(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    // 往下退到「找出第一個陣列或物件」再試一次。
  }

  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));

  if (start < 0 || end <= start) {
    throw new Error(`Gemini 回傳的不是 JSON：${text.slice(0, 300)}`);
  }

  return JSON.parse(text.slice(start, end + 1));
}

/*
 * 送一次請求給 Gemini 並解析出結構化結果。
 *
 * config 直接併進 generationConfig，tools 則原樣帶上 ——
 * 時事題要開 googleSearch 與 urlContext，一般生題不需要。
 */
function deepTalkGeminiCall(prompt, options) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty(DEEPTALK_GEMINI_KEY_PROPERTY);

  if (!apiKey) {
    throw new Error(`缺少指令碼屬性：${DEEPTALK_GEMINI_KEY_PROPERTY}`);
  }

  const model = properties.getProperty(DEEPTALK_GEMINI_MODEL_PROPERTY) || DEEPTALK_GEMINI_DEFAULT_MODEL;
  const url = `${DEEPTALK_GEMINI_ENDPOINT}/${model}:generateContent`;
  const request = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      // 題目要有變化，溫度調高一點。
      temperature: 1.1,
      responseMimeType: 'application/json',
      responseSchema: options.schema
    }
  };

  if (options.tools) request.tools = options.tools;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(request)
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

  return deepTalkParseJsonLoosely(text);
}

function deepTalkAskGemini(prompt) {
  const questions = deepTalkGeminiCall(prompt, {
    schema: { type: 'ARRAY', items: { type: 'STRING' } }
  });

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

// ========================================
// 時事題
// ========================================

/*
 * 時事題跟一般題目走的是完全不同的一條路。
 *
 * 一般生題只靠模型自己記得的東西；時事題必須連網，而且要兩段：
 * 先用 googleSearch 找出最近被討論的事，再用 urlContext 真的去讀那幾頁 ——
 * 只靠搜尋摘要寫不出好題目，因為有味道的東西通常在留言區，不在標題。
 * Gemini 3 可以在同一個請求裡同時開這兩個工具與結構化輸出，所以只要打一次。
 */

const DEEPTALK_NEWS_GENERATE_MAX = 12;
const DEEPTALK_NEWS_GENERATE_DEFAULT = 6;
const DEEPTALK_NEWS_LOOKBACK_DAYS = 14;
const DEEPTALK_NEWS_BRIEF_MAX = 60;

/*
 * 不拿來出題的題材。
 *
 * AI 自己找時事，等於讓模型決定什麼東西出現在掛著你名字的頁面上，
 * 而熱門排行榜上永遠混著命案、天災與政治衝突。把那些變成 deep talk 題卡
 * 對當事人不尊重，對抽到卡的兩個人也只是掃興。
 *
 * 這份清單擋的是第一輪，不是最後一道 —— 真正的防線是人工審核，
 * 時事題跟一般 AI 題一樣進待審區，你看過才會上架。
 */
function deepTalkNewsBlockedWords() {
  return [
    '命案', '兇殺', '殺人', '槍擊', '恐攻', '爆炸案',
    '性侵', '猥褻', '家暴', '虐童', '虐待',
    '自殺', '輕生', '罹難', '死者', '遺體', '喪生',
    '空難', '船難', '土石流', '重大車禍',
    '戰爭', '轟炸', '難民',
    '確診', '疫情爆發'
  ];
}

/** 題目或摘要碰到黑名單就整題丟掉。寧可少幾題，也不要讓你在審核時看到那些東西。 */
function deepTalkNewsIsBlocked(candidate) {
  const haystack = `${candidate.text ?? ''}${candidate.brief ?? ''}`;

  return deepTalkNewsBlockedWords().some((word) => haystack.indexOf(word) >= 0);
}

function deepTalkNewsPrompt(options) {
  return [
    '你在為一款「deep talk 問題卡」設計題目，使用者是兩個想更認識彼此的人。',
    '這一批題目要從「最近正在被討論的事」出發，讓兩個人聊自己對這件事的真實反應。',
    '',
    `請先用 Google 搜尋找出台灣最近 ${options.days} 天內被討論最多的話題，`,
    '再實際讀進那些頁面的內容（包含底下的留言與回覆），然後出題。',
    '搜尋時請涵蓋新聞媒體，也涵蓋 PTT、Dcard、Threads 這類討論區 ——',
    '留言區裡的分歧與爭論才是好題目的來源，新聞標題本身通常問不出東西。',
    '',
    `請產生 ${options.count} 題。每一題都要附上：`,
    '- text：問題本身。',
    '- brief：一到兩句話說明這件事是什麼，讓完全沒跟到的人也答得出來。' +
      `不要超過 ${DEEPTALK_NEWS_BRIEF_MAX} 個字，只寫事實，不要寫你的評論。`,
    '- sourceUrl：你實際讀過的那一頁的網址，必須是完整的 http(s) 網址。不確定就不要編。',
    '- eventDate：這件事發生或被討論的日期，格式 YYYY-MM-DD。',
    `- depth：${deepTalkDepths().join('、')} 其中之一。`,
    '- topics：從這些主題挑一到兩個（可以留空）：' +
      '童年與家庭、金錢觀、感情經驗、未來規劃、恐懼與不安、價值觀、日常小習慣、身體與親密、遺憾、如果重來。',
    '',
    '題材規則（很重要）：',
    '- 只挑「一般人會有立場、而且立場會分歧」的日常話題：物價、工作與生活、居住、婚戀觀念、',
    '  網路現象、消費習慣、世代差異、科技對生活的影響這類。',
    '- 絕對不要用：刑事案件、性犯罪、自殺、傷亡意外、天災死傷、戰爭、疫病。',
    '  這些事不適合拿來當談心話題，碰到就換一個題材。',
    '- 不要用政黨或政治人物的爭議當題材，會讓兩個人吵架而不是變親近。',
    '- 不要在題目或摘要裡評價事件的對錯，你只負責把事情講清楚然後問對方。',
    '',
    ...deepTalkStyleRules(),
    '',
    '其他規則：',
    '- 題目一句話，40 個字以內。',
    '- 問對方自己的經驗、選擇與反應，不要問對方「怎麼看這則新聞」。',
    '  正例：「如果房租再漲三成，你會先砍掉生活裡的哪一項？」',
    '  反例：「你怎麼看待最近的房租上漲？」',
    '- 用「你」稱呼對方，不要用「您」。',
    '- 不要預設對方的處境（例如不要預設對方有伴侶、有小孩、有房、有工作）。',
    '- 台灣用語，不要用中國大陸的慣用詞。'
  ].join('\n');
}

/** 時事題的結構化輸出格式。欄位對得上試算表第 11～13 欄。 */
function deepTalkNewsSchema() {
  return {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING' },
        brief: { type: 'STRING' },
        sourceUrl: { type: 'STRING' },
        eventDate: { type: 'STRING' },
        depth: { type: 'STRING' },
        topics: { type: 'ARRAY', items: { type: 'STRING' } }
      },
      required: ['text', 'brief', 'sourceUrl', 'eventDate', 'depth']
    }
  };
}

/*
 * 生一批時事題並寫進試算表的待審區。
 *
 * options: { count, days }
 * 回傳 { added, skipped, blocked }：
 *   skipped 是重複或欄位不完整而丟掉的，blocked 是碰到題材黑名單而丟掉的。
 */
function deepTalkGenerateNews(options) {
  const count = deepTalkClamp(
    options.count, 1, DEEPTALK_NEWS_GENERATE_MAX, DEEPTALK_NEWS_GENERATE_DEFAULT);
  const days = deepTalkClamp(options.days, 1, 90, DEEPTALK_NEWS_LOOKBACK_DAYS);

  const sheet = openSheet(DEEPTALK_SPREADSHEET_ID_PROPERTY, DEEPTALK_SHEET_NAME);
  const rows = sheet.getDataRange().getValues().slice(1);
  const existing = {};

  for (const row of rows) {
    const text = String(row[DEEPTALK_COLUMN.text - 1] ?? '').trim();

    if (text) existing[deepTalkNormalizeForCompare(text)] = true;
  }

  const generated = deepTalkGeminiCall(deepTalkNewsPrompt({ count, days }), {
    schema: deepTalkNewsSchema(),
    // 先搜尋找到頁面，再實際讀那些頁面。兩個工具一起開才碰得到留言區。
    tools: [{ googleSearch: {} }, { urlContext: {} }]
  });

  if (!Array.isArray(generated)) {
    throw new Error('Gemini 回傳的不是陣列');
  }

  const depths = deepTalkDepths();
  let nextNumber = deepTalkNextIdNumber(rows);
  let blocked = 0;
  const fresh = [];

  for (const candidate of generated) {
    if (!candidate || typeof candidate !== 'object') continue;

    if (deepTalkNewsIsBlocked(candidate)) {
      blocked += 1;
      continue;
    }

    const text = normalizeText(candidate.text, 200);
    const brief = normalizeText(candidate.brief, 120);
    const sourceUrl = deepTalkSafeUrl(candidate.sourceUrl);
    const eventAt = deepTalkParseDate(candidate.eventDate);
    const depth = normalizeText(candidate.depth, 10);
    const key = deepTalkNormalizeForCompare(text);

    // 摘要與出處是時事題存在的理由 —— 少了任何一個，抽到的人根本不知道在問什麼。
    if (!text || !brief || !sourceUrl || !eventAt) continue;
    if (depths.indexOf(depth) < 0) continue;
    if (existing[key]) continue;

    existing[key] = true;

    // 一律掛上時事標籤，模型給的其他主題接在後面。
    const topics = [DEEPTALK_TOPIC_NEWS].concat(
      (Array.isArray(candidate.topics) ? candidate.topics : [])
        .map((topic) => normalizeText(topic, 20))
        .filter((topic) => topic && topic !== DEEPTALK_TOPIC_NEWS)
    );

    fresh.push([
      `q${String(nextNumber).padStart(3, '0')}`,
      text,
      topics.join('、'),
      depth,
      '', // 關係階段：時事題不分階段。
      false, // 上架：一律待審。
      'AI/時事',
      new Date(),
      0,
      0,
      brief,
      sourceUrl,
      new Date(eventAt)
    ]);
    nextNumber += 1;
  }

  for (const row of fresh) {
    appendRowSafely(sheet, row);
  }

  clearCachedJson(DEEPTALK_CACHE_KEY);

  return {
    added: fresh.length,
    skipped: generated.length - fresh.length - blocked,
    blocked
  };
}

/** 從網站呼叫的版本，需要管理密鑰。 */
function deepTalkGenerateNewsAction(payload) {
  requireAdminKey(payload.key, DEEPTALK_ADMIN_KEY_PROPERTY);

  return deepTalkGenerateNews(payload);
}

/*
 * 在 Apps Script 編輯器裡直接執行用。
 * 改下面兩個數字，按執行，再去試算表看新增的待審題。
 */
function deepTalkGenerateNewsFromEditor() {
  const result = deepTalkGenerateNews({ count: 6, days: 14 });

  console.log(`新增 ${result.added} 題，跳過 ${result.skipped} 題，題材不適合而擋掉 ${result.blocked} 題。`);

  return result;
}
