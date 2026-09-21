import type { Routes } from '@angular/router';

/*
 * 路由必須維持靜態路徑（無 route param），prerender 才會自動探索並產出實體 index.html。
 * 路徑本身是既有的公開網址，不可更動：
 *   /web-toybox/                          → home
 *   /web-toybox/pages/invitation-card/    → invitation-card
 *   /web-toybox/pages/deep-talk/          → deep-talk
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@features/home/home').then((m) => m.Home)
  },
  {
    path: 'pages/invitation-card',
    loadComponent: () =>
      import('@features/invitation-card/invitation-card').then((m) => m.InvitationCard)
  },
  {
    path: 'pages/deep-talk',
    loadComponent: () => import('@features/deep-talk/deep-talk').then((m) => m.DeepTalk)
  },
  {
    path: 'pages/ichiban',
    loadComponent: () => import('@features/ichiban/ichiban').then((m) => m.Ichiban)
  },
  {
    // 靜態託管下未知路徑會先被 GitHub Pages 的 404.html 接走，
    // 這條只處理 app 內部的異常導航。
    path: '**',
    redirectTo: ''
  }
];
