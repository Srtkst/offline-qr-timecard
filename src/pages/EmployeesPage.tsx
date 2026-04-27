import React, { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { generateQrToken } from "../domain/attendance";
import QrCodePrinter from "../components/QrCodePrinter";

interface Employee {
  id: number;
  name: string;
  employee_code: string;
  qr_token: string;
  is_active: number;
}

interface EmployeesPageProps {
  db: Database;
}

type StatusFilter = "all" | "active" | "inactive";

const PAGE_SIZE = 20;

const EmployeesPage: React.FC<EmployeesPageProps> = ({ db }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [printingEmployee, setPrintingEmployee] = useState<Employee | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadEmployees();
  }, [db]);

  const loadEmployees = async () => {
    const rows = await db.select<Employee[]>("SELECT * FROM employees ORDER BY id DESC");
    setEmployees(rows);
  };

  const filteredEmployees = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesKeyword =
        !keyword ||
        employee.name.toLowerCase().includes(keyword) ||
        (employee.employee_code || "").toLowerCase().includes(keyword);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.is_active === 1) ||
        (statusFilter === "inactive" && employee.is_active === 0);

      return matchesKeyword && matchesStatus;
    });
  }, [employees, searchText, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const paginatedEmployees = filteredEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    const trimmedCode = newCode.trim();
    if (!trimmedName) {
      alert("名前を入力してください。");
      return;
    }

    const qrToken = generateQrToken(trimmedCode);
    const now = Date.now();

    try {
      await db.execute(
        "INSERT INTO employees (name, employee_code, qr_token, is_active, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 1, ?, ?)",
        [trimmedName, trimmedCode, qrToken, now, now]
      );
      setNewName("");
      setNewCode("");
      setIsAdding(false);
      loadEmployees();
    } catch (err) {
      alert("登録に失敗しました。従業員番号やQRトークンが重複している可能性があります。");
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    const trimmedName = editingEmployee.name.trim();
    const trimmedCode = (editingEmployee.employee_code || "").trim();
    if (!trimmedName) {
      alert("名前を入力してください。");
      return;
    }

    try {
      await db.execute(
        "UPDATE employees SET name = ?, employee_code = ?, updated_at_ms = ? WHERE id = ?",
        [trimmedName, trimmedCode, Date.now(), editingEmployee.id]
      );
      setEditingEmployee(null);
      loadEmployees();
    } catch (err) {
      alert("更新に失敗しました。従業員番号が重複している可能性があります。");
    }
  };

  const toggleActive = async (employee: Employee) => {
    const newStatus = employee.is_active === 1 ? 0 : 1;
    try {
      await db.execute(
        "UPDATE employees SET is_active = ?, updated_at_ms = ? WHERE id = ?",
        [newStatus, Date.now(), employee.id]
      );
      loadEmployees();
    } catch (err) {
      console.error(err);
      alert("状態の変更に失敗しました。");
    }
  };

  const regenerateQr = async (employee: Employee) => {
    if (!confirm(`${employee.name}さんのQRコードを再発行しますか？古いQRコードは使えなくなります。`)) return;

    const newToken = generateQrToken(employee.employee_code || "");
    try {
      await db.execute(
        "UPDATE employees SET qr_token = ?, updated_at_ms = ? WHERE id = ?",
        [newToken, Date.now(), employee.id]
      );
      loadEmployees();
    } catch (err) {
      console.error(err);
      alert("QRコードの再発行に失敗しました。");
    }
  };

  return (
    <div className="employees-page">
      <div className="action-bar">
        <h2>従業員一覧</h2>
        <button onClick={() => { setIsAdding(!isAdding); setEditingEmployee(null); }} className="primary-button">
          {isAdding ? "キャンセル" : "新規登録"}
        </button>
      </div>

      <div className="employee-filters">
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="名前・従業員番号で検索"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">すべて</option>
          <option value="active">有効のみ</option>
          <option value="inactive">無効のみ</option>
        </select>
      </div>

      {(isAdding || editingEmployee) && (
        <form onSubmit={editingEmployee ? handleUpdateEmployee : handleAddEmployee} className="add-form">
          <div className="input-group">
            <label>名前</label>
            <input 
              value={editingEmployee ? editingEmployee.name : newName} 
              onChange={(e) => editingEmployee ? setEditingEmployee({...editingEmployee, name: e.target.value}) : setNewName(e.target.value)} 
              placeholder="例: 山田 太郎" required 
            />
          </div>
          <div className="input-group">
            <label>従業員番号</label>
            <input 
              value={editingEmployee ? editingEmployee.employee_code || "" : newCode}
              onChange={(e) => editingEmployee ? setEditingEmployee({...editingEmployee, employee_code: e.target.value}) : setNewCode(e.target.value)} 
              placeholder="例: A001" 
            />
          </div>
          <button type="submit" className="save-button">
            {editingEmployee ? "更新保存" : "登録実行"}
          </button>
          {editingEmployee && <button type="button" onClick={() => setEditingEmployee(null)} className="cancel-button">中断</button>}
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>番号</th>
            <th>氏名</th>
            <th>QRトークン</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {paginatedEmployees.length > 0 ? (
            paginatedEmployees.map((emp) => (
              <tr key={emp.id} className={emp.is_active === 0 ? "inactive" : ""}>
              <td>{emp.employee_code || ""}</td>
                <td>{emp.name}</td>
                <td className="token-cell">{emp.qr_token}</td>
                <td>{emp.is_active === 1 ? "有効" : "無効"}</td>
                <td>
                  <button onClick={() => { setEditingEmployee(emp); setIsAdding(false); }}>編集</button>
                  <button onClick={() => toggleActive(emp)}>
                    {emp.is_active === 1 ? "無効化" : "有効化"}
                  </button>
                  <button onClick={() => setPrintingEmployee(emp)}>印刷</button>
                  <button onClick={() => regenerateQr(emp)}>再発行</button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="no-data">該当する従業員はありません。</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="pagination">
        <span>{filteredEmployees.length}件中 {paginatedEmployees.length}件を表示</span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>前へ</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>次へ</button>
        </div>
      </div>

      {printingEmployee && (
        <QrCodePrinter
          employeeName={printingEmployee.name}
          employeeCode={printingEmployee.employee_code || ""}
          qrToken={printingEmployee.qr_token}
          onClose={() => setPrintingEmployee(null)}
        />
      )}

      <style>{`
        .employee-filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .employee-filters input,
        .employee-filters select {
          padding: 0.6rem;
          background: #1a1a1a;
          border: 1px solid #444;
          color: white;
          border-radius: 4px;
        }
        .employee-filters input {
          flex: 1;
        }
        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1rem;
          color: #aaa;
        }
        .pagination div {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .pagination button {
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          border: 1px solid #555;
          background: #333;
          color: #ddd;
          cursor: pointer;
        }
        .pagination button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .no-data {
          text-align: center;
          color: #777;
        }
        .cancel-button {
          background-color: #666;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          margin-left: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default EmployeesPage;
