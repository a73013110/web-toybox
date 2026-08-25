import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  linkedSignal,
  resource,
  signal
} from '@angular/core';

import { injectTimers } from '@shared/timing';

import { DeepTalkApi, describeDeepTalkError } from './deep-talk.api';
import { SEEN_LIMIT, loadSeen, loadSetup, saveSeen, saveSetup } from './deep-talk.storage';
import type {
  DeepTalkScreen,
  ErrorView,
  QuestionCard,
  RetryAction,
  TopicPreference,
  TopicSelection,
  TrendingCard,
  Vote,
  VoteKind
} from './deep-talk.types';
import { TOPICS } from './taxonomy';

const SETUP_STEPS = 3;
const TRENDING_LIMIT = 20;

/** 洗牌動畫至少跑這麼久，免得後端太快回應時只閃一下。 */
const SHUFFLE_MIN_MS = 900;

/** 票數太少的比例沒有意義，低於這個數就不顯示。 */
const LOVED_MIN_VOTES = 5;

const NEXT_TOPIC_STATE: Record<TopicPreference | 'none', TopicPreference | 'none'> = {
  none: 'want',
  want: 'skip',
  skip: 'none'
};

/*
 * Deep Talk 的所有狀態。
 *
 * ⚠️ 刻意不掛 providedIn: 'root'，而是由 deep-talk 這條 route 提供，
 *    離開頁面時整份狀態就釋放。代價是銷毀時要自己把還沒送出的回饋補送掉，
 *    見建構子裡的 DestroyRef.onDestroy —— 原生版本靠 pagehide，
 *    但 SPA 的「點返回鍵回首頁」不會觸發 pagehide，票會直接消失。
 */
@Injectable()
export class DeepTalkStore {
  private readonly _api = inject(DeepTalkApi);
  private readonly _timers = injectTimers();

  /* ── 畫面 ── */
  readonly screen = signal<DeepTalkScreen>('setup');
  readonly step = signal(1);

  /* ── 條件 ── */
  readonly stage = signal('');
  readonly depth = signal('');
  readonly topics = signal<TopicSelection>({});
  readonly setupError = signal('');

  /* ── 牌組 ── */
  readonly deck = signal<readonly QuestionCard[]>([]);

  /*
   * 換一疊牌就從第一張、零個讚重新開始。
   * linkedSignal 正是為此而生：平常可寫入，來源一變就重新計算，
   * 不必寫一個「把 deck 抄到 index」的 effect。
   */
  readonly index = linkedSignal({ source: this.deck, computation: () => 0 });
  readonly liked = linkedSignal({ source: this.deck, computation: () => 0 });

  /* ── 回饋 ── */
  readonly sendStatus = signal('');

  /** 已投但還沒送出的票。 */
  private readonly _pending = signal<readonly Vote[]>([]);
  readonly pendingCount = computed(() => this._pending().length);

  /* ── 錯誤 ── */
  readonly error = signal<ErrorView>({ message: '', retryLabel: '', showBack: false, run: noop });

  /* ── 熱門排行 ── */

  /*
   * 只有站在熱門排行畫面時才需要資料，因此 params 在其他畫面回傳 undefined ——
   * resource 會維持 idle、不打後端；切進來時自動載入，離開再回來自動重載。
   * 載入中、失敗、成功三種狀態由 resource 自己管，Store 不再自己記。
   */
  private readonly _trending = resource<readonly TrendingCard[], number | undefined>({
    params: () => (this.screen() === 'trending' ? TRENDING_LIMIT : undefined),
    loader: ({ params }) => this._api.loadTrending(params),
    defaultValue: []
  });

  /*
   * ⚠️ resource 失敗時 value() 會直接丟出錯誤，不是回傳 defaultValue。
   *    畫面只想要「有就列、沒有就空」，因此一律先問 hasValue()。
   */
  readonly trendingCards = computed<readonly TrendingCard[]>(() =>
    this._trending.hasValue() ? this._trending.value() : []
  );

  /** 沒有卡片可列時要顯示的一行字。 */
  readonly trendingStatus = computed(() => {
    if (this._trending.isLoading()) return '載入中…';

    const failure = this._trending.error();
    if (failure) return describeDeepTalkError(failure);

    return this.trendingCards().length === 0
      ? '還沒有累積到足夠的票數。去玩一疊，這裡就會長出來。'
      : '';
  });

