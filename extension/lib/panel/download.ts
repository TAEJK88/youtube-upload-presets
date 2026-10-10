import { csvText } from '../claims/core';

// The userscript's downloadCSV() (2084–2092), in the panel: the file is saved from the panel
// page, which has the data in storage.
export function downloadCsv(rows: unknown[][], name: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
