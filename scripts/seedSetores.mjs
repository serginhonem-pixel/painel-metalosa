import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

const lerEnv = (arquivo) => {
  const vars = {};
  const conteudo = fs.readFileSync(arquivo, 'utf-8');
  conteudo.split(/\r?\n/).forEach((linha) => {
    if (!linha || linha.trim().startsWith('#')) return;
    const [chave, ...resto] = linha.split('=');
    if (!chave) return;
    vars[chave.trim()] = resto.join('=').trim();
  });
  return vars;
};

const setores = [
  'Steel Frame',
  'Drywall',
  'Solda',
  'Solda Continua',
  'Betoneira',
  'Caçamba',
  'Inox',
  'Aro',
  'Pintura',
  'Carro solda',
  'Célula robótica',
  'Vergalhao',
  'Pé',
  'Kit',
  'Varal',
  'Montagem de Pneu',
  'Perfil',
  'Polimento',
  'Setores auxiliares',
  'Supervisão',
  'Perfilador',
  'Perfilados',
  'Telha',
];

const normalizarId = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .trim();

const envPath = path.resolve(process.cwd(), '.env');
const env = lerEnv(envPath);
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const commitComTimeout = async (batch, label, timeoutMs = 30000) =>
  Promise.race([
    batch.commit(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ao enviar ${label}`)), timeoutMs)
    ),
  ]);

const main = async () => {
  let batch = writeBatch(db);
  let count = 0;
  let total = 0;

  for (const nome of setores) {
    const id = normalizarId(nome);
    batch.set(doc(db, 'setores', id), { nome });
    count += 1;
    total += 1;
    if (count >= 50) {
      console.log(`Enviando lote: ${total - count + 1}-${total}`);
      await commitComTimeout(batch, `lote ${total - count + 1}-${total}`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    console.log(`Enviando lote final: ${total - count + 1}-${total}`);
    await commitComTimeout(batch, `lote final ${total - count + 1}-${total}`);
  }

  console.log(`Setores enviados: ${total}`);
};

main().catch((err) => {
  console.error('Erro ao enviar setores:', err);
  process.exit(1);
});
