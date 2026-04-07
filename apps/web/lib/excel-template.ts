import * as XLSX from 'xlsx';

type TemplateCellValue = string | number | boolean | null | undefined;

export function downloadExcelTemplate(
  fileName: string,
  sheetName: string,
  rows: Array<Record<string, TemplateCellValue>>
) {
  if (typeof window === 'undefined' || rows.length === 0) {
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length > 0) {
    worksheet['!cols'] = headers.map((key) => ({
      wch: Math.max(14, key.length + 2)
    }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array'
  });

  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
