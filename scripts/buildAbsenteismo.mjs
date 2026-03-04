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

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2));
  console.log(`Gerado ${OUTPUT} com ${sheets.length} planilhas.`);
};

main();
