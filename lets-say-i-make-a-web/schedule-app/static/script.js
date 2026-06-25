const state = {
  year: Number(document.body.dataset.year),
  month: Number(document.body.dataset.month),
  selectedDate: new Date().toISOString().slice(0, 10),
  calendar: null,
};

const calendarGrid = document.querySelector("#calendarGrid");
const weekdayRow = document.querySelector("#weekdayRow");
const monthLabel = document.querySelector("#monthLabel");
const selectedDateLabel = document.querySelector("#selectedDateLabel");
const selectedTaskList = document.querySelector("#selectedTaskList");
const taskCount = document.querySelector("#taskCount");
const taskForm = document.querySelector("#taskForm");
const taskTitle = document.querySelector("#taskTitle");
const taskDate = document.querySelector("#taskDate");
const taskTime = document.querySelector("#taskTime");
const taskNotes = document.querySelector("#taskNotes");
const formMessage = document.querySelector("#formMessage");
const toastArea = document.querySelector("#toastArea");
const notifyButton = document.querySelector("#notifyButton");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateLabel(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(timeText) {
  const [hours, minutes] = timeText.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function allTasksForDate(dateText) {
  if (!state.calendar) {
    return [];
  }

  for (const week of state.calendar.weeks) {
    const day = week.find((entry) => entry.date === dateText);
    if (day) {
      return day.tasks;
    }
  }

  return [];
}

async function loadMonth() {
  const response = await fetch(`/api/month?year=${state.year}&month=${state.month}`);
  state.calendar = await response.json();
  renderCalendar();
  renderSelectedDay();
}

function renderCalendar() {
  monthLabel.textContent = state.calendar.label;
  weekdayRow.innerHTML = state.calendar.weekdays
    .map((day) => `<div class="weekday">${day}</div>`)
    .join("");

  calendarGrid.innerHTML = state.calendar.weeks
    .flatMap((week) => week)
    .map((day) => {
      const classes = [
        "day-cell",
        day.in_month ? "" : "outside",
        day.is_today ? "today" : "",
        day.date === state.selectedDate ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const previewTasks = day.tasks.slice(0, 3);
      const extraCount = day.tasks.length - previewTasks.length;
      const taskHtml = previewTasks
        .map(
          (task) => `
            <div class="mini-task ${task.completed ? "done" : ""}">
              ${escapeHtml(task.due_time)} ${escapeHtml(task.title)}
            </div>
          `,
        )
        .join("");

      const emptyHtml = day.tasks.length === 0 ? '<p class="empty-day">No tasks</p>' : "";
      const extraHtml = extraCount > 0 ? `<div class="mini-task">+${extraCount} more</div>` : "";

      return `
        <button class="${classes}" type="button" data-date="${day.date}">
          <div class="day-head">
            <span class="day-number">${day.day}</span>
            <span class="task-pill-count">${day.tasks.length}</span>
          </div>
          <div class="mini-task-list">
            ${taskHtml}
            ${extraHtml}
          </div>
          ${emptyHtml}
        </button>
      `;
    })
    .join("");
}

function renderSelectedDay() {
  taskDate.value = state.selectedDate;
  selectedDateLabel.textContent = formatDateLabel(state.selectedDate);

  const tasks = allTasksForDate(state.selectedDate);
  taskCount.textContent = String(tasks.length);

  if (tasks.length === 0) {
    selectedTaskList.innerHTML = '<p class="empty-state">Nothing planned for this day.</p>';
    return;
  }

  selectedTaskList.innerHTML = tasks
    .map(
      (task) => `
        <article class="task-card ${task.completed ? "completed" : ""}">
          <div class="task-topline">
            <p class="task-title">${escapeHtml(task.title)}</p>
            <span class="task-time">${formatTime(task.due_time)}</span>
          </div>
          ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ""}
          <div class="task-actions">
            <button class="small-button" type="button" data-toggle="${task.id}">
              ${task.completed ? "Reopen" : "Done"}
            </button>
            <button class="small-button" type="button" data-delete="${task.id}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function changeMonth(offset) {
  const next = new Date(state.year, state.month - 1 + offset, 1);
  state.year = next.getFullYear();
  state.month = next.getMonth() + 1;
  state.selectedDate = `${state.year}-${String(state.month).padStart(2, "0")}-01`;
  loadMonth();
}

async function addTask(event) {
  event.preventDefault();
  formMessage.textContent = "";

  const payload = {
    title: taskTitle.value.trim(),
    due_date: taskDate.value,
    due_time: taskTime.value,
    notes: taskNotes.value.trim(),
  };

  const response = await fetch("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    formMessage.textContent = error.error || "Could not add task.";
    return;
  }

  state.selectedDate = payload.due_date;
  taskForm.reset();
  taskDate.value = state.selectedDate;
  await loadMonth();
}

async function toggleTask(taskId, completed) {
  await fetch(`/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  await loadMonth();
}

async function deleteTask(taskId) {
  await fetch(`/tasks/${taskId}`, { method: "DELETE" });
  await loadMonth();
}

function showToast(task) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <strong>${escapeHtml(task.title)}</strong>
    <p>Due today at ${formatTime(task.due_time)}</p>
  `;
  toastArea.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 9000);
}

function showBrowserNotification(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  new Notification("Task due", {
    body: `${task.title} is due at ${formatTime(task.due_time)}`,
    tag: `task-${task.id}`,
  });
}

async function checkDueTasks() {
  const response = await fetch("/api/due");
  const data = await response.json();

  for (const task of data.tasks) {
    showToast(task);
    showBrowserNotification(task);
  }

  if (data.tasks.length > 0) {
    await loadMonth();
  }
}

calendarGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) {
    return;
  }

  state.selectedDate = button.dataset.date;
  renderCalendar();
  renderSelectedDay();
});

selectedTaskList.addEventListener("click", async (event) => {
  const toggleButton = event.target.closest("[data-toggle]");
  const deleteButton = event.target.closest("[data-delete]");

  if (toggleButton) {
    const taskId = Number(toggleButton.dataset.toggle);
    const task = allTasksForDate(state.selectedDate).find((item) => item.id === taskId);
    await toggleTask(taskId, !task.completed);
  }

  if (deleteButton) {
    await deleteTask(Number(deleteButton.dataset.delete));
  }
});

taskDate.addEventListener("change", () => {
  state.selectedDate = taskDate.value || state.selectedDate;
  renderCalendar();
  renderSelectedDay();
});

document.querySelector("#prevMonth").addEventListener("click", () => changeMonth(-1));
document.querySelector("#nextMonth").addEventListener("click", () => changeMonth(1));
taskForm.addEventListener("submit", addTask);

notifyButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    formMessage.textContent = "This browser does not support notifications.";
    return;
  }

  const permission = await Notification.requestPermission();
  notifyButton.textContent = permission === "granted" ? "Notifications on" : "Allow notifications";
});

loadMonth();
checkDueTasks();
window.setInterval(checkDueTasks, 30000);
