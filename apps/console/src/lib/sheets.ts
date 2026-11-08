// Reads an uploaded spreadsheet (Excel, or CSV from Google Sheets "Download as CSV") into rows of text.
import Papa from 'papaparse';
import readXlsxFile, { readSheetNames } from 'read-excel-file';

export type Sheet = { name: string; rows: string[][] };

export async function readSpreadsheet(file: File): Promise<Sheet[]> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const names = await readSheetNames(file);
    return Promise.all(names.map(async (name) => ({ name, rows: (await readXlsxFile(file, { sheet: name })).map((r) => r.map((c) => (c == null ? '' : String(c)))) })));
  }
  const text = await file.text();
  // Google Sheets "Download as CSV" and the ZCS export sometimes arrive as one column wrapped in ``` fences.
  const cleaned = text.replace(/^```.*$/gm, '').trim();
  const parsed = Papa.parse<string[]>(cleaned, { skipEmptyLines: true });
  return [{ name: file.name.replace(/\.\w+$/, ''), rows: parsed.data }];
}
