import React, { useState, useEffect } from "react";
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

const EmployeesPage: React.FC<EmployeesPageProps> = ({ db }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [printingEmployee, setPrintingEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    loadEmployees();
  }, [db]);

  const loadEmployees = async () => {
    const rows = await db.select<Employee[]>("SELECT * FROM employees ORDER BY id DESC");
    setEmployees(rows);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    const qrToken = generateQrToken(newCode);
    const now = Date.now();

    try {
      await db.execute(
        "INSERT INTO employees (name, employee_code, qr_token, is_active, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 1, ?, ?)",
        [newName, newCode, qrToken, now, now]
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

    try {
      await db.execute(
        "UPDATE employees SET name = ?, employee_code = ?, updated_at_ms = ? WHERE id = ?",
        [editingEmployee.name, editingEmployee.employee_code, Date.now(), editingEmployee.id]
      );
      setEditingEmployee(null);
      loadEmployees();
    } catch (err) {
      alert("更新に失敗しました。従業員番号が重複している可能性があります。");
    }
  };

  const toggleActive = async (employee: Employee) => {
    const newStatus = employee.is_active === 1 ? 0 : 1;
    await db.execute(
      "UPDATE employees SET is_active = ?, updated_at_ms = ? WHERE id = ?",
      [newStatus, Date.now(), employee.id]
    );
    loadEmployees();
  };

  const regenerateQr = async (employee: Employee) => {
    if (!confirm(`${employee.name}さんのQRコードを再発行しますか？古いQRコードは使えなくなります。`)) return;

    const newToken = generateQrToken(employee.employee_code);
    await db.execute(
      "UPDATE employees SET qr_token = ?, updated_at_ms = ? WHERE id = ?",
      [newToken, Date.now(), employee.id]
    );
    loadEmployees();
  };

  return (
    <div className="employees-page">
      <div className="action-bar">
        <h2>従業員一覧</h2>
        <button onClick={() => { setIsAdding(!isAdding); setEditingEmployee(null); }} className="primary-button">
          {isAdding ? "キャンセル" : "新規登録"}
        </button>
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
              value={editingEmployee ? editingEmployee.employee_code : newCode} 
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
          {employees.map((emp) => (
            <tr key={emp.id} className={emp.is_active === 0 ? "inactive" : ""}>
              <td>{emp.employee_code}</td>
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
          ))}
        </tbody>
      </table>

      {printingEmployee && (
        <QrCodePrinter
          employeeName={printingEmployee.name}
          employeeCode={printingEmployee.employee_code}
          qrToken={printingEmployee.qr_token}
          onClose={() => setPrintingEmployee(null)}
        />
      )}

      <style>{`
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
