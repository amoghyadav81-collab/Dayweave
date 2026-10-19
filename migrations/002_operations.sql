CREATE TABLE IF NOT EXISTS planner_operations(
 user_id TEXT NOT NULL REFERENCES users(id),
 operation_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 name TEXT NOT NULL,
 source TEXT NOT NULL,
 response TEXT NOT NULL,
 inverse TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reversed_by TEXT,
 PRIMARY KEY(user_id,operation_id)
);
