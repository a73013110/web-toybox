import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  constructor() {
    setPageMeta({
      title: 'Web Toybox — 網頁玩具箱',
      description: '收集輕量、好玩又能直接在瀏覽器開啟的網頁小作品。'
    });
  }
}
