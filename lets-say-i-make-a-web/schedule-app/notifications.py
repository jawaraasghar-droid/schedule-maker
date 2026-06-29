from __future__ import annotations

import sqlite3
from datetime import datetime


def get_due_tasks(
    conn: sqlite3.Connection,
    user_id: str,
    now: datetime | None = None,
    ) -> list[dict]:    
        current_time = now or datetime.now()
        rows = conn.execute(
        """
        SELECT id, title, notes, due_date, due_time, due_at, completed, notified, created_at
        FROM tasks
        WHERE user_id = ?
          AND completed = 0
          AND user_id = ?
          AND notified = 0
          AND due_at <= ?
        ORDER BY due_at ASC
        """,
        (user_id, current_time.strftime("%Y-%m-%d %H:%M:%S")),
    ).fetchall()

        return [
        {
            "id": row["id"],
            "title": row["title"],
            "notes": row["notes"] or "",
            "due_date": row["due_date"],
            "due_time": row["due_time"],
            "due_at": row["due_at"],
            "completed": bool(row["completed"]),
            "notified": bool(row["notified"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def mark_notified(conn: sqlite3.Connection, task_ids: list[int]) -> None:
    if not task_ids:
        return

    placeholders = ",".join("?" for _ in task_ids)
    conn.execute(
        f"UPDATE tasks SET notified = 1 WHERE id IN ({placeholders})",
        task_ids,
    )
