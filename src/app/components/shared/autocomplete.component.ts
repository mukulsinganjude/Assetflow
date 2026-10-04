import { Component, ElementRef, EventEmitter, HostListener, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * A combobox that works both ways: users can type any value freely (free text
 * is preserved) OR pick from a filtered dropdown of known suggestions. Built to
 * match the app's .glass-input styling. Used for the "Assigned To" field so an
 * existing employee can be chosen from the list, or a brand-new name typed in.
 */
@Component({
  selector: 'app-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="af-ac relative w-full">
      <div class="relative">
        <input
          #input
          type="text"
          [ngModel]="value"
          (ngModelChange)="onType($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          (keydown)="onKey($event)"
          [placeholder]="placeholder"
          autocomplete="off"
          class="glass-input w-full rounded-2xl px-4 py-3 pr-10 text-sm focus:outline-none dark:text-white">
        <button *ngIf="clearable && value" type="button" (mousedown)="$event.preventDefault()" (click)="clear($event, input)" tabindex="-1"
                class="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 text-xs" aria-label="Clear">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <button type="button" (click)="toggle($event)" tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-400" aria-label="Toggle suggestions">
          <i class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200" [class.rotate-180]="open()"></i>
        </button>
      </div>

      <div *ngIf="open() && filtered().length > 0"
           class="af-ac-menu absolute z-50 mt-1.5 w-full max-h-56 overflow-y-auto rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-xl py-1.5">
        <button *ngFor="let opt of filtered(); let i = index" type="button"
                (mousedown)="select(opt, $event)"
                (mouseenter)="active.set(i)"
                class="w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition"
                [ngClass]="{
                  'bg-indigo-50 dark:bg-white/10': i === active(),
                  'text-indigo-600 dark:text-indigo-400 font-semibold': opt === value,
                  'text-slate-700 dark:text-slate-200': opt !== value
                }">
          <span class="truncate flex items-center gap-2"><i class="fa-solid fa-user text-[11px] text-slate-400"></i>{{ opt }}</span>
          <i *ngIf="opt === value" class="fa-solid fa-check text-xs text-indigo-500"></i>
        </button>
      </div>

      <!-- Near-duplicate guard: nudge the user toward an existing employee when the
           typed name looks like a typo, so the roster doesn't accumulate near-dupes. -->
      <p *ngIf="nearMatch() as m" class="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 flex-wrap">
        <i class="fa-solid fa-circle-question"></i>
        <span>Did you mean</span>
        <button type="button" (click)="acceptNearMatch()" class="font-bold underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300">{{ m }}</button>
        <span *ngIf="allowCustom">? Otherwise a new employee will be created.</span>
        <span *ngIf="!allowCustom">? Select this employee to assign the asset.</span>
      </p>
    </div>
  `
})
export class AutocompleteComponent {
  /** Full list of known suggestions (e.g. the employee roster). */
  @Input() set options(v: string[]) { this._options.set(v || []); }
  /** Current text. Backed by a signal so the computed filters/hints below stay
   *  reactive as the user types (a plain field would never re-trigger them). */
  @Input() set value(v: string) { this._value.set(v || ''); this.committedValue = v || ''; }
  get value(): string { return this._value(); }
  @Input() placeholder = '';
  @Input() clearable = true;
  @Input() allowCustom = true;
  @Output() valueChange = new EventEmitter<string>();

  private _options = signal<string[]>([]);
  private _value = signal('');
  open = signal(false);
  active = signal(0);
  private committedValue = '';

  /** Suggestions filtered by the current text (case-insensitive substring).
   *  With no text, the whole roster is shown so it also works as a plain picker. */
  filtered = computed<string[]>(() => {
    const q = this._value().toLowerCase().trim();
    const opts = this._options();
    if (!q) return opts.slice(0, 50);
    return opts.filter(o => o.toLowerCase().includes(q)).slice(0, 50);
  });

  /** True when the current value exactly matches a known option (case-insensitive). */
  isExact = computed<boolean>(() => {
    const q = this._value().trim().toLowerCase();
    return !!q && this._options().some(o => o.toLowerCase() === q);
  });

  /** The closest known employee to the typed value, when it looks like a near-miss
   *  (a likely typo) rather than an exact match. Powers the "Did you mean…?" hint so
   *  users don't accidentally create "Sarah K" alongside an existing "Sarah K.". */
  nearMatch = computed<string | null>(() => {
    const q = this._value().trim();
    if (q.length < 3 || this.isExact()) return null;
    const lower = q.toLowerCase();
    let best: string | null = null;
    let bestDist = Infinity;
    for (const opt of this._options()) {
      const o = opt.toLowerCase();
      if (o === lower) return null;
      const dist = this.editDistance(lower, o);
      // Allow a slightly looser threshold for longer names.
      const limit = o.length > 8 ? 3 : 2;
      if (dist <= limit && dist < bestDist) { bestDist = dist; best = opt; }
    }
    return best;
  });

  constructor(private host: ElementRef) {}

  /** Standard Levenshtein edit distance (small strings, so the simple DP is fine). */
  private editDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let curr = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[b.length];
  }

  /** Accept the suggested near-match, replacing the typed value. */
  acceptNearMatch() {
    const m = this.nearMatch();
    if (!m) return;
    this.value = m;
    this.open.set(false);
    this.valueChange.emit(m);
  }

  onType(v: string) {
    this._value.set(v);
    this.open.set(true);
    this.active.set(0);
    if (this.allowCustom) {
      this.value = v;
      this.valueChange.emit(v);
      return;
    }
    if (!v.trim()) {
      this.value = '';
      this.valueChange.emit('');
      return;
    }
    const exact = this._options().find(option => option.toLowerCase() === v.trim().toLowerCase());
    if (exact) {
      this.value = exact;
      this.valueChange.emit(exact);
      this.open.set(false);
    }
  }

  onBlur() {
    this.open.set(false);
    if (this.allowCustom) return;
    const typed = this._value().trim();
    if (!typed) {
      this.value = '';
      if (this.committedValue) this.valueChange.emit('');
      return;
    }
    const exact = this._options().find(option => option.toLowerCase() === typed.toLowerCase());
    if (exact) {
      this.value = exact;
      this.valueChange.emit(exact);
    } else {
      this._value.set(this.committedValue);
    }
  }

  onFocus() { this.open.set(true); this.active.set(0); }

  toggle(event: Event) {
    event.stopPropagation();
    this.open.set(!this.open());
    if (this.open()) this.active.set(0);
  }

  clear(event: Event, input: HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    input.value = '';
    this.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    this.active.set(0);
    input.focus();
    this.open.set(false);
  }

  select(opt: string, event: Event) {
    event.preventDefault();
    this.value = opt;
    this.open.set(false);
    this.valueChange.emit(opt);
  }

  onKey(event: KeyboardEvent) {
    const list = this.filtered();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open()) { this.open.set(true); return; }
      this.active.set(Math.min(this.active() + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set(Math.max(this.active() - 1, 0));
    } else if (event.key === 'Enter') {
      if (this.open() && list[this.active()]) {
        event.preventDefault();
        this.select(list[this.active()], event);
      }
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event) {
    if (!this.host.nativeElement.contains(event.target)) this.open.set(false);
  }
}
