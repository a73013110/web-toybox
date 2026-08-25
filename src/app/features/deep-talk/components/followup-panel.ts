import { Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';

import { AppsScriptError } from '@core/api/apps-script-error';

import { DeepTalkApi } from '../deep-talk.api';

const MAX_DIRECTION_LENGTH = 40;

interface FollowupModel {
  direction: string;
}

/*
 * 「聊不下去了？」展開的那一區。
 *
 * 一顆按鈕分成兩段：展開時先顯示別人問過的追問 —— 那是讀試算表，不花配額也不用等；
 * 底下才是輸入框，想要新的再叫 AI。預設路徑不燒配額，是這個設計的重點。
 *
 * 這一區有自己的非同步狀態與表單，因此獨立成元件；換題目時由外層重建。
 */
@Component({
  selector: 'app-followup-panel',
  imports: [FormField],
  styleUrl: './followup-panel.css',
  template: `
    <p class="followup-lead" [hidden]="items().length === 0">{{ lead() }}</p>
    <ul class="followup-list">
      @for (item of items(); track $index) {
        <li>{{ item }}</li>
      }
    </ul>

    <form class="followup-ask" (submit)="_onAsk($event)">
      <label class="sr-only" for="followupDirection">想往哪個方向追問</label>
      <input
        class="input followup-input"
        id="followupDirection"
        type="text"
        autocomplete="off"
        placeholder="想往哪個方向追問？可留空"
        [formField]="form.direction"
      />
      <button class="btn btn-link followup-submit" type="submit" [disabled]="asking()">
        讓 AI 想幾個
      </button>
    </form>

    <p class="followup-status" role="status">{{ status() }}</p>
  `
})
export class FollowupPanel implements OnInit {
  private readonly _api = inject(DeepTalkApi);

  /** 目前這張題目的 id。元件由外層在換題時重建，因此不需要監看變化。 */
  readonly cardId = input.required<string>();

  private readonly _model = signal<FollowupModel>({ direction: '' });
  protected readonly form = form(this._model, (path) => {
    maxLength(path.direction, MAX_DIRECTION_LENGTH);
  });

  protected readonly items = signal<readonly string[]>([]);
  protected readonly lead = signal('');
  protected readonly status = signal('看看別人問過什麼…');
  protected readonly asking = signal(false);

  protected readonly hasItems = computed(() => this.items().length > 0);

  /*
   * ⚠️ 這段不能放進 constructor：required input 在建構當下還沒綁定，
   *    讀 cardId() 會直接拋錯，歷史追問就永遠不會送出（而且畫面上只會
   *    一直停在「看看別人問過什麼…」，看不出哪裡壞了）。
   *    這個元件每次展開都重建，因此一次性的 ngOnInit 正好夠用。
   */
  ngOnInit(): void {
    void this._loadHistory();
  }

  /** 展開時先讀別人問過的，不花 AI 配額。 */
  private async _loadHistory(): Promise<void> {
    const id = this.cardId();

    try {
      const followups = await this._api.loadFollowupHistory(id);

      this.items.set(followups);
      this.lead.set('別人問過的：');
      this.status.set(followups.length > 0 ? '' : '還沒有人問過這一題。要不要當第一個？');
    } catch {
      // 歷史讀不到不算什麼，輸入框還在，照樣可以叫 AI 想。
      this.items.set([]);
      this.lead.set('');
      this.status.set('');
    }
  }

  protected async _onAsk(event: Event): Promise<void> {
    event.preventDefault();
    if (this.asking()) return;

    this.asking.set(true);
    this.status.set('AI 正在想…');

    try {
      const followups = await this._api.generateFollowups(
        this.cardId(),
        this._model().direction.trim()
      );

      this.items.set(followups);
      this.lead.set('AI 想到的：');
      this.status.set('');
    } catch (error) {
      // 追問只是加分項，失敗就說一聲，不要把人擋在這裡。
      const code = error instanceof AppsScriptError ? error.code : undefined;
      this.status.set(
        code === 'rate_limited' ? '現在有點忙，等一下再試。' : 'AI 這次沒想出來，換個方向再試一次。'
      );
    } finally {
      this.asking.set(false);
    }
  }
}
