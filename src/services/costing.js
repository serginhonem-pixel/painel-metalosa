const MONTHS_NORMALIZED = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MONTH_INDEX = MONTHS_NORMALIZED.reduce((acc, mes, index) => {
  acc[mes] = index + 1;
  return acc;
}, {});

const removerAcentos = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizarMes = (texto) => {
  const limpo = removerAcentos(texto);
  return MONTH_INDEX[limpo] ? limpo : '';
};

const numeroDoMes = (mesNormalizado) => {
  return mesNormalizado ? MONTH_INDEX[mesNormalizado] || 0 : 0;
};

const parsearNumero = (valor) => {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const limpo = valor.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const numero = Number(limpo);
    return Number.isNaN(numero) ? 0 : numero;
  }
  return 0;
};

const cleanSkuValue = (valor) =>
  String(valor ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim();

const normalizarCodigoProduto = (valor) =>
  String(valor ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();

const normalizeSku = (sku, padLength = 0) => {
  const cleaned = cleanSkuValue(sku);
  if (!cleaned) return '';
  if (padLength > 0 && cleaned.length < padLength) {
    return cleaned.padStart(padLength, '0');
  }
  return cleaned;
};

const determinePadLength = (skus = []) => {
  const frequency = {};
  skus.forEach((sku) => {
    const len = sku ? sku.length : 0;
    if (!len) return;
    frequency[len] = (frequency[len] || 0) + 1;
  });
  const entries = Object.entries(frequency);
  if (!entries.length) return 0;
  const [length] = entries.sort((a, b) => b[1] - a[1])[0];
  return Number(length) || 0;
};

const parseDateFromExcel = (value) => {
  if (typeof value !== 'number') return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
};

const normalizePeriod = (value, fallbackYear) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const date = parseDateFromExcel(value);
    if (!Number.isNaN(date?.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const mm = String(slashMatch[1]).padStart(2, '0');
    return `${slashMatch[2]}-${mm}`;
  }
  const nameMatch = raw.match(/([A-Za-zçÇ]+)\s*(\d{4})?/);
  if (nameMatch) {
    const mesNorm = normalizarMes(nameMatch[1]);
    const year = nameMatch[2] || fallbackYear;
    if (mesNorm && year) {
      return `${year}-${String(numeroDoMes(mesNorm)).padStart(2, '0')}`;
    }
  }
  return '';
};

const encontrarValorPorMes = (valores, mesNormalizado) => {
  if (!valores) {
    return { valor: 0, mes: '' };
  }
  const normalizados = {};
  Object.entries(valores).forEach(([rotulo, raw]) => {
    const mes = normalizarMes(rotulo);
    if (!mes) return;
    normalizados[mes] = parsearNumero(raw);
  });

  if (mesNormalizado && normalizados[mesNormalizado] > 0) {
    return { valor: normalizados[mesNormalizado], mes: mesNormalizado };
  }

  for (let i = MONTHS_NORMALIZED.length - 1; i >= 0; i -= 1) {
    const mes = MONTHS_NORMALIZED[i];
    if (normalizados[mes] > 0) {
      return { valor: normalizados[mes], mes };
    }
  }

  return { valor: 0, mes: '' };
};

const construirMapaDiretos = (dados, mesNormalizado, padLength) => {
  const mapa = new Map();
  (dados || []).forEach((item) => {
    const raw = item.Codigo || item.codigo || '';
    const codigo = normalizeSku(raw, padLength);
    if (!codigo) return;
    const { valor, mes } = encontrarValorPorMes(item.Valores, mesNormalizado);
    mapa.set(codigo, {
      valor,
      mes,
      descricao: item.Descricao || item.descricao || '',
      raw,
    });
  });
  return mapa;
};

const construirTotaisIndiretos = (dados, anoReferencia) => {
  const mapa = new Map();
  (dados || []).forEach((item) => {
    const valores = item.Valores || {};
    Object.entries(valores).forEach(([rotulo, raw]) => {
      const periodo = normalizePeriod(rotulo, anoReferencia);
      if (!periodo) return;
      const valor = parsearNumero(raw);
      mapa.set(periodo, (mapa.get(periodo) || 0) + valor);
    });
  });
  return mapa;
};

const obterPeriodoAtual = (linhas) => {
  const periodos = new Set();
  (linhas || []).forEach((item) => {
    if (item?.mesKey) {
      periodos.add(item.mesKey);
    }
  });
  const ordenados = Array.from(periodos).sort();
  return ordenados.length ? ordenados[ordenados.length - 1] : '';
};

const formatarMoedaLog = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

export const computeCostBreakdown = ({
  linhas = [],
  produtoDescricaoMap = new Map(),
  custosDiretos = [],
  custosDiretosAnoAnterior = [],
  custosIndiretos = [],
  mesCustoAtual = '',
}) => {
  const periodoAtual = obterPeriodoAtual(linhas);
  const anoAtual = periodoAtual ? Number(periodoAtual.slice(0, 4)) : new Date().getFullYear();
  const mesDoPeriodo = periodoAtual ? Number(periodoAtual.slice(5, 7)) : 0;
  const mesNormalizadoAtual = normalizarMes(mesCustoAtual) || MONTHS_NORMALIZED[(mesDoPeriodo || 1) - 1] || '';
  const periodFromLines = normalizePeriod(periodoAtual);
  const periodFromSheet = normalizePeriod(`${mesCustoAtual} ${anoAtual}`, anoAtual);
  const currentPeriodKey = periodFromLines || periodFromSheet || '';

  const skuSamples = new Set();
  const addSkuSample = (raw) => {
    const cleaned = cleanSkuValue(raw);
    if (cleaned) {
      skuSamples.add(cleaned);
    }
  };
  (linhas || []).forEach((line) => addSkuSample(line?.Codigo || line?.codigo));
  custosDiretos.forEach((item) => addSkuSample(item.Codigo || item.codigo));
  custosDiretosAnoAnterior.forEach((item) => addSkuSample(item.Codigo || item.codigo));

  const padLength = determinePadLength(Array.from(skuSamples)) || 0;

  const directAtual = construirMapaDiretos(custosDiretos, mesNormalizadoAtual, padLength);
  const directAnterior = construirMapaDiretos(custosDiretosAnoAnterior, mesNormalizadoAtual, padLength);
  const indiretosPorMes = construirTotaisIndiretos(custosIndiretos, anoAtual);

  let cifTotal = 0;
  let cifFonte = 'ATUAL';
  let periodForCif = '';
  if (currentPeriodKey && indiretosPorMes.has(currentPeriodKey)) {
    cifTotal = indiretosPorMes.get(currentPeriodKey) || 0;
    cifFonte = 'ATUAL';
    periodForCif = currentPeriodKey;
  } else if (currentPeriodKey) {
    const previousYear = `${Number(currentPeriodKey.slice(0, 4)) - 1}-${currentPeriodKey.slice(5)}`;
    if (indiretosPorMes.has(previousYear)) {
      cifTotal = indiretosPorMes.get(previousYear) || 0;
      cifFonte = 'ANO_PASSADO';
      periodForCif = previousYear;
    } else {
      cifTotal = indiretosPorMes.get(currentPeriodKey) || 0;
      periodForCif = currentPeriodKey;
      cifFonte = 'ATUAL';
    }
  }

  const agregados = new Map();
  (linhas || []).forEach((line) => {
    const codigoOriginal = String(line?.Codigo || line?.codigo || '').trim();
    const codigoNormalizado = normalizeSku(codigoOriginal, padLength);
    if (!codigoNormalizado) return;
    const quantidade = parsearNumero(line?.quantidade ?? line?.Quantidade ?? 0);
    const receita = parsearNumero(line?.valorTotal ?? line?.ValorTotal ?? 0);
    const descricao =
      produtoDescricaoMap.get(normalizarCodigoProduto(codigoOriginal)) ||
      produtoDescricaoMap.get(codigoNormalizado) ||
      line?.descricao ||
      line?.Descricao ||
      '';

    const existente = agregados.get(codigoNormalizado) || {
      skuRaw: codigoOriginal,
      skuNormalized: codigoNormalizado,
      descricao,
      quantidade: 0,
      receita: 0,
      unidade: line?.Unidade || line?.unidade || '',
    };
    existente.codigo = existente.codigo || codigoOriginal;
    existente.skuNormalized = codigoNormalizado;
    existente.receita += receita;
    existente.quantidade += quantidade;
    agregados.set(codigoNormalizado, existente);
  });

  const totalCustoDiretoConsolidado = Array.from(directAtual.values()).reduce(
    (acc, entry) => acc + (entry?.valor || 0),
    0
  );

  const itemsBase = Array.from(agregados.values()).map((item) => {
    const unidadeCustoAtual = directAtual.get(item.skuNormalized);
    const unidadeCustoFallback = directAnterior.get(item.skuNormalized);
    let fonteDireto = 'SEM_CUSTO';
    let custoUnitario = 0;
    const custoDiretoAtualValor = unidadeCustoAtual?.valor || 0;
    const custoDiretoPrevValor = unidadeCustoFallback?.valor || 0;

    if (custoDiretoAtualValor > 0) {
      fonteDireto = 'ATUAL';
      custoUnitario = custoDiretoAtualValor;
    } else if (custoDiretoPrevValor > 0) {
      fonteDireto = 'FALLBACK_ANO_PASSADO';
      custoUnitario = custoDiretoPrevValor;
    }

    const custoDireto = custoUnitario * item.quantidade;

    return {
      ...item,
      custoDireto,
      custoUnitario,
      fonteDireto,
      custoDiretoAtualValor,
      custoDiretoPrevValor,
      custoDiretoTeorico: 0,
      descricao: item.descricao,
    };
  });

  const missingItems = itemsBase.filter((item) => item.fonteDireto === 'SEM_CUSTO');
  const missingQuantTotal = missingItems.reduce((acc, item) => acc + Math.max(item.quantidade, 0), 0);
  const missingReceitaTotal = missingItems.reduce((acc, item) => acc + item.receita, 0);

  const valorRestante = totalCustoDiretoConsolidado;

  const itemsComTeorico = itemsBase.map((item) => {
    if (item.fonteDireto === 'SEM_CUSTO' && valorRestante > 0) {
      let novoCustoDireto = 0;
      if (item.quantidade > 0 && missingQuantTotal > 0) {
        novoCustoDireto = (item.quantidade / missingQuantTotal) * valorRestante;
      } else if (item.receita > 0 && missingReceitaTotal > 0) {
        novoCustoDireto = (item.receita / missingReceitaTotal) * valorRestante;
      }
      if (novoCustoDireto > 0) {
        return {
          ...item,
          fonteDireto: 'TEORICO_PROXY',
          custoUnitario: item.quantidade ? novoCustoDireto / item.quantidade : item.custoUnitario,
          custoDireto: novoCustoDireto,
          custoDiretoTeorico: novoCustoDireto,
        };
      }
      return item;
    }
    return item;
  });

  const teoricos = itemsComTeorico.filter((item) => item.fonteDireto === 'TEORICO');
  const somaTeorico = teoricos.reduce((acc, item) => acc + item.custoDireto, 0);
  const diferencaTeorico = valorRestante - somaTeorico;
  if (Math.abs(diferencaTeorico) > 0.01 && teoricos.length > 0) {
    const principal = teoricos[0];
    principal.custoDireto += diferencaTeorico;
    if (principal.quantidade > 0) {
      principal.custoUnitario = principal.custoDireto / principal.quantidade;
    }
  }

  const totalDirect = itemsComTeorico.reduce(
    (acc, item) => acc + (item.custoDireto > 0 ? item.custoDireto : 0),
    0
  );

  const baseRateio = totalDirect;
  const itemsComCif = itemsComTeorico.map((item) => {
    let peso = 0;
    if (baseRateio > 0 && item.custoDireto > 0) {
      peso = item.custoDireto / baseRateio;
    }
    const cifRateado = peso * cifTotal;
    return {
      ...item,
      peso,
      cifRateado,
    };
  });

  const somaCifDistribuido = itemsComCif.reduce((acc, item) => acc + item.cifRateado, 0);
  let ajuste = cifTotal - somaCifDistribuido;

  if (Math.abs(ajuste) > 0.01 && itemsComCif.length > 0) {
    const candidato = itemsComCif.reduce((prev, curr) => {
      if (!prev) return curr;
      if (curr.cifRateado > prev.cifRateado) return curr;
      return prev;
    }, null);
    if (candidato) {
      candidato.cifRateado += ajuste;
      ajuste = 0;
    }
  }

  const itemsFinal = itemsComCif.map((item) => {
    const cifRateado = Number.isFinite(item.cifRateado) ? item.cifRateado : 0;
    const custoTotal = item.custoDireto + cifRateado;
    const margem = item.receita > 0 ? ((item.receita - custoTotal) / item.receita) * 100 : 0;
    const markup = custoTotal > 0 ? ((item.receita - custoTotal) / custoTotal) * 100 : 0;
    return {
      ...item,
      cifRateado,
      custo: custoTotal,
      margem,
      markup,
      receita: item.receita,
    };
  });

  const counts = {
    ATUAL: 0,
    FALLBACK_ANO_PASSADO: 0,
    TEORICO_PROXY: 0,
    SEM_CUSTO: 0,
  };
  itemsFinal.forEach((item) => {
    counts[item.fonteDireto] = (counts[item.fonteDireto] || 0) + 1;
  });

  const directSum = itemsComTeorico.reduce(
    (acc, item) => acc + (item.custoDireto > 0 ? item.custoDireto : 0),
    0
  );
  const somaCustoTotal = itemsFinal.reduce((acc, item) => acc + item.custo, 0);
  const diffTotal = somaCustoTotal - (directSum + cifTotal);

  const randomSkuSample = itemsFinal
    .filter((item) => item.receita > 0)
    .sort(() => 0.5 - Math.random())
    .slice(0, 10)
    .map((item) => ({
      sku_raw: item.skuRaw || item.codigo,
      sku_norm: item.skuNormalized || item.codigo,
      qtd: item.quantidade,
      receita_total: item.receita,
      custo_total: item.custo,
      custo_direto_final: item.custoDireto,
      cif_rateado: item.cifRateado,
      custo_unitario: item.quantidade > 0 ? item.custo / item.quantidade : 0,
    }));

  const zeroCostSkus = itemsFinal
    .filter((item) => item.receita > 0 && item.custo === 0)
    .slice(0, 20)
    .map((item) => ({
      sku_raw: item.skuRaw || item.codigo,
      sku_norm: item.skuNormalized || item.codigo,
      qtd: item.quantidade,
      receita: item.receita,
      direto_atual_valor: item.custoDiretoAtualValor || 0,
      direto_passado_valor: item.custoDiretoPrevValor || 0,
      direto_final: item.custoDireto,
      fonte: item.fonteDireto,
      sumDirectMes: directSum,
      cif_total_mes: cifTotal,
      cif_rateado: item.cifRateado,
      custo_total: item.custo,
    }));
  if (zeroCostSkus.length) {
    console.table(zeroCostSkus);
  }

  const worstCases = itemsFinal
    .filter((item) => item.receita > 0 && item.custo > 0 && item.custo < item.receita * 0.01)
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 20)
    .map((item) => ({
      sku_raw: item.skuRaw || item.codigo,
      sku_norm: item.skuNormalized || item.codigo,
      periodo: currentPeriodKey || 'sem periodo',
      qtd: item.quantidade,
      receita: item.receita,
      direto_atual_valor: item.custoDiretoAtualValor || 0,
      direto_passado_valor: item.custoDiretoPrevValor || 0,
      direto_final: item.custoDireto,
      fonte: item.fonteDireto,
      sumDirectMes: directSum,
      cif_total_mes: cifTotal,
      cif_rateado: item.cifRateado,
      custo_total: item.custo,
    }));
  if (worstCases.length) {
    console.table(worstCases);
  }

  const totalCustoEstimado = itemsFinal.reduce((acc, item) => acc + item.custo, 0);

  const itensComReceita = itemsFinal.filter((item) => item.receita > 0);
  const topItens = itensComReceita
    .sort((a, b) => (b.receita - b.custo) - (a.receita - a.custo))
    .slice(0, 3);

  const semCustoTop = itemsFinal
    .filter((item) => item.fonteDireto === 'SEM_CUSTO')
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 20)
    .map((item) => ({
      codigo: item.codigo || item.skuNormalized,
      descricao: item.descricao,
      receita: item.receita,
    }));

  const resumoAlocacao = itemsFinal.reduce((acc, item) => acc + item.cifRateado, 0);

  console.info('Custos SKU rateio:', {
    periodo: periodoAtual || 'sem periodo',
    periodoNormalized: currentPeriodKey,
    cifTotal: formatarMoedaLog(cifTotal),
    periodoCifUtilizado: periodForCif || 'sem periodo',
    cifFonte,
    baseRateioMes: baseRateio,
    somaCustoTotal,
    sumDirectMes: directSum,
    cifRateadoTotal: resumoAlocacao,
    diffTotal,
    counts,
    semCustoTop,
  });

  console.info('Custos SKU random sample:', randomSkuSample);

  return {
    total: totalCustoEstimado,
    itens: itemsFinal,
    topItens,
    summary: {
      periodo: currentPeriodKey || periodoAtual || 'sem periodo',
      periodoCif: periodForCif,
      cifTotal,
      cifFonte,
      baseRateioMes: baseRateio,
      totalDirect,
      counts,
      alocado: resumoAlocacao,
      diferenca: cifTotal - resumoAlocacao,
      semCustoTop,
      zeroCostSkus,
    },
  };
};
