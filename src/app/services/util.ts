export interface PageResult<T> {
  sliced: T[];
  start: number;
  end: number;
  total: number;
  page: number;
  maxPage: number;
}

/** Bound spreadsheet parsing and API payload sizes so oversized files don't
 * freeze the browser's main thread or exceed the server's JSON request limit. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

export function importFileLimitError(file: File): string | null {
  if (file.size > MAX_IMPORT_FILE_BYTES) return 'This spreadsheet is larger than 5 MB. Split it into smaller files and try again.';
  return null;
}

export function paginate<T>(data: T[], page: number, size: number): PageResult<T> {
  const total = data.length;
  // Treat non-positive / non-finite sizes as "show everything" so a bad size
  // can't produce an Infinite maxPage or an empty slice.
  const unbounded = !(size > 0) || !Number.isFinite(size);
  const maxPage = unbounded ? 1 : Math.max(1, Math.ceil(total / size));
  let p = Number.isFinite(page) ? Math.floor(page) : 1;
  if (p > maxPage) p = maxPage;
  if (p < 1) p = 1;
  const start = unbounded ? 0 : (p - 1) * size;
  const end = unbounded ? total : Math.min(start + size, total);
  const sliced = data.slice(start, end);
  return { sliced, start, end, total, page: p, maxPage };
}

export function pageInfo(r: PageResult<unknown>): string {
  return r.total === 0 ? 'Showing 0 to 0 of 0 entries' : `Showing ${r.start + 1} to ${r.end} of ${r.total} entries`;
}

export function categoryIcon(category: string): string {
  switch (category) {
    case 'Laptop': return 'fa-laptop text-blue-400';
    case 'Monitor': return 'fa-desktop text-indigo-400';
    case 'Mouse': return 'fa-computer-mouse text-emerald-400';
    case 'Docking Station': return 'fa-plug text-amber-400';
    case 'Headset': return 'fa-headset text-purple-400';
    default: return 'fa-box text-slate-400';
  }
}

export function statusBadge(status: string): string {
  if (status === 'In Storage') return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  if (status === 'Under Repair') return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
}

export function exportXlsx(rows: any[], sheet: string, filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
  XLSX.writeFile(workbook, filename);
}
