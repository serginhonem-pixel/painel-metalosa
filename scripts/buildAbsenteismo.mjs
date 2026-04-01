import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const resolveArgPath = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return path.resolve(process.argv[index + 1]);
  }
  return fallback;
};

const INPUT = resolveArgPath('--input', path.resolve('public', 'data', 'absenteismo.xlsx'));
const OUTPUT = resolveArgPath('--output', path.resolve('public', 'data', 'absenteismo.json'));
const MONTH_INDEX_PATH = path.resolve('public', 'data', 'absenteismo-meses.json');

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const parseDatePtBr = (value) => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePeriodEndDate = (value) => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return null;
  return parseDatePtBr(match[2]);
};

const inferReferenceMonth = (sheets) => {
  const endDates = [];
  sheets.forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      if (!Array.isArray(row)) return;
      row.forEach((cell) => {
        const endDate = parsePeriodEndDate(cell);
        if (endDate) endDates.push(endDate);
      });
    });
  });

  const latest = endDates.sort((a, b) => a.getTime() - b.getTime()).at(-1);
  if (!latest) return null;

  const year = latest.getUTCFullYear();
  const month = latest.getUTCMonth() + 1;
  return {
    id: `${year}-${String(month).padStart(2, '0')}`,
    label: `${MONTH_LABELS[month - 1]}/${year}`,
    monthlyFile: `/data/absenteismo-${year}-${String(month).padStart(2, '0')}.json`,
  };
};

const writeJson = (targetPath, payload) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
};

const readJsonSafe = (targetPath) => {
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
};

const buildMonthLabel = (id) => {
  const match = String(id).match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(id);
  const [, year, month] = match;
  const index = Number(month) - 1;
  return `${MONTH_LABELS[index] || month}/${year}`;
};

const sanitizeLabel = (id, label) => {
  const raw = String(label || '').trim();
  if (!raw || raw.includes('Ã')) return buildMonthLabel(id);
  return raw;
};

const updateMonthIndex = (referenceMonth) => {
  if (!referenceMonth) return;

  const current = readJsonSafe(MONTH_INDEX_PATH) || { meses: [] };
  const knownLabels = new Map(
    (Array.isArray(current.meses) ? current.meses : []).map((item) => [String(item?.id), String(item?.label || '')])
  );
  const publicDataDir = path.dirname(MONTH_INDEX_PATH);
  const discovered = fs
    .readdirSync(publicDataDir)
    .map((name) => {
      const match = name.match(/^absenteismo-(\d{4}-\d{2})\.json$/);
      if (!match) return null;
      const id = match[1];
      return {
        id,
        label: sanitizeLabel(id, knownLabels.get(id) || buildMonthLabel(id)),
        file: `/data/${name}`,
      };
    })
    .filter(Boolean);

  const next = discovered.filter((item) => item.id !== referenceMonth.id);
  next.push({
    id: referenceMonth.id,
    label: referenceMonth.label,
    file: referenceMonth.monthlyFile,
  });
  next.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  writeJson(MONTH_INDEX_PATH, {
    generatedAt: new Date().toISOString(),
    meses: next,
  });
  console.log(`Atualizado ${MONTH_INDEX_PATH} com ${next.length} meses.`);
};

const main = () => {
  if (!fs.existsSync(INPUT)) {
    console.warn(`Arquivo de absenteismo nao encontrado: ${INPUT}`);
    return;
  }

  const workbook = XLSX.readFile(INPUT, { cellDates: true });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    return { name, rows };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sheets,
  };

  writeJson(OUTPUT, payload);
  console.log(`Gerado ${OUTPUT} com ${sheets.length} planilhas.`);

  const referenceMonth = inferReferenceMonth(sheets);
  if (!referenceMonth) {
    console.warn('Nao foi possivel identificar o mes de referencia do absenteismo.');
    return;
  }

  const monthlyOutput = path.resolve('public', 'data', `absenteismo-${referenceMonth.id}.json`);
  writeJson(monthlyOutput, payload);
  console.log(`Gerado ${monthlyOutput} para ${referenceMonth.label}.`);

  updateMonthIndex(referenceMonth);
};

main();
