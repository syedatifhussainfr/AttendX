export function normalizeRollNumber(value) {
  const rollNumber = String(value ?? "").trim();
  if (!/^\d+$/.test(rollNumber)) return rollNumber;

  const withoutLeadingZeros = rollNumber.replace(/^0+(?=\d)/, "");
  return withoutLeadingZeros.padStart(2, "0");
}

export function compareRollNumbers(left, right) {
  const a = typeof left === "string" ? left : left.rollNumber;
  const b = typeof right === "string" ? right : right.rollNumber;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
