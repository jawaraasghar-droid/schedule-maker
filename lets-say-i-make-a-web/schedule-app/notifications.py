from __future__ import annotations

import sqlite3
from datetime import datetime


def get_due_tasks(
    conn: sqlite3.Connection,
    user_id: str,
    now: datetime | None = None,
    ) -> list[dict]:
        """Tasks whose reminder time has arrived and that have not been announced yet.

        The reminder fires `remind_before` minutes ahead of `due_at`,
        so a value of 0 still means "remind me at the due time".
        """
        current_time = now or datetime.now()
        rows = conn.execute(
        """
        SELECT id, title, notes, due_date, due_time, due_at, remind_before,
               completed, notified, created_at
        FROM tasks
        WHERE user_id = ?
          AND completed = 0
          AND notified = 0
          AND datetime(due_at, '-' || remind_before || ' minutes') <= ?
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
            "remind_before": row["remind_before"] or 0,
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
