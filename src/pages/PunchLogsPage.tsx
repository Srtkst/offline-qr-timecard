import React, { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { calculateWorkDate, formatLocalDate, formatLocalTime, parseIntegerSetting } from "../domain/attendance";

interface PunchLog {
  id: number;
  employee_name: string;
  employee_code: string;
  type: string;
  punched_at_ms: number;
  work_date: string;
}

interface PunchLogsPageProps {
  db: Database;
}

const TYPE_LABELS: Record<string, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

const PunchLogsPage: React.FC<PunchLogsPageProps> = ({ db }) => {
  const [logs, setLogs] = useState<PunchLog[]>([]);
  const [filterDate, setFilterDate] = useState(formatLocalDate(new Date()));

  useEffect(() => {
    loadLogs();
  }, [db, filterDate]);

  useEffect(() => {
    const loadDefaultWorkDate = async () => {
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = 'day_boundary_hour'"
      );
      const boundaryHour = parseIntegerSetting(rows[0]?.value, 5, 0, 23);
      setFilterDate(calculateWorkDate(new Date(), boundaryHour));
    };

    loadDefaultWorkDate().catch((err) => {
      console.error("Failed to load default work date", err);
    });
  }, [db]);

  const loadLogs = async () => {
    const query = `
      SELECT 
        p.*, 
        e.name as employee_name, 
        e.employee_code 
      FROM punches p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.work_date = ?
      ORDER BY p.punched_at_ms DESC
    `;
    const rows = await db.select<PunchLog[]>(query, [filterDate]);
    setLogs(rows);
  };

  const formatTime = (ms: number) => {
    return formatLocalTime(ms);
  };

  return (
    <div className="logs-page">
      <div className="action-bar">
        <h2>打刻履歴</h2>
        <div className="filter-group">
          <label>勤務日検索:</label>
          <input 
            type="date" 
            value={filterDate} 
            onChange={(e) => setFilterDate(e.target.value)}
            className="date-input"
          />
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>時刻</th>
            <th>勤務日</th>
            <th>従業員番号</th>
            <th>氏名</th>
            <th>種別</th>
          </tr>
        </thead>
        <tbody>
          {logs.length > 0 ? (
            logs.map((log) => (
              <tr key={log.id}>
                <td>{formatTime(log.punched_at_ms)}</td>
                <td>{log.work_date}</td>
                <td>{log.employee_code}</td>
                <td>{log.employee_name}</td>
                <td>
                  <span className={`type-badge ${log.type}`}>
                    {TYPE_LABELS[log.type] || log.type}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="no-data">この日の打刻データはありません。</td>
            </tr>
          )}
        </tbody>
      </table>

      <style>{`
        .filter-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .date-input {
          padding: 0.5rem;
          background: #2a2a2a;
          border: 1px solid #444;
          color: white;
          border-radius: 4px;
        }
        .type-badge {
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: bold;
        }
        .type-badge.clock_in { background-color: #1b5e20; color: #fff; }
        .type-badge.clock_out { background-color: #b71c1c; color: #fff; }
        .type-badge.break_start { background-color: #e65100; color: #fff; }
        .type-badge.break_end { background-color: #01579b; color: #fff; }
        .no-data {
          text-align: center;
          padding: 3rem !important;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default PunchLogsPage;
