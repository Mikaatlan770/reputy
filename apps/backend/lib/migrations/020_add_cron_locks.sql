-- 020: Cron locks — prevents double-run of worker scripts
-- Each worker acquires a named lock before processing.
-- If the lock is held (and not expired), the second instance exits gracefully.

CREATE TABLE IF NOT EXISTS cron_locks (
  name          TEXT PRIMARY KEY,     -- worker name (e.g. 'email_worker')
  locked_at     TEXT NOT NULL,        -- ISO timestamp when lock was acquired
  locked_until  TEXT NOT NULL,        -- ISO timestamp when lock expires (locked_at + TTL)
  owner         TEXT NOT NULL,        -- identifier: hostname:pid
  updated_at    TEXT DEFAULT (datetime('now'))
);
