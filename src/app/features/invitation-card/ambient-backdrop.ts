import { Component, DOCUMENT, afterNextRender, effect, inject, signal } from '@angular/core';

import { injectReducedMotion } from './reduced-motion';

interface Dot {
  readonly id: number;
  readonly size: number;
  readonly left: number;
  readonly top: number;
  readonly durationMs: number;
}

interface Spark {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const SPARK_INTERVAL_MS = 55;

/*
 * 邀請卡的背景氛圍：光暈、方格、幾何裝飾、飄浮光點與指標火花。
 *
 * 光點與火花是 signal 陣列 + @for，新增與移除都回到 template；
 * 動畫結束事件負責回收，不需要另外記 setTimeout。
 */
@Component({
  selector: 'app-ambient-backdrop',
  styleUrl: './ambient-backdrop.css',
  host: {
    '(document:pointermove)': '_onPointerMove($event)'
  },
  template: `
    <div class="grid-overlay" aria-hidden="true"></div>
    <div class="aurora" aria-hidden="true"></div>
    <div class="mesh" aria-hidden="true" [style.--mx.%]="meshX()" [style.--my.%]="meshY()"></div>

    <div class="ambient-dots" aria-hidden="true">
      @for (dot of dots(); track dot.id) {
        <span
          class="dot"
          [style.width.px]="dot.size"
          [style.height.px]="dot.size"
          [style.left.%]="dot.left"
          [style.top.%]="dot.top"
          [style.animation-duration.ms]="dot.durationMs"
          (animationend)="_onDotEnd(dot.id)"
        ></span>
      }
      @for (spark of sparks(); track spark.id) {
        <span
          class="pointer-spark"
          [style.left.px]="spark.x"
          [style.top.px]="spark.y"
          [style.--spark-x.px]="spark.offsetX"
          [style.--spark-y.px]="spark.offsetY"
          (animationend)="_onSparkEnd(spark.id)"
        ></span>
      }
    </div>

    <div class="ambient-shapes" aria-hidden="true" [style.transform]="shapeTransform()">
      <span class="shape shape-ring"></span>
      <span class="shape shape-diamond"></span>
      <span class="shape shape-ring shape-ring-small"></span>
      <span class="shape shape-line"></span>
      <span class="shape shape-diamond shape-diamond-small"></span>
      <span class="shape shape-arc"></span>
    </div>
  `
})
export class AmbientBackdrop {
  private readonly _document = inject(DOCUMENT);
  private readonly _reduceMotion = injectReducedMotion();

  protected readonly meshX = signal(30);
  protected readonly meshY = signal(30);
  protected readonly shapeTransform = signal('translate3d(0, 0, 0)');
  protected readonly dots = signal<readonly Dot[]>([]);
  protected readonly sparks = signal<readonly Spark[]>([]);

  /** effect 在 prerender 期間也會執行，因此由這個旗標把整段動畫擋在瀏覽器之後。 */
  private readonly _inBrowser = signal(false);

  private _nextId = 0;
  private _lastSparkAt = 0;
  private _coarsePointer = false;

  constructor() {
    afterNextRender(() => {
      this._coarsePointer = matchMedia('(pointer: coarse)').matches;
      this._inBrowser.set(true);
    });

    /*
     * 光點的產生排程。
     *
     * 寫成 effect 是因為它依賴的「要不要減少動態」會在執行期改變 ——
     * 使用者中途打開系統設定，這裡就會自動收掉計時器；onCleanup 讓
     * 「開始」與「停止」寫在同一個地方，不會有一半忘了收的情況。
     */
    effect((onCleanup) => {
      if (!this._inBrowser() || this._reduceMotion()) return;

      // 先放入少量錯開的光點，避免初次進入時背景過於安靜。
      const seedCount = this._coarsePointer ? 8 : 14;
      const seeds = Array.from({ length: seedCount }, (_, index) =>
        setTimeout(() => this._spawnDot(), index * 120)
      );

      const timer = setInterval(() => this._spawnDot(), this._coarsePointer ? 850 : 420);

      onCleanup(() => {
        seeds.forEach(clearTimeout);
        clearInterval(timer);
      });
    });
  }

  protected _onPointerMove(event: PointerEvent): void {
    this.meshX.set((event.clientX / window.innerWidth) * 100);
    this.meshY.set((event.clientY / window.innerHeight) * 100);

    // 幾何裝飾只做小幅視差，避免搶走卡片焦點。
    const offsetX = (event.clientX / window.innerWidth - 0.5) * 16;
    const offsetY = (event.clientY / window.innerHeight - 0.5) * 12;
    this.shapeTransform.set(`translate3d(${offsetX}px, ${offsetY}px, 0)`);

    if (this._reduceMotion() || this._coarsePointer) return;

    const now = performance.now();
    if (now - this._lastSparkAt < SPARK_INTERVAL_MS) return;
    this._lastSparkAt = now;

    this.sparks.update((sparks) => [
      ...sparks,
      {
        id: this._nextId++,
        x: event.clientX,
        y: event.clientY,
        offsetX: Math.random() * 18 - 9,
        offsetY: -10 - Math.random() * 18
      }
    ]);
  }

  protected _onSparkEnd(id: number): void {
    this.sparks.update((sparks) => sparks.filter((spark) => spark.id !== id));
  }

  protected _onDotEnd(id: number): void {
    this.dots.update((dots) => dots.filter((dot) => dot.id !== id));
  }

  private _spawnDot(): void {
    if (this._document.hidden) return;

    this.dots.update((dots) => [
      ...dots,
      {
        id: this._nextId++,
        size: 2 + Math.random() * 3,
        left: Math.random() * 100,
        top: Math.random() * 100,
        durationMs: (7 + Math.random() * 6) * 1000
      }
    ]);
  }
}
