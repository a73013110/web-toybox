import { TestBed } from '@angular/core/testing';

import { DeepTalkApi } from './deep-talk.api';
import { DeepTalkStore } from './deep-talk.store';
import { STORAGE_SEEN, STORAGE_SETUP } from './deep-talk.storage';
import type { DeckRequest, QuestionCard, TrendingCard, Vote } from './deep-talk.types';

function card(id: string, extra: Partial<QuestionCard> = {}): QuestionCard {
  return { id, text: `題目 ${id}`, topics: [], depth: '破冰', likes: 0, skips: 0, ...extra };
}

/** 記下所有呼叫，並讓每個方法都能被個別覆寫。 */
class FakeApi {
  deckRequests: DeckRequest[] = [];
  sentFeedback: Vote[][] = [];
  beaconedFeedback: Vote[][] = [];

  deckResult: readonly QuestionCard[] = [card('a'), card('b')];
  deckError: unknown = null;
  trendingResult: readonly TrendingCard[] = [];
  feedbackError: unknown = null;

  loadDeck(request: DeckRequest): Promise<readonly QuestionCard[]> {
    this.deckRequests.push(request);
    return this.deckError ? Promise.reject(this.deckError) : Promise.resolve(this.deckResult);
  }

  sendFeedback(votes: readonly Vote[]): Promise<void> {
    this.sentFeedback.push([...votes]);
    return this.feedbackError ? Promise.reject(this.feedbackError) : Promise.resolve();
  }

  beaconFeedback(votes: readonly Vote[]): boolean {
    this.beaconedFeedback.push([...votes]);
    return true;
  }

  loadTrending(): Promise<readonly TrendingCard[]> {
    return Promise.resolve(this.trendingResult);
  }
}

/*
 * 測試環境沒有 localStorage 全域（正式程式碼包在 try/catch 裡，因此不受影響，
 * 但這裡要真的驗證存取行為），裝一個記憶體版的替身。
 */
function installFakeStorage(): Storage {
  const entries = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value)
  };

  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });

  return fake;
}

