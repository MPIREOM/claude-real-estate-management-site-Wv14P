const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();

  const totalProperties = db.prepare('SELECT COUNT(*) as count FROM properties').get().count;
  const totalUnits = db.prepare('SELECT COUNT(*) as count FROM units').get().count;
  const occupiedUnits = db.prepare("SELECT COUNT(*) as count FROM units WHERE status = 'occupied'").get().count;
  const vacantUnits = db.prepare("SELECT COUNT(*) as count FROM units WHERE status = 'vacant'").get().count;
  const totalTenants = db.prepare('SELECT COUNT(*) as count FROM tenants').get().count;
  const activeLeases = db.prepare("SELECT COUNT(*) as count FROM leases WHERE status = 'active'").get().count;
  const openMaintenance = db.prepare("SELECT COUNT(*) as count FROM maintenance_requests WHERE status IN ('open', 'in_progress')").get().count;

  // Payment stats for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = now.getMonth() === 11 ? `${now.getFullYear() + 1}-01-01` : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

  const monthlyRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM payments
    WHERE paid_date >= ? AND paid_date < ?
  `).get(monthStart, nextMonth).total;

  const overduePayments = db.prepare(`
    SELECT COUNT(*) as count FROM payments
    WHERE status IN ('overdue', 'pending') AND due_date < date('now')
  `).get().count;

  const totalDueThisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount_due), 0) as total
    FROM payments
    WHERE due_date >= ? AND due_date < ?
  `).get(monthStart, nextMonth).total;

  // Recent payments
  const recentPayments = db.prepare(`
    SELECT p.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM payments p
    JOIN leases l ON p.lease_id = l.id
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY p.created_at DESC LIMIT 5
  `).all();

  // Recent maintenance requests
  const recentMaintenance = db.prepare(`
    SELECT mr.*, u.unit_number, pr.name as property_name
    FROM maintenance_requests mr
    JOIN units u ON mr.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    ORDER BY mr.created_at DESC LIMIT 5
  `).all();

  // Upcoming lease expirations (next 30 days)
  const expiringLeases = db.prepare(`
    SELECT l.*, t.first_name, t.last_name, u.unit_number, pr.name as property_name
    FROM leases l
    JOIN tenants t ON l.tenant_id = t.id
    JOIN units u ON l.unit_id = u.id
    JOIN properties pr ON u.property_id = pr.id
    WHERE l.status = 'active' AND l.end_date BETWEEN date('now') AND date('now', '+30 days')
    ORDER BY l.end_date ASC
  `).all();

  res.render('dashboard', {
    title: 'Dashboard',
    stats: {
      totalProperties, totalUnits, occupiedUnits, vacantUnits,
      totalTenants, activeLeases, openMaintenance,
      monthlyRevenue, overduePayments, totalDueThisMonth
    },
    recentPayments,
    recentMaintenance,
    expiringLeases
  });
});

module.exports = router;
