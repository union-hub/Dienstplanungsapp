const express = require('express');
const { getDb } = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET alle Bewohner*innen
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT b.*, wb.name as wohnbereich_name
    FROM bewohner b
    LEFT JOIN wohnbereiche wb ON b.wohnbereich_id = wb.id
    WHERE b.aktiv = 1
    ORDER BY b.nachname, b.vorname
  `).all();
  res.json(rows);
});

// GET Restriktionen eines Bewohners
router.get('/:id/restriktionen', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT er.*, m.vorname || ' ' || m.nachname as ma_name, m.kuerzel
    FROM einsatzrestriktionen er
    JOIN mitarbeitende m ON er.mitarbeitende_id = m.id
    WHERE er.bewohner_id = ?
  `).all(req.params.id);
  res.json(rows);
});

// POST Bewohner anlegen
router.post('/', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const { vorname, nachname, kuerzel, wohnbereich_id, unterstuetzungsbedarf,
          benoetigt_eins_zu_eins, nachtaufsicht_erforderlich } = req.body;

  const result = db.prepare(`
    INSERT INTO bewohner (vorname, nachname, kuerzel, wohnbereich_id, unterstuetzungsbedarf,
                          benoetigt_eins_zu_eins, nachtaufsicht_erforderlich)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(vorname, nachname, kuerzel, wohnbereich_id, unterstuetzungsbedarf || '',
         benoetigt_eins_zu_eins ? 1 : 0, nachtaufsicht_erforderlich ? 1 : 0);

  res.status(201).json({ id: result.lastInsertRowid, ...req.body });
});

// PUT Bewohner aktualisieren
router.put('/:id', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const { vorname, nachname, kuerzel, wohnbereich_id, unterstuetzungsbedarf,
          benoetigt_eins_zu_eins, nachtaufsicht_erforderlich } = req.body;

  db.prepare(`
    UPDATE bewohner SET vorname=?, nachname=?, kuerzel=?, wohnbereich_id=?,
    unterstuetzungsbedarf=?, benoetigt_eins_zu_eins=?, nachtaufsicht_erforderlich=?
    WHERE id=?
  `).run(vorname, nachname, kuerzel, wohnbereich_id, unterstuetzungsbedarf,
         benoetigt_eins_zu_eins ? 1 : 0, nachtaufsicht_erforderlich ? 1 : 0, req.params.id);

  res.json({ success: true });
});

// POST Einsatzrestriktion hinzufügen
router.post('/:id/restriktionen', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const { mitarbeitende_id, typ, grund } = req.body;
  const result = db.prepare(`
    INSERT INTO einsatzrestriktionen (bewohner_id, mitarbeitende_id, typ, grund)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, mitarbeitende_id, typ, grund || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE Einsatzrestriktion
router.delete('/:id/restriktionen/:rid', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM einsatzrestriktionen WHERE id = ?').run(req.params.rid);
  res.json({ success: true });
});

// DELETE Bewohner (soft delete)
router.delete('/:id', authenticate, requireRole('leitung'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE bewohner SET aktiv = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
