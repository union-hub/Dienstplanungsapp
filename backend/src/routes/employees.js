const express = require('express');
const { getDb } = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET alle Mitarbeitenden
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.*, GROUP_CONCAT(q.id) as qual_ids, GROUP_CONCAT(q.name) as qual_namen,
           GROUP_CONCAT(q.kuerzel) as qual_kuerzel, GROUP_CONCAT(q.ist_fachkraft) as qual_fachkraft,
           wb.name as wohnbereich_name
    FROM mitarbeitende m
    LEFT JOIN mitarbeitende_qualifikationen mq ON m.id = mq.mitarbeitende_id
    LEFT JOIN qualifikationen q ON mq.qualifikation_id = q.id
    LEFT JOIN wohnbereiche wb ON m.wohnbereich_id = wb.id
    WHERE m.aktiv = 1
    GROUP BY m.id
    ORDER BY m.nachname, m.vorname
  `).all();

  const result = rows.map(r => ({
    ...r,
    qualifikationen: r.qual_ids
      ? r.qual_ids.split(',').map((id, i) => ({
          id: parseInt(id),
          name: r.qual_namen.split(',')[i],
          kuerzel: r.qual_kuerzel.split(',')[i],
          ist_fachkraft: r.qual_fachkraft.split(',')[i] === '1'
        }))
      : []
  }));
  res.json(result);
});

// GET einzelner Mitarbeitender
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const ma = db.prepare('SELECT * FROM mitarbeitende WHERE id = ?').get(req.params.id);
  if (!ma) return res.status(404).json({ error: 'Nicht gefunden' });

  // Eigene Daten oder Leitung/Teamleitung
  if (req.user.role === 'mitarbeitende' && req.user.mitarbeitende_id !== ma.id) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  const quals = db.prepare(`
    SELECT q.* FROM qualifikationen q
    JOIN mitarbeitende_qualifikationen mq ON q.id = mq.qualifikation_id
    WHERE mq.mitarbeitende_id = ?
  `).all(ma.id);

  res.json({ ...ma, qualifikationen: quals });
});

// POST neuer Mitarbeitender (Leitung / Teamleitung)
router.post('/', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const { vorname, nachname, kuerzel, wohnbereich_id, vertragsarbeitszeit_pro_woche,
          darf_allein_nacht, user_id, qualifikation_ids } = req.body;

  const result = db.prepare(`
    INSERT INTO mitarbeitende (vorname, nachname, kuerzel, wohnbereich_id, vertragsarbeitszeit_pro_woche, darf_allein_nacht, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(vorname, nachname, kuerzel, wohnbereich_id, vertragsarbeitszeit_pro_woche || 39.0, darf_allein_nacht ? 1 : 0, user_id || null);

  const id = result.lastInsertRowid;

  if (qualifikation_ids?.length) {
    const insertQual = db.prepare('INSERT OR IGNORE INTO mitarbeitende_qualifikationen VALUES (?, ?)');
    for (const qid of qualifikation_ids) insertQual.run(id, qid);
  }

  logAudit(db, 'mitarbeitende', id, 'erstellt', req.user.id, null, req.body);
  res.status(201).json({ id, ...req.body });
});

// PUT Mitarbeitenden aktualisieren
router.put('/:id', authenticate, requireRole('leitung', 'teamleitung'), (req, res) => {
  const db = getDb();
  const alt = db.prepare('SELECT * FROM mitarbeitende WHERE id = ?').get(req.params.id);
  const { vorname, nachname, kuerzel, wohnbereich_id, vertragsarbeitszeit_pro_woche,
          darf_allein_nacht, qualifikation_ids } = req.body;

  db.prepare(`
    UPDATE mitarbeitende SET vorname=?, nachname=?, kuerzel=?, wohnbereich_id=?,
    vertragsarbeitszeit_pro_woche=?, darf_allein_nacht=? WHERE id=?
  `).run(vorname, nachname, kuerzel, wohnbereich_id, vertragsarbeitszeit_pro_woche,
         darf_allein_nacht ? 1 : 0, req.params.id);

  // Qualifikationen aktualisieren
  if (qualifikation_ids !== undefined) {
    db.prepare('DELETE FROM mitarbeitende_qualifikationen WHERE mitarbeitende_id = ?').run(req.params.id);
    const insertQual = db.prepare('INSERT OR IGNORE INTO mitarbeitende_qualifikationen VALUES (?, ?)');
    for (const qid of qualifikation_ids) insertQual.run(req.params.id, qid);
  }

  logAudit(db, 'mitarbeitende', req.params.id, 'geaendert', req.user.id, alt, req.body);
  res.json({ success: true });
});

// DELETE (soft delete) Mitarbeitenden
router.delete('/:id', authenticate, requireRole('leitung'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE mitarbeitende SET aktiv = 0 WHERE id = ?').run(req.params.id);
  logAudit(db, 'mitarbeitende', req.params.id, 'geloescht', req.user.id, null, null);
  res.json({ success: true });
});

// GET Überstundenübersicht
router.get('/:id/ueberstunden', authenticate, (req, res) => {
  const db = getDb();
  const ma = db.prepare('SELECT * FROM mitarbeitende WHERE id = ?').get(req.params.id);
  if (!ma) return res.status(404).json({ error: 'Nicht gefunden' });

  const dienste = db.prepare(`
    SELECT d.*, dp.jahr, dp.monat
    FROM dienste d JOIN dienstplaene dp ON d.dienstplan_id = dp.id
    WHERE d.mitarbeitende_id = ? AND d.ist_krank = 0 AND d.ist_urlaub = 0
    ORDER BY d.datum
  `).all(req.params.id);

  let gesamtIstStunden = 0;
  for (const d of dienste.filter(d => d.art === 'praesenz' || d.art === 'nachtwache')) {
    const h = (new Date(`${d.datum}T${d.ende}`) - new Date(`${d.datum}T${d.beginn}`)) / 3600000;
    gesamtIstStunden += h;
  }

  res.json({
    mitarbeitende: ma,
    ist_stunden: gesamtIstStunden,
    ueberstunden_stand: ma.ueberstunden_stand,
    dienste_anzahl: dienste.length
  });
});

function logAudit(db, tabelle, id, aktion, userId, vorher, nachher) {
  db.prepare(`
    INSERT INTO audit_log (tabelle, datensatz_id, aktion, benutzer_id, vorher, nachher)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tabelle, id, aktion, userId, vorher ? JSON.stringify(vorher) : null, nachher ? JSON.stringify(nachher) : null);
}

module.exports = router;
