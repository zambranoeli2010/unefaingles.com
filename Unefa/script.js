const API_BASE_URL = getApiBaseUrl();
const STORAGE_KEYS = {
    profile: "unefaProfile",
    tasks: "unefaTasks",
    schedule: "unefaSchedule",
    classroom: "unefaClassroom"
};
const AUTH_KEYS = {
    token: "unefaAuthToken",
    user: "unefaAuthUser"
};

const studentForm = document.getElementById("studentForm");
const studentFields = {
    name: document.getElementById("studentName"),
    id: document.getElementById("studentId"),
    phone: document.getElementById("studentPhone"),
    email: document.getElementById("studentEmail"),
    goal: document.getElementById("studentGoal")
};
const profileSummary = document.getElementById("profileSummary");
const summaryElements = {
    name: document.getElementById("summaryName"),
    goal: document.getElementById("summaryGoal"),
    next: document.getElementById("summaryNext")
};

const taskForm = document.getElementById("taskForm");
const taskList = document.getElementById("taskList");
const taskTemplate = document.getElementById("taskTemplate");
const filters = {
    status: document.getElementById("statusFilter"),
    search: document.getElementById("searchTask")
};
const statsElements = {
    total: document.getElementById("statTotal"),
    soon: document.getElementById("statSoon"),
    done: document.getElementById("statDone")
};
const upcoming = {
    wrapper: document.getElementById("upcomingReminder"),
    title: document.getElementById("upcomingTitle"),
    countdown: document.getElementById("upcomingCountdown")
};

const classroomSection = document.getElementById("classroom");
const classroomSyncButton = document.getElementById("classroomSync");
const classroomResyncButton = document.getElementById("classroomResync");
const classroomStatus = document.getElementById("classroomStatus");
const classroomContent = document.getElementById("classroomContent");
const classroomCoursesList = document.getElementById("classroomCourses");
const classroomAccount = document.getElementById("classroomAccount");
const classroomLastSync = document.getElementById("classroomLastSync");

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const loginUsernameInput = document.getElementById("loginUsername");
const loginPasswordInput = document.getElementById("loginPassword");
const registerPasswordInput = document.getElementById("registerPassword");
const registerPasswordConfirmInput = document.getElementById("registerPasswordConfirm");
const workspace = document.getElementById("workspace");
const logoutButton = document.getElementById("logoutButton");
const loginToggle = document.getElementById("loginToggle");
const registerToggle = document.getElementById("registerToggle");
const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const scheduleBuilder = document.getElementById("scheduleBuilder");
const roleRotatorElement = document.querySelector("[data-role-rotator]");
const roleRotatorCursor = document.querySelector("[data-rotator-cursor]");

// Configuración base del nuevo horario interactivo (días visibles y horas sugeridas).
const SCHEDULE_DAYS = [
    { key: "lunes", label: "Lunes" },
    { key: "martes", label: "Martes" },
    { key: "miercoles", label: "Miércoles" },
    { key: "jueves", label: "Jueves" },
    { key: "viernes", label: "Viernes" },
    { key: "sabado", label: "Sábado" }
];

const DEFAULT_SCHEDULE_HOURS = Array.from({ length: 15 }, (_value, index) => {
    const hour = 7 + index;
    return `${hour.toString().padStart(2, "0")}:00`;
});

const quickStart = document.getElementById("quickStart");
const clearProfileBtn = document.getElementById("clearProfile");
const clearAgendaBtn = document.getElementById("clearAgenda");
const exportDataBtn = document.getElementById("exportData");
const planCheckoutButton = document.getElementById("planCheckout");
const paymentsSection = document.getElementById("payments");
const toastContainer = document.getElementById("toastContainer");
const animatedSections = document.querySelectorAll("[data-animate]");
const metricValues = document.querySelectorAll(".metric__value");
const API_ORIGIN = getApiOrigin(API_BASE_URL);

let tasks = [];
let countdownIntervalId;
let animationsConfigured = false;
let metricsAnimated = false;
let isAuthenticated = false;
let authState = {
    token: null,
    user: null
};
let userSchedule = [];
let scheduleMonitorId = null;
let scheduleNotificationCache = new Set();
let lastScheduleDayKey = null;
let roleRotatorTimerId = null;
let classroomData = null;
let classroomPopup = null;
let classroomPopupMonitorId = null;

init();

function init() {
    initializeScheduleBuilder();
    setupRoleRotator();
    bindEvents();
    resetClassroomPanel();
    setupAnimations();
    restoreSession();
    refreshUI();
}

function bindEvents() {
    registerForm?.addEventListener("submit", handleRegisterSubmit);
    loginForm?.addEventListener("submit", handleLoginSubmit);
    logoutButton?.addEventListener("click", handleLogout);
    loginToggle?.addEventListener("click", () => toggleAuthPanel(loginPanel, loginToggle, registerPanel, registerToggle));
    registerToggle?.addEventListener("click", () => toggleAuthPanel(registerPanel, registerToggle, loginPanel, loginToggle));
    registerForm?.addEventListener("reset", () => {
        window.requestAnimationFrame(() => resetScheduleBuilder());
    });

    studentForm?.addEventListener("submit", handleProfileSubmit);
    clearProfileBtn?.addEventListener("click", handleProfileClear);

    taskForm?.addEventListener("submit", handleTaskSubmit);
    taskList?.addEventListener("click", handleTaskActions);
    filters.status?.addEventListener("change", refreshTaskList);
    filters.search?.addEventListener("input", debounce(refreshTaskList, 200));
    clearAgendaBtn?.addEventListener("click", handleAgendaClear);
    exportDataBtn?.addEventListener("click", handleExportData);
    planCheckoutButton?.addEventListener("click", focusPaymentsSection);

    classroomSyncButton?.addEventListener("click", initiateClassroomSync);
    classroomResyncButton?.addEventListener("click", initiateClassroomSync);
    window.addEventListener("message", handleClassroomMessage);

    quickStart?.addEventListener("click", () => {
        if (isAuthenticated) {
            workspace?.scrollIntoView({ behavior: "smooth" });
            return;
        }
        document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" });
    });
}

