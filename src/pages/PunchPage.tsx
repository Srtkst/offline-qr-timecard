import React, { useState, useEffect, useRef, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";
import { calculateWorkDate, isDuplicatePunch, parseIntegerSetting } from "../domain/attendance";
import CameraScanner from "../components/CameraScanner";

type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";

interface PunchPageProps {
  db: Database;
  onNavigateAdmin: () => void;
}

const PUNCH_TYPE_LABELS: Record<PunchType, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

const PunchPage: React.FC<PunchPageProps> = ({ db, onNavigateAdmin }) => {
  const [selectedType, setSelectedType] = useState<PunchType>("clock_in");
  const [now, setNow] = useState(new Date());
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ token: string; time: number } | null>(null);

  // 時刻更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 設定読み込み
  useEffect(() => {
    db.select<{ value: string }[]>("SELECT value FROM settings WHERE key = 'company_name'")
      .then((rows) => {
        if (rows.length > 0) setCompanyName(rows[0].value);
      });
    
    db.select<{ value: string }[]>("SELECT value FROM settings WHERE key = 'last_selected_type'")
      .then((rows) => {
        if (rows.length > 0) setSelectedType(rows[0].value as PunchType);
      });

    db.select<{ value: string }[]>("SELECT value FROM settings WHERE key = 'use_camera'")
      .then((rows) => {
        if (rows.length > 0) setUseCamera(rows[0].value === "1");
      });
  }, [db]);

  const focusInput = useCallback(() => {
    // カメラ使用時は無理にフォーカスを奪わない（ボタン操作等を優先）
    if (useCamera) return;

    const activeElement = document.activeElement;
    const canStealFocus =
      activeElement === document.body ||
      activeElement === inputRef.current ||
      activeElement?.tagName === "HTML";

    if (canStealFocus) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [useCamera]);

  // フォーカス維持
  useEffect(() => {
    focusInput();
    const interval = setInterval(focusInput, 1000);
    return () => clearInterval(interval);
  }, [focusInput]);

  const processPunch = useCallback(async (qrToken: string) => {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);

    // 従業員検索
    const employees = await db.select<any[]>(
      "SELECT * FROM employees WHERE qr_token = ?",
      [qrToken]
    );

    if (employees.length === 0) {
      throw new Error("未登録のQRコードです");
    }

    const employee = employees[0];
    if (employee.is_active === 0) {
      throw new Error("この従業員は無効化されています");
    }

    // 設定取得
    const boundaryRows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'day_boundary_hour'");
    const boundaryHour = parseIntegerSetting(boundaryRows[0]?.value, 5, 0, 23);
    const windowRows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'duplicate_window_sec'");
    const duplicateWindowSec = parseIntegerSetting(windowRows[0]?.value, 10, 0, 3600);

    // 勤務日計算
    const workDate = calculateWorkDate(nowDate, boundaryHour);

    // 最新打刻取得
    const latestPunches = await db.select<any[]>(
      "SELECT * FROM punches WHERE employee_id = ? ORDER BY punched_at_ms DESC LIMIT 1",
      [employee.id]
    );

    const latestPunch = latestPunches[0];
    const isUpdate = latestPunch && isDuplicatePunch(latestPunch.punched_at_ms, nowMs, duplicateWindowSec);

    if (isUpdate) {
      await db.execute(
        "UPDATE punches SET type = ?, punched_at_ms = ?, work_date = ?, updated_at_ms = ? WHERE id = ?",
        [selectedType, nowMs, workDate, nowMs, latestPunch.id]
      );
      setMessage({
        text: `${employee.name}さん: ${PUNCH_TYPE_LABELS[selectedType]} (更新しました)`,
        isError: false,
      });
    } else {
      await db.execute(
        "INSERT INTO punches (employee_id, type, punched_at_ms, work_date, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
        [employee.id, selectedType, nowMs, workDate, nowMs, nowMs]
      );
      setMessage({
        text: `${employee.name}さん: ${PUNCH_TYPE_LABELS[selectedType]} (記録しました)`,
        isError: false,
      });
    }

    // 成功メッセージは5秒で消す
    setTimeout(() => setMessage(null), 5000);
  }, [db, selectedType]);

  const handleQrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    const qrToken = inputRef.current?.value.trim();
    if (!qrToken) return;

    if (inputRef.current) inputRef.current.value = "";

    setIsProcessing(true);
    try {
      await processPunch(qrToken);
    } catch (err: any) {
      setMessage({ text: err.message || "エラーが発生しました", isError: true });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setIsProcessing(false);
      focusInput();
    }
  };

  const handleCameraScan = useCallback(async (token: string) => {
    if (isProcessing) return;

    // 同じトークンを連続して読み取らないように制御 (3秒間)
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.token === token && now - lastScanRef.current.time < 3000) {
      return;
    }
    lastScanRef.current = { token, time: now };

    setIsProcessing(true);
    try {
      await processPunch(token);
    } catch (err: any) {
      setMessage({ text: err.message || "エラーが発生しました", isError: true });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, processPunch]);

  const changeType = async (type: PunchType) => {
    setSelectedType(type);
    await db.execute("UPDATE settings SET value = ?, updated_at_ms = ? WHERE key = 'last_selected_type'", [type, Date.now()]);
    focusInput();
  };

  const toggleCamera = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setUseCamera(enabled);
    await db.execute("UPDATE settings SET value = ?, updated_at_ms = ? WHERE key = 'use_camera'", [enabled ? "1" : "0", Date.now()]);
  };

  return (
    <div className="punch-page">
      <header>
        <h1>{companyName}</h1>
        <div className="clock">{now.toLocaleTimeString()}</div>
        <div className="date">{now.toLocaleDateString()}</div>
      </header>

      <div className="type-selector">
        {(Object.keys(PUNCH_TYPE_LABELS) as PunchType[]).map((type) => (
          <button
            key={type}
            className={`type-button ${selectedType === type ? "selected" : ""}`}
            onClick={() => changeType(type)}
          >
            {PUNCH_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="status-area">
        <p>現在選択中: <strong>{PUNCH_TYPE_LABELS[selectedType]}</strong></p>
        {!useCamera && <p className="hint">QRコードをかざしてください</p>}
        
        <div className="camera-container">
          {useCamera && (
            <CameraScanner onScan={handleCameraScan} isActive={useCamera} />
          )}
          <label className="camera-toggle">
            <input type="checkbox" checked={useCamera} onChange={toggleCamera} />
            PCカメラを使用する
          </label>
        </div>
      </div>

      {message && (
        <div className={`message-toast ${message.isError ? "error" : "success"}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleQrSubmit} className="hidden-form">
        <input
          ref={inputRef}
          type="text"
          autoFocus
        />
      </form>

      <footer>
        <button onClick={onNavigateAdmin} className="admin-link">管理画面</button>
      </footer>
    </div>
  );
};

export default PunchPage;
