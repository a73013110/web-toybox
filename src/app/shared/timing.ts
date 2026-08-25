import { DestroyRef, inject } from '@angular/core';

export interface Timers {
  /** 延遲執行。元件銷毀後不會再被呼叫。 */
  after(delayMs: number, callback: () => void): void;
  /** 讓一段過場至少持續 minimumMs，避免結果太快回來時畫面只閃一下。 */
  hold(startedAt: number, minimumMs: number): Promise<void>;
}

/*
 * setTimeout 的注入版：登記的計時器會在注入者銷毀時一併取消。
 *
 * 直接寫 setTimeout 的問題不是「忘了 clear」而已 —— 元件消失後回呼仍會執行，
 * 去改一份已經沒人看的 signal。這裡把清理綁在 DestroyRef 上，呼叫端就不必再記得。
 *
 * ⚠️ 必須在 injection context 內呼叫（欄位初始化或 constructor）。
 */
export function injectTimers(): Timers {
  const handles = new Set<ReturnType<typeof setTimeout>>();

  inject(DestroyRef).onDestroy(() => {
    handles.forEach(clearTimeout);
    handles.clear();
  });

  const after = (delayMs: number, callback: () => void): void => {
    const handle = setTimeout(() => {
      handles.delete(handle);
      callback();
    }, delayMs);

    handles.add(handle);
  };

  return {
    after,
    hold: (startedAt, minimumMs) => {
      const remaining = minimumMs - (performance.now() - startedAt);

      return remaining <= 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => after(remaining, resolve));
    }
  };
}
