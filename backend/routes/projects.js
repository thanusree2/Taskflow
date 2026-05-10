const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db } = require('../db/database');
const { authenticate, requireProjectAccess, requireProjectAdmin } = require('../middleware/auth');

// GET /api/projects - list projects for current user
router.get('/', authenticate, (req, res) => {
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }
  res.json({ projects });
});

// POST /api/projects - create project
router.post('/', authenticate, [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('description').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description } = req.body;
  const result = db.prepare(
    'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)'
  ).run(name, description || '', req.user.id);

  // Auto-add creator as admin member
  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(result.lastInsertRowid, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Project created', project });
});

// GET /api/projects/:id - project details
router.get('/:id', authenticate, requireProjectAccess, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM projects p JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role as global_role, pm.role as project_role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).all(req.params.id);

  const tasks = db.prepare(`
    SELECT t.*, u.name as assigned_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    JOIN users c ON t.created_by = c.id
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
  `).all(req.params.id);

  res.json({ project, members, tasks });
});

// PUT /api/projects/:id - update project
router.put('/:id', authenticate, requireProjectAdmin, [
  body('name').optional().trim().notEmpty(),
  body('description').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);

  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
    name || project.name,
    description !== undefined ? description : project.description,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ message: 'Project updated', project: updated });
});

// DELETE /api/projects/:id
router.delete('/:id', authenticate, requireProjectAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:id/members - add member
router.post('/:id/members', authenticate, requireProjectAdmin, [
  body('user_id').isInt().withMessage('User ID required'),
  body('role').optional().isIn(['admin', 'member']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { user_id, role = 'member' } = req.body;
  const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare(
    'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.id, user_id);
  if (existing) return res.status(409).json({ error: 'User already a member' });

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(req.params.id, user_id, role);

  res.status(201).json({ message: `${user.name} added to project` });
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', authenticate, requireProjectAdmin, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (project.owner_id === parseInt(req.params.userId)) {
    return res.status(400).json({ error: 'Cannot remove project owner' });
  }
  db.prepare(
    'DELETE FROM project_members WHERE project_id = ? AND user_id = ?'
  ).run(req.params.id, req.params.userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
