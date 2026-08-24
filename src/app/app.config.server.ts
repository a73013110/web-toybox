import type { ApplicationConfig } from '@angular/core';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/*
 * 這份設定只在 build 期的 prerender 用到，不會有 server runtime。
 * angular.json 的 outputMode 是 "static"：ng build 會把每個路由渲染成實體 HTML，
 * 產出仍是純靜態檔，GitHub Pages 直接託管。
 */
const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
