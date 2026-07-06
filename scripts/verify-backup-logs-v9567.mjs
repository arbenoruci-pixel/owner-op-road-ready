import fs from 'node:fs';

const files = {
  tools:'source/src/shared/ui/ToolsSheet.jsx',
  app:'source/src/app/App.jsx',
  screen:'source/src/modules/backup/BackupLogsScreen.jsx',
  styles:'source/src/styles.css',
  version:'source/src/core/update/appUpdate.js',
};

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}
function read(path) { return fs.readFileSync(path, 'utf8'); }

const tools = read(files.tools);
const app = read(files.app);
const screen = read(files.screen);
const styles = read(files.styles);
const version = read(files.version);

assert(tools.includes('Backup Logs'), 'Tools sheet shows Backup Logs');
assert(tools.includes('onBackup'), 'Tools sheet has onBackup handler');
assert(app.includes("view:'backup'"), 'App can route to backup view');
assert(app.includes('BackupLogsScreen'), 'App imports/renders BackupLogsScreen');
assert(app.includes('buildManualBackup'), 'App has manual backup builder');
assert(app.includes('importManualBackup'), 'App has manual backup import handler');
assert(app.includes('saveAppSnapshot(APP_STATE_KEY, cleanPayload.state)'), 'Export saves current state before download');
assert(app.includes('saveAppSnapshot(APP_STATE_KEY, restored)'), 'Import persists restored state');
assert(screen.includes('Export backup'), 'Backup screen has export button');
assert(screen.includes('Import backup'), 'Backup screen has import button');
assert(screen.includes('road-ready-backup-'), 'Backup filename is Road Ready named');
assert(screen.includes('eventsByDay'), 'Import recognizes eventsByDay backup data');
assert(screen.includes('signatureByDay'), 'Import recognizes signature data');
assert(screen.includes('inspectionByDay'), 'Import recognizes inspection data');
assert(screen.includes('DOT wallet'), 'Screen mentions wallet data');
assert(styles.includes('backup-screen'), 'Backup styles exist');
assert(version.includes("95.67.0"), 'Current app version is 95.67.0');

console.log(`verify-backup-logs-v9567: ${checks} checks passed`);