function focusPaymentsSection() {
    if (!paymentsSection) {
        return;
    }

    paymentsSection.scrollIntoView({ behavior: "smooth", block: "center" });
    paymentsSection.classList.add("is-highlighted");
    window.setTimeout(() => paymentsSection.classList.remove("is-highlighted"), 1600);
}

function setAuthenticated(state) {
    isAuthenticated = state;

    if (!workspace) {
        return;
    }

    workspace.hidden = !state;
    workspace.classList.toggle("is-active", state);
    document.body?.setAttribute("data-authenticated", state ? "true" : "false");

    if (logoutButton) {
        logoutButton.hidden = !state;
    }

    if (!state) {
        loginForm?.reset();
        resetClassroomPanel();
    }
}

async function restoreSession() {
    authState = { token: null, user: null };
    const storedToken = localStorage.getItem(AUTH_KEYS.token);
    if (!storedToken) {
        setAuthenticated(false);
        return;
    }

    authState.token = storedToken;

    const cachedUser = safelyParse(localStorage.getItem(AUTH_KEYS.user));

    try {
        const response = await apiFetch("/auth/me");
        const user = response.user || cachedUser;
        if (!user) {
            throw new Error("Sesión inválida");
        }
        applySession(storedToken, user, { silent: true });
    } catch (error) {
        console.warn("No se pudo restaurar la sesión", error);
        clearAuth({ silent: true });
    }
}

function applySession(token, user, { silent = false } = {}) {
    const scheduleDataFromUser = normalizeScheduleData(user?.schedule);
    const storedSchedule = scheduleDataFromUser ?? loadStoredSchedule(user?.id);
    const normalizedUser = {
        ...user,
        schedule: storedSchedule ?? []
    };

    authState = { token, user: normalizedUser };
    localStorage.setItem(AUTH_KEYS.token, token);
    localStorage.setItem(AUTH_KEYS.user, JSON.stringify(normalizedUser));
    setAuthenticated(true);
    loadProfile();
    loadTasks();
    updateScheduleState(normalizedUser.schedule);
    restoreClassroomData();
    refreshUI();
    closeAuthSection(loginPanel, loginToggle);
    closeAuthSection(registerPanel, registerToggle);

    if (!silent) {
        const firstName = user?.firstName || "estudiante";
        notify(`Bienvenido, ${firstName}.`);
    }
}

function clearAuth({ silent = false } = {}) {
    const scheduleStorageKey = getScheduleKey(authState.user?.id);
    stopScheduleMonitor();
    userSchedule = [];
    scheduleNotificationCache = new Set();
    lastScheduleDayKey = null;
    if (scheduleStorageKey) {
        localStorage.removeItem(scheduleStorageKey);
    }

    clearClassroomStorage();
    resetClassroomPanel();

    authState = { token: null, user: null };
    localStorage.removeItem(AUTH_KEYS.token);
    localStorage.removeItem(AUTH_KEYS.user);
    setAuthenticated(false);
    tasks = [];
    refreshUI();
    if (studentForm) {
        studentForm.reset();
    }
    if (profileSummary) {
        profileSummary.hidden = true;
    }
    summaryElements.name.textContent = "—";
    summaryElements.goal.textContent = "Define una meta para motivarte";
    summaryElements.next.textContent = "Configura tu primera actividad para ver recordatorios.";
    closeAuthSection(loginPanel, loginToggle);
    closeAuthSection(registerPanel, registerToggle);

    if (!silent) {
        notify("Sesión cerrada. Vuelve cuando quieras.");
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();

    if (!registerForm) {
        return;
    }

    const data = new FormData(registerForm);
    const getValue = key => (data.get(key) ?? "").toString().trim();

    const password = getValue("registerPassword");
    const passwordConfirm = getValue("registerPasswordConfirm");

    if (password.length < 6) {
        notify("La contraseña debe tener al menos 6 caracteres.", true);
        registerPasswordInput?.focus();
        return;
    }

    if (password !== passwordConfirm) {
        notify("Las contraseñas no coinciden.", true);
        registerPasswordConfirmInput?.focus();
        return;
    }

    const username = getValue("registerUsername");
    if (!username) {
        notify("El nombre de usuario es obligatorio.", true);
        return;
    }

    const scheduleGrid = serializeScheduleGrid();

    try {
        await apiFetch("/auth/register", {
            method: "POST",
            body: {
                firstName: getValue("registerFirstName"),
                lastName: getValue("registerLastName"),
                semester: getValue("registerSemester"),
                nationalId: getValue("registerId").toUpperCase(),
                scheduleGrid,
                phone: getValue("registerPhone"),
                email: getValue("registerEmail").toLowerCase(),
                username,
                password
            },
            skipAuth: true
        });

        registerForm.reset();
        notify("Cuenta creada con éxito. Ahora puedes iniciar sesión para usar UNEFA Stack.");
        loginUsernameInput?.focus();
    } catch (error) {
        notify(error.message || "No se pudo registrar la cuenta.", true);
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const username = (loginUsernameInput?.value ?? "").trim().toLowerCase();
    const password = loginPasswordInput?.value ?? "";

    if (!username || !password) {
        notify("Completa usuario y contraseña.", true);
        return;
    }

    try {
        const response = await apiFetch("/auth/login", {
            method: "POST",
            body: { username, password },
            skipAuth: true
        });

        loginPasswordInput.value = "";

        applySession(response.token, response.user);
    } catch (error) {
        notify(error.message || "Credenciales incorrectas.", true);
    }
}

function handleLogout() {
    clearAuth();
}

function setupAnimations() {
    if (animationsConfigured) {
        return;
    }

    if (!animatedSections.length) {
        return;
    }

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("is-visible");

                if (entry.target.classList.contains("hero__metrics")) {
                    animateMetrics();
                }

                observer.unobserve(entry.target);
            });
        }, { threshold: 0.2 });

        animatedSections.forEach(section => observer.observe(section));
    } else {
        animatedSections.forEach(section => section.classList.add("is-visible"));
        animateMetrics();
    }

    animationsConfigured = true;
}

