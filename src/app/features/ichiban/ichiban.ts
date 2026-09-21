import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import type { FieldState } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

import { PRIZE_SETUP_ROWS, createIchibanSetup } from './ichiban.data';
import { ichibanSchema } from './ichiban.schema';
import { IchibanStore } from './ichiban.store';
import type { PrizeKey } from './ichiban.types';
import { ResultReveal } from './result-reveal';

@Component({
  selector: 'app-ichiban',
  imports: [RouterLink, FormField, ResultReveal],
  providers: [IchibanStore],
  templateUrl: './ichiban.html',
  styleUrl: './ichiban.css'
})
export class Ichiban {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  protected readonly store = inject(IchibanStore);
  protected readonly prizeRows = PRIZE_SETUP_ROWS;

  private readonly _model = signal(createIchibanSetup());
  protected readonly form = form(this._model, ichibanSchema);

  protected readonly setupTotal = computed(() =>
    PRIZE_SETUP_ROWS.reduce((sum, row) => sum + this._model().prizes[row.key].quantity, 0)
  );
  protected readonly setupError = computed(() => {
    const hasTouchedQuantity = PRIZE_SETUP_ROWS.some((row) =>
      this.form.prizes[row.key].quantity().touched()
    );
    return hasTouchedQuantity ? (this.form.prizes().errors()[0]?.message ?? '') : '';
  });
  protected readonly titleError = computed(() => visibleError(this.form.title()));
  protected readonly lastOneError = computed(() => visibleError(this.form.lastOneName()));
  protected readonly prizeErrors = computed<Record<PrizeKey, string>>(() => {
    const errors = {} as Record<PrizeKey, string>;
    for (const row of PRIZE_SETUP_ROWS) {
      errors[row.key] =
        visibleError(this.form.prizes[row.key].quantity()) ||
        visibleError(this.form.prizes[row.key].name());
    }
    return errors;
  });

  constructor() {
    setPageMeta({
      title: '一番賞模擬器 — Web Toybox',
      description: '建立有限賞池，以不放回抽樣抽票，查看每一抽即時改變的中獎機率。'
    });
  }

  protected async _onSetupSubmit(event: Event): Promise<void> {
    event.preventDefault();

    await submit(this.form, {
      action: async () => {
        this.store.startBox(this._model());
        this._focusHeading('#boxTitle');
        return undefined;
      }
    });
  }

  protected _onDrawAnimationEnd(event: AnimationEvent): void {
    if (event.target === event.currentTarget) this.store.commitDraw();
  }

  protected _onResultClosed(): void {
    this.store.closeResults();

    afterNextRender(
      () => {
        const selector = this.store.isComplete() ? '.reset-button' : '.draw-button';
        this._host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this._injector }
    );
  }

  protected _onResetRequested(): void {
    const returningToSetup = this.store.resetArmed();
    this.store.requestReset();
    if (returningToSetup) this._focusHeading('#setupTitle');
  }

  private _focusHeading(selector: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this._injector
    });
  }
}

function visibleError<T>(state: FieldState<T>): string {
  return state.touched() ? (state.errors()[0]?.message ?? '') : '';
}
