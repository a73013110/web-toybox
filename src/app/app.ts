import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/*
 * 根元件刻意只放 router-outlet。
 *
 * 每個作品的頁首（品牌列、返回連結）樣式各不相同，維持由各自的 feature 自己畫。
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {}
