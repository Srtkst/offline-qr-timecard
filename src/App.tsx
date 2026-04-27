import { useEffect, useState, type FormEvent } from "react";
import { initDatabase } from "./db/initDb";
import { setAdminPin, shouldChangeAdminPin, validateAdminPin, verifyAdminPin } from "./domain/auth";
import PunchPage from "./pages/PunchPage";
import AdminPage from "./pages/AdminPage";
import Database from "@tauri-apps/plugin-sql";
import "./App.css";

function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [currentPage, setCurrentPage] = useState<"punch" | "admin">("punch");
  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isCheckingPin, setIsCheckingPin] = useState(false);
  const [mustChangePin, setMustChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  const handleNavigateAdmin = () => {
    setPinInput("");
    setPinError(null);
    setIsPinModalOpen(true);
  };

  const handleAdminLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!db || isCheckingPin) return;

    setIsCheckingPin(true);
    try {
      const isValid = await verifyAdminPin(db, pinInput);
      if (isValid) {
        const shouldForceChange = await shouldChangeAdminPin(db);
        setIsPinModalOpen(false);
        setCurrentPage("admin");
        if (shouldForceChange) {
          setMustChangePin(true);
          setNewPin("");
          setNewPinConfirm("");
          setPinChangeError("初期PINのままです。新しい管理者PINを設定してください。");
        }
      } else {
        setPinError("PINが正しくありません。");
      }
    } catch (err) {
      console.error("Failed to fetch PIN", err);
      setPinError("PINの確認中にエラーが発生しました。");
    } finally {
      setIsCheckingPin(false);
    }
  };

  const handleForcedPinChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!db || isSavingPin) return;

    const validationError = validateAdminPin(newPin);
    if (validationError) {
      setPinChangeError(validationError);
      return;
    }
    if (newPin !== newPinConfirm) {
      setPinChangeError("確認用PINが一致しません。");
      return;
    }

    setIsSavingPin(true);
    try {
      await setAdminPin(db, newPin, false);
      setMustChangePin(false);
      setNewPin("");
      setNewPinConfirm("");
      setPinChangeError(null);
      alert("管理者PINを変更しました。");
    } catch (err) {
      console.error("Failed to update admin PIN", err);
      setPinChangeError("管理者PINの変更に失敗しました。");
    } finally {
      setIsSavingPin(false);
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

      {isPinModalOpen && (
        <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-pin-title">
          <form className="app-modal" onSubmit={handleAdminLogin}>
            <h2 id="admin-pin-title">管理者PIN</h2>
            <label className="modal-field">
              <span>PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pinInput}
                onChange={(event) => {
                  setPinInput(event.target.value);
                  setPinError(null);
                }}
              />
            </label>
            {pinError && <p className="modal-error">{pinError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setIsPinModalOpen(false)}>
                キャンセル
              </button>
              <button type="submit" className="primary-button" disabled={isCheckingPin}>
                {isCheckingPin ? "確認中..." : "管理画面へ進む"}
              </button>
            </div>
          </form>
        </div>
      )}

      {mustChangePin && (
        <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-change-title">
          <form className="app-modal" onSubmit={handleForcedPinChange}>
            <h2 id="pin-change-title">管理者PINの変更</h2>
            <label className="modal-field">
              <span>新しいPIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={newPin}
                onChange={(event) => {
                  setNewPin(event.target.value);
                  setPinChangeError(null);
                }}
              />
            </label>
            <label className="modal-field">
              <span>新しいPIN（確認）</span>
              <input
                type="password"
                inputMode="numeric"
                value={newPinConfirm}
                onChange={(event) => {
                  setNewPinConfirm(event.target.value);
                  setPinChangeError(null);
                }}
              />
            </label>
            {pinChangeError && <p className="modal-error">{pinChangeError}</p>}
            <div className="modal-actions">
              <button type="submit" className="primary-button" disabled={isSavingPin}>
                {isSavingPin ? "保存中..." : "変更して続ける"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
