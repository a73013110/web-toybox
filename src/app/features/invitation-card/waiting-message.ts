import { Component, effect, input, signal } from '@angular/core';

/*
 * 送出過場時循環播放的等待文字。
 *
 * Apps Script 冷啟動可能要好幾秒，固定長度的過場會提早停住、看起來像畫面當掉，
 * 因此改成一直循環到父元件把 active 關掉為止。
 *
 * 這是 effect() 的正當用途：排程計時器屬於「對外部世界的副作用」，
 * 而且 onCleanup 讓「換一輪或元件消失就取消」變成同一段程式碼的責任。
 */
@Component({
  selector: 'app-waiting-message',
  template: '{{ message() }}'
})
export class WaitingMessage {
  readonly active = input(false);
  readonly messages = input.required<readonly string[]>();
  readonly intervalMs = input(480);

  protected readonly message = signal('');

  constructor() {
    effect((onCleanup) => {
      const lines = this.messages();

      if (!this.active() || lines.length === 0) {
        this.message.set('');
        return;
      }

      let index = 0;
      const tick = () => this.message.set(lines[index++ % lines.length] ?? '');

      tick();
      const timer = setInterval(tick, this.intervalMs());
      onCleanup(() => clearInterval(timer));
    });
  }
}
