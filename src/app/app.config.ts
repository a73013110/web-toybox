import { provideHttpClient } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

/*
 * Angular 22 起 zoneless 與 OnPush 都是框架預設，
 * 這裡不需要 provideZonelessChangeDetection()。
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
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
