import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.dirname(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = path.join(projectRoot, 'public', 'app-config.js');

const vapidKey =
  process.env.FIREBASE_VAPID_KEY ||
  process.env.VITE_FIREBASE_VAPID_KEY ||
  '';

const content = `window.__APP_CONFIG__ = {\n  FIREBASE_VAPID_KEY: '${vapidKey}',\n};\n`;

await fs.writeFile(outputPath, content, 'utf8');

if (!vapidKey) {
  console.warn(
    'Aviso: FIREBASE_VAPID_KEY/VITE_FIREBASE_VAPID_KEY nao definida. Notificacoes ficarao desativadas.'
  );
}
