const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List payments
router.get('/', (req, res) => {
  const db = getDb();
  const statusFilter = req.query.status || 'all';
  let query = `
    SELECT p.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
  `;
  const params = [];
  if (statusFilter !== 'all') {
    query += ' WHERE p.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY p.due_date DESC';
  const payments = db.prepare(query).all(...params);

  // Auto-mark overdue payments
  db.prepare(`
    UPDATE payments SET status = 'overdue'
    WHERE status = 'pending' AND due_date < date('now')
  `).run();

  res.render('payments/index', { title: 'Payments', payments, statusFilter });
});

// New payment form
router.get('/new', (req, res) => {
  const db = getDb();
  const leases = db.prepare(`
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.status = 'active'
    ORDER BY pr.name, u.unit_number
  `).all();
  res.render('payments/form', { title: 'Record Payment', payment: null, leases, preselectedLeaseId: req.query.lease_id });
});

// Create payment
router.post('/', (req, res) => {
  const db = getDb();
  const { lease_id, amount_due, amount_paid, due_date, paid_date, payment_method, late_fee, status, notes } = req.body;

  let paymentStatus = status;
  if (!paymentStatus) {
    const paid = parseFloat(amount_paid) || 0;
    const due = parseFloat(amount_due) || 0;
    if (paid >= due) paymentStatus = 'paid';
    else if (paid > 0) paymentStatus = 'partial';
    else if (new Date(due_date) < new Date()) paymentStatus = 'overdue';
    else paymentStatus = 'pending';
  }

  const result = db.prepare(
    'INSERT INTO payments (lease_id, amount_due, amount_paid, due_date, paid_date, payment_method, late_fee, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(lease_id, amount_due, amount_paid || 0, due_date, paid_date || null, payment_method || null, late_fee || 0, paymentStatus, notes || null);

  req.session.success = 'Payment recorded successfully';
  res.redirect('/payments');
});

// Edit payment form
router.get('/:id/edit', (req, res) => {
  const db = getDb();
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.redirect('/payments');
  const leases = db.prepare(`
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `).all();
  res.render('payments/form', { title: 'Edit Payment', payment, leases, preselectedLeaseId: null });
});

// Update payment
router.post('/:id', (req, res) => {
  const db = getDb();
  const { lease_id, amount_due, amount_paid, due_date, paid_date, payment_method, late_fee, status, notes } = req.body;
  db.prepare(
    'UPDATE payments SET lease_id = ?, amount_due = ?, amount_paid = ?, due_date = ?, paid_date = ?, payment_method = ?, late_fee = ?, status = ?, notes = ? WHERE id = ?'
  ).run(lease_id, amount_due, amount_paid || 0, due_date, paid_date || null, payment_method || null, late_fee || 0, status, notes || null, req.params.id);
  req.session.success = 'Payment updated successfully';
  res.redirect('/payments');
});

// Delete payment
router.post('/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  req.session.success = 'Payment deleted successfully';
  res.redirect('/payments');
});

module.exports = router;
