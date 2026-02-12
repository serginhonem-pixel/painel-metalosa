import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const INPUT = path.resolve('public', 'data', 'faltas.xlsx');
const OUTPUT = path.resolve('public', 'data', 'faltas.json');

const limparTexto = (valor) => String(valor ?? '').trim();

const normalizarNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const bruto = String(valor).trim().replace(',', '.');
  const numero = Number(bruto);
  return Number.isFinite(numero) ? numero : 0;
};

const normalizarDataISO = (valor) => {
  if (!valor && valor !== 0) return '';
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === 'number') {
    const parsed = XLSX.SSF.parse_date_code(valor);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const texto = limparTexto(valor);
  const matchBr = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchBr) {
    const d = matchBr[1].padStart(2, '0');
    const m = matchBr[2].padStart(2, '0');
    const y = matchBr[3];
    return `${y}-${m}-${d}`;
  }
  const matchIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
  return '';
};

const encontrarCabecalho = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const linha = rows[i] || [];
    const temData = linha.some((cell) => limparTexto(cell).toLowerCase() === 'data');
    const temMatricula = linha.some((cell) => limparTexto(cell).toLowerCase() === 'matricula');
    const temNome = linha.some((cell) => limparTexto(cell).toLowerCase() === 'nome');
    if (temData && temMatricula && temNome) {
      return i;
    }
  }
  return -1;
};

const getCol = (obj, ...candidatos) => {
  const keys = Object.keys(obj || {});
  const mapNorm = new Map(keys.map((k) => [limparTexto(k).toLowerCase(), k]));
  for (const nome of candidatos) {
    const achou = mapNorm.get(limparTexto(nome).toLowerCase());
    if (achou) return obj[achou];
  }
  return undefined;
};

const main = () => {
  if (!fs.existsSync(INPUT)) {
    console.warn(`Arquivo de faltas nao encontrado: ${INPUT}`);
    return;
  }

  const workbook = XLSX.readFile(INPUT, { cellDates: true });
  const nomeAba = workbook.SheetNames[0];
  const sheet = workbook.Sheets[nomeAba];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  const headerIndex = encontrarCabecalho(rows);
  if (headerIndex < 0) {
    throw new Error('Cabecalho da planilha de faltas nao encontrado.');
  }

  const header = rows[headerIndex].map((cell) => limparTexto(cell));
  const dataRows = rows.slice(headerIndex + 1).filter((linha) => linha.some((cell) => limparTexto(cell)));
  const objetos = dataRows.map((linha) => Object.fromEntries(header.map((col, idx) => [col, linha[idx]])));

  const registros = [];
  const byDate = {};
  const summaryByDate = {};

  objetos.forEach((item) => {
    const dataISO = normalizarDataISO(getCol(item, 'Data'));
    const matriculaRaw = limparTexto(getCol(item, 'Matricula'));
    const matricula = matriculaRaw.replace(/\D/g, '').replace(/^0+/, '') || matriculaRaw;
    const nome = limparTexto(getCol(item, 'Nome')).toUpperCase();

    if (!dataISO) return;

    const naoAutorizadas = normalizarNumero(getCol(item, 'Nao Autorizadas'));
    const autorizadas = normalizarNumero(getCol(item, 'Autorizadas'));
    const abonadas = normalizarNumero(getCol(item, 'Abonadas'));
    const suspensao = normalizarNumero(getCol(item, 'Suspensao'));

    let tipoFalta = '';
    if (naoAutorizadas > 0) {
      tipoFalta = 'Falta Injustificada';
    } else if (autorizadas > 0 || abonadas > 0 || suspensao > 0) {
      tipoFalta = 'Falta Justificada';
    }
    if (!tipoFalta) return;

    const registro = {
      dataISO,
      matricula,
      matriculaRaw,
      nome,
      tipoFalta,
      horas: {
        naoAutorizadas,
        autorizadas,
        abonadas,
        suspensao,
      },
    };

    registros.push(registro);
    if (!byDate[dataISO]) byDate[dataISO] = [];
    byDate[dataISO].push(registro);

    if (!summaryByDate[dataISO]) {
      summaryByDate[dataISO] = {
        total: 0,
        tipos: {
          'Falta Justificada': 0,
          'Falta Injustificada': 0,
          Ferias: 0,
        },
      };
    }
    summaryByDate[dataISO].total += 1;
    summaryByDate[dataISO].tipos[tipoFalta] += 1;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: 'public/data/faltas.xlsx',
    sheetName: nomeAba,
    totalRegistros: registros.length,
    byDate,
    summaryByDate,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2));
  console.log(`Gerado ${OUTPUT} com ${registros.length} registros.`);
};

main();
