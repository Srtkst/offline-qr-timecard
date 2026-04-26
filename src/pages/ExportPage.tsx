import React, { useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

interface ExportPageProps {
  db: Database;
}

const ExportPage: React.FC<ExportPageProps> = ({ db }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const query = `
        SELECT 
          e.employee_code,
          e.name as employee_name,
          p.work_date,
          p.type,
          p.punched_at_ms
        FROM punches p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.work_date BETWEEN ? AND ?
        ORDER BY p.work_date ASC, p.punched_at_ms ASC
      `;
      const rows = await db.select<any[]>(query, [startDate, endDate]);

      if (rows.length === 0) {
        alert("指定された期間にデータがありません。");
        return;
      }

      // 従業員×日付ごとにデータを集約
      const aggregated: Record<string, any> = {};

      rows.forEach(row => {
        const key = `${row.employee_code}_${row.work_date}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            employee_code: row.employee_code,
            employee_name: row.employee_name,
            work_date: row.work_date,
            clock_in: "",
            clock_out: "",
            break_start: "",
            break_end: "",
          };
        }

        const time = new Date(row.punched_at_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // 同じ種別が複数ある場合は最新を優先（またはカンマ区切りで併記も可能だが、シンプルに上書き）
        if (row.type === "clock_in") aggregated[key].clock_in = time;
        if (row.type === "clock_out") aggregated[key].clock_out = time;
        if (row.type === "break_start") aggregated[key].break_start = time;
        if (row.type === "break_end") aggregated[key].break_end = time;
      });

      // CSV文字列の生成
      const header = ["従業員番号", "名前", "勤務日", "出勤", "退勤", "休憩開始", "休憩終了"].join(",");
      const body = Object.values(aggregated).map((item) => {
        return [
          item.employee_code,
          item.employee_name,
          item.work_date,
          item.clock_in,
          item.clock_out,
          item.break_start,
          item.break_end,
        ].join(",");
      }).join("\n");

      const csvContent = "\ufeff" + header + "\n" + body;

      // 保存ダイアログ
      const path = await save({
        filters: [{ name: "CSV", extensions: ["csv"] }],
        defaultPath: `attendance_${startDate}_to_${endDate}.csv`
      });

      if (path) {
        const encoder = new TextEncoder();
        const data = encoder.encode(csvContent);
        await writeFile(path, data);
        alert("CSVを出力しました。");
      }
    } catch (err: any) {
      console.error(err);
      alert("エクスポート中にエラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="export-page">
      <h2>CSV出力</h2>
      <div className="export-container">
        <p>指定した期間の打刻ログをCSV形式で保存します。</p>
        
        <div className="date-range-selector">
          <div className="input-group">
            <label>開始日</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <span className="range-sep">〜</span>
          <div className="input-group">
            <label>終了日</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <button 
          onClick={handleExport} 
          disabled={isExporting}
          className="export-button"
        >
          {isExporting ? "出力中..." : "CSVファイルを保存する"}
        </button>
      </div>

      <style>{`
        .export-container {
          background-color: #2a2a2a;
          padding: 2rem;
          border-radius: 8px;
          margin-top: 1rem;
        }
        .date-range-selector {
          display: flex;
          align-items: flex-end;
          gap: 1rem;
          margin: 2rem 0;
        }
        .range-sep {
          padding-bottom: 0.5rem;
          font-size: 1.5rem;
        }
        .export-button {
          width: 100%;
          padding: 1rem;
          font-size: 1.2rem;
          background-color: #2e7d32;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .export-button:disabled {
          background-color: #555;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default ExportPage;
