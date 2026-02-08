const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List leases
router.get('/', (req, res) => {
  const db = getDb();
  const statusFilter = req.query.status || 'all';
  let query = `
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
  `;
  const params = [];
  if (statusFilter !== 'all') {
    query += ' WHERE l.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY l.start_date DESC';
  const leases = db.prepare(query).all(...params);
  res.render('leases/index', { title: 'Leases', leases, statusFilter });
});

// New lease form
router.get('/new', (req, res) => {
  const db = getDb();
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY last_name, first_name').all();
  const units = db.prepare(`
    SELECT u.*, pr.name as property_name
    FROM units u
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `).all();
  res.render('leases/form', { title: 'New Lease', lease: null, tenants, units, preselectedUnitId: req.query.unit_id, preselectedTenantId: req.query.tenant_id });
});

// Create lease
router.post('/', (req, res) => {
  const db = getDb();
  const { unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes } = req.body;

  const result = db.prepare(
    'INSERT INTO leases (unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status || 'active', notes || null);

  // Mark unit as occupied if lease is active
  if (!status || status === 'active') {
    db.prepare("UPDATE units SET status = 'occupied' WHERE id = ?").run(unit_id);
  }

  req.session.success = 'Lease created successfully';
  res.redirect(`/leases/${result.lastInsertRowid}`);
});

// Show lease
router.get('/:id', (req, res) => {
  const db = getDb();
  const lease = db.prepare(`
    SELECT l.*, t.first_name, t.last_name, t.id as tenant_id,
      u.unit_number, u.id as unit_id, pr.name as property_name, pr.id as property_id
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!lease) return res.redirect('/leases');

  const payments = db.prepare('SELECT * FROM payments WHERE lease_id = ? ORDER BY due_date DESC').all(req.params.id);

  res.render('leases/show', { title: `Lease #${lease.id}`, lease, payments });
});

// Edit lease form
router.get('/:id/edit', (req, res) => {
  const db = getDb();
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (!lease) return res.redirect('/leases');
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY last_name, first_name').all();
  const units = db.prepare(`
    SELECT u.*, pr.name as property_name
    FROM units u JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `).all();
  res.render('leases/form', { title: 'Edit Lease', lease, tenants, units, preselectedUnitId: null, preselectedTenantId: null });
});

// Update lease
router.post('/:id', (req, res) => {
  const db = getDb();
  const { unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes } = req.body;
  const oldLease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);

  db.prepare(
    'UPDATE leases SET unit_id = ?, tenant_id = ?, start_date = ?, end_date = ?, rent_amount = ?, payment_frequency = ?, status = ?, notes = ? WHERE id = ?'
  ).run(unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes || null, req.params.id);

  // Update unit status
  if (status === 'active') {
    db.prepare("UPDATE units SET status = 'occupied' WHERE id = ?").run(unit_id);
  } else if (oldLease.status === 'active' && status !== 'active') {
    // Check if another active lease exists for this unit
    const otherActive = db.prepare("SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status = 'active' AND id != ?").get(unit_id, req.params.id).count;
    if (otherActive === 0) {
      db.prepare("UPDATE units SET status = 'vacant' WHERE id = ?").run(unit_id);
    }
  }

  req.session.success = 'Lease updated successfully';
  res.redirect(`/leases/${req.params.id}`);
});

// Delete lease
router.post('/:id/delete', (req, res) => {
  const db = getDb();
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (lease && lease.status === 'active') {
    const otherActive = db.prepare("SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status = 'active' AND id != ?").get(lease.unit_id, req.params.id).count;
    if (otherActive === 0) {
      db.prepare("UPDATE units SET status = 'vacant' WHERE id = ?").run(lease.unit_id);
    }
  }
  db.prepare('DELETE FROM leases WHERE id = ?').run(req.params.id);
  req.session.success = 'Lease deleted successfully';
  res.redirect('/leases');
});

module.exports = router;
