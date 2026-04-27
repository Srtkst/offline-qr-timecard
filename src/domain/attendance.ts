/**
 * 日付切り替え時刻を考慮して勤務日(YYYY-MM-DD)を計算する
 */
export function calculateWorkDate(now: Date, boundaryHour: number): string {
  const d = new Date(now.getTime());
  if (d.getHours() < boundaryHour) {
    d.setDate(d.getDate() - 1);
  }

  return formatLocalDate(d);
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatLocalTime(ms: number): string {
  const d = new Date(ms);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function parseIntegerSetting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return fallback;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    return fallback;
  }

  return parsedValue;
}

/**
 * 連続打刻（上書き対象）かどうかを判定する
 */
export function isDuplicatePunch(
  lastPunchAtMs: number,
  nowMs: number,
  windowSec: number
): boolean {
  const diffSec = (nowMs - lastPunchAtMs) / 1000;
  return diffSec >= 0 && diffSec <= windowSec;
}

/**
 * QRトークンを生成する (EMP_ + コード + _ + ランダム文字列)
 */
export function generateQrToken(employeeCode: string): string {
  const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `EMP_${employeeCode || "TEMP"}_${randomStr}`;
}
