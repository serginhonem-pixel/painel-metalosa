import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from 'recharts';
import {
  ShoppingCart, Package, BarChart3, LayoutList,
  CheckCircle2, XCircle, AlertTriangle, Download,
  Layers, ChevronRight, History, TrendingUp,
  Lock, Cloud, CloudOff, RefreshCw,
} from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import BOM_DATA from '../data/bom-carrinhos.json';
import BOM_CACAMBAS from '../data/bom-cacambas.json';
import BOM_METALFORTE from '../data/bom-metalforte.json';
import BOM_FAMILIAS from '../data/bom-familias.json';

// Catálogo de BOMs disponíveis
const BOM_CATALOGO = {
  familias:   { label: 'Por Família',        cor: 'amber',   data: BOM_FAMILIAS   },
  carrinhos:  { label: 'Carrinhos de Carga', cor: 'indigo',  data: BOM_DATA       },
  cacambas:   { label: 'Caçambas',           cor: 'sky',     data: BOM_CACAMBAS   },
  metalforte: { label: 'Metalforte',         cor: 'violet',  data: BOM_METALFORTE },
};

// ─── Constantes ────────────────────────────────────────────────────────────────
const DEFAULT_MESES = [
  { id: 'abr26', label: 'Abr/26' },
  { id: 'mai26', label: 'Mai/26' },
  { id: 'jun26', label: 'Jun/26' },
];

const MESES_OPCOES = (() => {
  const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const opts = [];
  for (let ano = 25; ano <= 28; ano++) {
    nomes.forEach((m, i) => opts.push({ id: `${m}${ano}`, label: `${labels[i]}/${ano}` }));
  }
  return opts;
})();

const FAMILIAS = [
  { id: 'SUPER',      nome: 'Super',       grupo: 'Premium' },
  { id: 'PLUS',       nome: 'Plus',        grupo: 'Premium' },
  { id: 'MASTER',     nome: 'Master',      grupo: 'Premium' },
  { id: 'METALFORTE', nome: 'Metalforte',  grupo: 'Premium' },
  { id: 'POP',        nome: 'POP',         grupo: 'Standard' },
  { id: 'BEG',        nome: 'Beginner',    grupo: 'Standard' },
  { id: '50',         nome: '5.0',         grupo: 'Standard' },
  { id: 'CONSTR',     nome: 'Construtor',  grupo: 'Standard' },
  { id: 'MINI',       nome: 'Mini',        grupo: 'Standard' },
  { id: 'CC',         nome: 'CC',          grupo: 'CC' },
  { id: 'BEG2',       nome: 'POP BF Verm.',  grupo: 'Standard' },
  { id: 'GCONSTR',    nome: 'Constr. Galv.', grupo: 'Standard' },
];

// Plano de produção inicial — Abr/26 usa base do CSV março como referência
// Total CSV março = 81.092 peças (referência de escala)
const TOTAL_PLANO_REF = 81092;

const PLANO_INICIAL = {
  MASTER:     { abr:  528,  mai:  528,  jun:  528 },
  SUPER:      { abr: 2970,  mai: 2970,  jun: 2970 },
  PLUS:       { abr: 3168,  mai: 3168,  jun: 3168 },
  POP:        { abr: 3960,  mai: 3960,  jun: 3960 },
  BEG2:       { abr:  271,  mai:  271,  jun:  271 },
  BEG:        { abr: 14586, mai: 14586, jun: 14586 },
  '50':       { abr: 2310,  mai: 2310,  jun: 2310 },
  CONSTR:     { abr: 4422,  mai: 4422,  jun: 4422 },
  MINI:       { abr: 2904,  mai: 2904,  jun: 2904 },
  GCONSTR:    { abr: 28644, mai: 28644, jun: 28644 },
  // CC e METALFORTE vêm do PMP da aba Histórico
  METALFORTE: { abr: 15000, mai: 15000, jun: 15000 },
  CC:         { abr: 10000, mai: 10000, jun: 10000 },
};

// Famílias do simulador (caçambas) — CC e Metalforte têm PMP próprio
const FAMILIAS_SIM = [
  { id: 'MASTER',  nome: 'Master',           desc: 'Caçamba Master 0,75',              cart: 431   },
  { id: 'SUPER',   nome: 'Super',            desc: 'Caçamba Super 0,60 BF',            cart: 2994  },
  { id: 'PLUS',    nome: 'Plus',             desc: 'Caçamba Plus 0,75',                cart: 1667  },
  { id: 'POP',     nome: 'POP BF Cinza',     desc: 'Caçamba POP 0,40 BF Cinza',       cart: 1380  },
  { id: 'BEG2',    nome: 'POP BF Verm.',     desc: 'Caçamba POP 0,40 BF Verm.',       cart: 70    },
  { id: 'BEG',     nome: 'POP Galv.',        desc: 'Caçamba POP (GALV.)',              cart: 5306  },
  { id: '50',      nome: 'POP 5.0',          desc: 'Caçamba POP 5.0',                 cart: 2600  },
  { id: 'CONSTR',  nome: 'Constr. BF Cinza', desc: 'Caçamba Constr. 0,40 BF Cinza',   cart: 1616  },
  { id: 'MINI',    nome: 'Constr. BF Verm.', desc: 'Caçamba Constr. 0,40 BF Verm.',   cart: 608   },
  { id: 'GCONSTR', nome: 'Constr. Galv.',    desc: 'Caçamba Constr. Galv. 0,40',      cart: 14339 },
];

/**
 * Componentes reais do base.csv
 *
 * Campos-chave:
 *   tipo      : 'BF' | 'BZ' | '—' (sem chapa — itens comprados prontos)
 *   espessura : mm (0 para itens sem chapa)
 *   peso_kg   : peso unitário da peça em kg
 *   demanda_mar: demanda programada em peças para março (do CSV)
 *   estoque_atual: peças prontas em estoque
 *   total_disponivel: estoque_atual + chapas/bobinas + em_estampagem + sem_pintar
 *   demanda_liq_mar: demanda líquida de março do CSV (referência real)
 *   status_csv: status original do CSV
 */
const COMPONENTES_BASE = [
  // ── Varais ──
  { id:  1, nome: 'Varal # 0,90 BF',           familia: 'Varal CC',   tipo: 'BF', espessura: 0.90, peso_kg:  2.00,
    demanda_mar:  2800,  estoque_atual:     0, total_disponivel:  4250, demanda_liq_mar: -1450, status_csv: 'OK'      },
  { id:  2, nome: 'Varal # 1,10 BF',           familia: 'Varal CC',   tipo: 'BF', espessura: 1.10, peso_kg:  2.16,
    demanda_mar:  3500,  estoque_atual:     0, total_disponivel:  4000, demanda_liq_mar:  -500, status_csv: 'OK'      },
  { id:  3, nome: 'Varal # 1,40 BF',           familia: 'Varal CC',   tipo: 'BF', espessura: 1.40, peso_kg:  3.24,
    demanda_mar:  3700,  estoque_atual:     0, total_disponivel:  1000, demanda_liq_mar:  2700, status_csv: 'COMPRAR' },
  { id:  4, nome: 'Varal 0,75-0,90 BZ',        familia: 'Varal',      tipo: 'BZ', espessura: 0.75, peso_kg:  1.87,
    demanda_mar: 59426,  estoque_atual:  8050, total_disponivel: 39446, demanda_liq_mar: 19980, status_csv: 'COMPRAR' },
  { id:  5, nome: 'Varal # 1,10 BZ',           familia: 'Varal',      tipo: 'BZ', espessura: 1.10, peso_kg:  2.60,
    demanda_mar: 21666,  estoque_atual:   793, total_disponivel:  9328, demanda_liq_mar: 12338, status_csv: 'COMPRAR' },
  // ── Suportes ──
  { id:  6, nome: 'Suporte # 0,90',            familia: 'Suporte',    tipo: 'BZ', espessura: 0.90, peso_kg:  0.07,
    demanda_mar:118853,  estoque_atual: 34886, total_disponivel: 90357, demanda_liq_mar: 28496, status_csv: 'COMPRAR' },
  { id:  7, nome: 'Suporte # 1,10',            familia: 'Suporte',    tipo: 'BZ', espessura: 1.10, peso_kg:  0.10,
    demanda_mar: 43332,  estoque_atual: 38052, total_disponivel: 68986, demanda_liq_mar:-25654, status_csv: 'OK'      },
  // ── Rodas / Eixo ──
  { id:  8, nome: 'Eixo (BF 0,9)',             familia: 'Rodas',      tipo: 'BF', espessura: 0.90, peso_kg:  0.15,
    demanda_mar: 85050,  estoque_atual: 14046, total_disponivel:103712, demanda_liq_mar:-18662, status_csv: 'OK'      },
  { id:  9, nome: 'Mancal # 1,50',             familia: 'Rodas',      tipo: 'BZ', espessura: 1.50, peso_kg:  0.15,
    demanda_mar: 81092,  estoque_atual: 36592, total_disponivel:204874, demanda_liq_mar:-123782,status_csv: 'OK'      },
  { id: 10, nome: 'Rodas c/camara',            familia: 'Rodas',      tipo: '—',  espessura: 0,    peso_kg:  0.604,
    demanda_mar:110000,  estoque_atual:     0, total_disponivel:     0, demanda_liq_mar:110000, status_csv: 'COMPRAR' },
  { id: 11, nome: 'Rodas macicas',             familia: 'Rodas',      tipo: '—',  espessura: 0,    peso_kg:  0,
    demanda_mar: 14000,  estoque_atual:     0, total_disponivel:     0, demanda_liq_mar: 14000, status_csv: 'VERIFICAR'},
  { id: 12, nome: 'AROS',                      familia: 'Rodas',      tipo: '—',  espessura: 0,    peso_kg:  0,
    demanda_mar:124000,  estoque_atual:     0, total_disponivel:     0, demanda_liq_mar:     0, status_csv: 'VERIFICAR'},
  // ── Pés ──
  { id: 13, nome: 'Travessão do Pé # 0,90',    familia: 'Pé',         tipo: 'BZ', espessura: 0.90, peso_kg:  0.16,
    demanda_mar: 59426,  estoque_atual: 38353, total_disponivel: 69116, demanda_liq_mar: -9690, status_csv: 'OK'      },
  { id: 14, nome: 'Pé # 1,10',                 familia: 'Pé',         tipo: 'BZ', espessura: 1.10, peso_kg:  0.65,
    demanda_mar: 59426,  estoque_atual: 18758, total_disponivel: 32512, demanda_liq_mar: 26914, status_csv: 'COMPRAR' },
  { id: 15, nome: 'Travessão do Pé # 1,10',    familia: 'Pé',         tipo: 'BZ', espessura: 1.10, peso_kg:  0.25,
    demanda_mar: 21666,  estoque_atual: 13482, total_disponivel: 73498, demanda_liq_mar:-51832, status_csv: 'OK'      },
  { id: 16, nome: 'Pé # 1,50',                 familia: 'Pé',         tipo: 'BZ', espessura: 1.50, peso_kg:  0.86,
    demanda_mar: 21666,  estoque_atual:  4705, total_disponivel: 10995, demanda_liq_mar: 10671, status_csv: 'COMPRAR' },
  // ── Metalforte ──
  { id: 17, nome: 'Caç. Metalf. M20 0,75',     familia: 'Metalforte', tipo: 'BF', espessura: 0.75, peso_kg:  5.68,
    demanda_mar: 10000,  estoque_atual:    70, total_disponivel:  8004, demanda_liq_mar:  1996, status_csv: 'COMPRAR' },
  { id: 18, nome: 'Caç. Metalf. M18 1,10',     familia: 'Metalforte', tipo: 'BF', espessura: 1.10, peso_kg:  8.33,
    demanda_mar:  2000,  estoque_atual:     5, total_disponivel:  1705, demanda_liq_mar:   295, status_csv: 'COMPRAR' },
  { id: 19, nome: 'Caç. Metalf. M16 1,40',     familia: 'Metalforte', tipo: 'BF', espessura: 1.40, peso_kg: 10.603,
    demanda_mar:  3000,  estoque_atual:    31, total_disponivel:  1743, demanda_liq_mar:  1257, status_csv: 'COMPRAR' },
  // ── Caçambas ──
  { id: 20, nome: 'Caçamba POP 0,40 BF (Cinza)',    familia: 'Caçamba', tipo: 'BF', espessura: 0.40, peso_kg: 2.384,
    demanda_mar:  3960,  estoque_atual:    41, total_disponivel:  7405, demanda_liq_mar: -3445, status_csv: 'OK'      },
  { id: 21, nome: 'Caçamba POP 0,40 BF (Verm.)',    familia: 'Caçamba', tipo: 'BF', espessura: 0.40, peso_kg: 2.384,
    demanda_mar:   271,  estoque_atual:     1, total_disponivel:     1, demanda_liq_mar:   270, status_csv: 'COMPRAR' },
  { id: 22, nome: 'Caçamba Constr. 0,40 BF (Verm.)',familia: 'Caçamba', tipo: 'BF', espessura: 0.40, peso_kg: 2.364,
    demanda_mar:  2904,  estoque_atual:     0, total_disponivel:     0, demanda_liq_mar:  2904, status_csv: 'COMPRAR' },
  { id: 23, nome: 'Caçamba Constr. 0,40 BF (Cinza)',familia: 'Caçamba', tipo: 'BF', espessura: 0.40, peso_kg: 2.364,
    demanda_mar:  4422,  estoque_atual:  3912, total_disponivel: 14692, demanda_liq_mar:-10270, status_csv: 'OK'      },
  { id: 24, nome: 'Caçamba POP (GALV.)',         familia: 'Caçamba', tipo: 'BZ', espessura: 0.40, peso_kg: 2.384,
    demanda_mar: 14586,  estoque_atual: 20750, total_disponivel: 27248, demanda_liq_mar:-12662, status_csv: 'OK'      },
  { id: 25, nome: 'Caçamba Constr. Galv. 0,40',  familia: 'Caçamba', tipo: 'BZ', espessura: 0.40, peso_kg: 2.364,
    demanda_mar: 28644,  estoque_atual:  2716, total_disponivel:  6399, demanda_liq_mar: 22245, status_csv: 'COMPRAR' },
  { id: 26, nome: 'Caçamba POP 5.0',             familia: 'Caçamba', tipo: 'BF', espessura: 0.50, peso_kg: 3.204,
    demanda_mar:  2310,  estoque_atual:   955, total_disponivel:  8636, demanda_liq_mar: -6326, status_csv: 'OK'      },
  { id: 27, nome: 'Reforço # 0,50 BZ',           familia: 'Caçamba', tipo: 'BZ', espessura: 0.50, peso_kg: 0.05,
    demanda_mar: 81092,  estoque_atual: 30879, total_disponivel:173619, demanda_liq_mar:-92527, status_csv: 'OK'      },
  { id: 28, nome: 'Caçamba Super 0,60 BF',        familia: 'Caçamba', tipo: 'BF', espessura: 0.60, peso_kg: 4.076,
    demanda_mar:  2970,  estoque_atual:     1, total_disponivel:  3278, demanda_liq_mar:  -308, status_csv: 'OK'      },
  { id: 29, nome: 'Caçamba Plus 0,75',            familia: 'Caçamba', tipo: 'BF', espessura: 0.75, peso_kg: 5.056,
    demanda_mar:  3168,  estoque_atual:   357, total_disponivel:  1899, demanda_liq_mar:  1269, status_csv: 'COMPRAR' },
  { id: 30, nome: 'Caçamba Master 0,75',          familia: 'Caçamba', tipo: 'BF', espessura: 0.75, peso_kg: 5.848,
    demanda_mar:   528,  estoque_atual:     7, total_disponivel:   626, demanda_liq_mar:   -98, status_csv: 'OK'      },
];

