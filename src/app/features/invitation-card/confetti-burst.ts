import { Component, signal } from '@angular/core';

import { injectReducedMotion } from './reduced-motion';

interface Particle {
  readonly id: number;
  readonly size: number;
  readonly color: string;
  readonly round: boolean;
  readonly tx: number;
  readonly ty: number;
  readonly rot: number;
}

const COLORS = ['#141414', '#a8874f', '#7a7a7a'];

/*
 * 按下「願意」與完成時噴出的紙屑。
 *
 * 粒子是 signal 陣列 + @for，動畫結束事件負責回收，不需要另外記 setTimeout；
 * 這也是「別為了套樣式多包一層元件、但有自己的狀態就該獨立」的分界例子。
 */
@Component({
  selector: 'app-confetti-burst',
  styleUrl: './confetti-burst.css',
  template: `
    @for (particle of particles(); track particle.id) {
      <span
        class="particle"
        aria-hidden="true"
        [style.width.px]="particle.size"
        [style.height.px]="particle.size"
        [style.background]="particle.color"
        [style.border-radius]="particle.round ? '50%' : '0'"
        [style.--tx.px]="particle.tx"
        [style.--ty.px]="particle.ty"
        [style.--rot.deg]="particle.rot"
        (animationend)="_onEnd(particle.id)"
      ></span>
    }
  `
})
export class ConfettiBurst {
  private readonly _reduceMotion = injectReducedMotion();

  protected readonly particles = signal<readonly Particle[]>([]);

  private _nextId = 0;

  /** 噴一次。由父元件在關鍵時刻呼叫（viewChild 取得參考）。 */
  burst(count: number): void {
    if (this._reduceMotion()) return;

    const created = Array.from({ length: count }, (): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 80;

      return {
        id: this._nextId++,
        size: 3 + Math.random() * 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#141414',
        round: Math.random() > 0.5,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        rot: Math.random() * 360
      };
    });

    this.particles.update((particles) => [...particles, ...created]);
  }

  protected _onEnd(id: number): void {
    this.particles.update((particles) => particles.filter((particle) => particle.id !== id));
  }
}
