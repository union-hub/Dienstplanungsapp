# Dienstplanungsapp

Webbasierte Dienstplanungs-Applikation für Einrichtungen der besonderen Wohnform (Menschen mit Behinderung).

> **Fachliche Leitfrage:** *Ist mit diesem Dienstplan die fachlich notwendige Assistenz für die hier lebenden Menschen rechtssicher gewährleistet?*

## Features

- Mitarbeitende & Qualifikationen verwalten
- Bewohner*innen inkl. Unterstützungsbedarf & Restriktionen
- Dienste planen mit Drag & Drop
- Regel-Engine (Mindestbesetzung, Fachkraftquote, Arbeitszeit, Ruhezeiten)
- Sofortige visuelle Warnungen bei Regelverstößen
- Ausfall- & Ersatzlogik
- Rollenbasierte Zugriffskontrolle (Leitung / Teamleitung / Mitarbeitende)
- Vollständige Änderungshistorie
- PDF-Export & druckoptimierte Ansicht (A4, Querformat)
- Controlling-Dashboard (Fachkraftquote, Ausfälle, Überstunden)

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | React 18 + Vite + TailwindCSS |
| Backend | Node.js + Express |
| Datenbank | SQLite (via better-sqlite3) |
| Auth | JWT (RS256) |
| PDF | html2canvas + jsPDF |

## Schnellstart

### Voraussetzungen
- Node.js >= 18
- npm >= 9

### Installation

```bash
# Repository klonen
git clone https://github.com/union-hub/Dienstplanungsapp.git
cd Dienstplanungsapp

# Backend
cd backend
npm install
npm run seed      # Demo-Daten laden
npm run dev       # startet auf Port 3001

# Frontend (neues Terminal)
cd ../frontend
npm install
npm run dev       # startet auf Port 5173
```

Browser öffnen: **http://localhost:5173**

### Demo-Zugangsdaten

| Rolle | Benutzername | Passwort |
|-------|-------------|----------|
| Leitung | leitung@demo.de | demo1234 |
| Teamleitung | teamleitung@demo.de | demo1234 |
| Mitarbeitende | ma1@demo.de | demo1234 |

## Projektstruktur

```
Dienstplanungsapp/
├── backend/
│   ├── src/
│   │   ├── db/          # Datenbankschema & Seed
│   │   ├── middleware/  # Auth, Error-Handling
│   │   ├── routes/      # REST-API Endpunkte
│   │   └── rules/       # Regel-Engine
│   └── server.js
└── frontend/
    └── src/
        ├── api/         # API-Client
        ├── components/  # React-Komponenten
        ├── contexts/    # Auth-Context
        └── pages/       # Seiten
```

## Datenbankschema (Übersicht)

```
users ─────────── employees ─── qualifications
                      │
                 assignments ─── shifts
                      │
                  residents ─── resident_restrictions
schedules ──── schedule_history
```

## Lizenz

MIT – Nutzung, Anpassung und Weiterverteilung für gemeinnützige und gewerbliche Zwecke erlaubt.