// ─── Dados históricos ─────────────────────────────────────────────────────────
const HIST_CARRO = {
  produtos: [
    { cod: '00174', desc: 'C.C. 180 Kg Câmara 3,00 – 18A',    tipo: '18A', cart: 720,  m12: 1225, m06: 1168, m03: 1372, fev26: 1102, mar26: 1678, prog: 1000, dia: 50,  semana: 250, sold: 1    },
    { cod: '00175', desc: 'C.C. 180 Kg Pneu Maciço 18A',       tipo: '18A', cart: 28,   m12: 169,  m06: 148,  m03: 163,  fev26: 201,  mar26: 179,  prog: null, dia: null, semana: null, sold: null },
    { cod: '00770', desc: 'C.C. 150 Kg Câmara 3,00 – 15A',    tipo: '15A', cart: 1368, m12: 1612, m06: 1534, m03: 1050, fev26: 602,  mar26: 1718, prog: 2800, dia: 140, semana: 700, sold: 2    },
    { cod: '00771', desc: 'C.C. 150 Kg Pneu Maciço – 15A',    tipo: '15A', cart: 904,  m12: 1131, m06: 1416, m03: 1149, fev26: 1270, mar26: 729,  prog: null, dia: null, semana: null, sold: null },
    { cod: '00774', desc: 'C.C. 200 Kg Câmara 3,00 – 20A',    tipo: '20A', cart: 1488, m12: 906,  m06: 868,  m03: 1084, fev26: 854,  mar26: 1041, prog: 2000, dia: 100, semana: 500, sold: 1    },
    { cod: '00775', desc: 'C.C. 200 Kg Pneu Maciço – 20A',    tipo: '20A', cart: 4,    m12: 27,   m06: 35,   m03: 41,   fev26: 91,   mar26: 26,   prog: null, dia: null, semana: null, sold: null },
    { cod: '00778', desc: 'C.C. 250 Kg Câmara 3,00x8 – 25A',  tipo: '25A', cart: 125,  m12: 445,  m06: 342,  m03: 236,  fev26: 310,  mar26: 253,  prog: 500,  dia: 25,  semana: 125, sold: 1    },
    { cod: '00779', desc: 'C.C. 250 Kg Pneu Maciço – 25A',    tipo: '25A', cart: 0,    m12: 0,    m06: 0,    m03: 0,    fev26: 0,    mar26: 0,    prog: null, dia: null, semana: null, sold: null },
    { cod: '00780', desc: 'C.C. 300 Kg Câmara 3,00 – 30A',    tipo: '30A', cart: 124,  m12: 151,  m06: 124,  m03: 133,  fev26: 159,  mar26: 125,  prog: 200,  dia: 10,  semana: 50,  sold: null },
    { cod: '00781', desc: 'C.C. 300 Kg Pneu Maciço – 30A',    tipo: '30A', cart: 0,    m12: 0,    m06: 0,    m03: 0,    fev26: 0,    mar26: 0,    prog: null, dia: null, semana: null, sold: null },
    { cod: '00782', desc: 'C.C. 350 Kg Câmara 3,00 – 35A',    tipo: '35A', cart: 3658, m12: 1785, m06: 1944, m03: 2314, fev26: 2634, mar26: 2312, prog: 3500, dia: 175, semana: 875, sold: 5    },
    { cod: '00783', desc: 'C.C. 350 Kg Pneu Maciço – 35A',    tipo: '35A', cart: 0,    m12: 0,    m06: 0,    m03: 0,    fev26: 8,    mar26: 0,    prog: null, dia: null, semana: null, sold: null },
  ],
  total: { cart: 8419, m12: 7451, m06: 7579, m03: 7542, fev26: 7231, mar26: 8061, prog: 10000 },
};

const HIST_METALFORTE = {
  produtos: [
    { desc: 'CAR. METALF. M16 # 1,40 – AZUL (s/ roda)',           tipo: 'M16', cart: 0,    m12: 0,    m6: 0,    m3: 0,    v12: 0,      v6: 0,     v3: 0,     fat2m: 0,    pmp: null,  dia: null, sem: null },
    { desc: 'CAR. METALF. M18 # 1,10 – AZUL (s/ roda)',           tipo: 'M18', cart: 0,    m12: 0,    m6: 0,    m3: 0,    v12: 0,      v6: 0,     v3: 0,     fat2m: 0,    pmp: null,  dia: null, sem: null },
    { desc: 'CAR. METALF. M20 # 0,75 – AZUL (s/ roda)',           tipo: 'M20', cart: 0,    m12: 3.5,  m6: 7.8,  m3: 0,    v12: 39,     v6: 39,    v3: 0,     fat2m: 0,    pmp: null,  dia: null, sem: null },
    { desc: 'Car. METALF. M 16 # 1,40 c/ Roda CÂM. 3,00',        tipo: 'M16', cart: 2773, m12: 2848, m6: 2999, m3: 3317, v12: 34181,  v6: 17994, v3: 9951,  fat2m: 3383, pmp: 3000,  dia: 150,  sem: 750  },
    { desc: 'Car. METALF. M 18 # 1,10 c/ Roda CÂM. 3,00',        tipo: 'M18', cart: 1842, m12: 1085, m6: 1110, m3: 1101, v12: 13018,  v6: 6661,  v3: 3302,  fat2m: 1089, pmp: 2000,  dia: 100,  sem: 500  },
    { desc: 'Car. METALF. M 20 # 0,75 c/ Roda CÂM. 3,00',        tipo: 'M20', cart: 6914, m12: 8301, m6: 8552, m3: 8750, v12: 99608,  v6: 51313, v3: 26251, fat2m: 9389, pmp: 10000, dia: 500,  sem: 2500 },
  ],
  total: { cart: 11529, m12: 12237, m6: 12668, m3: 13168, v12: 146846, v6: 76007, v3: 39504, fat2m: 13861, pmp: 15000, dia: 750, sem: 3750 },
};

// ─── Lógica MRP ────────────────────────────────────────────────────────────────
/**
 * Recalcula o MRP para Abr + Mai + Jun (mês atual + 2 futuros).
 *
 * Para cada mês: programado = demanda_mar_CSV × (totalPlano[mês] / TOTAL_PLANO_REF)
 * Primeiro mês (Abr): abate o estoque disponível do CSV.
 * Meses seguintes: aplica carryover (sobra de estoque anterior).
 */
function calcMRP(plano, componentes, meses) {
  const totalPlano = {};
  meses.forEach(({ id }) => {
    totalPlano[id] = FAMILIAS.reduce((s, f) => s + (plano[f.id]?.[id] || 0), 0);
  });

  return componentes.map((comp) => {
    let carryover = 0;
    const resultado = {};

    meses.forEach(({ id }, idx) => {
      // Escala a demanda de referência (março) proporcionalmente ao plano do mês
      const escala = TOTAL_PLANO_REF > 0 ? totalPlano[id] / TOTAL_PLANO_REF : 1;
      const programado = Math.round(comp.demanda_mar * escala);

      const demanda_ajustada = programado + carryover;

      let demanda_liquida;
      if (idx === 0) {
        // Primeiro mês: abate o estoque disponível atual (do CSV)
        demanda_liquida = programado - comp.total_disponivel;
      } else {
        // Meses seguintes: usa demanda ajustada com carryover
        demanda_liquida = demanda_ajustada;
      }

      resultado[id] = {
        programado,
        demanda_ajustada,
        demanda_liquida,
        demanda_kg: Math.max(0, demanda_liquida) * comp.peso_kg,
      };

      carryover = Math.min(0, demanda_liquida);
    });

    // Status recalculado com base na demanda líquida do primeiro mês
    const liqAbr = resultado[meses[0].id]?.demanda_liquida ?? 0;
    const status = comp.status_csv === 'VERIFICAR'
      ? 'VERIFICAR'
      : liqAbr > 0 ? 'COMPRAR' : 'OK';

    return { ...comp, resultado, status };
  });
}

function calcListaCompra(mrpResult, meses) {
  const mapa = {};
  mrpResult.forEach((comp) => {
    meses.forEach(({ id }) => {
      const { demanda_liquida, demanda_kg } = comp.resultado[id];
      if (demanda_liquida > 0) {
        const key = `${comp.tipo}|${comp.espessura}|${id}`;
        if (!mapa[key]) {
          mapa[key] = {
            tipo: comp.tipo,
            espessura: comp.espessura,
            mes: id,
            kg: 0,
            pecas: 0,
            componentes: [],
          };
        }
        mapa[key].kg += demanda_kg;
        mapa[key].pecas += demanda_liquida;
        mapa[key].componentes.push(comp.nome);
      }
    });
  });
  return Object.values(mapa).sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
    if (a.espessura !== b.espessura) return a.espessura - b.espessura;
    return (
      meses.findIndex((m) => m.id === a.mes) -
      meses.findIndex((m) => m.id === b.mes)
    );
  });
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────────
const fmtNum = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    : '—';

const fmtKg = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg'
    : '—';

function StatusBadge({ status }) {
  if (status === 'COMPRAR')
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-300">
        <XCircle size={10} /> COMPRAR
      </span>
    );
  if (status === 'VERIFICAR')
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
        <AlertTriangle size={10} /> VERIFICAR
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
      <CheckCircle2 size={10} /> OK
    </span>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────
const MRP_DOC = doc(db, 'mrp-aco', 'plano');
const BOM_DOC = doc(db, 'mrp-aco', 'bom');
const SENHA_CORRETA = 'planejamento';