function animateMetrics() {
    if (metricsAnimated) {
        return;
    }

    metricValues.forEach(counter => {
        const target = Number.parseInt(counter.dataset.count ?? "0", 10);
        if (Number.isNaN(target)) {
            return;
        }

        const suffix = counter.dataset.suffix ?? "";
        const duration = 1800;
        const start = performance.now();

        const update = now => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = easeOutCubic(progress);
            const value = Math.round(target * eased);
            const formatted = value.toLocaleString("es-VE");
            counter.textContent = suffix ? `${formatted}${suffix}` : formatted;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    });

    metricsAnimated = true;
}

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function loadProfile() {
    if (!isAuthenticated) {
        return;
    }

    try {
        const key = getProfileKey();
        if (!key) {
            return;
        }
        const savedProfile = localStorage.getItem(key);
        if (!savedProfile) {
            if (studentForm) {
                studentForm.reset();
            }
            if (profileSummary) {
                profileSummary.hidden = true;
            }
            summaryElements.name.textContent = "—";
            summaryElements.goal.textContent = "Define una meta para motivarte";
            summaryElements.next.textContent = "Configura tu primera actividad para ver recordatorios.";
            return;
        }
        const profile = JSON.parse(savedProfile);
        studentFields.name.value = profile.name ?? "";
        studentFields.id.value = profile.id ?? "";
        studentFields.phone.value = profile.phone ?? "";
        studentFields.email.value = profile.email ?? "";
        studentFields.goal.value = profile.goal ?? "";
        updateProfileSummary(profile);
    } catch (error) {
        console.error("No se pudo cargar el perfil", error);
    }
}

function handleProfileSubmit(event) {
    event.preventDefault();

    if (!isAuthenticated) {
        notify("Inicia sesión antes de guardar tu perfil.", true);
        return;
    }

    const profile = {
        name: studentFields.name.value.trim(),
        id: studentFields.id.value.trim().toUpperCase(),
        phone: studentFields.phone.value.trim(),
        email: studentFields.email.value.trim().toLowerCase(),
        goal: studentFields.goal.value.trim()
    };

    const key = getProfileKey();
    if (!key) {
        notify("No se pudo guardar el perfil para este usuario.", true);
        return;
    }

    localStorage.setItem(key, JSON.stringify(profile));
    updateProfileSummary(profile);
    notify("Perfil guardado. Tus recordatorios ahora serán personalizados.");
}

function handleProfileClear() {
    if (!isAuthenticated) {
        notify("Debes iniciar sesión para administrar el perfil.", true);
        return;
    }

    const confirmed = confirm("¿Deseas eliminar el perfil y los recordatorios asociados?");
    if (!confirmed) {
        return;
    }

    const key = getProfileKey();
    if (key) {
        localStorage.removeItem(key);
    }
    studentForm.reset();
    profileSummary.hidden = true;
    summaryElements.next.textContent = "Configura tu primera actividad para ver recordatorios.";
    notify("Perfil eliminado. Puedes registrar un nuevo estudiante cuando quieras.");
}

function updateProfileSummary(profile) {
    summaryElements.name.textContent = profile.name || "—";
    summaryElements.goal.textContent = profile.goal || "Define una meta para motivarte";
    profileSummary.hidden = false;
}

function loadTasks() {
    try {
        const key = getTasksKey();
        if (!key) {
            tasks = [];
            return;
        }
        const savedTasks = localStorage.getItem(key);
        if (!savedTasks) {
            tasks = [];
            return;
        }
        tasks = JSON.parse(savedTasks);
    } catch (error) {
        console.error("No se pudo cargar la agenda", error);
        tasks = [];
    }
}

async function handleTaskSubmit(event) {
    event.preventDefault();

    if (!isAuthenticated) {
        notify("Inicia sesión para registrar actividades.", true);
        return;
    }

    const profileKey = getProfileKey();
    if (!profileKey || !localStorage.getItem(profileKey)) {
        notify("Registra tu perfil primero para asociar las actividades.", true);
        return;
    }

    const formData = new FormData(taskForm);
    const now = Date.now();

    const newTask = {
        id: createId(),
        subject: String(formData.get("subject") ?? "").trim(),
        activity: String(formData.get("activity") ?? "").trim(),
        dueDate: buildDueDate(String(formData.get("dueDate") ?? ""), formData.get("dueTime")),
        priority: String(formData.get("priority") ?? "media"),
        notes: String(formData.get("notes") ?? "").trim(),
        status: "pendiente",
        createdAt: now,
        attachments: await collectAttachments(taskForm?.attachment?.files)
    };

    tasks = [...tasks, newTask];
    persistTasks();
    taskForm.reset();
    refreshUI();
    notify("Actividad guardada. Buen trabajo organizando tu agenda.");
}

function handleTaskActions(event) {
    if (!isAuthenticated) {
        notify("Inicia sesión para gestionar tus actividades.", true);
        return;
    }

    const taskElement = event.target.closest(".task");
    if (!taskElement) {
        return;
    }

    const taskId = taskElement.dataset.id;

    if (event.target.classList.contains("mark-complete")) {
        updateTaskStatus(taskId, "completada");
    }

    if (event.target.classList.contains("revert-status")) {
        updateTaskStatus(taskId, "pendiente");
    }

    if (event.target.classList.contains("delete-task")) {
        deleteTask(taskId);
    }
}

function updateTaskStatus(taskId, status) {
    if (!isAuthenticated) {
        return;
    }

    tasks = tasks.map(task => task.id === taskId ? { ...task, status } : task);
    persistTasks();
    refreshUI();
}

function deleteTask(taskId) {
    if (!isAuthenticated) {
        return;
    }

    const confirmed = confirm("¿Seguro que deseas eliminar esta actividad?");
    if (!confirmed) {
        return;
    }
    tasks = tasks.filter(task => task.id !== taskId);
    persistTasks();
    refreshUI();
}

