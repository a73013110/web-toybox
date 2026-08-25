import type { TopicPreference, TopicSelection } from './deep-talk.types';
import { DEPTHS, STAGES, TOPICS } from './taxonomy';

export const STORAGE_SETUP = 'deep-talk:setup';
export const STORAGE_SEEN = 'deep-talk:seen';

/** 與 apps-script/app-deep-talk.gs 的上限一致。 */
export const SEEN_LIMIT = 300;

export interface SavedSetup {
  readonly stage: string;
  readonly depth: string;
  readonly topics: TopicSelection;
}

/*
 * localStorage 在無痕模式下會直接丟例外，整頁不該因此掛掉。
 * 讀不到就當作沒設定過，寫不進去就算了 —— 只是下次要重新選一遍。
 */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了。
  }
}

/*
 * 讀回上次的條件。
 *
 * 存進去的內容可能來自舊版本，或被使用者手動改過，
 * 因此每個欄位都要對照目前的 taxonomy 驗一次才收下。
 */
export function loadSetup(): SavedSetup | null {
  const saved = readJson<Partial<SavedSetup> | null>(STORAGE_SETUP, null);
  if (!saved) return null;

  const topics: Record<string, TopicPreference> = {};
  for (const [topic, value] of Object.entries(saved.topics ?? {})) {
    if (TOPICS.includes(topic) && (value === 'want' || value === 'skip')) {
      topics[topic] = value;
    }
  }

  return {
    stage: STAGES.some((option) => option.value === saved.stage) ? (saved.stage ?? '') : '',
    depth: DEPTHS.some((option) => option.value === saved.depth) ? (saved.depth ?? '') : '',
    topics
  };
}

export function saveSetup(setup: SavedSetup): void {
  writeJson(STORAGE_SETUP, setup);
}

export function loadSeen(): readonly string[] {
  const seen = readJson<unknown>(STORAGE_SEEN, []);
  return Array.isArray(seen) ? seen.filter((id): id is string => typeof id === 'string') : [];
}

export function saveSeen(seen: readonly string[]): void {
  writeJson(STORAGE_SEEN, seen);
}
