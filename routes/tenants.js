const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List tenants
router.get('/', (req, res) => {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT t.*,
      l.id as active_lease_id, u.unit_number, pr.name as property_name
    FROM tenants t
    LEFT JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
    LEFT JOIN units u ON l.unit_id = u.id
    LEFT JOIN properties pr ON u.property_id = pr.id
    ORDER BY t.last_name, t.first_name
  `).all();
  res.render('tenants/index', { title: 'Tenants', tenants });
});

// New tenant form
router.get('/new', (req, res) => {
  res.render('tenants/form', { title: 'Add Tenant', tenant: null });
});

// Create tenant
router.post('/', (req, res) => {
  const db = getDb();
  const { first_name, last_name, email, phone, emergency_contact, emergency_phone, notes } = req.body;
  const result = db.prepare(
    'INSERT INTO tenants (first_name, last_name, email, phone, emergency_contact, emergency_phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(first_name, last_name, email || null, phone || null, emergency_contact || null, emergency_phone || null, notes || null);
  req.session.success = 'Tenant added successfully';
  res.redirect(`/tenants/${result.lastInsertRowid}`);
});

// Show tenant details
router.get('/:id', (req, res) => {
  const db = getDb();
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.redirect('/tenants');

  const leases = db.prepare(`
    SELECT l.*, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.tenant_id = ?
    ORDER BY l.start_date DESC
  `).all(req.params.id);

  const payments = db.prepare(`
    SELECT p.*, u.unit_number, pr.name as property_name
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.tenant_id = ?
    ORDER BY p.due_date DESC
    LIMIT 20
  `).all(req.params.id);

  const maintenanceRequests = db.prepare(`
    SELECT mr.*, u.unit_number, pr.name as property_name
    FROM maintenance_requests mr
    JOIN units u ON mr.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE mr.tenant_id = ?
    ORDER BY mr.created_at DESC
  `).all(req.params.id);

  res.render('tenants/show', { title: `${tenant.first_name} ${tenant.last_name}`, tenant, leases, payments, maintenanceRequests });
});

// Edit form
router.get('/:id/edit', (req, res) => {
  const db = getDb();
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.redirect('/tenants');
  res.render('tenants/form', { title: 'Edit Tenant', tenant });
});

// Update tenant
router.post('/:id', (req, res) => {
  const db = getDb();
  const { first_name, last_name, email, phone, emergency_contact, emergency_phone, notes } = req.body;
  db.prepare(
    'UPDATE tenants SET first_name = ?, last_name = ?, email = ?, phone = ?, emergency_contact = ?, emergency_phone = ?, notes = ? WHERE id = ?'
  ).run(first_name, last_name, email || null, phone || null, emergency_contact || null, emergency_phone || null, notes || null, req.params.id);
  req.session.success = 'Tenant updated successfully';
  res.redirect(`/tenants/${req.params.id}`);
});

// Delete tenant
router.post('/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
  req.session.success = 'Tenant deleted successfully';
  res.redirect('/tenants');
});

module.exports = router;
