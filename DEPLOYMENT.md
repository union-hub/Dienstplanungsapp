# Deployment-Anleitung – Dienstplanungsapp
## Windows Server (on-premise, IIS + PM2)

---

## Voraussetzungen

| Software    | Version | Download |
|-------------|---------|----------|
| Node.js     | 20 LTS  | https://nodejs.org |
| Git         | aktuell | https://git-scm.com |
| PM2         | via npm | `npm install -g pm2 pm2-windows-startup` |
| URL Rewrite | IIS     | https://iis.net/downloads/microsoft/url-rewrite |
| ARR         | IIS     | https://iis.net/downloads/microsoft/application-request-routing |

---

## Schritt 1 – IIS + Node.js + Git installieren (als Administrator)

```powershell
Install-WindowsFeature -name Web-Server -IncludeManagementTools
# Danach Node.js und Git von den obigen URLs herunterladen und installieren
npm install -g pm2 pm2-windows-startup
pm2-startup install
```

---

## Schritt 2 – Code holen

```powershell
mkdir C:\Apps
cd C:\Apps
git clone https://github.com/union-hub/Dienstplanungsapp
cd Dienstplanungsapp
```

---

## Schritt 3 – Umgebungsvariablen konfigurieren

```powershell
copy .env.example .env
notepad .env
```

Wichtigste Einträge:

```
# Sicheres Secret generieren:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<generierten_wert_eintragen>

FRONTEND_URL=http://<server-ip>
DB_PATH=C:\Apps\Dienstplanungsapp\data\dienstplan.db
BACKUP_DIR=C:\Apps\Dienstplanungsapp\data\backups
```

---

## Schritt 4 – Backend installieren und mit PM2 starten

```powershell
cd C:\Apps\Dienstplanungsapp\backend
npm install
npm run seed
pm2 start server.js --name dienstplan-backend --cwd C:\Apps\Dienstplanungsapp\backend
pm2 save
```

Test: http://localhost:3001/api/health → `{"status":"ok"}`

---

## Schritt 5 – Frontend bauen

```powershell
cd C:\Apps\Dienstplanungsapp\frontend
npm install
npm run build
# Ergebnis: frontend\dist\
```

---

## Schritt 6 – IIS einrichten

1. ARR aktivieren: IIS-Manager → Server → "Application Request Routing Cache" → "Enable proxy"
2. Neue Website: Physical path = `C:\Apps\Dienstplanungsapp\frontend\dist`, Port 80
3. `web.config` anlegen in `frontend\dist\`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3001/api/{R:1}" />
        </rule>
        <rule name="React Router" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

---

## Schritt 7 – Erster Login

1. Browser: `http://<server-ip>`
2. Login: `leitung@demo.de` / `demo1234`
3. Unter 🔐 **Nutzerverwaltung** echte Nutzer anlegen, Demo-Nutzer deaktivieren
4. Eigenes Passwort ändern: Klick auf eigenen Namen in der Sidebar

---

## Backup

Läuft automatisch täglich. Manuell:
```powershell
cd C:\Apps\Dienstplanungsapp\backend
node src/backup.js
```

Für externe Sicherung auf Netzlaufwerk (Windows-Aufgabenplanung):
```powershell
robocopy C:\Apps\Dienstplanungsapp\data\backups \\NETZLAUFWERK\Backups\Dienstplan /MIR
```

---

## Updates einspielen

```powershell
cd C:\Apps\Dienstplanungsapp
git pull
pm2 restart dienstplan-backend
cd frontend && npm run build
```

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| Weiße Seite | `pm2 logs dienstplan-backend` prüfen |
| Token ungültig | F12 → Console → `localStorage.clear()` |
| Backend startet nicht | `.env` prüfen (JWT_SECRET, DB_PATH) |
| IIS zeigt 404 | web.config + URL Rewrite + ARR prüfen |
| PM2 startet nicht nach Reboot | Als Admin: `pm2-startup install`, dann `pm2 save` |
