import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { describeAppsScriptError } from '@core/api/apps-script-error';
import { setPageMeta } from '@core/seo/page-meta';

import { AmbientBackdrop } from './ambient-backdrop';
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
  MAX_CUSTOM_ACTIVITY_LENGTH,
  MAX_NAME_LENGTH,
  MIN_CONFIRMATION_MS,
  TIMING_OPTIONS
} from './invitation-card.data';
import type { InvitationModel } from './invitation-card.types';

interface Particle {
  readonly id: number;
  readonly size: number;
  readonly color: string;
  readonly round: boolean;
  readonly tx: number;
  readonly ty: number;
  readonly rot: number;
}

interface ErrorReadable {
  touched(): boolean;
  errors(): readonly { readonly message?: string }[];
}

const TOTAL_STEPS = 5;
const PARTICLE_COLORS = ['#141414', '#a8874f', '#7a7a7a'];

@Component({
  selector: 'app-invitation-card',
  imports: [RouterLink, FormField, AmbientBackdrop],
  templateUrl: './invitation-card.html',
  styleUrl: './invitation-card.css',
  host: {
    '[class.name-gate-open]': 'nameGateOpen()'
  }
})
export class InvitationCard {
  private readonly _api = inject(InvitationCardApi);
  private readonly _route = inject(ActivatedRoute);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly totalSteps = TOTAL_STEPS;
  protected readonly timingOptions = TIMING_OPTIONS;
  protected readonly activityOptions = ACTIVITY_OPTIONS;
  protected readonly customActivityIcon = CUSTOM_ACTIVITY_ICON;
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxCustomActivityLength = MAX_CUSTOM_ACTIVITY_LENGTH;

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
  protected readonly confirmMessage = signal('');
  protected readonly submitError = signal('');
  protected readonly particles = signal<readonly Particle[]>([]);
  protected readonly summary = signal<{ timing: string; activities: string } | null>(null);

  /** 送出成功的那份選擇。內容沒改就不讓重送。 */
  private readonly _submittedSignature = signal('');

  /* ── 衍生狀態 ── */
  protected readonly stepLabel = computed(
    () => `${String(this.step()).padStart(2, '0')} / ${String(TOTAL_STEPS).padStart(2, '0')}`
  );
  protected readonly progressPercent = computed(() => (this.step() / TOTAL_STEPS) * 100);

  protected readonly inviteeName = computed(() => this._model().inviteeName.trim());

  protected readonly declineLabel = computed(
    () => DECLINE_REACTIONS[this.declineCount() - 1]?.label ?? DEFAULT_DECLINE_LABEL
  );
  protected readonly declineExhausted = computed(
    () => this.declineCount() >= DECLINE_REACTIONS.length
  );
  /* 每次婉拒都讓按鈕換位置，也讓「願意」悄悄更有存在感。 */
  private readonly _dodgeDirection = computed(() => (this.declineCount() % 2 === 0 ? -1 : 1));
  protected readonly dodgeX = computed(() => this._dodgeDirection() * (18 + this.declineCount() * 8));
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
    const custom = model.customActivity.trim();

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
  protected readonly nameError = computed(() => this._errorOf(this.form.inviteeName()));
  protected readonly timingError = computed(() => this._errorOf(this.form.timing()));
  protected readonly activityError = computed(() => {
    if (this.submitError()) return this.submitError();

    // 自訂項目缺內容時立刻提示，不等使用者離開欄位——
    // 送出鍵會同時變灰，沒有說明的話沒人知道卡在哪。
    const customError = this.form.customActivity().errors()[0]?.message;
    if (customError) return customError;

    return this._errorOf(this.form.activities());
  });

  private _reduceMotion = false;
  private _nextParticleId = 0;
  private _subTextToken = 0;
  private _confirmToken = 0;

