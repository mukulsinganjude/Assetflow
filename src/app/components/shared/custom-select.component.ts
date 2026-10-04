import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectOption } from '../../models/models';

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="custom-select-container w-full" [class.open]="open" [class.drop-up]="dropUp">
      <div class="custom-select-trigger" (click)="toggle($event)">
        <span class="truncate pr-2">{{ selectedLabel }}</span>
        <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 transition-transform duration-200"></i>
      </div>
      <div class="custom-select-menu">
        <input *ngIf="searchable"
               type="search"
               [value]="searchQuery"
               (input)="searchQuery = $any($event.target).value"
               (click)="$event.stopPropagation()"
               [placeholder]="searchPlaceholder"
               class="glass-input w-full rounded-lg px-3 py-2 mb-1 text-xs normal-case"
               aria-label="Search dropdown options">
        <div *ngFor="let opt of filteredOptions"
             class="custom-select-option"
             [class.selected]="opt.value === value"
             (click)="select(opt, $event)">
          <span>{{ opt.label }}</span>
          <i *ngIf="opt.value === value" class="fa-solid fa-check text-xs"></i>
        </div>
        <div *ngIf="searchable && !filteredOptions.length" class="px-3 py-2 text-xs text-slate-500">No matches found</div>
      </div>
    </div>
  `
})
export class CustomSelectComponent {
  @Input() options: SelectOption[] = [];
  @Input() value = '';
  @Input() dropUp = false;
  @Input() searchable = false;
  @Input() searchPlaceholder = 'Search...';
  @Output() valueChange = new EventEmitter<string>();

  open = false;
  searchQuery = '';

  /** Only one dropdown may be open across the whole app at a time. */
  private static openInstance: CustomSelectComponent | null = null;

  constructor(private host: ElementRef) {}

  get selectedLabel(): string {
    const found = this.options.find(o => o.value === this.value);
    return found ? found.label : (this.options[0]?.label ?? 'Select...');
  }

  get filteredOptions(): SelectOption[] {
    const query = this.searchQuery.trim().toLowerCase();
    return query ? this.options.filter(option => option.label.toLowerCase().includes(query)) : this.options;
  }

  toggle(event: Event) {
    event.stopPropagation();
    if (this.open) {
      this.close();
    } else {
      // Close any other open dropdown first, then open this one.
      if (CustomSelectComponent.openInstance && CustomSelectComponent.openInstance !== this) {
        CustomSelectComponent.openInstance.close();
      }
      this.searchQuery = '';
      this.open = true;
      CustomSelectComponent.openInstance = this;
    }
  }

  private close() {
    this.open = false;
    this.searchQuery = '';
    if (CustomSelectComponent.openInstance === this) CustomSelectComponent.openInstance = null;
  }

  select(opt: SelectOption, event: Event) {
    event.stopPropagation();
    const changed = this.value !== opt.value;
    this.value = opt.value;
    this.close();
    if (changed) this.valueChange.emit(opt.value);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event) {
    if (!this.host.nativeElement.contains(event.target)) {
      this.close();
    }
  }
}
