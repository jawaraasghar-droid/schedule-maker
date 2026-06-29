from __future__ import annotations

import calendar
import sqlite3
from datetime import date, datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
import uuid
from notifications import get_due_tasks, mark_notified


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "tasks.db"

app = Flask(__name__)
app.secret_key = "jjjjjjjiiiii"
@app.before_request
def ensure_user():
    if "user_id" not in session:
        session["user_id"] = str(uuid.uuid4())
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                notes TEXT DEFAULT '',
                due_date TEXT NOT NULL,
                due_time TEXT NOT NULL,
                due_at TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                notified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        columns = [
            row[1]
            for row in conn.execute(
                "PRAGMA table_info(tasks)"
            )
        ]

        if "user_id" not in columns:
            conn.execute(
                "ALTER TABLE tasks ADD COLUMN user_id TEXT"
            )
            conn.execute(
                "UPDATE tasks SET user_id = 'old_user'"
            )

        conn.commit()


def task_to_dict(row: sqlite3.Row) -> dict:
    return {
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


def parse_due(due_date: str, due_time: str) -> datetime:
    return datetime.strptime(f"{due_date} {due_time}", "%Y-%m-%d %H:%M")


def month_payload(year: int, month: int) -> dict:
    cal = calendar.Calendar(firstweekday=6)
    weeks = cal.monthdatescalendar(year, month)
    start = weeks[0][0].isoformat()
    end = weeks[-1][-1].isoformat()
    today = date.today().isoformat()

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, title, notes, due_date, due_time, due_at, completed, notified, created_at
            FROM tasks
            WHERE user_id = ?
            AND due_date BETWEEN ? AND ?
            ORDER BY due_date ASC, due_time ASC, created_at ASC
            """,
            (session["user_id"], start, end),
        ).fetchall()

    tasks_by_day: dict[str, list[dict]] = {}
    for row in rows:
        task = task_to_dict(row)
        tasks_by_day.setdefault(task["due_date"], []).append(task)

    calendar_weeks = []
    for week in weeks:
        calendar_week = []
        for day in week:
            key = day.isoformat()
            calendar_week.append(
                {
                    "date": key,
                    "day": day.day,
                    "in_month": day.month == month,
                    "is_today": key == today,
                    "tasks": tasks_by_day.get(key, []),
                }
            )
        calendar_weeks.append(calendar_week)

    return {
        "year": year,
        "month": month,
        "label": date(year, month, 1).strftime("%B %Y"),
        "weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        "weeks": calendar_weeks,
    }


def current_month_params() -> tuple[int, int]:
    today = date.today()
    year = request.args.get("year", default=today.year, type=int)
    month = request.args.get("month", default=today.month, type=int)

    if not year or year < 1:
        year = today.year
    if not month or month < 1 or month > 12:
        month = today.month

    return year, month


@app.get("/")
def index():
    year, month = current_month_params()
    return render_template("index.html", year=year, month=month)


@app.get("/api/month")
def api_month():
    year, month = current_month_params()
    return jsonify(month_payload(year, month))


@app.post("/tasks")
def create_task():
    data = request.get_json(silent=True) or request.form
    title = (data.get("title") or "").strip()
    notes = (data.get("notes") or "").strip()
    due_date = (data.get("due_date") or "").strip()
    due_time = (data.get("due_time") or "").strip()

    if not title or not due_date or not due_time:
        return jsonify({"error": "Title, date, and time are required."}), 400

    try:
        due = parse_due(due_date, due_time)
    except ValueError:
        return jsonify({"error": "Use a valid date and time."}), 400

    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO tasks (user_id, title, notes, due_date, due_time, due_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session["user_id"], title, notes, due_date, due_time, due.strftime("%Y-%m-%d %H:%M:%S")),
        )
        task_id = cursor.lastrowid
        conn.commit()

        task = conn.execute(
            """
            SELECT id, title, notes, due_date, due_time, due_at, completed, notified, created_at
            FROM tasks
            WHERE id = ? AND user_id = ?
            """,
            (task_id, session["user_id"]),
        ).fetchone()

    return jsonify(task_to_dict(task)), 201


@app.patch("/tasks/<int:task_id>")
def update_task(task_id: int):
    data = request.get_json(silent=True) or {}

    with get_db() as conn:
        row = conn.execute(
            """
            SELECT id, title, notes, due_date, due_time, due_at, completed, notified, created_at
            FROM tasks
            WHERE id = ? AND user_id = ?
            """,
            (task_id, session["user_id"]),
        ).fetchone()

        if row is None:
            return jsonify({"error": "Task not found."}), 404

        title = (data.get("title", row["title"]) or "").strip()
        notes = (data.get("notes", row["notes"]) or "").strip()
        due_date = (data.get("due_date", row["due_date"]) or "").strip()
        due_time = (data.get("due_time", row["due_time"]) or "").strip()
        completed = 1 if bool(data.get("completed", bool(row["completed"]))) else 0

        if not title or not due_date or not due_time:
            return jsonify({"error": "Title, date, and time are required."}), 400

        try:
            due = parse_due(due_date, due_time)
        except ValueError:
            return jsonify({"error": "Use a valid date and time."}), 400

        due_at = due.strftime("%Y-%m-%d %H:%M:%S")
        notified = 0 if due_at != row["due_at"] else row["notified"]

        conn.execute(
            """
            UPDATE tasks
            SET title = ?, notes = ?, due_date = ?, due_time = ?, due_at = ?,
                completed = ?, notified = ?
            WHERE id = ?
            AND user_id = ?
            """,
            (title, notes, due_date, due_time, due_at, completed, notified, task_id, session["user_id"]),
        )
        conn.commit()

        updated = conn.execute(
            """
            SELECT id, title, notes, due_date, due_time, due_at, completed, notified, created_at
            FROM tasks
            WHERE id = ?
            AND user_id = ?
            """,
            (task_id, session["user_id"]),
        ).fetchone()

    return jsonify(task_to_dict(updated))


@app.delete("/tasks/<int:task_id>")
def delete_task(task_id: int):
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, session["user_id"]))
        conn.commit()

    if cursor.rowcount == 0:
        return jsonify({"error": "Task not found."}), 404

    return jsonify({"ok": True})


@app.get("/api/due")
def api_due():
    with get_db() as conn:
        due_tasks = get_due_tasks(
        conn,
        session["user_id"],
)
        mark_notified(conn, [task["id"] for task in due_tasks])
        conn.commit()

    return jsonify({"tasks": due_tasks})


init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)
