import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import type { FieldState } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { describeAppsScriptError } from '@core/api/apps-script-error';
import { setPageMeta } from '@core/seo/page-meta';
import { injectTimers } from '@shared/timing';

import { AmbientBackdrop } from './ambient-backdrop';
import { ConfettiBurst } from './confetti-burst';
import { InvitationCardApi } from './invitation-card.api';
import { invitationSchema } from './invitation-card.schema';
import {
  ACTIVITY_OPTIONS,
  CONFIRMATION_REACTIONS,
  createInvitationModel,
  CUSTOM_ACTIVITY_ICON,
  DECLINE_REACTIONS,
  DEFAULT_DECLINE_LABEL,
  DEFAULT_SUB_TEXT,
  MAX_NAME_LENGTH,
  MIN_CONFIRMATION_MS,
  TIMING_OPTIONS
} from './invitation-card.data';
import { normalizeInvitationText } from './invitation-card.normalization';
import type { InvitationModel } from './invitation-card.types';
import { injectReducedMotion } from './reduced-motion';
import { WaitingMessage } from './waiting-message';

const TOTAL_STEPS = 5;

@Component({
  selector: 'app-invitation-card',
  imports: [RouterLink, FormField, AmbientBackdrop, ConfettiBurst, WaitingMessage],
  templateUrl: './invitation-card.html',
  styleUrl: './invitation-card.css',
  host: {
    '[class.name-gate-open]': 'nameGateOpen()'
  }
})
export class InvitationCard {
  private readonly _api = inject(InvitationCardApi);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);
  private readonly _timers = injectTimers();
  private readonly _reduceMotion = injectReducedMotion();

  /*
   * ?invite=<名字>。withComponentInputBinding() 讓 router 直接把 query parameter
   * 綁進 input，元件因此不需要注入 ActivatedRoute，也不必自己去解析網址。
   */
  readonly invite = input('', {
    transform: (value: unknown) => normalizeInvitationText(value).slice(0, MAX_NAME_LENGTH)
  });

  private readonly _confetti = viewChild.required(ConfettiBurst);

  protected readonly timingOptions = TIMING_OPTIONS;
  protected readonly activityOptions = ACTIVITY_OPTIONS;
  protected readonly customActivityIcon = CUSTOM_ACTIVITY_ICON;
  protected readonly confirmationMessages = CONFIRMATION_REACTIONS;

  /* ── Signal Forms：model 是唯一資料源，驗證規則見 invitation-card.schema.ts ── */
  private readonly _model = signal<InvitationModel>(createInvitationModel());

  protected readonly form = form(this._model, invitationSchema);

  /* ── 畫面狀態 ── */
  protected readonly step = signal(1);
  protected readonly nameGateOpen = signal(false);
  protected readonly subText = signal(DEFAULT_SUB_TEXT);
  protected readonly subFading = signal(false);
  protected readonly isTeasing = signal(false);
  protected readonly declineCount = signal(0);
  protected readonly confirming = signal(false);
  protected readonly submitError = signal('');
  protected readonly summary = signal<{ timing: string; activities: string } | null>(null);

  /** 送出成功的那份選擇。內容沒改就不讓重送。 */
  private readonly _submittedSignature = signal('');

  /* ── 衍生狀態 ── */
  protected readonly stepLabel = computed(() => `${pad(this.step())} / ${pad(TOTAL_STEPS)}`);
  protected readonly progressPercent = computed(() => (this.step() / TOTAL_STEPS) * 100);
  protected readonly waitingIntervalMs = computed(() => (this._reduceMotion() ? 200 : 480));

  protected readonly inviteeName = computed(() =>
    normalizeInvitationText(this._model().inviteeName)
  );

  protected readonly declineLabel = computed(
    () => DECLINE_REACTIONS[this.declineCount() - 1]?.label ?? DEFAULT_DECLINE_LABEL
  );
  protected readonly declineExhausted = computed(
    () => this.declineCount() >= DECLINE_REACTIONS.length
  );

  /* 每次婉拒都讓按鈕換位置，也讓「願意」悄悄更有存在感。 */
  private readonly _dodgeDirection = computed(() => (this.declineCount() % 2 === 0 ? -1 : 1));
  protected readonly dodgeX = computed(
    () => this._dodgeDirection() * (18 + this.declineCount() * 8)
  );
  protected readonly dodgeRotate = computed(
    () => this._dodgeDirection() * (1 + this.declineCount() * 0.6)
  );
  protected readonly yesScale = computed(() => 1 + this.declineCount() * 0.025);

  /** 實際要送出的活動標籤。自訂項目要勾選且填有內容才算數。 */
  protected readonly chosenActivities = computed<readonly string[]>(() => {
    const model = this._model();
    const preset = ACTIVITY_OPTIONS.filter((option) => model.activities[option.key]).map(
      (option) => option.label
    );
    const custom = normalizeInvitationText(model.customActivity);

    return model.customEnabled && custom ? [...preset, custom] : preset;
  });

  protected readonly selectionLabel = computed(() => {
    const count = this.chosenActivities().length;
    return count > 0 ? `已選擇 ${count} 項` : '尚未選擇';
  });

  private readonly _selectionSignature = computed(() =>
    JSON.stringify([this._model().timing, this.chosenActivities()])
  );
  protected readonly alreadySubmitted = computed(
    () => this._selectionSignature() === this._submittedSignature()
  );

  protected readonly confirmDisabled = computed(
    () =>
      this.confirming() ||
      this.form.activities().invalid() ||
      this.form.customActivity().invalid() ||
      this.alreadySubmitted()
  );

  protected readonly confirmLabel = computed(() => {
    if (this.confirming()) return '正在喬時間';
    if (this.alreadySubmitted()) return '已送出';

    const count = this.chosenActivities().length;
    return count > 0 ? `確認 ${count} 項選擇` : '確認選擇';
  });

  /** 只有被碰過的欄位才顯示錯誤，避免一進畫面就滿江紅。 */
  protected readonly nameError = computed(() => errorOf(this.form.inviteeName()));
  protected readonly timingError = computed(() => errorOf(this.form.timing()));
  protected readonly activityError = computed(() => {
    if (this.submitError()) return this.submitError();

    // 自訂項目缺內容時立刻提示，不等使用者離開欄位——
    // 送出鍵會同時變灰，沒有說明的話沒人知道卡在哪。
    return this.form.customActivity().errors()[0]?.message ?? errorOf(this.form.activities());
  });

  private _subTextToken = 0;

  constructor() {
    setPageMeta({
      title: 'Invitation Card — Web Toybox',
      description: '選擇空檔暗號與活動，完成一張專屬的邀請卡。'
    });

    /*
     * 名字關卡刻意等到 hydration 之後才決定要不要打開。
     *
     * 分享出去的網址一律帶著 ?invite=，那條路徑最重要：prerender 產物維持
     * 「關卡關著」的樣子，受邀者一進來就直接看到卡片，不會先閃過一層遮罩。
     * 也因此所有場景都留在 DOM 裡、只切換 hidden —— 結構若在瀏覽器端才長出來，
     * hydration 會對不起來。
     */
    afterNextRender(() => {
      const invited = this.invite();

      if (invited) {
        this.form.inviteeName().value.set(invited);
        return;
      }

      this.nameGateOpen.set(true);
      this._focusFirst('.name-input');
    });
  }

  /* ── 名字關卡 ── */

  protected _onNameSubmit(event: Event): void {
    event.preventDefault();
    const normalizedName = normalizeInvitationText(this.form.inviteeName().value());
    this.form.inviteeName().value.set(normalizedName);
    this.form.inviteeName().markAsTouched();

    if (this.form.inviteeName().invalid()) {
      this._focusFirst('.name-input');
      return;
    }

    this.nameGateOpen.set(false);
    this._focusActiveScene();
  }

  /* ── 場景切換 ── */

  protected _onBack(): void {
    if (this.step() > 1) this._goToStep(this.step() - 1); // 保留已填內容並回到前一頁。
  }

  protected _onAccept(): void {
    this._confetti().burst(12);
    this._timers.after(this._reduceMotion() ? 0 : 320, () => this._goToStep(2));
  }

  protected _onContinue(): void {
    this._goToStep(3);
  }

  protected _onDecline(): void {
    const reaction = DECLINE_REACTIONS[this.declineCount()];
    if (!reaction) return;

    this._setSubText(reaction.message);
    this.declineCount.update((count) => count + 1);
    this.isTeasing.set(true);
  }

  /*
   * 搖晃動畫播完就把 class 卸掉，下一次婉拒才會重播。
   * animationend 會冒泡，場景自己的 fadeUp 也會經過這裡，因此要確認事件來自卡片本身。
   */
  protected _onCardAnimationEnd(event: AnimationEvent): void {
    if (event.target === event.currentTarget) this.isTeasing.set(false);
  }

  protected _onTimingSubmit(event: Event): void {
    event.preventDefault();
    this.form.timing().markAsTouched();

    if (this.form.timing().invalid()) {
      this._focusFirst('.timing-option input');
      return;
    }

    this._goToStep(4);
  }

  /* ── 活動選擇與送出 ── */

  protected _onCustomActivityFocus(): void {
    this.form.customEnabled().value.set(true); // 點入文字欄時自動選取「自己填寫」。
  }

  protected _onCustomActivityInput(event: Event): void {
    // 直接讀 DOM 的值，不依賴 [formField] 與這個 handler 的執行順序。
    const value = (event.target as HTMLInputElement).value;
    this.form.customEnabled().value.set(Boolean(value.trim()));
  }

  protected async _onActivitySubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.confirming()) return;

    this.submitError.set('');

    const startedAt = performance.now();
    this.confirming.set(true); // 等待文字由 <app-waiting-message> 自己循環播放。

    // submit() 會先標記 touched 並驗證，沒過就不會執行 action。
    const succeeded = await submit(this.form, {
      action: async () => {
        await this._api.submitInvitation({
          inviteeName: this.inviteeName(),
          declineCount: this.declineCount(),
          timing: this._model().timing,
          activities: this.chosenActivities(),
          page: location.href
        });
        return undefined;
      },
      onInvalid: () => this._recoverFromInvalidSubmission()
    }).catch((error: unknown) => {
      console.error(error);
      // 此功能只收集回覆，不會直接建立行事曆行程。
      this.submitError.set(describeAppsScriptError(error));
      return false;
    });

    if (!succeeded) {
      this.confirming.set(false);
      return;
    }

    // 送出很快時仍讓過場走完，避免畫面一閃而過。
    await this._timers.hold(startedAt, this._reduceMotion() ? 0 : MIN_CONFIRMATION_MS);

    this.summary.set({
      timing: this._model().timing,
      activities: this.chosenActivities().join('、')
    });
    this._submittedSignature.set(this._selectionSignature()); // 同一份結果不再重複提交。
    this.confirming.set(false);
    this._goToStep(5);
    this._confetti().burst(20);
  }

  /* ── 重新開始 ── */

  protected _onRestart(): void {
    const name = this.inviteeName();

    this.form().reset(createInvitationModel());
    this.step.set(1);
    this.declineCount.set(0);
    this.subText.set(DEFAULT_SUB_TEXT);
    this.subFading.set(false);
    this.isTeasing.set(false);
    this.confirming.set(false);
    this.submitError.set('');
    this.summary.set(null);
    this._submittedSignature.set('');
    this._subTextToken += 1; // 讓還在等待中的文字動畫失效。

    // 名字是進入流程的前提，重新開始時不清掉。
    this.form.inviteeName().value.set(name);
  }

  /* ── 內部 ── */

  private _goToStep(step: number): void {
    this.step.set(step);
    this._focusActiveScene();
  }

  private _setSubText(text: string): void {
    const token = ++this._subTextToken;
    this.subFading.set(true);

    this._timers.after(this._reduceMotion() ? 0 : 220, () => {
      if (token !== this._subTextToken) return; // 忽略已被後續呼叫取代的文字動畫。
      this.subText.set(text);
      this.subFading.set(false);
    });
  }

  /**
   * 正常流程不會缺少前置欄位；若狀態被還原、外部資料異常或日後流程改版，
   * 仍要把使用者帶回真正有問題的位置，不能讓確認鍵看起來毫無反應。
   */
  private _recoverFromInvalidSubmission(): void {
    if (this.form.inviteeName().invalid()) {
      this.nameGateOpen.set(true);
      this._focusFirst('.name-input');
      return;
    }

    if (this.form.timing().invalid()) {
      this.step.set(3);
      this._focusFirst('.timing-option input');
      return;
    }

    this._focusFirst('.activity-option input, .custom-activity-input');
  }

  /** 焦點管理是少數必須直接碰 DOM 的情況，等下一次 render 完才找得到目前的場景。 */
  private _focusActiveScene(): void {
    this._focusFirst('.scene:not([hidden]) h1, .scene:not([hidden]) h2');
  }

  private _focusFirst(selector: string): void {
    afterNextRender(
      () => {
        const target = this._host.nativeElement.querySelector<HTMLElement>(selector);
        if (!target) return;
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      },
      { injector: this._injector }
    );
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 只有被碰過的欄位才回報錯誤。 */
function errorOf<T>(state: FieldState<T>): string {
  return state.touched() ? (state.errors()[0]?.message ?? '') : '';
}
