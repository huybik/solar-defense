export class CinematicUI {
  private overlay: HTMLDivElement;
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

  showBeginButton(): void {
    this.beginDiv.style.display = '';
    this.narration.parentElement!.style.display = 'none';
  }

  onSkip(callback: () => void): void {
    this.skipBtn.addEventListener('click', callback);
    this.cleanups.push(() => this.skipBtn.removeEventListener('click', callback));
  }

  onBegin(callback: () => void): void {
    this.beginBtn.addEventListener('click', callback);
    this.cleanups.push(() => this.beginBtn.removeEventListener('click', callback));
  }

  destroy(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;
    this.overlay.remove();
  }
}
