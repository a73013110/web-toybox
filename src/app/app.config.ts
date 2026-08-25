import { provideHttpClient } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions
} from '@angular/router';

import { routes } from './app.routes';

/*
 * Angular 22 起 zoneless 與 OnPush 都是框架預設，
 * 因此這裡沒有 provideZonelessChangeDetection()，元件也不寫 changeDetection。
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // route param 與 query param 直接綁進元件的 input()，元件就不必碰 ActivatedRoute。
      withComponentInputBinding(),
      // 支援的瀏覽器會用 View Transitions API 做換頁過場，其餘瀏覽器自動略過。
      withViewTransitions(),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      })
    ),
    // FetchBackend 已是預設，不需要 withFetch()。
    provideHttpClient(),
    // prerender 產物需要 hydration 才不會在瀏覽器接手時整頁重畫。
    provideClientHydration()
  ]
};
