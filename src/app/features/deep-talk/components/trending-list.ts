import { Component, computed, input } from '@angular/core';

import type { TrendingCard } from '../deep-talk.types';

/*
 * 排行榜的呈現。
 *
 * 名次與統計文字都先在 computed 裡算好，template 只負責印 ——
 * 在 template 裡呼叫方法的話，每次變更偵測都會整份重算一遍。
 */
@Component({
  selector: 'app-trending-list',
  styleUrl: './trending-list.css',
  template: `
    <ol class="rank-list">
      @for (row of rows(); track $index) {
        <li class="rank-item">
          <span class="rank-number">{{ row.rank }}</span>
          <div class="rank-body">
            <p class="rank-question">{{ row.text }}</p>
            <p class="rank-meta">{{ row.meta }}</p>
          </div>
        </li>
      }
    </ol>
    @if (status()) {
      <p class="rank-empty">{{ status() }}</p>
    }
  `
})
export class TrendingList {
  readonly cards = input.required<readonly TrendingCard[]>();
  /** 載入中、載入失敗或沒有資料時要顯示的一行字。 */
  readonly status = input.required<string>();

  protected readonly rows = computed(() =>
    this.cards().map((card, index) => {
      const votes = card.likes + card.skips;
      const loved = votes > 0 ? Math.round((card.likes / votes) * 100) : 0;

      return {
        rank: String(index + 1).padStart(2, '0'),
        text: card.text,
        meta: `${loved}% 說很讚 · ${votes} 票 · ${card.depth}`
      };
    })
  );
}
