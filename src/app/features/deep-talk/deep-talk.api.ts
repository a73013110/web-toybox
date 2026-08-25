import { Injectable, inject } from '@angular/core';

import { AppsScriptClient } from '@core/api/apps-script-client';
import { AppsScriptError, describeAppsScriptError } from '@core/api/apps-script-error';

import type { DeckRequest, QuestionCard, TrendingCard, Vote } from './deep-talk.types';

/*
 * Deep Talk 的後端呼叫。
 *
 * action 名稱與 payload 形狀只出現在這裡，Store 與元件都看不到，
 * 對外只給具業務語意的方法。
 */
@Injectable({ providedIn: 'root' })
export class DeepTalkApi {
  private readonly _client = inject(AppsScriptClient);

  /** 抽一疊題目。刻意只在「選完條件」時打這一次，之後翻牌都在前端跑。 */
  async loadDeck(request: DeckRequest): Promise<readonly QuestionCard[]> {
    const result = await this._client.send<{ cards?: QuestionCard[] }>('deep-talk', {
      action: 'deck',
      stage: request.stage,
      depth: request.depth,
      prefer: [...request.prefer],
      exclude: [...request.exclude],
      seen: [...request.seen],
      warm: request.warm
    });

    return result.cards ?? [];
  }

  async sendFeedback(votes: readonly Vote[]): Promise<void> {
    await this._client.send('deep-talk', { action: 'feedback', votes: [...votes] });
  }

  /** 頁面即將消失時的補送。拿不到結果，送不到也無所謂。 */
  beaconFeedback(votes: readonly Vote[]): boolean {
    return this._client.beacon('deep-talk', { action: 'feedback', votes: [...votes] });
  }

  /** 別人問過的追問。讀試算表，不花 AI 配額。 */
  async loadFollowupHistory(id: string): Promise<readonly string[]> {
    const result = await this._client.send<{ followups?: string[] }>('deep-talk', {
      action: 'followup-history',
      id
    });

    return result.followups ?? [];
  }

  /** 叫 AI 想幾個新的追問。 */
  async generateFollowups(id: string, direction: string): Promise<readonly string[]> {
    const result = await this._client.send<{ followups?: string[] }>('deep-talk', {
      action: 'followup',
      id,
      direction
    });

    return result.followups ?? [];
  }

  async loadTrending(limit: number): Promise<readonly TrendingCard[]> {
    const result = await this._client.send<{ cards?: TrendingCard[] }>('deep-talk', {
      action: 'trending',
      limit
    });

    return result.cards ?? [];
  }
}

/** 共用的錯誤訊息，加上這個作品自己的說法。 */
export function describeDeepTalkError(error: unknown): string {
  const code = error instanceof AppsScriptError ? error.code : undefined;

  if (code === 'invalid_depth') {
    return '這個頁面的版本太舊了，請重新整理後再試一次。';
  }

  if (code === 'timeout' || code === 'rate_limited') {
    return describeAppsScriptError(error);
  }

  return '沒能連上題庫，請檢查網路後再試一次。';
}
