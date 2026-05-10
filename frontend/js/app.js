// ── CONFIG ──
const API = window.location.origin + '/api';

// ── STATE ──
let token = localStorage.getItem('tf_token');
let currentUser = JSON.parse(localStorage.getItem('tf_user') || 'null');
let allUsers = [];
let currentProject = null;
let currentProjectDetail = null;

// ── API HELPER ──
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

// ── DOM HELPERS ──
const $ = id => document.getElementById(id);
const show = id => $(id).style.display = '';
const hide = id => $(id).style.display = 'none';

function showAlert(id, msg, type = 'error') {
  const el = $(id);
  el.textContent = msg;
  el.className = `alert alert-${type} visible`;
  setTimeout(() => el.classList.remove('visible'), 4000);
}

function openModal(id) {
  $(id).classList.add('open');
}

function closeModal(id) {
  $(id).classList.remove('open');
}

function avatarHue(name) {
  const hues = ['hue1','hue2','hue3','hue4','hue5'];
  return hues[(name.charCodeAt(0) + name.charCodeAt(name.length-1)) % hues.length];
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(due_date, status) {
  if (!due_date || status === 'done') return false;
  return new Date(due_date) < new Date();
}

function statusBadge(s) {
  const labels = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
  return `<span class="badge badge-${s}">${labels[s] || s}</span>`;
}

function priorityBadge(p) {
  return `<span class="badge badge-${p}">${p}</span>`;
}

// ── AUTH ──
function showApp() {
  $('auth-screen').style.display = 'none';
  $('app').classList.add('visible');
  $('user-display-name').textContent = currentUser.name;
  const badge = $('user-role-badge');
  badge.textContent = currentUser.role;
  badge.className = 'user-badge' + (currentUser.role === 'admin' ? '' : ' member');
  loadUsers();
  navigateTo('dashboard');
}

function showAuth() {
  $('auth-screen').style.display = 'flex';
  $('app').classList.remove('visible');
}

$('btn-login').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  try {
    const data = await api('POST', '/auth/login', { email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', JSON.stringify(currentUser));
    showApp();
  } catch(e) {
    showAlert('login-alert', e.message);
  }
});

$('btn-signup').addEventListener('click', async () => {
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-password').value;
  const role = $('signup-role').value;
  try {
    const data = await api('POST', '/auth/signup', { name, email, password, role });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', JSON.stringify(currentUser));
    showApp();
  } catch(e) {
    showAlert('signup-alert', e.message);
  }
});

$('btn-logout').addEventListener('click', () => {
  token = null; currentUser = null;
  localStorage.removeItem('tf_token');
  localStorage.removeItem('tf_user');
  showAuth();
});

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
    $(tab.dataset.form).style.display = 'block';
  });
});

// ── NAVIGATION ──
function navigateTo(page, data) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  if (page === 'project-detail') {
    $('page-project-detail').classList.add('active');
    loadProjectDetail(data);
  } else {
    $(`page-${page}`)?.classList.add('active');
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'projects') loadProjects();
    if (page === 'my-tasks') loadMyTasks();
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ── LOAD USERS ──
async function loadUsers() {
  try {
    const data = await api('GET', '/auth/users');
    allUsers = data.users;
  } catch(e) {}
}

