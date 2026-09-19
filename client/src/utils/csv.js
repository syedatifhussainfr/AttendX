export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (!rows.length) throw new Error("CSV is empty.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const rollIndex = headers.indexOf("rollnumber");
  const nameIndex = headers.indexOf("name");
  if (rollIndex < 0 || nameIndex < 0)
    throw new Error("CSV headers must be rollNumber,name.");
  return rows.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    rollNumber: values[rollIndex] ?? "",
    name: values[nameIndex] ?? "",
  }));
}

export function downloadImportErrors(rows) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [
    "rowNumber,rollNumber,name,errors",
    ...rows.map((row) =>
      [row.rowNumber, row.rollNumber, row.name, row.errors.join("; ")]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "AttendX-import-errors.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
