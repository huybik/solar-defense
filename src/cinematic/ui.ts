export class CinematicUI {
  private overlay: HTMLDivElement;
  private textBox: HTMLDivElement;
  private narration: HTMLParagraphElement;
  private beginDiv: HTMLDivElement;
  private skipBtn: HTMLButtonElement;
  private beginBtn: HTMLButtonElement;
  private cleanups: (() => void)[] = [];

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'cinematic-overlay';

    this.overlay.innerHTML = `
      <div class="cinematic-letterbox cinematic-letterbox--top"></div>
      <div class="cinematic-letterbox cinematic-letterbox--bottom"></div>
      <div class="cinematic-text-box">
        <p class="cinematic-narration"></p>
      </div>
      <button class="cinematic-skip">Skip</button>
      <div class="cinematic-begin" style="display:none">
        <button class="cinematic-begin-btn">BEGIN YOUR MISSION</button>
      </div>
    `;

    this.textBox = this.overlay.querySelector('.cinematic-text-box')!;
    this.narration = this.overlay.querySelector('.cinematic-narration')!;
    this.beginDiv = this.overlay.querySelector('.cinematic-begin')!;
    this.skipBtn = this.overlay.querySelector('.cinematic-skip')!;
    this.beginBtn = this.overlay.querySelector('.cinematic-begin-btn')!;

    container.appendChild(this.overlay);
  }

  showText(text: string): void {
    this.narration.textContent = text;
    this.narration.classList.add('cinematic-narration--visible');
  }

  hideText(): void {
    this.narration.classList.remove('cinematic-narration--visible');
  }

  async waitForActionButton(
    label: string,
    callback: () => void,
    options: { hideNarration?: boolean; signal?: AbortSignal } = {},
  ): Promise<boolean> {
    if (options.signal?.aborted) return false;

    this.beginBtn.textContent = label;
    this.beginDiv.style.display = '';
    this.textBox.style.display = options.hideNarration ? 'none' : '';

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.beginBtn.removeEventListener('click', handleClick);
        options.signal?.removeEventListener('abort', handleAbort);
      };

      const finish = (clicked: boolean) => {
        if (settled) return;
        settled = true;
        release();
        this.beginDiv.style.display = 'none';
        this.textBox.style.display = '';
        resolve(clicked);
      };

      const handleClick = () => {
        callback();
        finish(true);
      };

      const handleAbort = () => finish(false);

      this.beginBtn.addEventListener('click', handleClick);
      options.signal?.addEventListener('abort', handleAbort, { once: true });
      this.cleanups.push(release);
    });
  }

  onSkip(callback: () => void): void {
    this.skipBtn.addEventListener('click', callback);
    this.cleanups.push(() => this.skipBtn.removeEventListener('click', callback));
  }

  destroy(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;
    this.overlay.remove();
  }
}
