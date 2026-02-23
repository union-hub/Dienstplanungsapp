/**
 * REGEL-ENGINE
 * Zentrale serverseitige Validierung aller Dienstplan-Regeln.
 * Jede Prüfung gibt ein Array von Warnungen zurück.
 * Schweregrade: 'fehler' (ungültig), 'warnung' (kritisch), 'info' (Hinweis)
 */

const { getDb } = require('../database');

// Mindestruhezeit laut ArbZG: 11 Stunden
const MIN_RUHEZEIT_STUNDEN = 11;
// Tägliche Höchstarbeitszeit: 10 Stunden (ArbZG §3)
const MAX_TAGESARBEITSZEIT_STUNDEN = 10;
// Wöchentliche Höchstarbeitszeit: 48 Stunden (ArbZG §3)
const MAX_WOCHENARBEITSZEIT_STUNDEN = 48;

/**
 * Zeitdifferenz in Stunden zwischen zwei ISO-Datetime-Strings
 */
function stundenzwischen(vonStr, bisStr) {
  return (new Date(bisStr) - new Date(vonStr)) / 3600000;
}

/**
 * Gibt alle Dienste eines Tages für einen Dienstplan zurück (mit Mitarbeitenden-Info)
 */
function diensteFuerTag(db, dienstplanId, datum) {
  return db.prepare(`
    SELECT d.*, m.darf_allein_nacht, m.id as ma_id
    FROM dienste d
    JOIN mitarbeitende m ON d.mitarbeitende_id = m.id
    WHERE d.dienstplan_id = ? AND d.datum = ? AND d.ist_krank = 0 AND d.ist_urlaub = 0
  `).all(dienstplanId, datum);
}

/**
 * Hauptfunktion: Prüft einen kompletten Dienstplan und gibt alle Warnungen zurück.
 * Speichert Warnungen auch in der DB.
 */
