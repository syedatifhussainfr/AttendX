export const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isValidClockTime = (value) =>
  typeof value === "string" && CLOCK_TIME_PATTERN.test(value);

export const schedulesOverlap = (startA, endA, startB, endB) =>
  startA < endB && endA > startB;

export function validateScheduleWindow(startTime, endTime) {
  if (!isValidClockTime(startTime) || !isValidClockTime(endTime))
    return "Use a real 24-hour time between 00:00 and 23:59.";
  if (endTime <= startTime) return "End time must be after start time.";
  return null;
}
