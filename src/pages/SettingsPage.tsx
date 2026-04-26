import React, { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { save, open } from "@tauri-apps/plugin-dialog";
import { copyFile, BaseDirectory } from "@tauri-apps/plugin-fs";

interface SettingsPageProps {
  db: Database;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ db }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [db]);

  const loadSettings = async () => {
    const rows = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
    const settingsMap: Record<string, string> = {};
    rows.forEach((row) => {
      settingsMap[row.key] = row.value;
    });
    setSettings(settingsMap);
  };

  const handleUpdateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    const now = Date.now();
    try {
      for (const [key, value] of Object.entries(settings)) {
        await db.execute(
          "INSERT OR REPLACE INTO settings (key, value, updated_at_ms) VALUES (?, ?, ?)",
          [key, value, now]
        );
      }
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
        // 現在のDBを閉じる (TauriのSQLプラグインでは明示的に閉じる必要はないが、上書きするとエラーになる可能性がある)
        // ここでは単純に上書きを試みる
        await copyFile(selectedPath as string, "attendance.db", { toPathBaseDir: BaseDirectory.AppData });
        alert("復元が完了しました。最新のデータを反映するために、アプリを再起動してください。");
        window.location.reload(); // フロントエンドをリロードして接続し直す
      }
    } catch (err: any) {
      console.error(err);
      alert("復元に失敗しました。データベースが使用中である可能性があります。");
    } finally {
      setIsRestoring(false);
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
            value={settings.duplicate_window_sec || "10"} 
            onChange={(e) => handleUpdateSetting("duplicate_window_sec", e.target.value)}
          />
        </div>
        <button onClick={saveSettings} disabled={isSaving} className="save-button">
          {isSaving ? "保存中..." : "設定を保存する"}
        </button>
      </div>

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
        .setting-item input { padding: 0.6rem; background: #1a1a1a; border: 1px solid #444; color: white; border-radius: 4px; }
        .save-button { background-color: #646cff; width: 100%; padding: 0.8rem; border: none; color: white; border-radius: 4px; cursor: pointer; }
        .backup-actions { display: flex; gap: 1rem; }
        .backup-button, .restore-button { flex: 1; padding: 0.8rem; border-radius: 4px; cursor: pointer; border: 1px solid #666; color: white; }
        .backup-button { background-color: #444; }
        .restore-button { background-color: #c62828; }
      `}</style>
    </div>
  );
};

export default SettingsPage;