  /* ── 衍生 ── */
  readonly currentCard = computed<QuestionCard | null>(() => this.deck()[this.index()] ?? null);

  readonly cardCount = computed(() => `${pad(this.index() + 1)} / ${pad(this.deck().length)}`);

  /** 票數夠多才顯示比例。 */
  readonly lovedLabel = computed(() => {
    const card = this.currentCard();
    if (!card) return '';

    const votes = card.likes + card.skips;
    if (votes < LOVED_MIN_VOTES) return '';

    return `${Math.round((card.likes / votes) * 100)}% 的人說這題很讚`;
  });

  readonly wantTopics = computed(() => this._topicsBy('want'));
  readonly skipTopics = computed(() => this._topicsBy('skip'));

  readonly topicSummary = computed(() => {
    const parts: string[] = [];
    const want = this.wantTopics();
    const skip = this.skipTopics();

    if (want.length > 0) parts.push(`想聊 ${want.join('、')}`);
    if (skip.length > 0) parts.push(`不碰 ${skip.join('、')}`);

    return parts.join('　·　') || '沒有特別指定，什麼都可能抽到';
  });

  readonly stageLabel = computed(() => [this.stage(), this.depth()].filter(Boolean).join(' · '));

  readonly setupProgressPercent = computed(() => (this.step() / SETUP_STEPS) * 100);

  readonly endSummary = computed(() =>
    this.liked() > 0
      ? `其中 ${this.liked()} 題你們按了讚，這會影響大家看到的熱門排行。`
      : '這一疊沒有特別喜歡的，換個主題也許會更對味。'
  );

  /** 看過的題目 id，避免下次又抽到同一批。 */
  private _seen: readonly string[] = [];
  /** 這組條件下已經發過牌，下一疊可以跳過暖場。 */
  private _warm = false;
  private _trendingFrom: DeepTalkScreen = 'setup';

  constructor() {
    // Store 隨頁面銷毀，最後一次機會把票送出去。
    inject(DestroyRef).onDestroy(() => this.flushPending());
  }

  /* ── 條件設定 ── */

  /** 讀回上次的條件。只在瀏覽器呼叫（prerender 沒有 localStorage）。 */
  restoreSetup(): void {
    this._seen = loadSeen();

    const saved = loadSetup();
    if (!saved) return;

    this.stage.set(saved.stage);
    this.depth.set(saved.depth);
    this.topics.set(saved.topics);
  }

  /*
   * 重點同一顆只是「確認並繼續」，條件其實沒變，不該把暖場狀態一起洗掉。
   * 這也是元件聽 click 而不是 change 的原因：倒回上一步後再點同一顆，
   * change 不會觸發，使用者就卡住了。
   */
  pickStage(value: string): void {
    if (value !== this.stage()) {
      this.stage.set(value);
      this._warm = false; // 條件變了，下一疊要重新暖場。
    }
    this.step.set(2);
  }

  pickDepth(value: string): void {
    if (value !== this.depth()) {
      this.depth.set(value);
      this._warm = false;
    }
    this.step.set(3);
  }

  cycleTopic(topic: string): void {
    const next = NEXT_TOPIC_STATE[this.topicStateOf(topic)];

    this.topics.update((topics) => {
      const updated: Record<string, TopicPreference> = { ...topics };

      if (next === 'none') {
        delete updated[topic];
      } else {
        updated[topic] = next;
      }

      return updated;
    });
  }

  topicStateOf(topic: string): TopicPreference | 'none' {
    return this.topics()[topic] ?? 'none';
  }

  goToStep(step: number): void {
    this.step.set(Math.min(SETUP_STEPS, Math.max(1, step)));
  }

  backStep(): void {
    this.goToStep(this.step() - 1);
  }

  /* ── 發牌 ── */

  async start(): Promise<void> {
    if (!this.stage() || !this.depth()) {
      this.setupError.set('先回去把關係與深度選一選。');
      this.goToStep(this.stage() ? 2 : 1);
      return;
    }

    this.setupError.set('');
    saveSetup({ stage: this.stage(), depth: this.depth(), topics: this.topics() });
    await this.startDeck(this._warm);
  }

