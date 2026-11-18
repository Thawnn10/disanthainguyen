-- ============================================================================
-- Migration: 0001_init_contributions.sql
-- Hệ thống Đóng góp Tri thức Cộng đồng — Di Sản Thái Nguyên · Âm Vang Di Sản
-- Worker: disanthainguyen-backendd
-- Database: disanthainguyen-contributions (6a0e2ff6-2230-43ba-8ec4-22987349bb7a)
-- An toàn: Chỉ sử dụng CREATE TABLE/INDEX IF NOT EXISTS, không xóa dữ liệu cũ
-- ============================================================================

CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    contributor_name TEXT NOT NULL,
    contribution_type TEXT NOT NULL DEFAULT 'Bổ sung kiến thức di sản',
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT,
    admin_note TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_school_name ON contributions(school_name);
CREATE INDEX IF NOT EXISTS idx_contributions_status_created ON contributions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS contribution_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contribution_id TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    admin_username TEXT NOT NULL,
    admin_note TEXT DEFAULT '',
    changed_at TEXT NOT NULL,
    FOREIGN KEY (contribution_id) REFERENCES contributions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_contribution_id ON contribution_audit_logs(contribution_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip_hint TEXT DEFAULT '',
    user_agent TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL,
    blocked_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
