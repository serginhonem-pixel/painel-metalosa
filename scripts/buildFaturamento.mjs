import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const INPUT = path.resolve('src', 'Faturamento', 'faturamento.xlsx');
const OUTPUT = path.resolve('src', 'data', 'faturamento.json');
const SHEET = 'SCAF2020';

const normalizar = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const localizarCabecalho = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 50); i += 1) {
    const row = rows[i] || [];
    const normalizados = row.map((cell) => normalizar(cell));
    if (normalizados.includes('cliente') && normalizados.includes('vlrtotal')) {
      return i;
    }
  }
  return -1;
};

const localizarIndice = (row, candidatos) => {
  const normalizados = row.map((cell) => normalizar(cell));
  for (const candidato of candidatos) {
    const idx = normalizados.findIndex((cell) => cell === candidato);
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseDate = (valor) => {
  if (!valor && valor !== 0) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') {
    const parsed = XLSX.SSF.parse_date_code(valor);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }
  if (typeof valor === 'string') {
    const texto = valor.trim();
    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    }
    const parsed = new Date(texto);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return null;
};

const formatMesEmissao = (valor) => {
  if (!valor && valor !== 0) return '';
  if (typeof valor === 'string') {
    const texto = valor.trim();
    const matchMes = texto.match(/^(\d{1,2})\/(\d{4})$/);
    if (matchMes) {
      return `${String(matchMes[1]).padStart(2, '0')}/${matchMes[2]}`;
    }
    const matchData = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (matchData) {
      const [, , mm, yyyy] = matchData;
      return `${String(mm).padStart(2, '0')}/${yyyy}`;
    }
  }
  const data = parseDate(valor);
  if (!data) return '';
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = data.getUTCFullYear();
  return `${mm}/${yyyy}`;
};

const main = () => {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Arquivo nao encontrado: ${INPUT}`);
  }

  const workbook = XLSX.readFile(INPUT, { cellDates: true });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) {
    throw new Error(`Aba nao encontrada: ${SHEET}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const headerIndex = localizarCabecalho(rows);
  if (headerIndex < 0) {
    throw new Error('Nao foi possivel localizar o cabecalho.');
  }

  const header = rows[headerIndex] || [];
  const idxCliente = localizarIndice(header, ['cliente']);
  const idxFilial = localizarIndice(header, ['filial']);
  const idxGrupo = localizarIndice(header, ['grupo']);
  const idxCodigo = localizarIndice(header, ['produto', 'codigo']);
  const idxDescricao = localizarIndice(header, ['descitem', 'descricao']);
  const idxQuantidade = localizarIndice(header, ['quantidade']);
  const idxUnidade = localizarIndice(header, ['unidade']);
  const idxValorUnitario = localizarIndice(header, ['vlrunitario', 'valorunitario']);
  const idxValorTotal = localizarIndice(header, ['vlrtotal', 'valortotal']);
  const idxEmissao = localizarIndice(header, ['emissao']);
  const idxNF = localizarIndice(header, [
    'nf',
    'nfe',
    'notafiscal',
    'nota',
    'numeronf',
    'numeronota',
    'numdoc',
    'documento',
  ]);

  const dados = rows.slice(headerIndex + 1).reduce((acc, row) => {
    const cliente = row?.[idxCliente];
    const grupo = row?.[idxGrupo];
    const codigo = row?.[idxCodigo];
    const descricao = row?.[idxDescricao];
    const quantidade = row?.[idxQuantidade];
    const unidade = row?.[idxUnidade];
    const valorUnitario = row?.[idxValorUnitario];
    const valorTotal = row?.[idxValorTotal];
    const emissao = row?.[idxEmissao];
    const nf = idxNF >= 0 ? row?.[idxNF] : '';

    const vazio =
      (cliente === undefined || cliente === null || cliente === '') &&
      (grupo === undefined || grupo === null || grupo === '') &&
      (codigo === undefined || codigo === null || codigo === '') &&
      (valorTotal === undefined || valorTotal === null || valorTotal === '');

    if (vazio) return acc;

    acc.push({
      Cliente: cliente ?? '',
      Filial: idxFilial >= 0 ? (row?.[idxFilial] ?? '') : '',
      Grupo: grupo ?? '',
      Codigo: codigo ?? '',
      Descricao: descricao ?? '',
      Quantidade: quantidade ?? '',
      Unidade: unidade ?? '',
      ValorUnitario: valorUnitario ?? '',
      ValorTotal: valorTotal ?? '',
      Emissao: emissao ?? '',
      NF: nf ?? '',
      MesEmissao: formatMesEmissao(emissao),
    });

    return acc;
  }, []);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(dados, null, 2));
  console.log(`Gerado ${OUTPUT} com ${dados.length} linhas.`);
};

main();
