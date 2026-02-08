const express = require('express');
const router = express.Router();
const { queryAll, queryGet, queryRun } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List payments
router.get('/', (req, res) => {
  const statusFilter = req.query.status || 'all';

  // Auto-mark overdue payments
  queryRun(`
    UPDATE payments SET status = 'overdue'
    WHERE status = 'pending' AND due_date < date('now')
  `);

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
  const payments = queryAll(query, params);

  res.render('payments/index', { title: 'Payments', payments, statusFilter });
});

// New payment form
router.get('/new', (req, res) => {
  const leases = queryAll(`
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.status = 'active'
    ORDER BY pr.name, u.unit_number
  `);
  res.render('payments/form', { title: 'Record Payment', payment: null, leases, preselectedLeaseId: req.query.lease_id });
});

// Create payment
router.post('/', (req, res) => {
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

  queryRun(
    'INSERT INTO payments (lease_id, amount_due, amount_paid, due_date, paid_date, payment_method, late_fee, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [lease_id, amount_due, amount_paid || 0, due_date, paid_date || null, payment_method || null, late_fee || 0, paymentStatus, notes || null]
  );

  req.session.success = 'Payment recorded successfully';
  res.redirect('/payments');
});

// Edit payment form
router.get('/:id/edit', (req, res) => {
  const payment = queryGet('SELECT * FROM payments WHERE id = ?', [req.params.id]);
  if (!payment) return res.redirect('/payments');
  const leases = queryAll(`
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY pr.name, u.unit_number
  `);
  res.render('payments/form', { title: 'Edit Payment', payment, leases, preselectedLeaseId: null });
});

// Update payment
router.post('/:id', (req, res) => {
  const { lease_id, amount_due, amount_paid, due_date, paid_date, payment_method, late_fee, status, notes } = req.body;
  queryRun(
    'UPDATE payments SET lease_id = ?, amount_due = ?, amount_paid = ?, due_date = ?, paid_date = ?, payment_method = ?, late_fee = ?, status = ?, notes = ? WHERE id = ?',
    [lease_id, amount_due, amount_paid || 0, due_date, paid_date || null, payment_method || null, late_fee || 0, status, notes || null, req.params.id]
  );
  req.session.success = 'Payment updated successfully';
  res.redirect('/payments');
});

// Delete payment
router.post('/:id/delete', (req, res) => {
  queryRun('DELETE FROM payments WHERE id = ?', [req.params.id]);
  req.session.success = 'Payment deleted successfully';
  res.redirect('/payments');
});

module.exports = router;