function handleAgendaClear() {
    if (!isAuthenticated) {
        notify("Inicia sesión para administrar la agenda.", true);
        return;
    }

    const confirmed = confirm("Esto eliminará todas las actividades guardadas. ¿Deseas continuar?");
    if (!confirmed) {
        return;
    }
    tasks = [];
    persistTasks();
    refreshUI();
}

function persistTasks() {
    const key = getTasksKey();
    if (!key) {
        return;
    }
    localStorage.setItem(key, JSON.stringify(tasks));
}

function refreshUI() {
    refreshTaskList();
    updateStats();
    refreshUpcomingReminder();
    refreshClassroomPanel();
}

function refreshTaskList() {
    if (!taskList) {
        return;
    }

    if (!isAuthenticated) {
        taskList.replaceChildren();
        const lockedState = document.createElement("li");
        lockedState.className = "task task--empty";
        lockedState.textContent = "Inicia sesión para organizar tus actividades.";
        taskList.appendChild(lockedState);
        return;
    }

    const statusFilter = filters.status?.value || "todas";
    const searchTerm = (filters.search?.value ?? "").trim().toLowerCase();

    const filtered = tasks
        .filter(task => statusFilter === "todas" || task.status === statusFilter)
        .filter(task => {
            if (!searchTerm) {
                return true;
            }
            const haystack = `${task.subject} ${task.activity} ${task.notes}`.toLowerCase();
            return haystack.includes(searchTerm);
        })
        .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));

    taskList.replaceChildren();

    if (!filtered.length) {
        const emptyState = document.createElement("li");
        emptyState.className = "task task--empty";
        emptyState.textContent = "Sin actividades registradas. Agenda tu primera entrega.";
        taskList.appendChild(emptyState);
        return;
    }

    filtered.forEach(task => {
        const node = buildTaskNode(task);
        taskList.appendChild(node);
    });
}

function buildTaskNode(task) {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.dataset.status = task.status;
    node.dataset.priority = task.priority;

    node.querySelector(".task__title").textContent = `${task.subject} · ${task.activity}`;

    const meta = node.querySelector(".task__meta");
    meta.innerHTML = "";

    if (task.dueDate) {
        meta.append(createMetaChip("vence", formatDate(task.dueDate)));
        meta.append(createMetaChip("restan", formatRelativeTime(task.dueDate)));
    } else {
        meta.append(createMetaChip("vence", "Sin fecha"));
    }

    meta.append(createMetaChip("prioridad", task.priority));

    const notes = node.querySelector(".task__notes");
    notes.textContent = task.notes || "Sin notas adicionales.";

    const attachmentsList = node.querySelector(".task__attachments");
    attachmentsList.innerHTML = "";
    if (task.attachments?.length) {
        task.attachments.forEach(attachment => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = attachment.data;
            link.download = attachment.name;
            link.textContent = attachment.name;
            link.target = "_blank";
            item.appendChild(link);
            attachmentsList.appendChild(item);
        });
    }

    const completeButton = node.querySelector(".mark-complete");
    const revertButton = node.querySelector(".revert-status");

    if (task.status === "completada") {
        completeButton.hidden = true;
        revertButton.hidden = false;
    }

    return node;
}

function updateStats() {
    if (!isAuthenticated) {
        statsElements.total.textContent = 0;
        statsElements.soon.textContent = 0;
        statsElements.done.textContent = 0;
        return;
    }

    const total = tasks.length;
    const now = Date.now();
    const soonThreshold = now + 48 * 60 * 60 * 1000;

    const soon = tasks.filter(task => task.status === "pendiente" && task.dueDate && task.dueDate <= soonThreshold && task.dueDate >= now).length;
    const done = tasks.filter(task => task.status === "completada").length;

    statsElements.total.textContent = total;
    statsElements.soon.textContent = soon;
    statsElements.done.textContent = done;
}

function refreshUpcomingReminder() {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
    }

    if (!isAuthenticated) {
        upcoming.wrapper.hidden = true;
        summaryElements.next.textContent = "Inicia sesión para activar tus recordatorios.";
        return;
    }

    const now = Date.now();
    const nextTask = tasks
        .filter(task => task.status === "pendiente" && task.dueDate && task.dueDate >= now)
        .sort((a, b) => a.dueDate - b.dueDate)[0];

    if (!nextTask) {
        upcoming.wrapper.hidden = true;
        summaryElements.next.textContent = "Todo al día. Registra la próxima actividad para seguir avanzando.";
        return;
    }

    upcoming.wrapper.hidden = false;
    upcoming.title.textContent = `${nextTask.subject} · ${nextTask.activity}`;
    updateCountdown(nextTask.dueDate);

    countdownIntervalId = setInterval(() => updateCountdown(nextTask.dueDate), 60 * 1000);
    summaryElements.next.textContent = `${nextTask.subject} vence ${formatRelativeTime(nextTask.dueDate)}.`;
}

function updateCountdown(dueDate) {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) {
        upcoming.countdown.textContent = "¡ahora!";
        return;
    }

    const minutes = Math.floor(diff / 60000);
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const remainingMinutes = minutes % 60;

    const parts = [];
    if (days) {
        parts.push(`${days} ${pluralize(days, "día", "días")}`);
    }
    if (hours) {
        parts.push(`${hours} h`);
    }
    parts.push(`${remainingMinutes} min`);

    upcoming.countdown.textContent = parts.join(" · ");
}

