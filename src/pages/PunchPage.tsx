import React, { useState, useEffect, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { calculateWorkDate, isDuplicatePunch } from "../domain/attendance";

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
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [db]);

  const focusInput = () => inputRef.current?.focus();

  // フォーカス維持
  useEffect(() => {
    focusInput();
    const interval = setInterval(focusInput, 1000);
    return () => clearInterval(interval);
  }, []);

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
    } finally {
      setIsProcessing(false);
      focusInput();
    }
  };

  const processPunch = async (qrToken: string) => {
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
    const boundaryHour = parseInt(boundaryRows[0]?.value || "0");
    const windowRows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'duplicate_window_sec'");
    const duplicateWindowSec = parseInt(windowRows[0]?.value || "10");

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
  };

  const changeType = async (type: PunchType) => {
    setSelectedType(type);
    await db.execute("UPDATE settings SET value = ?, updated_at_ms = ? WHERE key = 'last_selected_type'", [type, Date.now()]);
    focusInput();
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
        <p className="hint">QRコードをかざしてください</p>
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
          onBlur={(e) => e.target.focus()}
        />
      </form>

      <footer>
        <button onClick={onNavigateAdmin} className="admin-link">管理画面</button>
      </footer>
    </div>
  );
};

export default PunchPage;
