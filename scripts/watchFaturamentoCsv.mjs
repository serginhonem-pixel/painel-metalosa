import fs from 'fs';
import path from 'path';

const INPUT =
  process.env.FATURAMENTO_CSV ?? '\\\\10.10.100.4\\Setor\\PCP\\ARQIMPORT\\met113l.csv';
const OUTPUT = path.resolve('src', 'data', 'faturamento.json');
const WATCH_INTERVAL_MS = Number(process.env.FATURAMENTO_WATCH_MS ?? 30000);
const DEFAULT_ENCODING = process.env.FATURAMENTO_CSV_ENCODING ?? 'latin1';

const normalizar = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

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

const parseNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') return valor;
  const texto = String(valor).trim();
  if (!texto) return '';
  const normalizado = texto.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? texto : numero;
};

const parseCsvLine = (line, delimiter) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
};

const detectarDelimiter = (line) => {
  const semicolon = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semicolon >= comma ? ';' : ',';
};

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { header: [], rows: [] };
  const delimiter = detectarDelimiter(lines[0]);
  const header = parseCsvLine(lines[0], delimiter).map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));
  return { header, rows };
};

const getHeaderIndex = (header) => {
  const required = ['cliente', 'valortotal'];
  const normalizados = header.map((cell) => normalizar(cell));
  return required.every((col) => normalizados.includes(col)) ? 0 : -1;
};

const carregarCsv = () => {
  if (!fs.existsSync(INPUT)) {
    console.warn(`Arquivo nao encontrado: ${INPUT}`);
    return null;
  }

  const preferred = parseCsv(fs.readFileSync(INPUT, DEFAULT_ENCODING));
  if (getHeaderIndex(preferred.header) >= 0) return preferred;

  const fallback = parseCsv(fs.readFileSync(INPUT, 'utf8'));
  if (getHeaderIndex(fallback.header) >= 0) return fallback;

  return preferred;
};

const extrairFaturamento = ({ header, rows }) => {
  const idxCliente = localizarIndice(header, ['cliente']);
  const idxFilial = localizarIndice(header, ['filial']);
  const idxGrupo = localizarIndice(header, ['grupo']);
  const idxCodigo = localizarIndice(header, ['codigo', 'produto']);
  const idxDescricao = localizarIndice(header, ['descricao', 'descitem', 'desc']);
  const idxQuantidade = localizarIndice(header, ['quantidade', 'qtd']);
  const idxUnidade = localizarIndice(header, ['unidade', 'un']);
  const idxValorUnitario = localizarIndice(header, [
    'vlrunitario',
    'valorunitario',
    'valorunitari',
    'valorunit',
  ]);
  const idxValorTotal = localizarIndice(header, ['vlrtotal', 'valortotal', 'valor total']);
  const idxEmissao = localizarIndice(header, ['emissao', 'dtemissao']);
  const idxVendedor = localizarIndice(header, [
    'vendedor',
    'vendedor1',
    'codvendedor',
    'codvend',
    'vend1',
  ]);
  const idxNF = localizarIndice(header, [
    'nf',
    'nfe',
    'notafiscal',
    'nota',
    'numeronf',
    'numeronota',
    'numdanota',
    'numdanf',
    'numdoc',
    'documento',
  ]);
  const idxCodFiscal = localizarIndice(header, ['codfiscal', 'codfisc', 'cfop']);
  const idxTipoMov = localizarIndice(header, ['tipomovimento', 'tipomovime', 'tipomov']);
  const idxMesEmissao = localizarIndice(header, ['mesemissao', 'mesemiss', 'mes']);

  if (idxCliente < 0 || idxValorTotal < 0) {
    throw new Error('Nao foi possivel localizar as colunas obrigatorias (Cliente, ValorTotal).');
  }

  return rows.reduce((acc, row) => {
    const cliente = row?.[idxCliente];
    const grupo = row?.[idxGrupo];
    const codigo = row?.[idxCodigo];
    const valorTotal = row?.[idxValorTotal];

    const vazio =
      (cliente === undefined || cliente === null || cliente === '') &&
      (grupo === undefined || grupo === null || grupo === '') &&
      (codigo === undefined || codigo === null || codigo === '') &&
      (valorTotal === undefined || valorTotal === null || valorTotal === '');

    if (vazio) return acc;

    const emissaoRaw = idxEmissao >= 0 ? row?.[idxEmissao] : '';
    const emissaoDate = parseDate(emissaoRaw);

    const tipoMovRaw = idxTipoMov >= 0 ? row?.[idxTipoMov] : '';
    const tipoMov = tipoMovRaw ? String(tipoMovRaw).trim() : 'venda';
    const mesEmissaoRaw = idxMesEmissao >= 0 ? row?.[idxMesEmissao] : '';

    acc.push({
      Cliente: cliente ?? '',
      Filial: idxFilial >= 0 ? (row?.[idxFilial] ?? '') : '',
      Grupo: grupo ?? '',
      Codigo: codigo ?? '',
      Descricao: idxDescricao >= 0 ? (row?.[idxDescricao] ?? '') : '',
      Quantidade: idxQuantidade >= 0 ? parseNumero(row?.[idxQuantidade]) : '',
      Unidade: idxUnidade >= 0 ? (row?.[idxUnidade] ?? '') : '',
      ValorUnitario: idxValorUnitario >= 0 ? parseNumero(row?.[idxValorUnitario]) : '',
      ValorTotal: parseNumero(valorTotal),
      Emissao: emissaoDate ?? emissaoRaw ?? '',
      Vendedor1: idxVendedor >= 0 ? (row?.[idxVendedor] ?? '') : '',
      NF: idxNF >= 0 ? parseNumero(row?.[idxNF]) : '',
      CodFiscal: idxCodFiscal >= 0 ? String(row?.[idxCodFiscal] ?? '').replace(/\D/g, '') : '',
      MesEmissao: formatMesEmissao(emissaoRaw || mesEmissaoRaw),
      TipoMovimento: tipoMov,
    });

    return acc;
  }, []);
};

const gerarJson = () => {
  const csv = carregarCsv();
  if (!csv) return;

  if (getHeaderIndex(csv.header) < 0) {
    throw new Error('Cabecalho do CSV nao identificado.');
  }

  const dados = extrairFaturamento(csv);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(dados, null, 2));
  console.log(`Gerado ${OUTPUT} com ${dados.length} linhas.`);
};

let running = false;
let pending = false;
const executar = () => {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    gerarJson();
  } catch (error) {
    console.error(`Erro ao gerar faturamento: ${error.message}`);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      setTimeout(executar, 500);
    }
  }
};

console.log(`Observando ${INPUT} a cada ${WATCH_INTERVAL_MS} ms...`);
executar();
fs.watchFile(INPUT, { interval: WATCH_INTERVAL_MS }, (curr, prev) => {
  if (curr.mtimeMs !== prev.mtimeMs) {
    console.log('Arquivo alterado. Regerando faturamento.json...');
    executar();
  }
});
