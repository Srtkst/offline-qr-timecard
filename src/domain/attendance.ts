/**
 * 日付切り替え時刻を考慮して勤務日(YYYY-MM-DD)を計算する
 */
export function calculateWorkDate(now: Date, boundaryHour: number): string {
  const d = new Date(now.getTime());
  if (d.getHours() < boundaryHour) {
    d.setDate(d.getDate() - 1);
  }
  
  // ローカル時刻で YYYY-MM-DD を取得
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
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