function pruefeGesamtplan(dienstplanId) {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM dienstplaene WHERE id = ?').get(dienstplanId);
  if (!plan) return [];

  const wohnbereich = db.prepare('SELECT * FROM wohnbereiche WHERE id = ?').get(plan.wohnbereich_id);
  const alle_dienste = db.prepare(`
    SELECT d.*, m.vorname || ' ' || m.nachname as ma_name, m.darf_allein_nacht,
           m.vertragsarbeitszeit_pro_woche
    FROM dienste d
    JOIN mitarbeitende m ON d.mitarbeitende_id = m.id
    WHERE d.dienstplan_id = ? AND d.ist_krank = 0 AND d.ist_urlaub = 0
    ORDER BY d.datum, d.beginn
  `).all(dienstplanId);

  const warnungen = [];

  // --- 1. ARBEITSZEITRECHT ---
  const maGruppiert = gruppiereNachMitarbeitenden(alle_dienste);
  for (const [maId, dienste] of Object.entries(maGruppiert)) {
    // Tägliche Arbeitszeit
    const tagGruppiert = gruppiereNachDatum(dienste);
    for (const [datum, tagDienste] of Object.entries(tagGruppiert)) {
      const gesamtStunden = tagDienste
        .filter(d => d.art === 'praesenz' || d.art === 'nachtwache')
        .reduce((sum, d) => sum + stundenzwischen(`${datum}T${d.beginn}`, `${datum}T${d.ende}`), 0);
      if (gesamtStunden > MAX_TAGESARBEITSZEIT_STUNDEN) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'max_tagesarbeitszeit',
          schwere: 'fehler',
          meldung: `${tagDienste[0].ma_name}: Tägliche Höchstarbeitszeit überschritten (${gesamtStunden.toFixed(1)}h > ${MAX_TAGESARBEITSZEIT_STUNDEN}h, ArbZG §3)`,
          betroffen_mitarbeitende_id: parseInt(maId)
        });
      }
    }

    // Ruhezeiten zwischen Diensten
    for (let i = 0; i < dienste.length - 1; i++) {
      const aktEnde = `${dienste[i].datum}T${dienste[i].ende}`;
      const naechstBeginn = `${dienste[i + 1].datum}T${dienste[i + 1].beginn}`;
      const ruhe = stundenzwischen(aktEnde, naechstBeginn);
      if (ruhe < MIN_RUHEZEIT_STUNDEN && ruhe > 0) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum: dienste[i].datum,
          typ: 'ruhezeit_unterschritten',
          schwere: 'fehler',
          meldung: `${dienste[i].ma_name}: Ruhezeit zwischen Diensten unterschritten (${ruhe.toFixed(1)}h < ${MIN_RUHEZEIT_STUNDEN}h, ArbZG §5)`,
          betroffen_mitarbeitende_id: parseInt(maId)
        });
      }
    }

    // Wöchentliche Arbeitszeit
    const wochenGruppiert = gruppiereNachKalenderwoche(dienste);
    for (const [kw, kwDienste] of Object.entries(wochenGruppiert)) {
      const wochenStunden = kwDienste
        .filter(d => d.art === 'praesenz' || d.art === 'nachtwache')
        .reduce((sum, d) => sum + stundenzwischen(`${d.datum}T${d.beginn}`, `${d.datum}T${d.ende}`), 0);
      if (wochenStunden > MAX_WOCHENARBEITSZEIT_STUNDEN) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum: null,
          typ: 'max_wochenarbeitszeit',
          schwere: 'fehler',
          meldung: `${kwDienste[0].ma_name}: Wöchentliche Höchstarbeitszeit KW${kw} überschritten (${wochenStunden.toFixed(1)}h > ${MAX_WOCHENARBEITSZEIT_STUNDEN}h, ArbZG §3)`,
          betroffen_mitarbeitende_id: parseInt(maId)
        });
      }
    }
  }

  // --- 2. BESETZUNGSREGELN PRO TAG ---
  const tage = [...new Set(alle_dienste.map(d => d.datum))];
  for (const datum of tage) {
    const tagDienste = alle_dienste.filter(d => d.datum === datum);

    // Mindestbesetzung Tag
    const tagPraesenz = tagDienste.filter(d =>
      d.art === 'praesenz' && zeitfensterUeberschneidet(d.beginn, d.ende, '06:00', '22:00')
    );
    if (tagPraesenz.length < wohnbereich.min_besetzung_tag) {
      warnungen.push({
        dienstplan_id: dienstplanId,
        datum,
        typ: 'mindestbesetzung_tag',
        schwere: 'fehler',
        meldung: `${datum}: Mindestbesetzung Tagdienst unterschritten (${tagPraesenz.length}/${wohnbereich.min_besetzung_tag} MA)`,
        betroffen_mitarbeitende_id: null
      });
    }

    // Mindestbesetzung Nacht
    const nachtDienste = tagDienste.filter(d => d.art === 'nachtwache');
    if (nachtDienste.length < wohnbereich.min_besetzung_nacht) {
      warnungen.push({
        dienstplan_id: dienstplanId,
        datum,
        typ: 'mindestbesetzung_nacht',
        schwere: 'fehler',
        meldung: `${datum}: Mindestbesetzung Nachtdienst unterschritten (${nachtDienste.length}/${wohnbereich.min_besetzung_nacht} MA)`,
        betroffen_mitarbeitende_id: null
      });
    }

    // Allein-Nacht-Prüfung
    for (const d of nachtDienste) {
      if (!d.darf_allein_nacht && nachtDienste.length === 1) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'allein_nacht_verboten',
          schwere: 'fehler',
          meldung: `${datum}: ${d.ma_name} darf laut Qualifikation nicht allein Nachtdienst leisten`,
          betroffen_mitarbeitende_id: d.mitarbeitende_id
        });
      }
    }

    // Fachkraftquote
    const fachkraefte = db.prepare(`
      SELECT COUNT(DISTINCT d.mitarbeitende_id) as cnt
      FROM dienste d
      JOIN mitarbeitende_qualifikationen mq ON d.mitarbeitende_id = mq.mitarbeitende_id
      JOIN qualifikationen q ON mq.qualifikation_id = q.id
      WHERE d.dienstplan_id = ? AND d.datum = ? AND q.ist_fachkraft = 1
        AND d.ist_krank = 0 AND d.ist_urlaub = 0
    `).get(dienstplanId, datum);

    const gesamtMA = tagDienste.length;
    if (gesamtMA > 0) {
      const quote = fachkraefte.cnt / gesamtMA;
      if (quote < wohnbereich.min_fachkraft_quote) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'fachkraftquote',
          schwere: 'warnung',
          meldung: `${datum}: Fachkraftquote unterschritten (${(quote * 100).toFixed(0)}% < ${(wohnbereich.min_fachkraft_quote * 100).toFixed(0)}%)`,
          betroffen_mitarbeitende_id: null
        });
      }
    }
  }

  // --- 3. BEWOHNERBEZOGENE REGELN ---
  const bewohner = db.prepare('SELECT * FROM bewohner WHERE wohnbereich_id = ? AND aktiv = 1').all(plan.wohnbereich_id);
  const restriktionen = db.prepare(`
    SELECT er.*, b.vorname || ' ' || b.nachname as bew_name,
           m.vorname || ' ' || m.nachname as ma_name
    FROM einsatzrestriktionen er
    JOIN bewohner b ON er.bewohner_id = b.id
    JOIN mitarbeitende m ON er.mitarbeitende_id = m.id
    WHERE b.wohnbereich_id = ?
  `).all(plan.wohnbereich_id);

  for (const datum of tage) {
    const tagDienste = alle_dienste.filter(d => d.datum === datum);

    // Einsatzrestriktionen prüfen
    for (const r of restriktionen.filter(r => r.typ === 'verboten')) {
      if (tagDienste.some(d => d.mitarbeitende_id === r.mitarbeitende_id)) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'einsatzrestriktion_verboten',
          schwere: 'fehler',
          meldung: `${datum}: ${r.ma_name} darf laut Restriktion nicht mit ${r.bew_name} eingesetzt werden`,
          betroffen_mitarbeitende_id: r.mitarbeitende_id,
          betroffen_bewohner_id: r.bewohner_id
        });
      }
    }

    // 1:1-Begleitung prüfen
    for (const bew of bewohner.filter(b => b.benoetigt_eins_zu_eins)) {
      const pflichtMA = restriktionen.filter(r => r.typ === 'pflicht' && r.bewohner_id === bew.id);
      const hatPflichtMA = pflichtMA.some(r => tagDienste.some(d => d.mitarbeitende_id === r.mitarbeitende_id));
      if (!hatPflichtMA && pflichtMA.length > 0) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'pflichtbegleitung_fehlt',
          schwere: 'fehler',
          meldung: `${datum}: Pflichtbegleitung für ${bew.vorname} ${bew.nachname} (1:1) nicht gewährleistet`,
          betroffen_bewohner_id: bew.id
        });
      }
    }

    // Nachtaufsicht prüfen
    for (const bew of bewohner.filter(b => b.nachtaufsicht_erforderlich)) {
      const nachtDienste = alle_dienste.filter(d => d.datum === datum && d.art === 'nachtwache');
      if (nachtDienste.length === 0) {
        warnungen.push({
          dienstplan_id: dienstplanId,
          datum,
          typ: 'nachtaufsicht_fehlt',
          schwere: 'fehler',
          meldung: `${datum}: Nachtaufsicht für ${bew.vorname} ${bew.nachname} nicht gewährleistet`,
          betroffen_bewohner_id: bew.id
        });
      }
    }
  }

  // Warnungen in DB speichern (vorher alte löschen)
  const deleteStmt = db.prepare('DELETE FROM regelwarnungen WHERE dienstplan_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO regelwarnungen (dienstplan_id, datum, typ, schwere, meldung, betroffen_mitarbeitende_id, betroffen_bewohner_id)
    VALUES (@dienstplan_id, @datum, @typ, @schwere, @meldung, @betroffen_mitarbeitende_id, @betroffen_bewohner_id)
  `);
  const saveAll = db.transaction((warnungen) => {
    deleteStmt.run(dienstplanId);
    for (const w of warnungen) insertStmt.run(w);
  });
  saveAll(warnungen);

  return warnungen;
}

/**
 * Ersatzvorschläge bei Krankmeldung
 */
function ersatzvorschlaege(dienstId) {
  const db = getDb();
  const dienst = db.prepare('SELECT * FROM dienste WHERE id = ?').get(dienstId);
  if (!dienst) return [];

  const vorlage = dienst.dienstvorlage_id
    ? db.prepare('SELECT * FROM dienstvorlagen WHERE id = ?').get(dienst.dienstvorlage_id)
    : null;

  const minFachkraefte = vorlage ? vorlage.min_fachkraefte : 0;

  // Alle aktiven Mitarbeitenden im Wohnbereich
  const kandidaten = db.prepare(`
    SELECT m.*, u.email
    FROM mitarbeitende m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.aktiv = 1
    ORDER BY m.ueberstunden_stand ASC
  `).all();

  const vorschlaege = [];
  for (const ma of kandidaten) {
    // Bereits eingeplant?
    const bestehendings = db.prepare(`
      SELECT 1 FROM dienste WHERE mitarbeitende_id = ? AND datum = ? AND id != ?
    `).get(ma.id, dienst.datum, dienstId);
    if (bestehendings) continue;

    // Ruhezeit prüfen
    const vorDienst = db.prepare(`
      SELECT * FROM dienste
      WHERE mitarbeitende_id = ? AND datum <= ? AND id != ?
      ORDER BY datum DESC, ende DESC LIMIT 1
    `).get(ma.id, dienst.datum, dienstId);
    if (vorDienst) {
      const ruhe = stundenzwischen(`${vorDienst.datum}T${vorDienst.ende}`, `${dienst.datum}T${dienst.beginn}`);
      if (ruhe < MIN_RUHEZEIT_STUNDEN) {
        vorschlaege.push({ ...ma, grund_ausschluss: `Ruhezeit (${ruhe.toFixed(1)}h)`, geeignet: false });
        continue;
      }
    }

    // Einsatzrestriktionen
    const restriktion = db.prepare(`
      SELECT 1 FROM einsatzrestriktionen er
      JOIN bewohner b ON er.bewohner_id = b.id
      JOIN dienste dp ON dp.dienstplan_id = (SELECT dienstplan_id FROM dienste WHERE id = ?)
      WHERE er.mitarbeitende_id = ? AND er.typ = 'verboten'
        AND b.wohnbereich_id = (SELECT wb.id FROM dienstplaene dp2
          JOIN wohnbereiche wb ON dp2.wohnbereich_id = wb.id
          WHERE dp2.id = (SELECT dienstplan_id FROM dienste WHERE id = ?))
    `).get(dienstId, ma.id, dienstId);
    if (restriktion) {
      vorschlaege.push({ ...ma, grund_ausschluss: 'Einsatzrestriktion', geeignet: false });
      continue;
    }

    vorschlaege.push({ ...ma, grund_ausschluss: null, geeignet: true });
  }

  return vorschlaege;
}

// Hilfsfunktionen
function gruppiereNachMitarbeitenden(dienste) {
  return dienste.reduce((acc, d) => {
    const key = d.mitarbeitende_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});
}

function gruppiereNachDatum(dienste) {
  return dienste.reduce((acc, d) => {
    if (!acc[d.datum]) acc[d.datum] = [];
    acc[d.datum].push(d);
    return acc;
  }, {});
}

function gruppiereNachKalenderwoche(dienste) {
  return dienste.reduce((acc, d) => {
    const kw = getKalenderwoche(d.datum);
    if (!acc[kw]) acc[kw] = [];
    acc[kw].push(d);
    return acc;
  }, {});
}

function getKalenderwoche(dateStr) {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / 86400000);
  return Math.ceil((days + start.getDay() + 1) / 7);
}

function zeitfensterUeberschneidet(beginn, ende, fensterBeginn, fensterEnde) {
  return beginn < fensterEnde && ende > fensterBeginn;
}

module.exports = { pruefeGesamtplan, ersatzvorschlaege };
