import React, { useEffect, useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { calculateWorkDate, formatLocalDate, formatLocalTime, parseIntegerSetting } from "../domain/attendance";

interface ExportPageProps {
  db: Database;
}

type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";
type ExportEncoding = "utf-8" | "utf-8-sig";

interface ExportRow {
  employee_id: number;
  employee_code: string | null;
  employee_name: string;
  work_date: string;
  type: PunchType;
  punched_at_ms: number;
}

interface AggregatedExportRow {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  work_date: string;
  clock_in: string[];
  clock_out: string[];
  break_start: string[];
  break_end: string[];
}

const PUNCH_TYPE_KEYS: PunchType[] = ["clock_in", "clock_out", "break_start", "break_end"];

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function encodeCsv(content: string, encoding: ExportEncoding): Uint8Array {
  const prefix = encoding === "utf-8-sig" ? "\ufeff" : "";
  return new TextEncoder().encode(prefix + content);
}

const ExportPage: React.FC<ExportPageProps> = ({ db }) => {
  const [startDate, setStartDate] = useState(formatLocalDate(new Date()));
  const [endDate, setEndDate] = useState(formatLocalDate(new Date()));
  const [isExporting, setIsExporting] = useState(false);
  const [encoding, setEncoding] = useState<ExportEncoding>("utf-8-sig");

  useEffect(() => {
    const loadDefaults = async () => {
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings WHERE key IN ('day_boundary_hour', 'default_export_encoding')"
      );
      const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      const boundaryHour = parseIntegerSetting(settings.day_boundary_hour, 5, 0, 23);
      const defaultDate = calculateWorkDate(new Date(), boundaryHour);
      const defaultEncoding = settings.default_export_encoding;

      setStartDate(defaultDate);
      setEndDate(defaultDate);
      if (defaultEncoding === "utf-8" || defaultEncoding === "utf-8-sig") {
        setEncoding(defaultEncoding);
      }
    };

    loadDefaults().catch((err) => {
      console.error("Failed to load export defaults", err);
    });
  }, [db]);

  const handleExport = async () => {
    if (!startDate || !endDate) {
      alert("開始日と終了日を入力してください。");
      return;
    }

    if (startDate > endDate) {
      alert("開始日は終了日以前の日付を指定してください。");
      return;
    }

    setIsExporting(true);
    try {
      const query = `
        SELECT 
          e.id as employee_id,
          e.employee_code,
          e.name as employee_name,
          p.work_date,
          p.type,
          p.punched_at_ms
        FROM punches p
        JOIN employees e ON p.employee_id = e.id
        WHERE p.work_date BETWEEN ? AND ?
        ORDER BY p.work_date ASC, e.id ASC, p.punched_at_ms ASC
      `;
      const rows = await db.select<ExportRow[]>(query, [startDate, endDate]);

      if (rows.length === 0) {
        alert("指定された期間にデータがありません。");
        return;
      }

      // 従業員×日付ごとにデータを集約
      const aggregated: Record<string, AggregatedExportRow> = {};

      rows.forEach(row => {
        const key = `${row.employee_id}_${row.work_date}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            employee_id: row.employee_id,
            employee_code: row.employee_code ?? "",
            employee_name: row.employee_name,
            work_date: row.work_date,
            clock_in: [],
            clock_out: [],
            break_start: [],
            break_end: [],
          };
        }

        if (PUNCH_TYPE_KEYS.includes(row.type)) {
          aggregated[key][row.type].push(formatLocalTime(row.punched_at_ms));
        }
      });

      // CSV文字列の生成
      const header = ["従業員番号", "名前", "勤務日", "出勤", "退勤", "休憩開始", "休憩終了"].join(",");
      const body = Object.values(aggregated).map((item) => {
        return [
          item.employee_code,
          item.employee_name,
          item.work_date,
          item.clock_in.join(" / "),
          item.clock_out.join(" / "),
          item.break_start.join(" / "),
          item.break_end.join(" / "),
        ].map((value) => escapeCsvField(value ?? "")).join(",");
      }).join("\n");

      const csvContent = header + "\n" + body;

      // 保存ダイアログ
      const path = await save({
        filters: [{ name: "CSV", extensions: ["csv"] }],
        defaultPath: `attendance_${startDate}_to_${endDate}.csv`
      });

      if (path) {
        await writeFile(path, encodeCsv(csvContent, encoding));
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

        <div className="input-group export-encoding">
          <label>文字コード</label>
          <select value={encoding} onChange={(e) => setEncoding(e.target.value as ExportEncoding)}>
            <option value="utf-8-sig">UTF-8 BOM付き</option>
            <option value="utf-8">UTF-8</option>
          </select>
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
        .export-encoding {
          margin-bottom: 2rem;
        }
        .export-encoding select {
          padding: 0.6rem;
          background: #1a1a1a;
          border: 1px solid #444;
          color: white;
          border-radius: 4px;
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