function handleExportData() {
    if (!isAuthenticated) {
        notify("Inicia sesión para exportar tu agenda.", true);
        return;
    }

    const profileKey = getProfileKey();
    const profile = profileKey ? safelyParse(localStorage.getItem(profileKey)) : null;

    const payload = {
        exportedAt: new Date().toISOString(),
        user: authState.user,
        profile,
        tasks,
        schedule: userSchedule
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "unefa-agenda.json";
    link.click();
    URL.revokeObjectURL(url);
}

async function initiateClassroomSync() {
    if (!isAuthenticated) {
        notify("Inicia sesión para conectar Google Classroom.", true);
        return;
    }

    if (!classroomSyncButton) {
        return;
    }

    toggleClassroomButtons(true);
    updateClassroomStatus("Abriendo la autorización de Google Classroom...");

    try {
        const { url } = await apiFetch("/classroom/auth-url");
        if (!url) {
            throw new Error("No se pudo generar el enlace de autorización.");
        }

        classroomPopup = window.open(url, "classroomAuth", "width=520,height=720");

        if (!classroomPopup) {
            throw new Error("Permite las ventanas emergentes en el navegador para continuar.");
        }

        classroomPopupMonitorId = window.setInterval(() => {
            if (!classroomPopup || classroomPopup.closed) {
                clearClassroomPopupMonitor();
                toggleClassroomButtons(false);
            }
        }, 900);

        updateClassroomStatus("Completa la autorización en la ventana emergente.");
    } catch (error) {
        clearClassroomPopupMonitor();
        toggleClassroomButtons(false);
        const message = error?.message || "No se pudo iniciar la autorización con Classroom.";
        updateClassroomStatus(message);
        notify(message, true);
    }
}

function handleClassroomMessage(event) {
    if (API_ORIGIN && event.origin && API_ORIGIN !== event.origin) {
        return;
    }

    const message = event.data;
    if (!message || message.type !== "classroom-sync") {
        return;
    }

    if (classroomPopup && !classroomPopup.closed) {
        classroomPopup.close();
    }
    clearClassroomPopupMonitor();
    toggleClassroomButtons(false);

    if (message.error) {
        updateClassroomStatus(message.error);
        notify(message.error, true);
        return;
    }

    classroomData = message.payload ?? null;
    persistClassroomData();
    refreshClassroomPanel();

    if (classroomData?.courses?.length) {
        updateClassroomStatus(`Sincronizamos ${classroomData.courses.length} cursos activos.`);
        notify("Cursos importados correctamente desde Google Classroom.");
    } else {
        updateClassroomStatus("No se encontraron cursos activos en tu Classroom.");
        notify("Conexión completada sin cursos activos.");
    }
}

function refreshClassroomPanel() {
    if (!classroomSection) {
        return;
    }

    if (!isAuthenticated) {
        resetClassroomPanel();
        return;
    }

    if (!classroomContent || !classroomCoursesList) {
        return;
    }

    if (!classroomData) {
        classroomContent.hidden = true;
        classroomAccount.textContent = "—";
        classroomLastSync.textContent = "—";
        classroomCoursesList.replaceChildren();
        if (classroomResyncButton) {
            classroomResyncButton.hidden = true;
        }
        return;
    }

    classroomContent.hidden = false;
    classroomAccount.textContent = classroomData.accountEmail || "Sin correo";
    if (classroomResyncButton) {
        classroomResyncButton.hidden = false;
    }

    const fetchedAt = classroomData.fetchedAt ? Date.parse(classroomData.fetchedAt) : NaN;
    classroomLastSync.textContent = Number.isNaN(fetchedAt)
        ? "—"
        : new Intl.DateTimeFormat("es-VE", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(fetchedAt);

    classroomCoursesList.replaceChildren();

    const courses = classroomData.courses ?? [];
    if (!courses.length) {
        const empty = document.createElement("li");
        empty.className = "classroom__empty";
        empty.textContent = "No hay cursos activos disponibles.";
        classroomCoursesList.appendChild(empty);
        return;
    }

    courses.forEach(course => {
        const item = document.createElement("li");
        item.className = "classroom__course";

        const header = document.createElement("div");
        header.className = "classroom__course-header";

        const details = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "classroom__course-title";
        title.textContent = course.name || "Curso sin título";
        details.appendChild(title);

        const metaPieces = [];
        if (course.section) {
            metaPieces.push(`Sección ${course.section}`);
        }
        if (course.room) {
            metaPieces.push(`Aula ${course.room}`);
        }
        if (course.teacherGroupEmail) {
            metaPieces.push(course.teacherGroupEmail);
        }
        if (course.warning) {
            metaPieces.push(course.warning);
        }

        if (metaPieces.length) {
            const meta = document.createElement("p");
            meta.className = "classroom__course-meta";
            meta.textContent = metaPieces.join(" · ");
            details.appendChild(meta);
        }

        header.appendChild(details);

        if (course.alternateLink) {
            const link = document.createElement("a");
            link.className = "classroom__course-link";
            link.href = course.alternateLink;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Abrir en Classroom";
            header.appendChild(link);
        }

        item.appendChild(header);

        const worksList = document.createElement("ul");
        worksList.className = "classroom__works";

        const works = course.works ?? [];
        if (!works.length) {
            const emptyWork = document.createElement("li");
            emptyWork.className = "classroom__work";
            emptyWork.textContent = "Sin actividades recientes.";
            worksList.appendChild(emptyWork);
        } else {
            works.forEach(work => {
                const workItem = document.createElement("li");
                workItem.className = "classroom__work";

                const titleSpan = document.createElement("span");
                titleSpan.className = "classroom__work-title";
                titleSpan.textContent = work.title || "Actividad";
                workItem.appendChild(titleSpan);

                const metaSpan = document.createElement("span");
                metaSpan.className = "classroom__work-meta";

                const metaParts = [];
                if (work.dueAt) {
                    const dueTimestamp = Date.parse(work.dueAt);
                    if (!Number.isNaN(dueTimestamp)) {
                        metaParts.push(`vence ${formatRelativeTime(dueTimestamp)}`);
                        metaParts.push(formatDate(dueTimestamp));
                    }
                }
                if (Number.isFinite(work.maxPoints)) {
                    metaParts.push(`${work.maxPoints} pts`);
                }
                metaParts.push(work.state === "PUBLISHED" ? "Publicada" : work.state?.toLowerCase() ?? "Sin estado");

                metaSpan.textContent = metaParts.join(" · ");
                workItem.appendChild(metaSpan);

                worksList.appendChild(workItem);
            });
        }

        item.appendChild(worksList);
        classroomCoursesList.appendChild(item);
    });
}

function updateClassroomStatus(message) {
    if (classroomStatus) {
        classroomStatus.textContent = message;
    }
}

function toggleClassroomButtons(disabled) {
    const flag = Boolean(disabled);
    if (classroomSyncButton) {
        classroomSyncButton.disabled = flag;
    }
    if (classroomResyncButton) {
        classroomResyncButton.disabled = flag;
        classroomResyncButton.hidden = flag && !classroomData;
    }
}

function clearClassroomPopupMonitor() {
    if (classroomPopupMonitorId) {
        window.clearInterval(classroomPopupMonitorId);
        classroomPopupMonitorId = null;
    }
}

function resetClassroomPanel() {
    classroomData = null;
    if (classroomContent) {
        classroomContent.hidden = true;
    }
    if (classroomCoursesList) {
        classroomCoursesList.replaceChildren();
    }
    if (classroomAccount) {
        classroomAccount.textContent = "—";
    }
    if (classroomLastSync) {
        classroomLastSync.textContent = "—";
    }
    if (classroomStatus) {
        classroomStatus.textContent = "Autoriza tu cuenta UNEFA en Google para sincronizar.";
    }
    if (classroomResyncButton) {
        classroomResyncButton.hidden = true;
    }
    toggleClassroomButtons(false);
}

function persistClassroomData() {
    if (!isAuthenticated) {
        return;
    }

    const key = getClassroomKey();
    if (!key) {
        return;
    }

    if (classroomData) {
        localStorage.setItem(key, JSON.stringify(classroomData));
    }
}

function restoreClassroomData() {
    classroomData = null;
    const key = getClassroomKey();
    if (!key) {
        return;
    }

    const stored = safelyParse(localStorage.getItem(key));
    if (stored) {
        classroomData = stored;
    }
}

function clearClassroomStorage() {
    const key = getClassroomKey();
    if (key) {
        localStorage.removeItem(key);
    }
}

function buildDueDate(dateString, timeString) {
    if (!dateString) {
        return null;
    }
    const [year, month, day] = dateString.split("-").map(Number);
    const [hours, minutes] = timeString ? timeString.split(":").map(Number) : [23, 59];
    return new Date(year, month - 1, day, hours, minutes).getTime();
}

function createMetaChip(label, value) {
    const chip = document.createElement("span");
    chip.className = "meta-chip";
    chip.innerHTML = `<strong>${label}:</strong> ${value}`;
    return chip;
}

function formatDate(timestamp) {
    const options = { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat("es-VE", options).format(timestamp);
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = timestamp - now;

    const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

    const minutes = diff / 60000;
    const hours = minutes / 60;
    const days = hours / 24;

    if (Math.abs(days) >= 1) {
        return formatter.format(Math.round(days), "day");
    }
    if (Math.abs(hours) >= 1) {
        return formatter.format(Math.round(hours), "hour");
    }
    return formatter.format(Math.round(minutes), "minute");
}

function pluralize(value, singular, plural) {
    return value === 1 ? singular : plural;
}

function debounce(fn, delay = 200) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(null, args), delay);
    };
}

