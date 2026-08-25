import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

import { DeepTalkStore } from './deep-talk.store';
import type { VoteKind } from './deep-talk.types';
import { QuestionCard } from './components/question-card';
import { TalkSetup } from './components/talk-setup';
import { TrendingList } from './components/trending-list';

/*
 * Deep Talk 的頁面外殼。
 *
 * 這裡只做三件事：切畫面、把 Store 的狀態餵給子元件、把子元件的事件轉成 Store 動作。
 * 所有狀態都在 DeepTalkStore；Store 掛在這條 route 上，離開頁面就釋放。
 */
@Component({
  selector: 'app-deep-talk',
  imports: [RouterLink, TalkSetup, QuestionCard, TrendingList],
  templateUrl: './deep-talk.html',
  styleUrl: './deep-talk.css',
  providers: [DeepTalkStore],
  host: {
    // pagehide 在行動瀏覽器比 unload 可靠，桌機切分頁則靠 visibilitychange。
    // 「點返回鍵回首頁」兩者都不會觸發，那條路徑由 Store 的 DestroyRef 收尾。
    '(window:pagehide)': 'store.flushPending()',
    '(document:visibilitychange)': '_onVisibilityChange()'
  }
})
export class DeepTalk {
  protected readonly store = inject(DeepTalkStore);
  private readonly _injector = inject(Injector);

  /** 翻牌動畫要每次重播，因此先卸下 class、下一次 render 再掛上。 */
  protected readonly turning = signal(false);

  constructor() {
    setPageMeta({
      title: 'Deep Talk — Web Toybox',
      description: '挑好關係、深度與想聊的主題，抽一疊由淺入深的問題，陪兩個人聊得再深一點。'
    });

    // localStorage 只有瀏覽器才有，prerender 時整段跳過。
    afterNextRender(() => this.store.restoreSetup());
  }

  protected _onVote(kind: VoteKind): void {
    this.store.vote(kind);
    this.turning.set(false);
    afterNextRender(() => this.turning.set(true), { injector: this._injector });
  }

  protected _onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') this.store.flushPending();
  }
}