  constructor() {
    setPageMeta({
      title: 'Invitation Card — Web Toybox',
      description: '選擇空檔暗號與活動，完成一張專屬的邀請卡。'
    });

    // ?invite= 只在瀏覽器才有值。prerender 產出的 HTML 一律是「關卡開著」的狀態，
    // 因此名字關卡與所有場景都留在 DOM 裡、只切換 hidden，不用 @if ——
    // 否則伺服器與瀏覽器的結構會對不起來，hydration 會報錯。
    afterNextRender(() => {
      this._reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

      // URL 參數也限制為與輸入欄相同的長度。
      const invited = (this._route.snapshot.queryParamMap.get('invite') ?? '')
        .trim()
        .slice(0, MAX_NAME_LENGTH);

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
    this._burst(12);
    this._later(() => this._goToStep(2), this._reduceMotion ? 0 : 320);
  }

  protected _onContinue(): void {
    this._goToStep(3);
  }

  protected _onDecline(): void {
    if (this.declineExhausted()) return;

    const reaction = DECLINE_REACTIONS[this.declineCount()];
    if (!reaction) return;

    this._setSubText(reaction.message);
    this.declineCount.update((count) => count + 1);

    // 重播搖晃動畫：先卸下 class，下一次 render 再掛上。
    this.isTeasing.set(false);
    afterNextRender(() => this.isTeasing.set(true), { injector: this._injector });
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
    this.submitError.set('');

    const startedAt = performance.now();
    this.confirming.set(true);
    this._playConfirmationRitual(); // 不等待：過場持續循環，直到送出有結果或流程被重設。

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
      onInvalid: () => this._focusFirst('.activity-option input, .custom-activity-input')
    }).catch((error: unknown) => {
      console.error(error);
      // 此功能只收集回覆，不會直接建立行事曆行程。
      this.submitError.set(describeAppsScriptError(error));
      return false;
    });

    if (!succeeded) {
      this._stopConfirmationRitual();
      return;
    }

    await this._holdConfirmationRitual(startedAt);

    this.summary.set({
      timing: this._model().timing,
      activities: this.chosenActivities().join('、')
    });
    this._submittedSignature.set(this._selectionSignature()); // 同一份結果不再重複提交。
    this._stopConfirmationRitual();
    this._goToStep(5);
    this._burst(20);
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
    this.submitError.set('');
    this.summary.set(null);
    this._submittedSignature.set('');
    this._subTextToken += 1;
    this._stopConfirmationRitual();

    // 名字是進入流程的前提，重新開始時不清掉。
    this.form.inviteeName().value.set(name);
  }

  protected _onParticleEnd(id: number): void {
    this.particles.update((particles) => particles.filter((particle) => particle.id !== id));
  }

  /* ── 內部 ── */

  private _goToStep(step: number): void {
    this.step.set(step);
    this._focusActiveScene();
  }

  private _errorOf(state: ErrorReadable): string {
    if (!state.touched()) return '';
    return state.errors()[0]?.message ?? '';
  }

  private _setSubText(text: string): void {
    const token = ++this._subTextToken;
    this.subFading.set(true);

    this._later(() => {
      if (token !== this._subTextToken) return; // 忽略已被更新呼叫取代的文字動畫。
      this.subText.set(text);
      this.subFading.set(false);
    }, this._reduceMotion ? 0 : 220);
  }

  /*
   * 循環播放等待文字直到送出有結果：Apps Script 冷啟動可能要數秒，
   * 固定長度的過場會提早停住，看起來像是畫面當掉。
   */
  private _playConfirmationRitual(): void {
    const token = ++this._confirmToken;
    const delay = this._reduceMotion ? 200 : 480;
    let index = 0;

    const tick = (): void => {
      if (token !== this._confirmToken) return;
      this.confirmMessage.set(CONFIRMATION_REACTIONS[index % CONFIRMATION_REACTIONS.length] ?? '');
      index += 1;
      this._later(tick, delay);
    };

    tick();
  }

  private _holdConfirmationRitual(startedAt: number): Promise<void> {
    const minimum = this._reduceMotion ? 0 : MIN_CONFIRMATION_MS;
    const remaining = minimum - (performance.now() - startedAt);

    if (remaining <= 0) return Promise.resolve();

    return new Promise((resolve) => this._later(resolve, remaining));
  }

  private _stopConfirmationRitual(): void {
    this._confirmToken += 1; // 讓仍在等待中的舊流程立即失效。
    this.confirming.set(false);
    this.confirmMessage.set('');
  }

  private _burst(count: number): void {
    if (this._reduceMotion) return;

    const created: Particle[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 80;
      created.push({
        id: this._nextParticleId++,
        size: 3 + Math.random() * 3,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)] ?? '#141414',
        round: Math.random() > 0.5,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        rot: Math.random() * 360
      });
    }

    this.particles.update((particles) => [...particles, ...created]);
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

  /** setTimeout + 自動清理。元件銷毀後不該再有回呼改動已消失的畫面。 */
  private _later(callback: () => void, delayMs: number): void {
    const handle = setTimeout(callback, delayMs);
    this._destroyRef.onDestroy(() => clearTimeout(handle));
  }
}
