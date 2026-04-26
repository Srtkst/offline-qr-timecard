import { useEffect, useState } from "react";
import { initDatabase } from "./db/initDb";
import PunchPage from "./pages/PunchPage";
import AdminPage from "./pages/AdminPage";
import Database from "@tauri-apps/plugin-sql";
import "./App.css";

function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [currentPage, setCurrentPage] = useState<"punch" | "admin">("punch");
  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleNavigateAdmin = async () => {
    try {
      const rows = await db?.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = 'admin_pin'"
      );
      const correctPin = rows?.[0]?.value || "1234";
      
      const pin = prompt("管理者PINを入力してください");
      if (pin === correctPin) {
        setCurrentPage("admin");
      } else if (pin !== null) {
        alert("PINが正しくありません。");
      }
    } catch (err) {
      console.error("Failed to fetch PIN", err);
      alert("エラーが発生しました。");
    }
  };

  useEffect(() => {
    initDatabase()
      .then((database: Database) => {
        setDb(database);
        setIsInitializing(false);
      })
      .catch((err: any) => {
        console.error("Failed to initialize database", err);
        setErrorMsg(err.toString());
        setIsInitializing(false);
      });
  }, []);

  if (isInitializing) {
    return <div className="loading">初期化中...</div>;
  }

  if (errorMsg) {
    return (
      <div className="error">
        <h1>データベースの起動に失敗しました</h1>
        <p style={{ color: "red", background: "#fee", padding: "1rem" }}>{errorMsg}</p>
        <button onClick={() => window.location.reload()}>再試行</button>
      </div>
    );
  }

  if (!db) {
    return <div className="error">データベースが空です。</div>;
  }

  return (
    <div className="app-container">
      {currentPage === "punch" ? (
        <PunchPage db={db} onNavigateAdmin={handleNavigateAdmin} />
      ) : (
        <AdminPage db={db} onNavigatePunch={() => setCurrentPage("punch")} />
      )}
    </div>
  );
}

export default App;
