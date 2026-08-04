const state = {
  year: Number(document.body.dataset.year),
  month: Number(document.body.dataset.month),
  selectedDate: localDateKey(),
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
const taskRemind = document.querySelector("#taskRemind");
const formMessage = document.querySelector("#formMessage");
const toastArea = document.querySelector("#toastArea");
const notifyButton = document.querySelector("#notifyButton");

// toISOString() would give the UTC date, which is the previous day here for the
// first hours after midnight. Build the key from local calendar fields instead.
function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

const REMINDER_CHOICES = [0, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080];

function formatLead(minutes) {
  if (!minutes) {
    return "At time";
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days > 1 ? "s" : ""} before`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? "s" : ""} before`;
  }

  return `${minutes} min before`;
}

function reminderSelect(task) {
  // keep a custom value set through the API selectable instead of silently resetting it
  const choices = REMINDER_CHOICES.includes(task.remind_before)
    ? REMINDER_CHOICES
    : [...REMINDER_CHOICES, task.remind_before].sort((a, b) => a - b);

  const options = choices.map((minutes) => {
    const chosen = minutes === task.remind_before ? " selected" : "";
    return `<option value="${minutes}"${chosen}>${formatLead(minutes)}</option>`;
  }).join("");

  return `<select class="reminder-select" data-remind="${task.id}" aria-label="Reminder time">${options}</select>`;
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
          <div class="task-reminder">
            <span class="reminder-icon" aria-hidden="true">&#9200;</span>
            ${reminderSelect(task)}
          </div>
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
    remind_before: Number(taskRemind.value),
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

  if (completed) {
    clearToast(taskId);
  }

  await loadMonth();
}

async function setReminder(taskId, remindBefore) {
  await fetch(`/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remind_before: remindBefore }),
  });
  await loadMonth();
}

async function deleteTask(taskId) {
  await fetch(`/tasks/${taskId}`, { method: "DELETE" });
  clearToast(taskId);
  await loadMonth();
}

function leadPhrase(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days > 1 ? "s" : ""}`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }

  return `${minutes} minutes`;
}

function reminderSentence(task) {
  const today = localDateKey();
  const when = task.due_date === today
    ? `today at ${formatTime(task.due_time)}`
    : `${formatDateLabel(task.due_date)} at ${formatTime(task.due_time)}`;

  if (!task.remind_before) {
    return `Due ${when}`;
  }

  return `Starts in ${leadPhrase(task.remind_before)} — ${when}`;
}

// reminders dismissed by hand: cleared on reload, so an unfinished task nags again
const dismissedReminders = new Set();

function showToast(task) {
  // already on screen: leave it alone rather than rebuilding it every poll
  if (toastArea.querySelector(`[data-toast-task="${task.id}"]`)) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.toastTask = String(task.id);
  toast.innerHTML = `
    <strong>${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(reminderSentence(task))}</p>
    <div class="toast-actions">
      <button class="small-button toast-done" type="button" data-toast-done="${task.id}">Mark done</button>
      <button class="small-button" type="button" data-toast-dismiss="${task.id}">Dismiss</button>
    </div>
  `;
  toastArea.appendChild(toast);
}

function clearToast(taskId) {
  const toast = toastArea.querySelector(`[data-toast-task="${taskId}"]`);
  if (toast) {
    toast.remove();
  }
}

// Windows draws the OS notification itself, so no CSS applies. The icon is the
// only piece we control, so paint one in the app's colours instead of letting
// Chrome fall back to its generic globe.
let cachedIconUrl = null;

function notificationIcon() {
  if (cachedIconUrl) {
    return cachedIconUrl;
  }

  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, "#071a3d");
  base.addColorStop(1, "#01060f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(size / 2, size * 0.74, 0, size / 2, size * 0.74, size * 0.72);
  glow.addColorStop(0, "rgba(41, 214, 255, 0.9)");
  glow.addColorStop(0.55, "rgba(41, 214, 255, 0.25)");
  glow.addColorStop(1, "rgba(41, 214, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.font = `${Math.round(size * 0.52)}px system-ui, "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⏰", size / 2, size / 2);

  cachedIconUrl = canvas.toDataURL("image/png");
  return cachedIconUrl;
}

function showBrowserNotification(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification(task.remind_before ? "Upcoming task" : "Task due", {
    body: `${task.title} — ${reminderSentence(task)}`,
    tag: `task-${task.id}`,
    icon: notificationIcon(),
    badge: notificationIcon(),
    // the wide hero image is what makes the popup render large rather than as a
    // single compact line
    image: "/static/blue-ui.jpg",
    // stay on screen until dealt with, matching the in-page toast
    requireInteraction: true,
  });

  // clicking it brings the planner back to the front
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

async function checkDueTasks() {
  const response = await fetch("/api/due");
  const data = await response.json();

  const outstanding = new Set();
  let announced = false;

  for (const task of data.tasks) {
    outstanding.add(String(task.id));

    if (dismissedReminders.has(task.id)) {
      continue;
    }

    showToast(task);

    // the OS popup is a one-off event, unlike the toast
    if (task.fresh) {
      showBrowserNotification(task);
      announced = true;
    }
  }

  // drop toasts for tasks completed or deleted somewhere else
  for (const toast of toastArea.querySelectorAll("[data-toast-task]")) {
    if (!outstanding.has(toast.dataset.toastTask)) {
      toast.remove();
    }
  }

  if (announced) {
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

selectedTaskList.addEventListener("change", async (event) => {
  const reminderPicker = event.target.closest("[data-remind]");
  if (!reminderPicker) {
    return;
  }

  await setReminder(Number(reminderPicker.dataset.remind), Number(reminderPicker.value));
});

toastArea.addEventListener("click", async (event) => {
  const doneButton = event.target.closest("[data-toast-done]");
  const dismissButton = event.target.closest("[data-toast-dismiss]");

  if (doneButton) {
    const taskId = Number(doneButton.dataset.toastDone);
    clearToast(taskId);
    await toggleTask(taskId, true);
  }

  if (dismissButton) {
    const taskId = Number(dismissButton.dataset.toastDismiss);
    dismissedReminders.add(taskId);
    clearToast(taskId);
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
