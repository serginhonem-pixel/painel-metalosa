---
description: "Explica o funcionamento do módulo de Rastreabilidade INMETRO e serve de contexto para trabalhar nele"
name: "Rastreabilidade INMETRO"
agent: "agent"
---

# Módulo de Rastreabilidade INMETRO — Painel Industrial

## Visão Geral

O módulo de Rastreabilidade está em `src/components/Rastreabilidade.jsx` e é acessado pela aba "Rastreabilidade" no menu principal (`App.jsx`). É protegido por senha (`escada`).

Objetivo: permitir rastrear **de qual lote de matéria-prima** cada escada produzida foi fabricada, incluindo DANFE, certificado de qualidade e fornecedor — conforme exigência do INMETRO.

---

## Estrutura de Dados

### Firestore — Coleção `rastreabilidade_lotes`

Dois tipos de lote convivem na mesma coleção, diferenciados pelo campo `tipo`.

**Lote de MP** (`tipo: 'MP'`):
```
mp              → chave ex: 'TUBO (11307)'
mpCodigo        → código ex: '11307'
danfe           → número da nota fiscal
nroLoteFornecedor
certificadoQualidade
fornecedor
qtdRecebida / qtdAprovada / qtdReprovada
pesoBrutoKg / pesoLiquidoKg / percPerda
qtdDisponivel   → saldo atual (decrementado por cada ordem)
dataEntrada
ativo
```

**Lote Comprado** (`tipo: 'COMPRADO'`):
```
nomeComp        → ex: 'REBITE R-512A'
codigo          → ex: '11303'
danfe / nroLoteFornecedor / certificadoQualidade / fornecedor
qtdRecebida / qtdAprovada / qtdReprovada
qtdDisponivel
dataEntrada
ativo
```

### Firestore — Coleção `rastreabilidade_ordens`

```
nroOP / nroSerie / dataProd
componentesFabricados: [{
  componente, codigoComp, mp, mpCodigo,
  loteId, nroLoteFornecedor, danfe, certificadoQualidade,
  fornecedor, dataEntrada, qtdConsumida
}]
componentesComprados: [{
  componente, tipo:'COMPRADO', loteId,
  nroLoteFornecedor, danfe, certificadoQualidade,
  fornecedor, dataEntrada, qtdConsumida
}]
ativo
```

---

## BOM (Bill of Materials)

Arquivo: `src/data/bomescada.json`

Contém 5 modelos de escada (códigos 00185–00189, de 3 a 7 degraus). Cada modelo lista os componentes de nível 2:
- **tipo `PI`** → componente fabricado internamente (ex: montante, degrau, patamar)
- **tipo `MP`** → componente comprado direto (ex: rebite, arruela, cinta de segurança)

### Mapeamentos em Rastreabilidade.jsx

`CODIGO_PARA_MP`: código do PI (ex: `'81712'`) → chave de MP do estoque (ex: `'CHAPA 1,20 (81730)'`)

`CODIGO_PARA_COMPRADO`: código do MP comprado (ex: `'11303'`) → nome exibido (ex: `'REBITE R-512A'`)

`MP_CODIGO`: chave de MP → `{ label, codigo }` para exibição e armazenamento

Códigos de MP controlados:
| Código | Material |
|--------|----------|
| 11307  | TUBO RED 1"x1,20 |
| 81730  | CHAPA 1,20 (Patamar/Degrau/Dobradiça) |
| 81731  | CHAPA 1,40 (Articulador) |
| 11308  | ARAME GALV 5,15MM |
| 11300  | BARRA CHATA 3/8"x1/8" |

Códigos de comprados controlados:
| Código | Componente |
|--------|------------|
| 11302  | ARRUELA LISA 3/16" |
| 11303  | REBITE R-512A |
| 11304  | REBITE R-519A |
| 11305  | REBITE R-612 |
| 11306  | CINTA DE SEGURANÇA |

---

## Abas do Módulo

### 1. Estoque (`EstoqueAtual`)
Abre por padrão. Mostra saldo atual de todos os lotes ativos agrupados por material. Cores: verde = OK, âmbar = baixo, vermelho = zerado.

### 2. Entrada de Lotes (`EntradaLoteMP` + `EntradaLoteComprado`)
Dois formulários na mesma aba:
- **MP**: registra lotes de matéria-prima bruta com métricas de produção (peso bruto/líquido, % perda, qtd aprovada/reprovada)
- **Comprados**: registra lotes de componentes comprados (rebites, arruelas, cinta)

### 3. Ordem de Produção (`OrdemProducao`)
Fluxo BOM-driven:
1. Usuário seleciona o **modelo** da escada (00185–00189)
2. `buildCompsFromBom(modelo)` popula automaticamente os arrays `compFab` e `comprado` com as quantidades do BOM
3. Usuário seleciona qual **lote** usar para cada componente
4. Ao salvar: `writeBatch` cria a ordem E decrementa `qtdDisponivel` nos lotes via `increment(-qtdConsumida)` (atômico)
5. Após salvar, lotes são limpos mas o modelo permanece selecionado

### 4. Rastreabilidade (`ConsultarEscada`)
Busca por Nº de Série ou Nº da OP. Exibe a ficha completa com DANFE e certificado de cada componente. Botão **Estornar Ordem** com confirmação: reverte os decrementos (`increment(+qtdConsumida)`) e marca a ordem como `ativo: false`.

### 5. Exportar INMETRO (`ExportarInmetro`)
Filtro por período + seleção por checkbox. Exporta Excel com colunas: OP, Nº Série, Data Produção, Tipo, Componente, MP, Cod MP, DANFE, Cert Qualidade, Lote Fornecedor, Fornecedor, Data Entrada, Qtd Consumida.

---

## Dados Reais

O arquivo `src/data/escada.json` contém histórico de lotes reais (2024) com DANFEs, fornecedores (DOX/CSN/USIMINAS/MACCAFERRI/ARCELOR) e certificados. O botão **"Importar escada.json"** (azul) no header do módulo popula o Firestore com esses dados via `seedFromEscadaJson()`.

O botão **"Dados de teste"** (cinza) insere mocks genéricos via `seedMocks()`.

---

## Regras de Negócio Importantes

- Hooks sempre chamados antes de qualquer `return` condicional (regra do React — erro #310 caso violado)
- `useEffect` para Firestore só roda quando `autenticado === true` (dependência `[autenticado]`)
- Saldo nunca vai negativo por validação antes do `batch.commit()`
- Ordens estornadas ficam no Firestore com `ativo: false` (não são deletadas)
- O BOM do modelo 3 degraus (00185) **não** tem `REFORCO MONT. FRONTAL (81721)` — só aparece a partir de 5 degraus
