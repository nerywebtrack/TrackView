import type { Sheet } from "@/core/application/reports/buildReport";

const NUMBER_FORMAT: Record<Sheet["kinds"][number], string | undefined> = {
  text: undefined,
  number: "0",
  duration: "0.00",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

export async function downloadWorkbook(sheets: Sheet[], parameters: Array<[string, string]>, fileName: string) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TrackView";
  workbook.created = new Date();

  sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    worksheet.columns = sheet.headers.map((header, index) => ({
      header,
      key: String(index),
      width: columnWidth(header, sheet.rows.map((row) => row[index])),
      style: NUMBER_FORMAT[sheet.kinds[index]] ? { numFmt: NUMBER_FORMAT[sheet.kinds[index]] } : {},
    }));
    sheet.rows.forEach((row) => worksheet.addRow(row));

    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    header.alignment = { vertical: "middle", wrapText: true };
    header.height = 32;
    if (sheet.headers.length) {
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rows.length + 1), column: sheet.headers.length } };
    }
  });

  const info = workbook.addWorksheet("Parámetros");
  info.columns = [{ header: "Parámetro", key: "k", width: 28 }, { header: "Valor", key: "v", width: 70 }];
  parameters.forEach(([key, value]) => info.addRow({ k: key, v: value }));
  info.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function columnWidth(header: string, values: unknown[]) {
  const longest = values.slice(0, 200).reduce<number>((max, value) => {
    if (value instanceof Date) return Math.max(max, 16);
    return Math.max(max, String(value ?? "").length);
  }, header.length * 0.8);
  return Math.min(60, Math.max(10, Math.ceil(longest) + 2));
}