// ── DASHBOARD ──
async function loadDashboard() {
  $('dash-stats').innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
  try {
    const data = await api('GET', '/dashboard');
    const s = data.stats;

    $('dash-stats').innerHTML = `
      <div class="stat-card total fade-in">
        <div class="stat-value">${s.total_tasks}</div>
        <div class="stat-label">Total Tasks</div>
      </div>
      <div class="stat-card todo fade-in">
        <div class="stat-value">${s.todo}</div>
        <div class="stat-label">To Do</div>
      </div>
      <div class="stat-card progress fade-in">
        <div class="stat-value">${s.in_progress}</div>
        <div class="stat-label">In Progress</div>
      </div>
      <div class="stat-card done fade-in">
        <div class="stat-value">${s.done}</div>
        <div class="stat-label">Done</div>
      </div>
      <div class="stat-card overdue fade-in">
        <div class="stat-value">${s.overdue}</div>
        <div class="stat-label">Overdue</div>
      </div>
    `;

    // My tasks
    const mt = $('dash-my-tasks');
    if (!data.my_tasks.length) {
      mt.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">All clear!</div><div class="empty-text">No tasks assigned to you.</div></div>';
    } else {
      mt.innerHTML = data.my_tasks.map(t => `
        <div class="task-item fade-in" onclick="openTaskModal(${t.id}, ${t.project_id})">
          <div class="task-item-info">
            <div class="task-title-text">${escHtml(t.title)}</div>
            <div class="task-meta">
              <span>${escHtml(t.project_name)}</span>
              ${statusBadge(t.status)}
              ${priorityBadge(t.priority)}
              ${t.due_date ? `<span style="color:${isOverdue(t.due_date, t.status)?'var(--accent2)':'var(--text2)'}">${isOverdue(t.due_date,t.status)?'⚠ ':''}${formatDate(t.due_date)}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');
    }

    // Projects summary
    const ps = $('dash-projects');
    if (!data.projects_summary.length) {
      ps.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No projects yet</div></div>';
    } else {
      ps.innerHTML = data.projects_summary.map(p => {
        const pct = p.total ? Math.round((p.done/p.total)*100) : 0;
        return `
          <div class="task-item fade-in" onclick="navigateTo('project-detail', ${p.id})">
            <div class="task-item-info">
              <div class="task-title-text">${escHtml(p.name)}</div>
              <div class="task-meta">
                <span>${p.total} tasks</span>
                <span style="color:var(--accent4)">${p.done} done</span>
                ${p.overdue ? `<span style="color:var(--accent2)">${p.overdue} overdue</span>` : ''}
                <span>${pct}%</span>
              </div>
              <div class="progress-bar" style="margin-top:8px">
                <div class="progress-fill" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch(e) {
    $('dash-stats').innerHTML = `<div style="color:var(--accent2)">${e.message}</div>`;
  }
}

// ── PROJECTS ──
async function loadProjects() {
  $('projects-grid').innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
  try {
    const data = await api('GET', '/projects');
    if (!data.projects.length) {
      $('projects-grid').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">📁</div>
          <div class="empty-title">No projects yet</div>
          <div class="empty-text">Create your first project to get started.</div>
        </div>`;
      return;
    }
    $('projects-grid').innerHTML = data.projects.map(p => `
      <div class="project-card fade-in" onclick="navigateTo('project-detail', ${p.id})">
        <div class="project-name">${escHtml(p.name)}</div>
        <div class="project-desc">${escHtml(p.description || 'No description')}</div>
        <div class="project-footer">
          <span class="project-stat">📋 ${p.task_count} tasks</span>
          <span class="project-stat">👥 ${p.member_count} members</span>
          <span class="project-stat" style="color:var(--text3)">${formatDate(p.created_at)}</span>
        </div>
      </div>
    `).join('');
  } catch(e) {
    $('projects-grid').innerHTML = `<div style="color:var(--accent2)">${e.message}</div>`;
  }
}

// ── CREATE PROJECT ──
$('btn-create-project').addEventListener('click', () => openModal('modal-project'));
$('close-modal-project').addEventListener('click', () => closeModal('modal-project'));

$('btn-save-project').addEventListener('click', async () => {
  const name = $('proj-name').value.trim();
  const description = $('proj-desc').value.trim();
  if (!name) return showAlert('project-alert', 'Project name is required');
  try {
    await api('POST', '/projects', { name, description });
    closeModal('modal-project');
    $('proj-name').value = ''; $('proj-desc').value = '';
    showAlert('project-alert', 'Project created!', 'success');
    loadProjects();
  } catch(e) {
    showAlert('project-alert', e.message);
  }
});

// ── PROJECT DETAIL ──
async function loadProjectDetail(projectId) {
  currentProject = projectId;
  $('project-detail-content').innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
  try {
    const data = await api('GET', `/projects/${projectId}`);
    currentProjectDetail = data;
    renderProjectDetail(data);
  } catch(e) {
    $('project-detail-content').innerHTML = `<div style="color:var(--accent2)">${e.message}</div>`;
  }
}

function renderProjectDetail(data) {
  const { project, members, tasks } = data;
  const isAdmin = currentUser.role === 'admin' ||
    members.some(m => m.id === currentUser.id && m.project_role === 'admin');

  $('project-detail-content').innerHTML = `
    <button class="back-btn" onclick="navigateTo('projects')">← Back to Projects</button>
    <div class="project-detail-header">
      <div class="project-detail-info">
        <div class="page-title">${escHtml(project.name)}</div>
        <div class="page-subtitle">${escHtml(project.description || '')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="openCreateTaskModal()">+ Add Task</button>` : ''}
        ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openAddMemberModal()">+ Member</button>` : ''}
        ${currentUser.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteProject(${project.id})">Delete</button>` : ''}
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab(this,'tab-tasks')">Tasks (${tasks.length})</button>
      <button class="tab-btn" onclick="switchTab(this,'tab-members')">Members (${members.length})</button>
    </div>

    <div id="tab-tasks">
      <div class="filters-bar">
        <select id="filter-status" onchange="filterTasks()">
          <option value="">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select id="filter-priority" onchange="filterTasks()">
          <option value="">All Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div id="tasks-list">
        ${renderTasksTable(tasks, members, isAdmin)}
      </div>
    </div>

    <div id="tab-members" style="display:none">
      <div id="members-list">
        ${renderMembersList(members, project, isAdmin)}
      </div>
    </div>
  `;
}

function renderTasksTable(tasks, members, isAdmin) {
  if (!tasks.length) return `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">No tasks yet</div>
      <div class="empty-text">Add your first task to get started.</div>
    </div>`;

  return `
    <div class="tasks-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assigned To</th>
            <th>Due Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="tasks-tbody">
          ${tasks.map(t => renderTaskRow(t, isAdmin)).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTaskRow(t, isAdmin) {
  const overdue = isOverdue(t.due_date, t.status);
  const canEdit = isAdmin || t.created_by === currentUser.id || t.assigned_to === currentUser.id;
  return `
    <tr class="${overdue ? 'overdue-row' : ''}" data-status="${t.status}" data-priority="${t.priority}">
      <td>
        <div style="font-weight:700">${escHtml(t.title)}</div>
        ${t.description ? `<div style="color:var(--text2);font-size:11px">${escHtml(t.description.slice(0,60))}${t.description.length>60?'...':''}</div>` : ''}
      </td>
      <td>${statusBadge(t.status)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${t.assigned_name ? `<div style="display:flex;align-items:center;gap:6px"><div class="avatar ${avatarHue(t.assigned_name)}" style="width:24px;height:24px;font-size:10px">${initials(t.assigned_name)}</div>${escHtml(t.assigned_name)}</div>` : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="color:${overdue ? 'var(--accent2)' : 'var(--text2)'}">
        ${overdue ? '⚠ ' : ''}${formatDate(t.due_date)}
      </td>
      <td>
        <div class="task-actions">
          ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="openEditTaskModal(${t.id})">Edit</button>` : ''}
          ${isAdmin || t.created_by === currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteTask(${t.id})">Del</button>` : ''}
        </div>
      </td>
    </tr>`;
}

function renderMembersList(members, project, isAdmin) {
  if (!members.length) return '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No members</div></div>';
  return members.map(m => `
    <div class="member-item fade-in">
      <div class="avatar ${avatarHue(m.name)}">${initials(m.name)}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(m.name)}</div>
        <div class="member-email">${escHtml(m.email)}</div>
      </div>
      <span class="badge badge-${m.project_role}">${m.project_role}</span>
      ${isAdmin && m.id !== project.owner_id ? `<button class="btn btn-danger btn-sm" onclick="removeMember(${m.id}, '${escHtml(m.name)}')">Remove</button>` : ''}
    </div>
  `).join('');
}

function switchTab(btn, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-tasks','tab-members'].forEach(id => $(id).style.display = id === tabId ? 'block' : 'none');
}

function filterTasks() {
  if (!currentProjectDetail) return;
  const status = $('filter-status').value;
  const priority = $('filter-priority').value;
  const rows = document.querySelectorAll('#tasks-tbody tr');
  rows.forEach(row => {
    const matchStatus = !status || row.dataset.status === status;
    const matchPriority = !priority || row.dataset.priority === priority;
    row.style.display = matchStatus && matchPriority ? '' : 'none';
  });
}

// ── MY TASKS ──
async function loadMyTasks() {
  $('my-tasks-content').innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
  try {
    const data = await api('GET', '/dashboard');
    // All tasks across projects assigned to me
    const tasks = [...data.my_tasks];
    if (!tasks.length) {
      $('my-tasks-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <div class="empty-title">No open tasks</div>
          <div class="empty-text">You have no tasks assigned to you.</div>
        </div>`;
      return;
    }
    $('my-tasks-content').innerHTML = `
      <div class="tasks-table-wrap">
        <table>
          <thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${tasks.map(t => `
              <tr class="${isOverdue(t.due_date, t.status) ? 'overdue-row' : ''}">
                <td><div style="font-weight:700">${escHtml(t.title)}</div></td>
                <td style="color:var(--text2)">${escHtml(t.project_name)}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td style="color:${isOverdue(t.due_date,t.status)?'var(--accent2)':'var(--text2)'}">${formatDate(t.due_date)}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="quickStatusUpdate(${t.id}, '${t.status}')">Update Status</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    $('my-tasks-content').innerHTML = `<div style="color:var(--accent2)">${e.message}</div>`;
  }
}

async function quickStatusUpdate(taskId, currentStatus) {
  const statuses = ['todo','in_progress','done'];
  const next = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];
  try {
    await api('PUT', `/tasks/${taskId}`, { status: next });
    loadMyTasks();
  } catch(e) { alert(e.message); }
}

// ── TASK MODALS ──
function openCreateTaskModal() {
  const members = currentProjectDetail?.members || [];
  $('task-modal-title').textContent = 'Create Task';
  $('task-id').value = '';
  $('task-title').value = '';
  $('task-description').value = '';
  $('task-status').value = 'todo';
  $('task-priority').value = 'medium';
  $('task-due-date').value = '';

  const assigneeSelect = $('task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
    members.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`).join('');

  openModal('modal-task');
}

async function openEditTaskModal(taskId) {
  try {
    const data = await api('GET', `/tasks/${taskId}`);
    const t = data.task;
    const members = currentProjectDetail?.members || [];

    $('task-modal-title').textContent = 'Edit Task';
    $('task-id').value = t.id;
    $('task-title').value = t.title;
    $('task-description').value = t.description || '';
    $('task-status').value = t.status;
    $('task-priority').value = t.priority;
    $('task-due-date').value = t.due_date ? t.due_date.split('T')[0] : '';

    const assigneeSelect = $('task-assignee');
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
      members.map(m => `<option value="${m.id}" ${m.id === t.assigned_to ? 'selected' : ''}>${escHtml(m.name)}</option>`).join('');

    openModal('modal-task');
  } catch(e) { alert(e.message); }
}

$('close-modal-task').addEventListener('click', () => closeModal('modal-task'));

$('btn-save-task').addEventListener('click', async () => {
  const id = $('task-id').value;
  const title = $('task-title').value.trim();
  const description = $('task-description').value.trim();
  const status = $('task-status').value;
  const priority = $('task-priority').value;
  const due_date = $('task-due-date').value;
  const assigned_to = $('task-assignee').value;

  if (!title) return showAlert('task-alert', 'Title is required');

  try {
    if (id) {
      await api('PUT', `/tasks/${id}`, { title, description, status, priority, due_date: due_date || null, assigned_to: assigned_to ? parseInt(assigned_to) : null });
    } else {
      await api('POST', `/projects/${currentProject}/tasks`, {
        title, description, status, priority,
        due_date: due_date || null,
        assigned_to: assigned_to ? parseInt(assigned_to) : null
      });
    }
    closeModal('modal-task');
    loadProjectDetail(currentProject);
  } catch(e) {
    showAlert('task-alert', e.message);
  }
});

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await api('DELETE', `/tasks/${taskId}`);
    loadProjectDetail(currentProject);
  } catch(e) { alert(e.message); }
}

// ── MEMBERS ──
function openAddMemberModal() {
  const existingIds = (currentProjectDetail?.members || []).map(m => m.id);
  const available = allUsers.filter(u => !existingIds.includes(u.id));
  $('member-user-select').innerHTML = '<option value="">Select user...</option>' +
    available.map(u => `<option value="${u.id}">${escHtml(u.name)} (${escHtml(u.email)})</option>`).join('');
  openModal('modal-member');
}

$('close-modal-member').addEventListener('click', () => closeModal('modal-member'));

$('btn-save-member').addEventListener('click', async () => {
  const user_id = $('member-user-select').value;
  const role = $('member-role').value;
  if (!user_id) return showAlert('member-alert', 'Please select a user');
  try {
    await api('POST', `/projects/${currentProject}/members`, { user_id: parseInt(user_id), role });
    closeModal('modal-member');
    loadProjectDetail(currentProject);
  } catch(e) {
    showAlert('member-alert', e.message);
  }
});

async function removeMember(userId, name) {
  if (!confirm(`Remove ${name} from project?`)) return;
  try {
    await api('DELETE', `/projects/${currentProject}/members/${userId}`);
    loadProjectDetail(currentProject);
  } catch(e) { alert(e.message); }
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its tasks?')) return;
  try {
    await api('DELETE', `/projects/${id}`);
    navigateTo('projects');
  } catch(e) { alert(e.message); }
}

// ── UTILS ──
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── INIT ──
window.addEventListener('load', () => {
  if (token && currentUser) {
    showApp();
  } else {
    showAuth();
  }
});

// Expose to global scope for onclick handlers
window.navigateTo = navigateTo;
window.openEditTaskModal = openEditTaskModal;
window.deleteTask = deleteTask;
window.openCreateTaskModal = openCreateTaskModal;
window.removeMember = removeMember;
window.deleteProject = deleteProject;
window.switchTab = switchTab;
window.filterTasks = filterTasks;
window.quickStatusUpdate = quickStatusUpdate;
window.openAddMemberModal = openAddMemberModal;
window.openTaskModal = (taskId, projectId) => {
  currentProject = projectId;
  openEditTaskModal(taskId);
};
