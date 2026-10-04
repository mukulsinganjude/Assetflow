import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative shrink-0">
      <button type="button" (click)="toggle()" class="glass-card w-10 h-10 rounded-xl text-lg hover:bg-indigo-500/10 transition" title="Add emoji" aria-label="Add emoji" [attr.aria-expanded]="open()">😊</button>
      <div *ngIf="open()" class="absolute bottom-full right-0 z-50 mb-2 w-52 p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl grid grid-cols-6 gap-1">
        <button *ngFor="let emoji of emojis" type="button" (click)="choose(emoji)" class="w-7 h-7 rounded-lg hover:bg-indigo-500/15 text-lg" [attr.aria-label]="'Insert ' + emoji">{{ emoji }}</button>
      </div>
    </div>
  `
})
export class EmojiPickerComponent {
  @Input() text = '';
  @Output() textChange = new EventEmitter<string>();
  open = signal(false);
  emojis = ['😊', '😀', '😂', '😉', '😍', '🤔', '👍', '👎', '🙏', '🎉', '❤️', '💻', '✅', '⚠️', '📦', '🔧', '✨', '😕'];

  toggle() { this.open.update(value => !value); }

  choose(emoji: string) {
    const spacer = this.text && !/\s$/.test(this.text) ? ' ' : '';
    this.textChange.emit(`${this.text}${spacer}${emoji}`);
    this.open.set(false);
  }
}
