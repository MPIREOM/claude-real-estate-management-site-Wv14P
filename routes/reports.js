const express = require('express');
const router = express.Router();
const { queryAll, queryGet, queryRun } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { stringify } = require('csv-stringify/sync');

router.use(requireAuth);

// Reports page
router.get('/', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  // Monthly revenue for the year
  const monthlyRevenue = queryAll(`
    SELECT
      CAST(strftime('%m', paid_date) AS INTEGER) as month,
      SUM(amount_paid) as revenue,
      COUNT(*) as payment_count
    FROM payments
    WHERE strftime('%Y', paid_date) = ? AND amount_paid > 0
    GROUP BY strftime('%m', paid_date)
    ORDER BY month
  `, [String(year)]);

  // Fill in missing months
  const revenueByMonth = [];
  for (let m = 1; m <= 12; m++) {
    const found = monthlyRevenue.find(r => r.month === m);
    revenueByMonth.push({
      month: m,
      revenue: found ? found.revenue : 0,
      payment_count: found ? found.payment_count : 0
    });
  }

  // Property performance
  const propertyPerformance = queryAll(`
    SELECT pr.name, pr.id,
      COUNT(DISTINCT u.id) as total_units,
      SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) as occupied_units,
      COALESCE(SUM(pay.amount_paid), 0) as total_collected
    FROM properties pr
    LEFT JOIN units u ON u.property_id = pr.id
    LEFT JOIN leases l ON l.unit_id = u.id
    LEFT JOIN payments pay ON pay.lease_id = l.id AND strftime('%Y', pay.paid_date) = ?
    GROUP BY pr.id
    ORDER BY pr.name
  `, [String(year)]);

  // Overdue summary
  const overdueSummary = queryAll(`
    SELECT t.first_name, t.last_name, pr.name as property_name, u.unit_number,
      p.amount_due, p.amount_paid, p.due_date, p.late_fee,
      (p.amount_due + p.late_fee - p.amount_paid) as balance_owed
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE p.status IN ('overdue', 'partial')
    ORDER BY p.due_date ASC
  `);

  // Total stats
  const totalCollected = queryGet(`
    SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE strftime('%Y', paid_date) = ?
  `, [String(year)]).total;

  const totalOutstanding = queryGet(`
    SELECT COALESCE(SUM(amount_due + late_fee - amount_paid), 0) as total FROM payments WHERE status IN ('overdue', 'partial', 'pending')
  `).total;

  // Available years
  const years = queryAll(`
    SELECT DISTINCT strftime('%Y', due_date) as year FROM payments
    UNION SELECT DISTINCT strftime('%Y', paid_date) as year FROM payments WHERE paid_date IS NOT NULL
    ORDER BY year DESC
  `).map(r => parseInt(r.year)).filter(y => !isNaN(y));
  if (!years.includes(year)) years.unshift(year);

  res.render('reports', {
    title: 'Reports',
    year,
    years,
    revenueByMonth,
    propertyPerformance,
    overdueSummary,
    totalCollected,
    totalOutstanding
  });
});

// Export payments CSV
router.get('/export/payments', (req, res) => {
  const payments = queryAll(`
    SELECT
      pr.name as property,
      u.unit_number as unit,
      t.first_name || ' ' || t.last_name as tenant,
      p.amount_due,
      p.amount_paid,
      p.late_fee,
      p.due_date,
      p.paid_date,
      p.payment_method,
      p.status,
      p.notes
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY p.due_date DESC
  `);

  const csv = stringify(payments, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=payments_export.csv');
  res.send(csv);
});

// Export tenants CSV
router.get('/export/tenants', (req, res) => {
  const tenants = queryAll(`
    SELECT
      t.first_name, t.last_name, t.email, t.phone,
      t.emergency_contact, t.emergency_phone,
      pr.name as property, u.unit_number as unit,
      l.rent_amount, l.start_date as lease_start, l.end_date as lease_end, l.status as lease_status
    FROM tenants t
    LEFT JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
    LEFT JOIN units u ON l.unit_id = u.id
    LEFT JOIN properties pr ON u.property_id = pr.id
    ORDER BY t.last_name, t.first_name
  `);

  const csv = stringify(tenants, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=tenants_export.csv');
  res.send(csv);
});

// Export overdue CSV
router.get('/export/overdue', (req, res) => {
  const overdue = queryAll(`
    SELECT
      t.first_name || ' ' || t.last_name as tenant,
      t.phone, t.email,
      pr.name as property, u.unit_number as unit,
      p.amount_due, p.amount_paid, p.late_fee,
      (p.amount_due + p.late_fee - p.amount_paid) as balance_owed,
      p.due_date, p.status
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE p.status IN ('overdue', 'partial')
    ORDER BY p.due_date ASC
  `);

  const csv = stringify(overdue, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=overdue_export.csv');
  res.send(csv);
});

module.exports = router;
