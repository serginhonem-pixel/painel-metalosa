import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { firebaseConfig } from '../src/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const lerJson = (relPath) => {
  const filePath = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const normalizarId = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .trim();

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const funcionarios = lerJson('src/data/funcionarios.json');
const presencaDez = lerJson('src/data/Prensençadez.json');
const faturamento = lerJson('public/data/faturamento-2025.json');

const escreverEmLotes = async (docs) => {
  let batch = writeBatch(db);
  let count = 0;

  for (const { ref, data } of docs) {
    batch.set(ref, data);
    count += 1;
    if (count % 450 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }
};

const subirFuncionarios = async () => {
  const colRef = collection(db, 'funcionarios');
  const docs = funcionarios.map((item, index) => {
    const id = `${normalizarId(item.nome)}-${index + 1}`;
    return {
      ref: doc(colRef, id),
      data: {
        nome: item.nome || '',
        setor: item.setor || '',
        gestor: item.gestor || 'Thalles',
      },
    };
  });
  await escreverEmLotes(docs);
  console.log(`Funcionarios enviados: ${docs.length}`);
};

const subirPresencaDez = async () => {
  if (!presencaDez) {
    console.log('Arquivo de presenca dezembro nao encontrado, ignorando.');
    return;
  }
  const colRef = collection(db, 'presenca_2025_12');
  const docs = presencaDez.colaboradores.map((item, index) => {
    const id = `${normalizarId(item.nome)}-${index + 1}`;
    return {
      ref: doc(colRef, id),
      data: {
        nome: item.nome || '',
        setor: item.setor || '',
        supervisor: presencaDez.supervisor || 'Thalles',
        excecoes: item.excecoes || {},
        defaultStatus: presencaDez.defaultStatus || 'Presenca',
      },
    };
  });
  await escreverEmLotes(docs);
  console.log(`Presenca dezembro enviada: ${docs.length}`);
};

const subirFaturamento = async () => {
  const porMes = faturamento.reduce((acc, item) => {
    const mes = item.MesEmissao || 'SemMes';
    if (!acc[mes]) acc[mes] = [];
    acc[mes].push(item);
    return acc;
  }, {});

  for (const [mes, itens] of Object.entries(porMes)) {
    const mesId = mes.replace('/', '-');
    const docRef = doc(collection(db, 'faturamento_2025'), mesId);
    const total = itens.reduce((acc, item) => acc + (Number(item.ValorTotal) || 0), 0);

    await setDoc(docRef, {
      mes,
      total,
      quantidade: itens.length,
    });

    const itensRef = collection(db, 'faturamento_2025', mesId, 'itens');
    const docs = itens.map((item, index) => ({
      ref: doc(itensRef, `${mesId}-${index + 1}`),
      data: item,
    }));

    await escreverEmLotes(docs);
    console.log(`Faturamento ${mes} enviado: ${itens.length}`);
  }
};

const main = async () => {
  await subirFuncionarios();
  await subirPresencaDez();
  await subirFaturamento();
  console.log('Upload finalizado.');
};

main().catch((err) => {
  console.error('Erro no upload:', err);
  process.exit(1);
});
