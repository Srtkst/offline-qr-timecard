import Database from "@tauri-apps/plugin-sql";
import { ensureAdminPinSettings } from "../domain/auth";

export async function initDatabase() {
  const db = await Database.load("sqlite:attendance.db");
  await db.execute("PRAGMA foreign_keys = ON;");

  // スキーマの定義 (schema.sqlの内容)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_code TEXT,
      qr_token TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS punches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      punched_at_ms INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
  `);

  // インデックスの作成
  await db.execute("CREATE INDEX IF NOT EXISTS idx_employees_qr_token ON employees(qr_token);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_punches_employee_id ON punches(employee_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_punches_work_date ON punches(work_date);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_punches_employee_date ON punches(employee_id, work_date);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_punches_punched_at ON punches(punched_at_ms);");

  // 初期設定の投入
  const now = Date.now();
  const initialSettings = [
    ["company_name", "QR打刻ソフト"],
    ["day_boundary_hour", "5"],
    ["duplicate_window_sec", "10"],
    ["default_export_encoding", "utf-8-sig"],
    ["last_selected_type", "clock_in"],
    ["use_camera", "0"],
  ];

  for (const [key, value] of initialSettings) {
    // 存在しない場合のみ挿入
    const exists = await db.select<{ key: string }[]>(
      'SELECT "key" FROM settings WHERE "key" = ?',
      [key]
    );
    if (exists.length === 0) {
      await db.execute(
        'INSERT INTO settings ("key", "value", updated_at_ms) VALUES (?, ?, ?)',
        [key, value, now]
      );
    }
  }

  await ensureAdminPinSettings(db);

  // 開発時のみテスト用従業員を投入 (従業員が0人の場合のみ)
  const employeeCount = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM employees");
  if (import.meta.env.DEV && employeeCount[0].count === 0) {
    await db.execute(
      "INSERT INTO employees (name, employee_code, qr_token, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)",
      ["テスト 太郎", "T001", "TEST_TOKEN_123", now, now]
    );
    console.log("Test employee created: QR Token = TEST_TOKEN_123");
  }

  return db;
}
