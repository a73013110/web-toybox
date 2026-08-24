import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

@Component({
  selector: 'app-deep-talk',
  imports: [RouterLink],
  templateUrl: './deep-talk.html',
  styleUrl: './deep-talk.css'
})
export class DeepTalk {
  constructor() {
    setPageMeta({
      title: 'Deep Talk — Web Toybox',
      description: '抽一疊由淺入深的問題，題庫在 Google Sheet，熱門度由使用者投票決定。'
    });
  }
}
