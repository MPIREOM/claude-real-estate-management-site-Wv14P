const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// List properties
router.get('/', (req, res) => {
  const db = getDb();
  const properties = db.prepare(`
    SELECT p.*,
      COUNT(DISTINCT u.id) as unit_count,
      SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END) as occupied_count
    FROM properties p
    LEFT JOIN units u ON u.property_id = p.id
    GROUP BY p.id
    ORDER BY p.name
  `).all();
  res.render('properties/index', { title: 'Properties', properties });
});

// New property form
router.get('/new', (req, res) => {
  res.render('properties/form', { title: 'Add Property', property: null });
});

// Create property
router.post('/', (req, res) => {
  const db = getDb();
  const { name, address, type, notes } = req.body;
  const result = db.prepare('INSERT INTO properties (name, address, type, notes) VALUES (?, ?, ?, ?)').run(name, address, type, notes || null);

  // For standalone properties, auto-create a single unit
  if (type === 'standalone') {
    db.prepare('INSERT INTO units (property_id, unit_number, rent_amount) VALUES (?, ?, ?)').run(result.lastInsertRowid, 'Main', 0);
  }

  req.session.success = 'Property created successfully';
  res.redirect(`/properties/${result.lastInsertRowid}`);
});

// Show property details
router.get('/:id', (req, res) => {
  const db = getDb();
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.redirect('/properties');

  const units = db.prepare(`
    SELECT u.*,
      l.id as lease_id, l.status as lease_status,
      t.first_name, t.last_name
    FROM units u
    LEFT JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
    LEFT JOIN tenants t ON l.tenant_id = t.id
    WHERE u.property_id = ?
    ORDER BY u.unit_number
  `).all(req.params.id);

  res.render('properties/show', { title: property.name, property, units });
});

// Edit property form
router.get('/:id/edit', (req, res) => {
  const db = getDb();
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.redirect('/properties');
  res.render('properties/form', { title: 'Edit Property', property });
});

// Update property
router.post('/:id', (req, res) => {
  const db = getDb();
  const { name, address, type, notes } = req.body;
  db.prepare('UPDATE properties SET name = ?, address = ?, type = ?, notes = ? WHERE id = ?').run(name, address, type, notes || null, req.params.id);
  req.session.success = 'Property updated successfully';
  res.redirect(`/properties/${req.params.id}`);
});

// Delete property
router.post('/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
  req.session.success = 'Property deleted successfully';
  res.redirect('/properties');
});

// Add unit to property
router.post('/:id/units', (req, res) => {
  const db = getDb();
  const { unit_number, bedrooms, bathrooms, square_feet, rent_amount } = req.body;
  db.prepare('INSERT INTO units (property_id, unit_number, bedrooms, bathrooms, square_feet, rent_amount) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, unit_number, bedrooms || 0, bathrooms || 0, square_feet || null, rent_amount || 0
  );
  req.session.success = 'Unit added successfully';
  res.redirect(`/properties/${req.params.id}`);
});

// Edit unit
router.post('/:id/units/:unitId', (req, res) => {
  const db = getDb();
  const { unit_number, bedrooms, bathrooms, square_feet, rent_amount, status } = req.body;
  db.prepare('UPDATE units SET unit_number = ?, bedrooms = ?, bathrooms = ?, square_feet = ?, rent_amount = ?, status = ? WHERE id = ? AND property_id = ?').run(
    unit_number, bedrooms || 0, bathrooms || 0, square_feet || null, rent_amount || 0, status, req.params.unitId, req.params.id
  );
  req.session.success = 'Unit updated successfully';
  res.redirect(`/properties/${req.params.id}`);
});

// Delete unit
router.post('/:id/units/:unitId/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM units WHERE id = ? AND property_id = ?').run(req.params.unitId, req.params.id);
  req.session.success = 'Unit deleted successfully';
  res.redirect(`/properties/${req.params.id}`);
});

module.exports = router;