export default function MrpAco() {
  // ── Portão de acesso ─────────────────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('mrp-unlocked') === '1');
  const [senhaInput, setSenhaInput] = useState('');
  const [senhaErro, setSenhaErro] = useState(false);

  // ── Sync Firebase ────────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle'|'loading'|'saving'|'saved'|'error'
  const isLoadingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const [subAba, setSubAba] = useState('dashboard');
  const [bomCategoria, setBomCategoria] = useState('carrinhos');
  const [bomOverrides, setBomOverrides] = useState({});
  const [bomEditMode, setBomEditMode] = useState(false);
  const [bomDraft, setBomDraft] = useState(null);
  const [bomProdIdx, setBomProdIdx] = useState(0);
  const [plano, setPlano] = useState(
    () => JSON.parse(JSON.stringify(PLANO_INICIAL))
  );
  const [componentes] = useState(COMPONENTES_BASE);

  // ── Estoque editável ─────────────────────────────────────────────────
  const [estoqueEdit, setEstoqueEdit] = useState(() =>
    Object.fromEntries(COMPONENTES_BASE.map((c) => [c.id, c.estoque_atual]))
  );

  // Componentes com estoque editado: recalcula total_disponivel proporcionalmente
  const componentesEfetivos = useMemo(() =>
    componentes.map((c) => {
      const novoEst = estoqueEdit[c.id] ?? c.estoque_atual;
      const diff = novoEst - c.estoque_atual;
      return { ...c, estoque_atual: novoEst, total_disponivel: c.total_disponivel + diff };
    }),
    [componentes, estoqueEdit]
  );

  // ── Simulador: meses configuráveis (deve ser declarado antes dos efeitos que o usam) ──
  const [mesesConfig, setMesesConfig] = useState(DEFAULT_MESES);
  const MESES = mesesConfig;

  // ── PMP editável (Histórico + Simulador por mês) ────────────────────────────
  // Formato: { idx: { mesId: qty } } — suporta quantidade diferente por mês
  const [pmpMf, setPmpMf] = useState(() =>
    Object.fromEntries(
      HIST_METALFORTE.produtos.map((p, i) => [
        i,
        Object.fromEntries(DEFAULT_MESES.map((m) => [m.id, p.pmp || 0])),
      ])
    )
  );
  const [pmpCC, setPmpCC] = useState(() =>
    Object.fromEntries(
      HIST_CARRO.produtos.map((p) => [
        p.cod,
        Object.fromEntries(DEFAULT_MESES.map((m) => [m.id, p.prog || 0])),
      ])
    )
  );

  // Expand/collapse das linhas CC e Metalforte no simulador
  const [expandCC, setExpandCC] = useState(false);
  const [expandMF, setExpandMF] = useState(false);

  // PMP → plano METALFORTE + CC (por mês, usando os ids dinâmicos do MESES)
  useEffect(() => {
    setPlano((prev) => {
      const mfByMes = Object.fromEntries(
        MESES.map(({ id }) => [
          id,
          HIST_METALFORTE.produtos.reduce((s, _, i) => s + (pmpMf[i]?.[id] || 0), 0),
        ])
      );
      const ccByMes = Object.fromEntries(
        MESES.map(({ id }) => [
          id,
          HIST_CARRO.produtos.reduce((s, p) => s + (pmpCC[p.cod]?.[id] || 0), 0),
        ])
      );
      return { ...prev, METALFORTE: mfByMes, CC: ccByMes };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmpMf, pmpCC, mesesConfig]);

  // Totais para exibição no Histórico (soma o primeiro valor de cada SKU)
  const totalPmpMf = useMemo(
    () => Object.values(pmpMf).reduce((s, monthMap) => {
      const v = typeof monthMap === 'object' ? Object.values(monthMap)[0] || 0 : monthMap || 0;
      return s + v;
    }, 0),
    [pmpMf]
  );
  const totalPmpCC = useMemo(
    () => Object.values(pmpCC).reduce((s, monthMap) => {
      const v = typeof monthMap === 'object' ? Object.values(monthMap)[0] || 0 : monthMap || 0;
      return s + v;
    }, 0),
    [pmpCC]
  );
  const [carrosDia, setCarrosDia] = useState(3300);
  const [diasUteis, setDiasUteis] = useState({ abr26: 20, mai26: 21, jun26: 21 });
  const [carteira, setCarteira] = useState(() =>
    Object.fromEntries(FAMILIAS_SIM.map((f) => [f.id, f.cart]))
  );

  // % de participação por família (editável manualmente)
  const [pctEdit, setPctEdit] = useState(() => {
    const total = FAMILIAS_SIM.reduce((s, f) => s + f.cart, 0);
    return Object.fromEntries(
      FAMILIAS_SIM.map((f) => [f.id, total > 0 ? parseFloat((f.cart / total * 100).toFixed(2)) : 0])
    );
  });

  const totalCarteira = useMemo(
    () => FAMILIAS_SIM.reduce((s, f) => s + (carteira[f.id] || 0), 0),
    [carteira]
  );

  const totalPct = useMemo(
    () => FAMILIAS_SIM.reduce((s, f) => s + (pctEdit[f.id] || 0), 0),
    [pctEdit]
  );

  const totalCarrosMes = useMemo(() => {
    const t = {};
    MESES.forEach(({ id }) => { t[id] = carrosDia * (diasUteis[id] || 0); });
    return t;
  }, [carrosDia, diasUteis]);

  // Quando carteira muda → recalcula pctEdit automaticamente
  useEffect(() => {
    if (totalCarteira === 0) return;
    setPctEdit(
      Object.fromEntries(
        FAMILIAS_SIM.map((f) => [
          f.id,
          parseFloat(((carteira[f.id] || 0) / totalCarteira * 100).toFixed(2)),
        ])
      )
    );
  }, [carteira, totalCarteira]);

  // Carros/dia + dias úteis + pctEdit → plano caçambas
  useEffect(() => {
    setPlano((prev) => {
      const next = { ...prev };
      MESES.forEach(({ id }) => {
        const totalMes = carrosDia * (diasUteis[id] || 0);
        FAMILIAS_SIM.forEach((f) => {
          const pct = (pctEdit[f.id] || 0) / 100;
          next[f.id] = { ...(next[f.id] || {}), [id]: Math.round(totalMes * pct) };
        });
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrosDia, diasUteis, pctEdit]);

  // ── Firebase: load e save ────────────────────────────────────────────────────
  async function loadFromFirestore() {
    setSyncStatus('loading');
    try {
      const [snap, bomSnap] = await Promise.all([getDoc(MRP_DOC), getDoc(BOM_DOC)]);
      if (bomSnap.exists()) {
        const { savedAt: _s, ...overrides } = bomSnap.data();
        setBomOverrides(overrides);
      }
      if (snap.exists()) {
        const d = snap.data();
        isLoadingRef.current = true;
        if (Array.isArray(d.mesesConfig) && d.mesesConfig.length === 3) setMesesConfig(d.mesesConfig);
        if (d.carrosDia   !== undefined) setCarrosDia(d.carrosDia);
        if (d.diasUteis   !== undefined) setDiasUteis(d.diasUteis);
        if (d.carteira    !== undefined) setCarteira(d.carteira);
        if (d.pctEdit     !== undefined) setPctEdit(d.pctEdit);
        if (d.estoqueEdit !== undefined) setEstoqueEdit(d.estoqueEdit);
        if (d.pmpMf !== undefined) {
          // Migra formato antigo {idx: qty} → novo {idx: {mesId: qty}}
          const mesesRef = (Array.isArray(d.mesesConfig) && d.mesesConfig.length ? d.mesesConfig : DEFAULT_MESES);
          const migMf = {};
          for (const [k, v] of Object.entries(d.pmpMf)) {
            migMf[k] = typeof v === 'number'
              ? Object.fromEntries(mesesRef.map((m) => [m.id, v]))
              : v;
          }
          setPmpMf(migMf);
        }
        if (d.pmpCC !== undefined) {
          const mesesRef = (Array.isArray(d.mesesConfig) && d.mesesConfig.length ? d.mesesConfig : DEFAULT_MESES);
          const migCC = {};
          for (const [k, v] of Object.entries(d.pmpCC)) {
            migCC[k] = typeof v === 'number'
              ? Object.fromEntries(mesesRef.map((m) => [m.id, v]))
              : v;
          }
          setPmpCC(migCC);
        }
        // aguarda um tick para os estados serem aplicados antes de limpar a flag
        setTimeout(() => { isLoadingRef.current = false; }, 100);
      } else {
        isLoadingRef.current = false;
      }
      setSyncStatus('saved');
    } catch (e) {
      console.error('MRP load error:', e);
      isLoadingRef.current = false;
      setSyncStatus('error');
    }
  }

  async function saveToFirestore(data) {
    setSyncStatus('saving');
    try {
      await setDoc(MRP_DOC, { ...data, savedAt: new Date().toISOString() });
      setSyncStatus('saved');
    } catch (e) {
      console.error('MRP save error:', e);
      setSyncStatus('error');
    }
  }

  async function saveBomToFirestore(overrides) {
    try {
      await setDoc(BOM_DOC, { ...overrides, savedAt: new Date().toISOString() });
    } catch (e) {
      console.error('BOM save error:', e);
    }
  }

  // Load ao desbloquear
  useEffect(() => {
    if (unlocked) loadFromFirestore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  // Auto-save com debounce de 1,5s
  useEffect(() => {
    if (!unlocked || isLoadingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToFirestore({ mesesConfig, carrosDia, diasUteis, carteira, pctEdit, estoqueEdit, pmpMf, pmpCC });
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesConfig, carrosDia, diasUteis, carteira, pctEdit, estoqueEdit, pmpMf, pmpCC]);

  // ── Cálculo MRP (memoizado) ──────────────────────────────────────────────────
  const mrpResult = useMemo(() => calcMRP(plano, componentesEfetivos, mesesConfig), [plano, componentesEfetivos, mesesConfig]);
  const listaCompra = useMemo(() => calcListaCompra(mrpResult, mesesConfig), [mrpResult, mesesConfig]);

  // ── Totais para o dashboard ──────────────────────────────────────────────────
  const dashKpis = useMemo(() => {
    const result = {};
    MESES.forEach(({ id }) => {
      let kgBF = 0, kgBZ = 0;
      mrpResult.forEach((c) => {
        const kg = c.resultado[id].demanda_kg;
        if (c.tipo === 'BF') kgBF += kg;
        else kgBZ += kg;
      });
      result[id] = { kgBF, kgBZ, kgTotal: kgBF + kgBZ };
    });
    return result;
  }, [mrpResult]);

  const chartDataEspessura = useMemo(() => {
    const mapa = {};
    mrpResult.forEach((c) => {
      MESES.forEach(({ id, label }) => {
        const kg = c.resultado[id].demanda_kg;
        if (kg <= 0) return;
        const key = `${c.tipo} ${c.espessura}mm`;
        if (!mapa[key]) mapa[key] = { name: key };
        mapa[key][label] = (mapa[key][label] || 0) + kg;
      });
    });
    return Object.values(mapa).sort((a, b) => a.name.localeCompare(b.name));
  }, [mrpResult]);

  const totalTotalKg = useMemo(
    () => MESES.reduce((s, { id }) => s + dashKpis[id].kgTotal, 0),
    [dashKpis]
  );

  const totalComprar = mrpResult.filter((c) => c.status === 'COMPRAR').length;
  const totalVerificar = mrpResult.filter((c) => c.status === 'VERIFICAR').length;

  // ── Totais do simulador ──────────────────────────────────────────────────────
  const totaisPlano = useMemo(() => {
    const t = {};
    MESES.forEach(({ id }) => {
      t[id] = FAMILIAS.reduce((s, f) => s + (plano[f.id]?.[id] || 0), 0);
    });
    return t;
  }, [plano]);

  // ── Pivot da lista de compra (tipo × espessura) ──────────────────────────────
  const pivotCompra = useMemo(() => {
    const mapa = {};
    listaCompra.forEach(({ tipo, espessura, mes, kg }) => {
      const key = `${tipo}|${espessura}`;
      if (!mapa[key]) mapa[key] = { tipo, espessura, totals: {} };
      mapa[key].totals[mes] = (mapa[key].totals[mes] || 0) + kg;
    });
    return Object.values(mapa).sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
      return a.espessura - b.espessura;
    });
  }, [listaCompra]);

  // ── Helpers de export ────────────────────────────────────────────────────────
  function downloadCsv(rows, filename) {
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Lista de compra consolidada (pivot tipo×espessura)
  function exportarCSV() {
    const header = ['Tipo', 'Espessura (mm)', ...MESES.map((m) => m.label + ' (kg)'), 'Total (kg)'];
    const rows = pivotCompra.map(({ tipo, espessura, totals }) => {
      const vals = MESES.map(({ id }) => (totals[id] || 0).toFixed(1));
      const total = MESES.reduce((s, { id }) => s + (totals[id] || 0), 0).toFixed(1);
      return [tipo, String(espessura).replace('.', ','), ...vals, total];
    });
    downloadCsv([header, ...rows], 'lista-compra-aco.csv');
  }

  // Detalhes dos componentes (MRP completo)
  function exportarComponentesCSV() {
    const header = [
      '#', 'Componente', 'Família', 'Chapa', 'Esp. (mm)',
      'Estoque Atual', 'Total Disp.',
      ...MESES.map((m) => `Prog ${m.label}`),
      ...MESES.map((m) => `Líq ${m.label}`),
      ...MESES.map((m) => `kg ${m.label}`),
      'Status',
    ];
    const rows = mrpResult.map((c) => [
      c.id, c.nome, c.familia, c.tipo, String(c.espessura || '').replace('.', ','),
      c.estoque_atual, c.total_disponivel,
      ...MESES.map(({ id }) => c.resultado[id].programado),
      ...MESES.map(({ id }) => c.resultado[id].demanda_liquida),
      ...MESES.map(({ id }) => c.resultado[id].demanda_kg.toFixed(1).replace('.', ',')),
      c.status,
    ]);
    downloadCsv([header, ...rows], 'componentes-mrp-aco.csv');
  }

  // Plano do simulador (família × mês)
  function exportarSimuladorCSV() {
    const header = [
      'Família', 'Produto', 'Carteira',
      ...MESES.map((m) => `% Part ${m.label}`),
      ...MESES.map((m) => `Prog ${m.label}`),
    ];
    const familyRows = FAMILIAS_SIM.map((f) => [
      f.nome, f.desc, carteira[f.id] || 0,
      ...MESES.map(() => (pctEdit[f.id] || 0).toFixed(2).replace('.', ',')),
      ...MESES.map(({ id }) => plano[f.id]?.[id] || 0),
    ]);
    const totRow = [
      'TOTAL CAÇAMBAS', '', totalCarteira,
      ...MESES.map(() => totalPct.toFixed(2).replace('.', ',')),
      ...MESES.map(({ id }) => totalCarrosMes[id]),
    ];
    const ccRow  = ['CC (PMP)',        'Carro de Carga', '', ...MESES.map(() => ''), ...MESES.map(({ id }) => plano['CC']?.[id] || 0)];
    const mfRow  = ['Metalforte (PMP)','Metalforte',    '', ...MESES.map(() => ''), ...MESES.map(({ id }) => plano['METALFORTE']?.[id] || 0)];
    const geralRow = [
      'TOTAL GERAL', '', '', ...MESES.map(() => ''),
      ...MESES.map(({ id }) => totalCarrosMes[id] + (plano['CC']?.[id] || 0) + (plano['METALFORTE']?.[id] || 0)),
    ];
    downloadCsv([header, ...familyRows, totRow, ccRow, mfRow, geralRow], 'simulador-plano-aco.csv');
  }

  // ── PDF Simulador ────────────────────────────────────────────────────────────
  function exportarSimuladorPDF() {
    const dataEmissao = new Date().toLocaleString('pt-BR');
    const n = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');

    const TH  = 'padding:6px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#1e293b;color:#94a3b8;white-space:nowrap;';
    const THL = TH.replace('text-align:right', 'text-align:left');
    const TD  = 'padding:5px 10px;text-align:right;font-size:11px;border-bottom:1px solid #1e293b;color:#cbd5e1;';
    const TDL = TD.replace('text-align:right', 'text-align:left');
    const TBL = 'width:100%;border-collapse:collapse;margin-bottom:20px;';

    // Cards de parâmetros
    const paramCards = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
        <div style="flex:1;min-width:110px;background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;">Carrinhos / Dia</p>
          <p style="font-size:20px;font-weight:900;color:#93c5fd;margin:0;">${n(carrosDia)}</p>
        </div>
        ${MESES.map(({ id, label }) => `
        <div style="flex:1;min-width:110px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;">Dias Úteis — ${label}</p>
          <p style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0;">${diasUteis[id] ?? 0}</p>
          <p style="font-size:10px;color:#34d399;margin:4px 0 0;">Total: ${n(totalCarrosMes[id])} caç.</p>
        </div>`).join('')}
      </div>`;

    // Linhas de famílias
    const familyRows = FAMILIAS_SIM.map((f) => `
      <tr>
        <td style="${TDL}font-weight:700;">${f.nome}</td>
        <td style="${TDL}font-size:10px;color:#64748b;">${f.desc}</td>
        <td style="${TD}color:#34d399;font-weight:700;">${n(carteira[f.id] || 0)}</td>
        <td style="${TD}color:#fbbf24;">${(pctEdit[f.id] || 0).toFixed(2)}%</td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#93c5fd;">${n(plano[f.id]?.[id] || 0)}</td>`).join('')}
      </tr>`).join('');

    const totalRow = `
      <tr style="background:#0f172a;border-top:2px solid #334155;">
        <td style="${TDL}font-weight:900;color:#f1f5f9;" colspan="2">Total Caçambas</td>
        <td style="${TD}color:#34d399;font-weight:900;">${n(totalCarteira)}</td>
        <td style="${TD}color:${Math.abs(totalPct - 100) > 0.1 ? '#f87171' : '#34d399'};font-weight:900;">${totalPct.toFixed(2)}%</td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#93c5fd;font-weight:900;">${n(totalCarrosMes[id])}</td>`).join('')}
      </tr>
      <tr>
        <td style="${TDL}color:#94a3b8;">CC</td>
        <td style="${TDL}font-size:10px;color:#475569;">Carro de Carga — PMP via Histórico</td>
        <td style="${TD}" colspan="2"></td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#38bdf8;">${n(plano['CC']?.[id] || 0)}</td>`).join('')}
      </tr>
      <tr>
        <td style="${TDL}color:#94a3b8;">Metalforte</td>
        <td style="${TDL}font-size:10px;color:#475569;">Metalforte — PMP via Histórico</td>
        <td style="${TD}" colspan="2"></td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#fbbf24;">${n(plano['METALFORTE']?.[id] || 0)}</td>`).join('')}
      </tr>
      <tr style="background:#0f172a;border-top:2px solid #475569;">
        <td style="${TDL}font-weight:900;color:#fff;font-size:12px;" colspan="4">TOTAL GERAL</td>
        ${MESES.map(({ id }) => {
          const tot = totalCarrosMes[id] + (plano['CC']?.[id] || 0) + (plano['METALFORTE']?.[id] || 0);
          return `<td style="${TD}color:#fff;font-weight:900;font-size:12px;">${n(tot)}</td>`;
        }).join('')}
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Simulador — Plano por Família — ${dataEmissao}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 28px; background: #0f172a; color: #f1f5f9;
           font-family: system-ui, -apple-system, Arial, sans-serif; }
    @media print {
      body { background: #fff !important; padding: 10px; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:18px;">
    <button onclick="window.print()"
      style="background:#10b981;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">
      ⬇&nbsp; Salvar como PDF
    </button>
  </div>

  <div style="margin-bottom:24px;border-bottom:1px solid #1e293b;padding-bottom:16px;">
    <h1 style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0 0 4px;">
      Simulador — Plano por Família de Produto
    </h1>
    <p style="font-size:11px;color:#64748b;margin:0;">Emitido em ${dataEmissao} &nbsp;·&nbsp; Período: ${MESES.map((m) => m.label).join(', ')}</p>
  </div>

  <div style="margin-bottom:28px;">
    <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 10px;border-left:3px solid #10b981;padding-left:10px;">Parâmetros de Produção</h2>
    ${paramCards}
  </div>

  <div style="margin-bottom:28px;">
    <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 10px;border-left:3px solid #10b981;padding-left:10px;">Plano por Família</h2>
    <table style="${TBL}">
      <thead><tr>
        <th style="${THL}">Família</th>
        <th style="${THL}">Produto</th>
        <th style="${TH}">Carteira</th>
        <th style="${TH}">Part. %</th>
        ${MESES.map(({ label }) => `<th style="${TH}">Prog. ${label}</th>`).join('')}
      </tr></thead>
      <tbody>${familyRows}${totalRow}</tbody>
    </table>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('Permita pop-ups nesta página para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  // ── PDF Carro de Carga ───────────────────────────────────────────────────────
  function exportarCarrinhoPDF() {
    const dataEmissao = new Date().toLocaleString('pt-BR');
    const n = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');

    const TH  = 'padding:6px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#1e293b;color:#94a3b8;white-space:nowrap;';
    const THL = TH.replace('text-align:right', 'text-align:left');
    const TD  = 'padding:5px 10px;text-align:right;font-size:11px;border-bottom:1px solid #1e293b;color:#cbd5e1;';
    const TDL = TD.replace('text-align:right', 'text-align:left');
    const TBL = 'width:100%;border-collapse:collapse;margin-bottom:20px;';

    // KPI cards
    const kpiCards = [
      { label: 'Carteira',   val: HIST_CARRO.total.cart,  color: '#38bdf8' },
      { label: 'Méd. 12m',   val: HIST_CARRO.total.m12,   color: '#818cf8' },
      { label: 'Méd. 6m',    val: HIST_CARRO.total.m06,   color: '#60a5fa' },
      { label: 'Méd. 3m',    val: HIST_CARRO.total.m03,   color: '#34d399' },
      { label: 'Fev/26',     val: HIST_CARRO.total.fev26, color: '#94a3b8' },
      { label: 'Mar/26',     val: HIST_CARRO.total.mar26, color: '#34d399' },
      { label: 'PMP Total',  val: totalPmpCC,              color: '#fbbf24' },
    ].map(({ label, val, color }) => `
      <div style="flex:1;min-width:110px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;">
        <p style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;">${label}</p>
        <p style="font-size:20px;font-weight:900;color:${color};margin:0;">${n(val)}</p>
      </div>`).join('');

    // Linhas da tabela
    const prodRows = HIST_CARRO.produtos.map((p) => `
      <tr>
        <td style="${TDL}font-weight:700;color:#94a3b8;">${p.cod}</td>
        <td style="${TDL}font-weight:700;">${p.desc}</td>
        <td style="${TD}color:#38bdf8;font-weight:700;">${p.tipo}</td>
        <td style="${TD}color:#f1f5f9;font-weight:700;">${n(p.cart)}</td>
        <td style="${TD}">${n(p.m12)}</td>
        <td style="${TD}">${n(p.m06)}</td>
        <td style="${TD}">${n(p.m03)}</td>
        <td style="${TD}color:#94a3b8;">${n(p.fev26)}</td>
        <td style="${TD}color:#34d399;font-weight:700;">${n(p.mar26)}</td>
        <td style="${TD}color:#fbbf24;font-weight:700;">${n(pmpCC[p.cod] ?? 0)}</td>
        <td style="${TD}">${p.dia != null ? n(p.dia) : '—'}</td>
        <td style="${TD}">${p.semana != null ? n(p.semana) : '—'}</td>
        <td style="${TD}">${p.sold != null ? p.sold : '—'}</td>
      </tr>`).join('');

    const totalRow = `
      <tr style="background:#0f172a;border-top:2px solid #475569;">
        <td style="${TDL}font-weight:900;color:#f1f5f9;font-size:11px;" colspan="3">TOTAL</td>
        <td style="${TD}font-weight:900;color:#f1f5f9;">${n(HIST_CARRO.total.cart)}</td>
        <td style="${TD}font-weight:900;color:#f1f5f9;">${n(HIST_CARRO.total.m12)}</td>
        <td style="${TD}font-weight:900;color:#f1f5f9;">${n(HIST_CARRO.total.m06)}</td>
        <td style="${TD}font-weight:900;color:#f1f5f9;">${n(HIST_CARRO.total.m03)}</td>
        <td style="${TD}font-weight:900;color:#94a3b8;">${n(HIST_CARRO.total.fev26)}</td>
        <td style="${TD}font-weight:900;color:#34d399;">${n(HIST_CARRO.total.mar26)}</td>
        <td style="${TD}font-weight:900;color:#fbbf24;">${n(totalPmpCC)}</td>
        <td style="${TD}" colspan="3"></td>
      </tr>`;

    // Componentes CC (varal + rodas)
    const compCC = mrpResult.filter((c) => ['Varal CC', 'Rodas'].includes(c.familia));
    const compRows = compCC.map((c) => {
      const liqTotal = MESES.reduce((s, { id }) => s + Math.max(0, c.resultado[id].demanda_liquida), 0);
      return `
        <tr>
          <td style="${TDL}">${c.nome}</td>
          <td style="${TD}color:${c.tipo === 'BF' ? '#60a5fa' : '#22d3ee'};">${c.tipo}</td>
          <td style="${TD}">${c.espessura || '—'} mm</td>
          <td style="${TD}color:#f1f5f9;font-weight:700;">${n(c.total_disponivel)}</td>
          ${MESES.map(({ id }) => {
            const liq = c.resultado[id].demanda_liquida;
            return `<td style="${TD}color:${liq > 0 ? '#f87171' : '#34d399'};">${n(liq)}</td>`;
          }).join('')}
          <td style="${TD}color:${liqTotal > 0 ? '#f87171' : '#34d399'};font-weight:700;">${c.status}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Carro de Carga — Histórico de Vendas — ${dataEmissao}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 28px; background: #0f172a; color: #f1f5f9;
           font-family: system-ui, -apple-system, Arial, sans-serif; }
    @media print {
      body { background: #fff !important; padding: 10px; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:18px;">
    <button onclick="window.print()"
      style="background:#0ea5e9;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">
      ⬇&nbsp; Salvar como PDF
    </button>
  </div>

  <div style="margin-bottom:24px;border-bottom:1px solid #1e293b;padding-bottom:16px;">
    <h1 style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0 0 4px;">
      Carro de Carga — Histórico de Vendas
    </h1>
    <p style="font-size:11px;color:#64748b;margin:0;">Emitido em ${dataEmissao}</p>
  </div>

  <div style="margin-bottom:28px;">
    <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 10px;border-left:3px solid #0ea5e9;padding-left:10px;">KPIs Resumo</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">${kpiCards}</div>
  </div>

  <div style="margin-bottom:28px;">
    <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 10px;border-left:3px solid #0ea5e9;padding-left:10px;">
      Histórico por Produto
    </h2>
    <table style="${TBL}">
      <thead><tr>
        <th style="${THL}">Cód.</th>
        <th style="${THL}">Descrição</th>
        <th style="${TH}">Tipo</th>
        <th style="${TH}">Carteira</th>
        <th style="${TH}">Méd 12m</th>
        <th style="${TH}">Méd 6m</th>
        <th style="${TH}">Méd 3m</th>
        <th style="${TH}">Fev/26</th>
        <th style="${TH}">Mar/26</th>
        <th style="${TH}">PMP</th>
        <th style="${TH}">Dia</th>
        <th style="${TH}">Semana</th>
        <th style="${TH}">Sold.</th>
      </tr></thead>
      <tbody>${prodRows}${totalRow}</tbody>
    </table>
  </div>

  ${compCC.length > 0 ? `
  <div style="margin-bottom:28px;">
    <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 10px;border-left:3px solid #0ea5e9;padding-left:10px;">
      Componentes MRP — Varal CC &amp; Rodas
    </h2>
    <table style="${TBL}">
      <thead><tr>
        <th style="${THL}">Componente</th>
        <th style="${TH}">Chapa</th>
        <th style="${TH}">Esp.</th>
        <th style="${TH}">Total Disp.</th>
        ${MESES.map(({ label }) => `<th style="${TH}">Líq. ${label}</th>`).join('')}
        <th style="${TH}">Status</th>
      </tr></thead>
      <tbody>${compRows}</tbody>
    </table>
  </div>` : ''}
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('Permita pop-ups nesta página para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  // ── PDF Estrutura BOM ────────────────────────────────────────────────────────
  function exportarBomPDF() {
    const dataEmissao = new Date().toLocaleString('pt-BR');
    const catAtual    = BOM_CATALOGO[bomCategoria];
    const bomExport   = catAtual.data;
    const TH  = 'padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#1e293b;color:#94a3b8;white-space:nowrap;';
    const THR = TH.replace('text-align:left', 'text-align:right');
    const TD  = 'padding:5px 10px;text-align:left;font-size:11px;border-bottom:1px solid #1e293b;color:#cbd5e1;';
    const TDR = TD.replace('text-align:left', 'text-align:right');
    const TBL = 'width:100%;border-collapse:collapse;margin-bottom:28px;';

    const tipoColor = (t) =>
      t === 'BF' ? '#60a5fa' : t === 'BZ' ? '#22d3ee' : '#94a3b8';

    const produtosHtml = bomExport.produtos.map((prod) => {
      const pesoTotal = prod.itens.reduce((acc, it) => {
        const comp = bomExport.componentes.find((c) => c.id === it.componente_id);
        return acc + (comp ? comp.peso_kg * it.qtd : 0);
      }, 0);

      const rows = prod.itens.map((it) => {
        const comp = bomExport.componentes.find((c) => c.id === it.componente_id);
        const pesoItem = comp ? (comp.peso_kg * it.qtd).toFixed(3) : '—';
        const tipo = comp ? comp.tipo : '—';
        const esp  = comp && comp.espessura_mm ? `${comp.espessura_mm} mm` : '—';
        return `<tr>
          <td style="${TD}">${it.nome}</td>
          <td style="${TD}color:${tipoColor(tipo)};font-weight:700;">${tipo}</td>
          <td style="${TDR}">${esp}</td>
          <td style="${TDR}">${it.qtd}</td>
          <td style="${TDR}">${comp ? comp.peso_kg.toFixed(3) : '—'} kg</td>
          <td style="${TDR}font-weight:700;color:#f1f5f9;">${pesoItem} kg</td>
          <td style="${TD}font-size:10px;color:#475569;">${it.obs || ''}</td>
        </tr>`;
      }).join('');

      return `
        <div style="margin-bottom:28px;break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;border-left:3px solid #3b82f6;padding-left:10px;">
            <span style="font-size:13px;font-weight:900;color:#f1f5f9;">${prod.descricao}</span>
            <span style="font-size:10px;font-weight:700;color:#94a3b8;background:#1e293b;padding:2px 8px;border-radius:4px;">${prod.codigo}</span>
            <span style="font-size:10px;font-weight:700;color:#34d399;margin-left:auto;">Peso total est.: ${pesoTotal.toFixed(3)} kg</span>
          </div>
          <table style="${TBL}">
            <thead><tr>
              <th style="${TH}">Componente</th>
              <th style="${TH}">Chapa</th>
              <th style="${THR}">Espessura</th>
              <th style="${THR}">Qtd</th>
              <th style="${THR}">Peso unit.</th>
              <th style="${THR}">Peso total</th>
              <th style="${TH}">Observação</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Estrutura BOM — ${catAtual.label} — ${dataEmissao}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 28px; background: #0f172a; color: #f1f5f9;
           font-family: system-ui, -apple-system, Arial, sans-serif; }
    @media print {
      body { background: #fff !important; padding: 10px; }
      .no-print { display: none !important; }
      div { break-inside: avoid; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:18px;">
    <button onclick="window.print()"
      style="background:#3b82f6;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">
      ⬇&nbsp; Salvar como PDF
    </button>
  </div>
  <div style="margin-bottom:24px;border-bottom:1px solid #1e293b;padding-bottom:16px;">
    <h1 style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0 0 4px;">
      Estrutura BOM — ${catAtual.label}
    </h1>
    <p style="font-size:11px;color:#64748b;margin:0;">
      Emitido em ${dataEmissao} &nbsp;·&nbsp; ${bomExport.produtos.length} produtos · ${bomExport.componentes.length} componentes cadastrados
    </p>
  </div>
  ${produtosHtml}
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1100,height=900');
    if (!w) { alert('Permita pop-ups nesta página para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  // ── Relatório PDF (print HTML em nova janela) ────────────────────────────────
  function exportarPDF() {
    const dataEmissao = new Date().toLocaleString('pt-BR');
    const n = (v) => Number(v || 0).toLocaleString('pt-BR');
    const kgFmt = (v) =>
      Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';

    const TH  = 'padding:6px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#1e293b;color:#94a3b8;white-space:nowrap;';
    const THL = TH.replace('text-align:right', 'text-align:left');
    const TD  = 'padding:5px 10px;text-align:right;font-size:11px;border-bottom:1px solid #1e293b;color:#cbd5e1;';
    const TDL = TD.replace('text-align:right', 'text-align:left');
    const TBL = 'width:100%;border-collapse:collapse;margin-bottom:20px;';

    const sec = (title, sub, body) => `
      <div style="margin-bottom:28px;">
        <h2 style="font-size:13px;font-weight:900;color:#f1f5f9;margin:0 0 2px;border-left:3px solid #3b82f6;padding-left:10px;">${title}</h2>
        <p style="font-size:10px;color:#64748b;margin:0 0 12px 13px;">${sub}</p>
        ${body}
      </div>`;

    /* ── 1. Parâmetros ── */
    const paramHtml = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:4px;">
        <div style="flex:1;min-width:130px;background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;">Carrinhos / Dia</p>
          <p style="font-size:20px;font-weight:900;color:#93c5fd;margin:0;">${n(carrosDia)}</p>
        </div>
        ${MESES.map(({ id, label }) => `
        <div style="flex:1;min-width:130px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px;">Dias Úteis — ${label}</p>
          <p style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0;">${diasUteis[id] ?? 0}</p>
          <p style="font-size:10px;color:#34d399;margin:4px 0 0;">Total: ${n(totalCarrosMes[id])} caç.</p>
        </div>`).join('')}
      </div>`;

    /* ── 2. Plano simulador ── */
    const simRows = FAMILIAS_SIM.map((f) => `
      <tr>
        <td style="${TDL}">${f.nome}</td>
        <td style="${TDL}font-size:10px;color:#64748b;">${f.desc}</td>
        <td style="${TD}color:#34d399;">${n(carteira[f.id] || 0)}</td>
        <td style="${TD}color:#fbbf24;">${(pctEdit[f.id] || 0).toFixed(2)}%</td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#93c5fd;">${n(plano[f.id]?.[id] || 0)}</td>`).join('')}
      </tr>`).join('');

    const simTot = `
      <tr style="background:#0f172a;">
        <td style="${TDL}color:#f1f5f9;font-weight:900;" colspan="2">TOTAL CAÇAMBAS</td>
        <td style="${TD}color:#34d399;font-weight:900;">${n(totalCarteira)}</td>
        <td style="${TD}color:${Math.abs(totalPct - 100) > 0.1 ? '#f87171' : '#34d399'};font-weight:900;">${totalPct.toFixed(2)}%</td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#93c5fd;font-weight:900;">${n(totalCarrosMes[id])}</td>`).join('')}
      </tr>
      <tr>
        <td style="${TDL}color:#94a3b8;">CC (PMP)</td>
        <td style="${TDL}font-size:10px;color:#475569;">Carro de Carga</td>
        <td style="${TD}" colspan="2"></td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#38bdf8;">${n(plano['CC']?.[id] || 0)}</td>`).join('')}
      </tr>
      <tr>
        <td style="${TDL}color:#94a3b8;">Metalforte (PMP)</td>
        <td style="${TDL}font-size:10px;color:#475569;">Metalforte</td>
        <td style="${TD}" colspan="2"></td>
        ${MESES.map(({ id }) => `<td style="${TD}color:#fbbf24;">${n(plano['METALFORTE']?.[id] || 0)}</td>`).join('')}
      </tr>
      <tr style="background:#0f172a;border-top:2px solid #475569;">
        <td style="${TDL}color:#fff;font-weight:900;font-size:12px;" colspan="2">TOTAL GERAL</td>
        <td style="${TD}" colspan="2"></td>
        ${MESES.map(({ id }) => {
          const tot = totalCarrosMes[id] + (plano['CC']?.[id] || 0) + (plano['METALFORTE']?.[id] || 0);
          return `<td style="${TD}color:#fff;font-weight:900;font-size:12px;">${n(tot)}</td>`;
        }).join('')}
      </tr>`;

    const simHtml = `
      <table style="${TBL}">
        <thead><tr>
          <th style="${THL}">Família</th><th style="${THL}">Produto</th>
          <th style="${TH}">Carteira</th><th style="${TH}">Part.%</th>
          ${MESES.map(({ label }) => `<th style="${TH}">Prog. ${label}</th>`).join('')}
        </tr></thead>
        <tbody>${simRows}${simTot}</tbody>
      </table>`;

    /* ── 3. KPIs aço ── */
    const kpiHtml = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
        ${MESES.map(({ id, label }) => `
        <div style="flex:1;min-width:130px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;">${label}</p>
          <p style="font-size:17px;font-weight:900;color:#f1f5f9;margin:0 0 4px;">${kgFmt(dashKpis[id].kgTotal)}</p>
          <p style="font-size:10px;margin:0;"><span style="color:#60a5fa;">BF: ${kgFmt(dashKpis[id].kgBF)}</span>&nbsp;&nbsp;<span style="color:#22d3ee;">BZ: ${kgFmt(dashKpis[id].kgBZ)}</span></p>
        </div>`).join('')}
        <div style="flex:1;min-width:130px;background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:12px;">
          <p style="font-size:9px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;">TOTAL PERÍODO</p>
          <p style="font-size:17px;font-weight:900;color:#93c5fd;margin:0;">${kgFmt(totalTotalKg)}</p>
          <p style="font-size:10px;color:#475569;margin:4px 0 0;">${MESES.length} meses</p>
        </div>
      </div>`;

    /* ── 4. Lista de compra ── */
    const statusColor = { COMPRAR: '#f87171', VERIFICAR: '#fbbf24', OK: '#34d399' };
    const compraRows = pivotCompra.length === 0
      ? `<tr><td colspan="${2 + MESES.length + 1}" style="padding:14px;text-align:center;color:#34d399;font-weight:700;">Nenhuma compra necessária.</td></tr>`
      : pivotCompra.map(({ tipo, espessura, totals }) => {
          const total = MESES.reduce((s, { id }) => s + (totals[id] || 0), 0);
          return `<tr>
            <td style="${TD}color:${tipo === 'BF' ? '#60a5fa' : '#22d3ee'};font-weight:700;">${tipo}</td>
            <td style="${TD}">${espessura} mm</td>
            ${MESES.map(({ id }) => `<td style="${TD}">${kgFmt(totals[id] || 0)}</td>`).join('')}
            <td style="${TD}color:#f1f5f9;font-weight:900;">${kgFmt(total)}</td>
          </tr>`;
        }).join('');

    const compraHtml = `
      <table style="${TBL}">
        <thead><tr>
          <th style="${TH}">Chapa</th><th style="${TH}">Espessura</th>
          ${MESES.map(({ label }) => `<th style="${TH}">${label} (kg)</th>`).join('')}
          <th style="${TH}">Total (kg)</th>
        </tr></thead>
        <tbody>${compraRows}</tbody>
      </table>`;

    /* ── 5. Componentes ── */
    const compRows = mrpResult.map((c) => `
      <tr>
        <td style="${TDL}font-size:10px;">${c.nome}</td>
        <td style="${TDL}font-size:10px;color:#64748b;">${c.familia}</td>
        <td style="${TD}font-size:10px;">${c.tipo}</td>
        <td style="${TD}font-size:10px;">${c.espessura || '—'}</td>
        <td style="${TD}font-size:10px;">${n(c.total_disponivel)}</td>
        ${MESES.map(({ id }) => {
          const liq = c.resultado[id].demanda_liquida;
          return `<td style="${TD}font-size:10px;color:${liq > 0 ? '#f87171' : '#34d399'};">${n(liq)}</td>`;
        }).join('')}
        ${MESES.map(({ id }) => `<td style="${TD}font-size:10px;">${kgFmt(c.resultado[id].demanda_kg)}</td>`).join('')}
        <td style="${TD}font-weight:700;color:${statusColor[c.status] || '#94a3b8'};font-size:10px;">${c.status}</td>
      </tr>`).join('');

    const compHtml = `
      <table style="${TBL}">
        <thead><tr>
          <th style="${THL}">Componente</th><th style="${THL}">Família</th>
          <th style="${TH}">Chapa</th><th style="${TH}">Esp.</th><th style="${TH}">Total Disp.</th>
          ${MESES.map(({ label }) => `<th style="${TH}">Líq. ${label}</th>`).join('')}
          ${MESES.map(({ label }) => `<th style="${TH}">kg ${label}</th>`).join('')}
          <th style="${TH}">Status</th>
        </tr></thead>
        <tbody>${compRows}</tbody>
      </table>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório MRP Aço — ${dataEmissao}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 28px; background: #0f172a; color: #f1f5f9;
           font-family: system-ui, -apple-system, Arial, sans-serif; }
    @media print {
      body { background: #fff !important; padding: 10px; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:18px;">
    <button onclick="window.print()"
      style="background:#3b82f6;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">
      ⬇&nbsp; Salvar como PDF
    </button>
  </div>

  <div style="margin-bottom:24px;border-bottom:1px solid #1e293b;padding-bottom:16px;">
    <h1 style="font-size:20px;font-weight:900;color:#f1f5f9;margin:0 0 4px;">
      Relatório MRP — Planejamento de Aço
    </h1>
    <p style="font-size:11px;color:#64748b;margin:0 0 10px;">
      Emitido em ${dataEmissao} &nbsp;·&nbsp; Período: ${MESES.map((m) => m.label).join(', ')}
    </p>
    <div style="display:flex;gap:18px;">
      <span style="font-size:11px;color:#f87171;font-weight:700;">🔴 ${totalComprar} a comprar</span>
      <span style="font-size:11px;color:#fbbf24;font-weight:700;">🟡 ${totalVerificar} verificar</span>
      <span style="font-size:11px;color:#34d399;font-weight:700;">🟢 ${mrpResult.length - totalComprar - totalVerificar} OK</span>
    </div>
  </div>

  ${sec('1. Parâmetros de Produção', 'Carrinhos por dia e dias úteis configurados na simulação', paramHtml)}
  ${sec('2. Plano por Família de Produto', 'Carteira, participação percentual e programado por mês', simHtml)}
  ${sec('3. Necessidade de Aço (kg)', 'Total de aço a comprar por mês — resultado do MRP', kpiHtml)}
  ${sec('4. Lista de Compra Consolidada', 'Agrupada por tipo de chapa e espessura', compraHtml)}
  ${sec('5. Detalhes por Componente', 'Demanda líquida e kg necessário por componente e mês', compHtml)}
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('Permita pop-ups nesta página para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  const BAR_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899',
    '#14b8a6', '#f97316', '#8b5cf6', '#22d3ee', '#84cc16',
  ];

  const navBtn = (id, label, icon) => (
    <button
      key={id}
      onClick={() => setSubAba(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
        subAba === id
          ? 'bg-blue-600 text-white shadow-md'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  // ── Portão de senha ──────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900/80 p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
              <Lock size={22} className="text-blue-400" />
            </div>
            <h2 className="text-base font-black text-slate-100">Planejamento de Aço</h2>
            <p className="text-xs text-slate-500">Digite a senha para acessar o módulo MRP</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (senhaInput === SENHA_CORRETA) {
                sessionStorage.setItem('mrp-unlocked', '1');
                setUnlocked(true);
              } else {
                setSenhaErro(true);
                setSenhaInput('');
              }
            }}
            className="space-y-4"
          >
            <div>
              <input
                type="password"
                autoFocus
                placeholder="Senha de acesso"
                value={senhaInput}
                onChange={(e) => { setSenhaInput(e.target.value); setSenhaErro(false); }}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-bold bg-slate-800/60 text-white outline-none transition-colors ${
                  senhaErro
                    ? 'border-rose-500/60 focus:border-rose-400'
                    : 'border-slate-600/60 focus:border-blue-500'
                }`}
              />
              {senhaErro && (
                <p className="mt-2 text-xs font-bold text-rose-400 flex items-center gap-1">
                  <XCircle size={12} /> Senha incorreta
                </p>
              )}
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm py-3 transition-colors"
            >
              Acessar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-top duration-500">

      {/* ── Navegação ── */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-1.5">
        {navBtn('dashboard',   'Dashboard',      <BarChart3 size={13} />)}
        {navBtn('simulador',   'Simulador',       <Layers size={13} />)}
        {navBtn('componentes', 'Componentes',     <Package size={13} />)}
        {navBtn('lista',       'Lista de Compra', <ShoppingCart size={13} />)}
        {navBtn('bom',         'Estrutura BOM',   <LayoutList size={13} />)}
        {navBtn('historico',   'Histórico',       <History size={13} />)}
        <div className="ml-auto pl-2 border-l border-slate-700/50 flex items-center gap-2">
          {/* Indicador de sync */}
          {syncStatus === 'loading' && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400">
              <RefreshCw size={11} className="animate-spin" /> Carregando...
            </span>
          )}
          {syncStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400">
              <RefreshCw size={11} className="animate-spin" /> Salvando...
            </span>
          )}
          {syncStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
              <Cloud size={11} /> Salvo
            </span>
          )}
          {syncStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400">
              <CloudOff size={11} /> Erro ao salvar
            </span>
          )}
          <button
            onClick={exportarPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30 hover:text-rose-200 transition-all"
          >
            <Download size={13} />
            Relatório PDF
          </button>
        </div>
      </div>

      {/* ── DASHBOARD ─────────────────────────────────────────────────────────── */}
      {subAba === 'dashboard' && (
        <div className="space-y-6">
          {/* Cards sumário */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {MESES.map(({ id, label }) => (
              <div
                key={id}
                className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {fmtKg(dashKpis[id].kgTotal)}
                </p>
                <div className="mt-3 flex gap-3 text-[10px]">
                  <span className="font-bold text-blue-400">BF: {fmtKg(dashKpis[id].kgBF)}</span>
                  <span className="font-bold text-cyan-400">BZ: {fmtKg(dashKpis[id].kgBZ)}</span>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/70">Total 3 meses</p>
              <p className="mt-2 text-2xl font-black text-white">{fmtKg(totalTotalKg)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                <span className="rounded-md border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 font-bold text-rose-300">
                  {totalComprar} comprar
                </span>
                <span className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-300">
                  {totalVerificar} verificar
                </span>
              </div>
            </div>
          </div>

          {/* Gráfico de barras kg por espessura/tipo */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6">
            <h3 className="text-sm font-black text-slate-200 mb-1">Demanda por Tipo/Espessura (kg)</h3>
            <p className="text-[10px] text-slate-500 mb-5">Volume de compra por mês, agrupado por chapa</p>
            {chartDataEspessura.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartDataEspessura} barGap={2} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`}
                  />
                  <RechartsTooltip
                    formatter={(v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`}
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  {MESES.map(({ label }, i) => (
                    <Bar key={label} dataKey={label} fill={BAR_COLORS[i]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500 text-center py-10">Sem demanda de compra neste período.</p>
            )}
          </div>

          {/* Resumo por tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['BF', 'BZ'].map((tipo) => (
              <div key={tipo} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
                <h4 className="text-sm font-black text-slate-200 mb-4">
                  Chapa {tipo} — kg s por mês
                </h4>
                <div className="space-y-2">
                  {MESES.map(({ id, label }) => {
                    const kg = tipo === 'BF' ? dashKpis[id].kgBF : dashKpis[id].kgBZ;
                    const maxKg = Math.max(
                      ...MESES.map(({ id: mid }) =>
                        tipo === 'BF' ? dashKpis[mid].kgBF : dashKpis[mid].kgBZ
                      )
                    );
                    const pct = maxKg > 0 ? (kg / maxKg) * 100 : 0;
                    return (
                      <div key={id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-slate-300">{label}</span>
                          <span className="font-black text-white">{fmtKg(kg)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${tipo === 'BF' ? 'bg-blue-500' : 'bg-cyan-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SIMULADOR ─────────────────────────────────────────────────────────── */}
      {subAba === 'simulador' && (
        <div className="space-y-5">

          {/* Parâmetros: carros/dia + dias úteis */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-100">Parâmetros de Produção</h3>
              <button
                onClick={() => {
                  const novaCarteira = Object.fromEntries(FAMILIAS_SIM.map((f) => [f.id, f.cart]));
                  const total = FAMILIAS_SIM.reduce((s, f) => s + f.cart, 0);
                  setCarrosDia(3300);
                  setMesesConfig(DEFAULT_MESES);
                  setDiasUteis({ abr26: 20, mai26: 21, jun26: 21 });
                  setCarteira(novaCarteira);
                  setPctEdit(Object.fromEntries(
                    FAMILIAS_SIM.map((f) => [f.id, total > 0 ? parseFloat((f.cart / total * 100).toFixed(2)) : 0])
                  ));
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white"
              >
                Resetar
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Carros/dia */}
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400 block mb-2">
                  Carrinhos / Dia
                </label>
                <input
                  type="number" min={0}
                  value={carrosDia}
                  onChange={(e) => setCarrosDia(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xl font-black text-blue-300 text-right outline-none focus:border-blue-400"
                />
              </div>
              {/* Dias úteis por mês */}
              {MESES.map(({ id, label }, slotIdx) => (
                <div key={id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                  <select
                    value={id}
                    onChange={(e) => {
                      const novoMes = MESES_OPCOES.find((m) => m.id === e.target.value);
                      if (!novoMes) return;
                      setMesesConfig((prev) => prev.map((m, i) => i === slotIdx ? novoMes : m));
                      setDiasUteis((prev) => ({ ...prev, [e.target.value]: prev[e.target.value] ?? 21 }));
                    }}
                    className="w-full rounded-lg border border-slate-600/60 bg-slate-800/80 px-2 py-1 text-[11px] font-bold text-slate-300 outline-none focus:border-blue-500 mb-2"
                  >
                    {MESES_OPCOES.map((op) => (
                      <option key={op.id} value={op.id}>{op.label}</option>
                    ))}
                  </select>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
                    Dias Úteis
                  </label>
                  <input
                    type="number" min={0} max={31}
                    value={diasUteis[id] ?? ''}
                    onChange={(e) => setDiasUteis((prev) => ({ ...prev, [id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full rounded-lg border border-slate-600/60 bg-slate-800/60 px-3 py-2 text-xl font-black text-white text-right outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-2 text-right">
                    Total: <span className="font-black text-emerald-400">{fmtNum(totalCarrosMes[id])}</span> cç
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Aviso de % fora de 100 */}
          {Math.abs(totalPct - 100) > 0.1 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300">
              <AlertTriangle size={14} />
              Total de participação: <span className="ml-1 text-amber-200">{totalPct.toFixed(2)}%</span>
              <span className="ml-1 font-medium text-amber-400/80">— ajuste as % para fechar em 100%</span>
            </div>
          )}

          {/* Tabela: carteira por família → % participação → programado */}
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[11px] text-slate-500">Carteira e participação por família de produto</p>
            <div className="flex items-center gap-2">
              <button
                onClick={exportarSimuladorPDF}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15"
              >
                <Download size={13} />
                Exportar Plano (PDF)
              </button>
              <button
                onClick={exportarSimuladorCSV}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15"
              >
                <Download size={13} />
                Exportar Plano (CSV)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-900/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/50 border-b border-slate-800/40">
                <tr>
                  <th className="px-4 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Família</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Produto</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider text-right">Carteira ✏</th>
                  <th className="px-4 py-3.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider text-right">Part. % ✏</th>
                  {MESES.map(({ id, label }) => (
                    <th key={id} className="px-4 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                      Prog. {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {FAMILIAS_SIM.map((f) => {
                  const cart = carteira[f.id] || 0;
                  return (
                    <tr key={f.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-2.5 font-black text-slate-200">{f.nome}</td>
                      <td className="px-4 py-2.5 text-slate-400">{f.desc}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number" min={0}
                          value={cart}
                          onChange={(e) => setCarteira((prev) => ({ ...prev, [f.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-24 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-300 text-right outline-none focus:border-emerald-400"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number" min={0} max={100} step={0.01}
                          value={pctEdit[f.id] ?? 0}
                          onChange={(e) => setPctEdit((prev) => ({ ...prev, [f.id]: parseFloat(e.target.value) || 0 }))}
                          className="w-20 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-300 text-right outline-none focus:border-amber-400"
                        />
                      </td>
                      {MESES.map(({ id }) => (
                        <td key={id} className="px-4 py-2.5 text-right font-bold text-blue-300">
                          {fmtNum(plano[f.id]?.[id] || 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {/* Total caçambas */}
                <tr className="bg-slate-950/40 border-t-2 border-slate-700/50">
                  <td className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-300" colSpan={2}>
                    Total Caçambas
                  </td>
                  <td className="px-4 py-3 text-right font-black text-emerald-400">{fmtNum(totalCarteira)}</td>
                  <td className={`px-4 py-3 text-right font-black ${Math.abs(totalPct - 100) > 0.1 ? 'text-red-400' : 'text-emerald-400'}`}>{totalPct.toFixed(2)}%</td>
                  {MESES.map(({ id }) => (
                    <td key={id} className="px-4 py-3 text-right font-black text-blue-300">
                      {fmtNum(totalCarrosMes[id])}
                    </td>
                  ))}
                </tr>
                {/* ── CC: linha header + sub-linhas expansíveis por SKU ── */}
                <tr
                  className="bg-slate-950/20 cursor-pointer select-none hover:bg-slate-800/25 transition-colors"
                  onClick={() => setExpandCC((v) => !v)}
                >
                  <td className="px-4 py-2.5 font-black text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight
                        size={12}
                        className={`transition-transform duration-150 ${expandCC ? 'rotate-90' : ''}`}
                      />
                      CC
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-[10px]">
                    Carro de Carga — {expandCC ? 'por SKU ✏' : 'clique para expandir'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500" colSpan={2}>—</td>
                  {MESES.map(({ id }) => (
                    <td key={id} className="px-4 py-2.5 text-right font-bold text-sky-400">
                      {fmtNum(plano['CC']?.[id] || 0)}
                    </td>
                  ))}
                </tr>
                {expandCC && HIST_CARRO.produtos.map((p) => (
                  <tr key={p.cod} className="bg-slate-950/10 border-t border-slate-800/20">
                    <td className="px-4 py-1.5 pl-9 text-slate-500 text-[10px] font-bold">{p.cod}</td>
                    <td className="px-4 py-1.5 text-slate-500 text-[10px]">{p.desc}</td>
                    <td className="px-4 py-1.5 text-right text-slate-600 text-[10px]" colSpan={2}>
                      cart: {p.cart ? fmtNum(p.cart) : '—'}
                    </td>
                    {MESES.map(({ id }) => (
                      <td key={id} className="px-4 py-1.5 text-right">
                        <input
                          type="number" min={0}
                          value={pmpCC[p.cod]?.[id] ?? 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setPmpCC((prev) => ({
                              ...prev,
                              [p.cod]: { ...(prev[p.cod] || {}), [id]: val },
                            }));
                          }}
                          className="w-20 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-xs font-bold text-sky-300 text-right outline-none focus:border-sky-400"
                        />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* ── Metalforte: linha header + sub-linhas expansíveis por SKU ── */}
                <tr
                  className="bg-slate-950/20 cursor-pointer select-none hover:bg-slate-800/25 transition-colors"
                  onClick={() => setExpandMF((v) => !v)}
                >
                  <td className="px-4 py-2.5 font-black text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight
                        size={12}
                        className={`transition-transform duration-150 ${expandMF ? 'rotate-90' : ''}`}
                      />
                      Metalforte
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-[10px]">
                    Metalforte — {expandMF ? 'por SKU ✏' : 'clique para expandir'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500" colSpan={2}>—</td>
                  {MESES.map(({ id }) => (
                    <td key={id} className="px-4 py-2.5 text-right font-bold text-amber-400">
                      {fmtNum(plano['METALFORTE']?.[id] || 0)}
                    </td>
                  ))}
                </tr>
                {expandMF && HIST_METALFORTE.produtos.map((p, i) => (
                  <tr key={i} className="bg-slate-950/10 border-t border-slate-800/20">
                    <td className="px-4 py-1.5 pl-9 text-slate-500 text-[10px] font-bold">
                      <span className="px-1.5 py-0.5 rounded border border-amber-400/20 bg-amber-500/10 text-amber-400">
                        {p.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-slate-500 text-[10px]">{p.desc}</td>
                    <td className="px-4 py-1.5 text-right text-slate-600 text-[10px]" colSpan={2}>
                      cart: {p.cart ? fmtNum(p.cart) : '—'}
                    </td>
                    {MESES.map(({ id }) => (
                      <td key={id} className="px-4 py-1.5 text-right">
                        <input
                          type="number" min={0}
                          value={pmpMf[i]?.[id] ?? 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setPmpMf((prev) => ({
                              ...prev,
                              [i]: { ...(prev[i] || {}), [id]: val },
                            }));
                          }}
                          className="w-20 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-bold text-amber-300 text-right outline-none focus:border-amber-400"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Total geral */}
                <tr className="bg-slate-950/60 border-t-2 border-slate-600/50">
                  <td className="px-4 py-3 font-black text-[11px] uppercase tracking-wider text-white" colSpan={4}>
                    TOTAL GERAL
                  </td>
                  {MESES.map(({ id }) => {
                    const totalGeral = totalCarrosMes[id] + (plano['CC']?.[id] || 0) + (plano['METALFORTE']?.[id] || 0);
                    return (
                      <td key={id} className="px-4 py-3 text-right font-black text-white text-sm">
                        {fmtNum(totalGeral)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cards de impacto */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MESES.map(({ id, label }) => {
              const totalGeral = totalCarrosMes[id] + (plano['CC']?.[id] || 0) + (plano['METALFORTE']?.[id] || 0);
              return (
                <div key={id} className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="text-lg font-black text-white mt-1">{fmtNum(totalCarrosMes[id])} caç. + {fmtNum((plano['CC']?.[id]||0) + (plano['METALFORTE']?.[id]||0))} CC/MF</p>
                  <p className="text-xs font-bold text-blue-300 mt-0.5">= {fmtNum(totalGeral)} total</p>
                  <p className="text-xs text-slate-400 mt-1">→ {fmtKg(dashKpis[id].kgTotal)} de aço a comprar</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── COMPONENTES ───────────────────────────────────────────────────────── */}
      {subAba === 'componentes' && (
        <div className="space-y-4">
          {/* Badges resumo + botão export */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300">
              🔴 {totalComprar} COMPRAR
            </span>
            <span className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
              🟡 {totalVerificar} VERIFICAR
            </span>
            <span className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              🟢 {mrpResult.length - totalComprar - totalVerificar} OK
            </span>
            <button
              onClick={exportarComponentesCSV}
              className="ml-auto flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/15"
            >
              <Download size={13} />
              Exportar Detalhes (CSV)
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-900/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/50 border-b border-slate-800/40">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">#</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Componente</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Família</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Chapa</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Esp. (mm)</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Estq. Atual</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Total Disp.</th>
                  {MESES.map(({ id, label }) => (
                    <th key={id} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                      Dem. {label}
                    </th>
                  ))}
                  {MESES.map(({ id, label }) => (
                    <th key={`liq-${id}`} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                      Líq. {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {mrpResult.map((comp) => (
                  <tr key={comp.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-2.5 text-slate-600">{comp.id}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-200">{comp.nome}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-[10px]">{comp.familia}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                        comp.tipo === 'BF'
                          ? 'border-blue-400/25 bg-blue-500/10 text-blue-300'
                          : comp.tipo === 'BZ'
                          ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300'
                          : 'border-slate-600/25 bg-slate-700/20 text-slate-400'
                      }`}>
                        {comp.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{comp.espessura || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number" min={0}
                        value={estoqueEdit[comp.id] ?? comp.estoque_atual}
                        onChange={(e) => setEstoqueEdit((prev) => ({
                          ...prev,
                          [comp.id]: Math.max(0, parseInt(e.target.value) || 0),
                        }))}
                        className="w-24 rounded-lg border border-slate-600/60 bg-slate-800/60 px-2 py-1 text-xs font-bold text-white text-right outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-200">{fmtNum(comp.total_disponivel)}</td>
                    {MESES.map(({ id }) => (
                      <td key={id} className="px-4 py-2.5 text-right text-slate-300">
                        {fmtNum(comp.resultado[id].programado)}
                      </td>
                    ))}
                    {MESES.map(({ id }) => {
                      const liq = comp.resultado[id].demanda_liquida;
                      return (
                        <td key={`liq-${id}`} className={`px-4 py-2.5 text-right font-bold ${
                          liq > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {liq > 0 ? `+${fmtNum(liq)}` : fmtNum(liq)}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={comp.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LISTA DE COMPRA ────────────────────────────────────────────────────── */}
      {subAba === 'lista' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-100">Lista de Compra Consolidada</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Agrupado por tipo de chapa e espessura — pronto para enviar ao fornecedor.
              </p>
            </div>
            <button
              onClick={exportarCSV}
              className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>

          {pivotCompra.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-12 text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-300">Nenhuma compra necessária!</p>
              <p className="text-xs text-slate-500 mt-1">O estoque atual cobre toda a programação.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-900/40">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/50 border-b border-slate-800/40">
                  <tr>
                    <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Espessura</th>
                    {MESES.map(({ id, label }) => (
                      <th key={id} className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                        {label}
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                      Total (kg)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {/* Agrupa visualmente por tipo */}
                  {['BF', 'BZ'].map((tipo) => {
                    const rows = pivotCompra.filter((r) => r.tipo === tipo);
                    if (rows.length === 0) return null;
                    const totalPorMes = {};
                    MESES.forEach(({ id }) => {
                      totalPorMes[id] = rows.reduce((s, r) => s + (r.totals[id] || 0), 0);
                    });
                    const totalTipo = MESES.reduce((s, { id }) => s + (totalPorMes[id] || 0), 0);
                    return (
                      <React.Fragment key={tipo}>
                        {/* Cabeçalho do grupo */}
                        <tr className="bg-slate-950/30">
                          <td className="px-5 py-2.5" colSpan={2 + MESES.length + 1}>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                              tipo === 'BF' ? 'text-blue-400' : 'text-cyan-400'
                            }`}>
                              ─── Chapa {tipo} ───
                            </span>
                          </td>
                        </tr>
                        {rows.map(({ espessura, totals }) => {
                          const total = MESES.reduce((s, { id }) => s + (totals[id] || 0), 0);
                          return (
                            <tr
                              key={`${tipo}|${espessura}`}
                              className="hover:bg-slate-800/20 transition-colors"
                            >
                              <td className="px-5 py-3">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                  tipo === 'BF'
                                    ? 'border-blue-400/25 bg-blue-500/10 text-blue-300'
                                    : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300'
                                }`}>
                                  {tipo}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-bold text-slate-200">
                                {espessura} mm
                              </td>
                              {MESES.map(({ id }) => {
                                const kg = totals[id] || 0;
                                return (
                                  <td key={id} className="px-5 py-3 text-right">
                                    {kg > 0 ? (
                                      <span className="font-bold text-white">
                                        {fmtKg(kg)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-5 py-3 text-right font-black text-slate-100">
                                {fmtKg(total)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Subtotal do tipo */}
                        <tr className="bg-slate-950/20 border-t border-slate-700/30">
                          <td className="px-5 py-2.5 font-black text-[10px] uppercase tracking-wider text-slate-400" colSpan={2}>
                            Subtotal {tipo}
                          </td>
                          {MESES.map(({ id }) => (
                            <td key={id} className="px-5 py-2.5 text-right font-black text-slate-200">
                              {fmtKg(totalPorMes[id] || 0)}
                            </td>
                          ))}
                          <td className="px-5 py-2.5 text-right font-black text-blue-300">
                            {fmtKg(totalTipo)}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Total geral */}
                  <tr className="bg-slate-950/50 border-t-2 border-slate-700/50">
                    <td className="px-5 py-3.5 font-black text-[11px] uppercase tracking-wider text-white" colSpan={2}>
                      TOTAL GERAL
                    </td>
                    {MESES.map(({ id }) => {
                      const kg = pivotCompra.reduce((s, r) => s + (r.totals[id] || 0), 0);
                      return (
                        <td key={id} className="px-5 py-3.5 text-right font-black text-blue-300">
                          {fmtKg(kg)}
                        </td>
                      );
                    })}
                    <td className="px-5 py-3.5 text-right font-black text-blue-300 text-base">
                      {fmtKg(pivotCompra.reduce(
                        (s, r) => s + MESES.reduce((ms, { id }) => ms + (r.totals[id] || 0), 0),
                        0
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Detalhe por componente (expansível via mês) */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-4">
              Detalhe por Componente
            </h4>
            <div className="space-y-2">
              {mrpResult
                .filter((c) => c.status === 'COMPRAR')
                .map((comp) => (
                  <div
                    key={comp.id}
                    className="rounded-xl border border-slate-800/40 bg-slate-950/20 px-4 py-3 flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-xs font-bold text-slate-200">{comp.nome}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {comp.tipo} {comp.espessura}mm · {comp.peso_kg} kg/pç
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {MESES.map(({ id, label }) => {
                        const liq = comp.resultado[id].demanda_liquida;
                        if (liq <= 0) return null;
                        return (
                          <div key={id} className="text-right">
                            <p className="text-[10px] text-slate-500">{label}</p>
                            <p className="text-xs font-black text-rose-400">
                              {fmtNum(Math.ceil(liq))} pç
                            </p>
                            <p className="text-[10px] text-slate-400">{fmtKg(comp.resultado[id].demanda_kg)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTÓRICO ─────────────────────────────────────────────────────────── */}
      {subAba === 'historico' && (
        <div className="space-y-8">

          {/* ─── Metalforte ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp size={16} className="text-amber-400" />
              <h3 className="text-sm font-black text-slate-100">Metalforte — Histórico de Vendas</h3>
            </div>

            {/* KPI Cards Metalforte */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Carteira', val: HIST_METALFORTE.total.cart, color: 'text-amber-300', border: 'border-amber-500/20' },
                { label: 'Média 3m',  val: Math.round(HIST_METALFORTE.total.m3),   color: 'text-blue-300',   border: 'border-blue-500/20'  },
                { label: 'Média 6m',  val: Math.round(HIST_METALFORTE.total.m6),   color: 'text-cyan-300',   border: 'border-cyan-500/20'  },
                { label: 'PMP Mês',   val: HIST_METALFORTE.total.pmp,              color: 'text-emerald-300',border: 'border-emerald-500/20'},
              ].map(({ label, val, color, border }) => (
                <div key={label} className={`rounded-xl border ${border} bg-slate-900/60 p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                  <p className={`text-xl font-black mt-1 ${color}`}>{fmtNum(val)}</p>
                </div>
              ))}
            </div>

            {/* Gráfico médias Metalforte */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
              <p className="text-xs font-black text-slate-300 mb-4">Médias × PMP (pç/mês)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={HIST_METALFORTE.produtos
                    .filter((p) => p.pmp)
                    .map((p) => ({ name: p.tipo, 'Méd 12m': Math.round(p.m12), 'Méd 6m': Math.round(p.m6), 'Méd 3m': Math.round(p.m3), PMP: p.pmp }))}
                  barGap={2} barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => fmtNum(v)} />
                  <RechartsTooltip
                    formatter={(v) => fmtNum(v)}
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  <Bar dataKey="Méd 12m" fill="#6366f1" radius={[3,3,0,0]} />
                  <Bar dataKey="Méd 6m"  fill="#3b82f6" radius={[3,3,0,0]} />
                  <Bar dataKey="Méd 3m"  fill="#10b981" radius={[3,3,0,0]} />
                  <Bar dataKey="PMP"     fill="#f59e0b" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Banner de vínculo com MRP */}
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
              <TrendingUp size={13} className="text-amber-400 flex-shrink-0" />
              <p className="text-[11px] text-amber-300/80">
                O campo <span className="font-black text-amber-300">PMP</span> alimenta diretamente o cálculo MRP — altere os valores e confira Dashboard e Lista de Compra.
              </p>
              <span className="ml-auto text-[11px] font-black text-amber-300">Total PMP: {fmtNum(totalPmpMf)} pç/mês</span>
            </div>

            {/* Tabela Metalforte */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 border-b border-slate-800/40">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Produto</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Tipo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Carteira</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 12m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 6m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 3m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Vend 12m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Vend 6m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Vend 3m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Fat 2m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-amber-400 uppercase tracking-wider text-right">PMP ✏</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Dia</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Semana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {HIST_METALFORTE.produtos.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-2.5 text-slate-200 font-bold">{p.desc}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-400/25 bg-amber-500/10 text-amber-300">{p.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-100">{p.cart ? fmtNum(p.cart) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{fmtNum(Math.round(p.m12))}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{fmtNum(Math.round(p.m6))}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{fmtNum(Math.round(p.m3))}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.v12 ? fmtNum(p.v12) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.v6 ? fmtNum(p.v6) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.v3 ? fmtNum(p.v3) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.fat2m ? fmtNum(p.fat2m) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number" min={0}
                          value={pmpMf[i]?.[MESES[0]?.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setPmpMf((prev) => ({
                              ...prev,
                              [i]: Object.fromEntries(MESES.map((m) => [m.id, val])),
                            }));
                          }}
                          className="w-24 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-300 text-right outline-none focus:border-amber-400"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.dia != null ? fmtNum(p.dia) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.sem != null ? fmtNum(p.sem) : '—'}</td>
                    </tr>
                  ))}
                  {/* Total */}
                  <tr className="bg-slate-950/40 border-t-2 border-slate-700/50 font-black">
                    <td className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-400" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.cart)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(Math.round(HIST_METALFORTE.total.m12))}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(Math.round(HIST_METALFORTE.total.m6))}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(Math.round(HIST_METALFORTE.total.m3))}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.v12)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.v6)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.v3)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.fat2m)}</td>
                    <td className="px-4 py-3 text-right text-amber-300 text-sm">{fmtNum(totalPmpMf)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.dia)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_METALFORTE.total.sem)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Carro de Carga ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp size={16} className="text-sky-400" />
              <h3 className="text-sm font-black text-slate-100">Carro de Carga — Histórico de Vendas</h3>
              <button
                onClick={exportarCarrinhoPDF}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600/20 border border-sky-500/30 text-sky-300 hover:bg-sky-600/30 hover:text-sky-200 transition-all"
              >
                <Download size={12} />
                PDF
              </button>
            </div>

            {/* KPI Cards Carro */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Carteira',  val: HIST_CARRO.total.cart,   color: 'text-sky-300',     border: 'border-sky-500/20'     },
                { label: 'Média 3m',  val: HIST_CARRO.total.m03,    color: 'text-blue-300',    border: 'border-blue-500/20'    },
                { label: 'Mar/26',    val: HIST_CARRO.total.mar26,  color: 'text-emerald-300', border: 'border-emerald-500/20' },
                { label: 'Prog. Mês', val: HIST_CARRO.total.prog,   color: 'text-amber-300',   border: 'border-amber-500/20'   },
              ].map(({ label, val, color, border }) => (
                <div key={label} className={`rounded-xl border ${border} bg-slate-900/60 p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                  <p className={`text-xl font-black mt-1 ${color}`}>{fmtNum(val)}</p>
                </div>
              ))}
            </div>

            {/* Gráfico médias Carro de Carga */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
              <p className="text-xs font-black text-slate-300 mb-4">Médias × Programado por tipo (pç/mês)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={HIST_CARRO.produtos
                    .filter((p) => p.prog)
                    .map((p) => ({ name: p.cod, 'Méd 12m': p.m12, 'Méd 6m': p.m06, 'Méd 3m': p.m03, 'Mar/26': p.mar26, Prog: p.prog }))}
                  barGap={1} barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => fmtNum(v)} />
                  <RechartsTooltip
                    formatter={(v) => fmtNum(v)}
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  <Bar dataKey="Méd 12m" fill="#6366f1" radius={[3,3,0,0]} />
                  <Bar dataKey="Méd 6m"  fill="#3b82f6" radius={[3,3,0,0]} />
                  <Bar dataKey="Méd 3m"  fill="#10b981" radius={[3,3,0,0]} />
                  <Bar dataKey="Mar/26"  fill="#22d3ee" radius={[3,3,0,0]} />
                  <Bar dataKey="Prog"    fill="#f59e0b" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Banner de vínculo com MRP */}
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
              <TrendingUp size={13} className="text-sky-400 flex-shrink-0" />
              <p className="text-[11px] text-sky-300/80">
                O campo <span className="font-black text-sky-300">PMP</span> alimenta diretamente o cálculo MRP — altere os valores e confira Dashboard e Lista de Compra.
              </p>
              <span className="ml-auto text-[11px] font-black text-sky-300">Total PMP: {fmtNum(totalPmpCC)} pç/mês</span>
            </div>

            {/* Tabela Carro de Carga */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 border-b border-slate-800/40">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cód.</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[220px]">Descrição</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Tipo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Carteira</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 12m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 6m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Méd 3m</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Fev/26</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Mar/26</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-amber-400 uppercase tracking-wider text-right">PMP ✏</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Dia</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Semana</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Sold.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {HIST_CARRO.produtos.map((p) => (
                    <tr key={p.cod} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-2.5 text-slate-500 font-bold">{p.cod}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-bold">{p.desc}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md border border-sky-400/25 bg-sky-500/10 text-sky-300">{p.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-100">{p.cart ? fmtNum(p.cart) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{p.m12 ? fmtNum(p.m12) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{p.m06 ? fmtNum(p.m06) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{p.m03 ? fmtNum(p.m03) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.fev26 ? fmtNum(p.fev26) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">{p.mar26 ? fmtNum(p.mar26) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number" min={0}
                          value={pmpCC[p.cod]?.[MESES[0]?.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setPmpCC((prev) => ({
                              ...prev,
                              [p.cod]: Object.fromEntries(MESES.map((m) => [m.id, val])),
                            }));
                          }}
                          className="w-24 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-300 text-right outline-none focus:border-amber-400"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.dia != null ? fmtNum(p.dia) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.semana != null ? fmtNum(p.semana) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{p.sold != null ? p.sold : '—'}</td>
                    </tr>
                  ))}
                  {/* Total */}
                  <tr className="bg-slate-950/40 border-t-2 border-slate-700/50 font-black">
                    <td className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-400" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_CARRO.total.cart)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_CARRO.total.m12)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_CARRO.total.m06)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_CARRO.total.m03)}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtNum(HIST_CARRO.total.fev26)}</td>
                    <td className="px-4 py-3 text-right text-emerald-300">{fmtNum(HIST_CARRO.total.mar26)}</td>
                    <td className="px-4 py-3 text-right text-amber-300 text-sm">{fmtNum(totalPmpCC)}</td>
                    <td className="px-4 py-3 text-right text-white" colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── ESTRUTURA BOM ──────────────────────────────────────────────────────── */}
      {subAba === 'bom' && (() => {
        const bomAtual = bomOverrides[bomCategoria] ?? BOM_CATALOGO[bomCategoria].data;
        const corMap = {
          amber:  { btn: 'bg-amber-600/20 border-amber-500/30 text-amber-300 hover:bg-amber-600/30 hover:text-amber-200',   ativo: 'bg-amber-600/30 border-amber-400/50 text-amber-200',   icon: 'text-amber-400'  },
          indigo: { btn: 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 hover:text-indigo-200', ativo: 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200', icon: 'text-indigo-400' },
          sky:    { btn: 'bg-sky-600/20 border-sky-500/30 text-sky-300 hover:bg-sky-600/30 hover:text-sky-200',               ativo: 'bg-sky-600/30 border-sky-400/50 text-sky-200',         icon: 'text-sky-400'    },
          violet: { btn: 'bg-violet-600/20 border-violet-500/30 text-violet-300 hover:bg-violet-600/30 hover:text-violet-200',ativo: 'bg-violet-600/30 border-violet-400/50 text-violet-200',icon: 'text-violet-400' },
        };
        const corAtiva = corMap[BOM_CATALOGO[bomCategoria].cor];

        // ── Helpers do editor ────────────────────────────────────────────────
        const prodEdit = bomEditMode && bomDraft ? (bomDraft.produtos[bomProdIdx] ?? null) : null;

        const updateProdField = (field, val) =>
          setBomDraft(d => ({ ...d, produtos: d.produtos.map((p, i) => i === bomProdIdx ? { ...p, [field]: val } : p) }));

        const updateItemField = (iIdx, field, val) =>
          setBomDraft(d => ({
            ...d,
            produtos: d.produtos.map((p, i) => i !== bomProdIdx ? p : {
              ...p, itens: p.itens.map((it, j) => j === iIdx ? { ...it, [field]: val } : it),
            }),
          }));

        const addItem = () =>
          setBomDraft(d => ({
            ...d,
            produtos: d.produtos.map((p, i) => i !== bomProdIdx ? p : {
              ...p, itens: [...p.itens, { componente_id: null, nome: '', qtd: 1, obs: '' }],
            }),
          }));

        const removeItem = (iIdx) =>
          setBomDraft(d => ({
            ...d,
            produtos: d.produtos.map((p, i) => i !== bomProdIdx ? p : {
              ...p, itens: p.itens.filter((_, j) => j !== iIdx),
            }),
          }));

        const addProduto = () => {
          const newIdx = bomDraft ? bomDraft.produtos.length : 0;
          setBomDraft(d => ({ ...d, produtos: [...d.produtos, { codigo: '', descricao: '', itens: [] }] }));
          setBomProdIdx(newIdx);
        };

        const removeProduto = (idx) => {
          setBomDraft(d => ({ ...d, produtos: d.produtos.filter((_, i) => i !== idx) }));
          setBomProdIdx(prev => Math.max(0, Math.min(prev, (bomDraft?.produtos.length ?? 2) - 2)));
        };

        const salvarDraft = () => {
          if (!bomDraft) return;
          const usedIds = new Set(bomDraft.produtos.flatMap(p => p.itens.map(it => it.componente_id).filter(Boolean)));
          const componentesDerived = COMPONENTES_BASE
            .filter(c => usedIds.has(c.id))
            .map(c => ({ id: c.id, nome: c.nome, familia: c.familia || '', tipo: c.tipo, espessura_mm: c.espessura, peso_kg: c.peso_kg }));
          const saved = { ...bomDraft, componentes: componentesDerived };
          const newOverrides = { ...bomOverrides, [bomCategoria]: saved };
          setBomOverrides(newOverrides);
          saveBomToFirestore(newOverrides);
          setBomEditMode(false);
          setBomDraft(null);
        };

        const selCls  = 'bg-slate-900 border border-slate-700/60 text-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-blue-500/60 w-full';
        const inpCls  = 'bg-slate-900 border border-slate-700/60 text-slate-200 rounded-lg text-xs px-2 py-1.5 w-full focus:outline-none focus:border-blue-500/60 placeholder:text-slate-600';

        // ── MODO EDITOR ──────────────────────────────────────────────────────
        if (bomEditMode && bomDraft) {
          const compFamilias = {};
          COMPONENTES_BASE.forEach(c => {
            const fam = c.familia || 'Outros';
            if (!compFamilias[fam]) compFamilias[fam] = [];
            compFamilias[fam].push(c);
          });
          return (
            <div className="space-y-4">
              {/* Header editor */}
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <LayoutList size={15} className="text-blue-400" />
                  Editor BOM — {BOM_CATALOGO[bomCategoria].label}
                </h3>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={salvarDraft}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/40 transition-all"
                  >
                    <CheckCircle2 size={12} /> Salvar estrutura
                  </button>
                  <button
                    onClick={() => { setBomEditMode(false); setBomDraft(null); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-700/40 border border-slate-600/40 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <XCircle size={12} /> Descartar
                  </button>
                </div>
              </div>

              {/* Layout 2 colunas */}
              <div className="flex gap-4 items-start">

                {/* Coluna esquerda — lista de produtos */}
                <div className="w-56 shrink-0 rounded-xl border border-slate-800/60 bg-slate-900/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800/40 bg-slate-950/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Produtos ({bomDraft.produtos.length})
                    </span>
                    <button
                      onClick={addProduto}
                      title="Novo produto"
                      className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 flex items-center justify-center text-xs font-black leading-none"
                    >+</button>
                  </div>
                  <div className="divide-y divide-slate-800/30 max-h-[60vh] overflow-y-auto">
                    {bomDraft.produtos.map((p, idx) => (
                      <div
                        key={idx}
                        className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          idx === bomProdIdx
                            ? 'bg-blue-600/15 border-l-2 border-blue-500'
                            : 'hover:bg-slate-800/40'
                        }`}
                        onClick={() => setBomProdIdx(idx)}
                      >
                        <span className={`flex-1 truncate text-[11px] font-bold ${idx === bomProdIdx ? 'text-slate-100' : 'text-slate-400'}`}>
                          {p.descricao || <em className="font-normal text-slate-600">sem nome</em>}
                        </span>
                        <button
                          title="Remover"
                          onClick={(e) => { e.stopPropagation(); removeProduto(idx); }}
                          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-red-400 hover:text-red-300 transition-all text-base leading-none"
                        >×</button>
                      </div>
                    ))}
                    {bomDraft.produtos.length === 0 && (
                      <p className="px-3 py-6 text-[10px] text-slate-600 text-center">
                        Nenhum produto.<br />Clique + para adicionar.
                      </p>
                    )}
                  </div>
                </div>

                {/* Coluna direita — formulário do produto */}
                {!prodEdit ? (
                  <div className="flex-1 rounded-xl border border-slate-800/60 bg-slate-900/20 flex items-center justify-center min-h-[200px]">
                    <p className="text-[11px] text-slate-600">Selecione um produto à esquerda</p>
                  </div>
                ) : (
                  <div className="flex-1 space-y-5 rounded-xl border border-slate-800/60 bg-slate-900/30 p-5">

                    {/* Campos principais */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Código</label>
                        <input className={inpCls} value={prodEdit.codigo || ''} placeholder="ex: 00174" onChange={(e) => updateProdField('codigo', e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Descrição</label>
                        <input className={inpCls} value={prodEdit.descricao || ''} placeholder="Nome completo do produto" onChange={(e) => updateProdField('descricao', e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grupo / Família</label>
                        <input className={inpCls} value={prodEdit.grupo || ''} placeholder="ex: Premium, Standard, CC…" onChange={(e) => updateProdField('grupo', e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tag extra (roda / tipo / acabamento)</label>
                        <input className={inpCls} value={prodEdit.roda || ''} placeholder="ex: câmara, M20, BF Cinza…" onChange={(e) => updateProdField('roda', e.target.value)} />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Observação (opcional)</label>
                        <input className={inpCls} value={prodEdit.obs_familia || ''} placeholder="Anotações sobre este produto…" onChange={(e) => updateProdField('obs_familia', e.target.value)} />
                      </div>
                    </div>

                    {/* Tabela de componentes */}
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Componentes</span>
                        <span className="text-[10px] text-slate-600">{prodEdit.itens.length} iten{prodEdit.itens.length !== 1 ? 's' : ''}</span>
                        {prodEdit.itens.length > 0 && (
                          <span className="ml-auto text-[11px] font-bold text-emerald-400">
                            ≈ {prodEdit.itens.reduce((acc, it) => {
                              const c = COMPONENTES_BASE.find(x => x.id === it.componente_id);
                              return acc + (c ? c.peso_kg * (Number(it.qtd) || 0) : 0);
                            }, 0).toFixed(3)} kg
                          </span>
                        )}
                      </div>
                      {prodEdit.itens.length > 0 && (
                        <table className="w-full text-xs mb-3">
                          <thead>
                            <tr className="border-b border-slate-800/40">
                              <th className="pb-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Componente</th>
                              <th className="pb-2 text-center w-16 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qtd</th>
                              <th className="pb-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Observação</th>
                              <th className="pb-2 w-6"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/20">
                            {prodEdit.itens.map((it, iIdx) => (
                              <tr key={iIdx}>
                                <td className="py-1.5 pr-2">
                                  <select
                                    className={selCls}
                                    value={it.componente_id ?? ''}
                                    onChange={(e) => {
                                      const id = parseInt(e.target.value, 10);
                                      const c = COMPONENTES_BASE.find(x => x.id === id);
                                      setBomDraft(d => ({
                                        ...d,
                                        produtos: d.produtos.map((p, pi) => pi !== bomProdIdx ? p : {
                                          ...p,
                                          itens: p.itens.map((it2, j) => j !== iIdx ? it2 : {
                                            ...it2,
                                            componente_id: id || null,
                                            nome: c ? c.nome : it2.nome,
                                          }),
                                        }),
                                      }));
                                    }}
                                  >
                                    <option value="">— selecionar —</option>
                                    {Object.entries(compFamilias).map(([fam, comps]) => (
                                      <optgroup key={fam} label={fam}>
                                        {comps.map(c => (
                                          <option key={c.id} value={c.id}>
                                            {c.nome}{c.espessura ? ` · ${c.espessura}mm (${c.tipo})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <input
                                    type="number" min="1"
                                    className="bg-slate-900 border border-slate-700/60 text-slate-200 rounded-lg text-xs px-2 py-1.5 w-14 text-center focus:outline-none focus:border-blue-500/60"
                                    value={it.qtd}
                                    onChange={(e) => updateItemField(iIdx, 'qtd', parseInt(e.target.value, 10) || 1)}
                                  />
                                </td>
                                <td className="py-1.5 px-2">
                                  <input
                                    className={inpCls}
                                    value={it.obs || ''}
                                    placeholder="Observação…"
                                    onChange={(e) => updateItemField(iIdx, 'obs', e.target.value)}
                                  />
                                </td>
                                <td className="py-1.5 pl-2 text-center">
                                  <button onClick={() => removeItem(iIdx)} className="text-red-400 hover:text-red-300 text-base leading-none font-black">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <button
                        onClick={addItem}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 border border-slate-700/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-all"
                      >
                        + Adicionar componente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // ── MODO VISUALIZAÇÃO ────────────────────────────────────────────────
        return (
        <div className="space-y-6">

          {/* Cabeçalho */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                <LayoutList size={15} className={corAtiva.icon} />
                Estrutura BOM — {BOM_CATALOGO[bomCategoria].label}
                {bomOverrides[bomCategoria] && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">personalizado</span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Bill of Materials por produto · {bomAtual.produtos.length} produtos · {(bomAtual.componentes ?? []).length} componentes
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => {
                  setBomDraft(JSON.parse(JSON.stringify(bomAtual)));
                  setBomProdIdx(0);
                  setBomEditMode(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-slate-700/40 border border-slate-600/40 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100 transition-all"
              >
                <LayoutList size={13} />
                Editar estrutura
              </button>
              <button
                onClick={exportarBomPDF}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${corAtiva.btn}`}
              >
                <Download size={13} />
                Exportar PDF
              </button>
            </div>
          </div>

          {/* Seletor de categoria */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(BOM_CATALOGO).map(([key, cat]) => {
              const cor = corMap[cat.cor];
              const ativo = bomCategoria === key;
              const catData = bomOverrides[key] ?? cat.data;
              return (
                <button
                  key={key}
                  onClick={() => setBomCategoria(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${ativo ? cor.ativo : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'}`}
                >
                  <Layers size={11} />
                  {cat.label}
                  <span className="ml-1 opacity-60">{catData.produtos.length}</span>
                  {bomOverrides[key] && <span className="ml-0.5 opacity-70">✎</span>}
                </button>
              );
            })}
          </div>

          {/* Cards de componentes */}
          {(bomAtual.componentes ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Componentes cadastrados</p>
              <div className="flex flex-wrap gap-2">
                {(bomAtual.componentes ?? []).map((c) => (
                  <span
                    key={c.id}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                      c.tipo === 'BF'
                        ? 'border-blue-400/25 bg-blue-500/10 text-blue-300'
                        : c.tipo === 'BZ'
                        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-600/25 bg-slate-700/20 text-slate-400'
                    }`}
                  >
                    {c.nome}
                    {(c.espessura_mm ?? c.espessura ?? 0) > 0 && <span className="ml-1 opacity-60">· {c.espessura_mm ?? c.espessura}mm</span>}
                    {c.peso_kg > 0 && <span className="ml-1 opacity-60">· {c.peso_kg.toFixed(3)} kg</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabelas por produto */}
          <div className="space-y-5">
            {bomAtual.produtos.map((prod, pIdx) => {
              const pesoTotal = prod.itens.reduce((acc, it) => {
                const comp = COMPONENTES_BASE.find((c) => c.id === it.componente_id);
                return acc + (comp ? comp.peso_kg * it.qtd : 0);
              }, 0);
              const tags = [prod.roda, prod.linha, prod.acabamento, prod.tipo].filter(Boolean);
              return (
                <div key={prod.codigo || pIdx} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                  {/* Header produto */}
                  <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-slate-950/50 border-b border-slate-800/40">
                    {prod.codigo && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md border border-slate-600/40 bg-slate-700/30 text-slate-400">
                        {prod.codigo}
                      </span>
                    )}
                    <span className="text-sm font-black text-slate-100">{prod.descricao}</span>
                    {tags.map((tag) => (
                      <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${corAtiva.ativo}`}>
                        {tag}
                      </span>
                    ))}
                    {prod.obs_familia && (
                      <span className="text-[10px] text-slate-500 italic">{prod.obs_familia}</span>
                    )}
                    <span className="ml-auto text-[11px] font-bold text-emerald-400">
                      Peso est.: {pesoTotal.toFixed(3)} kg
                    </span>
                  </div>
                  {/* Itens */}
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800/30">
                      <tr>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Componente</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Chapa</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Espessura</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Qtd</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Peso unit.</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Peso total</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {prod.itens.map((it, itIdx) => {
                        const comp = COMPONENTES_BASE.find((c) => c.id === it.componente_id);
                        const pesoItem = comp ? (comp.peso_kg * it.qtd) : null;
                        return (
                          <tr key={itIdx} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-4 py-2.5 font-bold text-slate-200">{it.nome}</td>
                            <td className="px-4 py-2.5 text-center">
                              {comp && comp.tipo !== '—' ? (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                  comp.tipo === 'BF'
                                    ? 'border-blue-400/25 bg-blue-500/10 text-blue-300'
                                    : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300'
                                }`}>
                                  {comp.tipo}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-400">
                              {comp && comp.espessura ? `${comp.espessura} mm` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-black text-slate-100">{it.qtd}</td>
                            <td className="px-4 py-2.5 text-right text-slate-400">
                              {comp && comp.peso_kg > 0 ? `${comp.peso_kg.toFixed(3)} kg` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-200">
                              {pesoItem != null && pesoItem > 0 ? `${pesoItem.toFixed(3)} kg` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-[10px] text-slate-500">{it.obs}</td>
                          </tr>
                        );
                      })}
                      {/* Total por produto */}
                      <tr className="bg-slate-950/40 border-t border-slate-700/40">
                        <td className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500" colSpan={5}>
                          Total estimado
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-emerald-400">
                          {pesoTotal.toFixed(3)} kg
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