describe('DeepTalkStore', () => {
  let api: FakeApi;
  let store: DeepTalkStore;

  beforeEach(() => {
    installFakeStorage();
    api = new FakeApi();

    TestBed.configureTestingModule({
      providers: [DeepTalkStore, { provide: DeepTalkApi, useValue: api }]
    });
    store = TestBed.inject(DeepTalkStore);

    // 洗牌至少要 900ms，測試不需要真的等。
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /** 走完 start() 流程，並把洗牌的最短等待時間快轉掉。 */
  async function start(): Promise<void> {
    const pending = store.start();
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
  }

  /** 直接發一疊，並把洗牌的最短等待時間快轉掉。 */
  async function startDeck(warm = false): Promise<void> {
    const pending = store.startDeck(warm);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
  }

  describe('挑條件', () => {
    it('重點同一顆不會清掉暖場狀態', async () => {
      store.pickStage('交往中');
      store.pickDepth('深入');
      await startDeck(true);

      store.goToStep(1);
      store.pickStage('交往中'); // 同一顆＝確認並繼續
      await start();

      expect(api.deckRequests.at(-1)?.warm).toBe(true);
      expect(store.step()).toBe(2);
    });

    it('換一顆會把暖場狀態洗掉', async () => {
      store.pickStage('交往中');
      store.pickDepth('深入');
      await startDeck(true);

      store.pickStage('剛認識'); // 條件變了
      await start();

      expect(api.deckRequests.at(-1)?.warm).toBe(false);
    });

    it('主題點三下會繞回未指定', () => {
      expect(store.topicStateOf('金錢觀')).toBe('none');

      store.cycleTopic('金錢觀');
      expect(store.topicStateOf('金錢觀')).toBe('want');

      store.cycleTopic('金錢觀');
      expect(store.topicStateOf('金錢觀')).toBe('skip');

      store.cycleTopic('金錢觀');
      expect(store.topicStateOf('金錢觀')).toBe('none');
    });

    it('摘要文字依 taxonomy 的順序輸出，不受點選順序影響', () => {
      store.cycleTopic('遺憾'); // want
      store.cycleTopic('金錢觀'); // want

      expect(store.topicSummary()).toBe('想聊 金錢觀、遺憾');
    });

    it('沒選關係或深度就按開始，會被擋下並退回該補的那一步', async () => {
      await store.start();

      expect(store.setupError()).toBe('先回去把關係與深度選一選。');
      expect(store.step()).toBe(1);
      expect(api.deckRequests).toHaveLength(0);

      store.pickStage('交往中');
      await store.start();

      expect(store.step()).toBe(2); // 關係有了，缺深度
      expect(api.deckRequests).toHaveLength(0);
    });
  });

  describe('發牌', () => {
    it('成功後進入抽卡畫面並記住看過的題目', async () => {
      await startDeck();

      expect(store.screen()).toBe('cards');
      expect(store.deck()).toHaveLength(2);
      expect(JSON.parse(localStorage.getItem(STORAGE_SEEN) ?? '[]')).toEqual(['a', 'b']);
    });

    it('沒有題目且看過一些時，提供「重新洗回去」的重試', async () => {
      await startDeck();
      api.deckResult = [];
      await startDeck();

      expect(store.screen()).toBe('error');
      expect(store.errorMessage()).toBe('符合這些條件的題目都聊過了。');
      expect(store.retryLabel()).toBe('把看過的重新洗回去');

      // 重試會清掉 seen 再抽一次
      api.deckResult = [card('c')];
      store.runRetry();
      await vi.advanceTimersByTimeAsync(1000);

      expect(api.deckRequests.at(-1)?.seen).toEqual([]);
      expect(store.screen()).toBe('cards');
    });

    it('第一次就沒有題目時，改叫使用者回去改條件', async () => {
      api.deckResult = [];
      await startDeck();

      expect(store.errorMessage()).toContain('這個組合目前沒有題目');
      expect(store.hideErrorBack()).toBe(true);
    });

    it('後端出錯時顯示這個作品自己的說法', async () => {
      api.deckError = new Error('boom');
      await startDeck();

      expect(store.screen()).toBe('error');
      expect(store.errorMessage()).toBe('沒能連上題庫，請檢查網路後再試一次。');
    });
  });

  describe('投票', () => {
    it('翻到最後一張會進入收尾並送出回饋', async () => {
      await startDeck();

      store.vote('like');
      expect(store.screen()).toBe('cards');
      expect(store.index()).toBe(1);

      store.vote('skip');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.screen()).toBe('end');
      expect(api.sentFeedback).toEqual([
        [
          { id: 'a', vote: 'like' },
          { id: 'b', vote: 'skip' }
        ]
      ]);
      expect(store.liked()).toBe(1);
    });

    it('回饋送不出去時只說一聲，不影響已經聊過的內容', async () => {
      await startDeck();
      api.feedbackError = new Error('offline');

      store.vote('like');
      store.vote('like');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.screen()).toBe('end');
      expect(store.sendStatus()).toBe('回饋沒送出去，不影響你們剛剛聊的內容。');
    });
  });

  describe('待送回饋的補送', () => {
    it('flushPending 用 beacon 送出並清空佇列', async () => {
      await startDeck();
      store.vote('like');

      expect(store.pendingCount()).toBe(1);

      store.flushPending();

      expect(api.beaconedFeedback).toEqual([[{ id: 'a', vote: 'like' }]]);
      expect(store.pendingCount()).toBe(0);
    });

    it('沒有待送的票時不會送出空的 beacon', () => {
      store.flushPending();

      expect(api.beaconedFeedback).toHaveLength(0);
    });

    /*
     * 這是 SPA 化最容易靜默壞掉的一點：原生版本靠 pagehide + sendBeacon，
     * 但「點返回鍵回首頁」不會觸發 pagehide，Store 只是被銷毀而已。
     */
    it('Store 被銷毀時會把還沒送出的票補送掉', async () => {
      await startDeck();
      store.vote('like');

      TestBed.resetTestingModule(); // 等同離開頁面、route-scoped 的 Store 被銷毀

      expect(api.beaconedFeedback).toEqual([[{ id: 'a', vote: 'like' }]]);
    });
  });

  describe('localStorage', () => {
    it('讀不到或格式不對時當作沒設定過，不會整頁壞掉', () => {
      localStorage.setItem(STORAGE_SETUP, '{ 這不是 JSON');
      localStorage.setItem(STORAGE_SEEN, 'nope');

      expect(() => store.restoreSetup()).not.toThrow();
      expect(store.stage()).toBe('');
    });

    it('存進去的條件若不在目前的 taxonomy 內就丟掉', () => {
      localStorage.setItem(
        STORAGE_SETUP,
        JSON.stringify({ stage: '已離婚', depth: '深入', topics: { 不存在的主題: 'want' } })
      );

      store.restoreSetup();

      expect(store.stage()).toBe(''); // 舊值已不在 STAGES
      expect(store.depth()).toBe('深入');
      expect(store.topics()).toEqual({});
    });
  });
});
