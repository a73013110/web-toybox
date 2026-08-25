/** 主題的三種狀態。沒有記錄就是「未指定」。 */
export type TopicPreference = 'want' | 'skip';

/** 主題 → 偏好。用普通物件而非 Map，才能直接進 localStorage 與 signal 的不可變更新。 */
export type TopicSelection = Readonly<Record<string, TopicPreference>>;

export type DeepTalkScreen = 'setup' | 'shuffle' | 'cards' | 'end' | 'trending' | 'error';

/** 後端回來的題目。欄位名由 apps-script/app-deep-talk.gs 決定。 */
export interface QuestionCard {
  readonly id: string;
  readonly text: string;
  readonly topics: readonly string[];
  readonly depth: string;
  readonly likes: number;
  readonly skips: number;
}

export interface TrendingCard {
  readonly text: string;
  readonly depth: string;
  readonly likes: number;
  readonly skips: number;
}

export type VoteKind = 'like' | 'skip';

export interface Vote {
  readonly id: string;
  readonly vote: VoteKind;
}

export interface DeckRequest {
  readonly stage: string;
  readonly depth: string;
  readonly prefer: readonly string[];
  readonly exclude: readonly string[];
  readonly seen: readonly string[];
  /** 這組條件已經發過牌，下一疊可以跳過暖場。 */
  readonly warm: boolean;
}

/** 錯誤畫面的重試按鈕。 */
export interface RetryAction {
  readonly label: string;
  /** 例如「回去改條件」時，返回鍵就沒有意義了。 */
  readonly hideBack?: boolean;
  readonly run: () => void;
}

/** 挑條件用的選項（關係階段、深度）。 */
export interface ChoiceOption {
  readonly value: string;
  readonly hint: string;
}
