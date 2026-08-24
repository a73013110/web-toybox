/*
 * 把一張題目畫成可以存下來、直接丟進聊天室的圖。
 *
 * 在 LINE 或 IG 傳一張卡片，比傳一句純文字有質感得多，也是這個作品唯一
 * 會被別人看見的形式，所以值得畫得好看一點。整段都在前端做，不經過後端。
 */

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5，社群軟體不會裁到內容。
const MARGIN = 128;

const PAPER = '#f7f5f1';
const PAPER_DEEP = '#eeece7';
const INK = '#141414';
const INK_SOFT = '#74716c';
const ACCENT = '#a83f22';

const SERIF = '"Noto Serif TC", "PingFang TC", "Microsoft JhengHei", serif';
const SANS = 'Inter, "PingFang TC", "Microsoft JhengHei", sans-serif';

// 這些符號不該出現在一行的開頭。
const NO_LINE_START = '。、，．,.!?！？」』）〉》”’:：;；';

/*
 * 逐字斷行。中文沒有詞界，量到超過寬度就換行即可；
 * 唯一要處理的是不能讓標點掉到下一行的開頭。
 */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';

  for (const character of text) {
    if (character === '\n') {
      lines.push(line);
      line = '';
      continue;
    }

    const next = line + character;

    if (line && ctx.measureText(next).width > maxWidth && !NO_LINE_START.includes(character)) {
      lines.push(line);
      line = character;
      continue;
    }

    line = next;
  }

  if (line) lines.push(line);

  return lines;
}

/** 字多的時候縮小字級，讓長題目也不會撐爆版面。 */
function fitQuestion(ctx, text, maxWidth, maxLines) {
  for (const size of [58, 52, 46, 40, 36]) {
    ctx.font = `500 ${size}px ${SERIF}`;

    const lines = wrap(ctx, text, maxWidth);

    if (lines.length <= maxLines) return { size, lines };
  }

  ctx.font = `500 36px ${SERIF}`;

  return { size: 36, lines: wrap(ctx, text, maxWidth).slice(0, maxLines) };
}

function drawSpaced(ctx, text, x, y, spacing) {
  // ctx.letterSpacing 較新，沒有的話就自己一個字一個字排。
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
    return;
  }

  const characters = [...text];
  const width = characters.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, -spacing);
  let cursor = x - width / 2;

  ctx.save();
  ctx.textAlign = 'left';

  for (const character of characters) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + spacing;
  }

  ctx.restore();
}

async function ensureFonts() {
  if (!document.fonts) return;

  try {
    await Promise.all([
      document.fonts.load(`500 58px ${SERIF}`),
      document.fonts.load(`600 24px ${SANS}`)
    ]);
    await document.fonts.ready;
  } catch (error) {
    // 字型載不到就用系統字型畫，圖還是出得來。
  }
}

/*
 * 畫出一張卡片，回傳 PNG 的 Blob。
 * card 是後端回來的題目物件：{ text, topics, depth }
 */
export async function renderQuestionCard(card) {
  await ensureFonts();

  const canvas = document.createElement('canvas');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);

  background.addColorStop(0, PAPER);
  background.addColorStop(1, PAPER_DEEP);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(168, 63, 34, 0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, WIDTH - 104, HEIGHT - 104);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ACCENT;
  ctx.font = `600 24px ${SANS}`;
  drawSpaced(ctx, 'DEEP TALK', WIDTH / 2, 214, 10);

  ctx.strokeStyle = 'rgba(168, 63, 34, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 34, 252);
  ctx.lineTo(WIDTH / 2 + 34, 252);
  ctx.stroke();

  const maxWidth = WIDTH - MARGIN * 2;
  const { size, lines } = fitQuestion(ctx, card.text, maxWidth, 8);
  const lineHeight = Math.round(size * 1.85);
  const y = (HEIGHT - lines.length * lineHeight) / 2 + size * 0.34;

  ctx.fillStyle = INK;
  // fitQuestion 量完之後字型設定已經不在了，這裡要重新指定。
  ctx.font = `500 ${size}px ${SERIF}`;

  lines.forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, y + index * lineHeight);
  });

  const labels = [card.depth, ...(card.topics ?? [])].filter(Boolean);

  if (labels.length > 0) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText(labels.join('  ·  '), WIDTH / 2, HEIGHT - 176);
  }

  ctx.fillStyle = 'rgba(116, 113, 108, 0.75)';
  ctx.font = `600 20px ${SANS}`;
  drawSpaced(ctx, 'WEB TOYBOX', WIDTH / 2, HEIGHT - 116, 6);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('無法產生圖片'))),
      'image/png'
    );
  });
}

/*
 * 觸發下載。
 * iOS Safari 不見得會存檔，多半是直接開啟圖片 —— 使用者長按仍然可以存下來。
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 給瀏覽器一點時間把檔案讀走再釋放。
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
