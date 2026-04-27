import React, { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { save, open } from "@tauri-apps/plugin-dialog";
import { copyFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { setAdminPin, validateAdminPin, verifyAdminPin } from "../domain/auth";
import { parseIntegerSetting } from "../domain/attendance";

interface SettingsPageProps {
  db: Database;
}

type ExportEncoding = "utf-8" | "utf-8-sig";

const EDITABLE_SETTING_KEYS = [
  "company_name",
  "day_boundary_hour",
  "duplicate_window_sec",
  "default_export_encoding",
];

const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: "QR打刻ソフト",
  day_boundary_hour: "5",
  duplicate_window_sec: "10",
  default_export_encoding: "utf-8-sig",
};

const SettingsPage: React.FC<SettingsPageProps> = ({ db }) => {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [pinMessage, setPinMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [db]);

  const loadSettings = async () => {
    const placeholders = EDITABLE_SETTING_KEYS.map(() => "?").join(",");
    const rows = await db.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
      EDITABLE_SETTING_KEYS
    );
    const settingsMap: Record<string, string> = { ...DEFAULT_SETTINGS };
    rows.forEach((row) => {
      settingsMap[row.key] = row.value;
    });
    setSettings(settingsMap);
  };

  const handleUpdateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const getValidatedSettings = (): Record<string, string> | null => {
    const companyName = (settings.company_name || "").trim();
    if (!companyName) {
      alert("事業所名を入力してください。");
      return null;
    }

    const rawBoundaryHour = settings.day_boundary_hour?.trim();
    const boundaryHour = parseIntegerSetting(rawBoundaryHour, Number.NaN, 0, 23);
    if (!Number.isInteger(boundaryHour)) {
      alert("日付切り替え時刻は0〜23の整数で入力してください。");
      return null;
    }

    const rawDuplicateWindowSec = settings.duplicate_window_sec?.trim();
    const duplicateWindowSec = parseIntegerSetting(rawDuplicateWindowSec, Number.NaN, 0, 3600);
    if (!Number.isInteger(duplicateWindowSec)) {
      alert("連続打刻上書き秒数は0〜3600の整数で入力してください。");
      return null;
    }

    const exportEncoding: ExportEncoding =
      settings.default_export_encoding === "utf-8" ? "utf-8" : "utf-8-sig";

    return {
      company_name: companyName,
      day_boundary_hour: String(boundaryHour),
      duplicate_window_sec: String(duplicateWindowSec),
      default_export_encoding: exportEncoding,
    };
  };

  const saveSettings = async () => {
    const validatedSettings = getValidatedSettings();
    if (!validatedSettings) return;

    setIsSaving(true);
    const now = Date.now();
    try {
      for (const [key, value] of Object.entries(validatedSettings)) {
        await db.execute(
          "INSERT OR REPLACE INTO settings (key, value, updated_at_ms) VALUES (?, ?, ?)",
          [key, value, now]
        );
      }
      setSettings(validatedSettings);
      alert("設定を保存しました。");
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:T]/g, "-").split(".")[0];
      const defaultPath = `attendance_backup_${timestamp}.db`;

      const destPath = await save({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        defaultPath: defaultPath,
      });

      if (destPath) {
        await db.execute("PRAGMA wal_checkpoint(FULL);");
        await copyFile("attendance.db", destPath, { fromPathBaseDir: BaseDirectory.AppData });
        alert("バックアップが完了しました。");
      }
    } catch (err: any) {
      console.error(err);
      alert("バックアップに失敗しました。");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm("バックアップから復元しますか？現在のデータはすべて上書きされます。")) return;

    setIsRestoring(true);
    try {
      const selectedPath = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
      });

      if (selectedPath) {
        await db.close();
        await copyFile(selectedPath as string, "attendance.db", { toPathBaseDir: BaseDirectory.AppData });
        alert("復元が完了しました。最新のデータを反映するために、アプリを再起動します。");
        window.location.reload();
      }
    } catch (err: any) {
      console.error(err);
      alert("復元に失敗しました。データベースが使用中である可能性があります。");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleChangeAdminPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setPinMessage(null);

    const validationError = validateAdminPin(newPin);
    if (validationError) {
      setPinMessage({ text: validationError, isError: true });
      return;
    }
    if (newPin !== newPinConfirm) {
      setPinMessage({ text: "確認用PINが一致しません。", isError: true });
      return;
    }

    setIsChangingPin(true);
    try {
      const isCurrentPinValid = await verifyAdminPin(db, currentPin);
      if (!isCurrentPinValid) {
        setPinMessage({ text: "現在のPINが正しくありません。", isError: true });
        return;
      }

      await setAdminPin(db, newPin, false);
      setCurrentPin("");
      setNewPin("");
      setNewPinConfirm("");
      setPinMessage({ text: "管理者PINを変更しました。", isError: false });
    } catch (err) {
      console.error(err);
      setPinMessage({ text: "管理者PINの変更に失敗しました。", isError: true });
    } finally {
      setIsChangingPin(false);
    }
  };

  return (
    <div className="settings-page">
      <h2>システム設定</h2>
      
      <div className="settings-section">
        <h3>基本設定</h3>
        <div className="setting-item">
          <label>事業所名</label>
          <input 
            type="text" 
            value={settings.company_name || ""} 
            onChange={(e) => handleUpdateSetting("company_name", e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>日付切り替え時刻 (0-23時)</label>
          <input 
            type="number" 
            min="0" max="23"
            value={settings.day_boundary_hour || "0"} 
            onChange={(e) => handleUpdateSetting("day_boundary_hour", e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>連続打刻上書き秒数</label>
          <input 
            type="number" 
            min="0" max="3600"
            value={settings.duplicate_window_sec || "10"} 
            onChange={(e) => handleUpdateSetting("duplicate_window_sec", e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>CSV出力文字コード</label>
          <select
            value={settings.default_export_encoding || "utf-8-sig"}
            onChange={(e) => handleUpdateSetting("default_export_encoding", e.target.value)}
          >
            <option value="utf-8-sig">UTF-8 BOM付き</option>
            <option value="utf-8">UTF-8</option>
          </select>
        </div>
        <button onClick={saveSettings} disabled={isSaving} className="save-button">
          {isSaving ? "保存中..." : "設定を保存する"}
        </button>
      </div>

      <form className="settings-section" onSubmit={handleChangeAdminPin}>
        <h3>管理者PIN</h3>
        <div className="setting-item">
          <label>現在のPIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>新しいPIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>新しいPIN（確認）</label>
          <input
            type="password"
            inputMode="numeric"
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value)}
          />
        </div>
        {pinMessage && (
          <p className={pinMessage.isError ? "settings-error" : "settings-success"}>
            {pinMessage.text}
          </p>
        )}
        <button type="submit" disabled={isChangingPin} className="save-button">
          {isChangingPin ? "変更中..." : "管理者PINを変更する"}
        </button>
      </form>

      <div className="settings-section backup-section">
        <h3>データ管理</h3>
        <p>現在のデータベースファイルをバックアップ、または以前のバックアップから復元します。</p>
        <div className="backup-actions">
          <button onClick={handleBackup} disabled={isBackingUp} className="backup-button">
            {isBackingUp ? "処理中..." : "バックアップ作成"}
          </button>
          <button onClick={handleRestore} disabled={isRestoring} className="restore-button">
            {isRestoring ? "処理中..." : "バックアップから復元"}
          </button>
        </div>
      </div>

      <style>{`
        .settings-section { background-color: #2a2a2a; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; }
        .setting-item { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .setting-item label { font-weight: bold; color: #ccc; }
        .setting-item input, .setting-item select { padding: 0.6rem; background: #1a1a1a; border: 1px solid #444; color: white; border-radius: 4px; }
        .save-button { background-color: #646cff; width: 100%; padding: 0.8rem; border: none; color: white; border-radius: 4px; cursor: pointer; }
        .settings-error { color: #ffcdd2; }
        .settings-success { color: #c8e6c9; }
        .backup-actions { display: flex; gap: 1rem; }
        .backup-button, .restore-button { flex: 1; padding: 0.8rem; border-radius: 4px; cursor: pointer; border: 1px solid #666; color: white; }
        .backup-button { background-color: #444; }
        .restore-button { background-color: #c62828; }
      `}</style>
    </div>
  );
};

export default SettingsPage;