  async startDeck(warm: boolean): Promise<void> {
    this.screen.set('shuffle');
    const startedAt = performance.now();

    try {
      const cards = await this._api.loadDeck({
        stage: this.stage(),
        depth: this.depth(),
        prefer: this.wantTopics(),
        exclude: this.skipTopics(),
        seen: this._seen,
        warm
      });

      await this._timers.hold(startedAt, SHUFFLE_MIN_MS);

      if (cards.length === 0) {
        this._showEmptyDeck();
        return;
      }

      this.deck.set(cards); // index 與 liked 是 linkedSignal，會跟著歸零。
      this._warm = true;

      // 記住看過哪些題目，下次回來才不會又抽到同一批。
      this._seen = [...cards.map((card) => card.id), ...this._seen].slice(0, SEEN_LIMIT);
      saveSeen(this._seen);

      this.screen.set('cards');
    } catch (failure) {
      await this._timers.hold(startedAt, SHUFFLE_MIN_MS);
      this.showError(describeDeepTalkError(failure));
    }
  }

  /* ── 投票 ── */

  vote(kind: VoteKind): void {
    const card = this.currentCard();
    if (!card) return;

    this._pending.update((votes) => [...votes, { id: card.id, vote: kind }]);
    if (kind === 'like') this.liked.update((count) => count + 1);

    if (this.index() + 1 >= this.deck().length) {
      void this._finish();
      return;
    }

    this.index.update((index) => index + 1);
  }

  private async _finish(): Promise<void> {
    this.screen.set('end');

    const votes = this._takePending();
    if (votes.length === 0) {
      this.sendStatus.set('');
      return;
    }

    this.sendStatus.set('正在送出回饋…');

    try {
      await this._api.sendFeedback(votes);
      this.sendStatus.set('回饋收到了，謝謝。');
    } catch {
      this.sendStatus.set('回饋沒送出去，不影響你們剛剛聊的內容。');
    }
  }

  /*
   * 中途離開時把還沒送出的票補送。
   * 送不到也無所謂 —— 票數只是用來排序，不是必須完整的資料。
   */
  flushPending(): void {
    const votes = this._takePending();
    if (votes.length > 0) this._api.beaconFeedback(votes);
  }

  /* ── 收尾與重來 ── */

  async again(): Promise<void> {
    await this.startDeck(true);
  }

  restart(): void {
    this._warm = false;
    this.goToStep(1);
    this.screen.set('setup');
  }

  /* ── 熱門排行 ── */

  showTrending(): void {
    this._trendingFrom = this.screen();
    this.screen.set('trending'); // 資料由 _trending resource 自己去載。
  }

  backFromTrending(): void {
    this.screen.set(this._trendingFrom);
  }

  /* ── 錯誤 ── */

  showError(message: string, retry?: RetryAction): void {
    this.error.set({
      message,
      retryLabel: retry?.label ?? '再試一次',
      showBack: !retry?.hideBack,
      run: retry?.run ?? (() => void this.startDeck(this._warm))
    });
    this.screen.set('error');
  }

  private _showEmptyDeck(): void {
    if (this._seen.length > 0) {
      this.showError('符合這些條件的題目都聊過了。', {
        label: '把看過的重新洗回去',
        run: () => {
          this._seen = [];
          saveSeen(this._seen);
          void this.startDeck(false);
        }
      });
      return;
    }

    this.showError('這個組合目前沒有題目，試著少排除幾個主題，或把深度調淺一點。', {
      label: '回去改條件',
      hideBack: true,
      run: () => this.restart()
    });
  }

  /* ── 內部 ── */

  /** 取出待送的票並清空佇列，確保同一批不會被送兩次。 */
  private _takePending(): readonly Vote[] {
    const votes = this._pending();
    if (votes.length > 0) this._pending.set([]);

    return votes;
  }

  private _topicsBy(kind: TopicPreference): readonly string[] {
    const topics = this.topics();
    // 依 TOPICS 的順序輸出，讓摘要文字不受使用者點選順序影響。
    return TOPICS.filter((topic) => topics[topic] === kind);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function noop(): void {
  /* 沒有錯誤時的預留位置。 */
}
