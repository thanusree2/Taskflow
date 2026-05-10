const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db } = require('../db/database');
const { authenticate, requireProjectAccess, requireProjectAdmin } = require('../middleware/auth');

// GET /api/projects/:projectId/tasks
router.get('/projects/:projectId/tasks', authenticate, requireProjectAccess, (req, res) => {
  const { status, priority, assigned_to } = req.query;
  let query = `
    SELECT t.*, u.name as assigned_name, u.email as assigned_email, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(assigned_to); }
  query += ' ORDER BY t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/projects/:projectId/tasks
router.post('/projects/:projectId/tasks', authenticate, requireProjectAccess, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('assigned_to').optional().isInt(),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('due_date').optional().isISO8601().withMessage('Invalid date format'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, assigned_to, priority = 'medium', due_date } = req.body;

  // Validate assignee is project member
  if (assigned_to) {
    const member = db.prepare(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(req.params.projectId, assigned_to);
    if (!member) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, project_id, assigned_to, created_by, priority, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', req.params.projectId, assigned_to || null, req.user.id, priority, due_date || null);

  const task = db.prepare(`
    SELECT t.*, u.name as assigned_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ message: 'Task created', task });
});

// GET /api/tasks/:id
router.get('/tasks/:id', authenticate, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as assigned_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Check access
  const member = db.prepare(
    'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(task.project_id, req.user.id);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({ task });
});

// PUT /api/tasks/:id
router.put('/tasks/:id', authenticate, [
  body('title').optional().trim().notEmpty(),
  body('status').optional().isIn(['todo', 'in_progress', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('due_date').optional().isISO8601(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Check access
  const member = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(task.project_id, req.user.id);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Members can only update status of their own tasks
  const isAdminLevel = req.user.role === 'admin' || (member && member.role === 'admin') || task.created_by === req.user.id;
  const { title, description, assigned_to, status, priority, due_date } = req.body;

  if (!isAdminLevel && (title || assigned_to || priority || due_date !== undefined)) {
    // Members can only update status
    if (!status) return res.status(403).json({ error: 'Members can only update task status' });
  }

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      assigned_to = CASE WHEN ? IS NOT NULL THEN ? ELSE assigned_to END,
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      due_date = COALESCE(?, due_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || null, description || null,
    assigned_to !== undefined ? 1 : null, assigned_to || null,
    status || null, priority || null, due_date || null,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT t.*, u.name as assigned_name, c.name as creator_name
    FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id WHERE t.id = ?
  `).get(req.params.id);

  res.json({ message: 'Task updated', task: updated });
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', authenticate, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(task.project_id, req.user.id);

  const canDelete = req.user.role === 'admin' ||
    task.created_by === req.user.id ||
    (member && member.role === 'admin');

  if (!canDelete) return res.status(403).json({ error: 'Cannot delete this task' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// GET /api/dashboard - aggregated stats for current user
router.get('/dashboard', authenticate, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  let projectIds;
  if (req.user.role === 'admin') {
    projectIds = db.prepare('SELECT id FROM projects').all().map(p => p.id);
  } else {
    projectIds = db.prepare(
      'SELECT project_id as id FROM project_members WHERE user_id = ?'
    ).all(req.user.id).map(p => p.id);
  }

  if (projectIds.length === 0) {
    return res.json({
      stats: { total_tasks: 0, todo: 0, in_progress: 0, done: 0, overdue: 0 },
      my_tasks: [],
      recent_tasks: [],
      projects_summary: []
    });
  }

  const placeholders = projectIds.map(() => '?').join(',');

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < ? AND status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks WHERE project_id IN (${placeholders})
  `).get(today, ...projectIds);

  const my_tasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assigned_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.assigned_to = ? AND t.project_id IN (${placeholders})
    AND t.status != 'done'
    ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    LIMIT 10
  `).all(req.user.id, ...projectIds);

  const recent_tasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assigned_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.project_id IN (${placeholders})
    ORDER BY t.updated_at DESC LIMIT 8
  `).all(...projectIds);

  const projects_summary = db.prepare(`
    SELECT p.id, p.name,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN t.due_date < ? AND t.status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id IN (${placeholders})
    GROUP BY p.id ORDER BY p.created_at DESC
  `).all(today, ...projectIds);

  res.json({ stats, my_tasks, recent_tasks, projects_summary });
});

module.exports = router;