async function collectAttachments(fileList) {
    const attachments = [];
    const files = Array.from(fileList ?? []);
    for (const file of files) {
        const base64 = await readFileAsDataURL(file);
        attachments.push({
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64
        });
    }
    return attachments;
}

function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function notify(message, isWarning = false) {
    showToast(message, isWarning);

    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            new Notification("UNEFA Task Companion", {
                body: message,
                icon: "assets/escudounefa.gif",
                badge: "assets/escudounefa.gif"
            });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(result => {
                if (result === "granted") {
                    notify(message, isWarning);
                }
            }).catch(() => {
                /* No se requiere acción adicional si el usuario cancela. */
            });
        }
    }
}

function showToast(message, isWarning = false) {
    if (!toastContainer) {
        if (isWarning) {
            alert(message);
        } else {
            console.log(message);
        }
        return;
    }

    const toast = document.createElement("div");
    toast.className = `toast${isWarning ? " toast--warning" : ""}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("is-fading");
        setTimeout(() => toast.remove(), 250);
    }, 4200);
}

window.addEventListener("beforeunload", () => {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
    }
});

function toggleAuthPanel(panel, button, otherPanel, otherButton) {
    if (!panel || !button) {
        return;
    }

    const willOpen = panel.hasAttribute("hidden");
    if (willOpen) {
        openAuthSection(panel, button);
        if (otherPanel && otherButton) {
            closeAuthSection(otherPanel, otherButton);
        }
    } else {
        closeAuthSection(panel, button);
    }
}

function openAuthSection(panel, button) {
    if (!panel || !button) {
        return;
    }

    panel.removeAttribute("hidden");
    panel.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    if (button.dataset.closeLabel) {
        button.textContent = button.dataset.closeLabel;
    }
}

function closeAuthSection(panel, button) {
    if (!panel || !button) {
        return;
    }

    panel.setAttribute("hidden", "");
    panel.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    if (button.dataset.openLabel) {
        button.textContent = button.dataset.openLabel;
    }
}

function initializeScheduleBuilder() {
    if (!scheduleBuilder || scheduleBuilder.dataset.ready === "true") {
        return;
    }

    const scroller = document.createElement("div");
    scroller.className = "schedule-builder__scroller";

    const grid = document.createElement("div");
    grid.className = "schedule-builder__grid";

    const table = buildScheduleTable(DEFAULT_SCHEDULE_HOURS, 0);
    grid.appendChild(table);

    scroller.appendChild(grid);
    scheduleBuilder.appendChild(scroller);
    scheduleBuilder.dataset.ready = "true";
}

function buildScheduleTable(hours, startIndex) {
    const table = document.createElement("table");
    table.className = "schedule-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.className = "schedule-table__header";

    const hourHeader = document.createElement("th");
    hourHeader.scope = "col";
    hourHeader.className = "schedule-table__cell schedule-table__cell--head";
    hourHeader.textContent = "Hora";
    headerRow.appendChild(hourHeader);

    SCHEDULE_DAYS.forEach(day => {
        const th = document.createElement("th");
        th.scope = "col";
        th.className = "schedule-table__cell schedule-table__cell--head";
        th.textContent = day.label;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    hours.forEach((defaultHour, offset) => {
        const rowIndex = startIndex + offset;
        const row = document.createElement("tr");
        row.className = "schedule-table__row";

        const hourCell = document.createElement("td");
        hourCell.className = "schedule-table__cell schedule-table__cell--hour";
        const hourInput = document.createElement("input");
        hourInput.type = "time";
        hourInput.className = "schedule-input schedule-input--hour";
        hourInput.dataset.role = "hour";
        hourInput.dataset.row = String(rowIndex);
        hourInput.value = defaultHour;
        hourInput.defaultValue = defaultHour;
        hourInput.setAttribute("aria-label", `Hora de la fila ${rowIndex + 1}`);
        hourCell.appendChild(hourInput);
        row.appendChild(hourCell);

        SCHEDULE_DAYS.forEach(day => {
            const cell = document.createElement("td");
            cell.className = "schedule-table__cell";
            const subjectInput = document.createElement("input");
            subjectInput.type = "text";
            subjectInput.placeholder = "Materia";
            subjectInput.className = "schedule-input schedule-input--subject";
            subjectInput.dataset.day = day.key;
            subjectInput.dataset.row = String(rowIndex);
            subjectInput.maxLength = 60;
            subjectInput.setAttribute("aria-label", `${day.label} fila ${rowIndex + 1}`);
            cell.appendChild(subjectInput);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    return table;
}

function setupRoleRotator() {
    if (!roleRotatorElement) {
        return;
    }

    const parsedRoles = safelyParse(roleRotatorElement.dataset.roles);
    const roles = Array.isArray(parsedRoles)
        ? parsedRoles.filter(role => typeof role === "string" && role.trim().length)
        : (roleRotatorElement.dataset.roles || "")
            .split("|")
            .map(role => role.trim())
            .filter(Boolean);

    if (!roles.length) {
        return;
    }

    const uniqueRoles = [...new Set(roles)];
    let currentIndex = 0;
    let displayedText = "";
    let deleting = false;

    const typingSpeed = 90;
    const deletingSpeed = 55;
    const holdDelay = 1600;
    const transitionDelay = 600;

    const updateCursorState = state => {
        if (!roleRotatorCursor) {
            return;
        }
        roleRotatorCursor.classList.toggle("is-deleting", state === "delete");
    };

    const tick = () => {
        const currentRole = uniqueRoles[currentIndex] ?? "";

        if (!deleting && displayedText.length < currentRole.length) {
            displayedText = currentRole.slice(0, displayedText.length + 1);
            roleRotatorElement.textContent = displayedText;
            roleRotatorTimerId = window.setTimeout(tick, typingSpeed);
            return;
        }

        if (!deleting && displayedText.length === currentRole.length) {
            updateCursorState("hold");
            roleRotatorTimerId = window.setTimeout(() => {
                deleting = true;
                updateCursorState("delete");
                tick();
            }, holdDelay);
            return;
        }

        if (deleting && displayedText.length > 0) {
            displayedText = currentRole.slice(0, displayedText.length - 1);
            roleRotatorElement.textContent = displayedText;
            roleRotatorTimerId = window.setTimeout(tick, deletingSpeed);
            return;
        }

        if (deleting && displayedText.length === 0) {
            deleting = false;
            currentIndex = (currentIndex + 1) % uniqueRoles.length;
            updateCursorState("type");
            roleRotatorTimerId = window.setTimeout(tick, transitionDelay);
        }
    };

    if (roleRotatorTimerId) {
        window.clearTimeout(roleRotatorTimerId);
    }

    roleRotatorElement.textContent = "";
    updateCursorState("type");
    roleRotatorTimerId = window.setTimeout(tick, 600);
}

function resetScheduleBuilder() {
    initializeScheduleBuilder();
    if (!scheduleBuilder) {
        return;
    }

    const rows = scheduleBuilder.querySelectorAll("tbody tr");
    rows.forEach((row, index) => {
        const defaultHour = DEFAULT_SCHEDULE_HOURS[index] ?? "";
        const hourInput = row.querySelector("input[data-role=\"hour\"]");
        if (hourInput) {
            hourInput.value = defaultHour;
        }

        SCHEDULE_DAYS.forEach(day => {
            const subjectInput = row.querySelector(`input[data-day="${day.key}"]`);
            if (subjectInput) {
                subjectInput.value = "";
            }
        });
    });
}

function serializeScheduleGrid() {
    initializeScheduleBuilder();
    if (!scheduleBuilder) {
        return [];
    }

    const rows = Array.from(scheduleBuilder.querySelectorAll("tbody tr"));
    return rows.map((row, index) => {
        const hourInput = row.querySelector("input[data-role=\"hour\"]");
        const hour = normalizeHourValue(hourInput?.value ?? DEFAULT_SCHEDULE_HOURS[index] ?? "");
        const entries = {};

        SCHEDULE_DAYS.forEach(day => {
            const subjectInput = row.querySelector(`input[data-day="${day.key}"]`);
            entries[day.key] = (subjectInput?.value ?? "").trim();
        });

        return { hour, entries };
    });
}

function normalizeScheduleData(rawValue) {
    if (!rawValue) {
        return null;
    }

    let data = rawValue;

    if (typeof rawValue === "string") {
        try {
            data = JSON.parse(rawValue);
        } catch (error) {
            return null;
        }
    }

    if (!Array.isArray(data)) {
        return null;
    }

    const sanitized = data
        .map(normalizeScheduleRow)
        .filter(Boolean);

    return sanitized;
}

function normalizeScheduleRow(row, index) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const hour = normalizeHourValue(row.hour ?? row.time ?? DEFAULT_SCHEDULE_HOURS[index] ?? "");
    const entries = {};

    SCHEDULE_DAYS.forEach(day => {
        const value = (row.entries?.[day.key] ?? row[day.key] ?? "").toString().trim();
        entries[day.key] = value;
    });

    return { hour, entries };
}

function normalizeHourValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const stringValue = value.toString().trim();
    if (!stringValue) {
        return "";
    }

    const match = stringValue.match(/^(\d{1,2})(?::(\d{1,2}))?/);
    if (!match) {
        return "";
    }

    let hours = Number.parseInt(match[1] ?? "0", 10);
    let minutes = Number.parseInt(match[2] ?? "0", 10);

    if (!Number.isFinite(hours) || hours < 0) {
        hours = 0;
    }
    if (hours > 23) {
        hours = 23;
    }

    if (!Number.isFinite(minutes) || minutes < 0) {
        minutes = 0;
    }
    if (minutes > 59) {
        minutes = 59;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function loadStoredSchedule(userId) {
    if (!userId) {
        return null;
    }

    const key = getScheduleKey(userId);
    if (!key) {
        return null;
    }

    try {
        const stored = localStorage.getItem(key);
        return normalizeScheduleData(stored);
    } catch (error) {
        return null;
    }
}

function persistSchedule(schedule) {
    const key = getScheduleKey();
    if (!key) {
        return;
    }

    try {
        localStorage.setItem(key, JSON.stringify(schedule ?? []));
    } catch (error) {
        console.warn("No se pudo guardar el horario localmente", error);
    }
}

function updateScheduleState(schedule) {
    const sanitized = normalizeScheduleData(schedule) ?? [];
    userSchedule = sanitized;

    if (authState.user?.id) {
        persistSchedule(userSchedule);
    }

    if (userSchedule.length) {
        startScheduleMonitor();
    } else {
        stopScheduleMonitor();
    }
}

function startScheduleMonitor() {
    stopScheduleMonitor();

    if (!userSchedule.length) {
        return;
    }

    checkScheduleNotifications();
    scheduleMonitorId = window.setInterval(() => {
        checkScheduleNotifications();
    }, 30 * 1000);
}

function stopScheduleMonitor() {
    if (scheduleMonitorId) {
        window.clearInterval(scheduleMonitorId);
        scheduleMonitorId = null;
    }
    scheduleNotificationCache = new Set();
    lastScheduleDayKey = null;
}

function checkScheduleNotifications() {
    // Revisa cada minuto el horario guardado para disparar recordatorios puntuales.
    if (!userSchedule.length) {
        return;
    }

    const now = new Date();
    const dayKey = getDayKeyFromDate(now);

    if (!dayKey) {
        scheduleNotificationCache = new Set();
        lastScheduleDayKey = null;
        return;
    }

    if (dayKey !== lastScheduleDayKey) {
        scheduleNotificationCache = new Set();
        lastScheduleDayKey = dayKey;
    }

    const currentHour = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    userSchedule.forEach((row, rowIndex) => {
        const hour = normalizeHourValue(row.hour);
        const subject = (row.entries?.[dayKey] ?? "").trim();

        if (!hour || !subject || hour !== currentHour) {
            return;
        }

        const notificationKey = `${now.toISOString().slice(0, 10)}-${hour}-${rowIndex}-${subject}`;

        if (scheduleNotificationCache.has(notificationKey)) {
            return;
        }

        scheduleNotificationCache.add(notificationKey);
        const dayLabel = getScheduleDayLabel(dayKey);
        const message = dayLabel ? `Hora de ${subject} (${dayLabel}).` : `Hora de ${subject}.`;
        notify(message);
    });
}

function getDayKeyFromDate(date) {
    const dayIndex = date.getDay();
    switch (dayIndex) {
        case 1:
            return "lunes";
        case 2:
            return "martes";
        case 3:
            return "miercoles";
        case 4:
            return "jueves";
        case 5:
            return "viernes";
        case 6:
            return "sabado";
        default:
            return null;
    }
}

function getScheduleDayLabel(dayKey) {
    const match = SCHEDULE_DAYS.find(day => day.key === dayKey);
    return match?.label ?? "";
}

async function apiFetch(endpoint, { method = "GET", body, headers = {}, skipAuth = false } = {}) {
    const config = { method, headers: { "Content-Type": "application/json", ...headers } };

    if (body !== undefined) {
        config.body = JSON.stringify(body);
    }

    if (!skipAuth && authState.token) {
        config.headers.Authorization = `Bearer ${authState.token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    } catch (networkError) {
        throw new Error("No se pudo conectar con el servidor. Intenta nuevamente.");
    }
    let payload = null;

    try {
        payload = await response.json();
    } catch (error) {
        /* El backend siempre responde JSON; si no, forzamos un error controlado. */
    }

    if (payload === null) {
        throw new Error("Respuesta inesperada del servidor.");
    }

    if (!response.ok || payload?.error) {
        const message = payload?.message || `Error ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

function getProfileKey(userId = authState.user?.id) {
    if (!userId) {
        return null;
    }
    return `${STORAGE_KEYS.profile}_${userId}`;
}

function getTasksKey(userId = authState.user?.id) {
    if (!userId) {
        return null;
    }
    return `${STORAGE_KEYS.tasks}_${userId}`;
}

function getScheduleKey(userId = authState.user?.id) {
    if (!userId) {
        return null;
    }
    return `${STORAGE_KEYS.schedule}_${userId}`;
}

function getClassroomKey(userId = authState.user?.id) {
    if (!userId) {
        return null;
    }
    return `${STORAGE_KEYS.classroom}_${userId}`;
}

function safelyParse(value) {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function getApiOrigin(baseUrl) {
    try {
        return new URL(baseUrl).origin;
    } catch (error) {
        return null;
    }
}

function getApiBaseUrl() {
    const metaContent = document.querySelector('meta[name="unefa-api-base"]')?.content;
    return (metaContent || "http://localhost:4000/api").replace(/\/$/, "");
}
