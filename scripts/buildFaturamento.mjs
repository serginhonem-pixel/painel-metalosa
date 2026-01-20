import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const INPUT = path.resolve('src', 'Faturamento', 'faturamento.xlsx');
const OUTPUT = path.resolve('src', 'data', 'faturamento.json');
const SHEET = 'SCAF2020';
const DEVOLUCAO_INPUT = path.resolve('src', 'Faturamento', 'devolução.xlsx');
const DEVOLUCAO_OUTPUT = path.resolve('src', 'data', 'devolucao.json');
const DEVOLUCAO_SHEET = 'SCAFNYW0';
const CFOP_DEVOLUCAO = new Set(['1201', '2201', '1202', '2202']);
const FILIAIS_FORCADAS_GRUPO = new Set(['G100', 'G110', 'G120', 'G150', 'G200']);
const CUSTOS_INPUT = path.resolve('src', 'Faturamento', 'custos.xlsx');
const CUSTOS_OUTPUT = path.resolve('src', 'data', 'custos.json');
const CUSTOS_SHEET = 'Sheet1';
const CUSTOS_INDIRETOS_OUTPUT = path.resolve('src', 'data', 'custos_indiretos.json');
const CUSTOS_INDIRETOS_SHEET = 'Indiretos';

const normalizar = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const localizarCabecalho = (rows, required) => {
  for (let i = 0; i < Math.min(rows.length, 50); i += 1) {
    const row = rows[i] || [];
    const normalizados = row.map((cell) => normalizar(cell));
    if (required.every((col) => normalizados.includes(col))) {
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

const normalizarCfop = (valor) => String(valor ?? '').replace(/\D/g, '');

const extrairFaturamento = (sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const headerIndex = localizarCabecalho(rows, ['cliente', 'vlrtotal']);
  if (headerIndex < 0) {
    throw new Error('Nao foi possivel localizar o cabecalho do faturamento.');
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
    'numdanota',
    'numdanf',
    'numdoc',
    'documento',
  ]);
  const idxCodFiscal = localizarIndice(header, ['codfiscal', 'codfisc', 'cfop']);

  return rows.slice(headerIndex + 1).reduce((acc, row) => {
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
    const codFiscalRaw = idxCodFiscal >= 0 ? row?.[idxCodFiscal] : '';
    const codFiscal = codFiscalRaw ? normalizarCfop(codFiscalRaw) : '';

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
      CodFiscal: codFiscal,
      MesEmissao: formatMesEmissao(emissao),
      TipoMovimento: 'venda',
    });

    return acc;
  }, []);
};

const extrairDevolucoes = (sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  const headerIndex = localizarCabecalho(rows, ['codfiscal', 'vlrtotal']);
  if (headerIndex < 0) {
    throw new Error('Nao foi possivel localizar o cabecalho da devolucao.');
  }

  const header = rows[headerIndex] || [];
  const idxCliente = localizarIndice(header, ['forncliente', 'cliente']);
  const idxFilial = localizarIndice(header, ['filial']);
  const idxGrupo = localizarIndice(header, ['grupo']);
  const idxCodigo = localizarIndice(header, ['produto', 'codigo']);
  const idxDescricao = localizarIndice(header, ['descitem', 'descricao']);
  const idxQuantidade = localizarIndice(header, ['quantidade']);
  const idxUnidade = localizarIndice(header, ['unidade']);
  const idxValorUnitario = localizarIndice(header, ['vlrunitario', 'valorunitario']);
  const idxValorTotal = localizarIndice(header, ['vlrtotal', 'valortotal', 'valordevol']);
  const idxEmissao = localizarIndice(header, ['dtemissao', 'emissao']);
  const idxCFOP = localizarIndice(header, ['codfiscal', 'cfop']);
  const idxNF = localizarIndice(header, [
    'documento',
    'numdoc',
    'numeronf',
    'nota',
    'notafiscal',
    'numdanota',
    'numdanf',
  ]);

  return rows.slice(headerIndex + 1).reduce((acc, row) => {
    const valorTotal = row?.[idxValorTotal];
    const cfopRaw = idxCFOP >= 0 ? row?.[idxCFOP] : '';
    const cfop = normalizarCfop(cfopRaw);
    if (!CFOP_DEVOLUCAO.has(cfop)) return acc;

    const cliente = row?.[idxCliente];
    const grupo = row?.[idxGrupo];
    const codigo = row?.[idxCodigo];
    const descricao = row?.[idxDescricao];
    const quantidade = row?.[idxQuantidade];
    const unidade = row?.[idxUnidade];
    const valorUnitario = row?.[idxValorUnitario];
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
      CFOP: cfop,
      TipoMovimento: 'devolucao',
    });

    return acc;
  }, []);
};

