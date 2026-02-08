const express = require('express');
const router = express.Router();
const { queryAll, queryGet, queryRun } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List leases
router.get('/', (req, res) => {
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
  const leases = queryAll(query, params);
  res.render('leases/index', { title: 'Leases', leases, statusFilter });
});

// New lease form
router.get('/new', (req, res) => {
  const tenants = queryAll('SELECT * FROM tenants ORDER BY last_name, first_name');
  const units = queryAll(`
    SELECT u.*, pr.name as property_name
    FROM units u
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `);
  res.render('leases/form', { title: 'New Lease', lease: null, tenants, units, preselectedUnitId: req.query.unit_id, preselectedTenantId: req.query.tenant_id });
});

// Create lease
router.post('/', (req, res) => {
  const { unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes } = req.body;

  const result = queryRun(
    'INSERT INTO leases (unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status || 'active', notes || null]
  );

  // Mark unit as occupied if lease is active
  if (!status || status === 'active') {
    queryRun("UPDATE units SET status = 'occupied' WHERE id = ?", [unit_id]);
  }

  req.session.success = 'Lease created successfully';
  res.redirect(`/leases/${result.lastInsertRowid}`);
});

// Show lease
router.get('/:id', (req, res) => {
  const lease = queryGet(`
    SELECT l.*, t.first_name, t.last_name, t.id as tenant_id,
      u.unit_number, u.id as unit_id, pr.name as property_name, pr.id as property_id
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.id = ?
  `, [req.params.id]);
  if (!lease) return res.redirect('/leases');

  const payments = queryAll('SELECT * FROM payments WHERE lease_id = ? ORDER BY due_date DESC', [req.params.id]);

  res.render('leases/show', { title: `Lease #${lease.id}`, lease, payments });
});

// Edit lease form
router.get('/:id/edit', (req, res) => {
  const lease = queryGet('SELECT * FROM leases WHERE id = ?', [req.params.id]);
  if (!lease) return res.redirect('/leases');
  const tenants = queryAll('SELECT * FROM tenants ORDER BY last_name, first_name');
  const units = queryAll(`
    SELECT u.*, pr.name as property_name
    FROM units u JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `);
  res.render('leases/form', { title: 'Edit Lease', lease, tenants, units, preselectedUnitId: null, preselectedTenantId: null });
});

// Update lease
router.post('/:id', (req, res) => {
  const { unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes } = req.body;
  const oldLease = queryGet('SELECT * FROM leases WHERE id = ?', [req.params.id]);

  queryRun(
    'UPDATE leases SET unit_id = ?, tenant_id = ?, start_date = ?, end_date = ?, rent_amount = ?, payment_frequency = ?, status = ?, notes = ? WHERE id = ?',
    [unit_id, tenant_id, start_date, end_date, rent_amount, payment_frequency, status, notes || null, req.params.id]
  );

  // Update unit status
  if (status === 'active') {
    queryRun("UPDATE units SET status = 'occupied' WHERE id = ?", [unit_id]);
  } else if (oldLease.status === 'active' && status !== 'active') {
    const otherActive = queryGet("SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status = 'active' AND id != ?", [unit_id, req.params.id]).count;
    if (otherActive === 0) {
      queryRun("UPDATE units SET status = 'vacant' WHERE id = ?", [unit_id]);
    }
  }

  req.session.success = 'Lease updated successfully';
  res.redirect(`/leases/${req.params.id}`);
});

// Delete lease
router.post('/:id/delete', (req, res) => {
  const lease = queryGet('SELECT * FROM leases WHERE id = ?', [req.params.id]);
  if (lease && lease.status === 'active') {
    const otherActive = queryGet("SELECT COUNT(*) as count FROM leases WHERE unit_id = ? AND status = 'active' AND id != ?", [lease.unit_id, req.params.id]).count;
    if (otherActive === 0) {
      queryRun("UPDATE units SET status = 'vacant' WHERE id = ?", [lease.unit_id]);
    }
  }
  queryRun('DELETE FROM leases WHERE id = ?', [req.params.id]);
  req.session.success = 'Lease deleted successfully';
  res.redirect('/leases');
});

module.exports = router;
