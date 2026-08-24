import type { ServerRoute } from '@angular/ssr';
import { RenderMode } from '@angular/ssr';

/*
 * 全站一律 build 期 prerender。app.routes.ts 的路由都是靜態路徑，
 * 因此不需要在這裡另外列出清單。
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