const extrairCustos = (sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (!rows.length) return [];
  const header = rows[0] || [];
  const idxCodigo = localizarIndice(header, ['codigo', 'cod']);
  const idxDescricao = localizarIndice(header, ['descricao', 'desc']);
  const mensalidades = header
    .map((cell, idx) => ({ idx, label: String(cell ?? '').trim() }))
    .filter(({ idx, label }) => {
      if (!label) return false;
      if (idx === idxCodigo || idx === idxDescricao) return false;
      return true;
    });

  return rows.slice(1).reduce((acc, row) => {
    const codigo = idxCodigo >= 0 ? row?.[idxCodigo] ?? '' : '';
    const descricao = idxDescricao >= 0 ? row?.[idxDescricao] ?? '' : '';
    if (!codigo && !descricao) return acc;
    const valores = {};
    mensalidades.forEach(({ idx, label }) => {
      const raw = row?.[idx];
      let numero = 0;
      if (typeof raw === 'number') {
        numero = raw;
      } else if (typeof raw === 'string') {
        const normalizado = Number(String(raw).replace(',', '.').replace(/[^0-9.-]/g, ''));
        numero = Number.isNaN(normalizado) ? 0 : normalizado;
      }
      valores[label] = numero;
    });
    acc.push({
      Codigo: codigo,
      Descricao: descricao,
      Valores: valores,
    });
    return acc;
  }, []);
};

const extrairCustosIndiretos = (sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (!rows.length) return [];
  const header = rows[0] || [];
  const mensalidades = header
    .map((cell, idx) => ({ idx, label: String(cell ?? '').trim() }))
    .filter(({ idx, label }) => idx >= 2 && label);
  return rows.slice(1).reduce((acc, row) => {
    const codigo = String(row?.[0] ?? '').trim();
    const descricao = String(row?.[1] ?? '').trim();
    if (!codigo && !descricao) return acc;
    const valores = {};
    mensalidades.forEach(({ idx, label }) => {
      const raw = row?.[idx];
      let numero = 0;
      if (typeof raw === 'number') {
        numero = raw;
      } else if (typeof raw === 'string') {
        const normalizado = Number(String(raw).replace(',', '.').replace(/[^0-9.-]/g, ''));
        numero = Number.isNaN(normalizado) ? 0 : normalizado;
      }
      valores[label] = numero;
    });
    acc.push({
      Codigo: codigo,
      Descricao: descricao,
      Valores: valores,
    });
    return acc;
  }, []);
};

const aplicarFilialGrupos = (linhas) =>
  linhas.map((linha) => {
    if (!linha) return linha;
    if (FILIAIS_FORCADAS_GRUPO.has(String(linha.Grupo || '').trim().toUpperCase())) {
      return { ...linha, Filial: '01' };
    }
    return linha;
  });

const main = () => {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Arquivo nao encontrado: ${INPUT}`);
  }

  const workbook = XLSX.readFile(INPUT, { cellDates: true });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) {
    throw new Error(`Aba nao encontrada: ${SHEET}`);
  }

  const dados = aplicarFilialGrupos(extrairFaturamento(sheet));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(dados, null, 2));
  console.log(`Gerado ${OUTPUT} com ${dados.length} linhas.`);

  if (fs.existsSync(DEVOLUCAO_INPUT)) {
    const devolucaoWorkbook = XLSX.readFile(DEVOLUCAO_INPUT, { cellDates: true });
    const devolucaoSheet = devolucaoWorkbook.Sheets[DEVOLUCAO_SHEET];
    if (!devolucaoSheet) {
      throw new Error(`Aba nao encontrada: ${DEVOLUCAO_SHEET}`);
    }

    const devolucoes = aplicarFilialGrupos(extrairDevolucoes(devolucaoSheet));
    fs.mkdirSync(path.dirname(DEVOLUCAO_OUTPUT), { recursive: true });
    fs.writeFileSync(DEVOLUCAO_OUTPUT, JSON.stringify(devolucoes, null, 2));
    console.log(`Gerado ${DEVOLUCAO_OUTPUT} com ${devolucoes.length} linhas.`);
  } else {
    console.warn(`Arquivo de devolucao nao encontrado: ${DEVOLUCAO_INPUT}`);
  }

  if (fs.existsSync(CUSTOS_INPUT)) {
    const custosWorkbook = XLSX.readFile(CUSTOS_INPUT, { cellDates: true });
    const custosSheet = custosWorkbook.Sheets[CUSTOS_SHEET];
    if (!custosSheet) {
      throw new Error(`Aba nao encontrada: ${CUSTOS_SHEET}`);
    }

    const custos = extrairCustos(custosSheet);
    fs.mkdirSync(path.dirname(CUSTOS_OUTPUT), { recursive: true });
    fs.writeFileSync(CUSTOS_OUTPUT, JSON.stringify(custos, null, 2));
    console.log(`Gerado ${CUSTOS_OUTPUT} com ${custos.length} linhas.`);
    const indiretosSheet = custosWorkbook.Sheets[CUSTOS_INDIRETOS_SHEET];
    if (indiretosSheet) {
      const indiretos = extrairCustosIndiretos(indiretosSheet);
      fs.mkdirSync(path.dirname(CUSTOS_INDIRETOS_OUTPUT), { recursive: true });
      fs.writeFileSync(CUSTOS_INDIRETOS_OUTPUT, JSON.stringify(indiretos, null, 2));
      console.log(`Gerado ${CUSTOS_INDIRETOS_OUTPUT} com ${indiretos.length} linhas.`);
    } else {
      console.warn(`Aba nao encontrada: ${CUSTOS_INDIRETOS_SHEET}`);
    }
  } else {
    console.warn(`Arquivo de custos nao encontrado: ${CUSTOS_INPUT}`);
  }
};

main();
