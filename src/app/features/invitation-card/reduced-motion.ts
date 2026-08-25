import { DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';

const QUERY = '(prefers-reduced-motion: reduce)';

/*
 * 使用者是否要求減少動態。
 *
 * CSS 那一半由 styles/base.css 的 media query 處理；這裡負責 JS 這一半 ——
 * 粒子、隨機光點、循環過場這些「由程式產生」的動畫沒辦法靠 CSS 關掉。
 *
 * 用 afterNextRender 取值：prerender 沒有 matchMedia，而且伺服器也無從得知。
 * ⚠️ 必須在 injection context 內呼叫。
 */
export function injectReducedMotion(): Signal<boolean> {
  const reduced = signal(false);
  const destroyRef = inject(DestroyRef);

  afterNextRender(() => {
    const media = matchMedia(QUERY);
    const sync = () => reduced.set(media.matches);

    sync();
    media.addEventListener('change', sync);
    destroyRef.onDestroy(() => media.removeEventListener('change', sync));
  });

  return reduced.asReadonly();
}
