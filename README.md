# Dienstplanungs-Applikation

Webbasierte Dienstplanungs-Applikation für Einrichtungen der besonderen Wohnform (Eingliederungshilfe nach SGB IX).

## Schnellstart

```bash
# Backend
cd backend && npm install && npm run seed && npm start

# Frontend (neues Terminal)
cd frontend && npm install && npm run dev
```

Login: `leitung@example.de` / `password123`

## Architektur

- **Backend**: Node.js + Express + SQLite (better-sqlite3) + JWT
- **Frontend**: React + Vite + Tailwind CSS
- **Regel-Engine**: serverseitig, geprüft bei jeder Planänderung

## Rollen

| Rolle | Beschreibung |
|---|---|
| `leitung` | Vollzugriff, Regelkonfiguration |
| `teamleitung` | Planung, Bedarfsübersicht |
| `mitarbeitende` | Nur eigene Dienste, Tausch anfragen |
