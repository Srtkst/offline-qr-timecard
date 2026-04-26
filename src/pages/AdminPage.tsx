import React, { useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import EmployeesPage from "./EmployeesPage";
import PunchLogsPage from "./PunchLogsPage";
import ExportPage from "./ExportPage";
import SettingsPage from "./SettingsPage";

interface AdminPageProps {
  db: Database;
  onNavigatePunch: () => void;
}

type AdminTab = "employees" | "logs" | "export" | "settings";

const AdminPage: React.FC<AdminPageProps> = ({ db, onNavigatePunch }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>("employees");

  const renderContent = () => {
    switch (activeTab) {
      case "employees":
        return <EmployeesPage db={db} />;
      case "logs":
        return <PunchLogsPage db={db} />;
      case "export":
        return <ExportPage db={db} />;
      case "settings":
        return <SettingsPage db={db} />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>管理画面</h1>
        <button onClick={onNavigatePunch} className="back-button">打刻画面へ戻る</button>
      </header>

      <div className="admin-layout">
        <nav className="admin-sidebar">
          <ul>
            <li className={activeTab === "employees" ? "active" : ""} onClick={() => setActiveTab("employees")}>従業員管理</li>
            <li className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>打刻履歴</li>
            <li className={activeTab === "export" ? "active" : ""} onClick={() => setActiveTab("export")}>CSV出力</li>
            <li className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>システム設定</li>
          </ul>
        </nav>

        <main className="admin-main">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
