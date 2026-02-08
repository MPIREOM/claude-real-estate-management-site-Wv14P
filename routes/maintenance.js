const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List maintenance requests
router.get('/', (req, res) => {
  const db = getDb();
  const statusFilter = req.query.status || 'all';
  let query = `
    SELECT mr.*, u.unit_number, pr.name as property_name,
      t.first_name, t.last_name
    FROM maintenance_requests mr
    JOIN units u ON mr.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    LEFT JOIN tenants t ON mr.tenant_id = t.id
  `;
  const params = [];
  if (statusFilter !== 'all') {
    query += ' WHERE mr.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY CASE mr.priority WHEN \'urgent\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 ELSE 4 END, mr.created_at DESC';
  const requests = db.prepare(query).all(...params);
  res.render('maintenance/index', { title: 'Maintenance Requests', requests, statusFilter });
});

// New request form
router.get('/new', (req, res) => {
  const db = getDb();
  const units = db.prepare(`
    SELECT u.*, pr.name as property_name
    FROM units u JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `).all();
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY last_name, first_name').all();
  res.render('maintenance/form', {
    title: 'New Maintenance Request', request: null, units, tenants,
    preselectedUnitId: req.query.unit_id, preselectedTenantId: req.query.tenant_id
  });
});

// Create request
router.post('/', (req, res) => {
  const db = getDb();
  const { unit_id, tenant_id, title, description, priority } = req.body;
  db.prepare(
    'INSERT INTO maintenance_requests (unit_id, tenant_id, title, description, priority) VALUES (?, ?, ?, ?, ?)'
  ).run(unit_id, tenant_id || null, title, description || null, priority);
  req.session.success = 'Maintenance request created';
  res.redirect('/maintenance');
});

// Edit form
router.get('/:id/edit', (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM maintenance_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.redirect('/maintenance');
  const units = db.prepare(`
    SELECT u.*, pr.name as property_name
    FROM units u JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `).all();
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY last_name, first_name').all();
  res.render('maintenance/form', { title: 'Edit Request', request, units, tenants, preselectedUnitId: null, preselectedTenantId: null });
});

// Update request
router.post('/:id', (req, res) => {
  const db = getDb();
  const { unit_id, tenant_id, title, description, priority, status } = req.body;
  const completed_at = status === 'completed' ? new Date().toISOString() : null;
  db.prepare(
    'UPDATE maintenance_requests SET unit_id = ?, tenant_id = ?, title = ?, description = ?, priority = ?, status = ?, completed_at = ? WHERE id = ?'
  ).run(unit_id, tenant_id || null, title, description || null, priority, status, completed_at, req.params.id);
  req.session.success = 'Maintenance request updated';
  res.redirect('/maintenance');
});

// Delete request
router.post('/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM maintenance_requests WHERE id = ?').run(req.params.id);
  req.session.success = 'Maintenance request deleted';
  res.redirect('/maintenance');
});

module.exports = router;
