from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone

# Due times are stored as the wall-clock time the user typed in their browser,
# so every comparison has to happen in that same timezone. Hosts like
# PythonAnywhere run on UTC, which would otherwise fire reminders hours late.
TZ_NAME = os.environ.get("SCHEDULE_TZ", "Asia/Karachi")

try:
    from zoneinfo import ZoneInfo

    APP_TZ = ZoneInfo(TZ_NAME)
except Exception:  # no tzdata on the host
    APP_TZ = timezone(timedelta(hours=5))  # Pakistan Standard Time, no DST


def local_now() -> datetime:
    """Current wall-clock time in the app's timezone, naive so it compares
    directly against the stored due_at / due_date values."""
    return datetime.now(APP_TZ).replace(tzinfo=None)


def local_today():
    return local_now().date()


def get_due_tasks(
    conn: sqlite3.Connection,
    user_id: str,
    now: datetime | None = None,
    ) -> list[dict]:
        """Every reminder that is currently outstanding.

        A reminder becomes outstanding `remind_before` minutes ahead of `due_at`
        (0 meaning "at the due time") and stays outstanding until the task is
        marked complete -- so the toast can sit on screen and survive a reload.

        `fresh` marks the ones never announced before, so the one-off OS
        notification fires once instead of on every poll.
        """
        current_time = now or local_now()
        rows = conn.execute(
        """
        SELECT id, title, notes, due_date, due_time, due_at, remind_before,
               completed, notified, created_at
        FROM tasks
        WHERE user_id = ?
          AND completed = 0
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
            "fresh": not bool(row["notified"]),
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
