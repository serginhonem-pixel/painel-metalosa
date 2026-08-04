import React, { useState, useEffect, useMemo, useRef } from 'react';
import funcionariosBase from './data/funcionarios.json';
import faturamentoData from './data/faturamento.json';
import devolucaoData from './data/devolucao.json';
import clientesData from './Faturamento/clientes.json';
import produtosData from './data/produtos.json';
import custosData from './data/custos.json';
import custosPrevanoData from './data/custos_prevano.json';
import custosIndiretosData from './data/custos_indiretos.json';
import municipiosLatLong from './data/municipios_brasil_latlong.json';
import logoMetalosa from './data/logo.png';
import absenteismoLeandro from './data/absenteismo_leandro_dez2025_jan2026.json';
import vendedoresData from './data/vendedores.json';
import { maquinasBaseData, setoresBaseData } from './data/maquinasBase';
import DashboardManutencaoTV from './components/DashboardManutencaoTV';
import DashboardGlobalTV from './components/DashboardGlobalTV';
import PainelOperacaoDiaria from './components/PainelOperacaoDiaria';
import MrpAco from './components/MrpAco';
import Rastreabilidade from './components/Rastreabilidade';
import { computeCostBreakdown } from './services/costing';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, writeBatch, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getToken, onMessage, isSupported, deleteToken } from 'firebase/messaging';
import { db, auth, storage, messaging } from './firebase';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  Factory, 
  DollarSign, 
  Download,
  FileText,
  Layers,
  ChevronRight,
  ChevronLeft,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  UserX,
  UserPlus,
  Trash2,
  Eye,
  Pencil,
  Printer,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Settings,
  Plus,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Filter,
  Activity,
  Wrench,
  Cpu,
  UserCog,
  Briefcase,
  Target,
  ShoppingCart,
  Zap,
  ScanLine,
  Search,
  ChevronUp,
  MoreHorizontal,
  ClipboardList,
  Unlock,
  Timer
} from 'lucide-react';

// --- Constantes e Dados Iniciais ---

const CATEGORIAS_OS_PROBLEMA = [
  'Eletrico', 'Mecanico', 'Hidraulico', 'Pneumatico', 'Automacao/CLP',
  'Instrumentacao/Sensores', 'Software', 'Utilidades', 'Qualidade', 'Seguranca', 'Outro',
];

const MAPA_SEM_ACENTO = {
  a: 'aàáâãäå', e: 'eèéêë', i: 'iìíîï', o: 'oòóôõö', u: 'uùúûü', c: 'cç', n: 'nñ',
};
const TABELA_SEM_ACENTO = Object.entries(MAPA_SEM_ACENTO).reduce((tabela, [base, variantes]) => {
  for (const variante of variantes) tabela[variante] = base;
  return tabela;
}, {});
const removerAcentos = (texto) =>
  texto.toLowerCase().split('').map((c) => TABELA_SEM_ACENTO[c] || c).join('');

// Normaliza variações acentuadas (ex: "Mecânico") para a grafia canônica do select ("Mecanico"),
// evitando que a mesma categoria apareça duplicada nos relatórios.
const normalizarCategoriaOs = (categoria) => {
  if (!categoria) return categoria;
  const alvo = removerAcentos(categoria.trim());
  const canonica = CATEGORIAS_OS_PROBLEMA.find((c) => removerAcentos(c) === alvo);
  return canonica || categoria;
};

const ITENS_MENU = [
  { id: 'dashboard-tv', label: 'Dashboard TV', icon: LayoutDashboard },
  { id: 'executivo', label: 'Painel Executivo', icon: LayoutDashboard },
  { id: 'faturamento', label: 'Faturamento', icon: DollarSign },
  { id: 'custos', label: 'Custos', icon: Layers },
  { id: 'manutencao', label: 'Manutencao', icon: Wrench },
  { id: 'mrp-aco', label: 'Planejamento Aço', icon: ShoppingCart },
  { id: 'rastreabilidade', label: 'Escada', icon: ScanLine },
  { id: 'configuracao', label: 'Configuração Global', icon: Settings },
];

const MANUTENCAO_KPIS = [];
const MANUTENCAO_PARADAS = [];
const FATURAMENTO_REFRESH_MS = 10000;

const getVapidKey = () => {
  if (typeof window !== 'undefined') {
    const fromWindow = window?.__APP_CONFIG__?.FIREBASE_VAPID_KEY;
    if (fromWindow) return fromWindow;
  }
  return import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
};

const SETORES_BASE = ['Industria', 'Transporte'];
const SETORES_INICIAIS = [];
const GESTORES_INICIAIS = ['Thalles'];
const MAQUINAS_INICIAIS = [];

const GUIA_OPERADOR_PASSOS = [
  {
    titulo: 'Abrir uma OS',
    texto: 'Clique em "Nova OS" no topo da tela, preencha os campos e salve. Isso cria a ordem na fila.',
  },
  {
    titulo: 'Assumir uma OS',
    texto: 'Na aba "Operador", use o botão "Assumir" na fila para pegar uma OS.',
  },
  {
    titulo: 'Acompanhar a OS',
    texto: 'Depois de assumir, ela aparece em "Minhas OS" para acompanhamento.',
  },
  {
    titulo: 'Atualizar status',
    texto: 'Use "Iniciar", "Pausar" ou "Finalizar" para registrar o andamento.',
  },
  {
    titulo: 'Editar detalhes',
    texto: 'Se precisar ajustar informações, clique em "Editar" dentro da OS.',
  },
];

const GUIA_OPERADOR_TOUR = [
  {
    id: 'nova-os',
    selector: '[data-tour="nova-os"]',
    titulo: 'Abrir uma OS',
    texto: 'Clique em "Nova OS" para registrar a ordem.',
    placement: 'bottom',
  },
  {
    id: 'nova-os-ativo',
    selector: '[data-tour="nova-os-ativo"]',
    titulo: 'Selecionar ativo',
    texto: 'Escolha o ativo que precisa de manutencao.',
    placement: 'right',
    requiresModal: true,
  },
  {
    id: 'nova-os-prioridade',
    selector: '[data-tour="nova-os-prioridade"]',
    titulo: 'Definir prioridade',
    texto: 'Informe o nivel de prioridade da OS.',
    placement: 'right',
    requiresModal: true,
  },
  {
    id: 'nova-os-sintoma',
    selector: '[data-tour="nova-os-sintoma"]',
    titulo: 'Sintoma',
    texto: 'Descreva o sintoma observado na maquina.',
    placement: 'right',
    requiresModal: true,
  },
  {
    id: 'nova-os-descricao',
    selector: '[data-tour="nova-os-descricao"]',
    titulo: 'Descrever o problema',
    texto: 'Escreva o que esta acontecendo e o impacto.',
    placement: 'right',
    requiresModal: true,
  },
  {
    id: 'nova-os-salvar',
    selector: '[data-tour="nova-os-salvar"]',
    titulo: 'Salvar OS',
    texto: 'Clique em Salvar OS para registrar.',
    placement: 'top',
    requiresModal: true,
  },
];

const GUIA_TREINAMENTO_SLIDES = [
  {
    titulo: 'Objetivo do treinamento',
    pontos: [
      'Padronizar a abertura de OS e garantir informacoes completas.',
      'Reduzir tempo de atendimento com dados claros e corretos.',
      'Facilitar o acompanhamento e a rastreabilidade das ordens.',
    ],
  },
  {
    titulo: 'Visao geral do fluxo',
    pontos: [
      'Acesse Manutencao > Operador.',
      'Clique em "Nova OS" para abrir o formulario.',
      'Preencha os campos obrigatorios e salve a OS.',
      'Acompanhe o andamento nas listas de ordens.',
    ],
  },
  {
    titulo: 'Passo 1: Abrir Nova OS',
    pontos: [
      'No topo da tela, clique em "Nova OS".',
      'Confirme que o formulario foi aberto antes de preencher.',
    ],
  },
  {
    titulo: 'Passo 2: Ativo e Setor',
    pontos: [
      'Selecione o Ativo (maquina/equipamento) correto.',
      'Confira o Setor para evitar direcionamento errado.',
    ],
  },
  {
    titulo: 'Passo 3: Prioridade e Tipo',
    pontos: [
      'Defina a Prioridade conforme impacto na producao.',
      'Escolha o Tipo (Corretiva, Preventiva, etc.).',
    ],
  },
  {
    titulo: 'Passo 4: Categoria e Impacto',
    pontos: [
      'Informe a Categoria do problema quando aplicavel.',
      'Defina o Impacto para apoiar a programacao.',
    ],
  },
  {
    titulo: 'Passo 5: Sintoma (obrigatorio)',
    pontos: [
      'Descreva o sintoma observado (ruido, falha, travamento, vazamento).',
      'Seja objetivo: o que esta acontecendo agora?',
    ],
  },
  {
    titulo: 'Passo 6: Descricao do problema',
    pontos: [
      'Detalhe o contexto do problema e o que ocorreu.',
      'Inclua informacoes de quando iniciou e impacto percebido.',
    ],
  },
  {
    titulo: 'Passo 7: Status da maquina',
    pontos: [
      'Marque se a maquina esta Rodando, Parada ou em Manutencao.',
      'Isso ajuda a priorizar o atendimento.',
    ],
  },
  {
    titulo: 'Passo 8: Foto e anexos',
    pontos: [
      'Anexe foto do problema/componente se possivel.',
      'Imagens aceleram o diagnostico e reduzem retrabalho.',
    ],
  },
  {
    titulo: 'Passo 9: Salvar OS',
    pontos: [
      'Revise os dados principais.',
      'Clique em "Salvar OS" para registrar.',
    ],
  },
  {
    titulo: 'Boas praticas',
    pontos: [
      'Evite termos genericos: descreva o sintoma com clareza.',
      'Use informacoes objetivas para acelerar o atendimento.',
      'Sempre anexe foto quando houver componente danificado.',
    ],
  },
  {
    titulo: 'Checklist rapido',
    pontos: [
      'Ativo correto selecionado.',
      'Prioridade definida.',
      'Sintoma preenchido.',
      'Descricao clara do problema.',
      'Status da maquina correto.',
      'OS salva com sucesso.',
    ],
  },
];

const GUIA_TREINAMENTO_IMAGENS = [];

// --- Componentes de UI ---

const CardInformativo = ({ titulo, valor, subtitulo, icon: Icon, corFundo, tendencia }) => (
  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
    <div className="flex items-stretch h-full">
      <div className={`${corFundo} w-2`}></div>
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-2">
          <div className={`p-2 rounded-lg bg-slate-100 text-slate-600`}>
            <Icon size={20} />
          </div>
          {tendencia !== undefined && (
            <span className={`text-xs font-bold ${tendencia > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {tendencia > 0 ? '+' : ''}{tendencia}%
            </span>
          )}
        </div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{titulo}</h3>
        {(() => {
          if (typeof valor === 'string' && valor.trim().startsWith('R$')) {
            const trimmed = valor.trim();
            return (
              <div className="flex items-end gap-1 mt-1">
                <span className="text-xs font-semibold text-slate-500">R$</span>
                <span className="text-xl font-bold text-slate-900 leading-none">
                  {trimmed.slice(2).trim()}
                </span>
              </div>
            );
          }
          return (
            <p className="text-xl font-bold text-slate-900 mt-1">{valor}</p>
          );
        })()}
        <p className="text-slate-400 text-[10px] mt-1 font-medium">{subtitulo}</p>
      </div>
    </div>
  </div>
);

const BarraProgresso = ({ rotulo, atual, total, unidade = "%", cor = "bg-blue-600", detalhe = "" }) => {
  const percentual = total > 0 ? Math.min(Math.round((atual / total) * 100), 100) : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between items-end mb-1">
        <div>
          <span className="text-slate-700 text-xs font-bold">{rotulo}</span>
          <span className="text-slate-400 text-[10px] ml-2">{detalhe}</span>
        </div>
        <span className="text-slate-900 text-xs font-bold">{atual}{unidade}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${cor} transition-all duration-1000`}
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
};

const parseValor = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const CUSTO_MESES_NORMALIZADOS = [
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

const CUSTO_INDICE_MESES = CUSTO_MESES_NORMALIZADOS.reduce((acc, mes, index) => {
  acc[mes] = index + 1;
  return acc;
}, {});

const removerAcentosTexto = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizarMesCusto = (texto) => {
  const limpo = removerAcentosTexto(texto);
  if (CUSTO_INDICE_MESES[limpo]) return limpo;
  return CUSTO_MESES_NORMALIZADOS.find((mes) => limpo.includes(mes)) || '';
};

const formatarRotuloMesCusto = (rotulo, fallbackYear) => {
  const raw = String(rotulo || '').trim();
  if (!raw) {
    return { raw: '', display: '', sortKey: '', mes: '', ano: fallbackYear || 0 };
  }
  const mes = normalizarMesCusto(raw);
  const ano = Number(raw.match(/(20\d{2})/)?.[1] || fallbackYear || 0);
  const numeroMes = mes ? CUSTO_INDICE_MESES[mes] || 0 : 0;
  const nomeMes = mes ? `${mes.charAt(0).toUpperCase()}${mes.slice(1)}` : raw;
  const display = ano && numeroMes ? `${nomeMes} ${ano}` : raw;
  const sortKey = ano && numeroMes ? `${ano}-${String(numeroMes).padStart(2, '0')}` : raw;
  return { raw, display, sortKey, mes, ano };
};

const obterValorPlanilhaPorMes = (valores, rotuloSelecionado) => {
  if (!valores || !rotuloSelecionado) return 0;
  if (Object.prototype.hasOwnProperty.call(valores, rotuloSelecionado)) {
    return parseValor(valores[rotuloSelecionado]);
  }
  const mesSelecionado = normalizarMesCusto(rotuloSelecionado);
  if (!mesSelecionado) return 0;
  const entrada = Object.entries(valores).find(([rotulo]) => normalizarMesCusto(rotulo) === mesSelecionado);
  return entrada ? parseValor(entrada[1]) : 0;
};

const normalizarTipoMovimento = (valor) => {
  const tipo = String(valor ?? '').trim().toLowerCase();
  return tipo === 'devolucao' ? 'devolucao' : 'venda';
};

const obterValorLiquido = (row) => {
  const valor = parseValor(row?.ValorTotal ?? row?.valorTotal);
  return normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento) === 'devolucao'
    ? -Math.abs(valor)
    : valor;
};

const obterQuantidadeLiquida = (row) => {
  const quantidade = parseValor(row?.Quantidade ?? row?.quantidade);
  return normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento) === 'devolucao'
    ? -Math.abs(quantidade)
    : quantidade;
};

const CFOP_DEVOLUCAO_LABELS = {
  '1201': 'Devolucao venda producao - dentro do estado',
  '2201': 'Devolucao venda producao - fora do estado',
  '1202': 'Devolucao venda revenda - dentro do estado',
  '2202': 'Devolucao venda revenda - fora do estado',
};

const formatarValorCurto = (valor) => {
  if (!Number.isFinite(valor)) return '-';
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)}k`;
  return `R$ ${Math.round(valor)}`;
};

const formatarMoeda = (valor) =>
  `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const parseEmissaoData = (valor) => {
  if (!valor && valor !== 0) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + valor * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof valor === 'string') {
    const texto = valor.trim();
    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    }
    const parsed = new Date(texto);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
};

const obterDataIsoUtc = (valor) => {
  const data = valor instanceof Date ? valor : parseEmissaoData(valor);
  if (!data || Number.isNaN(data.valueOf())) return '';
  const yyyy = data.getUTCFullYear();
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(data.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatarDataUtcPtBr = (valor) => {
  const iso = obterDataIsoUtc(valor);
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
};

const obterNumeroNota = (row) => {
  const valor =
    row?.['Num. da Nota'] ??
    row?.['Num da Nota'] ??
    row?.['Num. Nota'] ??
    row?.['Num Nota'] ??
    row?.NumNota ??
    row?.NumeroNota ??
    row?.numeroNota ??
    row?.NF ??
    row?.Nf ??
    row?.NotaFiscal ??
    row?.notaFiscal ??
    '';
  return valor === null || valor === undefined ? '' : String(valor).trim();
};

const obterMesKey = (row) => {
  const mesEmissao = row?.MesEmissao || row?.mesEmissao;
  if (typeof mesEmissao === 'string') {
    const match = mesEmissao.match(/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, mm, yyyy] = match;
      return {
        key: `${yyyy}-${String(mm).padStart(2, '0')}`,
        display: `${String(mm).padStart(2, '0')}/${yyyy}`,
      };
    }
  }
  const emissao = parseEmissaoData(row?.Emissao ?? row?.emissao);
  if (!emissao) return null;
  const yyyy = emissao.getUTCFullYear();
  const mm = String(emissao.getUTCMonth() + 1).padStart(2, '0');
  return { key: `${yyyy}-${mm}`, display: `${mm}/${yyyy}` };
};

const normalizarCodigoCliente = (valor) => {
  const digits = String(valor ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(6, '0');
};

const normalizarCodigoProduto = (valor) =>
  String(valor ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();

const normalizarDescricaoProduto = (valor) => {
  const texto = String(valor ?? '').trim();
  if (!texto || texto === '0') return '';
  if (/^\*+$/.test(texto)) return '';
  return texto;
};

const ensureSpacePdf = (doc, pageHeight, currentY, needed) => {
  if (currentY + needed > pageHeight - 16) {
    doc.addPage();
    return 24;
  }
  return currentY;
};

const obterFilialFaturamento = (row, opcoes = {}) => {
  const { descricaoOverride = '', padrao = 'Sem filial' } = opcoes;
  const descricao = normalizarDescricaoProduto(
    row?.Descricao ?? row?.descricao ?? descricaoOverride
  );
  if (/\bDW\b/i.test(descricao)) return '04';
  const filial = row?.Filial ?? row?.filial;
  if (filial === null || filial === undefined || String(filial).trim() === '') {
    return padrao;
  }
  return String(filial);
};

const normalizarCodigoVendedor = (valor) => {
  const texto = String(valor ?? '').trim().toUpperCase();
  if (!texto) return '';
  if (/^\d+$/.test(texto)) {
    return texto.length < 3 ? texto.padStart(3, '0') : texto;
  }
  return texto;
};

const UF_CENTROID = {
  AC: [-9.0238, -70.812],
  AL: [-9.5713, -36.7819],
  AM: [-3.1019, -60.025],
  AP: [1.4117, -51.773],
  BA: [-12.96, -38.51],
  CE: [-3.7172, -38.5434],
  DF: [-15.7939, -47.8828],
  ES: [-20.3155, -40.3128],
  GO: [-16.6869, -49.2648],
  MA: [-2.5307, -44.3068],
  MG: [-19.9167, -43.9345],
  MS: [-20.4697, -54.6201],
  MT: [-15.6009, -56.0974],
  PA: [-1.4558, -48.4902],
  PB: [-7.115, -34.8641],
  PE: [-8.0476, -34.877],
  PI: [-5.0892, -42.8016],
  PR: [-25.4284, -49.2733],
  RJ: [-22.9068, -43.1729],
  RN: [-5.7945, -35.211],
  RO: [-8.7612, -63.9004],
  RR: [2.8235, -60.6753],
  RS: [-30.0346, -51.2177],
  SC: [-27.5954, -48.548],
  SE: [-10.9472, -37.0731],
  SP: [-23.5505, -46.6333],
  TO: [-10.2491, -48.3243],
};


const normalizarIdFirestore = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .trim();

const normalizarTexto = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const sugerirNomePorEmail = (email) => {
  const local = String(email || '').split('@')[0] || '';
  if (!local) return '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ')
    .trim();
};

const criarIdLogManutencao = () =>
  `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseNumeroPlanilha = (valor) => {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined) return 0;
  const texto = String(valor).trim();
  if (!texto) return 0;
  const hasComma = texto.includes(',');
  const hasDot = texto.includes('.');
  let cleaned = texto;
  if (hasComma) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
  }
  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const encontrarCabecalho = (rows, requiredKeys) => {
  const required = requiredKeys.map((k) => normalizarTexto(k));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map((cell) => normalizarTexto(cell));
    const matches = required.filter((key) => normalized.includes(key));
    if (matches.length >= Math.min(2, required.length)) {
      return i;
    }
  }
  return -1;
};

const rowsToObjects = (rows, headerIndex) => {
  if (headerIndex < 0) return [];
  const header = (rows[headerIndex] || []).map((cell) => String(cell ?? '').trim());
  const dataRows = rows.slice(headerIndex + 1);
  return dataRows
    .map((row) => {
      const obj = {};
      header.forEach((key, idx) => {
        if (!key) return;
        obj[key] = row[idx] ?? '';
      });
      return obj;
    })
    .filter((row) => Object.values(row).some((val) => String(val ?? '').trim()));
};

const encontrarSheet = (planilhas, includes) => {
  const entries = Object.entries(planilhas || {});
  const includesList = Array.isArray(includes) ? includes : [includes];
  for (const [name, rows] of entries) {
    const normal = normalizarTexto(name).replace(/\s+/g, '');
    const match = includesList.every((item) => normal.includes(normalizarTexto(item).replace(/\s+/g, '')));
    if (match) return rows;
  }
  return null;
};

const CFOP_SAIDA_TABLE = [
  {
    cfop: '5101',
    descricaoFiscal: 'Venda de produção do estabelecimento',
    pratica: 'Venda de produto fabricado pela própria empresa, dentro do estado',
    faturamento: '? Sim',
  },
  {
    cfop: '5102',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros',
    pratica: 'Revenda de mercadoria comprada, dentro do estado',
    faturamento: '? Sim',
  },
  {
    cfop: '6101',
    descricaoFiscal: 'Venda de produção do estabelecimento (interestadual)',
    pratica: 'Venda de produto fabricado, para outro estado',
    faturamento: '? Sim',
  },
  {
    cfop: '6102',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros (interestadual)',
    pratica: 'Revenda para outro estado',
    faturamento: '? Sim',
  },
  {
    cfop: '6107',
    descricaoFiscal: 'Venda de produção fora do estado sem destaque de ICMS',
    pratica: 'Venda interestadual com tratamento fiscal específico',
    faturamento: '?? Depende (normalmente não)',
  },
  {
    cfop: '5401',
    descricaoFiscal: 'Venda de produção do estabelecimento com ST',
    pratica: 'Venda de produto fabricado com ICMS-ST',
    faturamento: '? Sim (bruto)',
  },
  {
    cfop: '5403',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros com ST',
    pratica: 'Revenda com ICMS-ST',
    faturamento: '? Sim (bruto)',
  },
  {
    cfop: '6401',
    descricaoFiscal: 'Venda de produção do estabelecimento com ST (interestadual)',
    pratica: 'Venda interestadual com ST',
    faturamento: '? Sim (bruto)',
  },
  {
    cfop: '5151',
    descricaoFiscal: 'Transferencia de producao do estabelecimento',
    pratica: 'Transferencia entre filiais da mesma empresa (producao)',
    faturamento: '? Sim',
  },
  {
    cfop: '5152',
    descricaoFiscal: 'Transferência de mercadoria entre estabelecimentos',
    pratica: 'Envio entre filiais da mesma empresa',
    faturamento: '? Não',
  },
  {
    cfop: '5405',
    descricaoFiscal: 'Transferência de produção do estabelecimento com ST',
    pratica: 'Transferência interna com ST',
    faturamento: '? Não',
  },
  {
    cfop: '5409',
    descricaoFiscal: 'Transferência de mercadoria adquirida de terceiros com ST',
    pratica: 'Transferência interna de mercadoria com ST',
    faturamento: '? Não',
  },
  {
    cfop: '5915',
    descricaoFiscal: 'Remessa simbolica / retorno de industrializacao',
    pratica: 'Ajuste fiscal/logistico',
    faturamento: 'NAO',
  },
  {
    cfop: '6108',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros com ST (interestadual)',
    pratica: 'Venda interestadual com ST e regra específica',
    faturamento: '?? Depende',
  },
  {
    cfop: '6109',
    descricaoFiscal: 'Outras vendas de mercadorias (interestadual)',
    pratica: 'Venda com tratamento fiscal especial',
    faturamento: '? Sim',
  },
  {
    cfop: '6110',
    descricaoFiscal: 'Venda para ZFM/ALC de mercadoria adquirida de terceiros',
    pratica: 'Venda interestadual para ZFM/ALC (revenda)',
    faturamento: '? Sim',
  },
  {
    cfop: '5201',
    descricaoFiscal: 'Devolução de compra para industrialização',
    pratica: 'Retorno de mercadoria ao fornecedor',
    faturamento: '? Não',
  },
  {
    cfop: '6910',
    descricaoFiscal: 'Bonificação / doação / brinde',
    pratica: 'Saída sem cobrança',
    faturamento: '? Não',
  },
  {
    cfop: '6915',
    descricaoFiscal: 'Remessa simbólica / retorno de industrialização',
    pratica: 'Ajuste fiscal/logístico',
    faturamento: '? Não',
  },
  {
    cfop: '6901',
    descricaoFiscal: 'Remessa para industrialização fora do estabelecimento',
    pratica: 'Envio para industrialização em terceiro',
    faturamento: '? Não',
  },
];

const CFOP_FILTER_OPTIONS = CFOP_SAIDA_TABLE.map((item) => item.cfop);
const CFOP_FATURAMENTO_SET = new Set(['5101', '5102', '6101', '6102', '5401', '5403', '6401', '6107', '5151', '6109', '6110']);
const CFOP_DEFAULTS = Array.from(CFOP_FATURAMENTO_SET);

const CfopFilterSelector = ({
  selected = [],
  onSelect,
  label = 'CFOP',
  className = '',
  options = CFOP_FILTER_OPTIONS,
  infoMap = null,
}) => {
  const normalizedSelected = selected
    .map((item) => String(item ?? '').trim())
    .filter((item) => item);
  const selectedSet = new Set(normalizedSelected);
  const cfopInfo = CFOP_SAIDA_TABLE.reduce((acc, item) => { acc[item.cfop] = item; return acc; }, {});
  const info = infoMap || cfopInfo;

  const handleSelect = (option) => {
    if (typeof onSelect === 'function') {
      onSelect(option);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 ${className}`}
    >
      <span className="text-slate-400 whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={() => handleSelect('Todos')}
        className={`px-2.5 py-1 rounded-full transition-all ${
          selectedSet.size === 0
            ? 'bg-blue-600 text-white shadow'
            : 'bg-slate-100 text-slate-500 hover:text-slate-700'
        }`}
      >
        Todos{selectedSet.size ? ` (${selectedSet.size})` : ''}
      </button>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          title={info[option] ? `CFOP ${option} - ${info[option].descricaoFiscal}\n${info[option].pratica}\nFaturamento: ${info[option].faturamento}` : `CFOP ${option}`}
          onClick={() => handleSelect(option)}
          className={`px-2.5 py-1 rounded-full transition-all ${
            selectedSet.has(option)
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-100 text-slate-500 hover:text-slate-700'
          } ${CFOP_FATURAMENTO_SET.has(option) ? 'ring-1 ring-emerald-400/60' : ''}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

const gerarIdColaborador = (nome, setor) =>
  `${normalizarTexto(nome)}||${normalizarTexto(setor)}`;

const isFolgaColetiva = (dataISO) =>
  dataISO >= '2025-12-25' && dataISO <= '2026-01-04';

const DATAS_SEM_APONTAMENTO = new Set();

const isFinalDeSemana = (dataISO) => {
  const data = new Date(`${dataISO}T00:00:00`);
  const diaSemana = data.getDay();
  return diaSemana === 0 || diaSemana === 6;
};

const isDataSemApontamento = (dataISO) =>
  DATAS_SEM_APONTAMENTO.has(dataISO);

const isDiaDesconsiderado = (dataISO) =>
  isFolgaColetiva(dataISO) || isFinalDeSemana(dataISO);

// --- Aplicação Principal ---

const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700" style={{ pointerEvents: 'none' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [perfilManutencao, setPerfilManutencao] = useState(null);
  const [perfilNomeModalOpen, setPerfilNomeModalOpen] = useState(false);
  const [perfilNomeInput, setPerfilNomeInput] = useState('');
  const [perfilNomeErro, setPerfilNomeErro] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('executivo');
  const [subAbaGestao, setSubAbaGestao] = useState('lista');
  const [subAbaConfig, setSubAbaConfig] = useState('processos');
  const [subAbaFaturamento, setSubAbaFaturamento] = useState('atual');
  const [subAbaManutencao, setSubAbaManutencao] = useState('resumo');
  const [dashboardView, setDashboardView] = useState('faturamento');
  const [dashboardFilialIndex, setDashboardFilialIndex] = useState(0);
  const [metaFilialMap, setMetaFilialMap] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_meta_filial') || '{}';
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [metaConfigOpen, setMetaConfigOpen] = useState(false);
  const [metaConfigDraft, setMetaConfigDraft] = useState({});
  const [metaConfigSaving, setMetaConfigSaving] = useState(false);
  const [metaConfigErro, setMetaConfigErro] = useState('');
  const [filtroFilial2025, setFiltroFilial2025] = useState('Todas');
  const [filtroCfops2025, setFiltroCfops2025] = useState(CFOP_DEFAULTS);
  const [guiaOperadorOpen, setGuiaOperadorOpen] = useState(false);
  const [guiaOperadorStep, setGuiaOperadorStep] = useState(0);
  const [tourOperadorOpen, setTourOperadorOpen] = useState(false);
  const [tourOperadorStep, setTourOperadorStep] = useState(0);
  const [tourOperadorPos, setTourOperadorPos] = useState(null);
  const [filtroFilial, setFiltroFilial] = useState('08');
  const [filtroFilialVend, setFiltroFilialVend] = useState('Todas');
  const [filtroCfops, setFiltroCfops] = useState(CFOP_DEFAULTS);
  const [mostrarFiltroCfop, setMostrarFiltroCfop] = useState(false);
  const [mostrarFiltroFaturamento, setMostrarFiltroFaturamento] = useState(false);
  const [diasFaturamentoSelecionados, setDiasFaturamentoSelecionados] = useState([]);
  const [faturamentoTabelaView, setFaturamentoTabelaView] = useState('dia');
  const [faturamentoAno, setFaturamentoAno] = useState(() =>
    String(new Date().getFullYear())
  );
  const [faturamentoMes, setFaturamentoMes] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  const [faturamentoInicio, setFaturamentoInicio] = useState('');
  const [faturamentoFim, setFaturamentoFim] = useState('');
  const [filtroGraficoProduto, setFiltroGraficoProduto] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('Todos');
  const [faturamentoAtualizadoEm, setFaturamentoAtualizadoEm] = useState(null);
  const [faturamentoArquivoEm, setFaturamentoArquivoEm] = useState(null);
  const [popupIndex, setPopupIndex] = useState(0);
  const [ultimoPopupKey, setUltimoPopupKey] = useState(null);
  const [popupDestaqueAt, setPopupDestaqueAt] = useState(0);
  const [somAtivo, setSomAtivo] = useState(false);
  const audioCtxRef = useRef(null);
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [notifToken, setNotifToken] = useState('');
  const [notifError, setNotifError] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia) {
      return window.matchMedia('(max-width: 900px)').matches;
    }
    return window.innerWidth < 900;
  });
  const [showMobileIntro, setShowMobileIntro] = useState(false);

  // --- Estados de Dados ---
  const [listaSetores, setListaSetores] = useState([]);
  const [listaGestores, setListaGestores] = useState(GESTORES_INICIAIS);
  const [listaMaquinas, setListaMaquinas] = useState(MAQUINAS_INICIAIS);
  const [maquinasErro, setMaquinasErro] = useState('');
  const [filtroAtivos, setFiltroAtivos] = useState('Todos');
  const [setoresErro, setSetoresErro] = useState('');
  const [setoresCarregadosFirestore, setSetoresCarregadosFirestore] = useState(false);
  const [listaProcessos, setListaProcessos] = useState([]);
  const [processosErro, setProcessosErro] = useState('');
  const [colaboradores, setColaboradores] = useState([]);
  const [funcionariosFirestore, setFuncionariosFirestore] = useState([]);
  const [faturamentoDados, setFaturamentoDados] = useState({
    carregando: true,
    erro: null,
    total: 0,
    porGrupo: [],
    porMes: [],
  });
  const [faturamentoLinhas, setFaturamentoLinhas] = useState([]);
  const [gruposExpandidos, setGruposExpandidos] = useState({});
  const [paretoSelecionado, setParetoSelecionado] = useState(null);
  const [paretoHover, setParetoHover] = useState(null);
  const [paretoTooltip, setParetoTooltip] = useState(null);
  const [mesTooltip, setMesTooltip] = useState(null);
  const [portfolioTooltip, setPortfolioTooltip] = useState(null);
  const [portfolioHover, setPortfolioHover] = useState(null);
  const [dataLancamento, setDataLancamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [registrosPorData, setRegistrosPorData] = useState({});
  const [mesHistorico, setMesHistorico] = useState(() => new Date().getMonth());
  const [diaHistorico, setDiaHistorico] = useState(null);
  const [anoHistorico, setAnoHistorico] = useState(2026);
  const [filtroSupervisor, setFiltroSupervisor] = useState('Todos');
  const [filtroSetor, setFiltroSetor] = useState('Todos');
  const [filtroTipoDia, setFiltroTipoDia] = useState('Todos');
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapModalInstance, setMapModalInstance] = useState(null);
  const [modalTabelaCustosOpen, setModalTabelaCustosOpen] = useState(false);
  const [modalLancamento, setModalLancamento] = useState(null);
  const [modalTipo, setModalTipo] = useState('Presente');
  const [modalTempo, setModalTempo] = useState('02:00');
  const [modalErro, setModalErro] = useState('');
  const [modalFeriasOpen, setModalFeriasOpen] = useState(false);
  const [feriasColaboradorId, setFeriasColaboradorId] = useState('');
  const [feriasInicio, setFeriasInicio] = useState('');
  const [feriasFim, setFeriasFim] = useState('');
  const [feriasErro, setFeriasErro] = useState('');
  const [modalRapidoFiltroOpen, setModalRapidoFiltroOpen] = useState(false);
  const [custoDetalheModalOpen, setCustoDetalheModalOpen] = useState(false);
  const [custoDetalheItem, setCustoDetalheItem] = useState(null);
  const [custoDetalhePedidoModalOpen, setCustoDetalhePedidoModalOpen] = useState(false);
  const [custoDetalhePedidoSelecionado, setCustoDetalhePedidoSelecionado] = useState(null);
  const [custoPeriodoInicio, setCustoPeriodoInicio] = useState('');
  const [custoPeriodoFim, setCustoPeriodoFim] = useState('');
  const [custoFiltroMesFaturamento, setCustoFiltroMesFaturamento] = useState('');
  const [custoFiltroMes, setCustoFiltroMes] = useState('');
  const [custoFiltroFilial, setCustoFiltroFilial] = useState('Todas');
  const [custoFiltroGrupo, setCustoFiltroGrupo] = useState('Todos');
  const [custoFiltroFonte, setCustoFiltroFonte] = useState('Todas');
  const [custoFiltroSku, setCustoFiltroSku] = useState('');
  const [custoFiltroCliente, setCustoFiltroCliente] = useState('');
  const [bensSeedLoading, setBensSeedLoading] = useState(false);
  const [bensSeedError, setBensSeedError] = useState('');
  const [bensSeedDone, setBensSeedDone] = useState(false);
  const [rapidoSupervisor, setRapidoSupervisor] = useState('');
  const [rapidoSupervisorErro, setRapidoSupervisorErro] = useState('');
  const [modoRapidoOpen, setModoRapidoOpen] = useState(false);
  const [modoRapidoIndex, setModoRapidoIndex] = useState(0);
  const [filtroAtivoMobile, setFiltroAtivoMobile] = useState('');
  const [novaOsFiltroSetor, setNovaOsFiltroSetor] = useState('Todos');
  const [relatorioInicio, setRelatorioInicio] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [relatorioFim, setRelatorioFim] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [manutencaoModalOpen, setManutencaoModalOpen] = useState(false);
  const [statusMaquinaPromptOpen, setStatusMaquinaPromptOpen] = useState(false);
  const [manutencaoDetalheModal, setManutencaoDetalheModal] = useState(null);
  const [manutencaoOrdens, setManutencaoOrdens] = useState([]);
  const [manutencaoOrdensLoading, setManutencaoOrdensLoading] = useState(true);
  const [manutencaoOrdensError, setManutencaoOrdensError] = useState('');
  const [manutencaoLogs, setManutencaoLogs] = useState([]);
  const [manutencaoLogsLoading, setManutencaoLogsLoading] = useState(true);
  const [manutencaoLogsError, setManutencaoLogsError] = useState('');
  const [manutencaoSaveError, setManutencaoSaveError] = useState('');
  const [manutencaoFiltroStatus, setManutencaoFiltroStatus] = useState('Todas');
  const [manutencaoFiltroPrioridade, setManutencaoFiltroPrioridade] = useState('Todas');
  const [manutencaoFiltroSetor, setManutencaoFiltroSetor] = useState('Todos');
  const [manutencaoBusca, setManutencaoBusca] = useState('');
  const [manutencaoEditId, setManutencaoEditId] = useState(null);
  const [assumirModalOs, setAssumirModalOs] = useState(null);
  const [assumirResponsavel, setAssumirResponsavel] = useState('');
  const [assumirErro, setAssumirErro] = useState('');
  const [reaberturaContexto, setReaberturaContexto] = useState(null);
  const [reaberturaStatusDestino, setReaberturaStatusDestino] = useState('Contestada');
  const [reaberturaContestar, setReaberturaContestar] = useState(true);
  const [reaberturaMotivo, setReaberturaMotivo] = useState('');
  const [reaberturaErro, setReaberturaErro] = useState('');
  const [processoEditOpen, setProcessoEditOpen] = useState(false);
  const [processoEditId, setProcessoEditId] = useState(null);
  const [processoEditValue, setProcessoEditValue] = useState('');
  const [novoAtivoCc, setNovoAtivoCc] = useState('Industria');
  const [novoAtivoProcesso, setNovoAtivoProcesso] = useState('');
  const [novaOsFotoFile, setNovaOsFotoFile] = useState(null);
  const [novaOsFotoPreview, setNovaOsFotoPreview] = useState('');
  const novaOsDefaults = {
    ativo: '',
    setor: '',
    processo: '',
    prioridade: 'Media',
    tipo: 'Corretiva',
    categoria: '',
    sintoma: '',
    componente: '',
    parada: 'Nao',
    tempoParada: '',
    impacto: 'Medio',
    causaProvavel: '',
    acaoImediata: '',
    solicitante: '',
    dataFalha: '',
    tempoEstimado: '',
    custoEstimado: '',
    status: 'Aberta',
    statusMaquina: 'Rodando',
    responsavel: '',
    descricao: '',
    fotoUrl: '',
    fechadaEm: '',
    createdByEmail: '',
    createdByName: '',
  };
  const [novaOsForm, setNovaOsForm] = useState(novaOsDefaults);

  const abrirNovaOs = () => {
    setManutencaoEditId(null);
    setNovaOsForm(novaOsDefaults);
    setNovaOsFotoFile(null);
    setNovaOsFotoPreview('');
    setManutencaoSaveError('');
    setNovaOsFiltroSetor('Todos');
    setStatusMaquinaPromptOpen(true);
  };

  const handleSelecionarStatusMaquinaNovaOs = (statusMaquina) => {
    setNovaOsForm({
      ...novaOsDefaults,
      statusMaquina,
    });
    setNovaOsFiltroSetor('Todos');
    setFiltroAtivoMobile('');
    setStatusMaquinaPromptOpen(false);
    setManutencaoModalOpen(true);
  };

  const handleNovaOsChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ativo') {
      const valorNorm = normalizarTexto(value);
      const maquina = listaMaquinas.find(
        (item) => normalizarTexto(item.nome) === valorNorm
      );
      setNovaOsForm((prev) => ({
        ...prev,
        ativo: value,
        setor: maquina?.setor || prev.setor,
        processo: maquina?.processo || '',
      }));
      return;
    }
    setNovaOsForm((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (!novaOsFotoPreview) return undefined;
    return () => {
      URL.revokeObjectURL(novaOsFotoPreview);
    };
  }, [novaOsFotoPreview]);

  const handleNovaOsFotoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (novaOsFotoPreview) {
      URL.revokeObjectURL(novaOsFotoPreview);
    }
    setNovaOsFotoFile(file);
    setNovaOsFotoPreview(file ? URL.createObjectURL(file) : '');
  };

  const getFirebaseSaveErrorMessage = (err) => {
    const code = err?.code || '';
    const rawMessage = err?.message || '';
    if (
      code === 'permission-denied' ||
      code === 'storage/unauthorized' ||
      rawMessage.toLowerCase().includes('missing or insufficient permissions')
    ) {
      return 'Sem permissao no Firebase para concluir esta acao. Se a OS estiver com foto, verifique as regras do Storage.';
    }
    return rawMessage || code || 'Nao foi possivel salvar a OS.';
  };

  const resetManutencaoFormState = () => {
    setManutencaoModalOpen(false);
    setManutencaoEditId(null);
    setNovaOsFotoFile(null);
    setNovaOsFotoPreview('');
    setNovaOsForm(novaOsDefaults);
  };

  const persistirOs = async ({
    osId,
    payload,
    fotoUploadFalhou = false,
    logConfig = null,
  }) => {
    await setDoc(doc(db, 'manutencao_os', osId), payload);
    setManutencaoOrdens((prev) => {
      const next = prev.filter((item) => item.id !== osId);
      return [{ id: osId, ...payload }, ...next];
    });
    resetManutencaoFormState();
    if (logConfig) {
      await registrarLogManutencao({
        ordemId: osId,
        ativo: payload.ativo,
        setor: payload.setor,
        ...logConfig,
      });
    }
    if (fotoUploadFalhou) {
      window.alert('A OS foi salva sem a foto. O Firebase Storage recusou o upload por permissao.');
    }
  };

  const handleNovaOsSubmit = async (e) => {
    e.preventDefault();
    setManutencaoSaveError('');
    if (!authUser) {
      setManutencaoSaveError('Faca login para salvar a OS.');
      return;
    }
    if (!isAllowedDomain) {
      setManutencaoSaveError('Sem permissao para salvar.');
      return;
    }
    if (!String(novaOsForm.ativo || '').trim()) {
      setManutencaoSaveError('Selecione ou informe o ativo da OS.');
      return;
    }
    const osId = manutencaoEditId || `os-${Date.now()}`;
    const ordemAtual = manutencaoEditId
      ? manutencaoOrdens.find((item) => item.id === manutencaoEditId)
      : null;
    let fotoUrl = novaOsForm.fotoUrl || '';
    let fotoUploadFalhou = false;
    if (novaOsFotoFile) {
      try {
        const safeName = `${Date.now()}-${novaOsFotoFile.name}`;
        const storageRef = ref(storage, `manutencao_os/${osId}/${safeName}`);
        await uploadBytes(storageRef, novaOsFotoFile);
        fotoUrl = await getDownloadURL(storageRef);
      } catch (uploadErr) {
        fotoUploadFalhou = true;
        console.error('Erro ao enviar foto da OS:', uploadErr);
      }
    }
    let statusMaquinaFinal = novaOsForm.statusMaquina;
    let fechadaEmFinal =
      novaOsForm.status === 'Finalizada'
        ? novaOsForm.fechadaEm || new Date().toISOString()
        : '';
    if (novaOsForm.status === 'Finalizada') {
      const liberada = window.confirm('A maquina foi liberada?');
      statusMaquinaFinal = liberada ? 'Rodando' : 'Parada';
    }
    const payload = {
      ativo: novaOsForm.ativo,
      setor: novaOsForm.setor,
      processo: novaOsForm.processo || '',
      prioridade: novaOsForm.prioridade,
      tipo: novaOsForm.tipo,
      categoria: novaOsForm.categoria,
      sintoma: novaOsForm.sintoma,
      componente: novaOsForm.componente,
      parada: novaOsForm.parada,
      tempoParada: novaOsForm.tempoParada,
      impacto: novaOsForm.impacto,
      causaProvavel: novaOsForm.causaProvavel,
      acaoImediata: novaOsForm.acaoImediata,
      solicitante: novaOsForm.solicitante,
      dataFalha: novaOsForm.dataFalha,
      tempoEstimado: novaOsForm.tempoEstimado,
      custoEstimado: novaOsForm.custoEstimado,
      status: novaOsForm.status,
      statusMaquina: statusMaquinaFinal,
      responsavel: manutencaoEditId
        ? novaOsForm.responsavel || ordemAtual?.responsavel || ''
        : currentUserLabel,
      descricao: novaOsForm.descricao,
      fotoUrl,
      createdByEmail: manutencaoEditId
        ? novaOsForm.createdByEmail || authUser?.email || ''
        : authUser?.email || '',
      createdByName: manutencaoEditId
        ? novaOsForm.createdByName || currentUserLabel
        : currentUserLabel,
      createdAt: manutencaoEditId ? novaOsForm.createdAt : new Date().toISOString(),
      fechadaEm: fechadaEmFinal,
      updatedAt: new Date().toISOString(),
    };

    const statusAnterior = ordemAtual?.status || '';
    const statusNovo = payload.status || '';
    const reabrindoFinalizada =
      normalizarTexto(statusAnterior) === 'finalizada' &&
      normalizarTexto(statusNovo) !== 'finalizada';

    if (reabrindoFinalizada) {
      setReaberturaContexto({
        tipo: 'submit',
        osId,
        payload,
        fotoUploadFalhou,
        ordem: ordemAtual,
      });
      setReaberturaStatusDestino(statusNovo || 'Contestada');
      setReaberturaContestar(true);
      setReaberturaMotivo('');
      setReaberturaErro('');
      return;
    }

    try {
      const logConfig = !manutencaoEditId
        ? {
            acao: 'os_aberta',
            statusNovo,
            descricao: `Abriu a OS ${osId}.`,
          }
        : statusAnterior !== statusNovo
          ? {
              acao: 'status_alterado',
              statusAnterior,
              statusNovo,
              descricao: `Alterou o status de ${statusAnterior || '-'} para ${statusNovo || '-'}.`,
            }
          : {
              acao: 'os_editada',
              statusAnterior,
              statusNovo,
              descricao: `Editou a OS ${osId}.`,
            };
      await persistirOs({ osId, payload, fotoUploadFalhou, logConfig });
    } catch (err) {
      console.error('Erro ao salvar OS:', err);
      setManutencaoSaveError(getFirebaseSaveErrorMessage(err));
    }
  };

  const handleEditarOs = (ordem) => {
    setManutencaoEditId(ordem.id);
    setNovaOsForm({
      ativo: ordem.ativo || '',
      setor: ordem.setor || '',
      processo: ordem.processo || '',
      prioridade: ordem.prioridade || 'Media',
      tipo: ordem.tipo || 'Corretiva',
      categoria: ordem.categoria || '',
      sintoma: ordem.sintoma || '',
      componente: ordem.componente || '',
      parada: ordem.parada || 'Nao',
      tempoParada: ordem.tempoParada || '',
      impacto: ordem.impacto || 'Medio',
      causaProvavel: ordem.causaProvavel || '',
      acaoImediata: ordem.acaoImediata || '',
      solicitante: ordem.solicitante || '',
      dataFalha: ordem.dataFalha || '',
      tempoEstimado: ordem.tempoEstimado || '',
      custoEstimado: ordem.custoEstimado || '',
      status: ordem.status || 'Aberta',
      statusMaquina: ordem.statusMaquina || 'Rodando',
      responsavel: ordem.responsavel || '',
      descricao: ordem.descricao || '',
      fotoUrl: ordem.fotoUrl || '',
      fechadaEm: ordem.fechadaEm || '',
      createdByEmail: ordem.createdByEmail || '',
      createdByName: ordem.createdByName || '',
      createdAt: ordem.createdAt || new Date().toISOString(),
    });
    setNovaOsFotoFile(null);
    setNovaOsFotoPreview('');
    setManutencaoSaveError('');
    setManutencaoModalOpen(true);
  };

  const handleVisualizarOs = (ordem) => {
    setManutencaoDetalheModal(ordem);
    registrarLogManutencao({
      acao: 'os_visualizada',
      ordem,
      ordemId: ordem.id,
      statusNovo: ordem.status || '',
      descricao: `Abriu os detalhes da OS ${ordem.id}.`,
    }).catch(() => {});
  };

  const handleExcluirOs = async (ordem) => {
    if (!canDeleteOs) {
      alert('Sem permissao para excluir OS.');
      return;
    }
    if (!window.confirm(`Tem certeza que deseja excluir a OS ${ordem.id}?`)) return;
    try {
      await deleteDoc(doc(db, 'manutencao_os', ordem.id));
      setManutencaoOrdens((prev) => prev.filter((o) => o.id !== ordem.id));
      registrarLogManutencao({
        acao: 'os_excluida',
        ordem,
        ordemId: ordem.id,
        statusAnterior: ordem.status || '',
        statusNovo: 'Excluida',
        descricao: `Excluiu a OS ${ordem.id}.`,
        extra: { deletedAt: new Date().toISOString() },
      }).catch((logErr) => {
        console.error('Erro ao registrar log de exclusao:', logErr);
      });
    } catch (err) {
      console.error('Erro ao excluir OS:', err);
      alert('Erro ao excluir a ordem de serviço.');
    }
  };

  const handleExcluirTodasOs = async () => {
    if (!canDeleteOs) {
      alert('Sem permissao para excluir OS.');
      return;
    }
    if (!window.confirm('Tem certeza que deseja EXCLUIR TODAS as ordens de serviço? Esta ação não pode ser desfeita!')) return;
    if (!window.confirm('CONFIRMAÇÃO FINAL: Isso apagará TODAS as ordens. Continuar?')) return;
    try {
      const batch = writeBatch(db);
      manutencaoOrdens.forEach((ordem) => {
        batch.delete(doc(db, 'manutencao_os', ordem.id));
      });
      await batch.commit();
      setManutencaoOrdens([]);
    } catch (err) {
      console.error('Erro ao excluir todas as OS:', err);
      alert('Erro ao excluir as ordens de serviço.');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
      if (user) {
        setLoginError('');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) {
      setPerfilManutencao(null);
      setPerfilNomeModalOpen(false);
      setPerfilNomeInput('');
      setPerfilNomeErro('');
      return;
    }

    let active = true;
    const carregarPerfil = async () => {
      try {
        const snap = await getDoc(doc(db, 'manutencao_usuarios', authUser.uid));
        if (!active) return;
        const perfil = snap.exists() ? snap.data() : null;
        const nomeSalvo = String(perfil?.nome || '').trim();
        setPerfilManutencao(perfil);
        setPerfilNomeInput(nomeSalvo || authUser.displayName || sugerirNomePorEmail(authUser.email));
        setPerfilNomeErro('');
        setPerfilNomeModalOpen(!nomeSalvo);
      } catch (err) {
        if (!active) return;
        setPerfilManutencao(null);
        setPerfilNomeInput(authUser.displayName || sugerirNomePorEmail(authUser.email));
        setPerfilNomeErro('');
        setPerfilNomeModalOpen(true);
      }
    };

    carregarPerfil();
    return () => {
      active = false;
    };
  }, [authUser?.uid, authUser?.email, authUser?.displayName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    isSupported()
      .then((supported) => {
        if (active) setNotifSupported(supported);
      })
      .catch(() => {
        if (active) setNotifSupported(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!messaging || !notifSupported) return;
    const unsubscribe = onMessage(messaging, (payload) => {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const title = payload?.notification?.title || 'Atualizacao de OS';
      const options = {
        body: payload?.notification?.body || '',
        data: payload?.data || {},
      };
      try {
        new Notification(title, options);
      } catch (err) {
        // Ignora se o navegador bloquear
      }
    });
    return unsubscribe;
  }, [notifSupported, messaging]);

  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isAllowedDomain =
    authUser?.email?.toLowerCase()?.endsWith('@metalosa.com.br');
  const manutencaoRestritaEmails = [
    'manutencao@metalosa.com.br',
    'wilson@metalosa.com.br',
    'breno.feitosa@metalosa.com.br',
    'alexandre.mendonca@metalosa.com.br',
    'carlos.antonio@metalosa.com.br',
    'ivani.ferreira@metalosa.com.br',
    'renato.themoteo@metalosa.com.br',
    'sandro.lima@metalosa.com.br',
    'sergio.lafaiete@metalosa.com.br',
    'edneis.souza@metalosa.com.br',
    'amilton.rufino@metalosa.com.br',
    'altair.santos@metalosa.com.br',
    'nilton.pereira@metalosa.com.br',
  ];
  const isManutencaoOnly = manutencaoRestritaEmails.includes(
    authUser?.email?.toLowerCase()
  );
  const isManutencaoOperador = [
    'manutencao@metalosa.com.br',
    'pcp@metalosa.com.br',
    'wilson@metalosa.com.br',
    'engenharia@metalosa.com.br',
  ].includes(authUser?.email?.toLowerCase());
  const canViewEquipeStatus = [
    'pcp@metalosa.com.br',
    'wilson@metalosa.com.br',
    'engenharia@metalosa.com.br',
  ].includes(authUser?.email?.toLowerCase());
  const isPortfolioDisabled = true;
  const currentUserLabel = useMemo(() => {
    const nomePerfil = String(perfilManutencao?.nome || '').trim();
    if (nomePerfil) return nomePerfil;
    const email = authUser?.email?.toLowerCase();
    if (email === 'pcp@metalosa.com.br') return 'Sergio Betini';
    if (email === 'sergio@metalosa.com.br') return 'Sergio Betini';
    if (email === 'wilson@metalosa.com.br') return 'Wilson';
    if (email === 'industria@metalosa.com.br') return 'Leandro Freitas';
    return authUser?.displayName || sugerirNomePorEmail(authUser?.email) || authUser?.email || 'Usuario';
  }, [perfilManutencao?.nome, authUser?.displayName, authUser?.email]);
  const nomeBoasVindas = useMemo(() => {
    const first = String(currentUserLabel || '').trim().split(/\s+/)[0] || '';
    if (!first) return 'Operador';
    return `${first.charAt(0).toUpperCase()}${first.slice(1)}`;
  }, [currentUserLabel]);

  const registrarLogManutencao = async ({
    acao,
    ordem = null,
    ordemId = '',
    ativo = '',
    setor = '',
    statusAnterior = '',
    statusNovo = '',
    descricao = '',
    contestacao = null,
    extra = {},
  }) => {
    if (!authUser) return;
    await setDoc(doc(db, 'manutencao_logs', criarIdLogManutencao()), {
      acao,
      ordemId: ordemId || ordem?.id || '',
      ativo: ativo || ordem?.ativo || '',
      setor: setor || ordem?.setor || '',
      statusAnterior,
      statusNovo,
      descricao,
      contestacao,
      usuario: {
        uid: authUser.uid,
        email: authUser.email || '',
        nome: currentUserLabel,
      },
      createdAt: new Date().toISOString(),
      ...extra,
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(max-width: 900px)');
    const onChange = (event) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    if (media.addEventListener) {
      media.addEventListener('change', onChange);
    } else {
      media.addListener(onChange);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', onChange);
      } else {
        media.removeListener(onChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!authUser || !isAllowedDomain) {
      setShowMobileIntro(false);
      return;
    }
    if (!isMobile) {
      setShowMobileIntro(false);
      return;
    }
    setShowMobileIntro(true);
  }, [authUser, isAllowedDomain, isMobile]);

  const handleMobileIntroContinue = () => {
    playTone(587, 200);
    setShowMobileIntro(false);
  };

  const canDeleteOs = !isManutencaoOnly;

  const playTone = (frequency = 523, duration = 180) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
      }, duration);
    } catch (err) {
      // Ignora erro de audio bloqueado pelo navegador
    }
  };

  const menuItems = useMemo(() => {
    if (isManutencaoOnly) {
      return ITENS_MENU.filter((item) => item.id === 'manutencao');
    }
    return ITENS_MENU;
  }, [isManutencaoOnly]);

  const MENU_MOBILE_PRINCIPAL_IDS = ['dashboard-tv', 'executivo', 'faturamento', 'manutencao'];
  const menuItemsPrincipais = useMemo(
    () => menuItems.filter((item) => MENU_MOBILE_PRINCIPAL_IDS.includes(item.id)),
    [menuItems]
  );
  const menuItemsMais = useMemo(
    () => menuItems.filter((item) => !MENU_MOBILE_PRINCIPAL_IDS.includes(item.id)),
    [menuItems]
  );
  const [menuMobileMaisAberto, setMenuMobileMaisAberto] = useState(false);
  const abaAtivaEstaNoMais = menuItemsMais.some((item) => item.id === abaAtiva);

  useEffect(() => {
    if (!authUser) {
      setNotifToken('');
      setNotifError('');
      return;
    }
    const storageKey = `notifToken:${authUser.uid}`;
    const stored = localStorage.getItem(storageKey) || '';
    if (stored) {
      setNotifToken(stored);
    }
  }, [authUser?.uid]);

  useEffect(() => {
    if (!authUser || !notifToken || !isAllowedDomain) return;
    const nowIso = new Date().toISOString();
    setDoc(
      doc(db, 'notification_tokens', notifToken),
      {
        token: notifToken,
        uid: authUser.uid,
        email: authUser.email || '',
        displayName: currentUserLabel,
        enabled: true,
        lastSeen: nowIso,
      },
      { merge: true }
    ).catch(() => {});
  }, [authUser, notifToken, isAllowedDomain, currentUserLabel]);

  const handleEnableNotifications = async () => {
    setNotifError('');
    if (!authUser || !isAllowedDomain) {
      setNotifError('Sem permissao para ativar notificacoes.');
      return;
    }
    if (!notifSupported || !messaging) {
      setNotifError('Navegador nao suporta notificacoes.');
      return;
    }
    if (typeof Notification === 'undefined') {
      setNotifError('Notificacoes indisponiveis neste navegador.');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      setNotifError('Service Worker nao suportado.');
      return;
    }
    const vapidKey = getVapidKey();
    if (!vapidKey) {
      setNotifError('VAPID key nao configurada.');
      return;
    }
    setNotifLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== 'granted') {
        setNotifError('Permissao negada pelo navegador.');
        return;
      }
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        setNotifError('Nao foi possivel obter o token de notificacao.');
        return;
      }
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, 'notification_tokens', token),
        {
          token,
          uid: authUser.uid,
          email: authUser.email || '',
          displayName: currentUserLabel,
          enabled: true,
          createdAt: nowIso,
          lastSeen: nowIso,
          platform: navigator.platform || '',
          userAgent: navigator.userAgent || '',
        },
        { merge: true }
      );
      localStorage.setItem(`notifToken:${authUser.uid}`, token);
      setNotifToken(token);
    } catch (err) {
      setNotifError('Falha ao ativar notificacoes.');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setNotifError('');
    if (!authUser || !isAllowedDomain) return;
    if (!notifToken) return;
    setNotifLoading(true);
    try {
      if (messaging) {
        await deleteToken(messaging).catch(() => {});
      }
      await deleteDoc(doc(db, 'notification_tokens', notifToken));
      localStorage.removeItem(`notifToken:${authUser.uid}`);
      setNotifToken('');
    } catch (err) {
      setNotifError('Falha ao desativar notificacoes.');
    } finally {
      setNotifLoading(false);
    }
  };

  const ativosFiltrados = useMemo(() => {
    if (filtroAtivos === 'Todos') return listaMaquinas;
    const filtroNorm = normalizarTexto(filtroAtivos);
    return listaMaquinas.filter((item) =>
      normalizarTexto(`${item.setor} ${item.processo || ''}`).includes(filtroNorm)
    );
  }, [filtroAtivos, listaMaquinas]);

  const listaMaquinasNovaOs = useMemo(() => {
    const base = novaOsFiltroSetor === 'Todos'
      ? listaMaquinas
      : listaMaquinas.filter((item) =>
          normalizarTexto(item.setor) === normalizarTexto(novaOsFiltroSetor)
        );
    const filtro = filtroAtivoMobile.trim();
    if (!filtro) return base;
    const filtroNorm = normalizarTexto(filtro);
    return base.filter((item) =>
      normalizarTexto(`${item.nome} ${item.setor} ${item.processo || ''}`).includes(filtroNorm)
    );
  }, [novaOsFiltroSetor, filtroAtivoMobile, listaMaquinas]);

  const listaMaquinasMobile = listaMaquinasNovaOs;

  const getMaquinaOpcaoLabel = (item) => {
    if (!item) return '';
    return `${item.nome} - ${item.setor || 'Sem setor'}`;
  };

  const manutencaoColaboradores = useMemo(() => {
    return [
      { nome: 'Judismar', setor: 'Manutencao - Mecanico' },
      { nome: 'Marlon', setor: 'Manutencao - Mecanico' },
      { nome: 'Alex', setor: 'Manutencao - Mecanico' },
      { nome: 'Guilherme', setor: 'Manutencao - Mecanico' },
      { nome: 'Jose Fernando', setor: 'Manutencao - Mecanico' },
      { nome: 'Timóteo Vaz', setor: 'Manutencao - Ferramenteiro' },
      { nome: 'Jose Ricardo de Barros', setor: 'Manutencao - Ferramenteiro' },
      { nome: 'Marcio Gueçon Figueiredo', setor: 'Manutencao - Ferramenteiro' },
      { nome: 'Luizma', setor: 'Manutencao - Caldeiraria' },
      { nome: 'Cristiano', setor: 'Manutencao - Caldeiraria' },
      { nome: 'Juliano', setor: 'Manutencao - Eletricista' },
      { nome: 'Rogerio', setor: 'Manutencao - Eletricista' },
      { nome: 'Matheus', setor: 'Manutencao - Eletricista' },
      { nome: 'Marcos Henrique Pinheiros', setor: 'Manutencao - Soldador' },
    ];
  }, []);

  const manutencaoOperadorListas = useMemo(() => {
    const abertas = manutencaoOrdens.filter((os) => os.status === 'Aberta' || os.status === 'Contestada');
    const minhas = manutencaoOrdens.filter((os) =>
      (os.responsavel || '').toLowerCase() === currentUserLabel.toLowerCase()
    );
    return { abertas, minhas };
  }, [manutencaoOrdens, currentUserLabel]);

  const minhasSolicitacoes = useMemo(() => {
    const email = authUser?.email?.toLowerCase() || '';
    return manutencaoOrdens
      .filter((os) => {
        const criadoPor = (os.createdByEmail || '').toLowerCase();
        if (criadoPor && email) return criadoPor === email;
        return (os.responsavel || '').toLowerCase() === currentUserLabel.toLowerCase();
      })
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [manutencaoOrdens, authUser?.email, currentUserLabel]);

  // Função de tempo decorrido
  const tempoDecorrido = (dataStr) => {
    if (!dataStr) return '-';
    const d = new Date(dataStr);
    if (Number.isNaN(d.getTime())) return '-';
    const agr = new Date();
    const diffMs = agr - d;
    if (diffMs < 0) return 'agora';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}min`;
    const dias = Math.floor(hrs / 24);
    return `${dias}d ${hrs % 24}h`;
  };

  const getLogAcaoLabel = (acao) => {
    const labels = {
      os_aberta: 'Abriu OS',
      os_editada: 'Editou OS',
      os_visualizada: 'Abriu detalhes',
      status_alterado: 'Alterou status',
      os_assumida: 'Assumiu OS',
      os_reaberta: 'Reabriu OS',
      os_excluida: 'Excluiu OS',
      perfil_nome_atualizado: 'Atualizou nome',
    };
    return labels[acao] || 'Acao registrada';
  };

  const getLogAcaoTone = (acao) => {
    const tones = {
      os_aberta: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
      os_editada: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200',
      os_visualizada: 'border-slate-500/20 bg-slate-500/10 text-slate-200',
      status_alterado: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
      os_assumida: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
      os_reaberta: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
      os_excluida: 'border-rose-500/25 bg-rose-600/15 text-rose-100',
      perfil_nome_atualizado: 'border-purple-400/20 bg-purple-500/10 text-purple-200',
    };
    return tones[acao] || 'border-slate-700/30 bg-slate-800/40 text-slate-200';
  };

  const manutencaoKpis = useMemo(() => {
    const abertas = manutencaoOrdens.filter((os) => os.status === 'Aberta' || os.status === 'Contestada').length;
    const emAndamento = manutencaoOrdens.filter((os) => os.status === 'Em andamento').length;
    const finalizadas = manutencaoOrdens.filter((os) => os.status === 'Finalizada').length;
    const criticas = manutencaoOrdens.filter((os) => (os.prioridade || '').toLowerCase() === 'critica' && os.status !== 'Finalizada' && os.status !== 'Cancelada').length;
    const total = manutencaoOrdens.length;
    const pctResolvidas = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
    // Tempo médio de resolução (finalizadas com createdAt e fechadaEm/updatedAt)
    const finalizadasComTempo = manutencaoOrdens.filter((os) => os.status === 'Finalizada' && (os.createdAt || os.dataFalha) && (os.fechadaEm || os.updatedAt));
    let tempoMedioStr = '-';
    if (finalizadasComTempo.length > 0) {
      const somaHoras = finalizadasComTempo.reduce((acc, os) => {
        const inicio = new Date(os.createdAt || os.dataFalha);
        const fim = new Date(os.fechadaEm || os.updatedAt);
        return acc + Math.max(0, fim - inicio);
      }, 0);
      const mediaMs = somaHoras / finalizadasComTempo.length;
      const mediaH = Math.round(mediaMs / 3600000);
      tempoMedioStr = mediaH < 24 ? `${mediaH}h` : `${Math.round(mediaH / 24)}d`;
    }
    return [
      { id: 'abertas', label: 'OS Abertas', value: abertas, tone: 'text-amber-300' },
      { id: 'andamento', label: 'Em andamento', value: emAndamento, tone: 'text-blue-300' },
      { id: 'finalizadas', label: 'Finalizadas', value: finalizadas, tone: 'text-emerald-300' },
      { id: 'criticas', label: 'Críticas pendentes', value: criticas, tone: 'text-rose-300' },
      { id: 'pct', label: '% Resolvidas', value: `${pctResolvidas}%`, tone: 'text-cyan-300' },
      { id: 'tmedio', label: 'Tempo médio', value: tempoMedioStr, tone: 'text-purple-300' },
    ];
  }, [manutencaoOrdens]);

  // Ordens filtradas para a tabela
  const manutencaoOrdensFiltradas = useMemo(() => {
    let lista = [...manutencaoOrdens];
    if (manutencaoFiltroStatus !== 'Todas') {
      lista = lista.filter((os) => os.status === manutencaoFiltroStatus);
    }
    if (manutencaoFiltroPrioridade !== 'Todas') {
      lista = lista.filter((os) => os.prioridade === manutencaoFiltroPrioridade);
    }
    if (manutencaoFiltroSetor !== 'Todos') {
      lista = lista.filter((os) => os.setor === manutencaoFiltroSetor);
    }
    if (manutencaoBusca.trim()) {
      const q = manutencaoBusca.trim().toLowerCase();
      lista = lista.filter((os) =>
        (os.id || '').toLowerCase().includes(q) ||
        (os.ativo || '').toLowerCase().includes(q) ||
        (os.setor || '').toLowerCase().includes(q) ||
        (os.responsavel || '').toLowerCase().includes(q) ||
        (os.descricao || '').toLowerCase().includes(q)
      );
    }
    return lista;
  }, [manutencaoOrdens, manutencaoFiltroStatus, manutencaoFiltroPrioridade, manutencaoFiltroSetor, manutencaoBusca]);

  // Setores únicos para filtro
  const manutencaoSetoresUnicos = useMemo(() => {
    const set = new Set();
    manutencaoOrdens.forEach((os) => { if (os.setor) set.add(os.setor); });
    return Array.from(set).sort();
  }, [manutencaoOrdens]);

  // Dados para mini gráfico de tendência (últimos 7 dias)
  const manutencaoTendencia7d = useMemo(() => {
    const hoje = new Date();
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const abertas = manutencaoOrdens.filter((os) => {
        const dt = (os.createdAt || os.dataFalha || '');
        return dt && dt.slice(0, 10) === key;
      }).length;
      const finalizadas = manutencaoOrdens.filter((os) => {
        const dt = (os.fechadaEm || os.updatedAt || '');
        return os.status === 'Finalizada' && dt && dt.slice(0, 10) === key;
      }).length;
      dias.push({ label, abertas, finalizadas });
    }
    return dias;
  }, [manutencaoOrdens]);

  // Performance da equipe
  const manutencaoPerformanceEquipe = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return manutencaoColaboradores.map((colab) => {
      const nome = colab.nome;
      const nomeN = normalizarTexto(nome);
      const minhasOs = manutencaoOrdens.filter((os) => normalizarTexto(os.responsavel || '') === nomeN);
      const finalizadasHoje = minhasOs.filter((os) => os.status === 'Finalizada' && ((os.fechadaEm || os.updatedAt || '').slice(0, 10) === hoje)).length;
      const totalFinalizadas = minhasOs.filter((os) => os.status === 'Finalizada').length;
      const emAndamento = minhasOs.filter((os) => os.status === 'Em andamento').length;
      // Tempo médio
      const finComTempo = minhasOs.filter((os) => os.status === 'Finalizada' && (os.createdAt || os.dataFalha) && (os.fechadaEm || os.updatedAt));
      let tmedio = '-';
      if (finComTempo.length > 0) {
        const soma = finComTempo.reduce((acc, os) => acc + Math.max(0, new Date(os.fechadaEm || os.updatedAt) - new Date(os.createdAt || os.dataFalha)), 0);
        const mH = Math.round(soma / finComTempo.length / 3600000);
        tmedio = mH < 24 ? `${mH}h` : `${Math.round(mH / 24)}d`;
      }
      return { nome, setor: colab.setor, finalizadasHoje, totalFinalizadas, emAndamento, tmedio };
    }).sort((a, b) => b.finalizadasHoje - a.finalizadasHoje || b.totalFinalizadas - a.totalFinalizadas);
  }, [manutencaoOrdens, manutencaoColaboradores]);

  const manutencaoParadas = useMemo(
    () =>
      manutencaoOrdens.filter((os) =>
        os.status !== 'Finalizada' &&
        os.status !== 'Cancelada' &&
        ['Parada', 'Parada programada', 'Parada nao programada', 'Em manutencao'].includes(
          os.statusMaquina
        )
      ),
    [manutencaoOrdens]
  );

  const manutencaoEquipeEmAndamento = useMemo(() => {
    const counts = new Map();
    manutencaoOrdens
      .filter((os) => os.status === 'Em andamento')
      .forEach((os) => {
        const responsavel = os.responsavel || 'Sem responsavel';
        const atual = counts.get(responsavel) || {
          responsavel,
          total: 0,
          ativos: [],
        };
        atual.total += 1;
        const ativoRef = os.ativo || os.setor || os.id;
        if (ativoRef && !atual.ativos.includes(ativoRef) && atual.ativos.length < 2) {
          atual.ativos.push(ativoRef);
        }
        counts.set(responsavel, atual);
      });
    return Array.from(counts.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [manutencaoOrdens]);

  const manutencaoStatusEquipe = useMemo(() => {
    const emAndamentoPorResponsavel = new Map();
    manutencaoOrdens
      .filter((os) => os.status === 'Em andamento')
      .forEach((os) => {
        const chave = normalizarTexto(os.responsavel || '');
        if (!chave) return;
        const atual = emAndamentoPorResponsavel.get(chave) || {
          total: 0,
          ativos: [],
        };
        atual.total += 1;
        const ativoRef = os.ativo || os.setor || os.id;
        if (ativoRef && !atual.ativos.includes(ativoRef) && atual.ativos.length < 2) {
          atual.ativos.push(ativoRef);
        }
        emAndamentoPorResponsavel.set(chave, atual);
      });

    return manutencaoColaboradores
      .map((colab) => {
        const nome = colab.nome || 'Sem nome';
        const carga = emAndamentoPorResponsavel.get(normalizarTexto(nome));
        return {
          nome,
          setor: colab.setor || 'Manutencao',
          ocupado: Boolean(carga?.total),
          total: carga?.total || 0,
          ativos: carga?.ativos || [],
        };
      })
      .sort((a, b) => {
        if (a.ocupado !== b.ocupado) return a.ocupado ? -1 : 1;
        return a.nome.localeCompare(b.nome);
      });
  }, [manutencaoOrdens, manutencaoColaboradores]);

  const backlogPorLider = useMemo(() => {
    const abertas = manutencaoOrdens.filter((os) => os.status === 'Aberta');
    const counts = new Map();
    abertas.forEach((os) => {
      const lider = os.solicitante || os.createdByName || 'Sem lider';
      counts.set(lider, (counts.get(lider) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([lider, total]) => ({ lider, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [manutencaoOrdens]);

  // ── Dados para aba Relatórios ──
  const relatorioOrdensFiltradas = useMemo(() => {
    let lista = manutencaoOrdens;
    if (relatorioInicio) {
      lista = lista.filter((os) => {
        const dt = (os.createdAt || os.dataFalha || '').slice(0, 10);
        return dt >= relatorioInicio;
      });
    }
    if (relatorioFim) {
      lista = lista.filter((os) => {
        const dt = (os.createdAt || os.dataFalha || '').slice(0, 10);
        return dt <= relatorioFim;
      });
    }
    return lista;
  }, [manutencaoOrdens, relatorioInicio, relatorioFim]);

  const relatorioResumoGeral = useMemo(() => {
    const ord = relatorioOrdensFiltradas;
    const total = ord.length;
    const abertas = ord.filter((os) => os.status === 'Aberta' || os.status === 'Contestada').length;
    const emAndamento = ord.filter((os) => os.status === 'Em andamento').length;
    const aguardando = ord.filter((os) => os.status === 'Aguardando peca').length;
    const finalizadas = ord.filter((os) => os.status === 'Finalizada').length;
    const canceladas = ord.filter((os) => os.status === 'Cancelada').length;
    const corretivas = ord.filter((os) => os.tipo === 'Corretiva').length;
    const preventivas = ord.filter((os) => os.tipo === 'Preventiva').length;
    const criticas = ord.filter((os) => (os.prioridade || '').toLowerCase() === 'critica').length;
    const altas = ord.filter((os) => (os.prioridade || '').toLowerCase() === 'alta').length;
    const paradasProd = ord.filter((os) => os.parada === 'Sim' || ['Parada', 'Parada programada', 'Parada nao programada'].includes(os.statusMaquina)).length;
    const pctResolvidas = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
    const pctCorretiva = total > 0 ? Math.round((corretivas / total) * 100) : 0;
    const pctPreventiva = total > 0 ? Math.round((preventivas / total) * 100) : 0;
    const finComTempo = ord.filter((os) => os.status === 'Finalizada' && (os.createdAt || os.dataFalha) && (os.fechadaEm || os.updatedAt));
    let tempoMedioH = 0;
    if (finComTempo.length > 0) {
      const soma = finComTempo.reduce((acc, os) => acc + Math.max(0, new Date(os.fechadaEm || os.updatedAt) - new Date(os.createdAt || os.dataFalha)), 0);
      tempoMedioH = Math.round(soma / finComTempo.length / 3600000);
    }
    const tempoMedioStr = tempoMedioH === 0 ? '-' : tempoMedioH < 24 ? `${tempoMedioH}h` : `${Math.round(tempoMedioH / 24)}d`;
    return { total, abertas, emAndamento, aguardando, finalizadas, canceladas, corretivas, preventivas, criticas, altas, paradasProd, pctResolvidas, pctCorretiva, pctPreventiva, tempoMedioStr, tempoMedioH };
  }, [relatorioOrdensFiltradas]);

  const relatorioStatusData = useMemo(() => {
    const r = relatorioResumoGeral;
    return [
      { name: 'Abertas', value: r.abertas, color: '#f59e0b' },
      { name: 'Em andamento', value: r.emAndamento, color: '#3b82f6' },
      { name: 'Aguardando', value: r.aguardando, color: '#a855f7' },
      { name: 'Finalizadas', value: r.finalizadas, color: '#10b981' },
      { name: 'Canceladas', value: r.canceladas, color: '#64748b' },
    ].filter((d) => d.value > 0);
  }, [relatorioResumoGeral]);

  const relatorioPorSetor = useMemo(() => {
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const setor = os.setor || 'Sem setor';
      const atual = mapa.get(setor) || { setor, total: 0, abertas: 0, finalizadas: 0, tempoTotal: 0, tempoCount: 0 };
      atual.total += 1;
      if (os.status === 'Aberta') atual.abertas += 1;
      if (os.status === 'Finalizada') {
        atual.finalizadas += 1;
        if ((os.createdAt || os.dataFalha) && (os.fechadaEm || os.updatedAt)) {
          const diff = new Date(os.fechadaEm || os.updatedAt) - new Date(os.createdAt || os.dataFalha);
          if (diff > 0) { atual.tempoTotal += diff; atual.tempoCount += 1; }
        }
      }
      mapa.set(setor, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [relatorioOrdensFiltradas]);

  const relatorioPorTipo = useMemo(() => {
    const cores = { Corretiva: '#f43f5e', Preventiva: '#14b8a6', Inspecao: '#0ea5e9', Melhoria: '#8b5cf6', Outro: '#64748b' };
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const tipo = os.tipo || 'Outro';
      mapa.set(tipo, (mapa.get(tipo) || 0) + 1);
    });
    return Array.from(mapa.entries()).map(([name, value]) => ({ name, value, color: cores[name] || '#64748b' })).sort((a, b) => b.value - a.value);
  }, [relatorioOrdensFiltradas]);

  const relatorioPorCategoria = useMemo(() => {
    const cores = ['#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#eab308', '#64748b', '#6366f1'];
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const cat = os.categoria || 'Sem categoria';
      mapa.set(cat, (mapa.get(cat) || 0) + 1);
    });
    return Array.from(mapa.entries()).map(([name, value], i) => ({ name, value, color: cores[i % cores.length] })).sort((a, b) => b.value - a.value);
  }, [relatorioOrdensFiltradas]);

  const relatorioPorPrioridade = useMemo(() => {
    const cores = { Critica: '#dc2626', Alta: '#f97316', Media: '#eab308', Baixa: '#64748b' };
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const pri = os.prioridade || 'Sem prioridade';
      mapa.set(pri, (mapa.get(pri) || 0) + 1);
    });
    return Array.from(mapa.entries()).map(([name, value]) => ({ name, value, color: cores[name] || '#64748b' })).sort((a, b) => b.value - a.value);
  }, [relatorioOrdensFiltradas]);

  const relatorioPorResponsavel = useMemo(() => {
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const resp = os.responsavel || 'Sem responsável';
      const atual = mapa.get(resp) || { responsavel: resp, total: 0, finalizadas: 0, emAndamento: 0, tempoTotal: 0, tempoCount: 0 };
      atual.total += 1;
      if (os.status === 'Finalizada') {
        atual.finalizadas += 1;
        if ((os.createdAt || os.dataFalha) && (os.fechadaEm || os.updatedAt)) {
          const diff = new Date(os.fechadaEm || os.updatedAt) - new Date(os.createdAt || os.dataFalha);
          if (diff > 0) { atual.tempoTotal += diff; atual.tempoCount += 1; }
        }
      }
      if (os.status === 'Em andamento') atual.emAndamento += 1;
      mapa.set(resp, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.finalizadas - a.finalizadas);
  }, [relatorioOrdensFiltradas]);

  const relatorioPorMes = useMemo(() => {
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const dt = os.createdAt || os.dataFalha || '';
      if (!dt) return;
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const atual = mapa.get(key) || { key, label, Abertas: 0, Finalizadas: 0, total: 0 };
      atual.total += 1;
      atual.Abertas += 1;
      if (os.status === 'Finalizada') atual.Finalizadas += 1;
      mapa.set(key, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [relatorioOrdensFiltradas]);

  const relatorioTopAtivos = useMemo(() => {
    const mapa = new Map();
    relatorioOrdensFiltradas.forEach((os) => {
      const ativo = os.ativo || 'Sem ativo';
      const atual = mapa.get(ativo) || { ativo, total: 0, finalizadas: 0, abertas: 0 };
      atual.total += 1;
      if (os.status === 'Aberta') atual.abertas += 1;
      if (os.status === 'Finalizada') atual.finalizadas += 1;
      mapa.set(ativo, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [relatorioOrdensFiltradas]);

  const formatDateTimeRelatorio = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('pt-BR');
  };

  const formatDateOnlyRelatorio = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('pt-BR');
  };

  const escapeHtmlRelatorio = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const printHtmlRelatorio = (html) => {
    const existing = document.getElementById('manutencao-print-frame');
    if (existing) {
      existing.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'manutencao-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDoc = frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      alert('Nao foi possivel preparar o PDF.');
      return;
    }

    let printed = false;
    const handlePrint = () => {
      if (printed) return;
      printed = true;
      frameWindow.focus();
      frameWindow.print();
      setTimeout(() => {
        iframe.remove();
      }, 1000);
    };

    iframe.onload = handlePrint;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(handlePrint, 700);
  };

  const handleImprimirOs = (ordem) => {
    const now = new Date();
    const prioridade = String(ordem?.prioridade || '').toLowerCase();
    const status = String(ordem?.status || '').toLowerCase();
    const statusMaquina = String(ordem?.statusMaquina || '').toLowerCase();
    const getBadgeTone = (value) => {
      if (value.includes('crit')) return 'badge-danger';
      if (value.includes('alta')) return 'badge-warn';
      if (value.includes('media')) return 'badge-info';
      if (value.includes('baixa')) return 'badge-muted';
      if (value.includes('parada')) return 'badge-danger';
      if (value.includes('andamento')) return 'badge-info';
      if (value.includes('final')) return 'badge-success';
      return 'badge-muted';
    };

    const linhas = [
      ['OS', ordem?.id],
      ['Ativo', ordem?.ativo],
      ['Setor', ordem?.setor],
      ['Processo', ordem?.processo],
      ['Prioridade', ordem?.prioridade],
      ['Tipo', ordem?.tipo],
      ['Categoria', ordem?.categoria],
      ['Status', ordem?.status],
      ['Status maquina', ordem?.statusMaquina],
      ['Responsavel', ordem?.responsavel],
      ['Solicitante', ordem?.solicitante],
      ['Data da falha', ordem?.dataFalha],
      ['Criado em', ordem?.createdAt],
      ['Atualizado em', ordem?.updatedAt],
      ['Tempo de parada', ordem?.tempoParada],
      ['Tempo estimado', ordem?.tempoEstimado],
      ['Custo estimado', ordem?.custoEstimado],
      ['Impacto', ordem?.impacto],
      ['Componente', ordem?.componente],
      ['Parada', ordem?.parada],
      ['Causa provavel', ordem?.causaProvavel],
      ['Acao imediata', ordem?.acaoImediata],
    ];

    const linhasHtml = linhas
      .filter(([, valor]) => valor !== undefined && valor !== null && String(valor).trim() !== '')
      .map(
        ([label, valor]) => `
          <tr>
            <th>${escapeHtmlRelatorio(label)}</th>
            <td>${escapeHtmlRelatorio(
              ['Data da falha', 'Criado em', 'Atualizado em'].includes(label)
                ? formatDateTimeRelatorio(valor)
                : valor
            )}</td>
          </tr>
        `
      )
      .join('');

    const descricaoHtml = ordem?.descricao
      ? `<div class="section"><h2>Descricao</h2><div class="box">${escapeHtmlRelatorio(ordem.descricao)}</div></div>`
      : '';

    const sintomaHtml = ordem?.sintoma
      ? `<div class="section"><h2>Sintoma</h2><div class="box">${escapeHtmlRelatorio(ordem.sintoma)}</div></div>`
      : '';

    const fotoHtml = ordem?.fotoUrl
      ? `<div class="section"><h2>Foto</h2><img src="${escapeHtmlRelatorio(ordem.fotoUrl)}" alt="Foto da OS" /></div>`
      : '';

    const linhasDuplas = linhas.filter(([, valor]) => valor !== undefined && valor !== null && String(valor).trim() !== '');
    const linhasHtml2col = (() => {
      let rows = '';
      for (let i = 0; i < linhasDuplas.length; i += 2) {
        const [l1, v1] = linhasDuplas[i];
        const [l2, v2] = linhasDuplas[i + 1] || ['', ''];
        const fmt = (label, val) => ['Data da falha','Criado em','Atualizado em'].includes(label) ? formatDateTimeRelatorio(val) : val;
        rows += `<tr>
          <th>${escapeHtmlRelatorio(l1)}</th>
          <td>${escapeHtmlRelatorio(fmt(l1, v1))}</td>
          ${l2 ? `<th>${escapeHtmlRelatorio(l2)}</th><td>${escapeHtmlRelatorio(fmt(l2, v2))}</td>` : '<th></th><td></td>'}
        </tr>`;
      }
      return rows || '<tr><td colspan="4">Sem dados.</td></tr>';
    })();

    const html = `
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Impressao OS</title>
        <style>
          @page { size: A4 portrait; margin: 10mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #fff; font-size: 14px; }
          h1 { font-size: 20px; margin: 0; font-weight: 700; color: #0f172a; }
          h2 { font-size: 11px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.18em; color: #64748b; }
          .header { background: #fff; color: #0f172a; padding: 10px 4px 10px 0; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
          .brand { display: flex; align-items: center; gap: 10px; }
          .brand img { height: 34px; width: auto; }
          .brand small { display: block; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #64748b; margin-top: 2px; }
          .meta { font-size: 11px; color: #64748b; text-align: right; }
          .badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; margin-top: 5px; }
          .badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; }
          .badge-danger { background: #fecaca; color: #991b1b; }
          .badge-warn { background: #fde68a; color: #92400e; }
          .badge-info { background: #bae6fd; color: #075985; }
          .badge-success { background: #bbf7d0; color: #166534; }
          .badge-muted { background: #e2e8f0; color: #475569; }
          .section { margin-top: 12px; }
          table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
          th, td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; font-size: 13px; }
          th { background: #f1f5f9; color: #334155; font-weight: 600; width: 16%; white-space: nowrap; }
          td { color: #0f172a; width: 34%; }
          tr:last-child td, tr:last-child th { border-bottom: none; }
          .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; background: #f8fafc; margin-top: 4px; }
          .photo img { max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid #e2e8f0; display: block; margin-top: 4px; }
          .footer { margin-top: 10px; font-size: 10px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 6px; }
          @media print {
            body { background: #fff; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">
            <img src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa" />
            <div>
              <h1>Ordem de Servico</h1>
              <small>Relatorio tecnico</small>
            </div>
          </div>
          <div>
            <div class="meta">Gerado em ${escapeHtmlRelatorio(formatDateTimeRelatorio(now))}</div>
            <div class="badges">
              <span class="badge ${getBadgeTone(prioridade)}">Prioridade: ${escapeHtmlRelatorio(ordem?.prioridade || '-')}</span>
              <span class="badge ${getBadgeTone(status)}">Status: ${escapeHtmlRelatorio(ordem?.status || '-')}</span>
              <span class="badge ${getBadgeTone(statusMaquina)}">Maquina: ${escapeHtmlRelatorio(ordem?.statusMaquina || '-')}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Detalhes da OS</h2>
          <table>
            <tbody>
              ${linhasHtml2col}
            </tbody>
          </table>
        </div>

        ${sintomaHtml}
        ${descricaoHtml}
        ${fotoHtml ? `<div class="section"><h2>Foto</h2><div class="photo"><img src="${escapeHtmlRelatorio(ordem?.fotoUrl)}" alt="Foto da OS" /></div></div>` : ''}
        <div class="footer">Metalosa &middot; Manutencao &middot; ${escapeHtmlRelatorio(ordem?.id || '')}</div>
      </body>
      </html>
    `;

    printHtmlRelatorio(html);
  };

  const handleBaixarGuiaTreinamentoPdf = () => {
    const hoje = new Date();
    const dataLabel = hoje.toLocaleDateString('pt-BR');
    const baseUrl = window.location.origin;
    const slidesHtml = GUIA_TREINAMENTO_SLIDES.map((slide) => {
      const pontos = slide.pontos
        .map((p) => `<li>${escapeHtmlRelatorio(p)}</li>`)
        .join('');
      return `
        <section class="slide">
          <h2>${escapeHtmlRelatorio(slide.titulo)}</h2>
          <ul>${pontos}</ul>
        </section>
      `;
    }).join('');
    const imagensHtml = GUIA_TREINAMENTO_IMAGENS.map((item) => {
      const anotacoes = (item.anotacoes || [])
        .map(
          (a) => `
            <div class="hotspot" style="left:${a.x}%; top:${a.y}%; width:${a.w}%; height:${a.h}%;">
              <span class="tag">${escapeHtmlRelatorio(a.label)}</span>
            </div>
          `
        )
        .join('');
      return `
        <section class="slide">
          <h2>${escapeHtmlRelatorio(item.titulo)}</h2>
          <div class="image-wrap">
            <img src="${baseUrl}${escapeHtmlRelatorio(item.src)}" alt="${escapeHtmlRelatorio(item.titulo)}" />
            ${anotacoes}
          </div>
        </section>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Guia de Treinamento - Manutencao</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
          .page { padding: 28px; }
          .header { background: linear-gradient(120deg, #0f172a, #1e293b); color: #f8fafc; padding: 20px 24px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand img { height: 40px; width: auto; }
          .brand small { display: block; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #94a3b8; }
          h1 { font-size: 22px; margin: 0; }
          h2 { font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.18em; color: #334155; }
          .meta { font-size: 11px; color: #cbd5f5; }
          .slide { background: #ffffff; border-radius: 16px; padding: 18px 20px; border: 1px solid #e2e8f0; margin-top: 16px; }
          .image-wrap { position: relative; margin-top: 10px; }
          .image-wrap img { width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; display: block; }
          .hotspot { position: absolute; border: 2px solid #22d3ee; border-radius: 10px; box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.15); }
          .tag { position: absolute; top: -14px; left: 8px; background: #0f172a; color: #e2e8f0; font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid #22d3ee; letter-spacing: 0.08em; text-transform: uppercase; }
          ul { margin: 0; padding-left: 18px; color: #475569; }
          li { margin-bottom: 6px; }
          .footer { margin-top: 18px; font-size: 10px; color: #64748b; text-align: right; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="brand">
              <img src="${logoMetalosa}" alt="Logo" />
              <div>
                <small>Treinamento</small>
                <h1>Guia rapido - OS Manutencao</h1>
              </div>
            </div>
            <div class="meta">Atualizado em ${escapeHtmlRelatorio(dataLabel)}</div>
          </div>
          ${slidesHtml}
          ${imagensHtml}
          <div class="footer">Material interno para treinamento.</div>
        </div>
      </body>
      </html>
    `;

    printHtmlRelatorio(html);
  };

  // ── EXPORTAR RELATÓRIO FILTRADO — PDF (monocromático profissional) ──────────
  const handleExportarRelatorioManutencaoPdf = () => {
    const now = new Date();
    const r = relatorioResumoGeral;

    const periodoStr = relatorioInicio && relatorioFim
      ? `${relatorioInicio.split('-').reverse().join('/')} a ${relatorioFim.split('-').reverse().join('/')}`
      : relatorioInicio
        ? `A partir de ${relatorioInicio.split('-').reverse().join('/')}`
        : relatorioFim
          ? `Até ${relatorioFim.split('-').reverse().join('/')}`
          : 'Todo o período';

    // ── helpers ─────────────────────────────────────────────────────────────
    const barSection = (title, data) => {
      if (!data.length) return `<div class="bc-card"><div class="bc-ttl">${escapeHtmlRelatorio(title)}</div><div style="color:#9ca3af;font-size:9px;padding:6px 0">Sem dados</div></div>`;
      const mx = Math.max(...data.map((d) => d.value), 1);
      return `<div class="bc-card"><div class="bc-ttl">${escapeHtmlRelatorio(title)}</div>${data.map((d) => `
        <div class="bc-row">
          <div class="bc-lbl" title="${escapeHtmlRelatorio(d.name)}">${escapeHtmlRelatorio(d.name)}</div>
          <div class="bc-track"><div class="bc-bar" style="width:${Math.round((d.value / mx) * 100)}%"></div></div>
          <div class="bc-n">${d.value}</div>
          <div class="bc-p">${pct(d.value)}</div>
        </div>`).join('')}</div>`;
    };

    const maxSetorTotal = Math.max(...relatorioPorSetor.map((s) => s.total), 1);
    const setorTblRows = relatorioPorSetor.slice(0, 14).map((s, i) => {
      const tm = s.tempoCount > 0 ? Math.round(s.tempoTotal / s.tempoCount / 3600000) : 0;
      const tmStr = tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`;
      const barW = Math.round((s.total / maxSetorTotal) * 100);
      const pctRes = s.total > 0 ? Math.round((s.finalizadas / s.total) * 100) : 0;
      const rk = i < 3 ? `rk-${i + 1}` : '';
      return `<tr>
        <td><span class="rk ${rk}">${i + 1}</span></td>
        <td class="b">${escapeHtmlRelatorio(s.setor)}</td>
        <td class="r">${s.total}</td>
        <td class="r" style="color:#92400e">${s.abertas}</td>
        <td class="r" style="color:#14532d">${s.finalizadas}</td>
        <td class="r">${tmStr}</td>
        <td><div class="pb"><div class="pb-tr"><div class="pb-fl" style="width:${barW}%"></div></div><span class="pb-p">${pct(s.total)}</span></div></td>
        <td class="r">${pctRes}%</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="z">Sem dados</td></tr>`;

    const maxAtivoTotal = Math.max(...relatorioTopAtivos.map((a) => a.total), 1);
    const ativoRows = relatorioTopAtivos.map((item, i) => {
      const barW = Math.round((item.total / maxAtivoTotal) * 100);
      const pctRes = item.total > 0 ? Math.round((item.finalizadas / item.total) * 100) : 0;
      const rk = i < 3 ? `rk-${i + 1}` : '';
      return `<tr>
        <td><span class="rk ${rk}">${i + 1}</span></td>
        <td class="b" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtmlRelatorio(item.ativo)}</td>
        <td class="r">${item.total}</td>
        <td class="r" style="color:#92400e">${item.abertas}</td>
        <td class="r" style="color:#14532d">${item.finalizadas}</td>
        <td><div class="pb"><div class="pb-tr"><div class="pb-fl" style="width:${barW}%"></div></div></div></td>
        <td class="r">${pctRes}%</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="z">Sem dados</td></tr>`;

    const respRows = relatorioPorResponsavel.slice(0, 14).map((item) => {
      const tm = item.tempoCount > 0 ? Math.round(item.tempoTotal / item.tempoCount / 3600000) : 0;
      const tmStr = tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`;
      const pctRes = item.total > 0 ? Math.round((item.finalizadas / item.total) * 100) : 0;
      const bdg = pctRes >= 70 ? 'bdg-ok' : pctRes >= 40 ? 'bdg-md' : 'bdg-lo';
      return `<tr>
        <td class="b">${escapeHtmlRelatorio(item.responsavel)}</td>
        <td class="r">${item.total}</td>
        <td class="r" style="color:#14532d">${item.finalizadas}</td>
        <td class="r" style="color:#1d4ed8">${item.emAndamento}</td>
        <td class="r">${tmStr}</td>
        <td><div class="pb"><div class="pb-tr"><div class="pb-fl" style="width:${Math.min(100, pctRes)}%"></div></div><span class="bdg ${bdg}">${pctRes}%</span></div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="z">Sem dados</td></tr>`;

    const maxMes = Math.max(...relatorioPorMes.map((m) => m.total), 1);
    const mesRows = relatorioPorMes.map((m) => {
      const barW = Math.round((m.total / maxMes) * 100);
      const pctFin = m.total > 0 ? Math.round((m.Finalizadas / m.total) * 100) : 0;
      return `<tr>
        <td class="b">${m.label}</td>
        <td class="r">${m.total}</td>
        <td class="r">${m.Abertas}</td>
        <td class="r" style="color:#14532d">${m.Finalizadas}</td>
        <td class="r">${pctFin}%</td>
        <td><div class="pb"><div class="pb-tr"><div class="pb-fl" style="width:${barW}%"></div></div></div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="z">Sem dados</td></tr>`;

    const pctCorretiva = pctNum(r.corretivas);
    const pctPreventiva = pctNum(r.preventivas);

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatorio de Manutencao — Metalosa</title><style>
/* ── BASE ─────────────────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:0}
@media print{.page{page-break-after:always}.no-break{page-break-inside:avoid}}

/* ── CAPA ─────────────────────────────────────────────────────── */
.cover{width:210mm;height:297mm;background:#0B0F1A;display:flex;flex-direction:column;position:relative;overflow:hidden}
.cv-panel{position:absolute;top:0;right:0;width:68mm;height:100%;background:#0e1423;border-left:1px solid #1a2236}
.cv-strip{position:absolute;top:0;left:0;width:5px;height:100%;background:#fff}
.cv-body{position:relative;z-index:1;padding:50px 52px;display:flex;flex-direction:column;height:100%}
.cv-logo{width:42px;height:42px;object-fit:contain;filter:brightness(0)invert(1);margin-bottom:5px}
.cv-brand{font-size:7.5px;font-weight:700;letter-spacing:.46em;text-transform:uppercase;color:#2c3d51;margin-bottom:60px}
.cv-ey{font-size:7.5px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:#243244;margin-bottom:9px}
.cv-title{font-size:58px;font-weight:900;line-height:1.01;letter-spacing:-.03em;color:#edf1f6;margin-bottom:12px;max-width:116mm}
.cv-desc{font-size:12px;color:#3d5068;line-height:1.6;margin-bottom:26px;max-width:104mm}
.cv-period{display:inline-flex;align-items:center;gap:10px;border:1px solid #18263a;border-radius:6px;padding:8px 15px;width:fit-content;margin-bottom:auto}
.cv-pl{font-size:6.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#1e2f42}
.cv-pv{font-size:11px;font-weight:700;color:#b8c8db}
.cv-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:30px}
.cv-kpi{background:#101826;border:1px solid #1a2438;border-radius:10px;padding:17px 15px}
.cv-kl{font-size:6.5px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#243547;margin-bottom:7px}
.cv-kv{font-size:38px;font-weight:900;color:#e6ecf3;line-height:1}
.cv-ft{margin-top:20px;padding-top:13px;border-top:1px solid #131f2d;display:flex;justify-content:space-between;font-size:7.5px;color:#1a2a3a}

/* ── CONTENT PAGES ─────────────────────────────────────────────── */
.pg{width:210mm;min-height:297mm;padding:11mm 13mm 9mm;display:flex;flex-direction:column}
.ph{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;margin-bottom:17px;border-bottom:2.5px solid #0b0f1a}
.ph-brand{display:flex;align-items:center;gap:8px}
.ph-logo{width:26px;height:26px;object-fit:contain}
.ph-name{font-size:11.5px;font-weight:900;color:#0b0f1a}
.ph-doc{font-size:6.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#9ca3af;margin-top:1px}
.ph-meta{text-align:right;font-size:7.5px;color:#6b7280;line-height:1.7}
.ph-meta b{color:#374151}
.sh{border-left:3.5px solid #0b0f1a;padding-left:9px;margin-bottom:3px}
.sh-t{font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#0b0f1a}
.sh-s{font-size:7px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:#9ca3af;margin-top:2px}
.sec{margin-bottom:18px}

/* ── KPI TILES ─────────────────────────────────────────────────── */
.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.kt{border:1px solid #e8ecf0;border-radius:9px;padding:13px 13px 10px;background:#fafbfc}
.kt-l{font-size:6.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#9ca3af;margin-bottom:5px}
.kt-v{font-size:32px;font-weight:900;color:#0b0f1a;line-height:1;margin-bottom:2px}
.kt-s{font-size:7.5px;color:#6b7280}

/* ── RESOLUTION BLOCK ──────────────────────────────────────────── */
.res{display:flex;align-items:stretch;gap:15px;border:1px solid #e8ecf0;border-radius:11px;padding:16px 18px;margin-bottom:16px;background:#fafbfc}
.res-left{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:108px;border-right:1px solid #e8ecf0;padding-right:15px}
.res-pct{font-size:66px;font-weight:900;color:#0b0f1a;line-height:1}
.res-lbl{font-size:7px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#9ca3af;margin-top:4px}
.res-right{flex:1;display:flex;flex-direction:column;justify-content:center;gap:11px}
.res-bar-bg{height:8px;background:#e8ecf0;border-radius:4px;overflow:hidden}
.res-bar{height:100%;background:#0b0f1a;border-radius:4px}
.res-split{display:flex;gap:0}
.rsi{flex:1;padding:0 11px;border-right:1px solid #e8ecf0}
.rsi:first-child{padding-left:0}
.rsi:last-child{border-right:none}
.rsi-l{font-size:6.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
.rsi-v{font-size:21px;font-weight:900;color:#0b0f1a}
.rsi-p{font-size:7.5px;color:#6b7280;margin-top:1px}

/* ── BAR CHARTS ─────────────────────────────────────────────────── */
.bc-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:14px}
.bc-card{border:1px solid #f0f4f8;border-radius:8px;padding:11px 12px}
.bc-ttl{font-size:7px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#374151;padding-bottom:8px;margin-bottom:9px;border-bottom:1px solid #f0f4f8}
.bc-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.bc-lbl{font-size:8.5px;color:#374151;min-width:70px;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-track{flex:1;height:6px;background:#f0f4f8;border-radius:3px;overflow:hidden}
.bc-bar{height:100%;background:#0b0f1a;border-radius:3px}
.bc-n{font-size:9px;font-weight:700;color:#0b0f1a;min-width:18px;text-align:right}
.bc-p{font-size:7.5px;color:#9ca3af;min-width:26px;text-align:right}

/* ── TABLES ─────────────────────────────────────────────────────── */
.tbl{width:100%;border-collapse:collapse;font-size:9px}
.tbl thead tr{background:#0b0f1a}
.tbl th{padding:6.5px 7px;color:#fff;font-size:7px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-align:left}
.tbl th.r{text-align:right}
.tbl td{padding:5px 7px;border-bottom:1px solid #f6f8fa;color:#374151;vertical-align:middle}
.tbl tbody tr:nth-child(even) td{background:#f9fafb}
.b{font-weight:700;color:#0b0f1a!important}
.r{text-align:right!important;font-weight:700;color:#0b0f1a}
.z{color:#9ca3af!important;text-align:center!important;padding:14px!important}

/* ── PROGRESS BARS IN CELLS ─────────────────────────────────────── */
.pb{display:flex;align-items:center;gap:5px}
.pb-tr{flex:1;height:5px;background:#f0f4f8;border-radius:3px;overflow:hidden;min-width:36px}
.pb-fl{height:100%;background:#0b0f1a;border-radius:3px}
.pb-p{font-size:7.5px;color:#6b7280;min-width:26px}

/* ── RANK / BADGE ───────────────────────────────────────────────── */
.rk{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:7.5px;font-weight:700;background:#f0f4f8;color:#374151}
.rk-1{background:#0b0f1a;color:#fff}
.rk-2{background:#1e2d3c;color:#cbd5e1}
.rk-3{background:#374151;color:#cbd5e1}
.bdg{display:inline-block;padding:2px 6px;border-radius:4px;font-size:7.5px;font-weight:700}
.bdg-ok{background:#f0fdf4;color:#166534;border:1px solid #86efac}
.bdg-md{background:#fffbeb;color:#92400e;border:1px solid #fcd34d}
.bdg-lo{background:#fff1f2;color:#9f1239;border:1px solid #fca5a5}

.g2{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:13px}
.div{height:1px;background:#f0f4f8;margin:13px 0}
.pf{margin-top:auto;padding-top:7px;border-top:1px solid #f0f4f8;display:flex;justify-content:space-between;font-size:7px;color:#d1d5db}
</style></head><body>

<!-- ═══════ CAPA ══════════════════════════════════════════════ -->
<div class="cover page">
  <div class="cv-panel"></div><div class="cv-strip"></div>
  <div class="cv-body">
    <img class="cv-logo" src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa"/>
    <div class="cv-brand">Metalosa</div>
    <div style="flex:1"></div>
    <div class="cv-ey">Departamento de Manutenção</div>
    <div class="cv-title">Relatório de<br/>Manutenção</div>
    <div class="cv-desc">Análise de desempenho, indicadores operacionais<br/>e gestão de ordens de serviço</div>
    <div class="cv-period">
      <span class="cv-pl">Período</span>
      <span class="cv-pv">${escapeHtmlRelatorio(periodoStr)}</span>
    </div>
    <div class="cv-kpis">
      <div class="cv-kpi"><div class="cv-kl">Total OS</div><div class="cv-kv">${r.total}</div></div>
      <div class="cv-kpi"><div class="cv-kl">Finalizadas</div><div class="cv-kv">${r.finalizadas}</div></div>
      <div class="cv-kpi"><div class="cv-kl">% Resolvidas</div><div class="cv-kv">${r.pctResolvidas}%</div></div>
      <div class="cv-kpi"><div class="cv-kl">Em Aberto</div><div class="cv-kv">${r.abertas}</div></div>
      <div class="cv-kpi"><div class="cv-kl">Em Andamento</div><div class="cv-kv">${r.emAndamento}</div></div>
      <div class="cv-kpi"><div class="cv-kl">Tempo Médio</div><div class="cv-kv">${r.tempoMedioStr}</div></div>
    </div>
    <div class="cv-ft">
      <span>Confidencial · Uso interno</span>
      <span>Gerado em ${escapeHtmlRelatorio(dateStr)}</span>
    </div>
  </div>
</div>

<!-- ═══════ PÁG 2: RESUMO EXECUTIVO ══════════════════════════ -->
<div class="pg page">
  <div class="ph">
    <div class="ph-brand"><img class="ph-logo" src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa"/><div><div class="ph-name">Metalosa</div><div class="ph-doc">Relatório de Manutenção</div></div></div>
    <div class="ph-meta"><b>${escapeHtmlRelatorio(periodoStr)}</b><br/>Gerado em ${escapeHtmlRelatorio(dateStr)}</div>
  </div>
  <div class="sec"><div class="sh"><div class="sh-t">Resumo Executivo</div><div class="sh-s">Indicadores consolidados do período</div></div></div>
  <div class="kg">
    <div class="kt"><div class="kt-l">Total de OS</div><div class="kt-v">${r.total}</div><div class="kt-s">Ordens no período</div></div>
    <div class="kt"><div class="kt-l">Finalizadas</div><div class="kt-v">${r.finalizadas}</div><div class="kt-s">OS encerradas</div></div>
    <div class="kt"><div class="kt-l">Tempo Médio</div><div class="kt-v">${r.tempoMedioStr}</div><div class="kt-s">Por OS finalizada</div></div>
    <div class="kt"><div class="kt-l">Em Aberto</div><div class="kt-v">${r.abertas}</div><div class="kt-s">Pendentes</div></div>
    <div class="kt"><div class="kt-l">Em Andamento</div><div class="kt-v">${r.emAndamento}</div><div class="kt-s">Em execução</div></div>
    <div class="kt"><div class="kt-l">Canceladas</div><div class="kt-v">${r.canceladas}</div><div class="kt-s">OS canceladas</div></div>
  </div>
  <div class="sec"><div class="sh"><div class="sh-t">Taxa de Resolução</div><div class="sh-s">Eficiência operacional do período</div></div></div>
  <div class="res">
    <div class="res-left">
      <div class="res-pct">${r.pctResolvidas}%</div>
      <div class="res-lbl">Resolvidas</div>
    </div>
    <div class="res-right">
      <div class="res-bar-bg"><div class="res-bar" style="width:${r.pctResolvidas}%"></div></div>
      <div class="res-split">
        <div class="rsi"><div class="rsi-l">Corretiva</div><div class="rsi-v">${r.corretivas}</div><div class="rsi-p">${pctCorretiva}% do total</div></div>
        <div class="rsi"><div class="rsi-l">Preventiva</div><div class="rsi-v">${r.preventivas}</div><div class="rsi-p">${pctPreventiva}% do total</div></div>
        <div class="rsi"><div class="rsi-l">Críticas</div><div class="rsi-v">${r.criticas}</div><div class="rsi-p">${pctNum(r.criticas)}% do total</div></div>
        <div class="rsi"><div class="rsi-l">Paradas Prod.</div><div class="rsi-v">${r.paradasProd}</div><div class="rsi-p">${pctNum(r.paradasProd)}% do total</div></div>
      </div>
    </div>
  </div>
  <div class="pf"><span>Metalosa · Relatório de Manutenção</span><span>${escapeHtmlRelatorio(periodoStr)}</span></div>
</div>

<!-- ═══════ PÁG 3: DISTRIBUIÇÕES ═════════════════════════════ -->
<div class="pg page">
  <div class="ph">
    <div class="ph-brand"><img class="ph-logo" src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa"/><div><div class="ph-name">Metalosa</div><div class="ph-doc">Relatório de Manutenção</div></div></div>
    <div class="ph-meta"><b>${escapeHtmlRelatorio(periodoStr)}</b></div>
  </div>
  <div class="sec"><div class="sh"><div class="sh-t">Distribuições</div><div class="sh-s">Análise por status, prioridade, tipo e categoria</div></div></div>
  <div class="bc-grid">
    ${barSection('Status das Ordens', relatorioStatusData)}
    ${barSection('Por Prioridade', relatorioPorPrioridade)}
  </div>
  <div class="bc-grid">
    ${barSection('Por Tipo', relatorioPorTipo)}
    ${barSection('Por Categoria', relatorioPorCategoria.slice(0, 8))}
  </div>
  <div class="pf"><span>Metalosa · Relatório de Manutenção</span><span>${escapeHtmlRelatorio(periodoStr)}</span></div>
</div>

<!-- ═══════ PÁG 4: ANÁLISE OPERACIONAL ═══════════════════════ -->
<div class="pg page">
  <div class="ph">
    <div class="ph-brand"><img class="ph-logo" src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa"/><div><div class="ph-name">Metalosa</div><div class="ph-doc">Relatório de Manutenção</div></div></div>
    <div class="ph-meta"><b>${escapeHtmlRelatorio(periodoStr)}</b></div>
  </div>
  <div class="sec"><div class="sh"><div class="sh-t">Análise por Setor</div><div class="sh-s">Performance de cada setor no período</div></div></div>
  <table class="tbl no-break" style="margin-bottom:13px">
    <thead><tr>
      <th>#</th><th>Setor</th><th class="r">Total</th><th class="r">Abertas</th><th class="r">Finalizadas</th><th class="r">T. Médio</th><th>Participação</th><th class="r">% Res.</th>
    </tr></thead>
    <tbody>${setorTblRows}</tbody>
  </table>
  <div class="div"></div>
  <div class="sec"><div class="sh"><div class="sh-t">Evolução Mensal</div><div class="sh-s">Abertas vs finalizadas por mês</div></div></div>
  <table class="tbl no-break">
    <thead><tr>
      <th>Mês</th><th class="r">Total</th><th class="r">Abertas</th><th class="r">Finalizadas</th><th class="r">% Fin.</th><th>Volume</th>
    </tr></thead>
    <tbody>${mesRows}</tbody>
  </table>
  <div class="pf"><span>Metalosa · Relatório de Manutenção</span><span>${escapeHtmlRelatorio(periodoStr)}</span></div>
</div>

<!-- ═══════ PÁG 5: EQUIPAMENTOS & EQUIPE ═════════════════════ -->
<div class="pg page">
  <div class="ph">
    <div class="ph-brand"><img class="ph-logo" src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa"/><div><div class="ph-name">Metalosa</div><div class="ph-doc">Relatório de Manutenção</div></div></div>
    <div class="ph-meta"><b>${escapeHtmlRelatorio(periodoStr)}</b></div>
  </div>
  <div class="sec"><div class="sh"><div class="sh-t">Top 15 Ativos com Mais OS</div><div class="sh-s">Equipamentos que mais demandam manutenção</div></div></div>
  <table class="tbl no-break" style="margin-bottom:13px">
    <thead><tr>
      <th>#</th><th>Ativo</th><th class="r">Total</th><th class="r">Abertas</th><th class="r">Finalizadas</th><th>Volume</th><th class="r">% Res.</th>
    </tr></thead>
    <tbody>${ativoRows}</tbody>
  </table>
  <div class="div"></div>
  <div class="sec"><div class="sh"><div class="sh-t">Performance por Responsável</div><div class="sh-s">Ranking de resolução no período</div></div></div>
  <table class="tbl no-break">
    <thead><tr>
      <th>Responsável</th><th class="r">Total</th><th class="r">Fin.</th><th class="r">Andamento</th><th class="r">T. Médio</th><th>% Resolução</th>
    </tr></thead>
    <tbody>${respRows}</tbody>
  </table>
  <div class="pf"><span>Metalosa · Relatório de Manutenção</span><span>${escapeHtmlRelatorio(periodoStr)}</span></div>
</div>
</body></html>`;

    printHtmlRelatorio(html);
  };

  // ── EXPORTAR RELATÓRIO FILTRADO — PPT (executivo, visual, monocromático) ──
  const handleExportarRelatorioManutencaoPpt = () => {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Painel Metalosa';
    pptx.company = 'Metalosa';
    const now = new Date();
    const fileDate = now.toISOString().slice(0, 10);
    const r = relatorioResumoGeral;

    const periodoStr = relatorioInicio && relatorioFim
      ? `${relatorioInicio.split('-').reverse().join('/')} a ${relatorioFim.split('-').reverse().join('/')}`
      : relatorioInicio
        ? `A partir de ${relatorioInicio.split('-').reverse().join('/')}`
        : relatorioFim
          ? `Ate ${relatorioFim.split('-').reverse().join('/')}`
          : 'Todo o periodo';

    // ── Paleta monocromática ──────────────────────────────────────────────
    const BG   = '0B0F1A';
    const BG2  = '0F172A';
    const CARD = '18243A';
    const CARD2= '1E2D3D';
    const BORD = '2D3E50';
    const W    = 'EDF1F6';
    const MID  = '94A3B8';
    const DIM  = '4B6071';

    const setBg = (sl) =>
      sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: BG }, line: { color: BG } });

    // left accent line + slide title block
    const addHdr = (sl, title, sub) => {
      sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: W }, line: { color: W } });
      sl.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.5, fontSize: 24, bold: true, color: W });
      if (sub) sl.addText(sub, { x: 0.5, y: 0.86, w: 12.3, h: 0.2, fontSize: 7.5, bold: true, color: DIM, charSpacing: 2.5 });
      sl.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.12, w: 12.33, h: 0.012, fill: { color: BORD }, line: { color: BORD } });
    };

    // ── Table helpers ─────────────────────────────────────────────────────
    const tblHdr = (cols) => cols.map((t) => ({
      text: t, options: { bold: true, color: W, fill: { color: BG2 }, fontSize: 8 }
    }));
    const tblRows = (rows) => rows.map((row, ri) =>
      row.map((cell, ci) => ({
        text: String(cell ?? '-'),
        options: { color: W, fill: { color: ri % 2 === 0 ? CARD : CARD2 }, fontSize: 9.5, bold: ci > 0 }
      }))
    );
    const addTbl = (sl, hdrs, rows, cfg) => {
      const data = [tblHdr(hdrs), ...(rows.length ? tblRows(rows) : [hdrs.map(() => ({ text: 'Sem dados', options: { color: DIM, fill: { color: CARD }, fontSize: 9.5 } }))])];
      sl.addTable(data, { border: { type: 'solid', color: BORD, pt: 0.4 }, rowH: 0.3, valign: 'middle', ...cfg });
    };

    // ── Visual bar chart (horizontal) using shapes ────────────────────────
    const addBarViz = (sl, x, y, w, title, data, total) => {
      const maxVal = Math.max(...data.map((d) => d.value), 1);
      const lblW = 1.65;
      const barMaxW = w - lblW - 1.2;
      sl.addText(title.toUpperCase(), { x, y, w, h: 0.22, fontSize: 7.5, bold: true, color: DIM, charSpacing: 2 });
      sl.addShape(pptx.ShapeType.rect, { x, y: y + 0.24, w, h: 0.01, fill: { color: BORD }, line: { color: BORD } });
      data.slice(0, 7).forEach((item, idx) => {
        const iy = y + 0.36 + idx * 0.5;
        const barW = (item.value / maxVal) * barMaxW;
        const pctVal = total > 0 ? Math.round((item.value / total) * 100) : 0;
        // label
        sl.addText(String(item.name || '-'), { x, y: iy + 0.05, w: lblW, h: 0.38, fontSize: 10, color: W, valign: 'middle' });
        // track bg
        sl.addShape(pptx.ShapeType.rect, { x: x + lblW, y: iy + 0.15, w: barMaxW, h: 0.18, fill: { color: CARD2 }, line: { color: BORD } });
        // fill
        if (barW > 0.02) sl.addShape(pptx.ShapeType.rect, { x: x + lblW, y: iy + 0.15, w: barW, h: 0.18, fill: { color: W }, line: { color: W } });
        // number
        sl.addText(String(item.value), { x: x + lblW + barMaxW + 0.06, y: iy + 0.05, w: 0.6, h: 0.38, fontSize: 11, bold: true, color: W, align: 'right', valign: 'middle' });
        // pct
        sl.addText(`${pctVal}%`, { x: x + lblW + barMaxW + 0.7, y: iy + 0.05, w: 0.45, h: 0.38, fontSize: 8.5, color: DIM, align: 'right', valign: 'middle' });
      });
    };

    const pctOf = (v) => r.total > 0 ? Math.round((v / r.total) * 100) : 0;

    // ════════════════════════════════════════════════════════════════
    // SLIDE 1 — CAPA
    // ════════════════════════════════════════════════════════════════
    const s1 = pptx.addSlide();
    setBg(s1);
    s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 7.5, fill: { color: W }, line: { color: W } });
    s1.addText('METALOSA', { x: 0.5, y: 0.52, w: 9, h: 0.26, fontSize: 8, bold: true, color: DIM, charSpacing: 6 });
    s1.addText('Relatorio de\nManutencao', { x: 0.5, y: 0.9, w: 9.5, h: 1.9, fontSize: 50, bold: true, color: W, lineSpacingMultiple: 1.06 });
    s1.addText('Analise de desempenho e indicadores operacionais', { x: 0.5, y: 2.95, w: 9, h: 0.3, fontSize: 11, color: MID });
    s1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.38, w: 4.8, h: 0.01, fill: { color: BORD }, line: { color: BORD } });
    s1.addText(`Periodo: ${periodoStr}`, { x: 0.5, y: 3.5, w: 9, h: 0.28, fontSize: 9.5, color: DIM });

    const kv = [
      { l: 'Total OS', v: r.total }, { l: 'Finalizadas', v: r.finalizadas }, { l: '% Resolvidas', v: `${r.pctResolvidas}%` },
      { l: 'Em Aberto', v: r.abertas }, { l: 'Andamento', v: r.emAndamento }, { l: 'Tempo Medio', v: r.tempoMedioStr },
    ];
    const cW = 2.04, cH = 1.1, cGap = 0.09;
    kv.forEach((k, i) => {
      const cx = 0.5 + i * (cW + cGap);
      s1.addShape(pptx.ShapeType.roundRect, { x: cx, y: 4.15, w: cW, h: cH, fill: { color: CARD }, line: { color: BORD }, radius: 0.05 });
      s1.addText(k.l, { x: cx + 0.14, y: 4.28, w: cW - 0.28, h: 0.24, fontSize: 7.5, color: DIM });
      s1.addText(String(k.v ?? '-'), { x: cx + 0.14, y: 4.54, w: cW - 0.28, h: 0.56, fontSize: 24, bold: true, color: W });
    });
    s1.addText(`Gerado em ${now.toLocaleString('pt-BR')} · Painel Industrial Metalosa`, { x: 0.5, y: 7.15, w: 12.3, h: 0.2, fontSize: 7.5, color: DIM });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 2 — INDICADORES EXECUTIVOS (KPI cards grandes)
    // ════════════════════════════════════════════════════════════════
    const s2 = pptx.addSlide();
    setBg(s2);
    addHdr(s2, 'Indicadores do Periodo', `PERIODO: ${periodoStr.toUpperCase()}`);

    const kpis2 = [
      { l: 'Total de OS', v: r.total, d: 'Ordens no periodo' },
      { l: 'Finalizadas', v: r.finalizadas, d: 'OS encerradas' },
      { l: 'Taxa de Resolucao', v: `${r.pctResolvidas}%`, d: 'Eficiencia operacional' },
      { l: 'Em Aberto', v: r.abertas, d: 'Pendentes' },
      { l: 'Em Andamento', v: r.emAndamento, d: 'Em execucao' },
      { l: 'Tempo Medio', v: r.tempoMedioStr, d: 'Por OS finalizada' },
    ];
    const kW2 = 3.9, kH2 = 2.4, kG2 = 0.18, kX2 = 0.5, kY2 = 1.3;
    kpis2.forEach((k, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const kx = kX2 + col * (kW2 + kG2);
      const ky = kY2 + row * (kH2 + kG2);
      s2.addShape(pptx.ShapeType.roundRect, { x: kx, y: ky, w: kW2, h: kH2, fill: { color: CARD }, line: { color: BORD }, radius: 0.07 });
      s2.addText(k.l.toUpperCase(), { x: kx + 0.22, y: ky + 0.22, w: kW2 - 0.44, h: 0.22, fontSize: 7.5, bold: true, color: DIM, charSpacing: 1.5 });
      s2.addText(String(k.v ?? '-'), { x: kx + 0.22, y: ky + 0.52, w: kW2 - 0.44, h: 1.3, fontSize: 56, bold: true, color: W, valign: 'middle' });
      s2.addText(k.d, { x: kx + 0.22, y: ky + kH2 - 0.42, w: kW2 - 0.44, h: 0.28, fontSize: 9, color: MID });
    });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 3 — TAXA DE RESOLUÇÃO (slide focal)
    // ════════════════════════════════════════════════════════════════
    const s3 = pptx.addSlide();
    setBg(s3);
    addHdr(s3, 'Taxa de Resolucao', 'EFICIENCIA OPERACIONAL DO PERIODO');

    // Big percentage left
    s3.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.3, w: 5.5, h: 5.5, fill: { color: CARD }, line: { color: BORD }, radius: 0.1 });
    s3.addText(`${r.pctResolvidas}%`, { x: 0.5, y: 1.8, w: 5.5, h: 3.2, fontSize: 110, bold: true, color: W, align: 'center', valign: 'middle' });
    s3.addText('das OS foram resolvidas', { x: 0.5, y: 5.1, w: 5.5, h: 0.4, fontSize: 11, color: MID, align: 'center' });
    s3.addText(`no periodo: ${periodoStr}`, { x: 0.5, y: 5.55, w: 5.5, h: 0.28, fontSize: 8.5, color: DIM, align: 'center' });

    // Progress bar
    const barBgW = 7.0, barBgX = 6.3, barBgY = 1.6, barH3 = 0.32;
    s3.addShape(pptx.ShapeType.roundRect, { x: barBgX, y: barBgY, w: barBgW, h: barH3, fill: { color: CARD2 }, line: { color: BORD }, radius: 0.04 });
    const fillW3 = barBgW * (r.pctResolvidas / 100);
    if (fillW3 > 0.1) s3.addShape(pptx.ShapeType.roundRect, { x: barBgX, y: barBgY, w: fillW3, h: barH3, fill: { color: W }, line: { color: W }, radius: 0.04 });

    // Right stats
    const stats3 = [
      { l: 'Finalizadas', v: r.finalizadas, p: `${pctOf(r.finalizadas)}% do total` },
      { l: 'Em Aberto', v: r.abertas, p: `${pctOf(r.abertas)}% do total` },
      { l: 'Corretiva', v: r.corretivas, p: `${pctOf(r.corretivas)}% do total` },
      { l: 'Preventiva', v: r.preventivas, p: `${pctOf(r.preventivas)}% do total` },
      { l: 'Criticas', v: r.criticas, p: `${pctOf(r.criticas)}% do total` },
      { l: 'Paradas Prod.', v: r.paradasProd, p: `${pctOf(r.paradasProd)}% do total` },
    ];
    stats3.forEach((st, i) => {
      const sy = 2.1 + i * 0.75;
      s3.addShape(pptx.ShapeType.roundRect, { x: 6.3, y: sy, w: 6.7, h: 0.62, fill: { color: CARD }, line: { color: BORD }, radius: 0.05 });
      s3.addText(st.l.toUpperCase(), { x: 6.5, y: sy + 0.06, w: 3.0, h: 0.22, fontSize: 7.5, bold: true, color: DIM, charSpacing: 1.5 });
      s3.addText(String(st.v ?? '-'), { x: 6.5, y: sy + 0.26, w: 3.0, h: 0.3, fontSize: 16, bold: true, color: W });
      s3.addText(st.p, { x: 9.6, y: sy + 0.2, w: 3.2, h: 0.3, fontSize: 10, color: MID, align: 'right' });
    });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 4 — STATUS & PRIORIDADE (barras visuais)
    // ════════════════════════════════════════════════════════════════
    const s4 = pptx.addSlide();
    setBg(s4);
    addHdr(s4, 'Status & Prioridade', 'DISTRIBUICAO DAS ORDENS POR STATUS E NIVEL DE PRIORIDADE');
    addBarViz(s4, 0.5, 1.25, 5.9, 'Status das Ordens', relatorioStatusData, r.total);
    addBarViz(s4, 7.0, 1.25, 6.0, 'Por Prioridade', relatorioPorPrioridade, r.total);

    // ════════════════════════════════════════════════════════════════
    // SLIDE 5 — TIPO & CATEGORIA (barras visuais)
    // ════════════════════════════════════════════════════════════════
    const s5 = pptx.addSlide();
    setBg(s5);
    addHdr(s5, 'Tipo & Categoria', 'DISTRIBUICAO DAS ORDENS POR TIPO DE INTERVENCAO E CATEGORIA');
    addBarViz(s5, 0.5, 1.25, 5.9, 'Por Tipo de Intervencao', relatorioPorTipo, r.total);
    addBarViz(s5, 7.0, 1.25, 6.0, 'Por Categoria', relatorioPorCategoria.slice(0, 7), r.total);

    // ════════════════════════════════════════════════════════════════
    // SLIDE 6 — POR SETOR
    // ════════════════════════════════════════════════════════════════
    const s6 = pptx.addSlide();
    setBg(s6);
    addHdr(s6, 'Analise por Setor', 'PERFORMANCE DE CADA SETOR NO PERIODO');
    const setorData = relatorioPorSetor.slice(0, 14).map((s) => {
      const tm = s.tempoCount > 0 ? Math.round(s.tempoTotal / s.tempoCount / 3600000) : 0;
      return [s.setor, s.total, s.abertas, s.finalizadas, tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`, r.total > 0 ? `${Math.round((s.total / r.total) * 100)}%` : '0%'];
    });
    addTbl(s6, ['Setor', 'Total', 'Abertas', 'Finalizadas', 'T. Medio', 'Part.%'],
      setorData.length ? setorData : [['-', '-', '-', '-', '-', '-']],
      { x: 0.5, y: 1.28, w: 12.33, colW: [4.6, 1.5, 1.5, 1.8, 1.5, 1.43] });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 7 — TOP ATIVOS (barra visual horizontal ranking)
    // ════════════════════════════════════════════════════════════════
    const s7 = pptx.addSlide();
    setBg(s7);
    addHdr(s7, 'Top Ativos com Mais OS', 'EQUIPAMENTOS QUE MAIS DEMANDAM MANUTENCAO NO PERIODO');
    const maxAtivo = Math.max(...relatorioTopAtivos.map((a) => a.total), 1);
    const barMaxWA = 8.8, lblWA = 2.7, numW = 0.7, x0a = 0.5;
    const topCount = Math.min(relatorioTopAtivos.length, 12);
    relatorioTopAtivos.slice(0, topCount).forEach((item, idx) => {
      const iy = 1.28 + idx * 0.48;
      const bw = (item.total / maxAtivo) * barMaxWA;
      // rank
      s7.addShape(pptx.ShapeType.rect, { x: x0a, y: iy + 0.05, w: 0.3, h: 0.32, fill: { color: idx < 3 ? W : CARD2 }, line: { color: BORD } });
      s7.addText(String(idx + 1), { x: x0a, y: iy + 0.05, w: 0.3, h: 0.32, fontSize: 9, bold: true, color: idx < 3 ? BG : DIM, align: 'center', valign: 'middle' });
      // label
      s7.addText(item.ativo, { x: x0a + 0.38, y: iy + 0.05, w: lblWA, h: 0.32, fontSize: 10, color: W, valign: 'middle' });
      // bar track
      s7.addShape(pptx.ShapeType.rect, { x: x0a + 0.38 + lblWA, y: iy + 0.14, w: barMaxWA, h: 0.14, fill: { color: CARD2 }, line: { color: BORD } });
      // bar fill
      if (bw > 0.05) s7.addShape(pptx.ShapeType.rect, { x: x0a + 0.38 + lblWA, y: iy + 0.14, w: bw, h: 0.14, fill: { color: W }, line: { color: W } });
      // number
      s7.addText(String(item.total), { x: x0a + 0.38 + lblWA + barMaxWA + 0.08, y: iy + 0.05, w: numW, h: 0.32, fontSize: 11, bold: true, color: W, align: 'right', valign: 'middle' });
    });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 8 — PERFORMANCE POR RESPONSÁVEL
    // ════════════════════════════════════════════════════════════════
    const s8 = pptx.addSlide();
    setBg(s8);
    addHdr(s8, 'Performance por Responsavel', 'RANKING DE RESOLUCAO DA EQUIPE NO PERIODO');
    const respData = relatorioPorResponsavel.slice(0, 14).map((item) => {
      const tm = item.tempoCount > 0 ? Math.round(item.tempoTotal / item.tempoCount / 3600000) : 0;
      const pRes = item.total > 0 ? `${Math.round((item.finalizadas / item.total) * 100)}%` : '0%';
      return [item.responsavel, item.total, item.finalizadas, item.emAndamento, tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`, pRes];
    });
    addTbl(s8, ['Responsavel', 'Total', 'Finalizadas', 'Andamento', 'T. Medio', '% Res.'],
      respData.length ? respData : [['-', '-', '-', '-', '-', '-']],
      { x: 0.5, y: 1.28, w: 12.33, colW: [4.5, 1.5, 1.7, 1.7, 1.5, 1.43] });

    // ════════════════════════════════════════════════════════════════
    // SLIDE 9 — EVOLUÇÃO MENSAL (barras visuais verticais)
    // ════════════════════════════════════════════════════════════════
    const s9 = pptx.addSlide();
    setBg(s9);
    addHdr(s9, 'Evolucao Mensal', 'TOTAL DE ORDENS E TAXA DE FINALIZACAO POR MES');
    if (relatorioPorMes.length > 0) {
      const maxMT = Math.max(...relatorioPorMes.map((m) => m.total), 1);
      const barH9 = 3.8, baseY9 = 5.5;
      const totalW = 12.33, usedX = 0.5;
      const itemW = totalW / Math.max(relatorioPorMes.length, 1);
      relatorioPorMes.forEach((m, idx) => {
        const ix = usedX + idx * itemW;
        const bwAll = itemW * 0.55;
        const bwFin = itemW * 0.3;
        const hAll = (m.total / maxMT) * barH9;
        const hFin = (m.Finalizadas / maxMT) * barH9;
        // Total bar (background)
        if (hAll > 0.05) s9.addShape(pptx.ShapeType.rect, { x: ix + (itemW - bwAll) / 2, y: baseY9 - hAll, w: bwAll, h: hAll, fill: { color: CARD2 }, line: { color: BORD } });
        // Finalizadas bar (overlay)
        if (hFin > 0.05) s9.addShape(pptx.ShapeType.rect, { x: ix + (itemW - bwFin) / 2, y: baseY9 - hFin, w: bwFin, h: hFin, fill: { color: W }, line: { color: W } });
        // Value
        s9.addText(String(m.total), { x: ix, y: baseY9 - hAll - 0.3, w: itemW, h: 0.28, fontSize: 10, bold: true, color: W, align: 'center' });
        // Month label
        s9.addText(m.label, { x: ix, y: baseY9 + 0.1, w: itemW, h: 0.28, fontSize: 8.5, color: MID, align: 'center' });
      });
      // Legend
      s9.addShape(pptx.ShapeType.rect, { x: 0.5, y: 6.0, w: 0.22, h: 0.14, fill: { color: CARD2 }, line: { color: BORD } });
      s9.addText('Total', { x: 0.77, y: 5.96, w: 1.2, h: 0.22, fontSize: 9, color: MID });
      s9.addShape(pptx.ShapeType.rect, { x: 2.0, y: 6.0, w: 0.22, h: 0.14, fill: { color: W }, line: { color: W } });
      s9.addText('Finalizadas', { x: 2.27, y: 5.96, w: 1.5, h: 0.22, fontSize: 9, color: MID });
    } else {
      s9.addText('Sem dados mensais para o periodo selecionado.', { x: 0.5, y: 3.5, w: 12.33, h: 0.4, fontSize: 14, color: DIM, align: 'center' });
    }

    pptx.writeFile({ fileName: `relatorio_manutencao_${fileDate}.pptx` });
  };

  const handleExportarManutencaoPdf = () => {
    const now = new Date();

    const parseNumber = (value) => {
      if (value === null || value === undefined) return 0;
      const cleaned = String(value)
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const parseTempoMin = (value) => {
      if (value === null || value === undefined) return 0;
      const raw = String(value).trim();
      if (!raw) return 0;
    if (raw.includes(':')) {
      const parts = raw.split(':').map((part) => String(part || '').trim());
      if (parts.length >= 2) {
        const h = Number(parts[0].replace(',', '.'));
        const m = Number(parts[1].replace(',', '.'));
        const s = parts.length >= 3 ? Number(parts[2].replace(',', '.')) : 0;
        if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
          return Math.max(0, Math.round(h * 60 + m + s / 60));
        }
      }
    }
      const hMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*h/i);
      const mMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*m/i);
      if (hMatch || mMatch) {
        const h = hMatch ? Number(hMatch[1].replace(',', '.')) : 0;
        const m = mMatch ? Number(mMatch[1].replace(',', '.')) : 0;
        if (Number.isFinite(h) || Number.isFinite(m)) {
          return Math.max(
            0,
            Math.round((Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0))
          );
        }
      }
      return Math.max(0, Math.round(parseNumber(raw)));
    };

    const diffMin = (start, end) => {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (!startDate || !endDate) return 0;
      const ms = endDate.getTime() - startDate.getTime();
      if (!Number.isFinite(ms) || ms <= 0) return 0;
      return Math.round(ms / 60000);
    };

    const calcShiftMinutes = (start, end) => {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (!startDate || !endDate) return 0;
      if (endDate <= startDate) return 0;
      let total = 0;
      const cursor = new Date(startDate);
      cursor.setHours(0, 0, 0, 0);
      const last = new Date(endDate);
      last.setHours(0, 0, 0, 0);
      while (cursor <= last) {
        const shiftStart = new Date(cursor);
        shiftStart.setHours(7, 0, 0, 0);
        const shiftEnd = new Date(cursor);
        shiftEnd.setHours(17, 0, 0, 0);
        const rangeStart = new Date(Math.max(shiftStart.getTime(), startDate.getTime()));
        const rangeEnd = new Date(Math.min(shiftEnd.getTime(), endDate.getTime()));
        if (rangeEnd > rangeStart) {
          total += Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60000);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return total;
    };

    const getTempoParadaMin = (os) => {
      const informado = parseTempoMin(os?.tempoParada);
      if (informado > 0) return informado;
      if (String(os?.status || '').toLowerCase() !== 'finalizada') return 0;
      return calcShiftMinutes(os?.dataFalha, os?.fechadaEm || os?.updatedAt);
    };

    const getTempoParadaTotalMin = (os) => {
      if (String(os?.status || '').toLowerCase() !== 'finalizada') return 0;
      return diffMin(os?.dataFalha, os?.fechadaEm || os?.updatedAt);
    };

    const formatCurrency = (value) =>
      `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const formatTempo = (value) => {
      if (!Number.isFinite(value)) return '-';
      if (value <= 0) return '-';
      const total = Math.round(value);
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h`;
      return `${minutes}m`;
    };

    const ordensOrdenadas = [...manutencaoOrdens].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );

    const countBy = (items, getter) => {
      const map = {};
      items.forEach((item) => {
        const key = String(getter(item) || 'Nao informado');
        map[key] = (map[key] || 0) + 1;
      });
      return map;
    };

    const sumBy = (items, getter) =>
      items.reduce((acc, item) => acc + getter(item), 0);

    const statusCounts = countBy(manutencaoOrdens, (os) => os.status);
    const prioridadeCounts = countBy(manutencaoOrdens, (os) => os.prioridade);
    const tipoCounts = countBy(manutencaoOrdens, (os) => os.tipo);
    const setorCounts = countBy(manutencaoOrdens, (os) => os.setor);
    const responsavelCounts = countBy(manutencaoOrdens, (os) => os.responsavel);
    const ativoCounts = countBy(manutencaoOrdens, (os) => os.ativo);
    const impactoCounts = countBy(manutencaoOrdens, (os) => os.impacto);
    const paradaCounts = countBy(manutencaoOrdens, (os) => os.parada);
    const categoriaCounts = countBy(manutencaoOrdens, (os) => os.categoria);

    const totalCustoEstimado = sumBy(manutencaoOrdens, (os) => parseNumber(os.custoEstimado));
    const totalTempoParadaTurno = sumBy(manutencaoOrdens, (os) => getTempoParadaMin(os));
    const totalTempoParadaTotal = sumBy(manutencaoOrdens, (os) => getTempoParadaTotalMin(os));
    const mediaTempoParada =
      manutencaoOrdens.length > 0 ? totalTempoParadaTurno / manutencaoOrdens.length : 0;
    const totalTempoEstimado = sumBy(manutencaoOrdens, (os) => parseTempoMin(os.tempoEstimado));
    const mediaTempoEstimado =
      manutencaoOrdens.length > 0 ? totalTempoEstimado / manutencaoOrdens.length : 0;
    const totalFinalizadas = manutencaoOrdens.filter((os) => os.status === 'Finalizada').length;
    const taxaFinalizadas =
      manutencaoOrdens.length > 0
        ? `${Math.round((totalFinalizadas / manutencaoOrdens.length) * 100)}%`
        : '-';
    const comTempoParada = manutencaoOrdens.filter((os) => getTempoParadaMin(os) > 0).length;

    const createdDates = manutencaoOrdens
      .map((os) => os.createdAt || os.dataFalha)
      .map((value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      })
      .filter(Boolean)
      .sort((a, b) => a - b);

    const periodoInicio = createdDates.length ? formatDateOnlyRelatorio(createdDates[0]) : '-';
    const periodoFim = createdDates.length
      ? formatDateOnlyRelatorio(createdDates[createdDates.length - 1])
      : '-';

    const kpisResumo = [
      ...manutencaoKpis.map((kpi) => ({ label: kpi.label, value: kpi.value })),
      { label: 'Paradas', value: manutencaoParadas.length },
      { label: 'OS com tempo parada', value: comTempoParada },
      { label: 'Custo estimado total', value: formatCurrency(totalCustoEstimado) },
      { label: 'Tempo parada (turno 07-17)', value: formatTempo(totalTempoParadaTurno) },
      { label: 'Tempo parada total (24h)', value: formatTempo(totalTempoParadaTotal) },
      { label: 'Tempo parada medio', value: formatTempo(mediaTempoParada) },
      { label: 'Tempo estimado total', value: formatTempo(totalTempoEstimado) },
      { label: 'Tempo estimado medio', value: formatTempo(mediaTempoEstimado) },
      { label: 'OS finalizadas', value: totalFinalizadas },
      { label: 'Taxa de finalizacao', value: taxaFinalizadas },
    ];

    const kpisHtml = kpisResumo
      .map(
        (kpi) => `
          <div class="kpi">
            <div class="kpi-label">${escapeHtmlRelatorio(kpi.label)}</div>
            <div class="kpi-value">${escapeHtmlRelatorio(kpi.value)}</div>
          </div>
        `
      )
      .join('');

    const mapToRows = (map, limit = 8) => {
      const rows = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
      if (!rows.length) {
        return `<tr><td colspan="2" class="muted">Sem dados.</td></tr>`;
      }
      return rows
        .map(
          ([label, value]) => `
            <tr>
              <td>${escapeHtmlRelatorio(label)}</td>
              <td>${value}</td>
            </tr>
          `
        )
        .join('');
    };


    const pendencias = ordensOrdenadas.filter((os) => os.status !== 'Finalizada');
    const finalizadas = ordensOrdenadas.filter((os) => os.status === 'Finalizada');

    const paradasHtml = manutencaoParadas.length
      ? manutencaoParadas
          .map(
            (os) => `
              <tr>
                <td>${escapeHtmlRelatorio(os.ativo || '-')}</td>
                <td>${escapeHtmlRelatorio(os.setor || '-')}</td>
                <td>${escapeHtmlRelatorio(os.processo || '-')}</td>
                <td>${escapeHtmlRelatorio(os.statusMaquina || '-')}</td>
                <td>${escapeHtmlRelatorio(os.prioridade || '-')}</td>
                <td>${escapeHtmlRelatorio(formatTempo(getTempoParadaMin(os)))}</td>
              </tr>
            `
          )
          .join('')
      : `<tr><td colspan="6" class="muted">Sem paradas registradas.</td></tr>`;

    const ordensHtml = manutencaoOrdensLoading
      ? `<tr><td colspan="11" class="muted">Dados em carregamento.</td></tr>`
      : manutencaoOrdensError
        ? `<tr><td colspan="11" class="muted">${escapeHtmlRelatorio(manutencaoOrdensError)}</td></tr>`
        : ordensOrdenadas.length
          ? ordensOrdenadas
              .map(
                (os) => `
                  <tr>
                    <td>${escapeHtmlRelatorio(os.id || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.ativo || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.setor || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.processo || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.prioridade || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.tipo || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.status || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.statusMaquina || '-')}</td>
                    <td>${escapeHtmlRelatorio(os.responsavel || '-')}</td>
                    <td>${escapeHtmlRelatorio(formatTempo(getTempoParadaMin(os)))}</td>
                    <td>${escapeHtmlRelatorio(formatDateTimeRelatorio(os.createdAt || os.dataFalha))}</td>
                  </tr>
                `
              )
              .join('')
          : `<tr><td colspan="11" class="muted">Nenhuma OS cadastrada.</td></tr>`;

    const pendenciasHtml = pendencias.length
      ? pendencias
          .slice(0, 25)
          .map(
            (os) => `
              <tr>
                <td>${escapeHtmlRelatorio(os.id || '-')}</td>
                <td>${escapeHtmlRelatorio(os.ativo || '-')}</td>
                <td>${escapeHtmlRelatorio(os.setor || '-')}</td>
                <td>${escapeHtmlRelatorio(os.prioridade || '-')}</td>
                <td>${escapeHtmlRelatorio(os.status || '-')}</td>
                <td>${escapeHtmlRelatorio(os.responsavel || '-')}</td>
              </tr>
            `
          )
          .join('')
      : `<tr><td colspan="6" class="muted">Nenhuma pendencia encontrada.</td></tr>`;

    const finalizadasHtml = finalizadas.length
      ? finalizadas
          .slice(0, 25)
          .map(
            (os) => `
              <tr>
                <td>${escapeHtmlRelatorio(os.id || '-')}</td>
                <td>${escapeHtmlRelatorio(os.ativo || '-')}</td>
                <td>${escapeHtmlRelatorio(os.setor || '-')}</td>
                <td>${escapeHtmlRelatorio(os.prioridade || '-')}</td>
                <td>${escapeHtmlRelatorio(os.responsavel || '-')}</td>
                <td>${escapeHtmlRelatorio(formatTempo(getTempoParadaMin(os)))}</td>
                <td>${escapeHtmlRelatorio(
                  formatDateTimeRelatorio(
                    os.fechadaEm || os.updatedAt || os.createdAt || os.dataFalha || now
                  )
                )}</td>
              </tr>
            `
          )
          .join('')
      : `<tr><td colspan="7" class="muted">Nenhuma OS finalizada.</td></tr>`;

    const html = `
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatorio de Manutencao</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; color: #111827; background: #ffffff; }
          p { margin: 0; }
          .page { max-width: 1100px; margin: 18px auto; background: #ffffff; border: 1px solid #e5e7eb; padding: 20px 22px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; }
          .brand { display: flex; align-items: center; gap: 10px; }
          .brand img { width: 40px; height: 40px; object-fit: contain; }
          .title { font-size: 18px; font-weight: 700; letter-spacing: 0.01em; }
          .subtitle { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.16em; margin-top: 2px; }
          .meta-block { display: grid; gap: 4px; font-size: 11px; color: #374151; text-align: right; }
          .meta-block span { color: #9ca3af; }
          h2 { font-size: 11px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.16em; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
          th, td { padding: 7px 8px; border: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; color: #111827; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          tbody tr:nth-child(even) { background: #fafafa; }
          .muted { color: #9ca3af; text-align: center; }
          .section { margin-top: 14px; }
          .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .note { font-size: 10px; color: #6b7280; margin-top: 6px; }
          @media print {
            body { background: #ffffff; }
            .page { margin: 0; border: none; }
            th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="brand">
              <img src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa" />
              <div>
                <div class="title">Relatorio de Manutencao</div>
                <div class="subtitle">Metalosa</div>
              </div>
            </div>
            <div class="meta-block">
              <div><span>Gerado em:</span> ${escapeHtmlRelatorio(formatDateTimeRelatorio(now))}</div>
              <div><span>Periodo:</span> ${escapeHtmlRelatorio(periodoInicio)} a ${escapeHtmlRelatorio(periodoFim)}</div>
            </div>
          </div>

          <div class="section">
            <h2>Resumo</h2>
            <table>
              <tbody>
                <tr>
                  <th>Total de OS</th>
                  <td>${escapeHtmlRelatorio(manutencaoOrdens.length)}</td>
                  <th>OS finalizadas</th>
                  <td>${escapeHtmlRelatorio(totalFinalizadas)}</td>
                </tr>
                <tr>
                  <th>Pendencias</th>
                  <td>${escapeHtmlRelatorio(pendencias.length)}</td>
                  <th>Paradas em andamento</th>
                  <td>${escapeHtmlRelatorio(manutencaoParadas.length)}</td>
                </tr>
                <tr>
                  <th>Periodo</th>
                  <td colspan="3">${escapeHtmlRelatorio(periodoInicio)} a ${escapeHtmlRelatorio(periodoFim)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Indicadores</h2>
            <table>
              <tbody>
                ${kpisResumo
                  .map(
                    (kpi) => `
                      <tr>
                        <th>${escapeHtmlRelatorio(kpi.label)}</th>
                        <td>${escapeHtmlRelatorio(kpi.value)}</td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Distribuicoes</h2>
            <div class="grid-2">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Status das OS</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(statusCounts)}
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Prioridade</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(prioridadeCounts)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="grid-2">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(tipoCounts)}
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Setores</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(setorCounts)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="grid-2">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Responsaveis</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(responsavelCounts)}
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Ativos</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(ativoCounts)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="grid-2">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Impacto</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(impactoCounts)}
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(categoriaCounts)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="grid-2">
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Parada</th>
                      <th>Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${mapToRows(paradaCounts)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="note">Listas exibem os 8 primeiros itens de cada grupo.</div>
          </div>

          <div class="section">
            <h2>Distribuicoes</h2>
            <div class="grid-4">
              <div class="card">
                <div class="card-title">Status das OS</div>
                <table>
                  <tbody>
                    ${mapToRows(statusCounts)}
                </tbody>
              </table>
            </div>
            <div class="card">
              <div class="card-title">Prioridade</div>
              <table>
                <tbody>
                  ${mapToRows(prioridadeCounts)}
                </tbody>
              </table>
            </div>
            <div class="card">
              <div class="card-title">Tipo</div>
              <table>
                <tbody>
                  ${mapToRows(tipoCounts)}
                </tbody>
              </table>
            </div>
            <div class="card">
              <div class="card-title">Setores</div>
              <table>
                <tbody>
                  ${mapToRows(setorCounts)}
                </tbody>
              </table>
            </div>
              <div class="card">
                <div class="card-title">Responsaveis</div>
                <table>
                  <tbody>
                    ${mapToRows(responsavelCounts)}
                  </tbody>
                </table>
              </div>
              <div class="card">
                <div class="card-title">Impacto</div>
                <table>
                  <tbody>
                    ${mapToRows(impactoCounts)}
                  </tbody>
                </table>
              </div>
              <div class="card">
                <div class="card-title">Ativos mais acionados</div>
                <table>
                  <tbody>
                    ${mapToRows(ativoCounts)}
                  </tbody>
                </table>
              </div>
              <div class="card">
                <div class="card-title">Categoria</div>
                <table>
                  <tbody>
                    ${mapToRows(categoriaCounts)}
                  </tbody>
                </table>
              </div>
              <div class="card">
                <div class="card-title">Parada</div>
                <table>
                  <tbody>
                    ${mapToRows(paradaCounts)}
                </tbody>
              </table>
            </div>
            </div>
            <div class="note">Listas exibem os 8 primeiros itens de cada grupo.</div>
          </div>

          <div class="section">
            <h2>Paradas em andamento</h2>
            <table>
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Setor</th>
                  <th>Processo</th>
                  <th>Status Maquina</th>
                  <th>Prioridade</th>
                <th>Tempo parada (turno 07-17)</th>
                </tr>
              </thead>
              <tbody>
                ${paradasHtml}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Finalizadas (OS encerradas)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ativo</th>
                  <th>Setor</th>
                  <th>Prioridade</th>
                  <th>Responsavel</th>
                <th>Tempo parada (turno 07-17)</th>
                  <th>Fechada em</th>
                </tr>
              </thead>
              <tbody>
                ${finalizadasHtml}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Pendencias (OS nao finalizadas)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ativo</th>
                  <th>Setor</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  <th>Responsavel</th>
                </tr>
              </thead>
              <tbody>
                ${pendenciasHtml}
              </tbody>
            </table>
            <div class="note">Exibindo ate 25 pendencias mais recentes.</div>
          </div>

          <div class="section">
            <h2>Ordens de servico</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ativo</th>
                  <th>Setor</th>
                  <th>Processo</th>
                  <th>Prioridade</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Status maquina</th>
                  <th>Responsavel</th>
                  <th>Tempo parada (turno 07-17)</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                ${ordensHtml}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;
    printHtmlRelatorio(html);
  };

  const handleExportarUsuariosPdf = () => {
    const usuarios = [...(colaboradores || [])]
      .filter((item) => item?.nome)
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    const now = new Date();
    const totalUsuarios = usuarios.length;
    const totalSetores = new Set(usuarios.map((item) => item.setor).filter(Boolean)).size;
    const totalGestores = new Set(usuarios.map((item) => item.gestor).filter(Boolean)).size;

    const rowsHtml = usuarios.length
      ? usuarios
          .map(
            (usuario, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtmlRelatorio(usuario.nome || '-')}</td>
                <td>${escapeHtmlRelatorio(usuario.cargo || '-')}</td>
                <td>${escapeHtmlRelatorio(usuario.setor || '-')}</td>
                <td>${escapeHtmlRelatorio(usuario.gestor || '-')}</td>
                <td>${escapeHtmlRelatorio(usuario.matricula || usuario.id || '-')}</td>
                <td>${escapeHtmlRelatorio(usuario.email || '-')}</td>
              </tr>`
          )
          .join('')
      : '<tr><td colspan="7" class="muted">Nenhum usuario cadastrado para exportar.</td></tr>';

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatorio de Usuarios</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
          .page { max-width: 1100px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
          .brand { display: flex; align-items: center; gap: 14px; }
          .brand img { width: 52px; height: 52px; object-fit: contain; }
          .title { font-size: 22px; font-weight: 700; }
          .subtitle { margin-top: 4px; font-size: 12px; color: #475569; }
          .meta { font-size: 12px; color: #475569; text-align: right; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
          .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; }
          .card small { display: block; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
          .card strong { font-size: 24px; }
          .notice { margin-bottom: 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
          thead th { padding: 10px 12px; background: #0f172a; color: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; }
          tbody td { padding: 10px 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #1e293b; vertical-align: top; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          .muted { color: #64748b; text-align: center; }
          @media print {
            body { padding: 0; background: #fff; }
            .page { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="brand">
              <img src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa" />
              <div>
                <div class="title">Relatorio de Usuarios</div>
                <div class="subtitle">Base atual de colaboradores carregada no sistema</div>
              </div>
            </div>
            <div class="meta">
              <div>Gerado em ${escapeHtmlRelatorio(formatDateTimeRelatorio(now))}</div>
              <div>Total listado: ${escapeHtmlRelatorio(totalUsuarios)}</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <small>Usuarios</small>
              <strong>${escapeHtmlRelatorio(totalUsuarios)}</strong>
            </div>
            <div class="card">
              <small>Setores</small>
              <strong>${escapeHtmlRelatorio(totalSetores)}</strong>
            </div>
            <div class="card">
              <small>Gestores</small>
              <strong>${escapeHtmlRelatorio(totalGestores)}</strong>
            </div>
          </div>

          <div class="notice">
            Este relatorio nao inclui senhas nem credenciais. O aplicativo exporta apenas os dados de usuarios disponiveis no frontend.
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Setor</th>
                <th>Gestor</th>
                <th>Matricula/ID</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    printHtmlRelatorio(html);
  };

  useEffect(() => {
    if (isManutencaoOnly && abaAtiva !== 'manutencao') {
      setAbaAtiva('manutencao');
    }
  }, [isManutencaoOnly, abaAtiva]);

  useEffect(() => {
    if (isManutencaoOnly && dashboardView !== 'manutencao') {
      setDashboardView('manutencao');
    }
  }, [isManutencaoOnly, dashboardView]);

  useEffect(() => {
    if (isPortfolioDisabled && abaAtiva === 'portfolio') {
      setAbaAtiva('executivo');
    }
  }, [isPortfolioDisabled, abaAtiva]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      playTone(523, 180);
    } catch (err) {
      setLoginError('Email ou senha invalidos.');
    }
  };

  const handleSalvarPerfilNome = async () => {
    if (!authUser) return;
    const nome = String(perfilNomeInput || '').trim();
    if (nome.length < 3) {
      setPerfilNomeErro('Informe o nome completo ou um identificador com pelo menos 3 caracteres.');
      return;
    }
    const nowIso = new Date().toISOString();
    const payload = {
      uid: authUser.uid,
      email: authUser.email || '',
      nome,
      updatedAt: nowIso,
      createdAt: perfilManutencao?.createdAt || nowIso,
    };
    try {
      await setDoc(doc(db, 'manutencao_usuarios', authUser.uid), payload, { merge: true });
      await updateProfile(auth.currentUser, { displayName: nome }).catch(() => {});
      setPerfilManutencao(payload);
      setPerfilNomeInput(nome);
      setPerfilNomeErro('');
      setPerfilNomeModalOpen(false);
      await registrarLogManutencao({
        acao: 'perfil_nome_atualizado',
        descricao: `Atualizou o nome exibido para ${nome}.`,
        extra: { tipo: 'perfil' },
      }).catch(() => {});
    } catch (err) {
      setPerfilNomeErro('Nao foi possivel salvar o nome agora.');
    }
  };

  const handleLogout = async () => {
    setPerfilNomeModalOpen(false);
    setPerfilNomeErro('');
    setPerfilManutencao(null);
    await signOut(auth);
  };

  const atualizarOs = async (osId, updates, options = {}) => {
    if (!isAllowedDomain) {
      setManutencaoSaveError('Sem permissao para salvar.');
      return;
    }
    const ordemAtual = manutencaoOrdens.find((item) => item.id === osId);
    const statusAnterior = ordemAtual?.status || '';
    const statusNovo = updates?.status || statusAnterior;
    const reabrindoFinalizada =
      normalizarTexto(statusAnterior) === 'finalizada' &&
      normalizarTexto(statusNovo) !== 'finalizada';

    if (reabrindoFinalizada && !options.allowReopen) {
      setReaberturaContexto({ tipo: 'update', osId, updates, ordem: ordemAtual });
      setReaberturaStatusDestino(statusNovo || 'Contestada');
      setReaberturaContestar(true);
      setReaberturaMotivo('');
      setReaberturaErro('');
      return;
    }

    const patch = { ...updates, updatedAt: new Date().toISOString() };
    if (String(updates?.status || '').toLowerCase() === 'finalizada') {
      if (!updates?.statusMaquina) {
        const liberada = window.confirm('A maquina foi liberada?');
        patch.statusMaquina = liberada ? 'Rodando' : 'Parada';
      }
      if (!updates?.fechadaEm) {
        patch.fechadaEm = patch.updatedAt;
      }
    }
    if (reabrindoFinalizada) {
      patch.fechadaEm = '';
      patch.reabertaEm = patch.updatedAt;
      patch.reabertaPor = {
        uid: authUser?.uid || '',
        email: authUser?.email || '',
        nome: currentUserLabel,
      };
      patch.ultimaContestacao = options.reopenMeta || null;
    }
    try {
      await setDoc(doc(db, 'manutencao_os', osId), patch, { merge: true });
      setManutencaoOrdens((prev) =>
        prev.map((item) => (item.id === osId ? { ...item, ...patch } : item))
      );
      if (reabrindoFinalizada) {
        await registrarLogManutencao({
          acao: 'os_reaberta',
          ordem: ordemAtual,
          ordemId: osId,
          statusAnterior,
          statusNovo: patch.status || statusNovo,
          descricao: options.reopenMeta?.motivo
            ? `Reabriu a OS com contestacao: ${options.reopenMeta.motivo}`
            : 'Reabriu a OS sem contestacao.',
          contestacao: options.reopenMeta || null,
        });
      } else if (statusAnterior !== statusNovo) {
        await registrarLogManutencao({
          acao: 'status_alterado',
          ordem: ordemAtual,
          ordemId: osId,
          statusAnterior,
          statusNovo,
          descricao: `Alterou o status de ${statusAnterior || '-'} para ${statusNovo || '-'}.`,
        });
      } else if (
        updates?.responsavel &&
        normalizarTexto(updates.responsavel) !== normalizarTexto(ordemAtual?.responsavel || '')
      ) {
        await registrarLogManutencao({
          acao: 'os_assumida',
          ordem: ordemAtual,
          ordemId: osId,
          statusAnterior,
          statusNovo: patch.status || statusAnterior,
          descricao: `Atribuiu a OS para ${updates.responsavel}.`,
        });
      }
      if (String(updates?.status || '').toLowerCase() === 'finalizada') {
        playTone(784, 220);
      }
    } catch (err) {
      setManutencaoSaveError('Nao foi possivel atualizar a OS.');
    }
  };

  const fecharModalReabertura = () => {
    setReaberturaContexto(null);
    setReaberturaStatusDestino('Contestada');
    setReaberturaContestar(true);
    setReaberturaMotivo('');
    setReaberturaErro('');
  };

  const confirmarReaberturaOs = async () => {
    if (!reaberturaContexto) return;
    const motivo = String(reaberturaMotivo || '').trim();
    if (reaberturaContestar && !motivo) {
      setReaberturaErro('Informe o motivo da contestacao para reabrir a OS.');
      return;
    }
    const reopenMeta = {
      contestada: reaberturaContestar,
      motivo: reaberturaContestar ? motivo : '',
      reabertaEm: new Date().toISOString(),
      reabertaPor: {
        uid: authUser?.uid || '',
        email: authUser?.email || '',
        nome: currentUserLabel,
      },
      statusDestino: reaberturaStatusDestino,
    };

    try {
      if (reaberturaContexto.tipo === 'update') {
        const { osId, updates } = reaberturaContexto;
        fecharModalReabertura();
        await atualizarOs(
          osId,
          { ...updates, status: reaberturaStatusDestino },
          { allowReopen: true, reopenMeta }
        );
        return;
      }

      const { osId, payload, fotoUploadFalhou, ordem } = reaberturaContexto;
      const payloadFinal = {
        ...payload,
        status: reaberturaStatusDestino,
        fechadaEm: '',
        reabertaEm: reopenMeta.reabertaEm,
        reabertaPor: reopenMeta.reabertaPor,
        ultimaContestacao: reopenMeta,
        updatedAt: new Date().toISOString(),
      };
      fecharModalReabertura();
      await persistirOs({
        osId,
        payload: payloadFinal,
        fotoUploadFalhou,
        logConfig: {
          acao: 'os_reaberta',
          statusAnterior: ordem?.status || 'Finalizada',
          statusNovo: reaberturaStatusDestino,
          descricao: reopenMeta.motivo
            ? `Reabriu a OS com contestacao: ${reopenMeta.motivo}`
            : 'Reabriu a OS sem contestacao.',
          contestacao: reopenMeta,
        },
      });
    } catch (err) {
      setReaberturaErro('Nao foi possivel reabrir a OS agora.');
    }
  };

  useEffect(() => {
    if (!authUser || !isAllowedDomain) {
      setManutencaoOrdens([]);
      setManutencaoOrdensLoading(false);
      return;
    }

    setManutencaoOrdensLoading(true);
    setManutencaoOrdensError('');
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(
      collection(db, 'manutencao_os'),
      async (snap) => {
        let items = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            categoria: normalizarCategoriaOs(data.categoria),
          };
        });
        const nowIso = new Date().toISOString();
        const finalizadasSemFechamento = items.filter(
          (os) => os.status === 'Finalizada' && !os.fechadaEm
        );
        if (finalizadasSemFechamento.length) {
          try {
            await Promise.all(
              finalizadasSemFechamento.map((os) =>
                setDoc(
                  doc(db, 'manutencao_os', os.id),
                  { fechadaEm: nowIso, updatedAt: nowIso },
                  { merge: true }
                )
              )
            );
            items = items.map((os) =>
              os.status === 'Finalizada' && !os.fechadaEm
                ? { ...os, fechadaEm: nowIso, updatedAt: nowIso }
                : os
            );
          } catch (err) {
            console.error('Erro ao definir fechadaEm nas OS finalizadas:', err);
          }
        }
        items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setManutencaoOrdens(items);
        if (firstSnapshot) {
          setManutencaoOrdensLoading(false);
          firstSnapshot = false;
        }
      },
      () => {
        setManutencaoOrdensError('Nao foi possivel carregar as ordens.');
        setManutencaoOrdensLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authUser, isAllowedDomain]);

  useEffect(() => {
    if (!authUser || !isAllowedDomain) {
      setManutencaoLogs([]);
      setManutencaoLogsLoading(false);
      setManutencaoLogsError('');
      return;
    }

    setManutencaoLogsLoading(true);
    setManutencaoLogsError('');
    const logsQuery = query(
      collection(db, 'manutencao_logs'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      logsQuery,
      (snap) => {
        const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setManutencaoLogs(items);
        setManutencaoLogsLoading(false);
      },
      () => {
        setManutencaoLogsError('Nao foi possivel carregar os logs da manutencao.');
        setManutencaoLogsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authUser, isAllowedDomain]);

  const handleSalvarMaquina = async (nome, setor, processo) => {
    const nomeLimpo = String(nome || '').trim();
    if (!nomeLimpo) return;
    if (!authUser || !isAllowedDomain) {
      setMaquinasErro('Sem permissao para salvar maquinas.');
      return;
    }
    const setorLimpo = String(setor || '').trim();
    const processoLimpoBase = String(processo || '').trim();
    const processoLimpo =
      normalizarTexto(setorLimpo) === 'industria' ? processoLimpoBase : '';
    const baseId = normalizarIdFirestore(nomeLimpo);
    const existe = listaMaquinas.some((item) => item.id === baseId);
    const id = baseId && !existe ? baseId : `${baseId || 'maquina'}-${Date.now()}`;
    const payload = {
      nome: nomeLimpo,
      setor: setorLimpo,
      processo: processoLimpo,
      createdAt: new Date().toISOString(),
    };

    setMaquinasErro('');
    try {
      await setDoc(doc(db, 'maquinas', id), payload);
      if (setorLimpo) {
        const setorNorm = normalizarTexto(setorLimpo);
        const existeSetor = listaSetores.some(
          (item) => normalizarTexto(item) === setorNorm
        );
        if (!existeSetor) {
          const setorId = normalizarIdFirestore(setorLimpo);
          try {
            await setDoc(doc(db, 'setores', setorId), {
              nome: setorLimpo,
              createdAt: new Date().toISOString(),
            });
            setListaSetores((prev) =>
              [...prev, setorLimpo].sort((a, b) => String(a).localeCompare(String(b)))
            );
            setSetoresCarregadosFirestore(true);
          } catch (err) {
            // Se falhar ao salvar setor, mantemos o ativo salvo.
            console.error('Erro ao salvar setor da maquina:', err);
          }
        }
      }
      setListaMaquinas((prev) => {
        const atualizado = prev.some((item) => item.id === id)
          ? prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
          : [...prev, { id, ...payload }];
        return atualizado.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
      });
    } catch (err) {
      setMaquinasErro('Nao foi possivel salvar a maquina.');
    }
  };

  const handleExcluirMaquina = async (id) => {
    if (!authUser || !isAllowedDomain) {
      setMaquinasErro('Sem permissao para excluir maquinas.');
      return;
    }
    setMaquinasErro('');
    try {
      await deleteDoc(doc(db, 'maquinas', id));
      setListaMaquinas((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setMaquinasErro('Nao foi possivel excluir a maquina.');
    }
  };

  const handleResetNovoAtivoForm = () => {
    setNovoAtivoCc('Industria');
    setNovoAtivoProcesso('');
  };

  const handleSalvarSetor = async (nome) => {
    const nomeLimpo = String(nome || '').trim();
    if (!nomeLimpo) return;
    if (!authUser || !isAllowedDomain) {
      setSetoresErro('Sem permissao para salvar setores.');
      return;
    }
    const nomeNorm = normalizarTexto(nomeLimpo);
    const existe = listaSetores.some((item) => normalizarTexto(item) === nomeNorm);
    if (existe) return;
    const id = normalizarIdFirestore(nomeLimpo);
    const payload = { nome: nomeLimpo, createdAt: new Date().toISOString() };
    setSetoresErro('');
    try {
      await setDoc(doc(db, 'setores', id), payload);
      setListaSetores((prev) =>
        [...prev, nomeLimpo].sort((a, b) => String(a).localeCompare(String(b)))
      );
      setSetoresCarregadosFirestore(true);
    } catch (err) {
      setSetoresErro('Nao foi possivel salvar o setor.');
    }
  };

  const handleExcluirSetor = async (nome) => {
    if (!authUser || !isAllowedDomain) {
      setSetoresErro('Sem permissao para excluir setores.');
      return;
    }
    const id = normalizarIdFirestore(nome);
    setSetoresErro('');
    try {
      await deleteDoc(doc(db, 'setores', id));
      setListaSetores((prev) => prev.filter((item) => item !== nome));
    } catch (err) {
      setSetoresErro('Nao foi possivel excluir o setor.');
    }
  };

  const handleSalvarProcesso = async (nome) => {
    const nomeLimpo = String(nome || '').trim();
    if (!nomeLimpo) return;
    if (!authUser || !isAllowedDomain) {
      setProcessosErro('Sem permissao para salvar processos.');
      return;
    }
    const nomeNorm = normalizarTexto(nomeLimpo);
    const existe = listaProcessos.some((item) => normalizarTexto(item.nome) === nomeNorm);
    if (existe) return;
    const id = normalizarIdFirestore(nomeLimpo);
    const payload = {
      nome: nomeLimpo,
      setor: 'Industria',
      createdAt: new Date().toISOString(),
    };
    setProcessosErro('');
    try {
      await setDoc(doc(db, 'processos', id), payload);
      setListaProcessos((prev) =>
        [...prev, { id, ...payload }].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      );
    } catch (err) {
      setProcessosErro('Nao foi possivel salvar o processo.');
    }
  };

  const handleExcluirProcesso = async (id) => {
    if (!authUser || !isAllowedDomain) {
      setProcessosErro('Sem permissao para excluir processos.');
      return;
    }
    setProcessosErro('');
    try {
      await deleteDoc(doc(db, 'processos', id));
      setListaProcessos((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setProcessosErro('Nao foi possivel excluir o processo.');
    }
  };

  const handleSalvarProcessoMaquina = async () => {
    if (!processoEditId) return;
    if (!authUser || !isAllowedDomain) {
      setMaquinasErro('Sem permissao para salvar maquinas.');
      return;
    }
    const processoLimpo = String(processoEditValue || '').trim();
    setMaquinasErro('');
    try {
      await setDoc(
        doc(db, 'maquinas', processoEditId),
        { processo: processoLimpo },
        { merge: true }
      );
      setListaMaquinas((prev) =>
        prev.map((item) =>
          item.id === processoEditId ? { ...item, processo: processoLimpo } : item
        )
      );
      setProcessoEditOpen(false);
      setProcessoEditId(null);
      setProcessoEditValue('');
    } catch (err) {
      setMaquinasErro('Nao foi possivel salvar a maquina.');
    }
  };

  const toggleCfopFilter = (option) => {
    if (!option) return;
    if (option === 'Todos') {
      setFiltroCfops([]);
      return;
    }
    const normalized = String(option).trim();
    if (!normalized) return;
    setFiltroCfops((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  };
  const toggleCfopFilter2025 = (option) => {
    if (!option) return;
    if (option === 'Todos') {
      setFiltroCfops2025([]);
      return;
    }
    const normalized = String(option).trim();
    if (!normalized) return;
    setFiltroCfops2025((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  };
  const cfopSelectionSet = useMemo(() => {
    const set = new Set();
    filtroCfops.forEach((item) => {
      const normalized = String(item ?? '').trim();
      if (normalized) {
        set.add(normalized);
      }
    });
    return set;
  }, [filtroCfops]);
  const [modoRapidoTempo, setModoRapidoTempo] = useState('02:00');
  const [modoRapidoErro, setModoRapidoErro] = useState('');
  const [supervisorEditando, setSupervisorEditando] = useState(null);
  const [supervisorNome, setSupervisorNome] = useState('');
  const [faltasCarregadas, setFaltasCarregadas] = useState(false);
  const [presencaLeandroExcel, setPresencaLeandroExcel] = useState(null);
  const [resumoLeandroExcel, setResumoLeandroExcel] = useState(null);
  const [faltasResumoPlanilha, setFaltasResumoPlanilha] = useState({});
  const [faltasRegistrosPlanilha, setFaltasRegistrosPlanilha] = useState({});
  const [absenteismoResumo, setAbsenteismoResumo] = useState({
    carregando: true,
    erro: null,
    periodoLabel: '',
    totalPrev: 0,
    totalReal: 0,
    totalNTrab: 0,
    absPerc: 0,
    totalColab: 0,
    porSetor: [],
    porEvento: [],
    porMotivo: [],
  });
  const funcionariosFonte = useMemo(
    () => (funcionariosFirestore.length ? funcionariosFirestore : funcionariosBase),
    [funcionariosFirestore]
  );
  const legacyIdMap = useMemo(() => {
    const map = new Map();
    colaboradores.forEach((colab) => {
      if (colab.legacyId !== undefined && colab.legacyId !== null) {
        map.set(String(colab.legacyId), String(colab.id));
      }
    });
    return map;
  }, [colaboradores]);

  useEffect(() => {
    let ativo = true;
    const carregarLeandroJson = () => {
      try {
        if (!absenteismoLeandro?.meses) return;
        const supervisorNome = 'Leandro Souza';
        const mapaCodigos = {
          FJ: 'Falta Justificada',
          FI: 'Falta Injustificada',
          FE: 'Ferias',
          F: 'Ferias',
          ET: 'Falta Justificada',
          SC: 'Falta Justificada',
          CO: 'Falta Justificada',
          FRD: 'Falta Justificada',
          J: 'Falta Justificada',
          DSR: 'DSR',
          P: 'Presente',
        };

        const blocos = [];
        const resumoMeses = {};
        const colaboradoresTodos = [];

        Object.entries(absenteismoLeandro.meses).forEach(([mesBase, pessoas]) => {
          if (!mesBase.startsWith('2026-')) return;
          if (!pessoas || typeof pessoas !== 'object') return;
          const colaboradores = [];
          const resumoPorDia = {};

          Object.entries(pessoas).forEach(([nome, dados]) => {
            if (!dados || typeof dados !== 'object') return;
            const setor = typeof dados.setor === 'string' ? dados.setor.trim() : '';
            const dias = dados.dias || {};
            const excecoes = {};

            Object.entries(dias).forEach(([dia, codigoRaw]) => {
              const codigo = String(codigoRaw ?? '').trim().toUpperCase();
              if (!codigo) return;
              const diaStr = String(dia).padStart(2, '0');
              const dataISO = `${mesBase}-${diaStr}`;
              if (!resumoPorDia[dataISO]) {
                resumoPorDia[dataISO] = { P: 0, FI: 0, FJ: 0, FE: 0 };
              }

              if (codigo === 'P') {
                resumoPorDia[dataISO].P += 1;
                return;
              }
              if (codigo === 'F' || codigo === 'FE') {
                resumoPorDia[dataISO].FE += 1;
                excecoes[String(dia)] = 'FE';
                return;
              }
              if (codigo === 'FI') {
                resumoPorDia[dataISO].FI += 1;
                excecoes[String(dia)] = 'FI';
                return;
              }
              if (codigo === 'FJ') {
                resumoPorDia[dataISO].FJ += 1;
                excecoes[String(dia)] = 'FJ';
                return;
              }
              if (codigo === 'DSR') {
                excecoes[String(dia)] = 'DSR';
                return;
              }

              resumoPorDia[dataISO].FJ += 1;
              excecoes[String(dia)] = 'FJ';
            });

            colaboradores.push({
              nome: typeof nome === 'string' ? nome.trim() : String(nome ?? '').trim(),
              setor,
              dias,
              excecoes,
            });
          });

          blocos.push({
            mes: mesBase,
            supervisor: supervisorNome,
            mapaCodigos,
            colaboradores,
            usarDiasCompletos: true,
          });
          resumoMeses[mesBase] = resumoPorDia;
          colaboradoresTodos.push(...colaboradores);
        });

        if (!ativo) return;
        if (blocos.length) {
          setPresencaLeandroExcel({
            blocos,
            colaboradores: colaboradoresTodos,
          });
          setResumoLeandroExcel({ meses: resumoMeses });
        }
      } catch (err) {
        console.error('Erro ao carregar JSON do Leandro:', err);
      }
    };

    carregarLeandroJson();
    return () => {
      ativo = false;
    };
  }, []);


  useEffect(() => {
    let ativo = true;
    const carregarResumoAbsenteismo = async () => {
      try {
        const resp = await fetch('/data/absenteismo.json');
        if (!resp.ok) throw new Error('Nao foi possivel carregar a planilha.');
        const json = await resp.json();
        const planilhas = (json?.sheets || []).reduce((acc, sheet) => {
          if (sheet?.name) acc[sheet.name] = sheet.rows || [];
          return acc;
        }, {});

        const periodosRows =
          planilhas['1-Per?odos'] ||
          planilhas['1-Periodos'] ||
          encontrarSheet(planilhas, ['period']) ||
          [];
        const lancamentosRows =
          planilhas['2-Lan?amentos'] ||
          planilhas['2-Lancamentos'] ||
          encontrarSheet(planilhas, ['lanc']) ||
          [];

        const headerPeriodo = encontrarCabecalho(periodosRows, [
          'Nome',
          'Desc. C. Custo',
          'Hrs. Prev.',
          'Hrs. Real.',
        ]);
        const periodos = rowsToObjects(periodosRows, headerPeriodo);

        const headerLanc = encontrarCabecalho(lancamentosRows, [
          'Evento',
          'Horas',
          'Desc. C. Custo',
        ]);
        const lancamentos = rowsToObjects(lancamentosRows, headerLanc);

        const totalPrev = periodos.reduce((acc, row) => acc + parseNumeroPlanilha(row['Hrs. Prev.']), 0);
        const totalReal = periodos.reduce((acc, row) => acc + parseNumeroPlanilha(row['Hrs. Real.']), 0);
        const totalNTrab = periodos.reduce((acc, row) => acc + parseNumeroPlanilha(row['Hrs. N. Trab.']), 0);
        const totalColab = new Set(
          periodos.map((row) => String(row['Matricula'] || row['Nome'] || '').trim()).filter(Boolean)
        ).size;

        const absPerc = totalPrev > 0 ? (totalNTrab / totalPrev) * 100 : 0;

        const periodoLabel =
          periodos.find((row) => String(row['Periodo de Apontamento'] || '').trim())
            ?.['Periodo de Apontamento'] || '';

        const setorMap = new Map();
        periodos.forEach((row) => {
          const setor = String(row['Desc. C. Custo'] || 'Sem setor').trim() || 'Sem setor';
          if (!setorMap.has(setor)) {
            setorMap.set(setor, { setor, prev: 0, real: 0, nTrab: 0, colabs: new Set() });
          }
          const item = setorMap.get(setor);
          item.prev += parseNumeroPlanilha(row['Hrs. Prev.']);
          item.real += parseNumeroPlanilha(row['Hrs. Real.']);
          item.nTrab += parseNumeroPlanilha(row['Hrs. N. Trab.']);
          const colab = String(row['Matricula'] || row['Nome'] || '').trim();
          if (colab) item.colabs.add(colab);
        });

        const porSetor = Array.from(setorMap.values())
          .map((item) => ({
            setor: item.setor,
            prev: item.prev,
            real: item.real,
            nTrab: item.nTrab,
            absPerc: item.prev > 0 ? (item.nTrab / item.prev) * 100 : 0,
            colabs: item.colabs.size,
          }))
          .sort((a, b) => b.absPerc - a.absPerc);

        const eventoMap = new Map();
        lancamentos.forEach((row) => {
          const evento = String(row['Evento'] || 'Sem evento').trim() || 'Sem evento';
          const horas = parseNumeroPlanilha(row['Horas']);
          if (!eventoMap.has(evento)) {
            eventoMap.set(evento, { evento, horas: 0 });
          }
          eventoMap.get(evento).horas += horas;
        });
        const totalHorasLanc = Array.from(eventoMap.values()).reduce((acc, item) => acc + item.horas, 0);
        const porEvento = Array.from(eventoMap.values())
          .map((item) => ({
            evento: item.evento,
            horas: item.horas,
            perc: totalHorasLanc > 0 ? (item.horas / totalHorasLanc) * 100 : 0,
          }))
          .sort((a, b) => b.horas - a.horas);

        const motivoMap = new Map();
        lancamentos.forEach((row) => {
          const motivo = String(row['Motivo'] || 'Sem motivo').trim() || 'Sem motivo';
          const horas = parseNumeroPlanilha(row['Horas']);
          if (!motivoMap.has(motivo)) {
            motivoMap.set(motivo, { motivo, horas: 0 });
          }
          motivoMap.get(motivo).horas += horas;
        });
        const porMotivo = Array.from(motivoMap.values())
          .map((item) => ({
            motivo: item.motivo,
            horas: item.horas,
            perc: totalHorasLanc > 0 ? (item.horas / totalHorasLanc) * 100 : 0,
          }))
          .sort((a, b) => b.horas - a.horas);

        if (!ativo) return;
        setAbsenteismoResumo({
          carregando: false,
          erro: null,
          periodoLabel,
          totalPrev,
          totalReal,
          totalNTrab,
          absPerc,
          totalColab,
          porSetor,
          porEvento,
          porMotivo,
        });
      } catch (err) {
        if (!ativo) return;
        setAbsenteismoResumo((prev) => ({
          ...prev,
          carregando: false,
          erro: err instanceof Error ? err.message : 'Erro ao carregar planilha.',
        }));
      }
    };

    carregarResumoAbsenteismo();
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    const carregarFaltasPlanilha = async () => {
      try {
        const resp = await fetch('/data/faltas.json');
        if (!resp.ok) return;
        const json = await resp.json();
        if (!ativo) return;
        const resumo = json?.summaryByDate;
        const registros = json?.byDate;
        if (resumo && typeof resumo === 'object') {
          setFaltasResumoPlanilha(resumo);
        }
        if (registros && typeof registros === 'object') {
          setFaltasRegistrosPlanilha(registros);
        }
      } catch (err) {
        console.error('Erro ao carregar faltas.json:', err);
      }
    };
    carregarFaltasPlanilha();
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!tourOperadorOpen) return;
    const passo = GUIA_OPERADOR_TOUR[tourOperadorStep];
    if (!passo) {
      setTourOperadorOpen(false);
      setTourOperadorPos(null);
      if (manutencaoModalOpen && !manutencaoEditId) {
        setManutencaoModalOpen(false);
      }
      return;
    }
    if (!passo.requiresModal && manutencaoModalOpen && !manutencaoEditId) {
      setManutencaoModalOpen(false);
    }
    let scrollModal = null;
    let boundsModal = null;
    let retryTimer = null;
    let attempts = 0;
    let cancelled = false;

    const encontrarProximoPassoValido = () => {
      for (let i = tourOperadorStep + 1; i < GUIA_OPERADOR_TOUR.length; i += 1) {
        const step = GUIA_OPERADOR_TOUR[i];
        if (!step) continue;
        if (step.requiresModal && !manutencaoModalOpen) {
          return i;
        }
        const nodes = Array.from(document.querySelectorAll(step.selector));
        const visible = nodes.find((node) => {
          const r = node.getBoundingClientRect();
          return r && r.width > 0 && r.height > 0;
        });
        if (visible) return i;
      }
      return null;
    };

    const atualizarPosicao = () => {
      if (cancelled) return;
      if (passo.requiresModal && !manutencaoModalOpen) {
        setTourOperadorPos(null);
        setManutencaoModalOpen(true);
        if (attempts < 12) {
          attempts += 1;
          retryTimer = setTimeout(atualizarPosicao, 200);
        }
        return;
      }
      scrollModal = passo.requiresModal
        ? document.querySelector('[data-tour="nova-os-scroll"]')
        : null;
      boundsModal = passo.requiresModal
        ? document.querySelector('[data-tour="nova-os-container"]')
        : null;
      if (passo.requiresModal && (!scrollModal || !boundsModal)) {
        setTourOperadorPos(null);
        if (attempts < 12) {
          attempts += 1;
          retryTimer = setTimeout(atualizarPosicao, 200);
        }
        return;
      }
      const nodes = Array.from(document.querySelectorAll(passo.selector));
      const el = nodes.find((node) => {
        const r = node.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0;
      }) || nodes[0];
      if (!el) {
        setTourOperadorPos(null);
        if (attempts < 6) {
          attempts += 1;
          retryTimer = setTimeout(atualizarPosicao, 200);
        } else {
          const prox = encontrarProximoPassoValido();
          if (prox !== null) {
            setTourOperadorStep(prox);
          } else {
            setTourOperadorOpen(false);
          }
        }
        return;
      }
      if (passo.requiresModal && scrollModal && !scrollModal.contains(el)) {
        setTourOperadorPos(null);
        if (attempts < 12) {
          attempts += 1;
          retryTimer = setTimeout(atualizarPosicao, 200);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        setTourOperadorPos(null);
        if (attempts < 12) {
          attempts += 1;
          retryTimer = setTimeout(atualizarPosicao, 200);
        }
        return;
      }
      if (scrollModal) {
        scrollModal.scrollTo({
          top: el.offsetTop - scrollModal.clientHeight / 2 + el.clientHeight / 2,
          behavior: 'smooth',
        });
        // Recalcula após o scroll animado do modal
        setTimeout(() => {
          if (cancelled) return;
          const rectAfter = el.getBoundingClientRect();
          if (!rectAfter || rectAfter.width === 0 || rectAfter.height === 0) {
            setTourOperadorPos(null);
            return;
          }
          const modalRect = boundsModal?.getBoundingClientRect?.();
          posicionarPopup(rectAfter, modalRect);
        }, 220);
        return;
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      posicionarPopup(rect, null);
    };

    const posicionarPopup = (rect, modalRect) => {
      const offset = 12;
      let top = rect.top;
      let left = rect.left;
      let transform = 'translate(0, 0)';
      const popupWidth = 360;
      const popupHeight = 180;
      const margin = 12;

      if (passo.placement === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + offset;
        transform = 'translate(0, -50%)';
      } else if (passo.placement === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - offset;
        transform = 'translate(-100%, -50%)';
      } else if (passo.placement === 'top') {
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
        transform = 'translate(-50%, -100%)';
      } else {
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2;
        transform = 'translate(-50%, 0)';
      }

      const boundsLeft = modalRect ? modalRect.left : 0;
      const boundsTop = modalRect ? modalRect.top : 0;
      const boundsRight = modalRect ? modalRect.right : window.innerWidth;
      const boundsBottom = modalRect ? modalRect.bottom : window.innerHeight;

      const minLeft = boundsLeft + margin;
      const maxLeft = boundsRight - popupWidth - margin;
      const minTop = boundsTop + margin;
      const maxTop = boundsBottom - popupHeight - margin;
      const clampedLeft = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
      const clampedTop = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

      setTourOperadorPos({
        rect,
        top: clampedTop,
        left: clampedLeft,
        transform,
      });
    };

    atualizarPosicao();
    const onResize = () => atualizarPosicao();
    const onScroll = () => atualizarPosicao();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    if (scrollModal) {
      scrollModal.addEventListener('scroll', onScroll, true);
    }
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      if (scrollModal) {
        scrollModal.removeEventListener('scroll', onScroll, true);
      }
    };
  }, [tourOperadorOpen, tourOperadorStep, manutencaoModalOpen]);

  useEffect(() => {
    const deveRecarregar = funcionariosFirestore.length > 0 || !colaboradores.length;
    if (deveRecarregar) {
      const colaboradoresIniciais = (funcionariosFonte || []).map((item, index) => ({
        id: gerarIdColaborador(item.nome, item.setor),
        legacyId: index + 1,
        nome: item.nome,
        cargo: 'Operador',
        setor: item.setor,
        gestor: item.gestor || 'Thalles',
        estaAusente: false,
        tipoFalta: 'Presente',
      }));

      const chaves = new Set(
        colaboradoresIniciais.map((c) => gerarIdColaborador(c.nome, c.setor))
      );

      if (presencaLeandroExcel?.colaboradores?.length) {
        const gestorPadrao = 'Leandro Souza';
        presencaLeandroExcel.colaboradores.forEach((colab) => {
          if (!colab || typeof colab.setor !== 'string') return;
          const chave = gerarIdColaborador(colab.nome, colab.setor);
          if (chaves.has(chave)) return;
          colaboradoresIniciais.push({
            id: chave,
            legacyId: colaboradoresIniciais.length + 1,
            nome: colab.nome,
            cargo: 'Operador',
            setor: colab.setor,
            gestor: gestorPadrao,
            estaAusente: false,
            tipoFalta: 'Presente',
          });
          chaves.add(chave);
        });
      }

      setColaboradores(colaboradoresIniciais);
    }
    if (!setoresCarregadosFirestore && (!listaSetores.length || funcionariosFirestore.length > 0)) {
      const setores = new Set((funcionariosFonte || []).map((item) => item.setor).filter(Boolean));
      if (presencaLeandroExcel?.colaboradores?.length) {
        presencaLeandroExcel.colaboradores.forEach((colab) => {
          if (typeof colab?.setor === 'string' && colab.setor.trim()) {
            setores.add(colab.setor.trim());
          }
        });
      }
      setListaSetores(Array.from(setores));
    }
  }, [
    presencaLeandroExcel,
    funcionariosFonte,
    funcionariosFirestore.length,
    colaboradores.length,
    listaSetores.length,
    setoresCarregadosFirestore,
  ]);

  useEffect(() => {
    if (!presencaLeandroExcel?.colaboradores?.length) return;

    setColaboradores((prev) => {
      const existentes = new Set(
        prev.map((c) => gerarIdColaborador(c.nome, c.setor))
      );
      let next = [...prev];
      const gestorPadrao = 'Leandro Souza';
      let nextLegacyId = next.reduce((acc, item) => Math.max(acc, item.legacyId || 0), 0);

      presencaLeandroExcel.colaboradores.forEach((colab) => {
        if (!colab || typeof colab.setor !== 'string') return;
        const chave = gerarIdColaborador(colab.nome, colab.setor);
        if (existentes.has(chave)) return;
        nextLegacyId += 1;
        next = [
          ...next,
          {
            id: chave,
            legacyId: nextLegacyId,
            nome: colab.nome,
            cargo: 'Operador',
            setor: colab.setor,
            gestor: gestorPadrao,
            estaAusente: false,
            tipoFalta: 'Presente',
          },
        ];
        existentes.add(chave);
      });

      return next;
    });
  }, [presencaLeandroExcel]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarSupervisores = async () => {
      try {
        const snap = await getDocs(collection(db, 'supervisores'));
        if (!ativo) return;

        if (!snap.empty) {
          const nomes = snap.docs
            .map((docRef) => docRef.data().nome)
            .filter(Boolean);
          if (nomes.length) {
            setListaGestores(nomes);
            return;
          }
        }

        const base = GESTORES_INICIAIS.length ? GESTORES_INICIAIS : ['Thalles'];
        await Promise.all(
          base.map((nome) =>
            setDoc(doc(db, 'supervisores', normalizarIdFirestore(nome)), { nome })
          )
        );
        if (!ativo) return;
        setListaGestores(base);
      } catch (err) {
        console.error('Erro ao carregar supervisores:', err);
      }
    };

    carregarSupervisores();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarMaquinas = async () => {
      setMaquinasErro('');
      try {
        const snap = await getDocs(collection(db, 'maquinas'));
        if (!ativo) return;
        const items = snap.docs.map((docRef) => ({
          id: docRef.id,
          ...docRef.data(),
        }));
        const mergedMap = new Map();
        items.forEach((item) => mergedMap.set(item.id, item));
        maquinasBaseData.forEach((item) => {
          if (!mergedMap.has(item.id)) {
            mergedMap.set(item.id, item);
          }
        });
        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
        setListaMaquinas(merged);
      } catch (err) {
        if (!ativo) return;
        if (maquinasBaseData.length > 0) {
          setListaMaquinas(maquinasBaseData);
        } else {
          setMaquinasErro('Nao foi possivel carregar as maquinas.');
        }
      }
    };

    carregarMaquinas();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarSetores = async () => {
      setSetoresErro('');
      try {
        const snap = await getDocs(collection(db, 'setores'));
        if (!ativo) return;
        const items = snap.docs
          .map((docRef) => docRef.data().nome || docRef.id)
          .filter(Boolean);
        const merged = new Set(items);
        setoresBaseData.forEach((setor) => merged.add(setor));
        const mergedList = Array.from(merged)
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b)));
        setListaSetores(mergedList);
        setSetoresCarregadosFirestore(true);
      } catch (err) {
        if (!ativo) return;
        if (setoresBaseData.length || SETORES_BASE.length) {
          setListaSetores(setoresBaseData);
        } else {
          setSetoresErro('Nao foi possivel carregar os setores.');
        }
      }
    };

    carregarSetores();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarProcessos = async () => {
      setProcessosErro('');
      try {
        const snap = await getDocs(collection(db, 'processos'));
        if (!ativo) return;
        const items = snap.docs
          .map((docRef) => ({ id: docRef.id, ...docRef.data() }))
          .filter((item) => item?.nome);
        items.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
        setListaProcessos(items);
      } catch (err) {
        if (!ativo) return;
        setProcessosErro('Nao foi possivel carregar os processos.');
      }
    };

    carregarProcessos();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarFuncionarios = async () => {
      try {
        const snap = await getDocs(collection(db, 'funcionarios'));
        if (!ativo) return;
        const itens = snap.docs
          .map((docRef) => docRef.data())
          .filter((item) => item?.nome);
        if (itens.length) {
          setFuncionariosFirestore(
            itens.map((item) => ({
              nome: item.nome || '',
              setor: item.setor || '',
              gestor: item.gestor || 'Thalles',
            }))
          );
        }
      } catch (err) {
        console.error('Erro ao carregar funcionarios:', err);
      }
    };

    carregarFuncionarios();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!colaboradores.length) return;

    setRegistrosPorData((prev) => {
      const mapaIds = new Map(
        colaboradores.map((colab) => [gerarIdColaborador(colab.nome, colab.setor), colab.id])
      );
      const mapaIdsNome = new Map(
        colaboradores.map((colab) => [normalizarTexto(colab.nome), colab.id])
      );

      const mapearTipo = (valor) => {
        const normal = normalizarTexto(valor);
        const compacto = normal.replace(/\s+/g, '');
        if (!normal) return 'Presente';
        if (normal.includes('presen') || compacto.includes('presen')) return 'Presente';
        if (normal.includes('justificada') || compacto.includes('justificada')) return 'Falta Justificada';
        if (normal.includes('injustificada') || compacto.includes('injustificada')) return 'Falta Injustificada';
        if (normal.includes('parcial') || compacto.includes('parcial')) return 'Falta Parcial';
        if (
          normal.includes('feria') ||
          normal.includes('fria') ||
          compacto.includes('feria') ||
          compacto.includes('ferias') ||
          compacto.includes('fria') ||
          compacto.includes('frias')
        ) {
          return 'Ferias';
        }
        if (compacto === 'fj') return 'Falta Justificada';
        if (compacto === 'fi') return 'Falta Injustificada';
        if (compacto === 'fe') return 'Ferias';
        if (['sc', 'et', 'co', 'frd', 'j'].includes(compacto)) return 'Falta Justificada';
        if (compacto === 'dsr') return 'DSR';
        return 'Presente';
      };

      const registros = { ...prev };

      const aplicarExcecoes = (dados) => {
        if (!dados || !dados.colaboradores) return;
        const mapaCodigos = dados.mapaCodigos || {};
        const mesBase = dados.mes || '2025-12';
        const usarDiasCompletos = Boolean(dados.usarDiasCompletos);

        const aplicarCodigo = (id, dia, codigo) => {
          const bruto = mapaCodigos[codigo] || codigo;
          const tipo = mapearTipo(bruto);
          const diaStr = String(dia).padStart(2, '0');
          const dataISO = `${mesBase}-${diaStr}`;

          if (tipo === 'Presente' || tipo === 'DSR') {
            if (registros[dataISO]?.[id]) {
              delete registros[dataISO][id];
              if (Object.keys(registros[dataISO]).length === 0) {
                delete registros[dataISO];
              }
            }
            return;
          }

          if (!registros[dataISO]) registros[dataISO] = {};
          registros[dataISO][id] = { tipoFalta: tipo };
        };

        dados.colaboradores.forEach((colab) => {
          const chave = gerarIdColaborador(colab.nome, colab.setor);
          const id = mapaIds.get(chave) || mapaIdsNome.get(normalizarTexto(colab.nome));
          if (!id) return;

          if (usarDiasCompletos && colab.dias) {
            Object.entries(colab.dias).forEach(([dia, codigo]) => {
              const codigoStr = String(codigo ?? '').trim().toUpperCase();
              if (!codigoStr) return;
              aplicarCodigo(id, dia, codigoStr);
            });
            return;
          }

          if (!colab.excecoes) return;
          Object.entries(colab.excecoes).forEach(([dia, codigo]) => {
            aplicarCodigo(id, dia, codigo);
          });
        });
      };

      if (presencaLeandroExcel?.blocos?.length) {
        presencaLeandroExcel.blocos.forEach((bloco) => aplicarExcecoes(bloco));
      }

      return registros;
    });
  }, [colaboradores, presencaLeandroExcel, faltasCarregadas]);

  useEffect(() => {
    if (!legacyIdMap.size) return;
    setRegistrosPorData((prev) => {
      let mudou = false;
      const next = {};
      Object.entries(prev || {}).forEach(([dataISO, registros]) => {
        const registrosDia = {};
        Object.entries(registros || {}).forEach(([id, registro]) => {
          const idStr = String(id);
          const novoId = legacyIdMap.get(idStr) || idStr;
          if (novoId !== idStr) mudou = true;
          registrosDia[novoId] = registro;
        });
        next[dataISO] = registrosDia;
      });
      return mudou ? next : prev;
    });
  }, [legacyIdMap]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    let ativo = true;
    const carregarFaltas = async () => {
      try {
        const snap = await getDocs(collection(db, 'faltas'));
        if (!ativo) return;
        const registros = {};
        snap.forEach((docRef) => {
          if (!docRef.id.startsWith('2026-')) return;
          const data = docRef.data();
          if (data && data.registros) {
            registros[docRef.id] = data.registros;
          }
        });
        if (Object.keys(registros).length) {
          setRegistrosPorData((prev) => ({ ...prev, ...registros }));
        }
        setFaltasCarregadas(true);
      } catch (err) {
        console.error('Erro ao carregar faltas:', err);
        setFaltasCarregadas(true);
      }
    };

    carregarFaltas();
    return () => {
      ativo = false;
    };
  }, [isAllowedDomain]);

  useEffect(() => {
    if (!isAllowedDomain) return;
    if (!faltasCarregadas) return;
    const salvar = async () => {
      const dias = Object.keys(registrosPorData).filter((dia) => dia.startsWith('2026-'));
      await Promise.all(
        dias.map((dia) =>
          setDoc(doc(db, 'faltas', dia), { registros: registrosPorData[dia] }, { merge: true })
        )
      );
    };

    salvar().catch((err) => console.error('Erro ao salvar faltas:', err));
  }, [registrosPorData, faltasCarregadas]);

  useEffect(() => {
    let ativo = true;
    let carregando = false;
    let lastSignature = null;
    let hasData = false;
    const obterSignature = (headers) => {
      const etag = headers?.get?.('etag');
      if (etag) return `etag:${etag}`;
      const lastModified = headers?.get?.('last-modified');
      if (lastModified) return `lm:${lastModified}`;
      return null;
    };
    const obterDataHeader = (headers) => {
      const lastModified = headers?.get?.('last-modified');
      if (!lastModified) return null;
      const parsed = new Date(lastModified);
      return Number.isNaN(parsed.valueOf()) ? null : parsed;
    };
  const carregarFaturamento = async () => {
      if (carregando || !ativo) return;
      carregando = true;
      try {
        let linhas = [];
        let baseOk = false;
        const cacheBust = `?t=${Date.now()}`;
        try {
          let precisaAtualizar = true;
          try {
            const headResp = await fetch('/data/faturamento.json', {
              method: 'HEAD',
              cache: 'no-store',
            });
            if (headResp.ok) {
              const signature = obterSignature(headResp.headers);
              if (signature && signature === lastSignature) {
                precisaAtualizar = false;
              } else if (signature) {
                lastSignature = signature;
              }
              const dataHeader = obterDataHeader(headResp.headers);
              if (dataHeader) setFaturamentoArquivoEm(dataHeader);
            }
          } catch (err) {
            // Se HEAD falhar, tenta GET normal.
          }

          if (!precisaAtualizar && hasData) {
            carregando = false;
            return;
          }

          if (precisaAtualizar) {
            const respAtual = await fetch(`/data/faturamento.json${cacheBust}`, { cache: 'no-store' });
            if (respAtual.ok) {
              const atuais = await respAtual.json();
              if (Array.isArray(atuais)) {
                linhas = [...atuais];
                baseOk = true;
              }
              const signature = obterSignature(respAtual.headers);
              if (signature) lastSignature = signature;
              const dataHeader = obterDataHeader(respAtual.headers);
              if (dataHeader) setFaturamentoArquivoEm(dataHeader);
            }
          }
        } catch (err) {
          console.warn('Nao foi possivel carregar faturamento.json:', err);
        }

        if (!baseOk) {
          linhas = Array.isArray(faturamentoData) ? [...faturamentoData] : [];
        }

        const devolucoes = Array.isArray(devolucaoData) ? [...devolucaoData] : [];
        try {
          const resp = await fetch(`/data/faturamento-2025.json${cacheBust}`, { cache: 'no-store' });
          if (resp.ok) {
            const antigas = await resp.json();
            if (Array.isArray(antigas)) {
              linhas = [...antigas, ...linhas];
            }
          }
          const respDevolucao = await fetch(`/data/devolucao-2025.json${cacheBust}`, {
            cache: 'no-store',
          });
          if (respDevolucao.ok) {
            const devolucao2025 = await respDevolucao.json();
            if (Array.isArray(devolucao2025)) {
              linhas = [...linhas, ...devolucao2025];
            }
          }
        } catch (err) {
          console.warn('Nao foi possivel carregar faturamento-2025.json:', err);
        }

        if (devolucoes.length) {
          linhas = [...linhas, ...devolucoes];
        }

        if (!ativo) return;
        setFaturamentoLinhas(linhas);
        setFaturamentoAtualizadoEm(new Date());
        hasData = true;
        const linhas2025 = linhas.filter((row) => obterMesKey(row)?.key?.startsWith('2025-'));
        const total = linhas2025.reduce((acc, row) => acc + obterValorLiquido(row), 0);

          const porGrupoMap = linhas2025.reduce((acc, row) => {
            const grupoRaw = row['Grupo'];
            const grupo = grupoRaw && String(grupoRaw).trim() ? String(grupoRaw).trim() : 'Sem grupo';
            const valor = obterValorLiquido(row);
            const codigo = row['Codigo'];
            const descricao = row['Descricao'];
            const chaveItem = `${codigo ?? ''}||${descricao ?? ''}`;

          if (!acc.has(grupo)) {
            acc.set(grupo, { total: 0, itens: new Map() });
          }

          const grupoData = acc.get(grupo);
          grupoData.total += valor;
          if (!grupoData.itens.has(chaveItem)) {
            grupoData.itens.set(chaveItem, {
              codigo: codigo ?? '',
              descricao: descricao ?? '',
              total: 0,
            });
          }
          grupoData.itens.get(chaveItem).total += valor;

          return acc;
        }, new Map());

          const porMesMap = linhas2025.reduce((acc, row) => {
            const mes = row['MesEmissao'];
            if (!mes) return acc;
            const valor = obterValorLiquido(row);
            acc.set(mes, (acc.get(mes) || 0) + valor);
            return acc;
        }, new Map());

        const porGrupo = Array.from(porGrupoMap.entries())
          .map(([grupo, data]) => ({
            grupo,
            valor: data.total,
            itens: Array.from(data.itens.values()).sort((a, b) => b.total - a.total),
          }))
          .sort((a, b) => b.valor - a.valor);

        const porMes = Array.from(porMesMap.entries())
          .map(([mes, valor]) => {
            const [mesNum, ano] = String(mes).split('/');
            const ordem = `${ano}-${String(mesNum).padStart(2, '0')}`;
            return { mes, valor, ordem };
          })
          .sort((a, b) => a.ordem.localeCompare(b.ordem));

        setFaturamentoDados({
          carregando: false,
          erro: null,
          total,
          porGrupo,
          porMes,
        });
      } catch (err) {
        if (!ativo) return;
        setFaturamentoLinhas([]);
        setFaturamentoDados({
          carregando: false,
          erro: err instanceof Error ? err.message : 'Erro ao processar planilha.',
          total: 0,
          porGrupo: [],
          porMes: [],
        });
      } finally {
        carregando = false;
      }
    };

    carregarFaturamento();
    const intervalo = setInterval(carregarFaturamento, FATURAMENTO_REFRESH_MS);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, []);

  const tocarSomMoeda = (force = false) => {
    if ((!somAtivo && !force) || typeof window === 'undefined') return;
    const AudioContextRef = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextRef) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextRef();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1200, now);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(900, now + 0.02);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.02);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.28);
  };

  const alternarSom = () => {
    setSomAtivo((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => tocarSomMoeda(true), 0);
      }
      return next;
    });
  };

  const clientesPorCodigo = useMemo(() => {
    const lista = Array.isArray(clientesData?.clientes) ? clientesData.clientes : [];
    return lista.reduce((acc, item) => {
      const codigo = normalizarCodigoCliente(item?.Codigo ?? item?.codigo);
      if (codigo) acc.set(codigo, item);
      return acc;
    }, new Map());
  }, [clientesData]);

  const produtoDescricaoMap = useMemo(() => {
    const map = new Map();
    (produtosData || []).forEach((produto) => {
      const codigo = normalizarCodigoProduto(produto.codigo);
      if (codigo) {
        map.set(codigo, produto.descricao || '');
      }
    });
    return map;
  }, [produtosData]);

  const ultimosFaturadosHoje = useMemo(() => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const filtrados = [];

    faturamentoLinhas.forEach((row, idx) => {
      const emissao = parseEmissaoData(row?.Emissao ?? row?.emissao);
      if (!emissao) return;
      const dd = String(emissao.getUTCDate()).padStart(2, '0');
      const mm = String(emissao.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = emissao.getUTCFullYear();
      const dataEmissao = `${dd}/${mm}/${yyyy}`;
      if (dataEmissao !== hoje) return;
      if (normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento) === 'devolucao') return;

      const clienteCodigo = normalizarCodigoCliente(row?.Cliente ?? row?.cliente);
      const clienteInfo = clienteCodigo ? clientesPorCodigo.get(clienteCodigo) : null;
      const clienteNome = clienteInfo?.Nome ?? clienteInfo?.nome ?? '';
      const cliente = clienteNome || clienteCodigo || '-';
      const nf = obterNumeroNota(row);
      const valor = Math.abs(obterValorLiquido(row));
      const produtoCodigo = row?.Codigo ?? row?.codigo ?? '';
      const produtoDescricao =
        normalizarDescricaoProduto(row?.Descricao ?? row?.descricao) ||
        produtoDescricaoMap.get(normalizarCodigoProduto(produtoCodigo)) ||
        '';
      const quantidade = row?.Quantidade ?? row?.quantidade ?? '';
      const unidade = row?.Unidade ?? row?.unidade ?? '';
      const filial = obterFilialFaturamento(row, { padrao: '' });
      const vendedor = row?.Vendedor1 ?? row?.vendedor1 ?? row?.Vendedor ?? row?.vendedor ?? '';
      const emissaoData = parseEmissaoData(row?.Emissao ?? row?.emissao);

      filtrados.push({
        key: `${nf || 'nf'}|${clienteCodigo || cliente}|${valor}|${idx}`,
        cliente,
        nf,
        valor,
        produtoCodigo,
        produtoDescricao,
        quantidade,
        unidade,
        filial,
        vendedor,
        emissaoData,
      });
    });

    if (!filtrados.length) return [];
    return filtrados.slice(-3).reverse();
  }, [faturamentoLinhas, clientesPorCodigo, produtoDescricaoMap]);

  useEffect(() => {
    if (!ultimosFaturadosHoje.length) return;
    setPopupIndex(0);
    const key = ultimosFaturadosHoje[0]?.key;
    if (key && key !== ultimoPopupKey) {
      setUltimoPopupKey(key);
      setPopupDestaqueAt(Date.now());
      if (somAtivo) tocarSomMoeda();
    }
  }, [ultimosFaturadosHoje, somAtivo]);

  useEffect(() => {
    if (!ultimosFaturadosHoje.length) return undefined;
    const timer = setInterval(() => {
      setPopupIndex((prev) => (prev + 1) % ultimosFaturadosHoje.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [ultimosFaturadosHoje.length]);

  const popupAtual = ultimosFaturadosHoje[popupIndex] || null;
  const popupDestaque =
    popupAtual &&
    popupAtual.key === ultimoPopupKey &&
    Date.now() - popupDestaqueAt < 9000;
  const mostrarPopupFaturamento =
    (abaAtiva === 'dashboard-tv' || abaAtiva === 'faturamento') && popupAtual;

  const metricas = useMemo(() => {
    const faltasTotais = colaboradores.filter(c => c.estaAusente).length;
    const faltasPorSetor = colaboradores.reduce((acc, c) => {
      if (c.estaAusente) acc[c.setor] = (acc[c.setor] || 0) + 1;
      return acc;
    }, {});
    return { 
      faltasTotais, 
      faltasPorSetor,
    };
  }, [colaboradores]);

  const colaboradoresDia = useMemo(() => {
    const registrosDia = registrosPorData[dataLancamento] || {};
    return colaboradores.map((colab) => {
      const tipoFalta = registrosDia[colab.id]?.tipoFalta || 'Presente';
      const tempoParcial = registrosDia[colab.id]?.tempoParcial || '';
      return {
        ...colab,
        tipoFalta,
        tempoParcial,
        estaAusente: tipoFalta !== 'Presente',
      };
    });
  }, [colaboradores, registrosPorData, dataLancamento]);

  const supervisoresDisponiveis = useMemo(() => {
    const supervisores = new Set(colaboradores.map((colab) => colab.gestor).filter(Boolean));
    return ['Todos', ...Array.from(supervisores).sort()];
  }, [colaboradores]);

  const setoresDisponiveis = useMemo(() => {
    const setores = new Set(colaboradores.map((colab) => colab.setor).filter(Boolean));
    return ['Todos', ...Array.from(setores).sort()];
  }, [colaboradores]);

  const colaboradoresDiaFiltrados = useMemo(() => {
    return colaboradoresDia
      .filter((colab) => {
        const supervisorOk = filtroSupervisor === 'Todos' || colab.gestor === filtroSupervisor;
        const setorOk = filtroSetor === 'Todos' || colab.setor === filtroSetor;
        return supervisorOk && setorOk;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradoresDia, filtroSupervisor, filtroSetor]);

  const totalColaboradoresFiltrados = useMemo(() => {
    return colaboradores.filter((colab) => {
      const supervisorOk = filtroSupervisor === 'Todos' || colab.gestor === filtroSupervisor;
      const setorOk = filtroSetor === 'Todos' || colab.setor === filtroSetor;
      return supervisorOk && setorOk;
    }).length;
  }, [colaboradores, filtroSupervisor, filtroSetor]);

  const resumoFaltas = useMemo(() => {
    const total = colaboradoresDiaFiltrados.length;
    const ausentes = colaboradoresDiaFiltrados.filter((c) => c.estaAusente);
    const presentes = total - ausentes.length;
    const porTipo = ausentes.reduce((acc, c) => {
      const tipo = c.tipoFalta || 'Falta Injustificada';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});
    const percentualPresenca = total > 0 ? (presentes / total) * 100 : 0;
    return { total, presentes, ausentes: ausentes.length, porTipo, percentualPresenca };
  }, [colaboradoresDiaFiltrados]);

  const resumoMesAtualSetores = useMemo(() => {
    const mesesLabel = [
      'Janeiro',
      'Fevereiro',
      'Marco',
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
    const hoje = new Date();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesLabel = `${mesesLabel[hoje.getMonth()]} ${hoje.getFullYear()}`;

    const porSetor = {};
    let totalFaltas = 0;
    Object.entries(registrosPorData).forEach(([dataISO, registros]) => {
      if (!dataISO.startsWith(mesAtualKey)) return;
      if (isDiaDesconsiderado(dataISO)) return;
      if (isDataSemApontamento(dataISO)) return;
      Object.entries(registros || {}).forEach(([id, registro]) => {
        const colaborador = colaboradores.find((c) => String(c.id) === String(id));
        if (!colaborador) return;
        const tipo = registro?.tipoFalta || 'Falta Injustificada';
        if (tipo === 'Presente' || tipo === 'DSR' || tipo === 'Ferias') return;
        const setor = colaborador.setor || 'Sem setor';
        porSetor[setor] = (porSetor[setor] || 0) + 1;
        totalFaltas += 1;
      });
    });

    const valores = Object.values(porSetor);
    const maxSetor = valores.length ? Math.max(...valores) : 1;
    return { mesLabel, porSetor, totalFaltas, maxSetor };
  }, [registrosPorData, colaboradores]);

  const resumoHistorico = useMemo(() => {
    const idsFiltrados = new Set(
      colaboradores
        .filter((colab) => {
          const supervisorOk = filtroSupervisor === 'Todos' || colab.gestor === filtroSupervisor;
          const setorOk = filtroSetor === 'Todos' || colab.setor === filtroSetor;
          return supervisorOk && setorOk;
        })
        .map((colab) => String(colab.id))
    );

    const totalColab = idsFiltrados.size;
    const diasNoMes = new Date(anoHistorico, mesHistorico + 1, 0).getDate();
    const diasDesconsideradosNoMes = Array.from({ length: diasNoMes }, (_, i) => {
      const dia = String(i + 1).padStart(2, '0');
      const mes = String(mesHistorico + 1).padStart(2, '0');
      const dataISO = `${anoHistorico}-${mes}-${dia}`;
      return isDiaDesconsiderado(dataISO) ? 1 : 0;
    }).reduce((acc, value) => acc + value, 0);
    const mesStr = `${anoHistorico}-${String(mesHistorico + 1).padStart(2, '0')}`;

    let faltasTotal = 0;
    let faltasJust = 0;
    let faltasInjust = 0;
    let feriasOcorrencias = 0;
    const feriasColaboradores = new Set();
    const diasComFalta = new Set();

    const usarResumoPlanilha =
      filtroSupervisor === 'Todos' &&
      filtroSetor === 'Todos' &&
      faltasResumoPlanilha &&
      Object.keys(faltasResumoPlanilha).length > 0;

    if (usarResumoPlanilha) {
      Object.entries(faltasResumoPlanilha).forEach(([dataISO, resumo]) => {
        if (!dataISO.startsWith(mesStr)) return;
        if (isDiaDesconsiderado(dataISO)) return;
        if (isDataSemApontamento(dataISO)) return;
        const totalDia = Number(resumo?.total || 0);
        const tipos = resumo?.tipos || {};
        const feriasDia = Number(tipos.Ferias || 0);
        const faltasSemFeriasDia = Math.max(totalDia - feriasDia, 0);
        if (faltasSemFeriasDia > 0) {
          diasComFalta.add(dataISO);
        }
        faltasTotal += faltasSemFeriasDia;
        faltasJust += Number(tipos['Falta Justificada'] || 0);
        faltasInjust += Number(tipos['Falta Injustificada'] || 0);
        feriasOcorrencias += feriasDia;
      });
    } else {
      Object.entries(registrosPorData).forEach(([dataISO, registros]) => {
        if (!dataISO.startsWith(mesStr)) return;
        if (isDiaDesconsiderado(dataISO)) return;
        if (isDataSemApontamento(dataISO)) return;
        Object.entries(registros || {}).forEach(([id, registro]) => {
          if (!idsFiltrados.has(String(id))) return;
          const tipo = registro?.tipoFalta || 'Falta Injustificada';
          if (tipo === 'Ferias') {
            feriasOcorrencias += 1;
            feriasColaboradores.add(String(id));
            return;
          }
          faltasTotal += 1;
          diasComFalta.add(dataISO);
          if (tipo === 'Falta Justificada') faltasJust += 1;
          else if (tipo === 'Falta Injustificada') faltasInjust += 1;
        });
      });
    }

    const diasUteis = Math.max(diasNoMes - diasDesconsideradosNoMes, 0);
    const totalPossivel = totalColab * diasUteis;
    const presencaEstimada = totalPossivel > 0 ? Math.max(totalPossivel - faltasTotal, 0) : 0;
    const percentualPresenca = totalPossivel > 0 ? (presencaEstimada / totalPossivel) * 100 : 0;

    return {
      totalColab,
      diasNoMes,
      faltasTotal,
      faltasJust,
      faltasInjust,
      feriasOcorrencias,
      feriasColaboradores: usarResumoPlanilha ? 0 : feriasColaboradores.size,
      diasComFalta: diasComFalta.size,
      percentualPresenca,
    };
  }, [
    colaboradores,
    filtroSupervisor,
    filtroSetor,
    registrosPorData,
    mesHistorico,
    anoHistorico,
    faltasResumoPlanilha,
  ]);

  const abrirModalLancamento = (colab) => {
    const registro = registrosPorData[dataLancamento]?.[colab.id];
    const tipoAtual = registro?.tipoFalta || 'Presente';
    const tempoAtual = registro?.tempoParcial || '02:00';
    setModalLancamento(colab);
    setModalTipo(tipoAtual);
    setModalTempo(tempoAtual);
    setModalErro('');
  };

  const fecharModalLancamento = () => {
    setModalLancamento(null);
    setModalErro('');
  };

  const salvarModalLancamento = () => {
    if (!modalLancamento) return;
    if (modalTipo === 'Falta Parcial') {
      const match = String(modalTempo || '').match(/^(\d{1,2}):([0-5]\d)$/);
      if (!match) {
        setModalErro('Informe o tempo no formato HH:MM (ex: 02:00).');
        return;
      }
    }
    setRegistrosPorData((prev) => {
      const dia = prev[dataLancamento] ? { ...prev[dataLancamento] } : {};
      if (modalTipo === 'Presente') {
        delete dia[modalLancamento.id];
      } else {
        dia[modalLancamento.id] = {
          tipoFalta: modalTipo,
          ...(modalTipo === 'Falta Parcial' ? { tempoParcial: modalTempo } : {}),
        };
      }
      return { ...prev, [dataLancamento]: dia };
    });
    fecharModalLancamento();
  };

  const abrirModalFerias = () => {
    setModalFeriasOpen(true);
    setFeriasColaboradorId('');
    setFeriasInicio('');
    setFeriasFim('');
    setFeriasErro('');
  };

  const fecharModalFerias = () => {
    setModalFeriasOpen(false);
    setFeriasErro('');
  };

  const salvarFerias = () => {
    if (!feriasColaboradorId || !feriasInicio || !feriasFim) {
      setFeriasErro('Preencha colaborador, data inicio e data fim.');
      return;
    }
    if (feriasInicio > feriasFim) {
      setFeriasErro('A data inicio nao pode ser maior que a data fim.');
      return;
    }
    const id = Number(feriasColaboradorId);
    const datas = [];
    let cursor = new Date(`${feriasInicio}T00:00:00`);
    const fim = new Date(`${feriasFim}T00:00:00`);
    while (cursor <= fim) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!isDiaDesconsiderado(iso) && !isDataSemApontamento(iso)) {
        datas.push(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!datas.length) {
      setFeriasErro('Nenhuma data valida no intervalo selecionado.');
      return;
    }
    setRegistrosPorData((prev) => {
      const next = { ...prev };
      datas.forEach((dia) => {
        const registrosDia = next[dia] ? { ...next[dia] } : {};
        registrosDia[id] = { tipoFalta: 'Ferias' };
        next[dia] = registrosDia;
      });
      return next;
    });
    fecharModalFerias();
  };

  const abrirModoRapido = () => {
    setModalRapidoFiltroOpen(true);
    setRapidoSupervisor(filtroSupervisor === 'Todos' ? '' : filtroSupervisor);
    setRapidoSupervisorErro('');
  };

  const iniciarModoRapido = () => {
    if (!rapidoSupervisor) {
      setRapidoSupervisorErro('Selecione um supervisor.');
      return;
    }
    setFiltroSupervisor(rapidoSupervisor);
    setModalRapidoFiltroOpen(false);
    setModoRapidoOpen(true);
    setModoRapidoIndex(0);
    setModoRapidoTempo('02:00');
    setModoRapidoErro('');
  };

  const fecharModoRapido = () => {
    setModoRapidoOpen(false);
    setModoRapidoErro('');
  };

  const avancarModoRapido = () => {
    setModoRapidoIndex((prev) => {
      const total = colaboradoresDiaFiltrados.length;
      if (total === 0) return 0;
      return Math.min(prev + 1, total - 1);
    });
  };

  const voltarModoRapido = () => {
    setModoRapidoIndex((prev) => Math.max(prev - 1, 0));
  };

  const salvarModoRapido = (tipo) => {
    const colab = colaboradoresDiaFiltrados[modoRapidoIndex];
    if (!colab) return;
    if (tipo === 'Falta Parcial') {
      const match = String(modoRapidoTempo || '').match(/^(\d{1,2}):([0-5]\d)$/);
      if (!match) {
        setModoRapidoErro('Informe o tempo no formato HH:MM (ex: 02:00).');
        return;
      }
    }
    setRegistrosPorData((prev) => {
      const dia = prev[dataLancamento] ? { ...prev[dataLancamento] } : {};
      if (tipo === 'Presente') {
        delete dia[colab.id];
      } else {
        dia[colab.id] = {
          tipoFalta: tipo,
          ...(tipo === 'Falta Parcial' ? { tempoParcial: modoRapidoTempo } : {}),
        };
      }
      return { ...prev, [dataLancamento]: dia };
    });
    setModoRapidoErro('');
    avancarModoRapido();
  };

  const alternarPresenca = (id) => {
    setRegistrosPorData((prev) => {
      const dia = prev[dataLancamento] ? { ...prev[dataLancamento] } : {};
      const atual = dia[id]?.tipoFalta || 'Presente';
      if (atual === 'Presente') {
        dia[id] = { tipoFalta: 'Falta Injustificada' };
      } else {
        delete dia[id];
      }
      return { ...prev, [dataLancamento]: dia };
    });
  };

  const atualizarTipoFalta = (id, tipo) => {
    setRegistrosPorData((prev) => {
      const dia = prev[dataLancamento] ? { ...prev[dataLancamento] } : {};
      if (tipo === 'Presente') {
        delete dia[id];
      } else {
        dia[id] = { tipoFalta: tipo };
      }
      return { ...prev, [dataLancamento]: dia };
    });
  };

  const obterResumoDia = (dataISO) => {
    if (isDiaDesconsiderado(dataISO)) return { total: 0, tipos: {} };
    if (isDataSemApontamento(dataISO)) return { total: 0, tipos: {} };
    if (
      filtroSupervisor === 'Todos' &&
      filtroSetor === 'Todos' &&
      faltasResumoPlanilha?.[dataISO]
    ) {
      const resumoPlanilha = faltasResumoPlanilha[dataISO];
      return {
        total: Number(resumoPlanilha?.total || 0),
        tipos: resumoPlanilha?.tipos || {},
        fonte: 'excel',
      };
    }
    if (
      resumoLeandroExcel?.meses &&
      filtroSupervisor === 'Leandro Souza' &&
      filtroSetor === 'Todos'
    ) {
      const mesBase = dataISO.slice(0, 7);
      const resumoExcel = resumoLeandroExcel.meses?.[mesBase]?.[dataISO];
      if (resumoExcel) {
        const tipos = {};
        const fe = resumoExcel.FE || 0;
        const fi = resumoExcel.FI || 0;
        const fj = resumoExcel.FJ || 0;
        if (fe) tipos['Ferias'] = fe;
        if (fi) tipos['Falta Injustificada'] = fi;
        if (fj) tipos['Falta Justificada'] = fj;
        return { total: fe + fi + fj, tipos, fonte: 'excel' };
      }
    }
    const registros = registrosPorData[dataISO] || {};
    const tipos = {};
    let total = 0;
    Object.entries(registros).forEach(([id, registro]) => {
      const colaborador = colaboradores.find((c) => String(c.id) === String(id));
      if (!colaborador) return;
      const supervisorOk = filtroSupervisor === 'Todos' || colaborador.gestor === filtroSupervisor;
      const setorOk = filtroSetor === 'Todos' || colaborador.setor === filtroSetor;
      if (!supervisorOk || !setorOk) {
        return;
      }
      const tipo = registro.tipoFalta || 'Falta Injustificada';
      tipos[tipo] = (tipos[tipo] || 0) + 1;
      total += 1;
    });
    return { total, tipos };
  };

  const iniciarEdicaoSupervisor = (nome) => {
    setSupervisorEditando(nome);
    setSupervisorNome(nome);
  };

  const cancelarEdicaoSupervisor = () => {
    setSupervisorEditando(null);
    setSupervisorNome('');
  };

  const salvarEdicaoSupervisor = () => {
    const novoNome = supervisorNome.trim();
    if (!novoNome) return;
    if (novoNome !== supervisorEditando && listaGestores.includes(novoNome)) return;

    setListaGestores((prev) =>
      prev.map((g) => (g === supervisorEditando ? novoNome : g))
    );
    setColaboradores((prev) =>
      prev.map((c) =>
        c.gestor === supervisorEditando ? { ...c, gestor: novoNome } : c
      )
    );
    setFiltroSupervisor((prev) =>
      prev === supervisorEditando ? novoNome : prev
    );
    if (supervisorEditando) {
      deleteDoc(doc(db, 'supervisores', normalizarIdFirestore(supervisorEditando)))
        .catch((err) => console.error('Erro ao remover supervisor antigo:', err))
        .finally(() => {
          setDoc(doc(db, 'supervisores', normalizarIdFirestore(novoNome)), { nome: novoNome })
            .catch((err) => console.error('Erro ao salvar supervisor:', err));
        });
    }
    setSupervisorEditando(null);
    setSupervisorNome('');
  };

  const paretoDados = useMemo(() => {
    const base = faturamentoDados.porGrupo || [];
    if (!base.length) return [];
    const total = base.reduce((acc, item) => acc + item.valor, 0);

    const maxItens = 12;
    const itens = base.slice(0, maxItens);
    if (base.length > maxItens) {
      const outrosValor = base.slice(maxItens).reduce((acc, item) => acc + item.valor, 0);
      itens.push({ grupo: 'Outros', valor: outrosValor });
    }

    let acumulado = 0;
    return itens.map((item) => {
      acumulado += item.valor;
      const percentual = total > 0 ? (acumulado / total) * 100 : 0;
      return { ...item, percentual };
    });
  }, [faturamentoDados.porGrupo]);

  const paretoAtivo = useMemo(() => {
    const grupo = paretoHover || paretoSelecionado;
    if (!grupo) return null;
    return paretoDados.find((item) => item.grupo === grupo) || null;
  }, [paretoDados, paretoHover, paretoSelecionado]);

  const abcDados = useMemo(() => {
    if (!paretoSelecionado) return null;
    const grupo = faturamentoDados.porGrupo.find((item) => item.grupo === paretoSelecionado);
    if (!grupo) return { grupo: paretoSelecionado, erro: 'Sem detalhes para este grupo.' };

    const itens = grupo.itens || [];
    const total = itens.reduce((acc, item) => acc + item.total, 0);
    if (total <= 0) {
      return { grupo: paretoSelecionado, total, a: 0, b: 0, c: 0 };
    }

    let acumulado = 0;
    let a = 0;
    let b = 0;
    let c = 0;
    let valorA = 0;
    let valorB = 0;
    let valorC = 0;

    itens
      .slice()
      .sort((x, y) => y.total - x.total)
      .forEach((item) => {
        acumulado += item.total;
        const perc = (acumulado / total) * 100;
        if (perc <= 80) {
          a += 1;
          valorA += item.total;
        } else if (perc <= 95) {
          b += 1;
          valorB += item.total;
        } else {
          c += 1;
          valorC += item.total;
        }
      });

    return { grupo: paretoSelecionado, total, a, b, c, valorA, valorB, valorC };
  }, [faturamentoDados.porGrupo, paretoSelecionado]);

  const portfolioDados = useMemo(() => {
    const grupos = faturamentoDados.porGrupo || [];
    if (!grupos.length) {
      return {
        total: 0,
        itens: [],
        itensClassificados: [],
        topItens: [],
        topGrupos: [],
        aCount: 0,
        bCount: 0,
        cCount: 0,
        aValor: 0,
        bValor: 0,
        cValor: 0,
        topGrupo: null,
        top5Share: 0,
      };
    }

    const mapaItens = new Map();
    let total = 0;

    grupos.forEach((grupo) => {
      (grupo.itens || []).forEach((item) => {
        const key = `${item.codigo ?? ''}||${normalizarDescricaoProduto(item.descricao)}`;
        total += item.total;
        if (!mapaItens.has(key)) {
          mapaItens.set(key, { ...item, total: 0 });
        }
        mapaItens.get(key).total += item.total;
      });
    });

    const itens = Array.from(mapaItens.values()).sort((a, b) => b.total - a.total);
    let acumulado = 0;
    let aCount = 0;
    let bCount = 0;
    let cCount = 0;
    let aValor = 0;
    let bValor = 0;
    let cValor = 0;

    const itensClassificados = itens.map((item) => {
      acumulado += item.total;
      const perc = total > 0 ? (acumulado / total) * 100 : 0;
      let classe = 'C';
      if (perc <= 80) {
        classe = 'A';
        aCount += 1;
        aValor += item.total;
      } else if (perc <= 95) {
        classe = 'B';
        bCount += 1;
        bValor += item.total;
      } else {
        cCount += 1;
        cValor += item.total;
      }
      return { ...item, classe, perc };
    });

    const topItens = itensClassificados.slice(0, 20);
    const topGrupos = grupos.slice(0, 8).map((grupo) => ({
      ...grupo,
      share: total > 0 ? (grupo.valor / total) * 100 : 0,
    }));
    const topGrupo = grupos[0] || null;
    const top5Share =
      total > 0
        ? (grupos.slice(0, 5).reduce((acc, grupo) => acc + grupo.valor, 0) / total) * 100
        : 0;

    return {
      total,
      itens,
      itensClassificados,
      topItens,
      topGrupos,
      aCount,
      bCount,
      cCount,
      aValor,
      bValor,
      cValor,
      topGrupo,
      top5Share,
    };
  }, [faturamentoDados.porGrupo]);

  const faturamentoAtual = useMemo(() => {
    const produtosPorCodigo = new Map(
      (produtosData || []).map((produto) => [
        normalizarCodigoProduto(produto.codigo),
        produto.descricao || '',
      ])
    );
    const municipiosPorChave = new Map(
      (municipiosLatLong || []).map((item) => {
        const chave = `${normalizarTexto(item.nome)}||${String(item.uf || '').toUpperCase()}`;
        return [
          chave,
          {
            nome: item.nome,
            uf: String(item.uf || '').toUpperCase(),
            lat: item.latitude,
            lng: item.longitude,
          },
        ];
      })
    );
    const clientesPorCodigo = new Map(
      (clientesData?.clientes || []).map((cliente) => [
        normalizarCodigoCliente(cliente.Codigo),
        {
          nome: cliente.Nome || '',
          estado: cliente.Estado || '',
          municipio: cliente.Municipio || '',
        },
      ])
    );
    const vendedorFilialVendMap = new Map(
      (vendedoresData || []).map((v) => [
        normalizarCodigoVendedor(v.Codigo),
        String(v['Filial Vend.'] || '').trim() || '',
      ])
    );

    if (!faturamentoLinhas.length) {
      return {
        mes: '',
        total: 0,
        totalBruto: 0,
        totalDevolucao: 0,
        linhas: [],
        topClientes: [],
        topProdutos: [],
        porDia: [],
        porDiaFilial: [],
        filiais: [],
        filiaisVend: [],
        porFilial: [],
        clientesAtivos: 0,
        movimentos: 0,
        ticketMedio: 0,
        diasAtivos: 0,
        quantidadeTotal: 0,
        mixUnidade: [],
        topEstados: [],
        topMunicipios: [],
        estadosTodos: [],
        municipiosMapa: [],
      };
    }

    const normalizadas = faturamentoLinhas.map((row) => {
      const mesInfo = obterMesKey(row);
      const tipoMovimento = normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento);
      const vendedorCodigo = normalizarCodigoVendedor(
        row?.Vendedor1 ?? row?.vendedor1 ?? row?.Vendedor ?? row?.vendedor ?? ''
      );
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo: row?.Codigo ?? row?.codigo ?? '',
        descricao: normalizarDescricaoProduto(row?.Descricao ?? row?.descricao ?? ''),
        filial: obterFilialFaturamento(row),
        unidade: row?.Unidade ?? row?.unidade ?? '',
        nf: obterNumeroNota(row),
        quantidade: obterQuantidadeLiquida(row),
        valorUnitario: parseValor(row?.ValorUnitario ?? row?.valorUnitario),
        valorTotal: obterValorLiquido(row),
        emissao: parseEmissaoData(row?.Emissao ?? row?.emissao),
        mesKey: mesInfo?.key,
        mesDisplay: mesInfo?.display,
        tipoMovimento,
        cfop: row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '',
        vendedorCodigo,
        filialVend: vendedorFilialVendMap.get(vendedorCodigo) || '',
      };
    });

    const mesKeys = normalizadas
      .map((row) => row.mesKey)
      .filter(Boolean)
      .sort();
    const mesAtual = mesKeys.length ? mesKeys[mesKeys.length - 1] : null;
    const mesAtualDisplay =
      normalizadas.find((row) => row.mesKey === mesAtual)?.mesDisplay || '';

    const linhasMes = mesAtual
      ? normalizadas.filter((row) => row.mesKey === mesAtual)
      : normalizadas;
    const linhasPeriodo =
      faturamentoInicio || faturamentoFim
        ? normalizadas.filter((row) => {
            if (!row.emissao) return false;
            const dataISO = obterDataIsoUtc(row.emissao);
            if (faturamentoInicio && dataISO < faturamentoInicio) return false;
            if (faturamentoFim && dataISO > faturamentoFim) return false;
            return true;
          })
        : linhasMes;

    const filiaisBase = Array.from(
      new Set(linhasPeriodo.map((row) => row.filial).filter((item) => item && item !== 'Sem filial'))
    ).sort((a, b) => String(a).localeCompare(String(b)));

    const filiaisVend = Array.from(
      new Set(linhasPeriodo.map((row) => row.filialVend).filter((f) => !!f))
    ).sort();

    const gruposDisponiveis = Array.from(
      new Set(linhasPeriodo.map((row) => row.grupo).filter((g) => !!g))
    ).sort();

    const filtradasPorFilial =
      filtroFilial === 'Todas'
        ? linhasPeriodo
        : linhasPeriodo.filter((row) => row.filial === filtroFilial);
    const filtradasPorFilialVend =
      filtroFilialVend === 'Todas'
        ? filtradasPorFilial
        : filtradasPorFilial.filter(
            (row) => row.tipoMovimento === 'devolucao' || row.filialVend === filtroFilialVend
          );
    const filtradasPorCfop =
      filtroCfops.length === 0
        ? filtradasPorFilialVend
        : filtradasPorFilialVend.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });
    const linhasFiltradas =
      filtroGrupo === 'Todos'
        ? filtradasPorCfop
        : filtradasPorCfop.filter((row) => row.grupo === filtroGrupo);

    const total = linhasFiltradas.reduce((acc, row) => acc + row.valorTotal, 0);
    const totalBruto = linhasFiltradas
      .filter((row) => row.tipoMovimento !== 'devolucao')
      .reduce((acc, row) => acc + row.valorTotal, 0);
    const totalDevolucao = linhasFiltradas
      .filter((row) => row.tipoMovimento === 'devolucao')
      .reduce((acc, row) => acc + Math.abs(row.valorTotal), 0);
    const devolucoesPorCfop = linhasFiltradas
      .filter((row) => row.tipoMovimento === 'devolucao')
      .reduce((acc, row) => {
        const cfop = String(row.cfop || '').trim();
        if (!cfop) return acc;
        acc[cfop] = (acc[cfop] || 0) + Math.abs(row.valorTotal);
        return acc;
      }, {});
    const quantidadeTotal = linhasFiltradas.reduce((acc, row) => acc + row.quantidade, 0);

    const clientesMap = new Map();
    const produtosMap = new Map();
    const filialMap = new Map();
    const unidadeMap = new Map();
    const diaMap = new Map();
    const diaFilialMap = new Map();
    const estadoMap = new Map();
    const municipioMap = new Map();
    const estadoPedidosMap = new Map();
    const municipioPedidosMap = new Map();
    const municipioClientesMap = new Map();

    linhasFiltradas.forEach((row) => {
      const codigoCliente = normalizarCodigoCliente(row.cliente);
      const chaveCliente = codigoCliente || String(row.cliente || 'Sem cliente');
      clientesMap.set(chaveCliente, (clientesMap.get(chaveCliente) || 0) + row.valorTotal);
      const infoCliente = clientesPorCodigo.get(chaveCliente);
      if (infoCliente?.estado) {
        estadoMap.set(infoCliente.estado, (estadoMap.get(infoCliente.estado) || 0) + row.valorTotal);
        const pedidoKey = row.nf
          ? String(row.nf).trim()
          : `${obterDataIsoUtc(row.emissao) || 'semdata'}||${chaveCliente}||${row.valorTotal}`;
        if (!estadoPedidosMap.has(infoCliente.estado)) {
          estadoPedidosMap.set(infoCliente.estado, new Set());
        }
        estadoPedidosMap.get(infoCliente.estado).add(pedidoKey);
      }
      if (infoCliente?.municipio) {
        const municipioKey = `${normalizarTexto(infoCliente.municipio)}||${String(infoCliente.estado || '').toUpperCase()}`;
        if (!municipioMap.has(municipioKey)) {
          municipioMap.set(municipioKey, {
            municipio: infoCliente.municipio,
            uf: String(infoCliente.estado || '').toUpperCase(),
            valor: 0,
          });
        }
        municipioMap.get(municipioKey).valor += row.valorTotal;
        const pedidoKey = row.nf
          ? String(row.nf).trim()
          : `${obterDataIsoUtc(row.emissao) || 'semdata'}||${chaveCliente}||${row.valorTotal}`;
        if (!municipioPedidosMap.has(municipioKey)) {
          municipioPedidosMap.set(municipioKey, new Set());
        }
        municipioPedidosMap.get(municipioKey).add(pedidoKey);
        if (!municipioClientesMap.has(municipioKey)) {
          municipioClientesMap.set(municipioKey, new Map());
        }
        const clientesLocal = municipioClientesMap.get(municipioKey);
        clientesLocal.set(chaveCliente, (clientesLocal.get(chaveCliente) || 0) + row.valorTotal);
      }

      const chaveProd = `${row.codigo || ''}||${normalizarDescricaoProduto(row.descricao)}`;
      if (!produtosMap.has(chaveProd)) {
        produtosMap.set(chaveProd, { valor: 0, quantidade: 0, unidades: new Map() });
      }
      const prod = produtosMap.get(chaveProd);
      prod.valor += row.valorTotal;
      const qtd = Number.isFinite(row.quantidade) ? row.quantidade : 0;
      prod.quantidade += qtd;
      const unidadeKey = String(row.unidade || 'N/A');
      prod.unidades.set(unidadeKey, (prod.unidades.get(unidadeKey) || 0) + (qtd || 1));

      const filial = String(row.filial || 'Sem filial');
      filialMap.set(filial, (filialMap.get(filial) || 0) + row.valorTotal);

      const unidade = String(row.unidade || 'N/A');
      unidadeMap.set(unidade, (unidadeMap.get(unidade) || 0) + row.quantidade);

      if (row.emissao) {
        const diaISO = obterDataIsoUtc(row.emissao);
        const valorDia =
          row.tipoMovimento === 'devolucao' ? -Math.abs(row.valorTotal || 0) : row.valorTotal;
        diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + valorDia);
        if (!diaFilialMap.has(diaISO)) {
          diaFilialMap.set(diaISO, new Map());
        }
        const mapaFilial = diaFilialMap.get(diaISO);
        mapaFilial.set(filial, (mapaFilial.get(filial) || 0) + valorDia);
      }
    });

    const porDia = Array.from(diaMap.entries())
      .map(([dia, valor]) => ({ dia, valor }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    const topClientes = Array.from(clientesMap.entries())
      .map(([cliente, valor]) => ({
        cliente,
        valor,
        info: clientesPorCodigo.get(cliente) || null,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const topProdutos = Array.from(produtosMap.entries())
      .map(([chave, dados]) => {
        const [codigo, descricao] = chave.split('||');
        const codigoNorm = normalizarCodigoProduto(codigo);
        const descricaoFinal =
          normalizarDescricaoProduto(descricao) || produtosPorCodigo.get(codigoNorm) || '';
        let unidadePrincipal = '';
        let unidadeQtd = 0;
        dados.unidades.forEach((valor, unidade) => {
          if (valor > unidadeQtd) {
            unidadeQtd = valor;
            unidadePrincipal = unidade;
          }
        });
        return {
          codigo,
          descricao: descricaoFinal,
          valor: dados.valor,
          quantidade: dados.quantidade,
          precoMedio: dados.quantidade > 0 ? dados.valor / dados.quantidade : 0,
          unidade: unidadePrincipal,
        };
      })
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    const porFilial = Array.from(filialMap.entries())
      .map(([filial, valor]) => ({ filial, valor }))
      .sort((a, b) => b.valor - a.valor);

    const mixUnidade = Array.from(unidadeMap.entries())
      .map(([unidade, quantidade]) => ({ unidade, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const topEstados = Array.from(estadoMap.entries())
      .map(([estado, valor]) => ({ estado, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const topMunicipios = Array.from(municipioMap.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const pedidosPorEstado = Array.from(estadoPedidosMap.entries())
      .map(([estado, pedidos]) => ({ estado, pedidos: pedidos.size }))
      .sort((a, b) => b.pedidos - a.pedidos)
      .slice(0, 6);

    const pedidosPorMunicipio = Array.from(municipioPedidosMap.entries())
      .map(([chave, pedidos]) => ({ chave, pedidos: pedidos.size }))
      .sort((a, b) => b.pedidos - a.pedidos)
      .slice(0, 6);

    const estadosTodos = Array.from(estadoMap.entries())
      .map(([estado, valor]) => ({ estado, valor }))
      .sort((a, b) => b.valor - a.valor);

    const municipiosMapa = Array.from(municipioMap.entries())
      .map(([chave, item]) => {
        const info = municipiosPorChave.get(chave);
        if (!info) return null;
        const clientesLocais = Array.from((municipioClientesMap.get(chave) || new Map()).entries())
          .map(([cliente, valor]) => ({
            cliente,
            nome: clientesPorCodigo.get(cliente)?.nome || cliente,
            valor,
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10);
        return {
          municipio: info.nome,
          uf: info.uf,
          valor: item.valor,
          lat: info.lat,
          lng: info.lng,
          topClientes: clientesLocais,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 25);

    const filiais = filiaisBase.length ? filiaisBase : porFilial.map((item) => item.filial);
    const porDiaFilial = Array.from(diaFilialMap.entries())
      .map(([dia, mapa]) => {
        const porFilialDia = {};
        let totalDia = 0;
        filiais.forEach((filial) => {
          const valor = mapa.get(filial) || 0;
          porFilialDia[filial] = valor;
          totalDia += valor;
        });
        return { dia, total: totalDia, porFilial: porFilialDia };
      })
      .sort((a, b) => a.dia.localeCompare(b.dia));

    const clientesAtivos = clientesMap.size;
    const movimentos = linhasFiltradas.length;
    const ticketMedio = movimentos > 0 ? total / movimentos : 0;
    const diasAtivos = diaMap.size;

    return {
      mes: mesAtualDisplay,
      total,
      totalBruto,
      totalDevolucao,
      devolucoesPorCfop,
      linhas: linhasFiltradas,
      topClientes,
      topProdutos,
      porDia,
      porDiaFilial,
      porFilial,
      filiais,
      filiaisVend,
      gruposDisponiveis,
      clientesAtivos,
      movimentos,
      ticketMedio,
      diasAtivos,
      quantidadeTotal,
      mixUnidade,
      topEstados,
      topMunicipios,
      pedidosPorEstado,
      pedidosPorMunicipio,
      estadosTodos,
      municipiosMapa,
    };
  }, [faturamentoLinhas, filtroFilial, filtroFilialVend, filtroCfops, filtroGrupo, faturamentoInicio, faturamentoFim, vendedoresData]);

  const dashboardFaturamentoBase = useMemo(() => {
    const produtosPorCodigo = new Map(
      (produtosData || []).map((produto) => [
        normalizarCodigoProduto(produto.codigo),
        produto.descricao || '',
      ])
    );
    const municipiosPorChave = new Map(
      (municipiosLatLong || []).map((item) => {
        const chave = `${normalizarTexto(item.nome)}||${String(item.uf || '').toUpperCase()}`;
        return [
          chave,
          {
            nome: item.nome,
            uf: String(item.uf || '').toUpperCase(),
            lat: item.latitude,
            lng: item.longitude,
          },
        ];
      })
    );
    const clientesPorCodigo = new Map(
      (clientesData?.clientes || []).map((cliente) => [
        normalizarCodigoCliente(cliente.Codigo),
        {
          nome: cliente.Nome || '',
          estado: cliente.Estado || '',
          municipio: cliente.Municipio || '',
        },
      ])
    );
    const vendedorFilialVendMapDash = new Map(
      (vendedoresData || []).map((v) => [
        normalizarCodigoVendedor(v.Codigo),
        String(v['Filial Vend.'] || '').trim() || '',
      ])
    );

    if (!faturamentoLinhas.length) {
      return {
        linhasMes: [],
        linhasTodas: [],
        filiais: [],
        filiaisVend: [],
        mes: '',
        produtosPorCodigo,
        municipiosPorChave,
        clientesPorCodigo,
      };
    }

    const normalizadas = faturamentoLinhas.map((row) => {
      const mesInfo = obterMesKey(row);
      const tipoMovimento = normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento);
      const vendedorCodigo = normalizarCodigoVendedor(
        row?.Vendedor1 ?? row?.vendedor1 ?? row?.Vendedor ?? row?.vendedor ?? ''
      );
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo: row?.Codigo ?? row?.codigo ?? '',
        descricao: normalizarDescricaoProduto(row?.Descricao ?? row?.descricao ?? ''),
        filial: obterFilialFaturamento(row),
        unidade: row?.Unidade ?? row?.unidade ?? '',
        nf: obterNumeroNota(row),
        quantidade: obterQuantidadeLiquida(row),
        valorUnitario: parseValor(row?.ValorUnitario ?? row?.valorUnitario),
        valorTotal: obterValorLiquido(row),
        emissao: parseEmissaoData(row?.Emissao ?? row?.emissao),
        mesKey: mesInfo?.key,
        mesDisplay: mesInfo?.display,
        tipoMovimento,
        cfop: row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '',
        filialVend: vendedorFilialVendMapDash.get(vendedorCodigo) || '',
      };
    });

    const mesKeys = normalizadas
      .map((row) => row.mesKey)
      .filter(Boolean)
      .sort();
    const mesAtual = mesKeys.length ? mesKeys[mesKeys.length - 1] : null;
    const mesAtualDisplay =
      normalizadas.find((row) => row.mesKey === mesAtual)?.mesDisplay || '';

    const linhasMes = mesAtual
      ? normalizadas.filter((row) => row.mesKey === mesAtual)
      : normalizadas;

    const filiais = Array.from(
      new Set(linhasMes.map((row) => row.filial).filter((item) => item && item !== 'Sem filial'))
    ).sort((a, b) => String(a).localeCompare(String(b)));

    const filiaisVend = Array.from(
      new Set(linhasMes.map((row) => row.filialVend).filter((f) => !!f))
    ).sort();

    return {
      linhasMes,
      linhasTodas: normalizadas,
      filiais,
      filiaisVend,
      mes: mesAtualDisplay,
      produtosPorCodigo,
      municipiosPorChave,
      clientesPorCodigo,
    };
  }, [faturamentoLinhas, produtosData, municipiosLatLong, clientesData, vendedoresData]);

  const dashboardFiliais = dashboardFaturamentoBase.filiaisVend || [];
  const dashboardFilialAtual =
    dashboardFiliais.length > 0
      ? dashboardFiliais[Math.min(dashboardFilialIndex, dashboardFiliais.length - 1)]
      : null;

  useEffect(() => {
    setDashboardFilialIndex(0);
  }, [dashboardFiliais.length]);

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_meta_filial', JSON.stringify(metaFilialMap || {}));
    } catch {
      // noop: storage indisponivel
    }
  }, [metaFilialMap]);

  useEffect(() => {
    let ativo = true;
    const carregarMetasFirebase = async () => {
      if (!authUser) return;
      try {
        const snap = await getDoc(doc(db, 'dashboard_settings', 'metas_filial'));
        if (!snap.exists() || !ativo) return;
        const data = snap.data() || {};
        const metas = data.metas && typeof data.metas === 'object' ? data.metas : {};
        const normalizado = {};
        Object.entries(metas).forEach(([filial, valor]) => {
          const numero = Number(valor || 0);
          normalizado[String(filial)] = Number.isFinite(numero) && numero > 0 ? numero : 0;
        });
        if (Object.keys(normalizado).length) {
          setMetaFilialMap(normalizado);
        }
      } catch {
        // fallback: localStorage ja carregado
      }
    };
    carregarMetasFirebase();
    return () => {
      ativo = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (
      abaAtiva !== 'dashboard-tv' ||
      dashboardView !== 'faturamento' ||
      dashboardFiliais.length < 2
    ) {
      return undefined;
    }
    const timer = setInterval(() => {
      setDashboardFilialIndex((prev) => (prev + 1) % dashboardFiliais.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [abaAtiva, dashboardView, dashboardFiliais.length]);

  const dashboardFaturamentoFilial = useMemo(() => {
    const {
      linhasMes,
      linhasTodas,
      clientesPorCodigo,
      produtosPorCodigo,
      municipiosPorChave,
    } = dashboardFaturamentoBase;
    const linhasBase = dashboardFilialAtual
      ? linhasMes.filter(
          (row) => row.tipoMovimento === 'devolucao' || row.filialVend === dashboardFilialAtual
        )
      : linhasMes;
    const linhasBaseDia = dashboardFilialAtual
      ? linhasMes.filter(
          (row) => row.tipoMovimento === 'devolucao' || row.filialVend === dashboardFilialAtual
        )
      : linhasMes;
    const linhasFiltradas =
      filtroCfops.length === 0
        ? linhasBase
        : linhasBase.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });
    const linhasFiltradasDia =
      filtroCfops.length === 0
        ? linhasBaseDia
        : linhasBaseDia.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });

    if (!linhasFiltradas.length) {
      return {
        total: 0,
        totalDevolucao: 0,
        movimentos: 0,
        ticketMedio: 0,
        diasAtivos: 0,
        clientesAtivos: 0,
        porDia: [],
        topClientes: [],
        topProdutos: [],
        topEstados: [],
        topMunicipios: [],
        municipiosMapa: [],
      };
    }

    const total = linhasFiltradas.reduce((acc, row) => acc + row.valorTotal, 0);
    const totalDevolucao = linhasFiltradas
      .filter((row) => row.tipoMovimento === 'devolucao')
      .reduce((acc, row) => acc + Math.abs(row.valorTotal), 0);

    const clientesMap = new Map();
    const produtosMap = new Map();
    const diaMap = new Map();
    const estadoMap = new Map();
    const municipioMap = new Map();
    const municipioClientesMap = new Map();

    linhasFiltradas.forEach((row) => {
      const codigoCliente = normalizarCodigoCliente(row.cliente);
      const chaveCliente = codigoCliente || String(row.cliente || 'Sem cliente');
      clientesMap.set(chaveCliente, (clientesMap.get(chaveCliente) || 0) + row.valorTotal);
      const infoCliente = clientesPorCodigo.get(chaveCliente);
      if (infoCliente?.estado) {
        estadoMap.set(infoCliente.estado, (estadoMap.get(infoCliente.estado) || 0) + row.valorTotal);
      }
      if (infoCliente?.municipio) {
        const municipioKey = `${normalizarTexto(infoCliente.municipio)}||${String(infoCliente.estado || '').toUpperCase()}`;
        if (!municipioMap.has(municipioKey)) {
          municipioMap.set(municipioKey, {
            municipio: infoCliente.municipio,
            uf: String(infoCliente.estado || '').toUpperCase(),
            valor: 0,
          });
        }
        municipioMap.get(municipioKey).valor += row.valorTotal;
        if (!municipioClientesMap.has(municipioKey)) {
          municipioClientesMap.set(municipioKey, new Map());
        }
        const clientesLocal = municipioClientesMap.get(municipioKey);
        clientesLocal.set(chaveCliente, (clientesLocal.get(chaveCliente) || 0) + row.valorTotal);
      }

      const chaveProd = `${row.codigo || ''}||${normalizarDescricaoProduto(row.descricao)}`;
      if (!produtosMap.has(chaveProd)) {
        produtosMap.set(chaveProd, { valor: 0, quantidade: 0, unidades: new Map() });
      }
      const prod = produtosMap.get(chaveProd);
      prod.valor += row.valorTotal;
      const qtd = Number.isFinite(row.quantidade) ? row.quantidade : 0;
      prod.quantidade += qtd;
      const unidadeKey = String(row.unidade || 'N/A');
      prod.unidades.set(unidadeKey, (prod.unidades.get(unidadeKey) || 0) + (qtd || 1));

    });

    linhasFiltradasDia.forEach((row) => {
      if (!row.emissao) return;
      const diaISO = obterDataIsoUtc(row.emissao);
      const valorDia =
        row.tipoMovimento === 'devolucao' ? -Math.abs(row.valorTotal || 0) : row.valorTotal;
      diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + valorDia);
    });

    const porDia = Array.from(diaMap.entries())
      .map(([dia, valor]) => ({ dia, valor }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    const topClientes = Array.from(clientesMap.entries())
      .map(([cliente, valor]) => ({
        cliente,
        valor,
        info: clientesPorCodigo.get(cliente) || null,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const topProdutos = Array.from(produtosMap.entries())
      .map(([chave, dados]) => {
        const [codigo, descricao] = chave.split('||');
        const codigoNorm = normalizarCodigoProduto(codigo);
        const descricaoFinal =
          normalizarDescricaoProduto(descricao) || produtosPorCodigo.get(codigoNorm) || '';
        let unidadePrincipal = '';
        let unidadeQtd = 0;
        dados.unidades.forEach((valor, unidade) => {
          if (valor > unidadeQtd) {
            unidadeQtd = valor;
            unidadePrincipal = unidade;
          }
        });
        return {
          codigo,
          descricao: descricaoFinal,
          valor: dados.valor,
          quantidade: dados.quantidade,
          precoMedio: dados.quantidade > 0 ? dados.valor / dados.quantidade : 0,
          unidade: unidadePrincipal,
        };
      })
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    const topEstados = Array.from(estadoMap.entries())
      .map(([estado, valor]) => ({ estado, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const topMunicipios = Array.from(municipioMap.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const municipiosMapa = Array.from(municipioMap.entries())
      .map(([chave, item]) => {
        const info = municipiosPorChave.get(chave);
        if (!info) return null;
        const clientesLocais = Array.from((municipioClientesMap.get(chave) || new Map()).entries())
          .map(([cliente, valor]) => ({
            cliente,
            nome: clientesPorCodigo.get(cliente)?.nome || cliente,
            valor,
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10);
        return {
          municipio: info.nome,
          uf: info.uf,
          valor: item.valor,
          lat: info.lat,
          lng: info.lng,
          topClientes: clientesLocais,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 25);

    const movimentos = linhasFiltradas.length;
    const clientesAtivos = clientesMap.size;
    const ticketMedio = movimentos > 0 ? total / movimentos : 0;
    const diasAtivos = diaMap.size;

    return {
      total,
      totalDevolucao,
      movimentos,
      ticketMedio,
      diasAtivos,
      clientesAtivos,
      porDia,
      topClientes,
      topProdutos,
      topEstados,
      topMunicipios,
      municipiosMapa,
    };
  }, [dashboardFaturamentoBase, dashboardFilialAtual, filtroCfops]);

  const faturamentoHojeDashboard = useMemo(() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const item = (dashboardFaturamentoFilial.porDia || []).find((dia) => dia.dia === hojeISO);
    return item?.valor || 0;
  }, [dashboardFaturamentoFilial.porDia, agora]);

  const faturamentoHojeTodasFiliais = useMemo(() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const linhasHoje = (dashboardFaturamentoBase.linhasMes || []).filter((row) => {
      if (!row.emissao) return false;
      return obterDataIsoUtc(row.emissao) === hojeISO;
    });
    const linhasFiltradas =
      filtroCfops.length === 0
        ? linhasHoje
        : linhasHoje.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });
    return linhasFiltradas.reduce((acc, row) => acc + row.valorTotal, 0);
  }, [dashboardFaturamentoBase.linhasMes, filtroCfops, agora]);

  const letreiroFaturadoHojeFilial = useMemo(() => {
    const { linhasMes, clientesPorCodigo } = dashboardFaturamentoBase;
    const hojeISO = new Date().toISOString().slice(0, 10);
    const linhasHoje = (linhasMes || []).filter((row) => {
      if (!row.emissao) return false;
      if (dashboardFilialAtual && row.tipoMovimento !== 'devolucao' && row.filialVend !== dashboardFilialAtual) return false;
      return obterDataIsoUtc(row.emissao) === hojeISO;
    });
    const linhasFiltradas =
      filtroCfops.length === 0
        ? linhasHoje
        : linhasHoje.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });
    const clienteMap = new Map();
    linhasFiltradas.forEach((row) => {
      if ((row.valorTotal || 0) <= 0) return;
      const codigoCliente = normalizarCodigoCliente(row.cliente);
      const nomeCliente =
        clientesPorCodigo.get(codigoCliente)?.nome ||
        String(row.cliente || '').trim() ||
        'Sem cliente';
      clienteMap.set(nomeCliente, (clienteMap.get(nomeCliente) || 0) + (row.valorTotal || 0));
    });

    return Array.from(clienteMap.entries())
      .map(([cliente, valor]) => ({ cliente, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 20);
  }, [dashboardFaturamentoBase, dashboardFilialAtual, filtroCfops, agora]);

  const letreiroTexto = useMemo(() => {
    if (!letreiroFaturadoHojeFilial.length) return 'Sem faturamento hoje para a filial atual';
    return letreiroFaturadoHojeFilial
      .map((item) => `${item.cliente} — ${formatarMoeda(item.valor)}`)
      .join('   |   ');
  }, [letreiroFaturadoHojeFilial]);

  const metaFilialAtual = useMemo(() => {
    if (!dashboardFilialAtual) return 0;
    return Number(metaFilialMap?.[dashboardFilialAtual] || 0);
  }, [dashboardFilialAtual, metaFilialMap]);

  const atingimentoMetaPercentual = useMemo(() => {
    if (!metaFilialAtual) return 0;
    return (Number(dashboardFaturamentoFilial.total || 0) / metaFilialAtual) * 100;
  }, [dashboardFaturamentoFilial.total, metaFilialAtual]);

  // Últimos 10 dias de faturamento (independente do mês selecionado)
  const ultimos10DiasFaturamento = useMemo(() => {
    if (!faturamentoLinhas || !faturamentoLinhas.length) return [];
    
    const diaMap = new Map();
    faturamentoLinhas.forEach((row) => {
      const emissao = parseEmissaoData(row?.Emissao ?? row?.emissao);
      if (emissao) {
        const diaISO = obterDataIsoUtc(emissao);
        const valor = obterValorLiquido(row);
        diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + valor);
      }
    });
    
    return Array.from(diaMap.entries())
      .map(([dia, valor]) => ({ dia, valor }))
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .slice(-10);
  }, [faturamentoLinhas]);

  const dashboardMunicipiosBounds = useMemo(() => {
    if (dashboardFaturamentoFilial.municipiosMapa.length === 0) return null;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    dashboardFaturamentoFilial.municipiosMapa.forEach((item) => {
      minLat = Math.min(minLat, item.lat);
      maxLat = Math.max(maxLat, item.lat);
      minLng = Math.min(minLng, item.lng);
      maxLng = Math.max(maxLng, item.lng);
    });
    if (minLat === 90) return null;
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [dashboardFaturamentoFilial.municipiosMapa]);

  const detalhesDiaFaturamento = useMemo(() => {
    if (!diasFaturamentoSelecionados.length) return null;
    const diasSelecionados = [...diasFaturamentoSelecionados].sort();
    const diasSelecionadosSet = new Set(diasSelecionados);
    const produtosPorCodigo = new Map(
      (produtosData || []).map((produto) => [
        normalizarCodigoProduto(produto.codigo),
        produto.descricao || '',
      ])
    );
    const clientesPorCodigo = new Map(
      (clientesData?.clientes || []).map((cliente) => [
        normalizarCodigoCliente(cliente.Codigo),
        {
          nome: cliente.Nome || '',
          vendedor: normalizarCodigoVendedor(cliente.Vendedor),
        },
      ])
    );
    const vendedoresPorCodigo = new Map(
      (vendedoresData || []).map((vendedor) => [
        normalizarCodigoVendedor(vendedor.Codigo),
        vendedor.Nome || '',
      ])
    );
    const linhasDia = faturamentoAtual.linhas.filter((row) => {
      if (!row.emissao) return false;
      return diasSelecionadosSet.has(obterDataIsoUtc(row.emissao));
    });
    if (!linhasDia.length) return null;
    const linhasOrdenadas = [...linhasDia].sort((a, b) => {
      if (a.tipoMovimento === b.tipoMovimento) {
        return Math.abs(b.valorTotal) - Math.abs(a.valorTotal);
      }
      return a.tipoMovimento.localeCompare(b.tipoMovimento);
    });
    const linhasComDescricao = linhasOrdenadas.map((row) => {
      const descricaoAtual = normalizarDescricaoProduto(row.descricao);
      if (descricaoAtual) return { ...row, descricao: descricaoAtual };
      const codigoNorm = normalizarCodigoProduto(row.codigo);
      const descricao = produtosPorCodigo.get(codigoNorm) || '';
      return { ...row, descricao };
    });
    const linhasComCliente = linhasComDescricao.map((row) => {
      const codigoCliente = normalizarCodigoCliente(row.cliente);
      const infoCliente = clientesPorCodigo.get(codigoCliente);
      const clienteNome = row.clienteNome ?? infoCliente?.nome ?? '';
      const vendedorCodigo = row.vendedorCodigo || infoCliente?.vendedor || '';
      const vendedorNome = vendedoresPorCodigo.get(vendedorCodigo) || vendedorCodigo || '';
      return { ...row, clienteNome, vendedorNome };
    });
    const totalDia = linhasDia.reduce((acc, row) => acc + row.valorTotal, 0);
    const totalBrutoDia = linhasDia
      .filter((row) => row.tipoMovimento !== 'devolucao')
      .reduce((acc, row) => acc + row.valorTotal, 0);
    const totalDevolucaoDia = linhasDia
      .filter((row) => row.tipoMovimento === 'devolucao')
      .reduce((acc, row) => acc + Math.abs(row.valorTotal), 0);
    return {
      linhas: linhasComCliente,
      totalDia,
      totalBrutoDia,
      totalDevolucaoDia,
      diasSelecionados,
    };
  }, [diasFaturamentoSelecionados, faturamentoAtual.linhas]);

  const insightsPeriodoFaturamento = useMemo(() => {
    const linhas = detalhesDiaFaturamento?.linhas || [];
    if (!linhas.length) return null;
    const dias = new Set();
    const clientes = new Set();
    let vendas = 0;
    let devolucoes = 0;

    linhas.forEach((row) => {
      if (row.emissao) dias.add(obterDataIsoUtc(row.emissao));
      if (row.cliente) clientes.add(String(row.cliente).trim());
      if (row.tipoMovimento === 'devolucao') {
        devolucoes += Math.abs(row.valorTotal || 0);
      } else {
        vendas += row.valorTotal || 0;
      }
    });

    const movimentos = linhas.length;
    const ticketMedio = movimentos > 0 ? (vendas - devolucoes) / movimentos : 0;
    const faturamentoMedioDia = dias.size > 0 ? (vendas - devolucoes) / dias.size : 0;

    return {
      dias: dias.size,
      movimentos,
      clientesAtivos: clientes.size,
      ticketMedio,
      faturamentoMedioDia,
      faturamentoBruto: vendas,
      devolucoes,
    };
  }, [detalhesDiaFaturamento]);

  const abrirConfigMetaFilial = () => {
    const draft = {};
    (dashboardFiliais || []).forEach((filial) => {
      const valorAtual = Number(metaFilialMap?.[filial] || 0);
      draft[filial] = valorAtual ? String(valorAtual).replace('.', ',') : '';
    });
    setMetaConfigErro('');
    setMetaConfigDraft(draft);
    setMetaConfigOpen(true);
  };

  const salvarMetaFilial = async () => {
    setMetaConfigErro('');
    const novoMapa = { ...(metaFilialMap || {}) };
    (dashboardFiliais || []).forEach((filial) => {
      const valor = parseValor(metaConfigDraft?.[filial] || '');
      novoMapa[filial] = valor > 0 ? valor : 0;
    });
    setMetaFilialMap(novoMapa);
    try {
      setMetaConfigSaving(true);
      await setDoc(
        doc(db, 'dashboard_settings', 'metas_filial'),
        {
          metas: novoMapa,
          updatedAt: new Date().toISOString(),
          updatedBy: authUser?.email || '',
        },
        { merge: true }
      );
    } catch {
      setMetaConfigErro('Nao foi possivel salvar no Firebase. Metas mantidas localmente.');
    } finally {
      setMetaConfigSaving(false);
    }
    setMetaConfigOpen(false);
  };

  const clientesPorCodigoVendedor = useMemo(
    () =>
      new Map(
        (clientesData?.clientes || []).map((cliente) => [
          normalizarCodigoCliente(cliente.Codigo),
          normalizarCodigoVendedor(cliente.Vendedor),
        ])
      ),
    [clientesData]
  );

  const vendedoresPorCodigo = useMemo(
    () =>
      new Map(
        (vendedoresData || []).map((vendedor) => [
          normalizarCodigoVendedor(vendedor.Codigo),
          vendedor.Nome || '',
        ])
      ),
    [vendedoresData]
  );

  const faturamentoLinhasComVendedor = useMemo(
    () =>
      faturamentoAtual.linhas.map((row) => {
        const codigoCliente = normalizarCodigoCliente(row.cliente);
        const vendedorCodigo = row.vendedorCodigo || clientesPorCodigoVendedor.get(codigoCliente) || '';
        const vendedorNome = vendedoresPorCodigo.get(vendedorCodigo) || vendedorCodigo || '';
        return { ...row, vendedorNome };
      }),
    [faturamentoAtual.linhas, clientesPorCodigoVendedor, vendedoresPorCodigo]
  );

  const faturamentoLinhasFiltradas = useMemo(() => {
    if (!faturamentoInicio && !faturamentoFim) return faturamentoLinhasComVendedor;
    return faturamentoLinhasComVendedor.filter((row) => {
      const emissao = row.emissao instanceof Date ? row.emissao : parseEmissaoData(row.emissao);
      if (!emissao) return false;
      const dataISO = obterDataIsoUtc(emissao);
      if (faturamentoInicio && dataISO < faturamentoInicio) return false;
      if (faturamentoFim && dataISO > faturamentoFim) return false;
      return true;
    });
  }, [faturamentoLinhasComVendedor, faturamentoInicio, faturamentoFim]);

  const mesesDisponiveisPorAno = useMemo(() => {
    const mapa = new Map();
    (faturamentoLinhas || []).forEach((row) => {
      const mesInfo = obterMesKey(row);
      if (!mesInfo?.key) return;
      const [ano, mes] = mesInfo.key.split('-');
      if (!mapa.has(ano)) mapa.set(ano, new Set());
      mapa.get(ano).add(mes);
    });
    const anoAtual = String(new Date().getFullYear());
    if (!mapa.has(anoAtual)) mapa.set(anoAtual, new Set());
    return Array.from(mapa.entries())
      .map(([ano, meses]) => ({ ano, meses: Array.from(meses).sort() }))
      .sort((a, b) => a.ano.localeCompare(b.ano));
  }, [faturamentoLinhas]);

  const mesesDoAnoSelecionado = useMemo(() => {
    const registro = mesesDisponiveisPorAno.find((item) => item.ano === String(faturamentoAno));
    if (registro && registro.meses.length) return registro.meses;
    return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  }, [mesesDisponiveisPorAno, faturamentoAno]);

  const mesesLabelFaturamento = [
    'Janeiro',
    'Fevereiro',
    'Marco',
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

  const aplicarFiltroMes = (ano, mes) => {
    if (!ano || !mes) return;
    setFaturamentoAno(String(ano));
    setFaturamentoMes(String(mes).padStart(2, '0'));
    const inicio = new Date(Date.UTC(Number(ano), Number(mes) - 1, 1));
    const fim = new Date(Date.UTC(Number(ano), Number(mes), 0));
    setFaturamentoInicio(inicio.toISOString().slice(0, 10));
    setFaturamentoFim(fim.toISOString().slice(0, 10));
    setDiasFaturamentoSelecionados([]);
  };

  const kpisFiltradosProduto = useMemo(() => {
    const termo = filtroGraficoProduto.trim().toLowerCase();
    if (!termo) return null;
    const linhas = (faturamentoAtual.linhas || []).filter((row) =>
      String(row.codigo || '').toLowerCase().includes(termo) ||
      String(row.descricao || '').toLowerCase().includes(termo)
    );
    let total = 0, totalDevolucao = 0, movimentos = 0;
    const clientesSet = new Set();
    const diasSet = new Set();
    linhas.forEach((row) => {
      const val = row.valorTotal || 0;
      if (row.tipoMovimento === 'devolucao') {
        totalDevolucao += Math.abs(val);
        total -= Math.abs(val);
      } else {
        total += val;
        movimentos++;
      }
      if (row.cliente) clientesSet.add(row.cliente);
      const diaISO = obterDataIsoUtc(row.emissao);
      if (diaISO) diasSet.add(diaISO);
    });
    return {
      total,
      totalDevolucao,
      clientesAtivos: clientesSet.size,
      diasAtivos: diasSet.size,
      ticketMedio: movimentos > 0 ? total / movimentos : 0,
    };
  }, [filtroGraficoProduto, faturamentoAtual.linhas]);

  const faturamentoPorVendedor = useMemo(() => {
    const mapa = new Map();
    faturamentoLinhasFiltradas.forEach((row) => {
      const vendedor = row.vendedorNome || 'Sem vendedor';
      if (!mapa.has(vendedor)) {
        mapa.set(vendedor, {
          vendedor,
          total: 0,
          vendas: 0,
          devolucoes: 0,
          linhas: 0,
        });
      }
      const item = mapa.get(vendedor);
      const valor = obterValorLiquido(row);
      item.total += valor;
      if (normalizarTipoMovimento(row.tipoMovimento) === 'devolucao') {
        item.devolucoes += Math.abs(valor);
      } else {
        item.vendas += valor;
      }
      item.linhas += 1;
    });
    return Array.from(mapa.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [faturamentoLinhasFiltradas]);

  const faturamentoTotalFiltrado = useMemo(
    () => faturamentoLinhasFiltradas.reduce((acc, row) => acc + (row.valorTotal || 0), 0),
    [faturamentoLinhasFiltradas]
  );

  const handleExportarManutencaoPpt = () => {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Painel Metalosa';
    pptx.company = 'Metalosa';
    pptx.subject = 'Relatorio de manutencao';

    const now = new Date();
    const dataRelatorio = now.toLocaleDateString('pt-BR');
    const fileDate = now.toISOString().slice(0, 10);

    const parseNumber = (value) => {
      if (value === null || value === undefined) return 0;
      const cleaned = String(value)
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const parseTempoMin = (value) => {
      if (value === null || value === undefined) return 0;
      const raw = String(value).trim();
      if (!raw) return 0;
      if (raw.includes(':')) {
        const parts = raw.split(':').map((part) => String(part || '').trim());
        if (parts.length >= 2) {
          const h = Number(parts[0].replace(',', '.'));
          const m = Number(parts[1].replace(',', '.'));
          const s = parts.length >= 3 ? Number(parts[2].replace(',', '.')) : 0;
          if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
            return Math.max(0, Math.round(h * 60 + m + s / 60));
          }
        }
      }
      const hMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*h/i);
      const mMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*m/i);
      if (hMatch || mMatch) {
        const h = hMatch ? Number(hMatch[1].replace(',', '.')) : 0;
        const m = mMatch ? Number(mMatch[1].replace(',', '.')) : 0;
        if (Number.isFinite(h) || Number.isFinite(m)) {
          return Math.max(
            0,
            Math.round((Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0))
          );
        }
      }
      return Math.max(0, Math.round(parseNumber(raw)));
    };

    const diffMin = (start, end) => {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (!startDate || !endDate) return 0;
      const ms = endDate.getTime() - startDate.getTime();
      if (!Number.isFinite(ms) || ms <= 0) return 0;
      return Math.round(ms / 60000);
    };

    const calcShiftMinutes = (start, end) => {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (!startDate || !endDate) return 0;
      if (endDate <= startDate) return 0;
      let total = 0;
      const cursor = new Date(startDate);
      cursor.setHours(0, 0, 0, 0);
      const last = new Date(endDate);
      last.setHours(0, 0, 0, 0);
      while (cursor <= last) {
        const shiftStart = new Date(cursor);
        shiftStart.setHours(7, 0, 0, 0);
        const shiftEnd = new Date(cursor);
        shiftEnd.setHours(17, 0, 0, 0);
        const rangeStart = new Date(Math.max(shiftStart.getTime(), startDate.getTime()));
        const rangeEnd = new Date(Math.min(shiftEnd.getTime(), endDate.getTime()));
        if (rangeEnd > rangeStart) {
          total += Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60000);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return total;
    };

    const getTempoParadaMin = (os) => {
      const informado = parseTempoMin(os?.tempoParada);
      if (informado > 0) return informado;
      if (String(os?.status || '').toLowerCase() !== 'finalizada') return 0;
      return calcShiftMinutes(os?.dataFalha, os?.fechadaEm || os?.updatedAt);
    };

    const getTempoParadaTotalMin = (os) => {
      if (String(os?.status || '').toLowerCase() !== 'finalizada') return 0;
      return diffMin(os?.dataFalha, os?.fechadaEm || os?.updatedAt);
    };

    const formatCurrency = (value) =>
      `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const formatTempo = (value) => {
      if (!Number.isFinite(value)) return '-';
      if (value <= 0) return '-';
      const total = Math.round(value);
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h`;
      return `${minutes}m`;
    };

    const countBy = (items, getter) => {
      const map = {};
      items.forEach((item) => {
        const key = String(getter(item) || 'Nao informado');
        map[key] = (map[key] || 0) + 1;
      });
      return map;
    };

    const sumBy = (items, getter) =>
      items.reduce((acc, item) => acc + getter(item), 0);

    const totalOs = manutencaoOrdens.length;
    const totalParadas = manutencaoParadas.length;
    const totalFinalizadas = manutencaoOrdens.filter((os) => os.status === 'Finalizada').length;
    const totalAbertas = manutencaoOrdens.filter(
      (os) => os.status !== 'Finalizada' && os.status !== 'Cancelada'
    ).length;

    const ordensOrdenadas = [...manutencaoOrdens].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );

    const formatDateOnlyRelatorio = (value) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('pt-BR');
    };

    const formatDateTimeRelatorio = (value) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('pt-BR');
    };

    const statusCounts = countBy(manutencaoOrdens, (os) => os.status);
    const prioridadeCounts = countBy(manutencaoOrdens, (os) => os.prioridade);
    const tipoCounts = countBy(manutencaoOrdens, (os) => os.tipo);
    const setorCounts = countBy(manutencaoOrdens, (os) => os.setor);
    const responsavelCounts = countBy(manutencaoOrdens, (os) => os.responsavel);
    const ativoCounts = countBy(manutencaoOrdens, (os) => os.ativo);
    const impactoCounts = countBy(manutencaoOrdens, (os) => os.impacto);
    const paradaCounts = countBy(manutencaoOrdens, (os) => os.parada);
    const categoriaCounts = countBy(manutencaoOrdens, (os) => os.categoria);

    const totalCustoEstimado = sumBy(manutencaoOrdens, (os) => parseNumber(os.custoEstimado));
    const totalTempoParadaTurno = sumBy(manutencaoOrdens, (os) => getTempoParadaMin(os));
    const totalTempoParadaTotal = sumBy(manutencaoOrdens, (os) => getTempoParadaTotalMin(os));
    const mediaTempoParada =
      manutencaoOrdens.length > 0 ? totalTempoParadaTurno / manutencaoOrdens.length : 0;
    const totalTempoEstimado = sumBy(manutencaoOrdens, (os) => parseTempoMin(os.tempoEstimado));
    const mediaTempoEstimado =
      manutencaoOrdens.length > 0 ? totalTempoEstimado / manutencaoOrdens.length : 0;
    const comTempoParada = manutencaoOrdens.filter((os) => getTempoParadaMin(os) > 0).length;

    const createdDates = manutencaoOrdens
      .map((os) => os.createdAt || os.dataFalha)
      .map((value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      })
      .filter(Boolean)
      .sort((a, b) => a - b);

    const periodoInicio = createdDates.length ? formatDateOnlyRelatorio(createdDates[0]) : '-';
    const periodoFim = createdDates.length
      ? formatDateOnlyRelatorio(createdDates[createdDates.length - 1])
      : '-';

    const kpisResumo = [
      ...manutencaoKpis.map((kpi) => ({ label: kpi.label, value: kpi.value })),
      { label: 'Paradas', value: totalParadas },
      { label: 'OS com tempo parada', value: comTempoParada },
      { label: 'Custo estimado total', value: formatCurrency(totalCustoEstimado) },
      { label: 'Tempo parada (turno 07-17)', value: formatTempo(totalTempoParadaTurno) },
      { label: 'Tempo parada total (24h)', value: formatTempo(totalTempoParadaTotal) },
      { label: 'Tempo parada medio', value: formatTempo(mediaTempoParada) },
      { label: 'Tempo estimado total', value: formatTempo(totalTempoEstimado) },
      { label: 'Tempo estimado medio', value: formatTempo(mediaTempoEstimado) },
      { label: 'OS finalizadas', value: totalFinalizadas },
      { label: 'Taxa de finalizacao', value: totalOs > 0 ? `${Math.round((totalFinalizadas / totalOs) * 100)}%` : '-' }
    ];

    const pendencias = ordensOrdenadas.filter((os) => os.status !== 'Finalizada');
    const finalizadas = ordensOrdenadas.filter((os) => os.status === 'Finalizada');

    const mapToRows = (map, limit = 8) => {
      const rows = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
      return rows.length ? rows : [['Sem dados', 0]];
    };

    const tableHeaderRow = (headers) =>
      headers.map((text) => ({ text, options: { bold: true, color: 'FFFFFF' } }));

    const addTableSlide = ({
      title,
      headers,
      rows,
      colW,
      fontSize = 10,
      rowH = 0.3,
      maxRows = 16
    }) => {
      if (!rows.length) {
        const slide = pptx.addSlide();
        slide.addText(title, {
          x: 0.6,
          y: 0.4,
          w: 12,
          h: 0.4,
          fontSize: 20,
          bold: true,
          color: '0F172A'
        });
        slide.addText('Sem dados.', {
          x: 0.6,
          y: 1.2,
          w: 12,
          h: 0.4,
          fontSize,
          color: '64748B'
        });
        return;
      }

      const pages = [];
      for (let i = 0; i < rows.length; i += maxRows) {
        pages.push(rows.slice(i, i + maxRows));
      }

      pages.forEach((pageRows, index) => {
        const slide = pptx.addSlide();
        const pageTitle = pages.length > 1 ? `${title} (${index + 1}/${pages.length})` : title;
        slide.addText(pageTitle, {
          x: 0.6,
          y: 0.4,
          w: 12,
          h: 0.4,
          fontSize: 20,
          bold: true,
          color: '0F172A'
        });
        const tableRows = [tableHeaderRow(headers), ...pageRows];
        slide.addTable(tableRows, {
          x: 0.6,
          y: 1.1,
          w: 12.1,
          colW,
          fontSize,
          color: '0F172A',
          border: { type: 'solid', color: 'E2E8F0', pt: 1 },
          fill: { color: 'FFFFFF' },
          rowH,
          autoFit: true,
          valign: 'middle',
          header: true
        });
      });
    };

    const addDuoTableSlide = ({
      title,
      leftTitle,
      leftRows,
      rightTitle,
      rightRows
    }) => {
      const slide = pptx.addSlide();
      slide.addText(title, {
        x: 0.6,
        y: 0.35,
        w: 12,
        h: 0.4,
        fontSize: 20,
        bold: true,
        color: '0F172A'
      });
      slide.addText(leftTitle, {
        x: 0.6,
        y: 0.9,
        w: 5.8,
        h: 0.3,
        fontSize: 12,
        bold: true,
        color: '334155'
      });
      slide.addText(rightTitle, {
        x: 6.9,
        y: 0.9,
        w: 5.8,
        h: 0.3,
        fontSize: 12,
        bold: true,
        color: '334155'
      });

      slide.addTable([tableHeaderRow(['Item', 'Qtd']), ...leftRows], {
        x: 0.6,
        y: 1.3,
        w: 5.8,
        colW: [4.2, 1.6],
        fontSize: 10,
        color: '0F172A',
        border: { type: 'solid', color: 'E2E8F0', pt: 1 },
        fill: { color: 'FFFFFF' },
        rowH: 0.32,
        autoFit: true,
        valign: 'middle',
        header: true
      });

      slide.addTable([tableHeaderRow(['Item', 'Qtd']), ...rightRows], {
        x: 6.9,
        y: 1.3,
        w: 5.8,
        colW: [4.2, 1.6],
        fontSize: 10,
        color: '0F172A',
        border: { type: 'solid', color: 'E2E8F0', pt: 1 },
        fill: { color: 'FFFFFF' },
        rowH: 0.32,
        autoFit: true,
        valign: 'middle',
        header: true
      });
    };

    const slideCover = pptx.addSlide();
    slideCover.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 7.5,
      fill: { color: '0F172A' },
      line: { color: '0F172A' }
    });
    slideCover.addText('Manutencao', {
      x: 0.6,
      y: 0.55,
      w: 8.8,
      h: 0.6,
      fontSize: 34,
      bold: true,
      color: 'FFFFFF'
    });
    slideCover.addText(`Status da operacao em ${dataRelatorio}`, {
      x: 0.6,
      y: 1.2,
      w: 9,
      h: 0.4,
      fontSize: 12,
      color: 'CBD5F5'
    });

    const kpis = [
      { label: 'Total de OS', value: totalOs },
      { label: 'Em aberto', value: totalAbertas },
      { label: 'Finalizadas', value: totalFinalizadas },
      { label: 'Paradas', value: totalParadas }
    ];

    const boxW = 3.05;
    const boxH = 1.15;
    const startX = 0.6;
    const startY = 2.0;
    const gap = 0.3;
    kpis.forEach((kpi, index) => {
      const x = startX + index * (boxW + gap);
      slideCover.addShape(pptx.ShapeType.roundRect, {
        x,
        y: startY,
        w: boxW,
        h: boxH,
        fill: { color: '1E293B' },
        line: { color: '334155' },
        radius: 0.08
      });
      slideCover.addText(kpi.label, {
        x: x + 0.2,
        y: startY + 0.15,
        w: boxW - 0.4,
        h: 0.3,
        fontSize: 11,
        color: '94A3B8'
      });
      slideCover.addText(String(kpi.value ?? '-'), {
        x: x + 0.2,
        y: startY + 0.45,
        w: boxW - 0.4,
        h: 0.5,
        fontSize: 22,
        bold: true,
        color: 'E2E8F0'
      });
    });

    const slideResumo = pptx.addSlide();
    slideResumo.addText('Resumo de indicadores', {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: '0F172A'
    });

    const resumoRows = [
      [
        { text: 'Indicador', options: { bold: true, color: 'FFFFFF' } },
        { text: 'Valor', options: { bold: true, color: 'FFFFFF' } }
      ],
      ...[
        ...kpisResumo
      ].map((kpi) => [String(kpi.label || ''), String(kpi.value ?? '-')])
    ];

    slideResumo.addTable(resumoRows, {
      x: 0.6,
      y: 1.1,
      w: 12.1,
      colW: [8.2, 3.9],
      fontSize: 11,
      color: '0F172A',
      border: { type: 'solid', color: 'E2E8F0', pt: 1 },
      fill: { color: 'F8FAFC' },
      rowH: 0.35,
      autoFit: true,
      valign: 'middle',
      header: true
    });

    addDuoTableSlide({
      title: 'Distribuicoes (1/4)',
      leftTitle: 'Status das OS',
      leftRows: mapToRows(statusCounts).map(([label, value]) => [String(label), String(value)]),
      rightTitle: 'Prioridade',
      rightRows: mapToRows(prioridadeCounts).map(([label, value]) => [String(label), String(value)])
    });

    addDuoTableSlide({
      title: 'Distribuicoes (2/4)',
      leftTitle: 'Tipo',
      leftRows: mapToRows(tipoCounts).map(([label, value]) => [String(label), String(value)]),
      rightTitle: 'Setores',
      rightRows: mapToRows(setorCounts).map(([label, value]) => [String(label), String(value)])
    });

    addDuoTableSlide({
      title: 'Distribuicoes (3/4)',
      leftTitle: 'Responsaveis',
      leftRows: mapToRows(responsavelCounts).map(([label, value]) => [String(label), String(value)]),
      rightTitle: 'Ativos',
      rightRows: mapToRows(ativoCounts).map(([label, value]) => [String(label), String(value)])
    });

    addDuoTableSlide({
      title: 'Distribuicoes (4/4)',
      leftTitle: 'Impacto',
      leftRows: mapToRows(impactoCounts).map(([label, value]) => [String(label), String(value)]),
      rightTitle: 'Categoria',
      rightRows: mapToRows(categoriaCounts).map(([label, value]) => [String(label), String(value)])
    });

    addTableSlide({
      title: 'Distribuicao - Parada',
      headers: ['Parada', 'Qtd'],
      rows: mapToRows(paradaCounts).map(([label, value]) => [String(label), String(value)]),
      colW: [9.2, 2.9],
      fontSize: 11,
      rowH: 0.34,
      maxRows: 18
    });

    addTableSlide({
      title: 'Paradas em andamento',
      headers: ['Ativo', 'Setor', 'Processo', 'Status Maquina', 'Prioridade', 'Tempo parada (07-17)'],
      rows: manutencaoParadas.map((os) => [
        String(os.ativo || '-'),
        String(os.setor || '-'),
        String(os.processo || '-'),
        String(os.statusMaquina || '-'),
        String(os.prioridade || '-'),
        formatTempo(getTempoParadaMin(os))
      ]),
      colW: [2.1, 2.0, 2.2, 2.2, 1.6, 2.0],
      fontSize: 9,
      rowH: 0.3,
      maxRows: 16
    });

    addTableSlide({
      title: 'Finalizadas (OS encerradas)',
      headers: ['ID', 'Ativo', 'Setor', 'Prioridade', 'Responsavel', 'Tempo parada (07-17)', 'Fechada em'],
      rows: finalizadas.map((os) => [
        String(os.id || '-'),
        String(os.ativo || '-'),
        String(os.setor || '-'),
        String(os.prioridade || '-'),
        String(os.responsavel || '-'),
        formatTempo(getTempoParadaMin(os)),
        formatDateTimeRelatorio(os.fechadaEm || os.updatedAt || os.createdAt || os.dataFalha || now)
      ]),
      colW: [1.1, 2.2, 2.0, 1.5, 2.0, 2.0, 1.9],
      fontSize: 9,
      rowH: 0.3,
      maxRows: 16
    });

    addTableSlide({
      title: 'Pendencias (OS nao finalizadas)',
      headers: ['ID', 'Ativo', 'Setor', 'Prioridade', 'Status', 'Responsavel'],
      rows: pendencias.map((os) => [
        String(os.id || '-'),
        String(os.ativo || '-'),
        String(os.setor || '-'),
        String(os.prioridade || '-'),
        String(os.status || '-'),
        String(os.responsavel || '-')
      ]),
      colW: [1.1, 2.5, 2.2, 1.7, 2.0, 2.6],
      fontSize: 9,
      rowH: 0.3,
      maxRows: 16
    });

    addTableSlide({
      title: 'Ordens de servico',
      headers: [
        'ID',
        'Ativo',
        'Setor',
        'Processo',
        'Prioridade',
        'Tipo',
        'Status',
        'Status maquina',
        'Responsavel',
        'Tempo parada (07-17)',
        'Data'
      ],
      rows: ordensOrdenadas.map((os) => [
        String(os.id || '-'),
        String(os.ativo || '-'),
        String(os.setor || '-'),
        String(os.processo || '-'),
        String(os.prioridade || '-'),
        String(os.tipo || '-'),
        String(os.status || '-'),
        String(os.statusMaquina || '-'),
        String(os.responsavel || '-'),
        formatTempo(getTempoParadaMin(os)),
        formatDateTimeRelatorio(os.createdAt || os.dataFalha)
      ]),
      colW: [0.9, 1.6, 1.3, 1.6, 1.3, 1.3, 1.3, 1.5, 1.7, 1.9, 1.6],
      fontSize: 8,
      rowH: 0.27,
      maxRows: 14
    });

    pptx.writeFile({ fileName: `manutencao_${fileDate}.pptx` });
  };

  const exportFaturamentoDisponivel =
    faturamentoTabelaView === 'dia'
      ? (detalhesDiaFaturamento?.linhas || []).length > 0
      : faturamentoLinhasFiltradas.length > 0;

  const handleExportarFaturamentoExcel = () => {
    const diasSelecionados = [...diasFaturamentoSelecionados].sort();
    const linhasBase =
      faturamentoTabelaView === 'dia' && diasSelecionados.length > 0
        ? detalhesDiaFaturamento?.linhas || []
        : faturamentoLinhasFiltradas;

    if (!linhasBase.length) return;

    const produtosPorCodigo = new Map(
      (produtosData || []).map((produto) => [
        normalizarCodigoProduto(produto.codigo),
        produto.descricao || '',
      ])
    );

    const formatarData = (valor) => {
      return formatarDataUtcPtBr(valor);
    };

    const linhasExport = linhasBase.map((row) => ({
      Data: formatarData(row.emissao) || diasSelecionados[0] || '',
      Tipo: row.tipoMovimento === 'devolucao' ? 'Devolucao' : 'Venda',
      Cliente: row.cliente || '',
      Nome: row.clienteNome || '',
      Vendedor: row.vendedorNome || '',
      Filial: row.filial || '',
      Grupo: row.grupo || '',
      Codigo: row.codigo || '',
      Descricao:
        normalizarDescricaoProduto(row.descricao) ||
        produtosPorCodigo.get(normalizarCodigoProduto(row.codigo)) ||
        '',
      Quantidade: row.quantidade ?? 0,
      Unidade: row.unidade || '',
      Valor: row.valorTotal ?? 0,
      NF: row.nf || '',
      CFOP: row.cfop || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(linhasExport);
    XLSX.utils.book_append_sheet(wb, ws, 'Faturamento');

    const periodo =
      diasSelecionados.length === 1
        ? diasSelecionados[0]
        : diasSelecionados.length > 1
        ? `${diasSelecionados[0]}_a_${diasSelecionados[diasSelecionados.length - 1]}`
        : [faturamentoInicio, faturamentoFim].filter(Boolean).join('_') || 'completo';
    const nomeArquivo = `faturamento_${periodo}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

  const handleExportarRelatorioExecutivoAnual = async () => {
    const ano = faturamentoAno;
    const linhasAno = (faturamentoLinhas || []).filter((row) => obterMesKey(row)?.key?.startsWith(`${ano}-`));
    if (!linhasAno.length) return;

    const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const WEEKDAY_ORDER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
    const MONTHS_PT = { '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez' };

    let total = 0;
    const byMonth = new Map();
    const byFilial = new Map();
    const byGroup = new Map();
    const byProduct = new Map();
    const byClient = new Map();
    const byVendor = new Map();
    const byWeekday = new Map();
    const byMonthFilial = new Map();
    let cfopIntra = 0;
    let cfopInter = 0;
    let cfopOutros = 0;

    linhasAno.forEach((row) => {
      const valor = obterValorLiquido(row);
      const qtd = obterQuantidadeLiquida(row);
      const mesInfo = obterMesKey(row);
      if (!mesInfo) return;
      total += valor;
      byMonth.set(mesInfo.key, (byMonth.get(mesInfo.key) || 0) + valor);

      const filial = obterFilialFaturamento(row);
      byFilial.set(filial, (byFilial.get(filial) || 0) + valor);
      byMonthFilial.set(`${mesInfo.key}|${filial}`, (byMonthFilial.get(`${mesInfo.key}|${filial}`) || 0) + valor);

      const grupoRaw = row.Grupo;
      const grupo = grupoRaw && String(grupoRaw).trim() ? String(grupoRaw).trim() : 'Sem grupo';
      byGroup.set(grupo, (byGroup.get(grupo) || 0) + valor);

      const codigo = String(row.Codigo || '').trim();
      const descricao = normalizarDescricaoProduto(row.Descricao || '');
      const chaveProd = `${codigo}||${descricao}`;
      if (!byProduct.has(chaveProd)) byProduct.set(chaveProd, { codigo, descricao, valor: 0, qtd: 0, notas: 0 });
      const prod = byProduct.get(chaveProd);
      prod.valor += valor;
      prod.qtd += qtd;
      prod.notas += 1;

      const clienteCod = row.Cliente ? String(row.Cliente).trim() : '';
      if (clienteCod) {
        if (!byClient.has(clienteCod)) byClient.set(clienteCod, { valor: 0, notas: 0, meses: new Set() });
        const cli = byClient.get(clienteCod);
        cli.valor += valor;
        cli.notas += 1;
        cli.meses.add(mesInfo.key);
      }
      const vendedorCod = row.Vendedor1 ? String(row.Vendedor1).trim() : '';
      if (vendedorCod) byVendor.set(vendedorCod, (byVendor.get(vendedorCod) || 0) + valor);

      const emissaoDate = parseEmissaoData(row.Emissao);
      if (emissaoDate) {
        const wd = WEEKDAY_NAMES[emissaoDate.getUTCDay()];
        byWeekday.set(wd, (byWeekday.get(wd) || 0) + valor);
      }

      const cfop = String(row.CodFiscal || '').trim();
      if (cfop.startsWith('5')) cfopIntra += valor;
      else if (cfop.startsWith('6')) cfopInter += valor;
      else cfopOutros += valor;
    });

    if (total <= 0) return;

    const mesesOrdenados = Array.from(byMonth.keys()).sort();
    const filiaisOrdenadas = Array.from(byFilial.entries()).sort((a, b) => b[1] - a[1]);
    const gruposOrdenados = Array.from(byGroup.entries()).sort((a, b) => b[1] - a[1]);
    const produtosOrdenados = Array.from(byProduct.values()).sort((a, b) => b.valor - a.valor);
    const clientesOrdenados = Array.from(byClient.entries())
      .map(([cliente, info]) => ({ cliente, ...info }))
      .sort((a, b) => b.valor - a.valor);
    const vendedoresOrdenados = Array.from(byVendor.entries()).sort((a, b) => b[1] - a[1]);

    let cum = 0;
    let countTo80Products = 0;
    for (const p of produtosOrdenados) {
      cum += p.valor;
      countTo80Products += 1;
      if (cum / total >= 0.8) break;
    }
    let cumC = 0;
    let countClientsTo80 = 0;
    for (const c of clientesOrdenados) {
      cumC += c.valor;
      countClientsTo80 += 1;
      if (cumC / total >= 0.8) break;
    }
    const top10ClientPct = clientesOrdenados.slice(0, 10).reduce((s, c) => s + c.valor, 0) / total * 100;
    const clientsSingleNote = clientesOrdenados.filter((c) => c.notas === 1).length;

    const abcCurve = [];
    let cumAbc = 0;
    produtosOrdenados.forEach((p, i) => {
      cumAbc += p.valor;
      if (i < 60 || i % 40 === 0) abcCurve.push({ rank: i + 1, cumPct: (cumAbc / total) * 100 });
    });

    const loadImageAsDataUrl = (url) =>
      fetch(url)
        .then((res) => res.blob())
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
        )
        .catch(() => null);
    const logoDataUrl = await loadImageAsDataUrl(logoMetalosa);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const contentW = pageWidth - marginX * 2;

    const NAVY = [15, 23, 42];
    const SLATE = [100, 116, 139];
    const SLATE_LIGHT = [148, 163, 184];
    const BORDER = [226, 232, 240];
    const PANEL = [244, 244, 241];
    const BLUE = [42, 120, 214];
    const ORANGE = [235, 104, 52];
    const AQUA = [27, 175, 122];
    const VIOLET = [74, 58, 167];
    const RED = [227, 73, 72];

    const fmtMi = (v) => `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
    const fmtInt = (v) => Math.round(v).toLocaleString('pt-BR');

    const sectionTitle = (texto, y, accent = BLUE) => {
      doc.setFillColor(...accent);
      doc.rect(marginX, y - 4, 3, 5, 'F');
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(texto, marginX + 6, y);
      return y + 8;
    };
    const sectionDesc = (texto, y) => {
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      const linhas = doc.splitTextToSize(texto, contentW);
      doc.text(linhas, marginX, y);
      return y + linhas.length * 4.2 + 4;
    };
    const paragraph = (texto, y) => {
      doc.setFontSize(9.3);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(20, 20, 20);
      const linhas = doc.splitTextToSize(texto, contentW);
      doc.text(linhas, marginX, y);
      return y + linhas.length * 4.6 + 4;
    };
    const bullet = (texto, y) => {
      doc.setFontSize(9.3);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(20, 20, 20);
      const linhas = doc.splitTextToSize(texto, contentW - 8);
      doc.setTextColor(...BLUE);
      doc.text('•', marginX, y);
      doc.setTextColor(20, 20, 20);
      doc.text(linhas, marginX + 6, y);
      return y + linhas.length * 4.6 + 4;
    };

    const drawHeaderFooterAll = () => {
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 2; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFillColor(...BLUE);
        doc.rect(0, 0, pageWidth, 2.4, 'F');
        doc.setFontSize(7.6);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...SLATE_LIGHT);
        doc.text(`FATURAMENTO ${ano} · RELATÓRIO EXECUTIVO`, marginX, 10);
        doc.text('Metalosa', pageWidth - marginX, 10, { align: 'right' });
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        doc.line(marginX, 12, pageWidth - marginX, 12);
        doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
        doc.text(`Fonte: notas fiscais de saída, ${ano}`, marginX, pageHeight - 8);
        doc.text(`${i - 1}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
      }
    };

    // ===== Capa =====
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(...BLUE);
    doc.rect(0, 22, pageWidth, 3, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(0, 25, pageWidth * 0.42, 1.5, 'F');
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', marginX, 36, 26, 17.6);
      } catch (err) {
        /* logo indisponível */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.setFont(undefined, 'normal');
    doc.text('PAINEL INDUSTRIAL · RELATÓRIO EXECUTIVO', marginX, 66);
    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    doc.text(`Faturamento ${ano}`, marginX, 84);
    doc.setTextColor(143, 182, 232);
    doc.text('Análise de Operações e Produtos', marginX, 94);
    doc.setTextColor(195, 194, 183);
    doc.setFontSize(10.5);
    doc.setFont(undefined, 'normal');
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1] || '';
    const [ultAno, ultMes] = ultimoMes.split('-');
    const periodoTexto = `Período: janeiro a ${(MONTHS_PT[ultMes] || '').toLowerCase()} de ${ultAno || ano} (${mesesOrdenados.length} meses)`;
    doc.text(periodoTexto, marginX, 108);
    doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, marginX, 115);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(30);
    doc.setFont(undefined, 'bold');
    doc.text(fmtMi(total).replace('mi', 'milhões'), marginX, 158);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(195, 194, 183);
    doc.text(
      `em faturamento bruto, ${fmtInt(linhasAno.length)} notas fiscais, ${filiaisOrdenadas.length} filiais, ${fmtInt(produtosOrdenados.length)} produtos ativos`,
      marginX,
      165
    );
    doc.setDrawColor(44, 62, 92);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 22, pageWidth - marginX, pageHeight - 22);
    doc.setFontSize(8);
    doc.setTextColor(125, 138, 163);
    doc.text('Fonte: base de notas fiscais de saída (ERP) · Documento de uso interno', marginX, pageHeight - 16);

    // ===== Sumário executivo =====
    doc.addPage();
    let y = 24;
    y = sectionTitle('Sumário executivo', y);
    y = sectionDesc(
      `Panorama consolidado do faturamento de ${ano}, com leitura por filial, produto, cliente e canal de venda a partir da base de notas fiscais de saída.`,
      y
    );

    const filialLabel = (f) => (f && f !== 'Sem filial' ? `Filial ${f}` : 'Sem filial');
    const filialLider = filiaisOrdenadas[0];
    const clienteLider = clientesOrdenados[0];
    const KPIS = [
      { titulo: 'FATURAMENTO', valor: fmtMi(total), sub: `${ano} · ${fmtInt(linhasAno.length)} notas`, accent: BLUE, tint: [239, 246, 255] },
      { titulo: 'MÉDIA MENSAL', valor: fmtMi(total / mesesOrdenados.length), sub: `projeção anual ~ ${fmtMi((total / mesesOrdenados.length) * 12)}`, accent: ORANGE, tint: [255, 247, 237] },
      { titulo: 'FILIAL LÍDER', valor: filialLider ? filialLabel(filialLider[0]) : '-', sub: filialLider ? `${(filialLider[1] / total * 100).toFixed(0)}% do faturamento` : '', accent: AQUA, tint: [236, 253, 245] },
      { titulo: 'CONCENTRAÇÃO', valor: `${top10ClientPct.toFixed(0)}%`, sub: 'da receita em 10 clientes', accent: RED, tint: [255, 241, 242] },
    ];
    const gap = 4;
    const cardW = (contentW - gap * 3) / 4;
    const cardH = 26;
    KPIS.forEach((card, i) => {
      const x = marginX + i * (cardW + gap);
      doc.setFillColor(...card.tint);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
      doc.setFillColor(...card.accent);
      doc.circle(x + cardW - 5, y + 5, 1.4, 'F');
      doc.setFontSize(7);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...SLATE);
      doc.text(card.titulo, x + 6, y + 7);
      doc.setFontSize(13.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(card.valor, x + 6, y + 15.5);
      doc.setFontSize(6.8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      const subLinhas = doc.splitTextToSize(card.sub, cardW - 10);
      doc.text(subLinhas, x + 6, y + 21.5);
    });
    y += cardH + 12;

    y = sectionTitle('Principais achados', y);
    const melhorMes = mesesOrdenados.reduce((best, m) => (byMonth.get(m) > (byMonth.get(best) ?? -Infinity) ? m : best), mesesOrdenados[0]);
    const piorMes = mesesOrdenados.reduce((worst, m) => (byMonth.get(m) < (byMonth.get(worst) ?? Infinity) ? m : worst), mesesOrdenados[0]);
    const top2Grupos = gruposOrdenados.slice(0, 2).reduce((s, [, v]) => s + v, 0);
    const achados = [
      `O faturamento somou ${fmtMi(total)} em ${mesesOrdenados.length} meses de ${ano}, com pico em ${MONTHS_PT[melhorMes.split('-')[1]]} (${fmtMi(byMonth.get(melhorMes))}) e vale em ${MONTHS_PT[piorMes.split('-')[1]]} (${fmtMi(byMonth.get(piorMes))}).`,
      filialLider
        ? `A ${filialLabel(filialLider[0])} responde por ${(filialLider[1] / total * 100).toFixed(0)}% de todo o faturamento (${fmtMi(filialLider[1])}) — a maior concentração operacional entre as filiais.`
        : null,
      `O portfólio tem alta concentração de receita: apenas ${countTo80Products} produtos (de ${fmtInt(produtosOrdenados.length)} ativos) respondem por 80% do faturamento — perfil de cauda longa clássico.`,
      gruposOrdenados.length >= 2
        ? `Os dois maiores grupos de produto somam ${fmtMi(top2Grupos)} (${(top2Grupos / total * 100).toFixed(0)}% do total) — o núcleo do negócio.`
        : null,
      clienteLider
        ? `Concentração de clientes é ponto de atenção: o cliente ${clienteLider.cliente} responde sozinho por ${(clienteLider.valor / total * 100).toFixed(1)}% da receita (${fmtMi(clienteLider.valor)}), e os 10 maiores juntos somam ${top10ClientPct.toFixed(0)}% — ${fmtInt(clientsSingleNote)} de ${fmtInt(clientesOrdenados.length)} clientes ativos compraram apenas uma vez no período.`
        : null,
      clientesOrdenados.length
        ? `No total, ${fmtInt(countClientsTo80)} clientes (de ${fmtInt(clientesOrdenados.length)}) respondem por 80% da receita.`
        : null,
      `Vendas interestaduais (CFOP 6xxx) representam ${(cfopInter / total * 100).toFixed(0)}% do faturamento total — parcela relevante da operação atende clientes fora do estado sede.`,
    ].filter(Boolean);
    achados.forEach((a) => {
      y = bullet(a, y);
    });

    // ===== Evolução mensal =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Evolução mensal', y);
    y = sectionDesc('Faturamento por mês de emissão da nota fiscal. A linha tracejada marca a média do período.', y);

    const chartH1 = 55;
    const chartY1 = y;
    const maxMes = Math.max(...mesesOrdenados.map((m) => byMonth.get(m)), 1);
    const slot1 = contentW / mesesOrdenados.length;
    const barW1 = slot1 * 0.55;
    const avgMes = total / mesesOrdenados.length;

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    [0.25, 0.5, 0.75, 1].forEach((p) => {
      const gy = chartY1 + chartH1 * (1 - p);
      doc.line(marginX, gy, marginX + contentW, gy);
      doc.setFontSize(6.5);
      doc.setTextColor(...SLATE_LIGHT);
      doc.text(formatarValorCurto(maxMes * p * 1.15), marginX + contentW, gy - 0.8, { align: 'right' });
    });
    mesesOrdenados.forEach((m, i) => {
      const v = byMonth.get(m);
      const bx = marginX + i * slot1 + (slot1 - barW1) / 2;
      const barH = (v / (maxMes * 1.15)) * chartH1;
      const by = chartY1 + chartH1 - barH;
      doc.setFillColor(...BLUE);
      doc.rect(bx, by, barW1, barH, 'F');
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(formatarValorCurto(v), bx + barW1 / 2, by - 2, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      doc.text(MONTHS_PT[m.split('-')[1]], bx + barW1 / 2, chartY1 + chartH1 + 6, { align: 'center' });
    });
    const avgY1 = chartY1 + chartH1 - (avgMes / (maxMes * 1.15)) * chartH1;
    doc.setDrawColor(...SLATE_LIGHT);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(marginX, avgY1, marginX + contentW, avgY1);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(`Média: ${fmtMi(avgMes)}`, marginX + contentW, avgY1 - 2, { align: 'right' });
    y = chartY1 + chartH1 + 16;

    y = paragraph(
      `${MONTHS_PT[melhorMes.split('-')[1]]} foi o mês de maior faturamento (${fmtMi(byMonth.get(melhorMes))}). ${MONTHS_PT[piorMes.split('-')[1]]} registrou o menor volume do período (${fmtMi(byMonth.get(piorMes))}).`,
      y
    );

    y += 4;
    y = sectionTitle('Padrão semanal de vendas', y, AQUA);
    const chartH2 = 42;
    const chartY2 = y;
    const maxWd = Math.max(...WEEKDAY_ORDER.map((d) => byWeekday.get(d) || 0), 1);
    const slot2 = contentW / WEEKDAY_ORDER.length;
    const barW2 = slot2 * 0.5;
    doc.setDrawColor(...BORDER);
    doc.line(marginX, chartY2 + chartH2, marginX + contentW, chartY2 + chartH2);
    WEEKDAY_ORDER.forEach((d, i) => {
      const v = byWeekday.get(d) || 0;
      const bx = marginX + i * slot2 + (slot2 - barW2) / 2;
      const barH = (v / (maxWd * 1.15)) * chartH2;
      const by = chartY2 + chartH2 - barH;
      doc.setFillColor(...AQUA);
      if (barH > 0) doc.rect(bx, by, barW2, barH, 'F');
      if (v > 0) {
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...NAVY);
        doc.text(formatarValorCurto(v), bx + barW2 / 2, by - 2, { align: 'center' });
      }
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      doc.text(d, bx + barW2 / 2, chartY2 + chartH2 + 6, { align: 'center' });
    });
    y = chartY2 + chartH2 + 14;
    const diaTop = WEEKDAY_ORDER.reduce((best, d) => ((byWeekday.get(d) || 0) > (byWeekday.get(best) || 0) ? d : best), WEEKDAY_ORDER[0]);
    y = paragraph(`${diaTop}-feira concentra o maior volume de faturamento da semana (${fmtMi(byWeekday.get(diaTop) || 0)}).`, y);

    // ===== Filiais =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Desempenho por filial', y);
    y = sectionDesc(`Distribuição do faturamento entre as filiais operacionais em ${ano}.`, y);

    const filCores = [BLUE, AQUA, VIOLET, [237, 161, 0]];
    const rowH = 12;
    const maxFil = filiaisOrdenadas[0]?.[1] || 1;
    filiaisOrdenadas.forEach(([f, v], i) => {
      const by = y + i * (rowH + 3);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      doc.text(filialLabel(f), marginX, by + rowH / 2 + 1);
      const trackX = marginX + 30;
      const trackW = contentW - 30 - 45;
      doc.setFillColor(...BORDER);
      doc.roundedRect(trackX, by + 2, trackW, rowH - 4, 1.5, 1.5, 'F');
      const barW = Math.max((v / maxFil) * trackW, 2);
      doc.setFillColor(...filCores[i % filCores.length]);
      doc.roundedRect(trackX, by + 2, barW, rowH - 4, 1.5, 1.5, 'F');
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(`${fmtMi(v)} (${(v / total * 100).toFixed(0)}%)`, marginX + contentW, by + rowH / 2 + 1, { align: 'right' });
    });
    y += filiaisOrdenadas.length * (rowH + 3) + 8;

    autoTable(doc, {
      startY: y,
      head: [['Filial', 'Faturamento', '% do total', 'Média mensal']],
      body: filiaisOrdenadas.map(([f, v]) => [
        filialLabel(f),
        fmtMi(v),
        `${(v / total * 100).toFixed(1)}%`,
        fmtMi(v / mesesOrdenados.length),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 10;

    y = ensureSpacePdf(doc, pageHeight, y, 40);
    y = sectionTitle('Mapa mensal por filial', y, VIOLET);
    autoTable(doc, {
      startY: y,
      head: [['Filial', ...mesesOrdenados.map((m) => MONTHS_PT[m.split('-')[1]])]],
      body: filiaisOrdenadas.map(([f]) => [
        filialLabel(f),
        ...mesesOrdenados.map((m) => (byMonthFilial.get(`${m}|${f}`) || 0) / 1e6).map((v) => v.toFixed(1)),
      ]),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_LIGHT);
    doc.text('Valores em R$ milhões.', marginX, y);

    // ===== Produtos =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Portfólio de produtos', y);
    y = sectionDesc(`A base ativa em ${ano} conta com ${fmtInt(produtosOrdenados.length)} produtos distintos vendidos.`, y);

    y = sectionTitle('Faturamento por grupo de produto', y, ORANGE);
    const topGrupos = gruposOrdenados.slice(0, 10);
    const maxGrupo = topGrupos[0]?.[1] || 1;
    const rowHG = 9;
    topGrupos.forEach(([g, v], i) => {
      const by = y + i * (rowHG + 2.5);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...SLATE);
      const label = doc.splitTextToSize(g, 34)[0];
      doc.text(label, marginX, by + rowHG / 2 + 1);
      const trackX = marginX + 36;
      const trackW = contentW - 36 - 30;
      doc.setFillColor(...BORDER);
      doc.rect(trackX, by + 1.5, trackW, rowHG - 3, 'F');
      const barW = Math.max((v / maxGrupo) * trackW, 2);
      doc.setFillColor(...BLUE);
      doc.rect(trackX, by + 1.5, barW, rowHG - 3, 'F');
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(fmtMi(v), marginX + contentW, by + rowHG / 2 + 1, { align: 'right' });
    });
    y += topGrupos.length * (rowHG + 2.5) + 10;

    y = ensureSpacePdf(doc, pageHeight, y, 90);
    y = sectionTitle('Concentração de receita (curva ABC)', y, RED);
    y = sectionDesc('Percentual acumulado do faturamento por produto, ordenado do maior para o menor.', y);
    const chartH3 = 48;
    const chartY3 = y;
    const maxRank = abcCurve[abcCurve.length - 1]?.rank || 1;
    doc.setDrawColor(...BORDER);
    [0.25, 0.5, 0.75, 1].forEach((p) => {
      const gy = chartY3 + chartH3 * (1 - p);
      doc.line(marginX, gy, marginX + contentW, gy);
      doc.setFontSize(6.5);
      doc.setTextColor(...SLATE_LIGHT);
      doc.text(`${Math.round(p * 100)}%`, marginX + contentW, gy - 0.8, { align: 'right' });
    });
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.7);
    for (let i = 0; i < abcCurve.length - 1; i += 1) {
      const p1 = abcCurve[i];
      const p2 = abcCurve[i + 1];
      const x1 = marginX + (p1.rank / maxRank) * contentW;
      const y1 = chartY3 + chartH3 * (1 - p1.cumPct / 100);
      const x2 = marginX + (p2.rank / maxRank) * contentW;
      const y2 = chartY3 + chartH3 * (1 - p2.cumPct / 100);
      doc.line(x1, y1, x2, y2);
    }
    const marcaX = marginX + (countTo80Products / maxRank) * contentW;
    const marcaY = chartY3 + chartH3 * 0.2;
    doc.setDrawColor(...ORANGE);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marcaX, chartY3, marcaX, chartY3 + chartH3);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...ORANGE);
    doc.circle(marcaX, chartY3 + chartH3 * 0.2, 1.2, 'F');
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(`${countTo80Products} produtos = 80%`, marcaX + 3, marcaY - 2);
    y = chartY3 + chartH3 + 12;
    y = paragraph(
      `Apenas ${countTo80Products} produtos (${(countTo80Products / produtosOrdenados.length * 100).toFixed(0)}% do portfólio) respondem por 80% de toda a receita.`,
      y
    );

    // ===== Top produtos =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Top 20 produtos por faturamento', y);
    y = sectionDesc('Ranking do período com quantidade vendida, número de notas e ticket médio por nota.', y);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Código', 'Descrição', 'Faturamento', 'Qtd.', 'Notas', 'Ticket médio']],
      body: produtosOrdenados.slice(0, 20).map((p, i) => [
        String(i + 1),
        p.codigo,
        p.descricao,
        formatarMoeda(p.valor),
        fmtInt(p.qtd),
        fmtInt(p.notas),
        formatarMoeda(p.valor / p.notas),
      ]),
      theme: 'striped',
      styles: { fontSize: 7.6, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ===== Clientes e vendedores =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Clientes e canais de venda', y);
    y = sectionDesc(
      `A base ativa soma ${fmtInt(clientesOrdenados.length)} clientes distintos em ${ano}, atendidos por ${fmtInt(vendedoresOrdenados.length)} vendedores/canais.`,
      y
    );
    y = sectionTitle('Top 15 clientes por faturamento', y, AQUA);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Cliente', 'Faturamento', '% total', 'Notas', 'Meses', 'Ticket médio']],
      body: clientesOrdenados.slice(0, 15).map((c, i) => [
        String(i + 1),
        c.cliente,
        formatarMoeda(c.valor),
        `${(c.valor / total * 100).toFixed(1)}%`,
        fmtInt(c.notas),
        `${c.meses.size}/${mesesOrdenados.length}`,
        formatarMoeda(c.valor / c.notas),
      ]),
      theme: 'striped',
      styles: { fontSize: 7.6, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 10;

    y = ensureSpacePdf(doc, pageHeight, y, 60);
    y = sectionTitle('Top 10 vendedores/canais por faturamento', y, VIOLET);
    autoTable(doc, {
      startY: y,
      head: [['#', 'Código', 'Faturamento', '% do total']],
      body: vendedoresOrdenados.slice(0, 10).map(([v, val], i) => [
        String(i + 1),
        v,
        formatarMoeda(val),
        `${(val / total * 100).toFixed(1)}%`,
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ===== Perfil fiscal =====
    doc.addPage();
    y = 24;
    y = sectionTitle('Perfil fiscal das operações', y);
    y = sectionDesc('Distribuição do faturamento por Código Fiscal de Operação (CFOP) agrupado.', y);
    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Faturamento', '% do total']],
      body: [
        ['Vendas dentro do estado (CFOP 5xxx)', fmtMi(cfopIntra), `${(cfopIntra / total * 100).toFixed(1)}%`],
        ['Vendas interestaduais (CFOP 6xxx)', fmtMi(cfopInter), `${(cfopInter / total * 100).toFixed(1)}%`],
        ['Outras operações', fmtMi(cfopOutros), `${(cfopOutros / total * 100).toFixed(1)}%`],
      ],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 12;
    y = paragraph(
      `Vendas interestaduais representam ${(cfopInter / total * 100).toFixed(0)}% do faturamento total, o que impacta a apuração de ICMS/DIFAL proporcionalmente ao volume.`,
      y
    );

    y += 8;
    y = sectionTitle('Notas metodológicas', y, SLATE);
    paragraph(
      `Fonte: base de notas fiscais de saída (ERP), consolidada por mês de emissão, filial, código de produto, cliente e vendedor/canal. A projeção anual usa a média mensal observada extrapolada para 12 meses, sem ajuste de sazonalidade.`,
      y
    );

    drawHeaderFooterAll();
    doc.save(`relatorio_executivo_faturamento_${ano}.pdf`);
  };

  useEffect(() => {
    if (!diasFaturamentoSelecionados.length) return;
    const diasDisponiveis = new Set((faturamentoAtual.porDia || []).map((item) => item.dia));
    setDiasFaturamentoSelecionados((prev) => {
      const filtrados = prev.filter((dia) => diasDisponiveis.has(dia));
      return filtrados.length === prev.length ? prev : filtrados;
    });
  }, [diasFaturamentoSelecionados, faturamentoAtual.porDia]);

  useEffect(() => {
    if (filtroFilial === 'Todas') return;
    if (faturamentoAtual.filiais.includes(filtroFilial)) return;
    setFiltroFilial('Todas');
  }, [faturamentoAtual.filiais, filtroFilial]);

  useEffect(() => {
    if (filtroFilialVend === 'Todas') return;
    if (faturamentoAtual.filiaisVend?.includes(filtroFilialVend)) return;
    setFiltroFilialVend('Todas');
  }, [faturamentoAtual.filiaisVend, filtroFilialVend]);

  useEffect(() => {
    if (filtroGrupo === 'Todos') return;
    if (faturamentoAtual.gruposDisponiveis?.includes(filtroGrupo)) return;
    setFiltroGrupo('Todos');
  }, [faturamentoAtual.gruposDisponiveis, filtroGrupo]);

  const faturamento2025 = useMemo(() => {
    const clientesPorCodigo = new Map(
      (clientesData?.clientes || []).map((cliente) => [
        normalizarCodigoCliente(cliente.Codigo),
        {
          nome: cliente.Nome || '',
          estado: cliente.Estado || '',
          municipio: cliente.Municipio || '',
        },
      ])
    );
    const produtosPorCodigo = new Map(
      (produtosData || []).map((produto) => [
        normalizarCodigoProduto(produto.codigo),
        produto.descricao || '',
      ])
    );

    const vazio = {
      total: 0,
      totalBruto: 0,
      totalDevolucao: 0,
      devolucaoPercent: 0,
      ticketMedio: 0,
      clientesAtivos: 0,
      movimentos: 0,
      pedidos: 0,
      diasAtivos: 0,
      quantidadeTotal: 0,
      mediaMensal: 0,
      porMes: [],
      melhorMes: null,
      piorMes: null,
      variacaoUltimoMes: null,
      topClientes: [],
      topProdutos: [],
      topGrupos: [],
      topFiliais: [],
      mixUnidade: [],
      devolucoesPorCfop: [],
      shareTop5Grupos: 0,
    };

    if (!faturamentoLinhas.length) {
      return vazio;
    }

    const normalizadas = faturamentoLinhas.map((row) => {
      const mesInfo = obterMesKey(row);
      const tipoMovimento = normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento);
      const codigo = row?.Codigo ?? row?.codigo ?? '';
      const descricao =
        normalizarDescricaoProduto(row?.Descricao ?? row?.descricao) ||
        produtosPorCodigo.get(normalizarCodigoProduto(codigo)) ||
        '';
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo,
        descricao,
        filial: obterFilialFaturamento(row, { descricaoOverride: descricao }),
        unidade: row?.Unidade ?? row?.unidade ?? '',
        nf: obterNumeroNota(row),
        quantidade: obterQuantidadeLiquida(row),
        valorUnitario: parseValor(row?.ValorUnitario ?? row?.valorUnitario),
        valorTotal: obterValorLiquido(row),
        emissao: parseEmissaoData(row?.Emissao ?? row?.emissao),
        mesKey: mesInfo?.key,
        mesDisplay: mesInfo?.display,
        tipoMovimento,
        cfop: row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '',
      };
    });

    const linhas2025 = normalizadas
      .filter((row) => row.mesKey && row.mesKey.startsWith('2025-'))
      .filter((row) => (filtroFilial2025 === 'Todas' ? true : row.filial === filtroFilial2025))
      .filter((row) => {
        if (!filtroCfops2025.length) return true;
        if (row.tipoMovimento === 'devolucao') return true;
        const cfop = String(row.cfop || '').trim();
        return cfop ? filtroCfops2025.includes(cfop) : false;
      });
    if (!linhas2025.length) {
      return vazio;
    }

    let total = 0;
    let totalBruto = 0;
    let totalDevolucao = 0;
    let quantidadeTotal = 0;
    const porMesMap = new Map();
    const gruposMap = new Map();
    const clientesMap = new Map();
    const produtosMap = new Map();
    const filiaisMap = new Map();
    const unidadeMap = new Map();
    const devolucoesCfopMap = new Map();
    const diasSet = new Set();
    const pedidosSet = new Set();

    linhas2025.forEach((row) => {
      total += row.valorTotal;
      if (row.tipoMovimento === 'devolucao') {
        totalDevolucao += Math.abs(row.valorTotal);
      } else {
        totalBruto += row.valorTotal;
      }

      const qtd = Number.isFinite(row.quantidade) ? row.quantidade : 0;
      quantidadeTotal += qtd;

      if (row.emissao instanceof Date) {
        diasSet.add(obterDataIsoUtc(row.emissao));
      }

      const pedidoKey = row.nf
        ? String(row.nf).trim()
        : `${obterDataIsoUtc(row.emissao) || 'semdata'}||${row.cliente}||${row.valorTotal}`;
      pedidosSet.add(pedidoKey);

      if (row.mesKey) {
        const mesLabel =
          row.mesDisplay || `${row.mesKey.slice(5, 7)}/${row.mesKey.slice(0, 4)}`;
        const atual = porMesMap.get(row.mesKey) || { mes: mesLabel, ordem: row.mesKey, valor: 0 };
        atual.valor += row.valorTotal;
        porMesMap.set(row.mesKey, atual);
      }

      const grupo = row.grupo || 'Sem grupo';
      gruposMap.set(grupo, (gruposMap.get(grupo) || 0) + row.valorTotal);

      const clienteKey = normalizarCodigoCliente(row.cliente) || String(row.cliente || 'Sem cliente');
      if (!clientesMap.has(clienteKey)) {
        clientesMap.set(clienteKey, { cliente: clienteKey, valor: 0, info: clientesPorCodigo.get(clienteKey) });
      }
      clientesMap.get(clienteKey).valor += row.valorTotal;

      const prodKey = `${row.codigo || ''}||${normalizarDescricaoProduto(row.descricao)}`;
      if (!produtosMap.has(prodKey)) {
        produtosMap.set(prodKey, {
          codigo: row.codigo || '',
          descricao: row.descricao || '',
          valor: 0,
          quantidade: 0,
        });
      }
      const prod = produtosMap.get(prodKey);
      prod.valor += row.valorTotal;
      prod.quantidade += qtd;

      const filial = row.filial || 'Sem filial';
      filiaisMap.set(filial, (filiaisMap.get(filial) || 0) + row.valorTotal);

      const unidade = row.unidade || 'Sem unidade';
      unidadeMap.set(unidade, (unidadeMap.get(unidade) || 0) + qtd);

      if (row.tipoMovimento === 'devolucao') {
        const cfop = String(row.cfop || '').trim();
        if (cfop) {
          devolucoesCfopMap.set(cfop, (devolucoesCfopMap.get(cfop) || 0) + Math.abs(row.valorTotal));
        }
      }
    });

    const porMes = Array.from(porMesMap.values()).sort((a, b) => a.ordem.localeCompare(b.ordem));
    const melhorMes = porMes.reduce((acc, item) => (!acc || item.valor > acc.valor ? item : acc), null);
    const piorMes = porMes.reduce((acc, item) => (!acc || item.valor < acc.valor ? item : acc), null);
    const ultimoMes = porMes[porMes.length - 1] || null;
    const mesAnterior = porMes.length > 1 ? porMes[porMes.length - 2] : null;
    const variacaoUltimoMes =
      ultimoMes && mesAnterior && mesAnterior.valor !== 0
        ? (ultimoMes.valor - mesAnterior.valor) / Math.abs(mesAnterior.valor)
        : null;

    const topGrupos = Array.from(gruposMap.entries())
      .map(([grupo, valor]) => ({ grupo, valor }))
      .sort((a, b) => b.valor - a.valor);
    const topClientes = Array.from(clientesMap.values()).sort((a, b) => b.valor - a.valor);
    const topProdutos = Array.from(produtosMap.values()).sort((a, b) => b.valor - a.valor);
    const topFiliais = Array.from(filiaisMap.entries())
      .map(([filial, valor]) => ({ filial, valor }))
      .sort((a, b) => b.valor - a.valor);
    const mixUnidade = Array.from(unidadeMap.entries())
      .map(([unidade, quantidade]) => ({ unidade, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
    const devolucoesPorCfop = Array.from(devolucoesCfopMap.entries())
      .map(([cfop, valor]) => ({ cfop, valor }))
      .sort((a, b) => b.valor - a.valor);

    const shareTop5Grupos =
      total !== 0
        ? (topGrupos.slice(0, 5).reduce((acc, item) => acc + item.valor, 0) / total) * 100
        : 0;

    return {
      total,
      totalBruto,
      totalDevolucao,
      devolucaoPercent: totalBruto > 0 ? (totalDevolucao / totalBruto) * 100 : 0,
      ticketMedio: pedidosSet.size > 0 ? total / pedidosSet.size : 0,
      clientesAtivos: clientesMap.size,
      movimentos: linhas2025.length,
      pedidos: pedidosSet.size,
      diasAtivos: diasSet.size,
      quantidadeTotal,
      mediaMensal: porMes.length > 0 ? total / porMes.length : 0,
      porMes,
      melhorMes,
      piorMes,
      variacaoUltimoMes,
      topClientes,
      topProdutos,
      topGrupos,
      topFiliais,
      mixUnidade,
      devolucoesPorCfop,
      shareTop5Grupos,
    };
  }, [faturamentoLinhas, clientesData, produtosData, filtroFilial2025, filtroCfops2025]);

  const filiais2025 = useMemo(() => {
    const filiais = new Set();
    faturamentoLinhas.forEach((row) => {
      const mesInfo = obterMesKey(row);
      if (!mesInfo?.key?.startsWith('2025-')) return;
      const filial = obterFilialFaturamento(row, { padrao: '' });
      if (filial) {
        filiais.add(String(filial));
      }
    });
    return ['Todas', ...Array.from(filiais).sort((a, b) => a.localeCompare(b))];
  }, [faturamentoLinhas]);

  const cfops2025Options = useMemo(() => {
    const cfops = new Set();
    faturamentoLinhas.forEach((row) => {
      const mesInfo = obterMesKey(row);
      if (!mesInfo?.key?.startsWith('2025-')) return;
      const cfop = String(row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '').trim();
      if (cfop) {
        cfops.add(cfop);
      }
    });
    return Array.from(cfops).sort((a, b) => a.localeCompare(b));
  }, [faturamentoLinhas]);

  const faturamento2025PorMesFilial = useMemo(() => {
    if (!faturamentoLinhas.length) return [];
    const porMesMap = new Map();

    faturamentoLinhas.forEach((row) => {
      const mesInfo = obterMesKey(row);
      if (!mesInfo?.key?.startsWith('2025-')) return;

      const tipoMovimento = normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento);
      const cfop = String(row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '').trim();
      if (tipoMovimento !== 'devolucao' && cfop && !CFOP_FATURAMENTO_SET.has(cfop)) return;

      const filial = obterFilialFaturamento(row);
      if (filtroFilial2025 !== 'Todas' && filial !== filtroFilial2025) return;

      if (filtroCfops2025.length && tipoMovimento !== 'devolucao') {
        const cfop = String(row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '').trim();
        if (!cfop || !filtroCfops2025.includes(cfop)) return;
      }

      const valor = obterValorLiquido(row);
      const mesLabel = mesInfo.display || `${mesInfo.key.slice(5, 7)}/${mesInfo.key.slice(0, 4)}`;
      const atual = porMesMap.get(mesInfo.key) || { mes: mesLabel, ordem: mesInfo.key, valor: 0 };
      atual.valor += valor;
      porMesMap.set(mesInfo.key, atual);
    });

    return Array.from(porMesMap.values()).sort((a, b) => a.ordem.localeCompare(b.ordem));
  }, [faturamentoLinhas, filtroFilial2025, filtroCfops2025]);

  const mesesCustos = useMemo(() => {
    if (!custosData?.length) return [];
    const labels = new Set();
    custosData.forEach((item) => {
      Object.keys(item?.Valores || {}).forEach((rotulo) => {
        if (rotulo) labels.add(rotulo);
      });
    });
    const anosEncontrados = Array.from(labels)
      .map((rotulo) => Number(String(rotulo).match(/(20\d{2})/)?.[1] || 0))
      .filter(Boolean);
    const fallbackYear = anosEncontrados.length ? Math.max(...anosEncontrados) : new Date().getFullYear();
    return Array.from(labels)
      .map((rotulo) => formatarRotuloMesCusto(rotulo, fallbackYear))
      .filter((item) => item.raw)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [custosData]);

useEffect(() => {
  if (!mesesCustos.length) {
    if (custoFiltroMes) setCustoFiltroMes('');
    return;
  }
  if (!custoFiltroMes || !mesesCustos.some((item) => item.raw === custoFiltroMes)) {
    setCustoFiltroMes(mesesCustos[mesesCustos.length - 1].raw);
  }
}, [custoFiltroMes, mesesCustos]);

const mesCustoAtual = custoFiltroMes || (mesesCustos.length ? mesesCustos[mesesCustos.length - 1].raw : '');
const mesCustoAtualDisplay =
  mesesCustos.find((item) => item.raw === mesCustoAtual)?.display || mesCustoAtual;

const faturamentoComCustos = useMemo(
  () =>
    computeCostBreakdown({
      linhas: faturamentoAtual.linhas,
      produtoDescricaoMap,
      custosDiretos: custosData,
      custosDiretosAnoAnterior: custosPrevanoData,
      custosIndiretos: custosIndiretosData,
      mesCustoAtual,
      diasAtivos: faturamentoAtual.diasAtivos,
    }),
  [
    faturamentoAtual.linhas,
    faturamentoAtual.diasAtivos,
    produtoDescricaoMap,
    custosData,
    custosPrevanoData,
    custosIndiretosData,
    mesCustoAtual,
  ]
);

const totalCustosMes = faturamentoComCustos.total;

const margemPercentual = useMemo(() => {
  const total = faturamentoAtual.total;
  const custo = faturamentoComCustos.total;
  if (total <= 0) return 0;
  return ((total - custo) / total) * 100;
}, [faturamentoAtual.total, faturamentoComCustos.total]);

const markupPercentual = useMemo(() => {
  const custo = faturamentoComCustos.total;
  if (custo <= 0) return 0;
  return ((faturamentoAtual.total - custo) / custo) * 100;
}, [faturamentoAtual.total, faturamentoComCustos.total]);

const percentualCustoSobreFaturamento = useMemo(() => {
  const total = faturamentoAtual.total;
  if (total <= 0) return 0;
  return (totalCustosMes / total) * 100;
}, [faturamentoAtual.total, totalCustosMes]);

const custoMedioMovimento = useMemo(() => {
  const movimentos = faturamentoAtual.movimentos || 0;
  return movimentos > 0 ? totalCustosMes / movimentos : 0;
}, [faturamentoAtual.movimentos, totalCustosMes]);

const custoMedioDia = useMemo(() => {
  const dias = faturamentoAtual.diasAtivos || 0;
  return dias > 0 ? totalCustosMes / dias : 0;
}, [faturamentoAtual.diasAtivos, totalCustosMes]);

const itensCustosOrdenados = useMemo(() => {
  return (faturamentoComCustos.itens || [])
    .map((item) => ({
      ...item,
      margem: item.receita > 0 ? ((item.receita - item.custo) / item.receita) * 100 : 0,
      markup: item.custo > 0 ? ((item.receita - item.custo) / item.custo) * 100 : 0,
    }))
    .sort((a, b) => (b.receita - b.custo) - (a.receita - a.custo));
}, [faturamentoComCustos.itens]);

const resumoCustosIndiretos = useMemo(() => {
  if (!custosIndiretosData?.length) {
    return { total: 0, itens: [], top: [] };
  }
  const itens = custosIndiretosData.map((item) => {
    const total = Object.values(item.Valores || {}).reduce((acc, raw) => acc + parseValor(raw), 0);
    return { ...item, total };
  });
  const ordenados = itens.sort((a, b) => b.total - a.total);
  const top = ordenados.filter((item) => item.total > 0).slice(0, 3);
  const total = ordenados.reduce((acc, item) => acc + item.total, 0);
  return { total, itens: ordenados, top };
}, [custosIndiretosData]);

const totalDiretoPlanilhaAtual = useMemo(() => {
  if (!mesCustoAtual) return 0;
  return custosData.reduce((acc, item) => acc + obterValorPlanilhaPorMes(item?.Valores, mesCustoAtual), 0);
}, [custosData, mesCustoAtual]);

const totalDiretoPlanilhaPrev = useMemo(() => {
  if (!mesCustoAtual) return 0;
  return custosPrevanoData.reduce((acc, item) => acc + obterValorPlanilhaPorMes(item?.Valores, mesCustoAtual), 0);
}, [custosPrevanoData, mesCustoAtual]);

const variacaoDiretoPlanilha = useMemo(() => {
  if (!totalDiretoPlanilhaPrev) return 0;
  return ((totalDiretoPlanilhaAtual - totalDiretoPlanilhaPrev) / totalDiretoPlanilhaPrev) * 100;
}, [totalDiretoPlanilhaAtual, totalDiretoPlanilhaPrev]);

const custosBaseFiltravel = useMemo(() => {
  const normalizadas = (faturamentoLinhas || []).map((row) => {
    const mesInfo = obterMesKey(row);
    const codigo = row?.Codigo ?? row?.codigo ?? '';
    const cliente = row?.Cliente ?? row?.cliente ?? 'Sem cliente';
    const clienteCodigo = normalizarCodigoCliente(cliente);
    const clienteInfo = clienteCodigo ? clientesPorCodigo.get(clienteCodigo) : null;
    const descricao =
      normalizarDescricaoProduto(row?.Descricao ?? row?.descricao ?? '') ||
      produtoDescricaoMap.get(normalizarCodigoProduto(codigo)) ||
      '';
    return {
      cliente,
      clienteCodigo,
      clienteNome: clienteInfo?.Nome ?? clienteInfo?.nome ?? cliente,
      grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
      codigo,
      descricao,
      filial: obterFilialFaturamento(row),
      unidade: row?.Unidade ?? row?.unidade ?? '',
      nf: obterNumeroNota(row),
      quantidade: obterQuantidadeLiquida(row),
      valorTotal: obterValorLiquido(row),
      emissao: parseEmissaoData(row?.Emissao ?? row?.emissao),
      mesKey: mesInfo?.key || '',
      mesDisplay: mesInfo?.display || '',
      tipoMovimento: normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento),
      cfop: row?.CodFiscal ?? row?.codFiscal ?? row?.CFOP ?? row?.cfop ?? '',
    };
  });

  const meses = Array.from(new Set(normalizadas.map((row) => row.mesKey).filter(Boolean))).sort();
  const ultimoMesKey = meses.length ? meses[meses.length - 1] : '';
  const mesAtualKey =
    custoFiltroMesFaturamento && meses.includes(custoFiltroMesFaturamento)
      ? custoFiltroMesFaturamento
      : ultimoMesKey;
  const mesAtualDisplay = normalizadas.find((row) => row.mesKey === mesAtualKey)?.mesDisplay || '';
  const linhasMesAtual = mesAtualKey ? normalizadas.filter((row) => row.mesKey === mesAtualKey) : normalizadas;
  const mesesDisponiveis = meses.map((mesKey) => ({
    key: mesKey,
    display: normalizadas.find((row) => row.mesKey === mesKey)?.mesDisplay || mesKey,
  }));

  return {
    linhasTodas: normalizadas,
    linhasMesAtual,
    mesAtualKey,
    mesAtualDisplay,
    mesesDisponiveis,
  };
}, [faturamentoLinhas, clientesPorCodigo, produtoDescricaoMap, custoFiltroMesFaturamento]);

useEffect(() => {
  const mesesDisponiveis = custosBaseFiltravel.mesesDisponiveis || [];
  if (!mesesDisponiveis.length) {
    if (custoFiltroMesFaturamento) setCustoFiltroMesFaturamento('');
    return;
  }
  if (!custoFiltroMesFaturamento || !mesesDisponiveis.some((item) => item.key === custoFiltroMesFaturamento)) {
    setCustoFiltroMesFaturamento(mesesDisponiveis[mesesDisponiveis.length - 1].key);
  }
}, [custoFiltroMesFaturamento, custosBaseFiltravel.mesesDisponiveis]);

const custosPeriodoLabel = useMemo(() => {
  const periodoOperacao = custoPeriodoInicio || custoPeriodoFim
    ? [custoPeriodoInicio || 'inicio', custoPeriodoFim || 'fim'].join(' a ')
    : custosBaseFiltravel.mesAtualDisplay || 'Periodo atual';
  if (custoPeriodoInicio || custoPeriodoFim) {
    return mesCustoAtualDisplay ? `${periodoOperacao} · custo ${mesCustoAtualDisplay}` : periodoOperacao;
  }
  if (mesCustoAtualDisplay && periodoOperacao) {
    return `Fat. ${periodoOperacao} · Custo ${mesCustoAtualDisplay}`;
  }
  return periodoOperacao || mesCustoAtualDisplay || 'Periodo atual';
}, [custoPeriodoInicio, custoPeriodoFim, custosBaseFiltravel.mesAtualDisplay, mesCustoAtualDisplay]);

const custosLinhasPeriodo = useMemo(() => {
  const linhasBase =
    custoPeriodoInicio || custoPeriodoFim
      ? custosBaseFiltravel.linhasTodas
      : custosBaseFiltravel.linhasMesAtual;

  return linhasBase.filter((row) => {
    if (!row.emissao) return false;
    const dataISO = obterDataIsoUtc(row.emissao);
    if (custoPeriodoInicio && dataISO < custoPeriodoInicio) return false;
    if (custoPeriodoFim && dataISO > custoPeriodoFim) return false;
    return true;
  });
}, [custosBaseFiltravel, custoPeriodoInicio, custoPeriodoFim]);

const custosFiliaisDisponiveis = useMemo(
  () =>
    Array.from(
      new Set(custosLinhasPeriodo.map((row) => row.filial).filter((item) => item && item !== 'Sem filial'))
    ).sort((a, b) => String(a).localeCompare(String(b))),
  [custosLinhasPeriodo]
);

const custosGruposDisponiveis = useMemo(
  () =>
    Array.from(new Set(custosLinhasPeriodo.map((row) => row.grupo).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    ),
  [custosLinhasPeriodo]
);

useEffect(() => {
  if (custoFiltroFilial === 'Todas') return;
  if (custosFiliaisDisponiveis.includes(custoFiltroFilial)) return;
  setCustoFiltroFilial('Todas');
}, [custoFiltroFilial, custosFiliaisDisponiveis]);

useEffect(() => {
  if (custoFiltroGrupo === 'Todos') return;
  if (custosGruposDisponiveis.includes(custoFiltroGrupo)) return;
  setCustoFiltroGrupo('Todos');
}, [custoFiltroGrupo, custosGruposDisponiveis]);

const custosLinhasSemFiltroFonte = useMemo(() => {
  const skuBusca = normalizarTexto(custoFiltroSku);
  const clienteBusca = normalizarTexto(custoFiltroCliente);

  return custosLinhasPeriodo.filter((row) => {
    if (custoFiltroFilial !== 'Todas' && row.filial !== custoFiltroFilial) return false;
    if (custoFiltroGrupo !== 'Todos' && row.grupo !== custoFiltroGrupo) return false;
    if (
      skuBusca &&
      !normalizarTexto(`${row.codigo || ''} ${row.descricao || ''}`).includes(skuBusca)
    ) {
      return false;
    }
    if (
      clienteBusca &&
      !normalizarTexto(`${row.clienteNome || ''} ${row.cliente || ''}`).includes(clienteBusca)
    ) {
      return false;
    }
    return true;
  });
}, [
  custosLinhasPeriodo,
  custoFiltroFilial,
  custoFiltroGrupo,
  custoFiltroSku,
  custoFiltroCliente,
]);

const custosDiasAtivos = useMemo(
  () => new Set(custosLinhasSemFiltroFonte.map((row) => obterDataIsoUtc(row.emissao)).filter(Boolean)).size,
  [custosLinhasSemFiltroFonte]
);

const custosBreakdownBase = useMemo(
  () =>
    computeCostBreakdown({
      linhas: custosLinhasSemFiltroFonte,
      produtoDescricaoMap,
      custosDiretos: custosData,
      custosDiretosAnoAnterior: custosPrevanoData,
      custosIndiretos: custosIndiretosData,
      mesCustoAtual,
      diasAtivos: custosDiasAtivos,
    }),
  [
    custosLinhasSemFiltroFonte,
    produtoDescricaoMap,
    custosData,
    custosPrevanoData,
    custosIndiretosData,
    mesCustoAtual,
    custosDiasAtivos,
  ]
);

const custosItensFiltrados = useMemo(() => {
  if (custoFiltroFonte === 'Todas') return custosBreakdownBase.itens || [];
  return (custosBreakdownBase.itens || []).filter((item) => item.fonteDireto === custoFiltroFonte);
}, [custosBreakdownBase.itens, custoFiltroFonte]);

const custosSkuSelecionados = useMemo(
  () => new Set(custosItensFiltrados.map((item) => item.skuNormalized || normalizarCodigoProduto(item.codigo))),
  [custosItensFiltrados]
);

const custosLinhasFiltradas = useMemo(() => {
  if (custoFiltroFonte === 'Todas') return custosLinhasSemFiltroFonte;
  return custosLinhasSemFiltroFonte.filter((row) =>
    custosSkuSelecionados.has(normalizarCodigoProduto(row.codigo || ''))
  );
}, [custosLinhasSemFiltroFonte, custoFiltroFonte, custosSkuSelecionados]);

const custosItensOrdenados = useMemo(
  () =>
    [...custosItensFiltrados].sort((a, b) => {
      const resultadoA = (a.receita || 0) - (a.custo || 0);
      const resultadoB = (b.receita || 0) - (b.custo || 0);
      return resultadoB - resultadoA;
    }),
  [custosItensFiltrados]
);

const custosTotal = useMemo(
  () => custosItensFiltrados.reduce((acc, item) => acc + (item.custo || 0), 0),
  [custosItensFiltrados]
);

const custosReceitaTotal = useMemo(
  () => custosItensFiltrados.reduce((acc, item) => acc + (item.receita || 0), 0),
  [custosItensFiltrados]
);

const custosMargemPercentual = useMemo(() => {
  if (custosReceitaTotal <= 0) return 0;
  return ((custosReceitaTotal - custosTotal) / custosReceitaTotal) * 100;
}, [custosReceitaTotal, custosTotal]);

const custosMarkupPercentual = useMemo(() => {
  if (custosTotal <= 0) return 0;
  return ((custosReceitaTotal - custosTotal) / custosTotal) * 100;
}, [custosReceitaTotal, custosTotal]);

const custosPercentualSobreFaturamento = useMemo(() => {
  if (custosReceitaTotal <= 0) return 0;
  return (custosTotal / custosReceitaTotal) * 100;
}, [custosReceitaTotal, custosTotal]);

const custosMovimentos = custosLinhasFiltradas.length;

const custosCustoMedioMovimento = useMemo(
  () => (custosMovimentos > 0 ? custosTotal / custosMovimentos : 0),
  [custosMovimentos, custosTotal]
);

const custosCustoMedioDia = useMemo(
  () => (custosDiasAtivos > 0 ? custosTotal / custosDiasAtivos : 0),
  [custosDiasAtivos, custosTotal]
);

const custosTopItens = useMemo(
  () => [...custosItensFiltrados].sort((a, b) => (b.custo || 0) - (a.custo || 0)).slice(0, 10),
  [custosItensFiltrados]
);

const custosPioresMargens = useMemo(
  () =>
    custosItensFiltrados
      .filter((item) => (item.margem || 0) < 0)
      .sort((a, b) => (a.margem || 0) - (b.margem || 0))
      .slice(0, 10),
  [custosItensFiltrados]
);

const custosConfiabilidade = useMemo(() => {
  const counts = custosItensFiltrados.reduce(
    (acc, item) => {
      acc[item.fonteDireto] = (acc[item.fonteDireto] || 0) + 1;
      return acc;
    },
    { ATUAL: 0, FALLBACK_ANO_PASSADO: 0, TEORICO_PROXY: 0, SEM_CUSTO: 0 }
  );
  const total =
    counts.ATUAL + counts.FALLBACK_ANO_PASSADO + counts.TEORICO_PROXY + counts.SEM_CUSTO;
  if (!total) {
    return { total: 0, atual: 0, fallback: 0, proxy: 0, semCusto: 0 };
  }
  return {
    total,
    atual: (counts.ATUAL / total) * 100,
    fallback: (counts.FALLBACK_ANO_PASSADO / total) * 100,
    proxy: (counts.TEORICO_PROXY / total) * 100,
    semCusto: (counts.SEM_CUSTO / total) * 100,
  };
}, [custosItensFiltrados]);

const custosTotalDireto = useMemo(
  () => custosItensFiltrados.reduce((acc, item) => acc + (item.custoDireto || 0), 0),
  [custosItensFiltrados]
);

const custosTotalIndireto = useMemo(
  () => custosItensFiltrados.reduce((acc, item) => acc + (item.cifRateado || 0), 0),
  [custosItensFiltrados]
);

const custosPercentualDireto = useMemo(
  () => (custosTotal > 0 ? (custosTotalDireto / custosTotal) * 100 : 0),
  [custosTotalDireto, custosTotal]
);

const custosPercentualIndireto = useMemo(
  () => (custosTotal > 0 ? (custosTotalIndireto / custosTotal) * 100 : 0),
  [custosTotalIndireto, custosTotal]
);

const custosDiretoAtualSelecionado = useMemo(
  () =>
    custosItensFiltrados.reduce(
      (acc, item) => acc + ((item.custoDiretoAtualValor || 0) * (item.quantidade || 0)),
      0
    ),
  [custosItensFiltrados]
);

const custosDiretoPrevSelecionado = useMemo(
  () =>
    custosItensFiltrados.reduce(
      (acc, item) => acc + ((item.custoDiretoPrevValor || 0) * (item.quantidade || 0)),
      0
    ),
  [custosItensFiltrados]
);

const custosVariacaoDiretoSelecionado = useMemo(() => {
  if (!custosDiretoPrevSelecionado) return 0;
  return ((custosDiretoAtualSelecionado - custosDiretoPrevSelecionado) / custosDiretoPrevSelecionado) * 100;
}, [custosDiretoAtualSelecionado, custosDiretoPrevSelecionado]);

const custosImpactoResultado = useMemo(
  () =>
    [...custosItensFiltrados]
      .map((item) => ({
        ...item,
        impactoResultado: (item.receita || 0) - (item.custo || 0),
        impactoAbsoluto: Math.abs((item.receita || 0) - (item.custo || 0)),
      }))
      .sort((a, b) => b.impactoAbsoluto - a.impactoAbsoluto)
      .slice(0, 10),
  [custosItensFiltrados]
);

const custosCurvaAbc = useMemo(() => {
  const ordenados = [...custosItensFiltrados].sort((a, b) => (b.custo || 0) - (a.custo || 0));
  if (!ordenados.length || custosTotal <= 0) {
    return {
      itens: [],
      resumo: {
        A: { total: 0, quantidade: 0, percentual: 0 },
        B: { total: 0, quantidade: 0, percentual: 0 },
        C: { total: 0, quantidade: 0, percentual: 0 },
      },
    };
  }

  let acumulado = 0;
  const resumo = {
    A: { total: 0, quantidade: 0, percentual: 0 },
    B: { total: 0, quantidade: 0, percentual: 0 },
    C: { total: 0, quantidade: 0, percentual: 0 },
  };

  const itens = ordenados.map((item) => {
    acumulado += item.custo || 0;
    const percentualAcumulado = (acumulado / custosTotal) * 100;
    const classe = percentualAcumulado <= 80 ? 'A' : percentualAcumulado <= 95 ? 'B' : 'C';
    resumo[classe].total += item.custo || 0;
    resumo[classe].quantidade += 1;
    return {
      ...item,
      classeAbc: classe,
      percentualCusto: custosTotal > 0 ? ((item.custo || 0) / custosTotal) * 100 : 0,
      percentualAcumulado,
    };
  });

  Object.keys(resumo).forEach((classe) => {
    resumo[classe].percentual = custosTotal > 0 ? (resumo[classe].total / custosTotal) * 100 : 0;
  });

  return { itens, resumo };
}, [custosItensFiltrados, custosTotal]);

const custosSemCustoTop = useMemo(
  () =>
    custosItensFiltrados
      .filter((item) => item.fonteDireto === 'SEM_CUSTO')
      .sort((a, b) => (b.receita || 0) - (a.receita || 0))
      .slice(0, 20)
      .map((item) => ({
        codigo: item.codigo || item.skuNormalized,
        descricao: item.descricao,
        receita: item.receita,
      })),
  [custosItensFiltrados]
);

const totalDiretoMes = faturamentoComCustos.summary?.totalDirect || 0;
const totalIndiretoMes = faturamentoComCustos.summary?.cifTotal || 0;

const percentualDireto = useMemo(() => {
  if (totalCustosMes <= 0) return 0;
  return (totalDiretoMes / totalCustosMes) * 100;
}, [totalDiretoMes, totalCustosMes]);

const percentualIndireto = useMemo(() => {
  if (totalCustosMes <= 0) return 0;
  return (totalIndiretoMes / totalCustosMes) * 100;
}, [totalIndiretoMes, totalCustosMes]);

const topCustoItens = useMemo(() => {
  return [...itensCustosOrdenados]
    .sort((a, b) => b.custo - a.custo)
    .slice(0, 10);
}, [itensCustosOrdenados]);

const pioresMargens = useMemo(() => {
  return itensCustosOrdenados
    .filter((item) => item.margem < 0)
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 10);
}, [itensCustosOrdenados]);

const semCustoTop = useMemo(
  () => faturamentoComCustos.summary?.semCustoTop || [],
  [faturamentoComCustos.summary]
);

const confiabilidadeCustos = useMemo(() => {
  const counts = faturamentoComCustos.summary?.counts || {};
  const total =
    (counts.ATUAL || 0) +
    (counts.FALLBACK_ANO_PASSADO || 0) +
    (counts.TEORICO_PROXY || 0) +
    (counts.SEM_CUSTO || 0);
  if (!total) {
    return {
      total: 0,
      atual: 0,
      fallback: 0,
      proxy: 0,
      semCusto: 0,
    };
  }
  return {
    total,
    atual: ((counts.ATUAL || 0) / total) * 100,
    fallback: ((counts.FALLBACK_ANO_PASSADO || 0) / total) * 100,
    proxy: ((counts.TEORICO_PROXY || 0) / total) * 100,
    semCusto: ((counts.SEM_CUSTO || 0) / total) * 100,
  };
}, [faturamentoComCustos.summary]);

const exportCustosDisponivel = custosItensOrdenados.length > 0;

const handleExportarCustosExcel = () => {
  if (!custosItensOrdenados.length) return;

  const linhasExport = custosItensOrdenados.map((item) => ({
    SKU: item.codigo || '',
    Descricao: item.descricao || '',
    Quantidade: item.quantidade ?? 0,
    Receita: item.receita ?? 0,
    PrecoMedio: item.quantidade ? item.receita / item.quantidade : 0,
    CustoTotal: item.custo ?? 0,
    CustoUnitario: item.quantidade ? item.custo / item.quantidade : 0,
    CustoDireto: item.custoDireto ?? 0,
    CifTotal: item.cifRateado ?? 0,
    FonteDireto: item.fonteDireto || '',
    MargemPercentual: Number.isFinite(item.margem) ? Number(item.margem.toFixed(2)) : 0,
    MarkupPercentual: Number.isFinite(item.markup) ? Number(item.markup.toFixed(2)) : 0,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhasExport);
  XLSX.utils.book_append_sheet(wb, ws, 'Custos por SKU');

  const periodo = String(custosPeriodoLabel || 'atual')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
  XLSX.writeFile(wb, `custos_por_sku_${periodo}.xlsx`);
};

const handleExportarCustosPdf = () => {
  if (!custosItensOrdenados.length) return;

  const now = new Date();
  const periodo = custosPeriodoLabel || 'Planilha atual';
  const linhasHtml = custosItensOrdenados
    .map(
      (item) => `
        <tr>
          <td>${escapeHtmlRelatorio(item.codigo || '-')}</td>
          <td>${escapeHtmlRelatorio(item.descricao || 'Sem descricao')}</td>
          <td class="num">${escapeHtmlRelatorio(item.quantidade ? Math.round(item.quantidade) : 0)}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.receita))}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.quantidade ? item.receita / item.quantidade : 0))}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.custo))}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.quantidade ? item.custo / item.quantidade : 0))}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.custoDireto))}</td>
          <td class="num">${escapeHtmlRelatorio(formatarMoeda(item.cifRateado))}</td>
          <td>${escapeHtmlRelatorio(item.fonteDireto || '-')}</td>
          <td class="num">${escapeHtmlRelatorio(Number.isFinite(item.margem) ? `${item.margem.toFixed(1)}%` : '-')}</td>
          <td class="num">${escapeHtmlRelatorio(Number.isFinite(item.markup) ? `${item.markup.toFixed(1)}%` : '-')}</td>
        </tr>
      `
    )
    .join('');

  const html = `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Custos por SKU</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
        .page { padding: 24px; }
        .header { background: linear-gradient(120deg, #0f172a, #1e293b); color: #f8fafc; padding: 20px 24px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand img { height: 40px; width: auto; }
        .brand small { display: block; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #94a3b8; }
        h1 { font-size: 22px; margin: 0; }
        .meta { font-size: 11px; color: #cbd5e1; text-align: right; }
        .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .card { background: #ffffff; border-radius: 14px; padding: 12px 14px; border: 1px solid #e2e8f0; }
        .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: #64748b; }
        .card .value { margin-top: 6px; font-size: 15px; font-weight: 700; color: #0f172a; }
        .table-wrap { margin-top: 18px; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
        th { background: #e2e8f0; color: #334155; text-transform: uppercase; letter-spacing: 0.14em; font-size: 9px; }
        td.num, th.num { text-align: right; }
        tr:nth-child(even) td { background: #f8fafc; }
        tr:last-child td { border-bottom: none; }
        .footer { margin-top: 14px; text-align: right; font-size: 10px; color: #64748b; }
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body { background: #fff; }
          .page { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="brand">
            <img src="${escapeHtmlRelatorio(logoMetalosa)}" alt="Metalosa" />
            <div>
              <small>Relatorio de custos</small>
              <h1>Custos por SKU</h1>
            </div>
          </div>
          <div class="meta">
            <div>Base ${escapeHtmlRelatorio(periodo)}</div>
            <div>Gerado em ${escapeHtmlRelatorio(formatDateTimeRelatorio(now))}</div>
          </div>
        </div>

        <div class="summary">
          <div class="card">
            <div class="label">SKUs listados</div>
            <div class="value">${escapeHtmlRelatorio(custosItensOrdenados.length)}</div>
          </div>
          <div class="card">
            <div class="label">Total de custos</div>
            <div class="value">${escapeHtmlRelatorio(formatarMoeda(custosTotal))}</div>
          </div>
          <div class="card">
            <div class="label">Custo / movimento</div>
            <div class="value">${escapeHtmlRelatorio(formatarMoeda(custosCustoMedioMovimento))}</div>
          </div>
          <div class="card">
            <div class="label">% custo faturamento</div>
            <div class="value">${escapeHtmlRelatorio(`${custosPercentualSobreFaturamento.toFixed(1)}%`)}</div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descricao</th>
                <th class="num">Qtd</th>
                <th class="num">Receita</th>
                <th class="num">Preco medio</th>
                <th class="num">Custo</th>
                <th class="num">Custo unit.</th>
                <th class="num">Direto</th>
                <th class="num">CIF total</th>
                <th>Fonte</th>
                <th class="num">Margem</th>
                <th class="num">Markup</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>
        </div>

        <div class="footer">Metalosa · Custos</div>
      </div>
    </body>
    </html>
  `;

  printHtmlRelatorio(html);
};

const clientesLookup = useMemo(() => {
  const map = new Map();
  (clientesData?.clientes || []).forEach((cliente) => {
    const codigo = normalizarCodigoCliente(cliente.Codigo);
    if (!codigo) return;
    map.set(codigo, {
      nome: cliente.Nome || '',
      estado: cliente.Estado || '',
      municipio: cliente.Municipio || '',
    });
  });
  return map;
}, [clientesData]);

const obterInfoCliente = (clienteRaw) => {
  const codigo = normalizarCodigoCliente(clienteRaw || '');
  const info = clientesLookup.get(codigo);
  return {
    nome: info?.nome || clienteRaw || 'Sem cliente',
    local: info?.municipio ? `${info.municipio} / ${info.estado}` : '',
  };
};
const custoDetalheLinhas = useMemo(() => {
  if (!custoDetalheItem) return [];
  const alvo = normalizarCodigoProduto(custoDetalheItem.codigo || custoDetalheItem.skuNormalized || '');
  if (!alvo) return [];
  return custosLinhasFiltradas.filter(
    (row) => normalizarCodigoProduto(row.codigo || '') === alvo
  );
}, [custoDetalheItem, custosLinhasFiltradas]);

const custoDetalhePedidos = useMemo(() => {
  if (!custoDetalheLinhas.length) return [];
  const pedidos = new Map();
  custoDetalheLinhas.forEach((row) => {
    const nf = String(row.nf || 'Sem NF');
    const infoCliente = obterInfoCliente(row.cliente);
    if (!pedidos.has(nf)) {
      pedidos.set(nf, {
        nf,
        cliente: infoCliente.nome,
        clienteLocal: infoCliente.local,
        filial: row.filial || '-',
        data: row.emissao ? row.emissao.toLocaleDateString('pt-BR') : 'Sem data',
        quantidade: 0,
        valor: 0,
      });
    }
    const atual = pedidos.get(nf);
    atual.quantidade += Number.isFinite(row.quantidade) ? row.quantidade : 0;
    atual.valor += Number.isFinite(row.valorTotal) ? row.valorTotal : 0;
  });
  return Array.from(pedidos.values()).sort((a, b) => b.valor - a.valor);
}, [custoDetalheLinhas, clientesLookup]);

const custoDetalhePedidosLinhas = useMemo(() => {
  const map = new Map();
  if (!custoDetalheLinhas.length) return map;
  custoDetalheLinhas.forEach((linha) => {
    const nf = String(linha.nf || 'Sem NF');
    if (!map.has(nf)) {
      map.set(nf, []);
    }
    map.get(nf).push(linha);
  });
  return map;
}, [custoDetalheLinhas]);

const custosPorSkuMap = useMemo(() => {
  const map = new Map();
  custosItensOrdenados.forEach((item) => {
    const codigo = normalizarCodigoProduto(item.codigo || item.skuNormalized || '');
    if (!codigo) return;
    map.set(codigo, {
      ...item,
      custoUnit: item.quantidade ? item.custo / item.quantidade : 0,
    });
  });
  return map;
}, [custosItensOrdenados]);

const handleSeedBensFirestore = async () => {
  if (!isAllowedDomain || !authUser) {
    setBensSeedError('Sem permissao para importar bens.');
    return;
  }
  if (!maquinasBaseData.length) {
    setBensSeedError('Base local de ativos vazia ou nao carregada.');
    return;
  }
  setBensSeedError('');
  setBensSeedLoading(true);
  try {
    // Apaga todos os docs existentes na coleção maquinas
    const snapExistente = await getDocs(collection(db, 'maquinas'));
    const chunkSizeDel = 450;
    const docsDel = snapExistente.docs;
    for (let i = 0; i < docsDel.length; i += chunkSizeDel) {
      const batch = writeBatch(db);
      docsDel.slice(i, i + chunkSizeDel).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const maquinas = maquinasBaseData.map((item) => ({ ...item }));
    const setores = setoresBaseData.filter(Boolean);

    const chunkSize = 450;
    for (let i = 0; i < maquinas.length; i += chunkSize) {
      const batch = writeBatch(db);
      const slice = maquinas.slice(i, i + chunkSize);
      slice.forEach((item) => {
        batch.set(doc(db, 'maquinas', item.id), item);
      });
      await batch.commit();
    }

    if (setores.length) {
      const batch = writeBatch(db);
      setores.forEach((setor) => {
        batch.set(doc(db, 'setores', normalizarIdFirestore(setor)), { nome: setor }, { merge: true });
      });
      await batch.commit();
    }

    await setDoc(
      doc(db, 'seeds', 'bens_v1'),
      {
        updatedAt: new Date().toISOString(),
        totalMaquinas: maquinas.length,
        totalSetores: setores.length,
      },
      { merge: true }
    );

    const novoMap = new Map();
    maquinas.forEach((item) => novoMap.set(item.id, item));
    const merged = Array.from(novoMap.values());
    merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    setListaMaquinas(merged);

    const setoresMerged = Array.from(new Set([...setores]))
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
    setListaSetores(setoresMerged);

    setBensSeedDone(true);
  } catch (err) {
    setBensSeedError('Nao foi possivel importar os bens no Firebase.');
  } finally {
    setBensSeedLoading(false);
  }
};

const custoDetalheMargemNegativa = (custoDetalheItem?.margem ?? 0) < 0;
const custoDetalheTitulo = custoDetalheItem
  ? custoDetalheMargemNegativa
    ? 'Margem negativa'
    : 'Margem positiva'
  : 'Detalhamento de margem';

  const municipiosBounds = useMemo(() => {
    if (faturamentoAtual.municipiosMapa.length === 0) return null;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    faturamentoAtual.municipiosMapa.forEach((item) => {
      minLat = Math.min(minLat, item.lat);
      maxLat = Math.max(maxLat, item.lat);
      minLng = Math.min(minLng, item.lng);
      maxLng = Math.max(maxLng, item.lng);
    });
    if (minLat === 90) return null;
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [faturamentoAtual.municipiosMapa]);

  useEffect(() => {
    if (!mapModalOpen || !mapModalInstance) return;
    setTimeout(() => {
      mapModalInstance.invalidateSize();
      if (municipiosBounds) {
        mapModalInstance.fitBounds(municipiosBounds, { padding: [24, 24], maxZoom: 9 });
      }
    }, 0);
  }, [mapModalOpen, mapModalInstance, municipiosBounds]);

  const renderMapaMunicipio = (containerClass, options = {}) => {
    const { zoomControl = false, onMapReady = null } = options;
    if (faturamentoAtual.municipiosMapa.length === 0) {
      return <p className="text-xs text-slate-400 italic">Sem dados por municipio.</p>;
    }
    const maxValor = Math.max(...faturamentoAtual.municipiosMapa.map((item) => item.valor), 1);

    return (
      <div className={containerClass}>
        <MapContainer
          className="map-base"
          key={municipiosBounds ? municipiosBounds.flat().join(',') : 'brasil'}
          center={[-14.235, -51.9253]}
          zoom={5}
          bounds={municipiosBounds || undefined}
          boundsOptions={{ padding: [24, 24], maxZoom: 9 }}
          zoomControl={zoomControl}
          scrollWheelZoom={false}
          whenCreated={onMapReady || undefined}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {faturamentoAtual.municipiosMapa.map((item) => {
            const escala = Math.sqrt(item.valor / maxValor);
            const radius = 6 + Math.min(12, escala * 12);
            const clientesBase = item.topClientes || [];
            const clientesTooltip = clientesBase.slice(0, 10);
            return (
              <CircleMarker
                key={`${item.municipio}-${item.estado}`}
                center={[item.lat, item.lng]}
                radius={radius}
                pathOptions={{ color: '#22c55e', weight: 1, fillColor: '#22c55e', fillOpacity: 0.6 }}
              >
                <Tooltip direction="top" opacity={1} className="map-tooltip">
                  <div className="text-[11px] font-semibold text-slate-100">
                    {item.municipio} / {item.estado}
                  </div>
                  <div className="text-[10px] text-slate-200">
                    Total: R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  {clientesTooltip.length > 0 && (
                    <div className="mt-2 text-[10px] leading-4 text-slate-300 max-w-[260px] cliente-list">
                      {clientesTooltip.map((cliente, index) => (
                        <div key={`${cliente.nome}-${index}`} className="cliente-item">
                          {cliente.nome}: R$ {cliente.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      ))}
                    </div>
                  )}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    );
  };

  const renderMapaMunicipioDados = (municipiosMapa, bounds, containerClass, options = {}) => {
    const { zoomControl = false } = options;
    if (!municipiosMapa.length) {
      return <p className="text-xs text-slate-500 italic">Sem dados por municipio.</p>;
    }
    const maxValor = Math.max(...municipiosMapa.map((item) => item.valor), 1);

    return (
      <div className={containerClass}>
        <MapContainer
          className="map-base"
          key={bounds ? bounds.flat().join(',') : 'brasil'}
          center={[-14.235, -51.9253]}
          zoom={5}
          bounds={bounds || undefined}
          boundsOptions={{ padding: [24, 24], maxZoom: 9 }}
          zoomControl={zoomControl}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {municipiosMapa.map((item) => {
            const escala = Math.sqrt(item.valor / maxValor);
            const radius = 6 + Math.min(12, escala * 12);
            const clientesBase = item.topClientes || [];
            const clientesTooltip = clientesBase.slice(0, 10);
            return (
              <CircleMarker
                key={`${item.municipio}-${item.uf}`}
                center={[item.lat, item.lng]}
                radius={radius}
                pathOptions={{ color: '#22c55e', weight: 1, fillColor: '#22c55e', fillOpacity: 0.6 }}
              >
                <Tooltip direction="top" opacity={1} className="map-tooltip">
                  <div className="text-[11px] font-semibold text-slate-100">
                    {item.municipio} / {item.uf}
                  </div>
                  <div className="text-[10px] text-slate-200">
                    Total: R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  {clientesTooltip.length > 0 && (
                    <div className="mt-2 text-[10px] leading-4 text-slate-300 max-w-[260px] cliente-list">
                      {clientesTooltip.map((cliente, index) => (
                        <div key={`${cliente.nome}-${index}`} className="cliente-item">
                          {cliente.nome}: R$ {cliente.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      ))}
                    </div>
                  )}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    );
  };


  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-sm font-bold tracking-widest text-slate-400">Carregando...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <form onSubmit={handleLoginSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl space-y-4">
          <div>
            <h1 className="text-xl font-black text-white">Login</h1>
            <p className="text-xs text-slate-400">Use seu acesso do Firebase Auth</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">Email</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="usuario@metalosa.com.br"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">Senha</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="********"
              required
            />
          </div>
          {loginError && <div className="text-xs text-rose-400">{loginError}</div>}
          <button type="submit" className="w-full rounded-lg bg-blue-600 text-white text-xs font-bold py-2 hover:bg-blue-500">Entrar</button>
        </form>
      </div>
    );
  }

  if (!isAllowedDomain) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl space-y-4">
          <div>
            <h1 className="text-xl font-black text-white">Sem permissao</h1>
            <p className="text-xs text-slate-400">
              Use um email @metalosa.com.br para acessar o painel.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Factory size={48} className="mx-auto text-blue-600 animate-bounce mb-4" />
          <p className="font-bold text-slate-600 tracking-wider">CARREGANDO DADOS ERP...</p>
        </div>
      </div>
    );
  }

  if (showMobileIntro) {
    const introLinhas = isManutencaoOnly
      ? [
          'Voce e responsavel por abrir as OS.',
          'Informe ativo, setor, prioridade e descreva o problema.',
          'Anexe fotos quando necessario e salve para entrar na fila.',
        ]
      : [
          'Abra ou assuma uma OS e confirme o ativo correto.',
          'Registre status, tempo e materiais em cada etapa.',
          'Finalize apenas quando o equipamento estiver liberado.',
        ];
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <img
              src={logoMetalosa}
              alt="Metalosa"
              className="h-16 w-16 object-contain brightness-0 invert"
            />
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Manutencao</p>
              <h1 className="text-lg font-black text-white">Bem-vindo, {nomeBoasVindas}</h1>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-sm text-slate-300">
              {isManutencaoOnly
                ? 'Seu perfil e o ponto de partida do processo. Aqui vai um guia rapido para abrir as OS corretamente.'
                : 'Vamos fazer um check-in rapido para garantir registros claros e evitar retrabalho.'}
            </p>
          </div>
          <div className="space-y-3 text-sm text-slate-300">
            {introLinhas.map((texto, index) => (
              <div key={texto} className="flex gap-3">
                <span className="text-blue-300 font-bold">{index + 1}.</span>
                <span>{texto}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleMobileIntroContinue}
            className="w-full rounded-lg bg-blue-600 text-white text-xs font-bold py-2 hover:bg-blue-500"
          >
            Entrar no app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-dark flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {mapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Mapa por municipio</h3>
              <button
                type="button"
                onClick={() => setMapModalOpen(false)}
                className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200"
              >
                Fechar
              </button>
            </div>
            {renderMapaMunicipio('h-[70vh] overflow-hidden rounded-xl border border-slate-100', {
              zoomControl: true,
              onMapReady: setMapModalInstance,
            })}
          </div>
        </div>
      )}

      {modalLancamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Lancamento de faltas</p>
                <p className="text-lg font-bold text-slate-800">{modalLancamento.nome}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {modalLancamento.setor} ? {modalLancamento.gestor} ? {dataLancamento}
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModalLancamento}
                className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-bold">
              {['Presente', 'Falta Justificada', 'Falta Injustificada', 'Falta Parcial'].map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => {
                    setModalTipo(tipo);
                    if (tipo === 'Falta Parcial' && !modalTempo) {
                      setModalTempo('02:00');
                    }
                    setModalErro('');
                  }}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    modalTipo === tipo
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>

            {modalTipo === 'Falta Parcial' && (
              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Tempo de falta
                </label>
                <input
                  value={modalTempo}
                  onChange={(e) => setModalTempo(e.target.value)}
                  placeholder="02:00"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                />
              </div>
            )}

            {modalErro && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {modalErro}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={fecharModalLancamento}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarModalLancamento}
                className="rounded-full bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFeriasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Lancar ferias</p>
                <p className="text-lg font-bold text-slate-800">Periodo de ferias</p>
              </div>
              <button
                type="button"
                onClick={fecharModalFerias}
                className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Colaborador
                </label>
                <select
                  value={feriasColaboradorId}
                  onChange={(e) => setFeriasColaboradorId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  <option value="">Selecione...</option>
                  {colaboradores
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome))
                    .map((colab) => (
                      <option key={colab.id} value={colab.id}>
                        {colab.nome} ({colab.setor})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Data inicio
                  </label>
                  <input
                    type="date"
                    value={feriasInicio}
                    onChange={(e) => setFeriasInicio(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Data fim
                  </label>
                  <input
                    type="date"
                    value={feriasFim}
                    onChange={(e) => setFeriasFim(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                </div>
              </div>
            </div>

            {feriasErro && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {feriasErro}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={fecharModalFerias}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarFerias}
                className="rounded-full bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalTabelaCustosOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/95 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Detalhamento</p>
                <p className="text-lg font-bold text-white">Custos por SKU</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportarCustosExcel}
                  disabled={!exportCustosDisponivel}
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                    exportCustosDisponivel
                      ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400 hover:text-white'
                      : 'border-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Baixar Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportarCustosPdf}
                  disabled={!exportCustosDisponivel}
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                    exportCustosDisponivel
                      ? 'border-sky-500/70 bg-sky-500/10 text-sky-200 hover:border-sky-400 hover:text-white'
                      : 'border-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Baixar PDF
                </button>
                <button
                  type="button"
                  onClick={() => setModalTabelaCustosOpen(false)}
                  className="rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="p-6">
              {custosItensOrdenados.length ? (
                <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="min-w-[1100px]">
                    <div className="sticky top-0 z-10 grid grid-cols-[90px_1fr_60px_90px_80px_80px_80px_80px_80px_90px_70px_70px] items-center border-b border-slate-800 bg-slate-950/90 px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-slate-500 backdrop-blur">
                      <span>SKU</span>
                      <span>Descricao</span>
                      <span className="text-right">Qtd</span>
                      <span className="text-right">Receita</span>
                      <span className="text-right">Preco medio</span>
                      <span className="text-right">Custo</span>
                      <span className="text-right">Custo unit</span>
                      <span className="text-right">Direto</span>
                      <span className="text-right">CIF total</span>
                      <span className="text-right">Fonte</span>
                      <span className="text-right">Margem</span>
                      <span className="text-right">Markup</span>
                    </div>
                    <div className="space-y-3 px-3 py-3">
                      {custosItensOrdenados.map((item) => (
                        <div
                          key={`${item.codigo}-${item.descricao}`}
                          className="grid grid-cols-[90px_1fr_60px_90px_80px_80px_80px_80px_80px_90px_70px_70px] items-center text-[11px] text-slate-200"
                        >
                          <span className="text-slate-100">{item.codigo || '-'}</span>
                          <span className="text-slate-400">{item.descricao || 'Sem descricao'}</span>
                          <span className="text-right">{item.quantidade ? Math.round(item.quantidade) : 0}</span>
                          <span className="text-right text-emerald-300">{formatarMoeda(item.receita)}</span>
                          <span className="text-right text-emerald-200">
                            {formatarMoeda(item.quantidade ? item.receita / item.quantidade : 0)}
                          </span>
                          <span className="text-right text-emerald-400">{formatarMoeda(item.custo)}</span>
                          <span className="text-right text-slate-200">
                            {formatarMoeda(item.quantidade ? item.custo / item.quantidade : 0)}
                          </span>
                          <span className="text-right text-slate-300">{formatarMoeda(item.custoDireto)}</span>
                          <span className="text-right text-slate-300">{formatarMoeda(item.cifRateado)}</span>
                          <span className="text-right text-slate-400">{item.fonteDireto || '-'}</span>
                          <span className="text-right">{item.margem.toFixed(1)}%</span>
                          <span className="text-right">{item.markup.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Ainda não há dados de custos para mostrar.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {custoDetalheModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/95 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Detalhamento</p>
                <p className="text-lg font-bold text-white">{custoDetalheTitulo}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalTabelaCustosOpen(true);
                    setCustoDetalheModalOpen(false);
                    setCustoDetalheItem(null);
                    setCustoDetalhePedidoModalOpen(false);
                    setCustoDetalhePedidoSelecionado(null);
                  }}
                  className="rounded-full border border-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
                >
                  Custos por SKU
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustoDetalheModalOpen(false);
                    setCustoDetalheItem(null);
                    setCustoDetalhePedidoModalOpen(false);
                    setCustoDetalhePedidoSelecionado(null);
                  }}
                  className="rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {custoDetalheItem ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-wider text-slate-400">SKU</p>
                      <p className="text-lg font-bold text-white">{custoDetalheItem.codigo || '-'}</p>
                      <p className="text-xs text-slate-400">{custoDetalheItem.descricao || 'Sem descricao'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-wider text-slate-400">Resumo</p>
                      <p className="text-sm text-slate-200">Receita {formatarMoeda(custoDetalheItem.receita)}</p>
                      <p className="text-sm text-slate-200">Custo {formatarMoeda(custoDetalheItem.custo)}</p>
                      <p className="text-sm text-slate-200">
                        Preco medio{' '}
                        {formatarMoeda(
                          custoDetalheItem.quantidade ? custoDetalheItem.receita / custoDetalheItem.quantidade : 0
                        )}
                      </p>
                      <p className={`text-sm ${custoDetalheMargemNegativa ? 'text-rose-300' : 'text-emerald-300'}`}>
                        Margem {custoDetalheItem.margem.toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-wider text-slate-400">Composicao</p>
                      <p className="text-sm text-slate-200">Direto {formatarMoeda(custoDetalheItem.custoDireto)}</p>
                      <p className="text-sm text-slate-200">CIF {formatarMoeda(custoDetalheItem.cifRateado)}</p>
                      <p className="text-sm text-slate-400">Fonte {custoDetalheItem.fonteDireto || '-'}</p>
                    </div>
                  </div>

                                                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Pedidos (NF)</p>
                        <p className="text-[11px] text-slate-500">Agrupado por nota fiscal</p>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {custoDetalhePedidos.length} pedido(s)
                      </span>
                    </div>
                    {custoDetalhePedidos.length ? (
                      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                        <div className="grid grid-cols-[110px_1fr_90px_80px_80px_90px_90px_90px] items-center px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                          <span>NF</span>
                          <span>Cliente</span>
                          <span className="text-right">Data</span>
                          <span className="text-right">Filial</span>
                          <span className="text-right">Qtd</span>
                          <span className="text-right">Valor</span>
                          <span className="text-right">Preco medio</span>
                          <span className="text-right">Detalhe</span>
                        </div>
                        <div className="divide-y divide-slate-800">
                          {custoDetalhePedidos.map((pedido) => (
                            (() => {
                              const linhasPedido = custoDetalhePedidosLinhas.get(String(pedido.nf || 'Sem NF')) || [];
                              const temMargemBaixa = linhasPedido.some((linha) => {
                                const skuKey = normalizarCodigoProduto(linha.codigo || '');
                                const skuInfo = skuKey ? custosPorSkuMap.get(skuKey) : null;
                                return Number.isFinite(skuInfo?.margem) ? skuInfo.margem < 20 : false;
                              });
                              return (
                            <div
                              key={`${pedido.nf}-${pedido.cliente}`}
                              className={`grid grid-cols-[110px_1fr_90px_80px_80px_90px_90px_90px] items-center px-3 py-2 text-[11px] text-slate-200 ${temMargemBaixa ? 'bg-amber-500/10' : ''}`}
                            >
                              <span className="text-slate-100">{pedido.nf}</span>
                              <div className="text-slate-400">
                                <div className="text-slate-200">{pedido.cliente}</div>
                                {pedido.clienteLocal ? (
                                  <div className="text-[10px] text-slate-500">{pedido.clienteLocal}</div>
                                ) : null}
                              </div>
                              <span className="text-right text-slate-400">{pedido.data}</span>
                              <span className="text-right text-slate-400">{pedido.filial}</span>
                              <span className="text-right">{Math.round(pedido.quantidade)}</span>
                              <span className="text-right text-emerald-300">{formatarMoeda(pedido.valor)}</span>
                              <span className="text-right text-emerald-200">
                                {formatarMoeda(pedido.quantidade ? pedido.valor / pedido.quantidade : 0)}
                              </span>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const linhas = linhasPedido;
                                    setCustoDetalhePedidoSelecionado({
                                      ...pedido,
                                      linhas,
                                    });
                                    setCustoDetalhePedidoModalOpen(true);
                                  }}
                                  className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
                                >
                                  Detalhar
                                </button>
                              </div>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-400">Sem pedidos encontrados para este SKU.</p>
                    )}
                  </div>

                </>
              ) : (
                <p className="text-sm text-slate-400">Selecione um item para ver detalhes.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {custoDetalhePedidoModalOpen && custoDetalhePedidoSelecionado && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/95 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Detalhe do pedido</p>
                <p className="text-lg font-bold text-white">NF {custoDetalhePedidoSelecionado.nf}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustoDetalhePedidoModalOpen(false);
                  setCustoDetalhePedidoSelecionado(null);
                }}
                className="rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Fechar
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <div>
                    <div className="text-slate-200 font-semibold">{custoDetalhePedidoSelecionado.cliente}</div>
                    {custoDetalhePedidoSelecionado.clienteLocal ? (
                      <div className="text-[10px] text-slate-500">{custoDetalhePedidoSelecionado.clienteLocal}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <span>Data {custoDetalhePedidoSelecionado.data}</span>
                    <span>Filial {custoDetalhePedidoSelecionado.filial}</span>
                    <span>Qtd {Math.round(custoDetalhePedidoSelecionado.quantidade)}</span>
                    <span className="text-emerald-300 font-semibold">
                      {formatarMoeda(custoDetalhePedidoSelecionado.valor)}
                    </span>
                  </div>
                </div>
              </div>

              {custoDetalhePedidoSelecionado.linhas?.length ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="grid grid-cols-[90px_1fr_70px_90px_90px_90px_70px_70px] items-center px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                    <span>SKU</span>
                    <span>Descricao</span>
                    <span className="text-right">Qtd</span>
                    <span className="text-right">Unit</span>
                    <span className="text-right">Total</span>
                    <span className="text-right">Custo unit</span>
                    <span className="text-right">Margem</span>
                    <span className="text-right">Markup</span>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {custoDetalhePedidoSelecionado.linhas.map((linha, index) => (
                      (() => {
                        const skuKey = normalizarCodigoProduto(linha.codigo || '');
                        const skuInfo = skuKey ? custosPorSkuMap.get(skuKey) : null;
                        const custoUnit = skuInfo?.custoUnit || 0;
                        const custoTotal = (linha.quantidade || 0) * custoUnit;
                        return (
                      <div
                        key={`${linha.nf || 'nf'}-${linha.codigo || 'sku'}-${index}`}
                        className="grid grid-cols-[90px_1fr_70px_90px_90px_90px_70px_70px] items-center px-3 py-2 text-[11px] text-slate-200"
                      >
                        <span className="text-slate-100">{linha.codigo || '-'}</span>
                        <span className="text-slate-400">
                          {linha.descricao || skuInfo?.descricao || 'Sem descricao'}
                        </span>
                        <span className="text-right">{Math.round(linha.quantidade || 0)}</span>
                        <span className="text-right text-slate-300">{formatarMoeda(linha.valorUnitario || 0)}</span>
                        <span className="text-right text-emerald-300">{formatarMoeda(linha.valorTotal || 0)}</span>
                        <span className="text-right text-slate-300">{formatarMoeda(custoUnit)}</span>
                        <span className="text-right text-slate-300">
                          {Number.isFinite(skuInfo?.margem) ? `${skuInfo.margem.toFixed(1)}%` : '-'}
                        </span>
                        <span className="text-right text-slate-300">
                          {Number.isFinite(skuInfo?.markup) ? `${skuInfo.markup.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Sem linhas para este pedido.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {modalRapidoFiltroOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Modo rapido</p>
                <p className="text-lg font-bold text-slate-800">Selecione o supervisor</p>
              </div>
              <button
                type="button"
                onClick={() => setModalRapidoFiltroOpen(false)}
                className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Supervisor
              </label>
              <select
                value={rapidoSupervisor}
                onChange={(e) => setRapidoSupervisor(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <option value="">Selecione...</option>
                {supervisoresDisponiveis
                  .filter((nome) => nome !== 'Todos')
                  .map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
              </select>
            </div>

            {rapidoSupervisorErro && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {rapidoSupervisorErro}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalRapidoFiltroOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={iniciarModoRapido}
                className="rounded-full bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
              >
                Iniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {modoRapidoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Modo rapido</p>
                <p className="text-lg font-bold text-slate-800">Lancamento em sequencia</p>
                <p className="text-xs text-slate-400 mt-1">
                  {dataLancamento} ? {colaboradoresDiaFiltrados.length} colaboradores filtrados
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModoRapido}
                className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              >
                Fechar
              </button>
            </div>

            {colaboradoresDiaFiltrados.length === 0 ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum colaborador para os filtros selecionados.
              </div>
            ) : (
              (() => {
                const colab = colaboradoresDiaFiltrados[modoRapidoIndex];
                return (
                  <div className="mt-6">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold text-slate-800">{colab.nome}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {colab.setor} ? {colab.gestor}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-slate-400">
                          {modoRapidoIndex + 1} / {colaboradoresDiaFiltrados.length}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold">
                        {[
                          { tipo: 'Presente', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                          { tipo: 'Falta Justificada', classe: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                          { tipo: 'Falta Injustificada', classe: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
                          { tipo: 'Falta Parcial', classe: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
                        ].map(({ tipo, classe }) => (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => salvarModoRapido(tipo)}
                            className={`rounded-xl border px-4 py-3 text-left text-xs font-bold transition-all ${classe}`}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Tempo falta parcial (HH:MM)
                        </label>
                        <input
                          value={modoRapidoTempo}
                          onChange={(e) => setModoRapidoTempo(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                          placeholder="02:00"
                        />
                      </div>
                    </div>

                    {modoRapidoErro && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {modoRapidoErro}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={voltarModoRapido}
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                        disabled={modoRapidoIndex === 0}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={avancarModoRapido}
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                        disabled={modoRapidoIndex >= colaboradoresDiaFiltrados.length - 1}
                      >
                        Proximo
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
      
      {/* Sidebar Clássica */}
      <aside
        className={`hidden md:flex bg-slate-900 text-white flex-col sticky top-0 h-screen z-20 shadow-2xl transition-[width] duration-300 overflow-hidden shrink-0 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } relative`}
      >
        <div className="p-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            className="absolute -right-3 top-28 h-8 w-8 rounded-full border border-slate-800 bg-slate-900 text-slate-200 shadow-lg hover:text-white hover:border-slate-600 flex items-center justify-center"
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex flex-col items-center justify-center mb-10">
            <div className="bg-slate-900 p-4 rounded-3xl shadow-lg transform scale-[1.8] origin-center">
              <img src={logoMetalosa} alt="Metalosa" className="h-16 w-16 object-contain brightness-0 invert" />
            </div>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item) => (
              (() => {
                const isDisabled = item.id === 'portfolio' && isPortfolioDisabled;
                return (
                  <button
                    key={item.id}
                    onClick={() => !isDisabled && setAbaAtiva(item.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      abaAtiva === item.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    } ${isDisabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-400' : ''}`}
                    title={isDisabled ? 'Em ajuste' : undefined}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                );
              })()
            ))}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-800">
          {authUser && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center text-xs font-black uppercase">
                  {(currentUserLabel || authUser.email || '?')
                    .trim()
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {currentUserLabel || (authUser.email ? authUser.email.split('@')[0] : 'Usuario')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{authUser.email}</div>
                </div>
              </div>
              {isAllowedDomain && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold mb-2">
                    Notificacoes
                  </p>
                  {!notifSupported && (
                    <p className="text-[10px] text-slate-400">
                      Navegador nao suporta notificacoes.
                    </p>
                  )}
                  {notifSupported && notifPermission === 'denied' && (
                    <p className="text-[10px] text-rose-300">
                      Permissao bloqueada no navegador.
                    </p>
                  )}
                  {notifSupported && notifPermission !== 'denied' && (
                    <div className="space-y-2">
                      {notifToken ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-emerald-300">Ativas</span>
                          <button
                            type="button"
                            onClick={handleDisableNotifications}
                            disabled={notifLoading}
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-200 hover:border-slate-500 disabled:opacity-60"
                          >
                            Desativar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleEnableNotifications}
                          disabled={notifLoading}
                          className="w-full rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-400/20 disabled:opacity-60"
                        >
                          Ativar notificacoes
                        </button>
                      )}
                      {notifError && (
                        <div className="text-[10px] text-rose-300">{notifError}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white hover:border-slate-500"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Mostrar menu lateral"
          className="hidden md:flex fixed left-2 top-28 z-30 h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-200 shadow-lg hover:text-white hover:border-slate-600"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Conteúdo Principal */}
      <main className={`flex-1 min-w-0 px-4 md:px-6 ${abaAtiva === 'dashboard-tv' ? 'pb-4' : 'pb-24 md:pb-8'}`}>
        {abaAtiva !== 'faturamento' && abaAtiva !== 'executivo' && abaAtiva !== 'dashboard-tv' && (
          <header className="w-full mb-8 flex justify-between items-end">
          <div>
            {abaAtiva !== 'custos' && (
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {ITENS_MENU.find(i => i.id === abaAtiva)?.label}
              </h1>
            )}
            {abaAtiva !== 'custos' && (
              <p className="text-slate-500 mt-1">Status da operação em {new Date().toLocaleDateString('pt-BR')}</p>
            )}
          </div>
          <div className="flex gap-4" />
          </header>
        )}

        <div className="w-full">
          
          {/* ABA EXECUTIVA */}
          {abaAtiva === 'executivo' && (
            <div className="space-y-8 animate-in fade-in duration-700">
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-emerald-600/5 blur-3xl" />
                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner">
                      <img src={logoMetalosa} alt="Metalosa" className="h-14 w-14 object-contain opacity-90" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
                          Operação em tempo real
                        </p>
                      </div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Painel Executivo</h2>
                      <p className="text-xs md:text-sm text-slate-400 mt-1 font-medium">
                        Consolidado industrial · {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-[340px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Presença hoje</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-emerald-400">{resumoFaltas.percentualPresenca.toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-500 mb-1">da meta</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Dias ativos</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-blue-300">{faturamentoAtual.diasAtivos}</span>
                        <span className="text-[10px] text-slate-500 mb-1">dias úteis</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Faturamento mês</p>
                      <div className="flex items-end gap-1">
                        <span className="text-xl font-black text-emerald-300">{formatarMoeda(faturamentoAtual.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setMostrarFiltroCfop((prev) => !prev)}
                    className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600"
                  >
                    <ChevronRight
                      size={12}
                      className={`transition-transform ${mostrarFiltroCfop ? 'rotate-90' : ''}`}
                    />
                    CFOPs de saida (Protheus)
                  </button>
                  <span className="text-[10px] text-slate-400">
                    {filtroCfops.length} selecionados
                  </span>
                </div>
                {mostrarFiltroCfop && (
                  <>
                    <CfopFilterSelector
                      selected={filtroCfops}
                      onSelect={toggleCfopFilter}
                      label="Cod Fiscal"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <span className="mr-2">Filiais</span>
                      {['Todas', ...(faturamentoAtual.filiais || [])].map((filial) => (
                        <button
                          key={filial}
                          type="button"
                          onClick={() => setFiltroFilial(filial)}
                          className={`rounded-full px-3 py-1.5 transition-all ${
                            filtroFilial === filial
                              ? 'bg-blue-600 text-white shadow'
                              : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {filial}
                        </button>
                      ))}
                    </div>
                    {(faturamentoAtual.filiaisVend?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span className="mr-2">Filial Vend.</span>
                        {['Todas', ...faturamentoAtual.filiaisVend].map((fv) => (
                          <button
                            key={fv}
                            type="button"
                            onClick={() => setFiltroFilialVend(fv)}
                            className={`rounded-full px-3 py-1.5 transition-all ${
                              filtroFilialVend === fv
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {fv}
                          </button>
                        ))}
                      </div>
                    )}
                    {(faturamentoAtual.gruposDisponiveis?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span className="mr-2">Grupo</span>
                        {['Todos', ...faturamentoAtual.gruposDisponiveis].map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setFiltroGrupo(g)}
                            className={`rounded-full px-3 py-1.5 transition-all ${
                              filtroGrupo === g
                                ? 'bg-violet-600 text-white shadow'
                                : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                    <div
                      className="text-[10px] text-slate-500"
                      title={filtroCfops.length ? filtroCfops.join(", ") : "Todos"}
                    >
                      {filtroCfops.length === 0
                        ? "Selecionados (0): Todos"
                        : `Selecionados (${filtroCfops.length}): ${filtroCfops.slice(0, 3).join(", ")}${
                            filtroCfops.length > 3 ? "..." : ""
                          }`}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                {[
                  {
                    titulo: 'Faturamento Total',
                    valor: formatarMoeda(faturamentoAtual.total),
                    subtitulo: 'Consolidado mensal',
                    icon: DollarSign,
                    corFundo: 'bg-blue-500',
                  },
                  {
                    titulo: 'Média por dia',
                    valor: formatarMoeda(
                      faturamentoAtual.diasAtivos > 0 ? faturamentoAtual.total / faturamentoAtual.diasAtivos : 0
                    ),
                    subtitulo: 'Performance diária',
                    icon: TrendingUp,
                    corFundo: 'bg-emerald-500',
                  },
                  {
                    titulo: 'Ticket médio',
                    valor: formatarMoeda(faturamentoAtual.ticketMedio),
                    subtitulo: 'Valor por pedido',
                    icon: ShoppingCart,
                    corFundo: 'bg-blue-500',
                  },
                  {
                    titulo: 'Clientes ativos',
                    valor: faturamentoAtual.clientesAtivos,
                    subtitulo: 'Carteira no mês',
                    icon: Users,
                    corFundo: 'bg-emerald-500',
                  },
                  {
                    titulo: 'Faltas hoje',
                    valor: resumoFaltas.ausentes,
                    subtitulo: 'Atenção operacional',
                    icon: UserX,
                    corFundo: 'bg-blue-500',
                  },
                  {
                    titulo: 'Férias hoje',
                    valor: resumoFaltas.porTipo['Ferias'] || 0,
                    subtitulo: 'Planejamento RH',
                    icon: CalendarIcon,
                    corFundo: 'bg-emerald-500',
                  },
                ].filter((kpi) => !['Faltas hoje', 'FÇ¸rias hoje'].includes(kpi.titulo)).map((kpi) => (
                  <CardInformativo
                    key={kpi.titulo}
                    titulo={kpi.titulo}
                    valor={kpi.valor}
                    subtitulo={kpi.subtitulo}
                    icon={kpi.icon}
                    corFundo={kpi.corFundo}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-4 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2">
                          <Activity className="text-blue-600" size={18} />
                          Faturamento por Dia
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Histórico dos últimos dias ativos</p>
                      </div>
                      <span className="px-3 py-1.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                        {ultimos10DiasFaturamento.length} dias
                      </span>
                    </div>
                    {(() => {
                      const diasExibidos = ultimos10DiasFaturamento;
                      if (!diasExibidos.length) {
                        return (
                          <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl">
                            <p className="text-slate-400 text-xs italic">Aguardando dados do ERP...</p>
                          </div>
                        );
                      }
                      const maxValor = diasExibidos.reduce((acc, item) => Math.max(acc, item.valor), 1);
                      const totalDias = diasExibidos.reduce((acc, item) => acc + item.valor, 0);
                      const mediaDia = diasExibidos.length > 0 ? totalDias / diasExibidos.length : 0;
                      return (
                        <div className="space-y-4">
                          {diasExibidos.map((item) => {
                            const perc = (item.valor / maxValor) * 100;
                            const isHigh = item.valor >= mediaDia;
                            return (
                              <div key={item.dia} className="group">
                                <div className="flex items-center justify-between text-[11px] mb-1.5">
                                  <span className="font-bold text-slate-600 group-hover:text-blue-600 transition-colors">
                                    {item.dia}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isHigh && <ArrowUpRight size={12} className="text-emerald-500" />}
                                    <span className="font-black text-slate-900">{formatarMoeda(item.valor)}</span>
                                  </div>
                                </div>
                                <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-100 p-[1px]">
                                  <div
                                    className={`h-full rounded-full transition-all duration-1000 ${
                                      isHigh ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-blue-400'
                                    }`}
                                    style={{ width: `${Math.min(perc, 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2">
                          <AlertTriangle className="text-rose-500" size={18} />
                          Alertas de Absenteísmo
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Impacto por processo produtivo</p>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase">{resumoMesAtualSetores.mesLabel}</span>
                    </div>
                    {listaSetores.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {listaSetores.map((setor) => {
                          const valor = resumoMesAtualSetores.porSetor[setor] || 0;
                          const maxSetor = resumoMesAtualSetores.maxSetor || 1;
                          const perc = (valor / maxSetor) * 100;
                          const isCritical = valor > 3;
                          return (
                            <div key={setor} className="space-y-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black text-slate-600">{setor}</span>
                                <span
                                  className={`text-[11px] font-bold ${
                                    isCritical ? 'text-rose-600' : 'text-slate-900'
                                  }`}
                                >
                                  {valor} faltas
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-1000 ${
                                    isCritical ? 'bg-rose-500' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min(perc, 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs italic text-center py-8">
                        Sem dados operacionais registrados.
                      </p>
                    )}
                  </div>
                </div>

                <div className="xl:col-span-8 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500 font-black">Custos consolidados</p>
                        <p className="text-4xl font-black text-slate-900">{formatarMoeda(totalCustosMes)}</p>
                        <p className="text-xs text-slate-400 mt-1">{mesCustoAtualDisplay || 'Planilha de custos'}</p>
                      </div>
                      <div className="flex flex-col text-right text-[11px] text-slate-500">
                        <span>Capturado dos insumos</span>
                        <span className="text-[10px] text-slate-400 mt-2">{faturamentoAtual.movimentos || 0} movimentos</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px]">Margem sobre faturamento</p>
                        <p className="text-2xl font-bold text-emerald-500 mt-1">
                          {Number.isFinite(margemPercentual) ? `${margemPercentual.toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px]">Markup sobre custo</p>
                        <p className="text-2xl font-bold text-blue-500 mt-1">
                          {Number.isFinite(markupPercentual) ? `${markupPercentual.toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px]">Custo médio / movimento</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatarMoeda(custoMedioMovimento)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px]">Custo médio / dia</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatarMoeda(custoMedioDia)}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {faturamentoComCustos.topItens.length ? (
                        faturamentoComCustos.topItens.map((item) => {
                          const margemItem = item.receita > 0 ? ((item.receita - item.custo) / item.receita) * 100 : 0;
                          const markupItem = item.custo > 0 ? ((item.receita - item.custo) / item.custo) * 100 : 0;
                          return (
                            <div
                              key={`${item.codigo}-${item.descricao}`}
                              className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{item.codigo || '-'}</span>
                                <span className="text-emerald-500 font-black">{formatarMoeda(item.receita)}</span>
                              </div>
                              <p className="text-[12px] text-slate-500">{item.descricao || 'Sem descricao'}</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Margem {Number.isFinite(margemItem) ? `${margemItem.toFixed(1)}%` : '0%'} · Markup{' '}
                                {Number.isFinite(markupItem) ? `${markupItem.toFixed(1)}%` : '0%'}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic">Sem itens com custos definidos.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalTabelaCustosOpen(true)}
                      className="w-full rounded-2xl border border-emerald-500 bg-gradient-to-r from-emerald-600/90 to-emerald-500/80 px-4 py-3 text-xs font-black uppercase tracking-[0.3em] text-white"
                    >
                      Abrir detalhamento por SKU
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Valide os valores por SKU no modal e confirme que os custos acompanham o faturamento.
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Top clientes</h3>
                      <span className="text-[10px] text-slate-400">Top 5</span>
                    </div>
                    {faturamentoAtual.topClientes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sem dados de faturamento.</p>
                    ) : (
                      <div className="space-y-5">
                        {faturamentoAtual.topClientes.slice(0, 5).map((item, index) => {
                          const share = faturamentoAtual.total > 0 ? (item.valor / faturamentoAtual.total) * 100 : 0;
                          return (
                            <div key={`${item.cliente}-${index}`} className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{item.info?.nome || item.cliente}</p>
                                <p className="text-[11px] text-slate-500">
                                  {item.info?.municipio ? `${item.info.municipio} / ${item.info.estado}` : 'Cliente sem cadastro'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-emerald-500">{formatarMoeda(item.valor)}</p>
                                <p className="text-[10px] text-slate-400">
                                  {Number.isFinite(share) ? `${share.toFixed(1)}% share` : '-'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA DE CUSTOS */}
          {abaAtiva === 'custos' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-emerald-600/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner">
                      <Layers size={28} className="text-emerald-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Operacao em tempo real</p>
                      </div>
                      
                      <h2 className="text-3xl font-black text-white tracking-tight">Custos</h2>
                      <p className="text-sm text-slate-400 mt-1 font-medium">
                        {custosMovimentos || 0} movimentos · {custosPeriodoLabel}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-[320px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Total de custos</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-emerald-300">{formatarMoeda(custosTotal)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Custo / movimento</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-blue-200">{formatarMoeda(custosCustoMedioMovimento)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">% custo no faturamento</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-amber-200">
                          {Number.isFinite(custosPercentualSobreFaturamento) ? `${custosPercentualSobreFaturamento.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Data inicio
                    <input
                      type="date"
                      value={custoPeriodoInicio}
                      onChange={(e) => setCustoPeriodoInicio(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Data fim
                    <input
                      type="date"
                      value={custoPeriodoFim}
                      onChange={(e) => setCustoPeriodoFim(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mes faturamento
                    <select
                      value={custoFiltroMesFaturamento}
                      onChange={(e) => setCustoFiltroMesFaturamento(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      {custosBaseFiltravel.mesesDisponiveis.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.display}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mes custo
                    <select
                      value={mesCustoAtual}
                      onChange={(e) => setCustoFiltroMes(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      {mesesCustos.map((item) => (
                        <option key={item.raw} value={item.raw}>
                          {item.display}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Filial
                    <select
                      value={custoFiltroFilial}
                      onChange={(e) => setCustoFiltroFilial(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      {['Todas', ...custosFiliaisDisponiveis].map((filial) => (
                        <option key={filial} value={filial}>
                          {filial}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Grupo
                    <select
                      value={custoFiltroGrupo}
                      onChange={(e) => setCustoFiltroGrupo(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      {['Todos', ...custosGruposDisponiveis].map((grupo) => (
                        <option key={grupo} value={grupo}>
                          {grupo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    SKU
                    <input
                      type="text"
                      value={custoFiltroSku}
                      onChange={(e) => setCustoFiltroSku(e.target.value)}
                      placeholder="Codigo ou descricao"
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 placeholder:text-slate-500"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cliente
                    <input
                      type="text"
                      value={custoFiltroCliente}
                      onChange={(e) => setCustoFiltroCliente(e.target.value)}
                      placeholder="Nome ou codigo"
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 placeholder:text-slate-500"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="mr-1">Fonte do custo</span>
                  {[
                    ['Todas', 'Todas'],
                    ['ATUAL', 'Atual'],
                    ['FALLBACK_ANO_PASSADO', 'Ano anterior'],
                    ['TEORICO_PROXY', 'Proxy'],
                    ['SEM_CUSTO', 'Sem custo'],
                  ].map(([valor, label]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setCustoFiltroFonte(valor)}
                      className={`rounded-full px-3 py-1.5 transition-all ${
                        custoFiltroFonte === valor
                          ? 'bg-emerald-500 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCustoPeriodoInicio('');
                      setCustoPeriodoFim('');
                      setCustoFiltroMesFaturamento('');
                      setCustoFiltroMes('');
                      setCustoFiltroFilial('Todas');
                      setCustoFiltroGrupo('Todos');
                      setCustoFiltroFonte('Todas');
                      setCustoFiltroSku('');
                      setCustoFiltroCliente('');
                    }}
                    className="ml-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500 hover:text-white"
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Indicadores</h3>
                    <div className="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-[10px]">Margem sobre faturamento</p>
                        <p className="text-2xl font-bold text-emerald-400 mt-1">
                          {Number.isFinite(custosMargemPercentual) ? `${custosMargemPercentual.toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-[10px]">Markup sobre custo</p>
                        <p className="text-2xl font-bold text-blue-300 mt-1">
                          {Number.isFinite(custosMarkupPercentual) ? `${custosMarkupPercentual.toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-[10px]">Custo medio / dia</p>
                        <p className="text-2xl font-bold text-slate-100 mt-1">{formatarMoeda(custosCustoMedioDia)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-[10px]">Qtd SKUs com custo</p>
                        <p className="text-2xl font-bold text-slate-100 mt-1">{custosItensFiltrados.length || 0}</p>
                      </div>
                    </div>
                  </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Diretos x indiretos</h3>
                  <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Custos diretos</span>
                          <span className="font-bold text-emerald-300">{formatarMoeda(custosTotalDireto)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${Math.min(custosPercentualDireto, 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Custos indiretos (CIF)</span>
                          <span className="font-bold text-amber-300">{formatarMoeda(custosTotalIndireto)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-amber-400" style={{ width: `${Math.min(custosPercentualIndireto, 100)}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
                      Rateio aplicado: {formatarMoeda(custosTotalIndireto)}
                      </div>
                    </div>
                  </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Comparativo ano anterior</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Direto mes atual</span>
                        <span className="font-bold text-slate-100">{formatarMoeda(custosDiretoAtualSelecionado)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Direto ano anterior</span>
                        <span className="font-bold text-slate-100">{formatarMoeda(custosDiretoPrevSelecionado)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex items-center justify-between text-xs text-slate-300">
                        <span>Variacao</span>
                        <span className={`flex items-center gap-2 font-bold ${custosVariacaoDiretoSelecionado >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {custosVariacaoDiretoSelecionado >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Number.isFinite(custosVariacaoDiretoSelecionado) ? `${custosVariacaoDiretoSelecionado.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Comparativo calculado sobre os SKUs dentro do filtro atual.</p>
                    </div>
                  </div>
                </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Top custos por SKU</h3>
                    <button
                      type="button"
                      onClick={() => setModalTabelaCustosOpen(true)}
                      className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-500"
                    >
                      Ver detalhes
                    </button>
                  </div>
                  {custosTopItens.length ? (
                    <div className="space-y-3">
                      {custosTopItens.map((item) => (
                        <div key={`${item.codigo}-${item.descricao}`} role="button" tabIndex={0} onClick={() => { setCustoDetalheItem(item); setCustoDetalheModalOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCustoDetalheItem(item); setCustoDetalheModalOpen(true); } }} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left transition hover:border-emerald-400/60 hover:bg-slate-950/70">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-100">{item.codigo || '-'}</span>
                            <span className="text-xs font-bold text-emerald-300">{formatarMoeda(item.custo)}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{item.descricao || 'Sem descricao'}</p>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                            <span>Margem {Number.isFinite(item.margem) ? `${item.margem.toFixed(1)}%` : '-'}</span>
                            <span>Receita {formatarMoeda(item.receita)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                            <span>
                              Preco medio {formatarMoeda(item.quantidade ? item.receita / item.quantidade : 0)}
                            </span>
                            <span>
                              Custo medio {formatarMoeda(item.quantidade ? item.custo / item.quantidade : 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sem itens com custo.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Impacto absoluto no resultado</h3>
                  {custosImpactoResultado.length ? (
                    <div className="space-y-3">
                      {custosImpactoResultado.map((item) => (
                        <button
                          key={`${item.codigo}-${item.descricao}`}
                          type="button"
                          onClick={() => {
                            setCustoDetalheItem(item);
                            setCustoDetalheModalOpen(true);
                          }}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            item.impactoResultado >= 0
                              ? 'border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-400/70 hover:bg-emerald-500/15'
                              : 'border-rose-500/30 bg-rose-500/10 hover:border-rose-400/70 hover:bg-rose-500/15'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${item.impactoResultado >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>{item.codigo || '-'}</span>
                            <span className={`text-xs font-bold ${item.impactoResultado >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                              {formatarMoeda(item.impactoResultado)}
                            </span>
                          </div>
                          <p className={`text-[11px] ${item.impactoResultado >= 0 ? 'text-emerald-200/70' : 'text-rose-200/70'}`}>{item.descricao || 'Sem descricao'}</p>
                          <div className={`mt-2 flex items-center justify-between text-[10px] ${item.impactoResultado >= 0 ? 'text-emerald-200/70' : 'text-rose-200/70'}`}>
                            <span>Custo {formatarMoeda(item.custo)}</span>
                            <span>Receita {formatarMoeda(item.receita)}</span>
                          </div>
                          <div className={`mt-1 flex items-center justify-between text-[10px] ${item.impactoResultado >= 0 ? 'text-emerald-200/70' : 'text-rose-200/70'}`}>
                            <span>Margem {Number.isFinite(item.margem) ? `${item.margem.toFixed(1)}%` : '-'}</span>
                            <span>Impacto abs. {formatarMoeda(item.impactoAbsoluto)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Nenhum SKU com impacto relevante dentro do filtro.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Confiabilidade do custo</h3>
                  {custosConfiabilidade.total ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Custo direto atual</span>
                          <span className="font-bold text-emerald-300">{custosConfiabilidade.atual.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${custosConfiabilidade.atual}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Fallback ano anterior</span>
                          <span className="font-bold text-blue-300">{custosConfiabilidade.fallback.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${custosConfiabilidade.fallback}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Estimado/rateado</span>
                          <span className="font-bold text-amber-300">{custosConfiabilidade.proxy.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${custosConfiabilidade.proxy}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Sem custo direto</span>
                          <span className="font-bold text-rose-300">{custosConfiabilidade.semCusto.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${custosConfiabilidade.semCusto}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sem dados suficientes para medir confiabilidade.</p>
                  )}
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                    Base analisada: {custosConfiabilidade.total} SKUs com receita.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Curva ABC de custo</h3>
                      <p className="text-xs text-slate-400 mt-1">Concentracao do custo total nos SKUs do filtro atual.</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {custosCurvaAbc.itens.length} SKUs
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {['A', 'B', 'C'].map((classe) => (
                      <div key={classe} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Classe {classe}</p>
                        <p className={`mt-2 text-2xl font-black ${classe === 'A' ? 'text-rose-300' : classe === 'B' ? 'text-amber-300' : 'text-blue-300'}`}>
                          {custosCurvaAbc.resumo[classe].percentual.toFixed(1)}%
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">{custosCurvaAbc.resumo[classe].quantidade} SKU(s)</p>
                      </div>
                    ))}
                  </div>
                  {custosCurvaAbc.itens.length ? (
                    <div className="mt-4 space-y-3">
                      {custosCurvaAbc.itens.slice(0, 8).map((item) => (
                        <button
                          key={`${item.codigo}-${item.descricao}-abc`}
                          type="button"
                          onClick={() => {
                            setCustoDetalheItem(item);
                            setCustoDetalheModalOpen(true);
                          }}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left transition hover:border-slate-600 hover:bg-slate-950/70"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-100">{item.codigo || '-'}</p>
                              <p className="text-[11px] text-slate-400">{item.descricao || 'Sem descricao'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-100">{formatarMoeda(item.custo)}</p>
                              <p className="text-[10px] text-slate-500">
                                Classe {item.classeAbc} · {item.percentualAcumulado.toFixed(1)}% acum.
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400 italic">Sem SKUs suficientes para classificar a curva ABC.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">SKUs sem custo direto</h3>
                      <p className="text-xs text-slate-400 mt-1">Itens com receita mas sem custo direto identificado.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalTabelaCustosOpen(true)}
                      className="rounded-xl border border-emerald-500 bg-emerald-500/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-emerald-200"
                    >
                      Abrir detalhamento por SKU
                    </button>
                  </div>
                  {custosSemCustoTop.length ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {custosSemCustoTop.slice(0, 8).map((item) => (
                        <div key={item.codigo} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-100">{item.codigo || '-'}</span>
                            <span className="text-xs font-bold text-amber-300">{formatarMoeda(item.receita)}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{item.descricao || 'Sem descricao'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400 italic">Nenhum SKU sem custo identificado dentro do filtro.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DASHBOARD TV */}
          {abaAtiva === 'dashboard-tv' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl">
                <div className="absolute -top-24 -right-16 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="relative flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]" />
                      <span className="text-[10px] uppercase tracking-[0.4em] text-emerald-200 font-bold">Live KPI</span>
                    </div>
                    <h2 className="text-5xl font-black text-white tracking-tight">Dashboard TV</h2>
                    {dashboardView === 'manutencao' ? (
                      <p className="text-lg text-slate-300 mt-1 font-medium">
                        Manutenção · Monitoramento em tempo real
                      </p>
                    ) : dashboardView === 'global' ? (
                      <p className="text-lg text-slate-300 mt-1 font-medium">
                        Visão global · Todos os recursos por setor
                      </p>
                    ) : (
                      <p className="text-lg text-slate-300 mt-1 font-medium">
                        Faturamento atualizado em{' '}
                        {faturamentoArquivoEm
                          ? new Date(faturamentoArquivoEm).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{' '}
                        {faturamentoArquivoEm ? '' : `- ${agora.toLocaleDateString('pt-BR')}`}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 opacity-80">
                      <button
                        type="button"
                        onClick={alternarSom}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                          somAtivo
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                            : 'border border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        {somAtivo ? 'Som ativo' : 'Ativar som'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboardView('faturamento')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                          dashboardView === 'faturamento'
                            ? 'bg-blue-500 text-white'
                            : 'border border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        Faturamento
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboardView('manutencao')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                          dashboardView === 'manutencao'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'border border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        Manutencao
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboardView('global')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                          dashboardView === 'global'
                            ? 'bg-violet-500 text-white'
                            : 'border border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        Global
                      </button>
                    </div>
                  </div>
                  <div className="w-full xl:w-auto flex items-center justify-end">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="h-[58px] rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-xs font-semibold text-emerald-300">Sistema operacional</span>
                      </div>
                      <div className="h-[58px] rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 flex flex-col justify-center">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Relogio</p>
                        <p className="text-2xl font-black font-mono text-white tabular-nums leading-none">
                          {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
                      {dashboardView !== 'manutencao' && dashboardView !== 'global' && (
                        <>
                          <div className="h-[58px] rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 min-w-[170px] flex flex-col justify-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Total geral</p>
                            <p className="text-4xl font-black text-blue-200 leading-none mt-0.5">{formatarMoeda(faturamentoAtual.total || 0)}</p>
                          </div>
                          <div className="h-[58px] rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 min-w-[170px] flex flex-col justify-center">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Faturamento hoje</p>
                            <p className="text-4xl font-black text-emerald-300 leading-none mt-0.5">{formatarMoeda(faturamentoHojeTodasFiliais)}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {dashboardView === 'faturamento' ? (
                <div className="-mt-1 space-y-1">
                  <div className="rounded-2xl bg-slate-950/60 px-3 py-1.5 overflow-hidden">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-300 font-bold">
                        Faturado hoje · {dashboardFilialAtual ? dashboardFilialAtual : 'Todas as filiais'}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {agora.toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <marquee behavior="scroll" direction="left" scrollAmount="9" className="text-base font-bold text-emerald-200">
                      {`${letreiroTexto}   |   ${letreiroTexto}`}
                    </marquee>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">
                        Faturamento total {dashboardFilialAtual ? `· ${dashboardFilialAtual}` : ''}
                      </p>
                      <p className="text-3xl font-black text-blue-300 mt-2">
                        {formatarMoeda(dashboardFaturamentoFilial.total || 0)}
                      </p>
                      <p className="text-base text-slate-400 mt-2">{dashboardFaturamentoFilial.movimentos || 0} movimentos</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">Faturamento hoje da filial</p>
                      <p className="text-3xl font-black text-emerald-300 mt-2">{formatarMoeda(faturamentoHojeDashboard)}</p>
                      <p className="text-base text-slate-400 mt-2">{dashboardFilialAtual ? dashboardFilialAtual : 'Todas as filiais'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">Ticket medio</p>
                      <p className="text-3xl font-black text-emerald-300 mt-2">{formatarMoeda(dashboardFaturamentoFilial.ticketMedio || 0)}</p>
                      <p className="text-base text-slate-400 mt-2">Por pedido</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">Media diaria</p>
                      <p className="text-3xl font-black text-blue-200 mt-2">
                        {formatarMoeda(
                          dashboardFaturamentoFilial.diasAtivos
                            ? dashboardFaturamentoFilial.total / dashboardFaturamentoFilial.diasAtivos
                            : 0
                        )}
                      </p>
                      <p className="text-base text-slate-400 mt-2">Faturamento/dia</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm uppercase tracking-[0.25em] text-slate-400 font-bold">Atingimento meta mensal</p>
                        <button
                          type="button"
                          onClick={abrirConfigMetaFilial}
                          className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-500"
                        >
                          Meta
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-center">
                        <svg viewBox="0 0 120 70" className="h-20 w-full max-w-[180px]">
                          <path
                            d="M10 60 A50 50 0 0 1 110 60"
                            fill="none"
                            stroke="#334155"
                            strokeWidth="10"
                            strokeLinecap="round"
                            pathLength="100"
                          />
                          <path
                            d="M10 60 A50 50 0 0 1 110 60"
                            fill="none"
                            stroke={atingimentoMetaPercentual >= 100 ? '#f59e0b' : '#10b981'}
                            strokeWidth="10"
                            strokeLinecap="round"
                            pathLength="100"
                            strokeDasharray={`${Math.max(0, Math.min(100, atingimentoMetaPercentual))} 100`}
                          />
                          <text
                            x="60"
                            y="56"
                            textAnchor="middle"
                            className="fill-emerald-300 text-[14px] font-black"
                          >
                            {metaFilialAtual ? `${atingimentoMetaPercentual.toFixed(1)}%` : 'Sem meta'}
                          </text>
                        </svg>
                      </div>
                      <p className="text-[11px] text-slate-400 text-center -mt-1">
                        {metaFilialAtual
                          ? `Meta mensal ${formatarMoeda(metaFilialAtual)} · Realizado ${formatarMoeda(dashboardFaturamentoFilial.total || 0)}`
                          : 'Clique em Meta para configurar'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4 xl:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-black uppercase tracking-widest text-slate-300">Mapa por municipio</h3>
                        <span className="text-base text-slate-500">Distribuicao geografica</span>
                      </div>
                      {renderMapaMunicipioDados(
                        dashboardFaturamentoFilial.municipiosMapa,
                        dashboardMunicipiosBounds,
                        'h-[640px] overflow-hidden rounded-2xl border border-slate-800',
                        { zoomControl: false }
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-black uppercase tracking-widest text-slate-200">Faturamento diario</h3>
                          <span className="text-base text-slate-400">Ultimos 10 dias</span>
                        </div>
                        {(() => {
                          const dados = (dashboardFaturamentoFilial.porDia || []).slice(-10);
                          if (!dados.length) {
                            return <p className="text-xs text-slate-500 italic">Sem dados no periodo.</p>;
                          }
                          const height = 380;
                          const margin = { top: 24, right: 16, bottom: 30, left: 16 };
                          const slotWidth = 90;
                          const minWidth = 360;
                          const maxWidth = 520;
                          const width = Math.max(
                            minWidth,
                            Math.min(maxWidth, margin.left + margin.right + slotWidth * Math.max(dados.length, 1))
                          );
                          const chartW = width - margin.left - margin.right;
                          const chartH = height - margin.top - margin.bottom;
                          const maxValor = Math.max(...dados.map((item) => item.valor), 1);
                          const media = dados.reduce((acc, item) => acc + item.valor, 0) / dados.length;
                          const yMedia = margin.top + chartH - (media / maxValor) * chartH;
                          const barW = chartW / Math.max(dados.length, 1);
                          const barWidth = Math.min(90, Math.max(barW - 12, 10));
                          return (
                            <svg
                              viewBox={`0 0 ${width} ${height}`}
                              className="w-full h-80"
                            >
                              <defs>
                                <linearGradient id="dashBar" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.95" />
                                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.9" />
                                </linearGradient>
                              </defs>
                              <line
                                x1={margin.left}
                                x2={width - margin.right}
                                y1={yMedia}
                                y2={yMedia}
                                stroke="#22c55e"
                                strokeDasharray="6 6"
                              />
                              <text
                                x={width - margin.right}
                                y={Math.max(yMedia - 6, 16)}
                                textAnchor="end"
                                fontSize="14"
                                fill="#bbf7d0"
                                fontWeight="800"
                              >
                                Media {formatarValorCurto(media)}
                              </text>
                              {dados.map((item, i) => {
                                const barH = (item.valor / maxValor) * chartH;
                                const x = margin.left + i * barW + (barW - barWidth) / 2;
                                const y = margin.top + chartH - barH;
                                return (
                                  <g key={item.dia}>
                                    <rect x={x} y={y} width={barWidth} height={barH} rx="6" fill="url(#dashBar)" />
                                    <text
                                      x={x + barWidth / 2}
                                      y={Math.max(y - 10, 22)}
                                      textAnchor="middle"
                                      fontSize="14"
                                      fill="#ffffff"
                                      fontWeight="800"
                                    >
                                      {formatarValorCurto(item.valor)}
                                    </text>
                                    <text
                                      x={x + barWidth / 2}
                                      y={margin.top + chartH + 18}
                                      textAnchor="middle"
                                      fontSize="14"
                                      fill="#e2e8f0"
                                      fontWeight="700"
                                    >
                                      {item.dia.slice(8)}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-black uppercase tracking-widest text-slate-300">Top estados</h3>
                          <span className="text-base text-slate-500">Top 6</span>
                        </div>
                        <div className="space-y-3">
                          {(dashboardFaturamentoFilial.topEstados || []).slice(0, 6).map((item) => {
                            const perc = dashboardFaturamentoFilial.total > 0 ? (item.valor / dashboardFaturamentoFilial.total) * 100 : 0;
                            return (
                              <div key={item.estado} className="space-y-1">
                                <div className="flex items-center justify-between text-xs text-slate-300">
                                  <span className="font-semibold">{item.estado}</span>
                                  <span>{perc.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-indigo-400" style={{ width: `${Math.min(perc, 100)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          {!(dashboardFaturamentoFilial.topEstados || []).length && (
                            <p className="text-xs text-slate-500 italic">Sem dados por estado.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : dashboardView === 'global' ? (
                <DashboardGlobalTV
                  agora={agora}
                  manutencaoParadas={manutencaoParadas}
                  manutencaoOrdens={manutencaoOrdens}
                  logoSrc={logoMetalosa}
                />
              ) : (
                <DashboardManutencaoTV
                  agora={agora}
                  manutencaoParadas={manutencaoParadas}
                  manutencaoOrdens={manutencaoOrdens}
                  logoSrc={logoMetalosa}
                />
              )}
            </div>
          )}

          {/* ABA DE FATURAMENTO */}
          {abaAtiva === 'faturamento' && (
            <div className="console-scope space-y-6 animate-in slide-in-from-right duration-700">
              {/*
                THESIS: Faturamento reads as an instrument console, not a marketing dashboard — the business's
                vitals as gauges, not a hero-metric card.
                OWN-WORLD: near-black bezel panels (#12171d) on #0b0f14, 1px hairline borders, rectangular
                corners, amber (#f2b544) as the single brand/primary accent, green/red reserved for state
                (positive/critical), Barlow Condensed for panel titles, Roboto Mono tabular figures for data.
                STORY: a gestor scans revenue, movement, and returns in one instrument sweep and trusts the
                read because it looks like the plant's own control room, not a template.
                FIRST VIEWPORT: header module (id badge, live status, sound toggle, 4 readout cells) atop a
                segmented sub-view switch atop a 6-cell KPI instrument row, master cell weighted larger.
                FORM: Control Room Console, direction 4 of 7 (grounded), seed key 7634edd0.
                FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
                the verdict, and DESIGN.md.
              */}
              <div className="relative rounded border border-console-border-strong bg-console-panel px-6 py-5">
                <div className="absolute inset-x-0 top-0 h-px bg-console-accent/60" />
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-console-border-strong bg-console-raised">
                      <DollarSign size={20} className="text-console-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="font-console-display text-xl font-bold uppercase tracking-wide text-console-ink">
                          Faturamento
                        </h2>
                        <span className="inline-flex items-center gap-1.5 rounded-sm border border-console-positive/40 bg-console-positive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-console-positive">
                          <span className="h-1.5 w-1.5 rounded-full bg-console-positive animate-pulse" />
                          Ao vivo
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-console-dim">
                        Consolidado industrial · {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={alternarSom}
                    className={`rounded-sm border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      somAtivo
                        ? 'border-console-positive/40 bg-console-positive/10 text-console-positive'
                        : 'border-console-border-strong text-console-dim hover:text-console-ink'
                    }`}
                  >
                    {somAtivo ? 'Som ativo' : 'Ativar som'}
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded border border-console-border bg-console-border md:grid-cols-4">
                  <div className="bg-console-bg px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Ultima atualizacao</p>
                    <p className="mt-1 font-console-mono text-sm font-medium tabular-nums text-console-ink">
                      {faturamentoArquivoEm
                        ? new Date(faturamentoArquivoEm).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : faturamentoAtualizadoEm
                        ? new Date(faturamentoAtualizadoEm).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Carregando...'}
                    </p>
                  </div>
                  <div className="bg-console-bg px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Movimentos</p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-console-mono text-xl font-semibold tabular-nums text-console-ink">{faturamentoAtual.movimentos || 0}</span>
                      <span className="text-[10px] text-console-faint">no mes</span>
                    </p>
                  </div>
                  <div className="bg-console-bg px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Dias ativos</p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-console-mono text-xl font-semibold tabular-nums text-console-accent">{faturamentoAtual.diasAtivos || 0}</span>
                      <span className="text-[10px] text-console-faint">dias uteis</span>
                    </p>
                  </div>
                  <div className="bg-console-bg px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Faturamento mes</p>
                    <p className="mt-1 font-console-mono text-lg font-semibold tabular-nums text-console-ink">{formatarMoeda(faturamentoAtual.total)}</p>
                  </div>
                </div>
              </div>
              <div className="inline-flex gap-px rounded border border-console-border bg-console-border p-px">
                <button
                  onClick={() => setSubAbaFaturamento('atual')}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${subAbaFaturamento === 'atual' ? 'bg-console-accent text-console-accent-ink' : 'bg-console-panel text-console-dim hover:text-console-ink'}`}
                >
                  Faturamento Atual
                </button>
                <button
                  onClick={() => setSubAbaFaturamento('2025')}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${subAbaFaturamento === '2025' ? 'bg-console-accent text-console-accent-ink' : 'bg-console-panel text-console-dim hover:text-console-ink'}`}
                >
                  Faturamento 2025
                </button>
              </div>

              {subAbaFaturamento === '2025' && (
                <div className="space-y-5">

                  {/* Hero header */}
                  <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-xl border border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.5em] text-slate-500 font-bold">Consolidado 2025</p>
                        <h2 className="text-3xl font-black text-white mt-1 tracking-tight">Painel Faturamento 2025</h2>
                        <p className="text-xs text-slate-500 mt-1">Inclui devolucoes registradas na planilha</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {faturamentoDados.carregando ? (
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700 text-xs text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Carregando...
                          </span>
                        ) : faturamentoDados.erro ? (
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/50 border border-red-700/50 text-xs text-red-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            {faturamentoDados.erro}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-xs text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {faturamento2025.movimentos.toLocaleString('pt-BR')} movimentos
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Receita Liquida</p>
                        <p className="text-2xl font-black text-white mt-1.5">{formatarMoeda(faturamento2025.total)}</p>
                        <p className="text-[11px] text-slate-500 mt-1">apos devolucoes</p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Receita Bruta</p>
                        <p className="text-2xl font-black text-blue-300 mt-1.5">{formatarMoeda(faturamento2025.totalBruto)}</p>
                        <p className="text-[11px] text-slate-500 mt-1">somente vendas</p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Total Devolucoes</p>
                        <div className="flex items-baseline gap-2 mt-1.5">
                          <p className="text-2xl font-black text-rose-400">{formatarMoeda(faturamento2025.totalDevolucao)}</p>
                          <span className="text-xs font-semibold text-rose-500/80">{faturamento2025.devolucaoPercent.toFixed(1)}%</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">do faturamento bruto</p>
                      </div>
                    </div>
                  </div>

                  {/* Filtros */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-400">Filtros</span>
                      <span className="text-[9px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {filtroCfops2025.length ? `${filtroCfops2025.length} CFOPs ativos` : 'Todos os CFOPs'}
                      </span>
                    </div>
                    <CfopFilterSelector
                      selected={filtroCfops2025}
                      onSelect={toggleCfopFilter2025}
                      label="CFOP"
                      options={cfops2025Options}
                    />
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span className="text-slate-400 mr-1">Filial</span>
                      {filiais2025.map((filial) => (
                        <button
                          key={filial}
                          type="button"
                          onClick={() => setFiltroFilial2025(filial)}
                          className={`rounded-full px-3 py-1.5 transition-all ${
                            filtroFilial2025 === filial
                              ? 'bg-slate-900 text-white shadow'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {filial}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KPIs secundarios — 4 colunas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 border-l-emerald-400">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Ticket Medio</p>
                      <p className="text-xl font-black text-slate-900 mt-2">{formatarMoeda(faturamento2025.ticketMedio)}</p>
                      <p className="text-xs text-slate-400 mt-1">{faturamento2025.pedidos.toLocaleString('pt-BR')} pedidos</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 border-l-slate-400">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Movimentos</p>
                      <p className="text-xl font-black text-slate-900 mt-2">{faturamento2025.movimentos.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-slate-400 mt-1">linhas processadas</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 border-l-amber-400">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Dias Ativos</p>
                      <p className="text-xl font-black text-amber-600 mt-2">{faturamento2025.diasAtivos}</p>
                      <p className="text-xs text-slate-400 mt-1">dias com emissao</p>
                    </div>
                  </div>

                  {/* KPIs de desempenho — 4 colunas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Media Mensal</p>
                      <p className="text-lg font-black text-slate-900 mt-2">{formatarMoeda(faturamento2025.mediaMensal)}</p>
                      <p className="text-xs text-slate-400 mt-1">{faturamento2025.porMes.length} meses ativos</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Melhor Mes</p>
                      <p className="text-lg font-black text-emerald-600 mt-2">
                        {faturamento2025.melhorMes ? faturamento2025.melhorMes.mes : '-'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {faturamento2025.melhorMes ? formatarValorCurto(faturamento2025.melhorMes.valor) : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Pior Mes</p>
                      <p className="text-lg font-black text-rose-500 mt-2">
                        {faturamento2025.piorMes ? faturamento2025.piorMes.mes : '-'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {faturamento2025.piorMes ? formatarValorCurto(faturamento2025.piorMes.valor) : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400 font-bold">Variacao MoM</p>
                      <p className={`text-lg font-black mt-2 ${
                        faturamento2025.variacaoUltimoMes === null
                          ? 'text-slate-400'
                          : faturamento2025.variacaoUltimoMes >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-500'
                      }`}>
                        {faturamento2025.variacaoUltimoMes === null
                          ? '-'
                          : `${faturamento2025.variacaoUltimoMes >= 0 ? '+' : ''}${(faturamento2025.variacaoUltimoMes * 100).toFixed(1)}%`}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">ultimo mes</p>
                    </div>
                  </div>

                  {/* Paineis de analise — 3 colunas */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Resumo Anual</h3>
                      </div>
                      <div className="p-5 space-y-3">
                        {[
                          { label: 'Share top 5 grupos', value: `${faturamento2025.shareTop5Grupos.toFixed(1)}%`, color: 'text-slate-900' },
                          { label: 'Taxa de devolucao', value: `${faturamento2025.devolucaoPercent.toFixed(2)}%`, color: 'text-rose-500' },
                          { label: 'Ticket medio', value: formatarMoeda(faturamento2025.ticketMedio), color: 'text-emerald-600' },

                          { label: 'Dias com emissao', value: String(faturamento2025.diasAtivos), color: 'text-amber-600' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                            <span className="text-xs text-slate-500">{label}</span>
                            <span className={`text-xs font-black ${color}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Top Grupos</h3>
                      </div>
                      <div className="p-5 space-y-4">
                        {faturamento2025.topGrupos.slice(0, 5).map((item, idx) => {
                          const share = faturamento2025.totalBruto !== 0 ? (item.valor / faturamento2025.totalBruto) * 100 : 0;
                          const cores = ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-sky-500', 'bg-cyan-500'];
                          return (
                            <div key={item.grupo} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${cores[idx]}`} />
                                  <span className="text-xs font-semibold text-slate-700">{item.grupo}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400">{share.toFixed(1)}%</span>
                                  <span className="text-xs font-black text-slate-900">{formatarValorCurto(item.valor)}</span>
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full ${cores[idx]}`} style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {faturamento2025.topGrupos.length === 0 && (
                          <p className="text-xs text-slate-400 italic">Sem dados por grupo.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Devolucoes por CFOP</h3>
                      </div>
                      <div className="p-5">
                        {faturamento2025.devolucoesPorCfop.length > 0 ? (
                          <div className="space-y-1">
                            {faturamento2025.devolucoesPorCfop.slice(0, 6).map((item) => {
                              const share = faturamento2025.totalDevolucao > 0 ? (item.valor / faturamento2025.totalDevolucao) * 100 : 0;
                              return (
                                <div key={item.cfop} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-semibold text-slate-700">CFOP {item.cfop}</span>
                                      <span className="text-xs font-black text-rose-500">{formatarValorCurto(item.valor)}</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                                      <div className="h-full bg-rose-400" style={{ width: `${Math.min(share, 100)}%` }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic mt-2">Sem devolucoes com CFOP.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {subAbaFaturamento === '2025' && (
                <div className="grid grid-cols-1 gap-8">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-6 bg-slate-50 border-b border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                        Faturamento por Mês (2025)
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="mr-1">Filial</span>
                        {filiais2025.map((filial) => (
                          <button
                            key={filial}
                            type="button"
                            onClick={() => setFiltroFilial2025(filial)}
                            className={`rounded-full px-3 py-1.5 transition-all ${
                              filtroFilial2025 === filial
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-white text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {filial}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-b border-slate-200">
                    {faturamentoDados.carregando ? (
                      <p className="text-slate-400 italic">Carregando planilha...</p>
                    ) : faturamentoDados.erro ? (
                      <p className="text-rose-600 text-sm font-medium">{faturamentoDados.erro}</p>
                    ) : faturamento2025PorMesFilial.length === 0 ? (
                      <p className="text-slate-400 italic">Sem dados na planilha.</p>
                    ) : (
                      (() => {
                        const width = 1200;
                        const height = 320;
                        const margin = { top: 20, right: 20, bottom: 40, left: 50 };
                        const chartW = width - margin.left - margin.right;
                        const chartH = height - margin.top - margin.bottom;
                        const maxValor = Math.max(...faturamento2025PorMesFilial.map((item) => item.valor), 1);
                        const stepX = chartW / Math.max(faturamento2025PorMesFilial.length - 1, 1);

                        const pontos = faturamento2025PorMesFilial.map((item, i) => {
                          const x = margin.left + i * stepX;
                          const y = margin.top + chartH - (item.valor / maxValor) * chartH;
                          return { x, y, item };
                        });

                        const linha = pontos.map((p) => `${p.x},${p.y}`).join(' ');
                        const area = `${margin.left},${margin.top + chartH} ${linha} ${margin.left + (pontos.length - 1) * stepX},${margin.top + chartH}`;

                        return (
                          <div className="relative">
                            <svg
                              viewBox={`0 0 ${width} ${height}`}
                              className="w-full h-80"
                              onMouseMove={(e) => {
                                if (pontos.length === 0) return;
                                const bounds = e.currentTarget.getBoundingClientRect();
                                const scaleX = width / bounds.width;
                                const cursorX = e.nativeEvent.offsetX * scaleX;
                                const rawIndex = Math.round((cursorX - margin.left) / stepX);
                                const index = Math.max(0, Math.min(pontos.length - 1, rawIndex));
                                const ponto = pontos[index];
                                setMesTooltip({
                                  x: e.nativeEvent.offsetX,
                                  y: e.nativeEvent.offsetY,
                                  mes: ponto.item.mes,
                                  valor: ponto.item.valor,
                                });
                              }}
                              onMouseLeave={() => setMesTooltip(null)}
                            >
                              <defs>
                                <linearGradient id="mesArea" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              {[0.25, 0.5, 0.75, 1].map((p) => (
                                <line
                                  key={p}
                                  x1={margin.left}
                                  x2={width - margin.right}
                                  y1={margin.top + chartH * (1 - p)}
                                  y2={margin.top + chartH * (1 - p)}
                                  stroke="#1f2937"
                                  strokeDasharray="4 6"
                                />
                              ))}
                              <text x={margin.left} y={14} fontSize="11" fill="#94a3b8">
                                Faturamento (R$)
                              </text>
                              <polygon points={area} fill="url(#mesArea)" />
                              <polyline points={linha} fill="none" stroke="#22c55e" strokeWidth="3" />
                              {pontos.map((p) => (
                                <circle
                                  key={p.item.mes}
                                  cx={p.x}
                                  cy={p.y}
                                  r="4"
                                  fill="#22c55e"
                                  stroke="#0f172a"
                                  strokeWidth="2"
                                  onMouseMove={(e) => {
                                    setMesTooltip({
                                      x: e.nativeEvent.offsetX,
                                      y: e.nativeEvent.offsetY,
                                      mes: p.item.mes,
                                      valor: p.item.valor,
                                    });
                                  }}
                                  onMouseLeave={() => setMesTooltip(null)}
                                />
                              ))}
                              {stepX >= 60 &&
                                pontos.map((p) => (
                                  <text
                                    key={`${p.item.mes}-val`}
                                    x={p.x}
                                    y={p.y - 12}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="#e2e8f0"
                                    fontWeight="600"
                                  >
                                    {formatarValorCurto(p.item.valor)}
                                  </text>
                                ))}
                              {pontos.map((p) => (
                                <text
                                  key={`${p.item.mes}-label`}
                                  x={p.x}
                                  y={margin.top + chartH + 18}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill="#94a3b8"
                                >
                                  {p.item.mes}
                                </text>
                              ))}
                            </svg>
                            {mesTooltip && (
                              <div
                                className="pointer-events-none absolute z-10 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
                                style={{ left: mesTooltip.x + 12, top: mesTooltip.y + 12 }}
                              >
                                <div className="font-bold">{mesTooltip.mes}</div>
                                <div>R$ {mesTooltip.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-6 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm uppercase tracking-wider">
                    Pareto por Grupo (2025)
                  </div>
                  <div className="p-6">
                    {faturamentoDados.carregando ? (
                      <p className="text-slate-400 italic">Carregando planilha...</p>
                    ) : faturamentoDados.erro ? (
                      <p className="text-rose-600 text-sm font-medium">{faturamentoDados.erro}</p>
                    ) : paretoDados.length === 0 ? (
                      <p className="text-slate-400 italic">Sem dados na planilha.</p>
                    ) : (
                      (() => {
                        const width = 1200;
                        const height = 420;
                        const margin = { top: 56, right: 20, bottom: 62, left: 40 };
                        const chartW = width - margin.left - margin.right;
                        const chartH = height - margin.top - margin.bottom;
                        const maxValor = Math.max(...paretoDados.map((item) => item.valor), 1);
                        const barW = chartW / paretoDados.length;
                        const linePoints = paretoDados.map((item, i) => {
                          const x = margin.left + i * barW + barW / 2;
                          const y = margin.top + chartH * (1 - item.percentual / 100);
                          return `${x},${y}`;
                        });

                        return (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                              <span>Interação: passe o mouse para ver detalhes, clique para abrir o ABC.</span>
                              {paretoAtivo && (
                                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                                  {paretoAtivo.grupo} ??? R$ {paretoAtivo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ??? {paretoAtivo.percentual.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
                                {[0.25, 0.5, 0.75, 1].map((p) => (
                                  <line
                                    key={p}
                                    x1={margin.left}
                                    x2={width - margin.right}
                                    y1={margin.top + chartH * (1 - p)}
                                    y2={margin.top + chartH * (1 - p)}
                                    stroke="#1f2937"
                                    strokeDasharray="4 6"
                                  />
                                ))}
                                <text x={margin.left} y={18} fontSize="12" fill="#94a3b8">
                                  Faturamento (R$)
                                </text>
                                <text x={width - margin.right - 90} y={18} fontSize="12" fill="#94a3b8">
                                  Acumulado (%)
                                </text>
                                {paretoDados.map((item, i) => {
                                  const barH = (item.valor / maxValor) * chartH;
                                  const x = margin.left + i * barW + 6;
                                  const y = margin.top + chartH - barH;
                                  const hover = paretoHover === item.grupo;
                                  const selecionado = paretoSelecionado === item.grupo;
                                  return (
                                    <g key={item.grupo}>
                                      <rect
                                        x={x}
                                        y={y}
                                        width={barW - 12}
                                        height={barH}
                                        fill={selecionado ? '#1d4ed8' : hover ? '#60a5fa' : '#3b82f6'}
                                        opacity="0.95"
                                        rx="6"
                                        className="cursor-pointer"
                                        onMouseEnter={() => setParetoHover(item.grupo)}
                                        onMouseLeave={() => {
                                          setParetoHover(null);
                                          setParetoTooltip(null);
                                        }}
                                        onMouseMove={(e) => {
                                          setParetoTooltip({
                                            x: e.nativeEvent.offsetX,
                                            y: e.nativeEvent.offsetY,
                                            grupo: item.grupo,
                                            valor: item.valor,
                                            percentual: item.percentual,
                                          });
                                        }}
                                        onClick={() => setParetoSelecionado((prev) => (prev === item.grupo ? null : item.grupo))}
                                      />
                                      {barW > 55 && (
                                        <text
                                          x={x + (barW - 12) / 2}
                                          y={Math.max(y - 14, 20)}
                                          textAnchor="middle"
                                          fontSize="13"
                                          fill="#e2e8f0"
                                          fontWeight="700"
                                        >
                                          {formatarValorCurto(item.valor)}
                                        </text>
                                      )}
                                      <text
                                        x={x + (barW - 12) / 2}
                                        y={margin.top + chartH + 20}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="#94a3b8"
                                      >
                                        {item.grupo}
                                      </text>
                                      <title>
                                        {item.grupo} - R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({item.percentual.toFixed(1)}%)
                                      </title>
                                    </g>
                                  );
                                })}
                                <polyline
                                  points={linePoints.join(' ')}
                                  fill="none"
                                  stroke="#f59e0b"
                                  strokeWidth="2.5"
                                />
                                {paretoDados.map((item, i) => {
                                  const x = margin.left + i * barW + barW / 2;
                                  const y = margin.top + chartH * (1 - item.percentual / 100);
                                  return <circle key={`${item.grupo}-dot`} cx={x} cy={y} r="3" fill="#f59e0b" />;
                                })}
                                <text x={width / 2} y={height - 6} fontSize="11" fill="#94a3b8" textAnchor="middle">
                                  Grupos
                                </text>
                              </svg>
                              {paretoTooltip && (
                                <div
                                  className="pointer-events-none absolute z-10 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
                                  style={{ left: paretoTooltip.x + 12, top: paretoTooltip.y + 12 }}
                                >
                                  <div className="font-bold">{paretoTooltip.grupo}</div>
                                  <div>R$ {paretoTooltip.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                  <div>{paretoTooltip.percentual.toFixed(1)}% acumulado</div>
                                </div>
                              )}
                            </div>
                            {paretoSelecionado && !abcDados?.erro && (
                              <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-950/30">
                                    <div className="text-[10px] uppercase font-bold text-slate-500">Classe A</div>
                                    <div className="text-2xl font-bold text-slate-100">{abcDados.a}</div>
                                    <div className="text-xs text-slate-400">R$ {abcDados.valorA.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-xs text-slate-500">Até 80% do faturamento</div>
                                  </div>
                                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-950/30">
                                    <div className="text-[10px] uppercase font-bold text-slate-500">Classe B</div>
                                    <div className="text-2xl font-bold text-slate-100">{abcDados.b}</div>
                                    <div className="text-xs text-slate-400">R$ {abcDados.valorB.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-xs text-slate-500">Até 95% do faturamento</div>
                                  </div>
                                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-950/30">
                                    <div className="text-[10px] uppercase font-bold text-slate-500">Classe C</div>
                                    <div className="text-2xl font-bold text-slate-100">{abcDados.c}</div>
                                    <div className="text-xs text-slate-400">R$ {abcDados.valorC.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-xs text-slate-500">Restante 5%</div>
                                  </div>
                                </div>
                                {(() => {
                                  const width = 900;
                                  const height = 300;
                                  const margin = { top: 50, right: 20, bottom: 80, left: 20 };
                                  const chartW = width - margin.left - margin.right;
                                  const chartH = height - margin.top - margin.bottom;
                                  const valores = [
                                    { label: 'A', valor: abcDados.valorA, itens: abcDados.a, cor: '#22c55e' },
                                    { label: 'B', valor: abcDados.valorB, itens: abcDados.b, cor: '#f59e0b' },
                                    { label: 'C', valor: abcDados.valorC, itens: abcDados.c, cor: '#ef4444' },
                                  ];
                                  const maxValor = Math.max(...valores.map((v) => v.valor), 1);
                                  const barW = chartW / valores.length;
                                  return (
                                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
                                      {valores.map((item, i) => {
                                        const minBarH = 36;
                                        const rawBarH = (item.valor / maxValor) * chartH;
                                        const barH = Math.max(rawBarH, minBarH);
                                        const x = margin.left + i * barW + 20;
                                        const y = margin.top + chartH - barH;
                                        const valorY = Math.max(y - 12, 18);
                                        const itensY = Math.max(y - 2, 34);
                                        return (
                                          <g key={item.label}>
                                            <rect x={x} y={y} width={barW - 40} height={barH} fill={item.cor} rx="10" />
                                            <text x={x + (barW - 40) / 2} y={valorY} textAnchor="middle" fontSize="14" fill="#e2e8f0" fontWeight="700">
                                              {formatarValorCurto(item.valor)}
                                            </text>
                                            <text x={x + (barW - 40) / 2} y={itensY} textAnchor="middle" fontSize="12" fill="#94a3b8">
                                              {item.itens} itens
                                            </text>
                                            <text x={x + (barW - 40) / 2} y={margin.top + chartH + 28} textAnchor="middle" fontSize="16" fill="#e2e8f0" fontWeight="800">
                                              {item.label}
                                            </text>
                                            <text x={x + (barW - 40) / 2} y={margin.top + chartH + 48} textAnchor="middle" fontSize="11" fill="#94a3b8">
                                              Classe {item.label}
                                            </text>
                                          </g>
                                        );
                                      })}
                                    </svg>
                                  );
                                })()}
                              </div>
                            )}
                            {paretoSelecionado && (
                              (() => {
                                const grupoSelecionado = faturamentoDados.porGrupo.find(
                                  (item) => item.grupo === paretoSelecionado
                                );
                                if (!grupoSelecionado || !grupoSelecionado.itens?.length) {
                                  return (
                                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                                      Nenhum item detalhado para este grupo.
                                    </div>
                                  );
                                }

                                const itensOrdenados = grupoSelecionado.itens
                                  .slice()
                                  .sort((a, b) => b.total - a.total);
                                const totalItens = itensOrdenados.reduce((acc, item) => acc + item.total, 0);
                                let acumulado = 0;
                                const itensClassificados = itensOrdenados.map((item) => {
                                  acumulado += item.total;
                                  const perc = totalItens > 0 ? (acumulado / totalItens) * 100 : 0;
                                  let classe = 'C';
                                  if (perc <= 80) {
                                    classe = 'A';
                                  } else if (perc <= 95) {
                                    classe = 'B';
                                  }
                                  return { ...item, classe };
                                });

                                return (
                                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40">
                                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                                      <div>
                                        <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                                          Itens do grupo selecionado
                                        </p>
                                        <p className="text-sm text-slate-200 font-semibold">
                                          {grupoSelecionado.grupo}
                                        </p>
                                      </div>
                                      <div className="text-xs text-slate-400">
                                        {grupoSelecionado.itens.length} itens
                                      </div>
                                    </div>
                                    <div className="max-h-72 overflow-auto">
                                      <table className="w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-slate-900/90 text-slate-400 uppercase tracking-wider">
                                          <tr>
                                            <th className="px-5 py-3">Código</th>
                                            <th className="px-5 py-3">Descrição</th>
                                            <th className="px-5 py-3">Classe</th>
                                            <th className="px-5 py-3 text-right">Valor</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                          {itensClassificados.map((item, index) => (
                                            <tr key={`${item.codigo}-${item.descricao}-${index}`} className="text-slate-200">
                                              <td className="px-5 py-3 font-semibold">{item.codigo || '-'}</td>
                                              <td className="px-5 py-3 text-slate-300">{item.descricao || '-'}</td>
                                              <td className="px-5 py-3">
                                                <span
                                                  className={`inline-flex min-w-[32px] items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                                                    item.classe === 'A'
                                                      ? 'bg-emerald-500/20 text-emerald-300'
                                                      : item.classe === 'B'
                                                        ? 'bg-amber-500/20 text-amber-300'
                                                        : 'bg-rose-500/20 text-rose-300'
                                                  }`}
                                                >
                                                  {item.classe}
                                                </span>
                                              </td>
                                              <td className="px-5 py-3 text-right font-semibold text-emerald-300">
                                                R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Top clientes</h3>
                    <div className="mt-4 space-y-4">
                      {faturamento2025.topClientes.slice(0, 6).map((item) => {
                        const share = faturamento2025.total !== 0 ? (item.valor / faturamento2025.total) * 100 : 0;
                        return (
                          <div key={item.cliente} className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{item.info?.nome || item.cliente}</p>
                              <p className="text-[11px] text-slate-500">
                                {item.info?.municipio ? `${item.info.municipio} / ${item.info.estado}` : 'Cliente sem cadastro'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-emerald-500">{formatarMoeda(item.valor)}</p>
                              <p className="text-[10px] text-slate-400">{share.toFixed(1)}% share</p>
                            </div>
                          </div>
                        );
                      })}
                      {faturamento2025.topClientes.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Sem dados de clientes.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Top produtos</h3>
                    <div className="mt-4 space-y-3">
                      {faturamento2025.topProdutos.slice(0, 6).map((item, index) => (
                        <div key={`${item.codigo}-${index}`} className="flex items-center justify-between text-xs text-slate-500">
                          <div>
                            <p className="font-semibold text-slate-700">{item.codigo || '-'}</p>
                            <p className="text-[10px] text-slate-400">{item.descricao || 'Sem descricao'}</p>
                          </div>
                          <span className="font-black text-slate-900">{formatarValorCurto(item.valor)}</span>
                        </div>
                      ))}
                      {faturamento2025.topProdutos.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Sem dados de produtos.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Filiais e mix</h3>
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Top filiais</p>
                        <div className="mt-3 space-y-2">
                          {faturamento2025.topFiliais.slice(0, 4).map((item) => (
                            <div key={item.filial} className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold text-slate-700">Filial {item.filial}</span>
                              <span className="font-black text-slate-900">{formatarValorCurto(item.valor)}</span>
                            </div>
                          ))}
                          {faturamento2025.topFiliais.length === 0 && (
                            <p className="text-xs text-slate-400 italic">Sem dados por filial.</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Mix por unidade</p>
                        <div className="mt-3 space-y-2">
                          {faturamento2025.mixUnidade.slice(0, 4).map((item) => (
                            <div key={item.unidade} className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold text-slate-700">{item.unidade || '-'}</span>
                              <span className="font-black text-slate-900">{item.quantidade.toFixed(0)}</span>
                            </div>
                          ))}
                          {faturamento2025.mixUnidade.length === 0 && (
                            <p className="text-xs text-slate-400 italic">Sem mix por unidade.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {subAbaFaturamento === 'atual' && (
                <div className="space-y-6">
                  <>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setMostrarFiltroFaturamento((prev) => !prev)}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            <ChevronRight
                              size={12}
                              className={`transition-transform ${mostrarFiltroFaturamento ? 'rotate-90' : ''}`}
                            />
                            Filtros (Filiais/Grupo/CFOP)
                          </button>
                          <span className="text-[10px] text-slate-400">
                            {filtroFilial} | {filtroFilialVend !== 'Todas' ? filtroFilialVend + ' | ' : ''}{filtroGrupo !== 'Todos' ? filtroGrupo + ' | ' : ''}{filtroCfops.length} CFOPs
                          </span>
                        </div>
                        {mostrarFiltroFaturamento && (
                          <>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                              <span className="mr-2">Filiais</span>
                              {['Todas', ...faturamentoAtual.filiais].map((filial) => (
                                <button
                                  key={filial}
                                  type="button"
                                  onClick={() => setFiltroFilial(filial)}
                                  className={`rounded-full px-3 py-2 transition-all ${
                                    filtroFilial === filial
                                      ? 'bg-blue-600 text-white shadow'
                                      : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  {filial}
                                </button>
                              ))}
                            </div>
                            {(faturamentoAtual.filiaisVend?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                <span className="mr-2">Filial Vend.</span>
                                {['Todas', ...faturamentoAtual.filiaisVend].map((fv) => (
                                  <button
                                    key={fv}
                                    type="button"
                                    onClick={() => setFiltroFilialVend(fv)}
                                    className={`rounded-full px-3 py-2 transition-all ${
                                      filtroFilialVend === fv
                                        ? 'bg-blue-600 text-white shadow'
                                        : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                                    }`}
                                  >
                                    {fv}
                                  </button>
                                ))}
                              </div>
                            )}
                            {(faturamentoAtual.gruposDisponiveis?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                <span className="mr-2">Grupo</span>
                                {['Todos', ...faturamentoAtual.gruposDisponiveis].map((g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => setFiltroGrupo(g)}
                                    className={`rounded-full px-3 py-2 transition-all ${
                                      filtroGrupo === g
                                        ? 'bg-violet-600 text-white shadow'
                                        : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                                    }`}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div>
                              <CfopFilterSelector
                                selected={filtroCfops}
                                onSelect={toggleCfopFilter}
                                label="CFOPs"
                                className="justify-start"
                              />
                            </div>
                  </>
                        )}
                      </div>
                      {kpisFiltradosProduto && (
                        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-bold text-blue-700">
                          <span>Filtro ativo:</span>
                          <span className="font-black">"{filtroGraficoProduto}"</span>
                          <span className="font-normal text-blue-500">— cards e gráfico refletem apenas este produto</span>
                          <button
                            type="button"
                            onClick={() => setFiltroGraficoProduto('')}
                            className="ml-auto text-blue-400 hover:text-blue-700 font-black"
                          >
                            ✕ Limpar
                          </button>
                        </div>
                      )}
                      {(() => {
                        const k = kpisFiltradosProduto;
                        const ativo = !!k;
                        const total       = Number(ativo ? k.total            : faturamentoAtual.total)            || 0;
                        const totalDev    = Number(ativo ? k.totalDevolucao   : faturamentoAtual.totalDevolucao)   || 0;
                        const dias        = Number(ativo ? k.diasAtivos       : faturamentoAtual.diasAtivos)       || 0;
                        const clientes    = Number(ativo ? k.clientesAtivos   : faturamentoAtual.clientesAtivos)   || 0;
                        const ticket      = Number(ativo ? k.ticketMedio      : faturamentoAtual.ticketMedio)      || 0;
                        const mediaDia    = dias > 0 ? total / dias : 0;
                        const fmt = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                        const cellBase = 'bg-console-panel px-5 py-4';
                        const cellActive = ativo ? 'ring-1 ring-inset ring-console-accent/50' : '';
                        return (
                          <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-console-border bg-console-border sm:grid-cols-2 xl:grid-cols-6">
                            <div className={`${cellBase} ${cellActive} xl:col-span-2`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Faturamento do periodo</p>
                              <p className="mt-2 font-console-mono text-3xl font-semibold tabular-nums text-console-ink">{fmt(total)}</p>
                              <p className="mt-1 text-xs text-console-dim">Liquido no periodo</p>
                            </div>
                            <div className={`${cellBase} ${cellActive}`}>
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Devolucoes (CFOP)</p>
                                {!ativo && (
                                  <span
                                    title={[
                                      'Situacao CFOP',
                                      ...Object.entries(CFOP_DEVOLUCAO_LABELS).map(([cfop, label]) => {
                                        const valor = faturamentoAtual.devolucoesPorCfop?.[cfop] || 0;
                                        return `${label} (${cfop}): ${formatarMoeda(valor)}`;
                                      }),
                                    ].join('\n')}
                                    className="text-console-faint"
                                  >
                                    <Info size={13} />
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 font-console-mono text-xl font-semibold tabular-nums text-console-critical">{fmt(totalDev)}</p>
                              <p className="mt-1 text-xs text-console-dim">No periodo</p>
                            </div>
                            <div className={`${cellBase} ${cellActive}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Fat. medio/dia</p>
                              <p className="mt-2 font-console-mono text-xl font-semibold tabular-nums text-console-ink">{fmt(mediaDia)}</p>
                              <p className="mt-1 text-xs text-console-dim">Media nos dias ativos</p>
                            </div>
                            <div className={`${cellBase} ${cellActive}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Ticket medio</p>
                              <p className="mt-2 font-console-mono text-xl font-semibold tabular-nums text-console-ink">{fmt(ticket)}</p>
                              <p className="mt-1 text-xs text-console-dim">Por movimento</p>
                            </div>
                            <div className={`${cellBase} ${cellActive}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-console-faint">Clientes ativos</p>
                              <p className="mt-2 font-console-mono text-xl font-semibold tabular-nums text-console-ink">{clientes}</p>
                              <p className="mt-1 text-xs text-console-dim">Com vendas no mes</p>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm xl:col-span-3">
                          <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Faturamento por dia</h4>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Mes</span>
                                <select
                                  value={faturamentoMes}
                                  onChange={(event) => aplicarFiltroMes(faturamentoAno, event.target.value)}
                                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                >
                                  {mesesDoAnoSelecionado.map((mes) => (
                                    <option key={mes} value={mes}>
                                      {mesesLabelFaturamento[Number(mes) - 1] || mes}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Filtrar por produto ou código..."
                                  value={filtroGraficoProduto}
                                  onChange={(e) => setFiltroGraficoProduto(e.target.value)}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 w-52"
                                />
                                {filtroGraficoProduto && (
                                  <button
                                    type="button"
                                    onClick={() => setFiltroGraficoProduto('')}
                                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              <span className="text-xs text-slate-400">
                                {faturamentoAtual.porDia.filter((item) =>
                                  String(item.dia || '').startsWith(`${faturamentoAno}-${faturamentoMes}`)
                                ).length}{' '}
                                dias
                              </span>
                            </div>
                          </div>
                          {(() => {
                            const prefixoMes = `${faturamentoAno}-${faturamentoMes}`;
                            const termoBusca = filtroGraficoProduto.trim().toLowerCase();
                            let dadosMes;
                            let linhasMesFiltradas = [];
                            if (termoBusca) {
                              linhasMesFiltradas = (faturamentoAtual.linhas || []).filter((row) => {
                                const diaISO = obterDataIsoUtc(row.emissao);
                                if (!String(diaISO || '').startsWith(prefixoMes)) return false;
                                const codigo = String(row.codigo || '').toLowerCase();
                                const descricao = String(row.descricao || '').toLowerCase();
                                return codigo.includes(termoBusca) || descricao.includes(termoBusca);
                              });
                              const diaMap = new Map();
                              linhasMesFiltradas.forEach((row) => {
                                const diaISO = obterDataIsoUtc(row.emissao);
                                const val = row.tipoMovimento === 'devolucao' ? -Math.abs(row.valorTotal || 0) : (row.valorTotal || 0);
                                diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + val);
                              });
                              dadosMes = Array.from(diaMap.entries())
                                .map(([dia, valor]) => ({ dia, valor }))
                                .sort((a, b) => a.dia.localeCompare(b.dia));
                            } else {
                              dadosMes = faturamentoAtual.porDia.filter((item) =>
                                String(item.dia || '').startsWith(prefixoMes)
                              );
                            }
                            const handleExportarGraficoExcel = () => {
                              const linhasExport = (termoBusca ? linhasMesFiltradas : (faturamentoAtual.linhas || []).filter((row) => {
                                const diaISO = obterDataIsoUtc(row.emissao);
                                return String(diaISO || '').startsWith(prefixoMes);
                              })).map((row) => {
                                const codigoCli = normalizarCodigoCliente(row.cliente);
                                const infoCli = codigoCli ? clientesPorCodigo.get(codigoCli) : null;
                                return {
                                  Data: formatarDataUtcPtBr(row.emissao) || '',
                                  Tipo: row.tipoMovimento === 'devolucao' ? 'Devolucao' : 'Venda',
                                  Cliente: row.cliente || '',
                                  Nome: row.clienteNome || '',
                                  UF: infoCli?.Estado || infoCli?.estado || infoCli?.uf || '',
                                  Cidade: infoCli?.Municipio || infoCli?.municipio || infoCli?.cidade || '',
                                  Vendedor: row.vendedorNome || '',
                                  Filial: row.filial || '',
                                  Grupo: row.grupo || '',
                                  Codigo: row.codigo || '',
                                  Descricao: normalizarDescricaoProduto(row.descricao) || '',
                                  Quantidade: row.quantidade ?? 0,
                                  Unidade: row.unidade || '',
                                  Valor: row.valorTotal ?? 0,
                                  NF: row.nf || '',
                                };
                              });
                              if (!linhasExport.length) return;
                              const wb = XLSX.utils.book_new();
                              const ws = XLSX.utils.json_to_sheet(linhasExport);
                              XLSX.utils.book_append_sheet(wb, ws, 'Faturamento');
                              const sufixo = termoBusca ? `_${termoBusca.replace(/\s+/g, '_')}` : '';
                              XLSX.writeFile(wb, `faturamento_${prefixoMes}${sufixo}.xlsx`);
                            };
                            const handleExportarFechamentoPdf = async () => {
                              const k = kpisFiltradosProduto;
                              const ativo = !!k;
                              const total = Number(ativo ? k.total : faturamentoAtual.total) || 0;
                              const totalDev = Number(ativo ? k.totalDevolucao : faturamentoAtual.totalDevolucao) || 0;
                              const dias = Number(ativo ? k.diasAtivos : faturamentoAtual.diasAtivos) || 0;
                              const clientes = Number(ativo ? k.clientesAtivos : faturamentoAtual.clientesAtivos) || 0;
                              const ticket = Number(ativo ? k.ticketMedio : faturamentoAtual.ticketMedio) || 0;
                              const mediaDia = dias > 0 ? total / dias : 0;
                              const mesLabel = mesesLabelFaturamento[Number(faturamentoMes) - 1] || faturamentoMes;

                              const linhasRelatorio = termoBusca
                                ? faturamentoLinhasComVendedor.filter((row) => {
                                    const codigo = String(row.codigo || '').toLowerCase();
                                    const descricao = String(row.descricao || '').toLowerCase();
                                    return codigo.includes(termoBusca) || descricao.includes(termoBusca);
                                  })
                                : faturamentoLinhasComVendedor;

                              let topClientes;
                              let topProdutos;
                              if (ativo) {
                                const clientesMapRel = new Map();
                                const produtosMapRel = new Map();
                                linhasRelatorio.forEach((row) => {
                                  const codigoCli = normalizarCodigoCliente(row.cliente);
                                  const infoCli = codigoCli ? clientesPorCodigo.get(codigoCli) : null;
                                  const chaveCli = codigoCli || String(row.cliente || 'Sem cliente');
                                  if (!clientesMapRel.has(chaveCli)) {
                                    clientesMapRel.set(chaveCli, { cliente: chaveCli, valor: 0, info: infoCli });
                                  }
                                  clientesMapRel.get(chaveCli).valor += row.valorTotal || 0;

                                  const chaveProd = `${row.codigo || ''}||${row.descricao || ''}`;
                                  if (!produtosMapRel.has(chaveProd)) {
                                    produtosMapRel.set(chaveProd, {
                                      codigo: row.codigo || '',
                                      descricao: row.descricao || '',
                                      valor: 0,
                                      quantidade: 0,
                                    });
                                  }
                                  const prodRel = produtosMapRel.get(chaveProd);
                                  prodRel.valor += row.valorTotal || 0;
                                  prodRel.quantidade += Number(row.quantidade) || 0;
                                });
                                topClientes = Array.from(clientesMapRel.values()).sort((a, b) => b.valor - a.valor).slice(0, 8);
                                topProdutos = Array.from(produtosMapRel.values()).sort((a, b) => b.valor - a.valor).slice(0, 8);
                              } else {
                                topClientes = (faturamentoAtual.topClientes || []).slice(0, 8);
                                topProdutos = (faturamentoAtual.topProdutos || []).slice(0, 8);
                              }

                              const vendedorMapRel = new Map();
                              linhasRelatorio.forEach((row) => {
                                const vendedor = row.vendedorNome || 'Sem vendedor';
                                if (!vendedorMapRel.has(vendedor)) {
                                  vendedorMapRel.set(vendedor, { vendedor, valor: 0, movimentos: 0 });
                                }
                                const item = vendedorMapRel.get(vendedor);
                                item.valor += row.valorTotal || 0;
                                item.movimentos += 1;
                              });
                              const porVendedor = Array.from(vendedorMapRel.values()).sort((a, b) => b.valor - a.valor).slice(0, 10);

                              let devolucoesCfopRel;
                              if (ativo) {
                                const mapaCfop = new Map();
                                linhasRelatorio
                                  .filter((row) => row.tipoMovimento === 'devolucao')
                                  .forEach((row) => {
                                    const cfop = String(row.cfop || '').trim();
                                    if (!cfop) return;
                                    mapaCfop.set(cfop, (mapaCfop.get(cfop) || 0) + Math.abs(row.valorTotal || 0));
                                  });
                                devolucoesCfopRel = Array.from(mapaCfop.entries());
                              } else {
                                devolucoesCfopRel = Object.entries(faturamentoAtual.devolucoesPorCfop || {});
                              }
                              devolucoesCfopRel = devolucoesCfopRel.sort((a, b) => b[1] - a[1]);

                              const diaMaisForte = dadosMes.reduce(
                                (best, item) => (item.valor > (best?.valor ?? -Infinity) ? item : best),
                                null
                              );
                              const diaMaisFraco = dadosMes.reduce(
                                (worst, item) => (item.valor < (worst?.valor ?? Infinity) ? item : worst),
                                null
                              );

                              // Paleta e helpers visuais
                              const NAVY = [15, 23, 42];
                              const SLATE = [100, 116, 139];
                              const SLATE_LIGHT = [148, 163, 184];
                              const BORDER = [226, 232, 240];
                              const CARDS = [
                                { titulo: 'Faturamento do período', valor: formatarMoeda(total), sub: 'Líquido no período', accent: [37, 99, 235], tint: [239, 246, 255] },
                                { titulo: 'Devoluções (CFOP)', valor: formatarMoeda(totalDev), sub: 'Valores de devolução', accent: [225, 29, 72], tint: [255, 241, 242] },
                                { titulo: 'Fat. médio / dia', valor: formatarMoeda(mediaDia), sub: 'Média nos dias com venda', accent: [79, 70, 229], tint: [238, 242, 255] },
                                { titulo: 'Ticket médio', valor: formatarMoeda(ticket), sub: 'Por movimento', accent: [124, 58, 237], tint: [245, 243, 255] },
                                { titulo: 'Clientes ativos', valor: String(clientes), sub: 'Com vendas no mês', accent: [5, 150, 105], tint: [236, 253, 245] },
                                { titulo: 'Dias ativos', valor: String(dias), sub: 'Dias com faturamento', accent: [217, 119, 6], tint: [255, 251, 235] },
                              ];

                              const loadImageAsDataUrl = (url) =>
                                fetch(url)
                                  .then((res) => res.blob())
                                  .then(
                                    (blob) =>
                                      new Promise((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onload = () => resolve(reader.result);
                                        reader.onerror = reject;
                                        reader.readAsDataURL(blob);
                                      })
                                  )
                                  .catch(() => null);

                              const logoDataUrl = await loadImageAsDataUrl(logoMetalosa);

                              const doc = new jsPDF();
                              const pageWidth = doc.internal.pageSize.getWidth();
                              const pageHeight = doc.internal.pageSize.getHeight();
                              const marginX = 14;
                              const contentW = pageWidth - marginX * 2;

                              const drawFooter = () => {
                                const pageCount = doc.internal.getNumberOfPages();
                                for (let i = 1; i <= pageCount; i += 1) {
                                  doc.setPage(i);
                                  doc.setDrawColor(...BORDER);
                                  doc.setLineWidth(0.2);
                                  doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14);
                                  doc.setFontSize(8);
                                  doc.setFont(undefined, 'normal');
                                  doc.setTextColor(...SLATE_LIGHT);
                                  doc.text('Metalosa · Fechamento de Faturamento', marginX, pageHeight - 9);
                                  doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, pageHeight - 9, { align: 'right' });
                                }
                              };

                              const ensureSpace = (currentY, needed) => {
                                if (currentY + needed > pageHeight - 20) {
                                  doc.addPage();
                                  return 22;
                                }
                                return currentY;
                              };

                              const sectionTitle = (texto, y) => {
                                doc.setFillColor(...NAVY);
                                doc.rect(marginX, y - 4, 3, 5, 'F');
                                doc.setFontSize(11.5);
                                doc.setFont(undefined, 'bold');
                                doc.setTextColor(...NAVY);
                                doc.text(texto, marginX + 6, y);
                                return y + 7;
                              };

                              // ===== Cabeçalho =====
                              doc.setFillColor(...NAVY);
                              doc.rect(0, 0, pageWidth, 34, 'F');
                              if (logoDataUrl) {
                                try {
                                  doc.addImage(logoDataUrl, 'PNG', marginX, 8, 22, 14.9);
                                } catch (err) {
                                  /* logo indisponível, segue sem imagem */
                                }
                              }
                              const textX = logoDataUrl ? marginX + 28 : marginX;
                              doc.setTextColor(255, 255, 255);
                              doc.setFontSize(17);
                              doc.setFont(undefined, 'bold');
                              doc.text('Fechamento de Faturamento', textX, 15);
                              doc.setFontSize(11);
                              doc.setFont(undefined, 'normal');
                              doc.text(
                                `${mesLabel} de ${faturamentoAno}${termoBusca ? ` — filtro: "${filtroGraficoProduto}"` : ''}`,
                                textX,
                                22
                              );
                              doc.setFontSize(8.5);
                              doc.setTextColor(190, 200, 215);
                              doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, textX, 28);
                              doc.setTextColor(0, 0, 0);

                              // ===== Cards de indicadores =====
                              let y = 46;
                              const gap = 4;
                              const cardW = (contentW - gap * 2) / 3;
                              const cardH = 24;
                              CARDS.forEach((card, i) => {
                                const col = i % 3;
                                const row = Math.floor(i / 3);
                                const x = marginX + col * (cardW + gap);
                                const cy = y + row * (cardH + gap);
                                doc.setFillColor(...card.tint);
                                doc.roundedRect(x, cy, cardW, cardH, 2, 2, 'F');
                                doc.setFillColor(...card.accent);
                                doc.circle(x + cardW - 5, cy + 5, 1.4, 'F');
                                doc.setFontSize(7.5);
                                doc.setFont(undefined, 'bold');
                                doc.setTextColor(...SLATE);
                                doc.text(card.titulo.toUpperCase(), x + 6, cy + 7);
                                doc.setFontSize(13);
                                doc.setFont(undefined, 'bold');
                                doc.setTextColor(...NAVY);
                                doc.text(card.valor, x + 6, cy + 15);
                                doc.setFontSize(7);
                                doc.setFont(undefined, 'normal');
                                doc.setTextColor(...SLATE);
                                doc.text(card.sub, x + 6, cy + 20.5);
                              });
                              y += 2 * (cardH + gap) + 6;

                              // ===== Gráfico de faturamento por dia =====
                              y = sectionTitle('Faturamento por dia', y);
                              const chartX = marginX;
                              const chartW = contentW;
                              const chartH = 52;
                              const chartY = y + 4;
                              const maxValor = Math.max(...dadosMes.map((item) => Math.abs(item.valor)), 1);

                              doc.setDrawColor(...BORDER);
                              doc.setLineWidth(0.2);
                              [0.25, 0.5, 0.75, 1].forEach((p) => {
                                const gy = chartY + chartH * (1 - p);
                                doc.line(chartX, gy, chartX + chartW, gy);
                                doc.setFontSize(6);
                                doc.setTextColor(...SLATE_LIGHT);
                                doc.text(formatarValorCurto(maxValor * p), chartX + chartW, gy - 0.8, { align: 'right' });
                              });

                              const barGap = 1;
                              const barSlot = chartW / Math.max(dadosMes.length, 1);
                              const barW = Math.max(barSlot - barGap, 1);
                              dadosMes.forEach((item, i) => {
                                const bx = chartX + i * barSlot + barGap / 2;
                                const barH = (Math.abs(item.valor) / maxValor) * chartH;
                                const by = chartY + chartH - barH;
                                const cor = item.valor >= 0 ? [37, 99, 235] : [225, 29, 72];
                                doc.setFillColor(...cor);
                                doc.rect(bx, by, barW, Math.max(barH, 0.4), 'F');
                                if (barSlot >= 5) {
                                  doc.setFontSize(5.5);
                                  doc.setTextColor(...SLATE);
                                  doc.text(item.dia.slice(8), bx + barW / 2, chartY + chartH + 4, { align: 'center' });
                                }
                              });
                              y = chartY + chartH + 10;

                              if (diaMaisForte && diaMaisFraco) {
                                doc.setFontSize(8.5);
                                doc.setFont(undefined, 'normal');
                                doc.setTextColor(...SLATE);
                                const melhorData = new Date(`${diaMaisForte.dia}T00:00:00`).toLocaleDateString('pt-BR');
                                const piorData = new Date(`${diaMaisFraco.dia}T00:00:00`).toLocaleDateString('pt-BR');
                                doc.text(
                                  `Melhor dia: ${melhorData} (${formatarMoeda(diaMaisForte.valor)})   •   Menor dia: ${piorData} (${formatarMoeda(diaMaisFraco.valor)})`,
                                  marginX,
                                  y
                                );
                                y += 8;
                              }

                              // ===== Faturamento por dia (tabela) =====
                              doc.addPage();
                              y = 22;
                              y = sectionTitle('Detalhamento diário', y);
                              autoTable(doc, {
                                startY: y,
                                head: [['Dia', 'Faturamento']],
                                body: dadosMes.map((item) => [
                                  new Date(`${item.dia}T00:00:00`).toLocaleDateString('pt-BR'),
                                  formatarMoeda(item.valor),
                                ]),
                                theme: 'striped',
                                styles: { fontSize: 8, cellPadding: 2 },
                                headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
                                alternateRowStyles: { fillColor: [248, 250, 252] },
                                margin: { left: marginX, right: marginX },
                                columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
                              });
                              y = doc.lastAutoTable.finalY + 14;

                              // ===== Top clientes =====
                              y = ensureSpace(y, 20);
                              y = sectionTitle('Top clientes do período', y);
                              autoTable(doc, {
                                startY: y,
                                head: [['Cliente', 'Cidade/UF', 'Faturamento']],
                                body: topClientes.length
                                  ? topClientes.map((item) => [
                                      item.info?.nome || item.cliente,
                                      [item.info?.municipio, item.info?.estado].filter(Boolean).join(' / ') || '-',
                                      formatarMoeda(item.valor),
                                    ])
                                  : [['Sem dados para o período', '', '']],
                                theme: 'striped',
                                styles: { fontSize: 8, cellPadding: 2 },
                                headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
                                alternateRowStyles: { fillColor: [248, 250, 252] },
                                margin: { left: marginX, right: marginX },
                                columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
                              });
                              y = doc.lastAutoTable.finalY + 12;

                              // ===== Top produtos =====
                              y = ensureSpace(y, 20);
                              y = sectionTitle('Top produtos do período', y);
                              autoTable(doc, {
                                startY: y,
                                head: [['Código', 'Descrição', 'Qtd.', 'Faturamento']],
                                body: topProdutos.length
                                  ? topProdutos.map((item) => [
                                      item.codigo || '-',
                                      item.descricao || '-',
                                      Number(item.quantidade || 0).toLocaleString('pt-BR'),
                                      formatarMoeda(item.valor),
                                    ])
                                  : [['-', 'Sem dados para o período', '', '']],
                                theme: 'striped',
                                styles: { fontSize: 8, cellPadding: 2 },
                                headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
                                alternateRowStyles: { fillColor: [248, 250, 252] },
                                margin: { left: marginX, right: marginX },
                                columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
                              });
                              y = doc.lastAutoTable.finalY + 12;

                              // ===== Faturamento por vendedor =====
                              y = ensureSpace(y, 20);
                              y = sectionTitle('Faturamento por vendedor', y);
                              autoTable(doc, {
                                startY: y,
                                head: [['Vendedor', 'Movimentos', 'Faturamento']],
                                body: porVendedor.length
                                  ? porVendedor.map((item) => [
                                      item.vendedor,
                                      String(item.movimentos),
                                      formatarMoeda(item.valor),
                                    ])
                                  : [['Sem dados para o período', '', '']],
                                theme: 'striped',
                                styles: { fontSize: 8, cellPadding: 2 },
                                headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
                                alternateRowStyles: { fillColor: [248, 250, 252] },
                                margin: { left: marginX, right: marginX },
                                columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
                              });
                              y = doc.lastAutoTable.finalY + 12;

                              // ===== Devoluções por CFOP =====
                              if (devolucoesCfopRel.length) {
                                y = ensureSpace(y, 20);
                                y = sectionTitle('Devoluções por CFOP', y);
                                autoTable(doc, {
                                  startY: y,
                                  head: [['CFOP', 'Descrição', 'Valor']],
                                  body: devolucoesCfopRel.map(([cfop, valor]) => [
                                    cfop,
                                    CFOP_DEVOLUCAO_LABELS[cfop] || '-',
                                    formatarMoeda(valor),
                                  ]),
                                  theme: 'striped',
                                  styles: { fontSize: 8, cellPadding: 2 },
                                  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
                                  alternateRowStyles: { fillColor: [248, 250, 252] },
                                  margin: { left: marginX, right: marginX },
                                  columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
                                });
                              }

                              drawFooter();

                              const sufixoPdf = termoBusca ? `_${termoBusca.replace(/\s+/g, '_')}` : '';
                              doc.save(`fechamento_faturamento_${prefixoMes}${sufixoPdf}.pdf`);
                            };
                            const dados = dadosMes;
                            if (!dados.length) {
                              return (
                                <div className="h-60 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl">
                                  <p className="text-slate-400 text-sm italic">Sem dados para o mês selecionado.</p>
                                </div>
                              );
                            }
                            const height = 420;
                            const margin = { top: 54, right: 16, bottom: 50, left: 16 };
                            const slotWidth = 90;
                            const minWidth = 520;
                            const maxWidth = 1400;
                            const width = Math.max(
                              minWidth,
                              Math.min(maxWidth, margin.left + margin.right + slotWidth * Math.max(dados.length, 1))
                            );
                            const chartW = width - margin.left - margin.right;
                            const chartH = height - margin.top - margin.bottom;
                            const maxValor = Math.max(...dados.map((item) => Math.abs(item.valor)), 1);
                            const barW = chartW / Math.max(dados.length, 1);
                            const barGap = 8;
                            const barWidth = Math.min(90, Math.max(barW - barGap, 10));
                            const variacoes = dados.map((item, i) => {
                              if (i === 0) return null;
                              const anterior = dados[i - 1].valor;
                              if (!Number.isFinite(anterior) || anterior === 0) return null;
                              return ((item.valor - anterior) / anterior) * 100;
                            });

                            const handleDiaClick = (dia, event) => {
                              const multiselect = event?.ctrlKey || event?.metaKey;
                              setDiasFaturamentoSelecionados((prev) => {
                                const existe = prev.includes(dia);
                                if (multiselect) {
                                  if (existe) return prev.filter((item) => item !== dia);
                                  return [...prev, dia].sort();
                                }
                                if (existe && prev.length === 1) return [];
                                return [dia];
                              });
                            };
                            const diasSelecionadosOrdenados = [...diasFaturamentoSelecionados].sort();
                            const periodoSelecionadoTitulo =
                              diasSelecionadosOrdenados.length === 1
                                ? new Date(`${diasSelecionadosOrdenados[0]}T00:00:00`).toLocaleDateString('pt-BR')
                                : diasSelecionadosOrdenados.length > 1
                                ? `${new Date(`${diasSelecionadosOrdenados[0]}T00:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${diasSelecionadosOrdenados[diasSelecionadosOrdenados.length - 1]}T00:00:00`).toLocaleDateString('pt-BR')} (${diasSelecionadosOrdenados.length} dias)`
                                : '';

                            return (
                              <div className="space-y-4">
                                <div className="overflow-x-auto">
                                  <svg
                                    viewBox={`0 0 ${width} ${height}`}
                                    className="h-[420px] block mx-auto"
                                    style={{ width }}
                                  >
                                <defs>
                                  <linearGradient id="diaBar" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.95" />
                                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.9" />
                                  </linearGradient>
                                </defs>
                                {[0.25, 0.5, 0.75, 1].map((p) => (
                                  <line
                                    key={p}
                                    x1={margin.left}
                                    x2={width - margin.right}
                                    y1={margin.top + chartH * (1 - p)}
                                    y2={margin.top + chartH * (1 - p)}
                                    stroke="#1f2937"
                                    strokeDasharray="4 6"
                                  />
                                ))}
                                {dados.map((item, i) => {
                                  const xBase = margin.left + i * barW + barGap / 2;
                                  const barH = (Math.abs(item.valor) / maxValor) * chartH;
                                  const y = margin.top + chartH - barH;
                                  const isSelecionado = diasFaturamentoSelecionados.includes(item.dia);
                                  const variacao = variacoes[i];
                                  const variacaoTexto =
                                    variacao === null || !Number.isFinite(variacao)
                                      ? null
                                      : `${variacao > 0 ? '+' : ''}${variacao.toFixed(0)}%`;
                                  const isPositiva = variacao !== null && variacao >= 0;
                                  const corVariacao = isPositiva ? '#22c55e' : '#f87171';
                                  const xCentro = xBase + barWidth / 2;
                                  const xVariacao = xBase + barWidth / 2;
                                  const yVariacao = Math.min(y + 14, margin.top + chartH - 10);
                                  return (
                                    <g key={item.dia} className="cursor-pointer" onClick={(event) => handleDiaClick(item.dia, event)}>
                                      <rect
                                        x={xBase}
                                        y={y}
                                        width={barWidth}
                                        height={barH}
                                        rx="6"
                                        fill="url(#diaBar)"
                                        stroke={isSelecionado ? '#fbbf24' : 'none'}
                                        strokeWidth={isSelecionado ? 2 : 0}
                                      />
                                      {variacaoTexto && (
                                        <g>
                                          <text
                                            x={xVariacao}
                                            y={yVariacao - 6}
                                            textAnchor="middle"
                                            fontSize="12"
                                            fill={corVariacao}
                                            fontWeight="700"
                                          >
                                            {variacaoTexto}
                                          </text>
                                          <path
                                            d={
                                              isPositiva
                                                ? `M ${xVariacao} ${yVariacao + 4} L ${xVariacao - 3} ${yVariacao + 9} L ${xVariacao + 3} ${yVariacao + 9} Z`
                                                : `M ${xVariacao} ${yVariacao + 9} L ${xVariacao - 3} ${yVariacao + 4} L ${xVariacao + 3} ${yVariacao + 4} Z`
                                            }
                                            fill={corVariacao}
                                          />
                                        </g>
                                      )}
                                      <text
                                        x={xBase + barWidth / 2}
                                        y={Math.max(y - 10, 18)}
                                        textAnchor="middle"
                                        fontSize="14"
                                        fill="#e2e8f0"
                                        fontWeight="700"
                                      >
                                        {formatarValorCurto(item.valor)}
                                      </text>
                                      <text
                                        x={xBase + barWidth / 2}
                                        y={margin.top + chartH + 20}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fill="#94a3b8"
                                      >
                                        {item.dia.slice(8)}
                                      </text>
                                    </g>
                                  );
                                })}
                                  </svg>
                                </div>
                                {termoBusca && (
                                  <div className="flex items-center justify-between px-1">
                                    <p className="text-[11px] text-slate-400">
                                      Filtro: <span className="font-bold text-blue-600">"{filtroGraficoProduto}"</span>
                                      {' '}— {dadosMes.length} dia(s) com resultado
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={handleExportarGraficoExcel}
                                        className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                                      >
                                        ↓ Baixar Excel filtrado
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleExportarFechamentoPdf}
                                        className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                                      >
                                        ↓ Baixar PDF do fechamento
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {!termoBusca && (
                                  <div className="flex justify-end gap-2 px-1">
                                    <button
                                      type="button"
                                      onClick={handleExportarGraficoExcel}
                                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition"
                                    >
                                      ↓ Baixar Excel do mês
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleExportarFechamentoPdf}
                                      className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                                    >
                                      ↓ Baixar PDF do fechamento
                                    </button>
                                  </div>
                                )}
                              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                                      {faturamentoTabelaView === 'dia'
                                        ? diasFaturamentoSelecionados.length > 1
                                          ? 'Detalhe do periodo'
                                          : 'Detalhe do dia'
                                        : 'Visao por vendedor'}
                                    </p>
                                    {faturamentoTabelaView === 'dia' ? (
                                      diasFaturamentoSelecionados.length > 0 ? (
                                        <p className="text-lg font-black text-white">
                                          {periodoSelecionadoTitulo}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-slate-400">
                                          Selecione no grafico. Use Ctrl + clique para varios dias.
                                        </p>
                                      )
                                    ) : (
                                      <p className="text-sm text-slate-400">Resumo por vendedor no periodo.</p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex rounded-full border border-slate-700/80 bg-slate-950/70 p-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                                      <button
                                        type="button"
                                        onClick={() => setFaturamentoTabelaView('dia')}
                                        className={`rounded-full px-3 py-1 transition ${
                                          faturamentoTabelaView === 'dia'
                                            ? 'bg-sky-300 text-slate-900 shadow'
                                            : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                                        }`}
                                      >
                                        Dia
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setFaturamentoTabelaView('vendedor')}
                                        className={`rounded-full px-3 py-1 transition ${
                                          faturamentoTabelaView === 'vendedor'
                                            ? 'bg-sky-300 text-slate-900 shadow'
                                            : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                                        }`}
                                      >
                                        Vendedor
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                      <input
                                        type="date"
                                        value={faturamentoInicio}
                                        onChange={(event) => setFaturamentoInicio(event.target.value)}
                                        className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200"
                                      />
                                      <span className="text-slate-500">a</span>
                                      <input
                                        type="date"
                                        value={faturamentoFim}
                                        onChange={(event) => setFaturamentoFim(event.target.value)}
                                        className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200"
                                      />
                                      {(faturamentoInicio || faturamentoFim) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFaturamentoInicio('');
                                            setFaturamentoFim('');
                                          }}
                                          className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white"
                                        >
                                          Limpar datas
                                        </button>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleExportarFaturamentoExcel}
                                      disabled={!exportFaturamentoDisponivel}
                                      className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                                        exportFaturamentoDisponivel
                                          ? 'border-emerald-400 text-emerald-200 hover:text-white'
                                          : 'border-slate-700 text-slate-500 cursor-not-allowed'
                                      }`}
                                    >
                                      Baixar Excel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleExportarRelatorioExecutivoAnual}
                                      title={`Relatório executivo completo do ano ${faturamentoAno}: evolução mensal, filiais, produtos, clientes e vendedores`}
                                      className="rounded-full border border-rose-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-200 hover:text-white transition"
                                    >
                                      Relatório executivo (PDF)
                                    </button>
                                    {faturamentoTabelaView === 'dia' && diasFaturamentoSelecionados.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setDiasFaturamentoSelecionados([])}
                                        className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white"
                                      >
                                        Limpar selecao
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {faturamentoTabelaView === 'dia' ? (
                                  diasFaturamentoSelecionados.length > 0 ? (
                                    <>
                                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>
                                            {detalhesDiaFaturamento?.diasSelecionados?.length > 1
                                              ? 'Total do periodo'
                                              : 'Total do dia'}
                                          </p>
                                          <p className="text-base font-black text-white mt-1">
                                            {formatarMoeda(detalhesDiaFaturamento?.totalDia || 0)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Faturamento</p>
                                          <p className="text-base font-black text-emerald-300 mt-1">
                                            {formatarMoeda(detalhesDiaFaturamento?.totalBrutoDia || 0)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Devolucoes</p>
                                          <p className="text-base font-black text-rose-300 mt-1">
                                            {formatarMoeda(detalhesDiaFaturamento?.totalDevolucaoDia || 0)}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-3 grid grid-cols-2 lg:grid-cols-7 gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Dias</p>
                                          <p className="text-base font-black text-white mt-1">
                                            {insightsPeriodoFaturamento?.dias || 0}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Movimentos</p>
                                          <p className="text-base font-black text-white mt-1">
                                            {insightsPeriodoFaturamento?.movimentos || 0}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Clientes</p>
                                          <p className="text-base font-black text-white mt-1">
                                            {insightsPeriodoFaturamento?.clientesAtivos || 0}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Ticket medio</p>
                                          <p className="text-base font-black text-blue-200 mt-1">
                                            {formatarMoeda(insightsPeriodoFaturamento?.ticketMedio || 0)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Fat. medio/dia</p>
                                          <p className="text-base font-black text-cyan-200 mt-1">
                                            {formatarMoeda(insightsPeriodoFaturamento?.faturamentoMedioDia || 0)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Bruto</p>
                                          <p className="text-base font-black text-emerald-300 mt-1">
                                            {formatarMoeda(insightsPeriodoFaturamento?.faturamentoBruto || 0)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Devolucoes</p>
                                          <p className="text-base font-black text-rose-300 mt-1">
                                            {formatarMoeda(insightsPeriodoFaturamento?.devolucoes || 0)}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-800">
                                        <table className="w-full text-left text-xs">
                                          <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider">
                                            <tr>
                                              <th className="px-3 py-3">Tipo</th>
                                              <th className="px-3 py-3">Cliente</th>
                                              <th className="px-3 py-3">Nome</th>
                                              <th className="px-3 py-3">Vendedor</th>
                                              <th className="px-3 py-3">Filial</th>
                                              <th className="px-3 py-3">Grupo</th>
                                              <th className="px-3 py-3">Codigo</th>
                                              <th className="px-3 py-3">Descricao</th>
                                              <th className="px-3 py-3 text-right">Qtd</th>
                                              <th className="px-3 py-3">Un</th>
                                              <th className="px-3 py-3 text-right">Valor</th>
                                              <th className="px-3 py-3">NF</th>
                                              <th className="px-3 py-3">CFOP</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800 text-slate-200">
                                            {(detalhesDiaFaturamento?.linhas || []).map((row, index) => (
                                              <tr key={`${row.nf || row.codigo}-${index}`}>
                                                <td
                                                  className={`px-3 py-2 font-bold ${
                                                    row.tipoMovimento === 'devolucao'
                                                      ? 'text-rose-300'
                                                      : 'text-emerald-300'
                                                  }`}
                                                >
                                                  {row.tipoMovimento === 'devolucao' ? 'Devolucao' : 'Venda'}
                                                </td>
                                                <td className="px-3 py-2">{row.cliente || '-'}</td>
                                                <td className="px-3 py-2">{row.clienteNome || '-'}</td>
                                                <td className="px-3 py-2">{row.vendedorNome || '-'}</td>
                                                <td className="px-3 py-2">{row.filial || '-'}</td>
                                                <td className="px-3 py-2">{row.grupo || '-'}</td>
                                                <td className="px-3 py-2 font-semibold">{row.codigo || '-'}</td>
                                                <td className="px-3 py-2">{row.descricao || '-'}</td>
                                                <td className="px-3 py-2 text-right">
                                                  {Number(row.quantidade || 0).toLocaleString('pt-BR', {
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </td>
                                                <td className="px-3 py-2">{row.unidade || '-'}</td>
                                                <td className="px-3 py-2 text-right font-semibold">
                                                  {formatarMoeda(row.valorTotal)}
                                                </td>
                                                <td className="px-3 py-2">{row.nf || '-'}</td>
                                                <td className="px-3 py-2">{row.cfop || '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-slate-400 text-center mt-4">
                                      Clique em um dia no grafico. Use Ctrl + clique para montar um periodo.
                                    </p>
                                  )
                                ) : (
                                  <>
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                        <p>Vendedores</p>
                                        <p className="text-base font-black text-white mt-1">
                                          {faturamentoPorVendedor.length}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                        <p>Linhas no periodo</p>
                                        <p className="text-base font-black text-white mt-1">
                                          {faturamentoLinhasFiltradas.length}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                        <p>Total no periodo</p>
                                        <p className="text-base font-black text-emerald-300 mt-1">
                                          {formatarMoeda(faturamentoTotalFiltrado)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-800">
                                      <table className="w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider">
                                          <tr>
                                            <th className="px-3 py-3">Vendedor</th>
                                            <th className="px-3 py-3 text-right">Total</th>
                                            <th className="px-3 py-3 text-right">Vendas</th>
                                            <th className="px-3 py-3 text-right">Devolucoes</th>
                                            <th className="px-3 py-3 text-right">Linhas</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 text-slate-200">
                                          {faturamentoPorVendedor.length === 0 ? (
                                            <tr>
                                              <td className="px-3 py-4 text-center text-slate-400" colSpan={5}>
                                                Sem dados no periodo.
                                              </td>
                                            </tr>
                                          ) : (
                                            faturamentoPorVendedor.map((item) => (
                                              <tr key={item.vendedor}>
                                                <td className="px-3 py-2 font-semibold">{item.vendedor}</td>
                                                <td className="px-3 py-2 text-right font-semibold">
                                                  {formatarMoeda(item.total)}
                                                </td>
                                                <td className="px-3 py-2 text-right text-emerald-300">
                                                  {formatarMoeda(item.vendas)}
                                                </td>
                                                <td className="px-3 py-2 text-right text-rose-300">
                                                  {formatarMoeda(item.devolucoes)}
                                                </td>
                                                <td className="px-3 py-2 text-right">{item.linhas}</td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                              </div>
                              </div>
                            );
                          })()}
                        </div>

                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm xl:col-span-1">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Top clientes</h4>
                            <span className="text-xs text-slate-400">Top 6</span>
                          </div>
                          <div className="space-y-3">
                            {faturamentoAtual.topClientes.map((item) => {
                              const perc = faturamentoAtual.total > 0 ? (item.valor / faturamentoAtual.total) * 100 : 0;
                              const nome = item.info?.nome || item.cliente;
                              const local = [item.info?.municipio, item.info?.estado].filter(Boolean).join(' / ');
                              return (
                                <div key={item.cliente} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                                    <div>
                                      <div className="font-bold text-slate-700">{nome}</div>
                                      <div className="text-[10px] text-slate-400">{local || `Codigo: ${item.cliente}`}</div>
                                    </div>
                                    <span>R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${perc}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm xl:col-span-2">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Top produtos</h4>
                            <span className="text-xs text-slate-400">Top 8</span>
                          </div>
                          <div className="max-h-80 overflow-auto rounded-xl border border-slate-100">
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 bg-white text-slate-400 uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3">Codigo</th>
                                  <th className="px-4 py-3">Descricao</th>
                                  <th className="px-4 py-3 text-right">Qtd</th>
                                  <th className="px-4 py-3">Unid</th>
                                  <th className="px-4 py-3 text-right">Preco medio</th>
                                  <th className="px-4 py-3 text-right">Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {faturamentoAtual.topProdutos.map((item, index) => (
                                  <tr key={`${item.codigo}-${index}`} className="text-slate-600">
                                    <td className="px-4 py-3 font-semibold">{item.codigo || '-'}</td>
                                    <td className="px-4 py-3">{item.descricao || '-'}</td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      {item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3">{item.unidade || '-'}</td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      R$ {item.precoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm xl:col-span-2">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Mapa por municipio</h4>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-400">Faturamento</span>
                              <button
                                type="button"
                                onClick={() => setMapModalOpen(true)}
                                className="text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300"
                              >
                                Expandir
                              </button>
                            </div>
                          </div>
                          {!mapModalOpen &&
                            renderMapaMunicipio('aspect-square overflow-hidden rounded-xl border border-slate-100', {
                              zoomControl: true,
                            })}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Top estados</h4>
                              <span className="text-xs text-slate-400">Top 6</span>
                            </div>
                            <div className="space-y-2">
                              {faturamentoAtual.topEstados.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Sem dados de estado.</p>
                              ) : (
                                faturamentoAtual.topEstados.map((item) => {
                                  const perc = faturamentoAtual.total > 0 ? (item.valor / faturamentoAtual.total) * 100 : 0;
                                  const pedidos = faturamentoAtual.pedidosPorEstado.find((p) => p.estado === item.estado)?.pedidos || 0;
                                  return (
                                    <div key={item.estado} className="space-y-1">
                                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                                        <span>{item.estado}</span>
                                        <span>{perc.toFixed(1)}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>{pedidos > 0 ? `${pedidos} pedidos` : '-'}</span>
                                        <span>R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                      </div>
                                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${perc}%` }} />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Top municipios</h4>
                              <span className="text-xs text-slate-400">Top 6</span>
                            </div>
                            <div className="space-y-2">
                              {faturamentoAtual.topMunicipios.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Sem dados de municipio.</p>
                              ) : (
                                faturamentoAtual.topMunicipios.map((item) => {
                                  const perc = faturamentoAtual.total > 0 ? (item.valor / faturamentoAtual.total) * 100 : 0;
                                  const chaveMunicipio = `${normalizarTexto(item.municipio)}||${String(item.uf || '').toUpperCase()}`;
                                  const pedidos = faturamentoAtual.pedidosPorMunicipio.find((p) => p.chave === chaveMunicipio)?.pedidos || 0;
                                  return (
                                    <div key={`${item.municipio}-${item.uf}`} className="space-y-1">
                                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                                        <span>{item.municipio} / {item.uf}</span>
                                        <span>{perc.toFixed(1)}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>{pedidos > 0 ? `${pedidos} pedidos` : '-'}</span>
                                        <span>R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                      </div>
                                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${perc}%` }} />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                  </>
                </div>
              )}
            </div>
          )}

          {/* ABA DE PORTFOLIO */}
          {abaAtiva === 'portfolio' && !isPortfolioDisabled && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-emerald-600/5 blur-3xl" />
                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner">
                      <DollarSign size={28} className="text-blue-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Operacao em tempo real</p>
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tight">Faturamento</h2>
                      <p className="text-sm text-slate-400 mt-1 font-medium">
                        Consolidado industrial - {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-[320px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Movimentos</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-blue-200">{faturamentoAtual.movimentos || 0}</span>
                        <span className="text-[10px] text-slate-500 mb-1">no mes</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Dias ativos</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-amber-300">{faturamentoAtual.diasAtivos || 0}</span>
                        <span className="text-[10px] text-slate-500 mb-1">dias uteis</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Faturamento mes</p>
                      <div className="flex items-end gap-1">
                        <span className="text-xl font-black text-blue-300">{formatarMoeda(faturamentoAtual.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-slate-500 text-sm">
                Analise ABC e distribuicao de mix com base no faturamento 2025.
              </div>

              {faturamentoDados.carregando ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <p className="text-slate-400 italic">Carregando planilha...</p>
                </div>
              ) : faturamentoDados.erro ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <p className="text-rose-600 text-sm font-medium">{faturamentoDados.erro}</p>
                </div>
              ) : portfolioDados.itens.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <p className="text-slate-400 italic">Sem dados na planilha.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Faturamento 2025</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">
                        R$ {portfolioDados.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Base completa da planilha.</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Itens no Portfolio</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">
                        {portfolioDados.itens.length.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">SKU unicos classificados.</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Grupo Lider</p>
                      <p className="text-xl font-bold text-slate-900 mt-2">
                        {portfolioDados.topGrupo?.grupo || 'Sem grupo'}
                      </p>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">
                        R$ {portfolioDados.topGrupo?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Top 5 Grupos</p>
                      <p className="text-2xl font-bold text-slate-900 mt-2">
                        {portfolioDados.top5Share.toFixed(1)}%
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Participacao no faturamento.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="p-6 border-b border-slate-200 bg-slate-50">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                          Mix por Grupo (Top 8)
                        </h3>
                      </div>
                      <div className="p-6">
                        {(() => {
                          const width = 900;
                          const height = 300;
                          const margin = { top: 30, right: 20, bottom: 60, left: 40 };
                          const chartW = width - margin.left - margin.right;
                          const chartH = height - margin.top - margin.bottom;
                          const maxValor = Math.max(...portfolioDados.topGrupos.map((item) => item.valor), 1);
                          const barW = chartW / Math.max(portfolioDados.topGrupos.length, 1);

                          return (
                            <div className="relative">
                              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72">
                              {[0.25, 0.5, 0.75, 1].map((p) => (
                                <line
                                  key={p}
                                  x1={margin.left}
                                  x2={width - margin.right}
                                  y1={margin.top + chartH * (1 - p)}
                                  y2={margin.top + chartH * (1 - p)}
                                  stroke="#1f2937"
                                  strokeDasharray="4 6"
                                />
                              ))}
                              {portfolioDados.topGrupos.map((item, i) => {
                                const barH = (item.valor / maxValor) * chartH;
                                const x = margin.left + i * barW + 10;
                                const y = margin.top + chartH - barH;
                                const isHover = portfolioHover === item.grupo;
                                return (
                                  <g key={item.grupo}>
                                    <rect
                                      x={x}
                                      y={y}
                                      width={barW - 20}
                                      height={barH}
                                      rx="10"
                                      fill={isHover ? '#60a5fa' : '#3b82f6'}
                                      opacity="0.95"
                                      className="cursor-pointer"
                                      onMouseEnter={() => setPortfolioHover(item.grupo)}
                                      onMouseLeave={() => {
                                        setPortfolioHover(null);
                                        setPortfolioTooltip(null);
                                      }}
                                      onMouseMove={(e) => {
                                        setPortfolioTooltip({
                                          x: e.nativeEvent.offsetX,
                                          y: e.nativeEvent.offsetY,
                                          grupo: item.grupo,
                                          valor: item.valor,
                                          share: item.share,
                                        });
                                      }}
                                    />
                                    <text
                                      x={x + (barW - 20) / 2}
                                      y={Math.max(y - 12, 16)}
                                      textAnchor="middle"
                                      fontSize="12"
                                      fill="#e2e8f0"
                                      fontWeight="700"
                                    >
                                      {formatarValorCurto(item.valor)}
                                    </text>
                                    <text
                                      x={x + (barW - 20) / 2}
                                      y={margin.top + chartH + 18}
                                      textAnchor="middle"
                                      fontSize="10"
                                      fill="#94a3b8"
                                    >
                                      {item.grupo}
                                    </text>
                                    <text
                                      x={x + (barW - 20) / 2}
                                      y={margin.top + chartH + 34}
                                      textAnchor="middle"
                                      fontSize="10"
                                      fill="#64748b"
                                    >
                                      {item.share.toFixed(1)}%
                                    </text>
                                  </g>
                                );
                              })}
                              </svg>
                              {portfolioTooltip && (
                                <div
                                  className="pointer-events-none absolute z-10 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
                                  style={{ left: portfolioTooltip.x + 12, top: portfolioTooltip.y + 12 }}
                                >
                                  <div className="font-bold">{portfolioTooltip.grupo}</div>
                                  <div>R$ {portfolioTooltip.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                  <div>{portfolioTooltip.share.toFixed(1)}% do total</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="p-6 border-b border-slate-200 bg-slate-50">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                          Curva ABC - Itens
                        </h3>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-slate-200 p-4">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Classe A</p>
                            <p className="text-xl font-bold text-slate-900 mt-1">{portfolioDados.aCount}</p>
                            <p className="text-xs text-emerald-600 font-semibold">
                              R$ {portfolioDados.aValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 p-4">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Classe B</p>
                            <p className="text-xl font-bold text-slate-900 mt-1">{portfolioDados.bCount}</p>
                            <p className="text-xs text-amber-600 font-semibold">
                              R$ {portfolioDados.bValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 p-4">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Classe C</p>
                            <p className="text-xl font-bold text-slate-900 mt-1">{portfolioDados.cCount}</p>
                            <p className="text-xs text-rose-600 font-semibold">
                              R$ {portfolioDados.cValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const itensCurva = portfolioDados.itensClassificados.slice(0, 20);
                          const width = 900;
                          const height = 240;
                          const margin = { top: 20, right: 20, bottom: 40, left: 40 };
                          const chartW = width - margin.left - margin.right;
                          const chartH = height - margin.top - margin.bottom;
                          const stepX = chartW / Math.max(itensCurva.length - 1, 1);
                          const pontos = itensCurva.map((item, index) => {
                            const x = margin.left + index * stepX;
                            const y = margin.top + chartH * (1 - item.perc / 100);
                            return { x, y };
                          });
                          const linha = pontos.map((p) => `${p.x},${p.y}`).join(' ');

                          return (
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
                              {[80, 95].map((p) => (
                                <line
                                  key={p}
                                  x1={margin.left}
                                  x2={width - margin.right}
                                  y1={margin.top + chartH * (1 - p / 100)}
                                  y2={margin.top + chartH * (1 - p / 100)}
                                  stroke="#1f2937"
                                  strokeDasharray="6 6"
                                />
                              ))}
                              <text x={margin.left} y={14} fontSize="11" fill="#94a3b8">
                                % acumulado
                              </text>
                              <polyline points={linha} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                              {pontos.map((p, idx) => (
                                <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
                              ))}
                              <text x={margin.left} y={height - 8} fontSize="10" fill="#94a3b8">
                                Top {itensCurva.length} itens ordenados
                              </text>
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                        Itens com Maior Impacto
                      </h3>
                      <span className="text-xs text-slate-400">Top 20 itens</span>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-white text-slate-400 uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3">Codigo</th>
                            <th className="px-6 py-3">Descricao</th>
                            <th className="px-6 py-3">Classe</th>
                            <th className="px-6 py-3 text-right">Valor</th>
                            <th className="px-6 py-3 text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {portfolioDados.topItens.map((item, index) => {
                            const share = portfolioDados.total > 0 ? (item.total / portfolioDados.total) * 100 : 0;
                            return (
                              <tr key={`${item.codigo}-${item.descricao}-${index}`} className="text-slate-700">
                                <td className="px-6 py-3 font-semibold">{item.codigo || '-'}</td>
                                <td className="px-6 py-3 text-slate-500">{item.descricao || '-'}</td>
                                <td className="px-6 py-3">
                                  <span
                                    className={`inline-flex min-w-[32px] items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                                      item.classe === 'A'
                                        ? 'bg-emerald-500/20 text-emerald-600'
                                        : item.classe === 'B'
                                          ? 'bg-amber-500/20 text-amber-600'
                                          : 'bg-rose-500/20 text-rose-600'
                                    }`}
                                  >
                                    {item.classe}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right font-semibold text-slate-800">
                                  R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-3 text-right text-slate-500">{share.toFixed(2)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ABA DE GESTÃO DIÁRIA */}
          {abaAtiva === 'gestao' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
                 <div className="flex items-center justify-end">
                   <button
                     type="button"
                     onClick={handleExportarUsuariosPdf}
                     className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition hover:border-slate-500 hover:text-white"
                   >
                     Exportar usuarios PDF
                   </button>
                 </div>
                 <PainelOperacaoDiaria
                   registrosPorData={registrosPorData}
                   colaboradores={colaboradores}
                   supervisoresDisponiveis={supervisoresDisponiveis}
                   setoresDisponiveis={setoresDisponiveis}
                   filtroSupervisor={filtroSupervisor}
                   setFiltroSupervisor={setFiltroSupervisor}
                   filtroSetor={filtroSetor}
                   setFiltroSetor={setFiltroSetor}
                   filtroTipoDia={filtroTipoDia}
                   setFiltroTipoDia={setFiltroTipoDia}
                   mesHistorico={mesHistorico}
                   setMesHistorico={setMesHistorico}
                   anoHistorico={anoHistorico}
                   setAnoHistorico={setAnoHistorico}
                   diaHistorico={diaHistorico}
                   setDiaHistorico={setDiaHistorico}
                   totalColaboradoresFiltrados={totalColaboradoresFiltrados}
                   obterResumoDia={obterResumoDia}
                   isFolgaColetiva={isFolgaColetiva}
                   isDataSemApontamento={isDataSemApontamento}
                   isDiaDesconsiderado={isDiaDesconsiderado}
                   resumoHistorico={resumoHistorico}
                   resumoLeandroExcel={resumoLeandroExcel}
                   faltasPlanilhaPorData={faltasRegistrosPlanilha}
                 />
            </div>
          )}


          
          {/* ABA DE MANUTENCAO */}
          {abaAtiva === 'manutencao' && (
             <div className="space-y-6 animate-in slide-in-from-top duration-500">
                
                <div className="relative">
                  
                  {/* ── HEADER PRINCIPAL ── */}
                  <div className="border-b border-slate-800/40 px-2 py-5">
                    {/* Linha 1: título + ações */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl border border-amber-400/25 bg-amber-400/10 flex items-center justify-center shrink-0">
                          <Wrench size={18} className="text-amber-300" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-black text-white tracking-tight">Manutenção Industrial</h2>
                            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Online
                            </span>
                            {isManutencaoOnly && (
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2.5 py-0.5 text-[10px] font-bold text-amber-200/80">
                                Perfil operador
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">Gestão de ordens de serviço e ativos industriais</p>
                        </div>
                      </div>
                      <button
                        onClick={abrirNovaOs}
                        data-tour="nova-os"
                        className="w-full sm:w-auto shrink-0 rounded-xl bg-amber-400 text-slate-950 text-xs font-black px-5 py-2.5 shadow-lg shadow-amber-500/20 hover:bg-amber-300 transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <Plus size={14} />
                        Nova OS
                      </button>
                    </div>

                    {/* Linha 2: KPI strip */}
                    <div className="mt-5 grid grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                      {[
                        { ...manutencaoKpis[0], dot: 'bg-amber-400', bg: 'bg-amber-400/5' },
                        { ...manutencaoKpis[1], dot: 'bg-blue-400', bg: 'bg-blue-400/5' },
                        { ...manutencaoKpis[2], dot: 'bg-emerald-400', bg: 'bg-emerald-400/5' },
                        { ...manutencaoKpis[3], dot: 'bg-rose-400', bg: 'bg-rose-400/5' },
                        { ...manutencaoKpis[4], dot: 'bg-cyan-400', bg: 'bg-cyan-400/5' },
                        { ...manutencaoKpis[5], dot: 'bg-purple-400', bg: 'bg-purple-400/5' },
                      ].map((kpi) => (
                        <div key={kpi.id} className={`rounded-xl border border-slate-800/60 ${kpi.bg} px-2.5 sm:px-4 py-2.5 sm:py-3 min-w-0`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${kpi.dot}`} />
                            <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">{kpi.label}</p>
                          </div>
                          <p className={`mt-1 sm:mt-1.5 text-lg sm:text-2xl font-black ${kpi.tone} truncate`}>{kpi.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── BARRA DE NAVEGAÇÃO ── */}
                  <div className="flex items-center gap-2 px-2 py-3 border-b border-slate-800/40">
                    <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
                      {[
                        { id: 'resumo', icon: LayoutDashboard, label: 'Resumo', badge: null },
                        { id: 'ordens', icon: Layers, label: 'Ordens', badge: manutencaoOrdens.filter(o => o.status !== 'Finalizada' && o.status !== 'Cancelada').length },
                        { id: 'minhas', icon: Users, label: 'Minhas', badge: minhasSolicitacoes.length || null },
                        { id: 'agenda', icon: CalendarIcon, label: 'Agenda', badge: null },
                        { id: 'ativos', icon: Cpu, label: 'Ativos', badge: null },
                        { id: 'relatorios', icon: BarChart3, label: 'Relatórios', badge: null },
                        { id: 'logs', icon: FileText, label: 'Logs', badge: null },
                        ...(isManutencaoOperador ? [{ id: 'operador', icon: UserCog, label: 'Operador', badge: null }] : []),
                      ].map(({ id, icon: Icon, label, badge }) => {
                        const isActive = subAbaManutencao === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setSubAbaManutencao(id)}
                            className={`relative flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                              isActive
                                ? 'bg-amber-400 text-slate-950 shadow-sm'
                                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                            }`}
                          >
                            <Icon size={12} />
                            {label}
                            {badge > 0 && (
                              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none ${isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                                {badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!isManutencaoOnly && subAbaManutencao === 'relatorios' && (
                        <>
                          <button
                            onClick={handleExportarRelatorioManutencaoPdf}
                            className="px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/30 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-all duration-200"
                          >
                            PDF
                          </button>
                          <button
                            onClick={handleExportarRelatorioManutencaoPpt}
                            className="px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/30 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-all duration-200"
                          >
                            PPT
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/30 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-all duration-200 md:hidden"
                      >
                        Sair
                      </button>
                    </div>
                  </div>

                  {/* ── CONTEÚDO DAS SUB-ABAS ── */}
                  <div className="py-4 px-0 sm:p-6 lg:p-8">

                {subAbaManutencao === 'resumo' && (
                  <div className="space-y-5">
                    {/* Alerta Operacional */}
                    <div className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 ${manutencaoParadas.length ? 'border-amber-500/30 bg-amber-500/[0.05]' : 'border-emerald-500/20 bg-emerald-500/[0.04]'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${manutencaoParadas.length ? 'bg-amber-500/15' : 'bg-emerald-500/12'}`}>
                          <AlertTriangle size={15} className={manutencaoParadas.length ? 'text-amber-400' : 'text-emerald-400'} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${manutencaoParadas.length ? 'text-amber-200' : 'text-emerald-200'}`}>
                            {manutencaoParadas.length ? `${manutencaoParadas.length} processo(s) parado(s)` : 'Nenhuma parada registrada'}
                          </p>
                          {manutencaoParadas.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {manutencaoParadas.slice(0, 5).map((os) => (
                                <span key={os.id} className="text-[10px] font-semibold text-amber-100/70 bg-amber-500/10 border border-amber-400/20 rounded px-2 py-0.5">
                                  {os.ativo || os.setor || os.id}
                                </span>
                              ))}
                              {manutencaoParadas.length > 5 && (
                                <span className="text-[10px] font-semibold text-slate-400">+{manutencaoParadas.length - 5}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-md border ${manutencaoParadas.length ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
                          {manutencaoParadas.length ? 'ATENÇÃO' : 'NORMAL'}
                        </span>
                        <button type="button" onClick={() => setSubAbaManutencao('ordens')} className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors">
                          Ver OS →
                        </button>
                      </div>
                    </div>

                    {/* Grid principal: paradas + equipe | ações rápidas | minhas | backlog */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

                      {/* Paradas em andamento */}
                      <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/50">
                          <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Paradas</h3>
                          {manutencaoParadas.length > 0 && (
                            <span className="ml-auto text-[10px] font-black text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded px-1.5 py-0.5">{manutencaoParadas.length}</span>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          {manutencaoParadas.length ? (
                            manutencaoParadas.map((item) => {
                              const p = String(item.prioridade || 'media').toLowerCase();
                              const dot = p === 'critica' || p === 'alta' ? 'bg-rose-400' : p === 'media' ? 'bg-amber-400' : 'bg-slate-400';
                              return (
                                <div key={item.id} className="rounded-lg border border-slate-800/40 bg-slate-950/30 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`}></span>
                                        <p className="text-xs font-bold text-white truncate">{item.ativo || item.setor || item.id}</p>
                                      </div>
                                      {item.responsavel ? (
                                        <p className="mt-1 text-[10px] text-emerald-400 font-semibold">{item.responsavel}</p>
                                      ) : (
                                        <p className="mt-1 text-[10px] text-slate-600">Sem responsável</p>
                                      )}
                                    </div>
                                    <span className="text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded border border-slate-700/40 bg-slate-800/40 text-slate-400">
                                      {item.prioridade || 'Media'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-600">Sem paradas</div>
                          )}
                        </div>
                        {/* Equipe em atendimento */}
                        <div className="border-t border-slate-800/40 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Equipe</p>
                          {manutencaoEquipeEmAndamento.length ? (
                            <div className="space-y-1.5">
                              {manutencaoEquipeEmAndamento.map((item) => (
                                <div key={item.responsavel} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="w-5 h-5 rounded bg-slate-700/60 flex items-center justify-center text-[8px] font-black text-slate-300 shrink-0">
                                      {item.responsavel.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-[11px] font-semibold text-slate-300 truncate">{item.responsavel}</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-blue-300 shrink-0">{item.total} OS</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-600">Nenhum alocado</p>
                          )}
                        </div>
                      </div>

                      {/* Ações rápidas */}
                      <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/50">
                          <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Ações rápidas</h3>
                        </div>
                        <div className="p-3 space-y-2">
                          <button type="button" onClick={abrirNovaOs} className="w-full flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] hover:bg-amber-400/10 px-3 py-3 text-left transition-colors">
                            <Plus size={14} className="text-amber-300 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-amber-100">Abrir nova OS</p>
                              <p className="text-[10px] text-slate-500">Registrar ocorrência</p>
                            </div>
                          </button>
                          <button type="button" onClick={() => setSubAbaManutencao('ordens')} className="w-full flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/40 px-3 py-3 text-left transition-colors">
                            <Layers size={14} className="text-slate-400 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-200">Ver todas as ordens</p>
                              <p className="text-[10px] text-slate-500">{manutencaoOrdens.length} registradas</p>
                            </div>
                          </button>
                          <button type="button" onClick={() => setSubAbaManutencao('minhas')} className="w-full flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/40 px-3 py-3 text-left transition-colors">
                            <Users size={14} className="text-blue-400 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-200">Minhas solicitações</p>
                              <p className="text-[10px] text-slate-500">{minhasSolicitacoes.length} abertas por você</p>
                            </div>
                          </button>
                          <button type="button" onClick={() => setSubAbaManutencao('relatorios')} className="w-full flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/40 px-3 py-3 text-left transition-colors">
                            <BarChart3 size={14} className="text-purple-400 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-200">Relatórios</p>
                              <p className="text-[10px] text-slate-500">PDF e PPT</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Minhas solicitações */}
                      <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/50">
                          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Minhas</h3>
                          <button type="button" onClick={() => setSubAbaManutencao('minhas')} className="ml-auto text-[10px] font-semibold text-blue-400 hover:text-blue-300">Ver todas →</button>
                        </div>
                        <div className="p-3 space-y-2">
                          {minhasSolicitacoes.length ? (
                            minhasSolicitacoes.slice(0, 5).map((os) => {
                              const sMap = { 'aberta': 'text-blue-300', 'em andamento': 'text-amber-300', 'finalizada': 'text-emerald-300', 'aguardando peca': 'text-purple-300', 'contestada': 'text-rose-300' };
                              const sColor = sMap[(os.status || '').toLowerCase()] || 'text-slate-400';
                              return (
                                <div key={os.id} className="rounded-lg border border-slate-800/40 bg-slate-950/30 px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-100 truncate">{os.ativo || os.id}</p>
                                      <p className="text-[10px] text-slate-500">{os.setor || '-'}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold shrink-0 ${sColor}`}>{os.status || 'Aberta'}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-600">Nenhuma solicitação</div>
                          )}
                        </div>
                      </div>

                      {/* Backlog por líder */}
                      <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/50">
                          <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Backlog</h3>
                        </div>
                        <div className="p-3 space-y-2">
                          {backlogPorLider.length ? (
                            backlogPorLider.map((item) => (
                              <div key={item.lider} className="rounded-lg border border-slate-800/40 bg-slate-950/30 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-5 h-5 rounded bg-slate-700/60 flex items-center justify-center text-[8px] font-black text-slate-300 shrink-0">
                                      {item.lider.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-xs font-semibold text-slate-200 truncate">{item.lider}</span>
                                  </div>
                                  <span className="text-[10px] font-black text-slate-300 shrink-0">{item.total} OS</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-600">Sem dados de backlog</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'ordens' && (
                  <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                    {/* Barra de busca + filtros */}
                    <div className="p-4 border-b border-slate-800/40 space-y-3">
                      {/* Linha 1: título + busca */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-100">Ordens de Serviço</h3>
                          <p className="text-[10px] text-slate-500">{manutencaoOrdensFiltradas.length} de {manutencaoOrdens.length} registros</p>
                        </div>
                        <div className="relative">
                          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            value={manutencaoBusca}
                            onChange={(e) => setManutencaoBusca(e.target.value)}
                            placeholder="Buscar por ativo, setor, responsável..."
                            className="w-full sm:w-72 rounded-lg border border-slate-700/60 bg-slate-950/50 pl-8 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-amber-400/50 transition-colors"
                          />
                        </div>
                      </div>
                      {/* Linha 2: filtros de status */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { s: 'Todas', color: 'slate' },
                          { s: 'Aberta', color: 'blue' },
                          { s: 'Em andamento', color: 'amber' },
                          { s: 'Aguardando peca', color: 'purple' },
                          { s: 'Contestada', color: 'rose' },
                          { s: 'Finalizada', color: 'emerald' },
                        ].map(({ s, color }) => {
                          const isActive = manutencaoFiltroStatus === s;
                          const count = s === 'Todas' ? manutencaoOrdens.length : manutencaoOrdens.filter(o => o.status === s).length;
                          const activeClass = {
                            slate: 'bg-slate-700 text-slate-100 border-slate-500',
                            blue: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
                            amber: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
                            purple: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
                            rose: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
                            emerald: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
                          }[color];
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setManutencaoFiltroStatus(s)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${isActive ? activeClass : 'border-slate-700/40 text-slate-500 hover:text-slate-300 hover:border-slate-600'}`}
                            >
                              {s}
                              <span className={`text-[9px] font-black ${isActive ? 'opacity-70' : 'opacity-50'}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-950/40 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800/30">
                          <tr>
                            <th className="px-2 sm:px-4 py-3 font-bold">OS / Ativo</th>
                            <th className="px-4 py-3 font-bold hidden sm:table-cell">Setor</th>
                            <th className="px-4 py-3 font-bold hidden sm:table-cell">Prioridade</th>
                            <th className="px-2 sm:px-4 py-3 font-bold">Status</th>
                            <th className="px-4 py-3 font-bold hidden md:table-cell">Responsável</th>
                            <th className="px-4 py-3 font-bold hidden md:table-cell">Abertura</th>
                            <th className="px-2 sm:px-4 py-3 font-bold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/25">
                          {manutencaoOrdensLoading ? (
                            <tr>
                              <td className="px-4 py-8 text-sm text-slate-500 text-center" colSpan={7}>
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin"></div>
                                  Carregando ordens...
                                </div>
                              </td>
                            </tr>
                          ) : manutencaoOrdensError ? (
                            <tr><td className="px-4 py-6 text-sm text-rose-400" colSpan={7}>{manutencaoOrdensError}</td></tr>
                          ) : manutencaoOrdensFiltradas.length ? (
                            manutencaoOrdensFiltradas.map((ordem) => {
                              const prioridadeMap = {
                                'critica': { cls: 'text-rose-300 bg-rose-500/10 border-rose-400/25', dot: 'bg-rose-400' },
                                'alta': { cls: 'text-amber-300 bg-amber-500/10 border-amber-400/25', dot: 'bg-amber-400' },
                                'media': { cls: 'text-blue-300 bg-blue-500/10 border-blue-400/20', dot: 'bg-blue-400' },
                                'baixa': { cls: 'text-slate-400 bg-slate-800/40 border-slate-600/25', dot: 'bg-slate-500' },
                              };
                              const pStr = (ordem.prioridade || '-').toLowerCase();
                              const pStyle = prioridadeMap[pStr] || prioridadeMap['baixa'];
                              const statusMap = {
                                'aberta': 'text-blue-300',
                                'contestada': 'text-rose-300',
                                'em andamento': 'text-amber-300',
                                'finalizada': 'text-emerald-300',
                                'cancelada': 'text-slate-500',
                                'aguardando peca': 'text-purple-300',
                              };
                              const sStr = (ordem.status || '-').toLowerCase();
                              const sColor = statusMap[sStr] || 'text-slate-400';
                              const abertura = ordem.createdAt || ordem.dataFalha;
                              const aberturaStr = abertura ? new Date(abertura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-';
                              return (
                                <tr key={ordem.id} className="hover:bg-slate-800/15 transition-colors group">
                                  <td className="px-2 sm:px-4 py-3">
                                    <p className="text-[11px] font-bold text-slate-400">{ordem.id}</p>
                                    <p className="text-sm font-semibold text-slate-100">{ordem.ativo || '-'}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell">{ordem.setor || '-'}</td>
                                  <td className="px-4 py-3 hidden sm:table-cell">
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${pStyle.cls}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`}></span>
                                      {ordem.prioridade || '-'}
                                    </span>
                                  </td>
                                  <td className="px-2 sm:px-4 py-3">
                                    <span className={`text-xs font-semibold ${sColor}`}>{ordem.status || '-'}</span>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                    {ordem.responsavel ? (
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded bg-slate-700/60 flex items-center justify-center text-[8px] font-black text-slate-300 shrink-0">
                                          {ordem.responsavel.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="text-xs text-slate-300">{ordem.responsavel}</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-600">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{aberturaStr}</td>
                                  <td className="px-2 sm:px-4 py-3">
                                    <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                                      <button type="button" onClick={() => handleVisualizarOs(ordem)} title="Ver" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all">
                                        <Eye size={13} /><span className="hidden sm:inline">Ver</span>
                                      </button>
                                      <button type="button" onClick={() => handleEditarOs(ordem)} title="Editar" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all">
                                        <Pencil size={13} /><span className="hidden sm:inline">Editar</span>
                                      </button>
                                      <button type="button" onClick={() => handleImprimirOs(ordem)} title="Imprimir" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-500 hover:text-slate-200 hover:bg-slate-700/30 transition-all">
                                        <Printer size={13} /><span className="hidden sm:inline">Imprimir</span>
                                      </button>
                                      {ordem.status === 'Finalizada' && (
                                        <button type="button" onClick={() => atualizarOs(ordem.id, { status: 'Contestada' })} title="Reabrir" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-rose-400 hover:bg-rose-500/10 transition-all">
                                          <RotateCcw size={13} /><span className="hidden sm:inline">Reabrir</span>
                                        </button>
                                      )}
                                      {canDeleteOs && (
                                        <button type="button" onClick={() => handleExcluirOs(ordem)} title="Excluir" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-rose-500 hover:bg-rose-500/10 transition-all">
                                          <Trash2 size={13} /><span className="hidden sm:inline">Excluir</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td className="px-4 py-12 text-center" colSpan={7}>
                                <div className="flex flex-col items-center gap-2">
                                  <Layers size={28} className="text-slate-700" />
                                  <p className="text-sm text-slate-500">
                                    {manutencaoBusca ? `Nenhum resultado para "${manutencaoBusca}"` : manutencaoFiltroStatus !== 'Todas' ? `Nenhuma OS com status "${manutencaoFiltroStatus}"` : 'Sem ordens registradas'}
                                  </p>
                                  {(manutencaoBusca || manutencaoFiltroStatus !== 'Todas') && (
                                    <button type="button" onClick={() => { setManutencaoBusca(''); setManutencaoFiltroStatus('Todas'); }} className="text-xs text-amber-400 hover:text-amber-300">Limpar filtros</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'minhas' && (
                  <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 overflow-hidden">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-slate-800/40">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">Minhas Solicitações</h3>
                        <p className="text-[10px] text-slate-500">OS abertas por você — {minhasSolicitacoes.length} registros</p>
                      </div>
                      <button
                        type="button"
                        onClick={abrirNovaOs}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold px-3.5 py-2 hover:bg-amber-300 transition-colors"
                      >
                        <Plus size={12} />
                        Nova OS
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-950/40 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800/30">
                          <tr>
                            <th className="px-2 sm:px-4 py-3 font-bold">OS / Ativo</th>
                            <th className="px-4 py-3 font-bold hidden sm:table-cell">Setor</th>
                            <th className="px-4 py-3 font-bold hidden sm:table-cell">Prioridade</th>
                            <th className="px-2 sm:px-4 py-3 font-bold">Status</th>
                            <th className="px-4 py-3 font-bold hidden md:table-cell">Aberto em</th>
                            <th className="px-2 sm:px-4 py-3 font-bold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/25">
                          {manutencaoOrdensLoading ? (
                            <tr>
                              <td className="px-4 py-8 text-sm text-slate-500 text-center" colSpan={6}>
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin"></div>
                                  Carregando...
                                </div>
                              </td>
                            </tr>
                          ) : manutencaoOrdensError ? (
                            <tr><td className="px-4 py-6 text-sm text-rose-400" colSpan={6}>{manutencaoOrdensError}</td></tr>
                          ) : minhasSolicitacoes.length ? (
                            minhasSolicitacoes.map((ordem) => {
                              const statusColor = {
                                'aberta': 'text-blue-300',
                                'contestada': 'text-rose-300',
                                'em andamento': 'text-amber-300',
                                'finalizada': 'text-emerald-300',
                                'cancelada': 'text-slate-500',
                                'aguardando peca': 'text-purple-300',
                              }[(ordem.status || '').toLowerCase()] || 'text-slate-400';
                              const prioridadeMap = {
                                'critica': { cls: 'text-rose-300 bg-rose-500/10 border-rose-400/25', dot: 'bg-rose-400' },
                                'alta': { cls: 'text-amber-300 bg-amber-500/10 border-amber-400/25', dot: 'bg-amber-400' },
                                'media': { cls: 'text-blue-300 bg-blue-500/10 border-blue-400/20', dot: 'bg-blue-400' },
                                'baixa': { cls: 'text-slate-400 bg-slate-800/40 border-slate-600/25', dot: 'bg-slate-500' },
                              };
                              const pStyle = prioridadeMap[(ordem.prioridade || '').toLowerCase()] || prioridadeMap['baixa'];
                              const abertura = ordem.createdAt || ordem.dataFalha;
                              const aberturaStr = abertura ? new Date(abertura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
                              return (
                                <tr key={ordem.id} className="hover:bg-slate-800/15 transition-colors">
                                  <td className="px-2 sm:px-4 py-3">
                                    <p className="text-[11px] font-bold text-slate-400">{ordem.id}</p>
                                    <p className="text-sm font-semibold text-slate-100">{ordem.ativo || '-'}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell">{ordem.setor || '-'}</td>
                                  <td className="px-4 py-3 hidden sm:table-cell">
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${pStyle.cls}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`}></span>
                                      {ordem.prioridade || '-'}
                                    </span>
                                  </td>
                                  <td className="px-2 sm:px-4 py-3">
                                    <span className={`text-xs font-semibold ${statusColor}`}>{ordem.status || '-'}</span>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{aberturaStr}</td>
                                  <td className="px-2 sm:px-4 py-3">
                                    <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                                      <button type="button" onClick={() => handleVisualizarOs(ordem)} title="Ver" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all">
                                        <Eye size={13} /><span className="hidden sm:inline">Ver</span>
                                      </button>
                                      <button type="button" onClick={() => handleEditarOs(ordem)} title="Editar" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all">
                                        <Pencil size={13} /><span className="hidden sm:inline">Editar</span>
                                      </button>
                                      <button type="button" onClick={() => handleImprimirOs(ordem)} title="Imprimir" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-slate-500 hover:text-slate-200 hover:bg-slate-700/30 transition-all">
                                        <Printer size={13} /><span className="hidden sm:inline">Imprimir</span>
                                      </button>
                                      {ordem.status === 'Finalizada' && (
                                        <button type="button" onClick={() => atualizarOs(ordem.id, { status: 'Contestada' })} title="Reabrir" className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded text-[10px] font-semibold text-rose-400 hover:bg-rose-500/10 transition-all">
                                          <RotateCcw size={13} /><span className="hidden sm:inline">Reabrir</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td className="px-4 py-12 text-center" colSpan={6}>
                                <div className="flex flex-col items-center gap-3">
                                  <Users size={28} className="text-slate-700" />
                                  <p className="text-sm text-slate-500">Você ainda não abriu nenhuma OS</p>
                                  <button type="button" onClick={abrirNovaOs} className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors">
                                    <Plus size={12} />
                                    Abrir primeira OS
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'agenda' && (
                  <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-10 shadow-md text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-800/30 border border-slate-700/30 flex items-center justify-center">
                        <CalendarIcon size={22} className="text-slate-500" />
                      </div>
                      <p className="text-sm text-slate-500 font-medium">Agenda sem dados no momento</p>
                      <p className="text-xs text-slate-600">Funcionalidade em desenvolvimento</p>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'ativos' && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/70">Cadastro de ativos</p>
                          <h3 className="mt-1 text-lg font-black text-white">Registrar máquina para abertura de OS</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Os ativos salvos aqui entram imediatamente na seleção da OS de manutenção.
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-xs text-slate-300">
                          Base atual: <span className="font-black text-white">{listaMaquinas.length}</span> ativo(s)
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10">
                            <Plus size={16} className="text-amber-300" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">Novo ativo</h4>
                            <p className="text-[10px] text-slate-500">Cadastre máquinas e veículos sem sair da manutenção.</p>
                          </div>
                        </div>

                        <form
                          className="mt-5 space-y-4"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const n = e.target.elements.nomeMaq.value;
                            const cc = novoAtivoCc;
                            const processo = normalizarTexto(cc) === 'industria' ? novoAtivoProcesso : '';
                            await handleSalvarMaquina(n, cc, processo);
                            e.target.reset();
                            handleResetNovoAtivoForm();
                          }}
                        >
                          <div>
                            <label className="text-xs font-bold text-slate-400">Nome da máquina</label>
                            <input
                              name="nomeMaq"
                              type="text"
                              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
                              placeholder="Ex: Prensa hidráulica 03"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Centro de custo</label>
                            <input
                              value={novoAtivoCc}
                              onChange={(e) => setNovoAtivoCc(e.target.value)}
                              list="novo-ativo-cc-opcoes"
                              autoComplete="off"
                              placeholder="Ex: Industria, Transporte, Corte..."
                              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
                              required
                            />
                            <datalist id="novo-ativo-cc-opcoes">
                              {Array.from(
                                new Set([
                                  'Industria',
                                  'Transporte',
                                  ...listaMaquinas.map((m) => m.setor).filter(Boolean),
                                ])
                              )
                                .sort()
                                .map((s) => (
                                  <option key={s} value={s} />
                                ))}
                            </datalist>
                          </div>
                          {normalizarTexto(novoAtivoCc) === 'industria' && (
                            <div>
                              <label className="text-xs font-bold text-slate-400">Processo da indústria</label>
                              <select
                                value={novoAtivoProcesso}
                                onChange={(e) => setNovoAtivoProcesso(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400"
                              >
                                <option value="">Selecione o processo</option>
                                {listaSetores
                                  .filter((item) => !['Industria', 'Transporte'].includes(String(item)))
                                  .map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                              </select>
                            </div>
                          )}
                          {maquinasErro && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
                              {maquinasErro}
                            </div>
                          )}
                          <div className="flex gap-3">
                            <button
                              type="submit"
                              className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-3 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-200 hover:brightness-110"
                            >
                              Salvar ativo
                            </button>
                            <button
                              type="button"
                              onClick={handleResetNovoAtivoForm}
                              className="rounded-xl border border-slate-700/60 bg-slate-900/30 px-4 py-3 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white"
                            >
                              Limpar
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 shadow-md overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-slate-800/40 bg-slate-900/30 p-5 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">Ativos cadastrados</h4>
                            <p className="text-[10px] text-slate-500">Use o filtro para revisar a base usada pela abertura de OS.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Filter size={14} className="text-slate-500" />
                            <select
                              value={filtroAtivos}
                              onChange={(e) => setFiltroAtivos(e.target.value)}
                              className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
                            >
                              <option>Todos</option>
                              {Array.from(new Set(listaMaquinas.map((m) => m.setor).filter(Boolean))).sort().map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                          {ativosFiltrados.length ? (
                            ativosFiltrados.map((m) => (
                              <div key={m.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800/40 bg-slate-950/20 p-4">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-white">{m.nome}</p>
                                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                                    {m.setor || 'Sem setor'}
                                  </p>
                                  {normalizarTexto(m.setor) === 'industria' && (
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                                      {m.processo ? `Processo: ${m.processo}` : 'Sem processo'}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  {normalizarTexto(m.setor) === 'industria' && (
                                    <button
                                      type="button"
                                      className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200"
                                      onClick={() => {
                                        setProcessoEditId(m.id);
                                        setProcessoEditValue(m.processo || '');
                                        setProcessoEditOpen(true);
                                      }}
                                    >
                                      Editar
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleExcluirMaquina(m.id)}
                                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="col-span-full rounded-xl border border-slate-800/40 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                              Nenhum ativo encontrado para o filtro atual.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'operador' && isManutencaoOperador && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
                          <UserCog size={14} className="text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Guia do Operador</h3>
                          <p className="text-[10px] text-slate-500">Passo a passo de como abrir, assumir e acompanhar OS</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleBaixarGuiaTreinamentoPdf}
                          className="rounded-lg border border-slate-600/50 bg-slate-800/30 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700/40 hover:border-slate-500 transition-all duration-200"
                        >
                          Baixar PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTourOperadorStep(0);
                            setTourOperadorOpen(true);
                          }}
                          title="Guia interativo"
                          className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/[0.12] hover:border-amber-400/40 transition-all duration-200"
                        >
                          Guia interativo
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Fila de OS */}
                    <div data-tour="fila-os" className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                            <Layers size={12} className="text-blue-400" />
                          </div>
                          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Fila de OS</h3>
                        </div>
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-blue-500/[0.08] text-blue-300 border border-blue-400/15">
                          {manutencaoOperadorListas.abertas.length} abertas
                        </span>
                      </div>
                      {manutencaoOperadorListas.abertas.length ? (
                        <div className="space-y-3">
                          {manutencaoOperadorListas.abertas.map((os) => {
                            const prioridadeColor = {
                              'Critica': 'bg-rose-500/15 text-rose-300 border-rose-400/25',
                              'Alta': 'bg-amber-500/15 text-amber-300 border-amber-400/25',
                              'Media': 'bg-blue-500/10 text-blue-300 border-blue-400/20',
                              'Baixa': 'bg-slate-700/30 text-slate-400 border-slate-600/20',
                            }[os.prioridade] || 'bg-slate-700/30 text-slate-400 border-slate-600/20';
                            const tempoAberta = os.createdAt ? (() => {
                              const diff = Date.now() - new Date(os.createdAt).getTime();
                              const h = Math.floor(diff / 3600000);
                              return h < 1 ? 'Há menos de 1h' : h < 24 ? `Há ${h}h` : `Há ${Math.floor(h/24)}d`;
                            })() : null;
                            return (
                              <div key={os.id} className="rounded-xl border border-slate-800/30 bg-slate-900/30 p-4 hover:bg-slate-800/30 transition-all duration-200">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className="text-[9px] font-bold text-slate-500 font-mono">{os.id}</span>
                                      {os.prioridade && (
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${prioridadeColor}`}>{os.prioridade}</span>
                                      )}
                                      {os.tipo && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-slate-700/30 bg-slate-800/30 text-slate-400">{os.tipo}</span>
                                      )}
                                    </div>
                                    <p className="text-sm font-bold text-white">{os.ativo || os.id}</p>
                                    {os.sintoma && (
                                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{os.sintoma}</p>
                                    )}
                                    <p className="text-[10px] text-slate-600 mt-1">
                                      {os.setor || 'Sem setor'}{tempoAberta ? ` · ${tempoAberta}` : ''}{os.solicitante ? ` · ${os.solicitante}` : ''}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssumirModalOs(os);
                                      setAssumirResponsavel('');
                                      setAssumirErro('');
                                    }}
                                    data-tour="assumir-os"
                                    className="rounded-lg border border-cyan-400/30 bg-cyan-500/[0.07] px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/15 hover:border-cyan-400/40 transition-all duration-200 shrink-0"
                                  >
                                    Assumir
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800/30 bg-slate-950/20 p-6 text-sm text-slate-500 text-center">
                          <Layers size={20} className="text-slate-600 mx-auto mb-2" />
                          Nenhuma OS aguardando atendimento
                        </div>
                      )}
                    </div>

                    {/* Minhas OS */}
                    <div data-tour="minhas-os" className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                            <Wrench size={12} className="text-emerald-400" />
                          </div>
                          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Minhas OS</h3>
                        </div>
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-emerald-500/[0.08] text-emerald-300 border border-emerald-400/15">
                          {manutencaoOperadorListas.minhas.length} atribuída(s)
                        </span>
                      </div>
                      {manutencaoOperadorListas.minhas.length ? (
                        <div className="space-y-3">
                          {manutencaoOperadorListas.minhas.map((os) => {
                            const statusColor = {
                              'Em andamento': 'bg-amber-500/12 text-amber-300 border-amber-400/25',
                              'Aguardando peca': 'bg-purple-500/12 text-purple-300 border-purple-400/25',
                              'Aberta': 'bg-blue-500/12 text-blue-300 border-blue-400/25',
                              'Contestada': 'bg-rose-500/12 text-rose-300 border-rose-400/25',
                            }[os.status] || 'bg-slate-700/20 text-slate-400 border-slate-600/20';
                            const maquinaParada = os.statusMaquina === 'Parada' || os.parada === 'Sim';
                            return (
                              <div key={os.id} className={`rounded-xl border p-4 hover:bg-slate-800/30 transition-all duration-200 ${maquinaParada ? 'border-rose-500/20 bg-rose-950/10' : 'border-slate-800/30 bg-slate-900/30'}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className="text-[9px] font-bold text-slate-500 font-mono">{os.id}</span>
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${statusColor}`}>{os.status || '-'}</span>
                                      {maquinaParada && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-rose-400/25 bg-rose-500/10 text-rose-300">Máq. parada</span>
                                      )}
                                    </div>
                                    <p className="text-sm font-bold text-white truncate">{os.ativo || os.id}</p>
                                    {os.sintoma && (
                                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{os.sintoma}</p>
                                    )}
                                    <p className="text-[10px] text-slate-600 mt-1">{os.setor || 'Sem setor'}{os.prioridade ? ` · ${os.prioridade}` : ''}</p>
                                  </div>
                                </div>
                                <div data-tour="acoes-os" className="flex flex-wrap items-center gap-1.5 text-xs mt-3 pt-3 border-t border-slate-800/30">
                                  {os.status === 'Finalizada' ? (
                                    <button
                                      type="button"
                                      onClick={() => atualizarOs(os.id, { status: 'Contestada' })}
                                      className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] px-2.5 py-1 font-bold text-rose-300 hover:bg-rose-500/15 transition-all"
                                    >
                                      Reabrir
                                    </button>
                                  ) : os.status !== 'Em andamento' && (
                                    <button
                                      type="button"
                                      onClick={() => atualizarOs(os.id, { status: 'Em andamento' })}
                                      className="rounded-lg border border-blue-400/25 bg-blue-500/[0.06] px-2.5 py-1 font-bold text-blue-300 hover:bg-blue-500/15 transition-all"
                                    >
                                      Iniciar
                                    </button>
                                  )}
                                  {os.status !== 'Finalizada' && os.status !== 'Aguardando peca' && (
                                    <button
                                      type="button"
                                      onClick={() => atualizarOs(os.id, { status: 'Aguardando peca' })}
                                      className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-2.5 py-1 font-bold text-amber-300 hover:bg-amber-500/15 transition-all"
                                    >
                                      Pausar
                                    </button>
                                  )}
                                  {os.status !== 'Finalizada' && (
                                    <button
                                      type="button"
                                      onClick={() => atualizarOs(os.id, { status: 'Finalizada', fechadaEm: new Date().toISOString() })}
                                      className="rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-2.5 py-1 font-bold text-emerald-300 hover:bg-emerald-500/15 transition-all"
                                    >
                                      Finalizar
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleVisualizarOs(os)}
                                    className="rounded-lg border border-amber-400/20 bg-amber-500/[0.05] px-2.5 py-1 font-bold text-amber-300 hover:bg-amber-500/10 transition-all"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditarOs(os)}
                                    className="rounded-lg border border-slate-600/30 bg-slate-800/20 px-2.5 py-1 font-bold text-slate-300 hover:bg-slate-700/30 transition-all"
                                  >
                                    Editar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800/30 bg-slate-950/20 p-6 text-sm text-slate-500 text-center">
                          <Wrench size={20} className="text-slate-600 mx-auto mb-2" />
                          Nenhuma OS atribuída a você
                        </div>
                      )}
                    </div>
                  </div>
                  {canViewEquipeStatus && (
                    <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
                            <Users size={14} className="text-cyan-400" />
                          </div>
                          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Equipe</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 text-[9px] font-bold text-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {manutencaoStatusEquipe.filter((item) => item.ocupado).length} ocupado(s)
                          </span>
                          <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {manutencaoStatusEquipe.filter((item) => !item.ocupado).length} disponível(is)
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {manutencaoStatusEquipe.map((item) => (
                          <div key={item.nome} className={`rounded-xl border p-3 transition-all duration-200 hover:scale-[1.01] ${item.ocupado ? 'border-amber-500/15 bg-amber-500/[0.03]' : 'border-emerald-500/15 bg-emerald-500/[0.03]'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${item.ocupado ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                  {item.nome.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-100 truncate">{item.nome}</p>
                                  <p className="text-[10px] text-slate-500">{item.setor}</p>
                                </div>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0 ${item.ocupado ? 'border border-amber-400/20 bg-amber-500/[0.08] text-amber-300' : 'border border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300'}`}>
                                {item.ocupado ? 'Ocupado' : 'Disponível'}
                              </span>
                            </div>
                            {item.ocupado && (
                              <p className="mt-2 text-[10px] text-slate-500 truncate">
                                {item.total} OS · {item.ativos.join(' · ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                )}

                {/* ── SUB-ABA RELATÓRIOS ── */}
                {subAbaManutencao === 'relatorios' && (
                  <div className="space-y-6">
                    {/* Header + filtro período */}
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center">
                          <BarChart3 size={18} className="text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Relatórios de Manutenção</h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">{relatorioResumoGeral.total} ordens no período selecionado</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/60 rounded-xl px-4 py-2.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Período:</span>
                        <input type="date" value={relatorioInicio} onChange={(e) => setRelatorioInicio(e.target.value)} className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/50 focus:outline-none" />
                        <span className="text-slate-600 text-xs">até</span>
                        <input type="date" value={relatorioFim} onChange={(e) => setRelatorioFim(e.target.value)} className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/50 focus:outline-none" />
                        {(relatorioInicio || relatorioFim) && (
                          <button onClick={() => { setRelatorioInicio(''); setRelatorioFim(''); }} className="text-[10px] text-amber-400 hover:text-amber-300 font-bold ml-1">Limpar</button>
                        )}
                      </div>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Total OS', value: relatorioResumoGeral.total, icon: ClipboardList, accent: 'from-slate-500/20 to-slate-600/10', border: 'border-slate-700/40', tone: 'text-white' },
                        { label: 'Abertas', value: relatorioResumoGeral.abertas, icon: Unlock, accent: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/25', tone: 'text-amber-300' },
                        { label: 'Em andamento', value: relatorioResumoGeral.emAndamento, icon: Settings, accent: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/25', tone: 'text-blue-300' },
                        { label: 'Finalizadas', value: relatorioResumoGeral.finalizadas, icon: CheckCircle2, accent: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/25', tone: 'text-emerald-300' },
                        { label: '% Resolvidas', value: `${relatorioResumoGeral.pctResolvidas}%`, icon: BarChart3, accent: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/25', tone: 'text-cyan-300' },
                        { label: 'Tempo médio', value: relatorioResumoGeral.tempoMedioStr, icon: Timer, accent: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/25', tone: 'text-purple-300' },
                      ].map((kpi) => (
                        <div key={kpi.label} className={`rounded-xl border ${kpi.border} bg-gradient-to-br ${kpi.accent} p-4 hover:scale-[1.02] transition-transform`}>
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">{kpi.label}</p>
                            <kpi.icon size={14} className={kpi.tone} strokeWidth={2.25} />
                          </div>
                          <p className={`mt-2 text-2xl font-black ${kpi.tone}`}>{kpi.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Gráficos: Status + Tipo + Prioridade */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {/* Status Donut */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Distribuição por Status</h4>
                        <p className="text-[10px] text-slate-500 mb-3">{relatorioResumoGeral.total} ordens</p>
                        {relatorioStatusData.length > 0 ? (
                          <>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Pie data={relatorioStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false} label={renderPieLabel} labelLine={false}>
                                  {relatorioStatusData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                              {relatorioStatusData.map((d) => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                  <span className="text-[10px] text-slate-400">{d.name}</span>
                                  <span className="text-[10px] font-bold text-slate-200">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-600 text-center py-10">Sem dados</p>}
                      </div>

                      {/* Tipo Donut */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Distribuição por Tipo</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Corretiva vs Preventiva</p>
                        {relatorioPorTipo.length > 0 ? (
                          <>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Pie data={relatorioPorTipo} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false} label={renderPieLabel} labelLine={false}>
                                  {relatorioPorTipo.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                              {relatorioPorTipo.map((d) => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                  <span className="text-[10px] text-slate-400">{d.name}</span>
                                  <span className="text-[10px] font-bold text-slate-200">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-600 text-center py-10">Sem dados</p>}
                      </div>

                      {/* Prioridade Donut */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Distribuição por Prioridade</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Crítica / Alta / Média / Baixa</p>
                        {relatorioPorPrioridade.length > 0 ? (
                          <>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Pie data={relatorioPorPrioridade} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false} label={renderPieLabel} labelLine={false}>
                                  {relatorioPorPrioridade.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                              {relatorioPorPrioridade.map((d) => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                  <span className="text-[10px] text-slate-400">{d.name}</span>
                                  <span className="text-[10px] font-bold text-slate-200">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-600 text-center py-10">Sem dados</p>}
                      </div>
                    </div>

                    {/* Evolução Mensal - BarChart */}
                    {relatorioPorMes.length > 0 && (
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Evolução Mensal</h4>
                        <p className="text-[10px] text-slate-500 mb-4">Abertas vs Finalizadas por mês</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={relatorioPorMes} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                            <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                            <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                            <Bar dataKey="Abertas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Finalizadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Categoria Donut + Setor Table */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Categoria */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">OS por Categoria</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Distribuição das categorias de falha</p>
                        {relatorioPorCategoria.length > 0 ? (
                          <>
                            <ResponsiveContainer width="100%" height={220}>
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Pie data={relatorioPorCategoria} cx="50%" cy="50%" outerRadius={85} paddingAngle={2} dataKey="value" stroke="none" isAnimationActive={false} label={renderPieLabel} labelLine={false}>
                                  {relatorioPorCategoria.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                              {relatorioPorCategoria.map((d) => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                  <span className="text-[10px] text-slate-400">{d.name}</span>
                                  <span className="text-[10px] font-bold text-slate-200">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-600 text-center py-10">Sem dados</p>}
                      </div>

                      {/* Por setor - tabela */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">OS por Setor</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Performance de cada setor</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-800/60">
                                <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Setor</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Abertas</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Finalizadas</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">T. Médio</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatorioPorSetor.map((s) => {
                                const tm = s.tempoCount > 0 ? Math.round(s.tempoTotal / s.tempoCount / 3600000) : 0;
                                const tmStr = tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`;
                                return (
                                  <tr key={s.setor} className="border-b border-slate-800/20 hover:bg-slate-800/20 transition-colors">
                                    <td className="py-2 px-3 font-bold text-slate-200">{s.setor}</td>
                                    <td className="text-right py-2 px-3 text-slate-100 font-black">{s.total}</td>
                                    <td className="text-right py-2 px-3 text-amber-300 font-bold">{s.abertas}</td>
                                    <td className="text-right py-2 px-3 text-emerald-300 font-bold">{s.finalizadas}</td>
                                    <td className="text-right py-2 px-3 text-purple-300 font-bold">{tmStr}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Top Ativos + Responsáveis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Top 15 ativos */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Top 15 Ativos com mais OS</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Equipamentos que mais demandam manutenção</p>
                        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-900">
                              <tr className="border-b border-slate-800/60">
                                <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">#</th>
                                <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ativo</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Abertas</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fin.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatorioTopAtivos.map((item, idx) => (
                                <tr key={item.ativo} className="border-b border-slate-800/20 hover:bg-slate-800/20 transition-colors">
                                  <td className="py-2 px-3 text-slate-600 font-bold">{idx + 1}</td>
                                  <td className="py-2 px-3 font-bold text-slate-200 truncate max-w-[200px]">{item.ativo}</td>
                                  <td className="text-right py-2 px-3 text-slate-100 font-black">{item.total}</td>
                                  <td className="text-right py-2 px-3 text-amber-300 font-bold">{item.abertas}</td>
                                  <td className="text-right py-2 px-3 text-emerald-300 font-bold">{item.finalizadas}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Responsáveis */}
                      <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Performance por Responsável</h4>
                        <p className="text-[10px] text-slate-500 mb-3">Ranking de resolução</p>
                        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-900">
                              <tr className="border-b border-slate-800/60">
                                <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Responsável</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fin.</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Andamento</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">T.Médio</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">%Res</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatorioPorResponsavel.map((item) => {
                                const tm = item.tempoCount > 0 ? Math.round(item.tempoTotal / item.tempoCount / 3600000) : 0;
                                const tmStr = tm === 0 ? '-' : tm < 24 ? `${tm}h` : `${Math.round(tm / 24)}d`;
                                const pctR = item.total > 0 ? Math.round((item.finalizadas / item.total) * 100) : 0;
                                return (
                                  <tr key={item.responsavel} className="border-b border-slate-800/20 hover:bg-slate-800/20 transition-colors">
                                    <td className="py-2 px-3 font-bold text-slate-200">{item.responsavel}</td>
                                    <td className="text-right py-2 px-3 text-slate-100 font-black">{item.total}</td>
                                    <td className="text-right py-2 px-3 text-emerald-300 font-bold">{item.finalizadas}</td>
                                    <td className="text-right py-2 px-3 text-blue-300 font-bold">{item.emAndamento}</td>
                                    <td className="text-right py-2 px-3 text-purple-300 font-bold">{tmStr}</td>
                                    <td className="text-right py-2 px-3">
                                      <span className={`font-black ${pctR >= 70 ? 'text-emerald-300' : pctR >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>{pctR}%</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Tendência 7 dias */}
                    <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-950/40 p-5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1">Tendência — Últimos 7 dias</h4>
                      <p className="text-[10px] text-slate-500 mb-4">Abertas vs Finalizadas por dia</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={manutencaoTendencia7d} barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} allowDecimals={false} />
                          <RechartsTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px', color: '#e2e8f0' }} />
                          <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                          <Bar dataKey="abertas" name="Abertas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="finalizadas" name="Finalizadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'logs' && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 p-6 shadow-md">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/70">Painel de logs</p>
                          <h3 className="mt-1 text-lg font-black text-white">Rastreamento das ações da manutenção</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Mostra abertura, visualização, alteração de status, reabertura com contestação e ajustes de nome.
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-xs text-slate-300">
                          Últimos <span className="font-black text-white">{manutencaoLogs.length}</span> eventos
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/60 to-slate-900/30 shadow-md overflow-hidden">
                      <div className="border-b border-slate-800/40 bg-slate-900/30 px-5 py-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">Linha do tempo</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">Auditoria em tempo real do que cada usuário fez</p>
                        </div>
                        {manutencaoLogsLoading ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Atualizando...</span>
                        ) : null}
                      </div>

                      {manutencaoLogsLoading ? (
                        <div className="px-5 py-12 text-center text-sm text-slate-500">Carregando logs...</div>
                      ) : manutencaoLogsError ? (
                        <div className="px-5 py-12 text-center text-sm text-rose-300">{manutencaoLogsError}</div>
                      ) : manutencaoLogs.length ? (
                        <div className="divide-y divide-slate-800/30">
                          {manutencaoLogs.map((log) => (
                            <div key={log.id} className="px-5 py-4 hover:bg-slate-800/20 transition-colors">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold ${getLogAcaoTone(log.acao)}`}>
                                      {getLogAcaoLabel(log.acao)}
                                    </span>
                                    {log.ordemId ? (
                                      <span className="text-[10px] font-bold text-slate-400">{log.ordemId}</span>
                                    ) : null}
                                    {log.statusNovo ? (
                                      <span className="text-[10px] text-slate-500">
                                        {log.statusAnterior ? `${log.statusAnterior} → ` : ''}
                                        {log.statusNovo}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div>
                                    <p className="text-sm font-bold text-white">
                                      {log.usuario?.nome || log.usuario?.email || 'Usuario'}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {log.ativo || 'Sem ativo'}{log.setor ? ` · ${log.setor}` : ''}
                                    </p>
                                  </div>

                                  <p className="text-sm text-slate-300 leading-6 break-words">
                                    {log.descricao || 'Acao registrada no painel de manutencao.'}
                                  </p>

                                  {log.contestacao?.motivo ? (
                                    <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                                      <span className="font-bold uppercase tracking-wider text-rose-300">Contestacao</span>
                                      <div className="mt-1">{log.contestacao.motivo}</div>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="shrink-0 text-right">
                                  <p className="text-xs font-semibold text-slate-300">
                                    {formatDateTimeRelatorio(log.createdAt)}
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {tempoDecorrido(log.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-5 py-12 text-center text-sm text-slate-500">
                          Nenhuma ação registrada ainda.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {manutencaoDetalheModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-6">
                    <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">Detalhes da OS</p>
                          <h3 className="mt-1 text-lg font-black text-white">
                            {manutencaoDetalheModal.ativo || manutencaoDetalheModal.id}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {manutencaoDetalheModal.id} · {manutencaoDetalheModal.status || '-'} · {manutencaoDetalheModal.statusMaquina || '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManutencaoDetalheModal(null)}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white"
                        >
                          Fechar
                        </button>
                      </div>

                      <div className="grid max-h-[calc(92vh-88px)] grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="space-y-6 px-6 py-5">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {[
                              ['OS', manutencaoDetalheModal.id],
                              ['Ativo', manutencaoDetalheModal.ativo],
                              ['Setor', manutencaoDetalheModal.setor],
                              ['Processo', manutencaoDetalheModal.processo],
                              ['Prioridade', manutencaoDetalheModal.prioridade],
                              ['Tipo', manutencaoDetalheModal.tipo],
                              ['Categoria', manutencaoDetalheModal.categoria],
                              ['Status da OS', manutencaoDetalheModal.status],
                              ['Status da maquina', manutencaoDetalheModal.statusMaquina],
                              ['Responsavel', manutencaoDetalheModal.responsavel],
                              ['Solicitante', manutencaoDetalheModal.solicitante],
                              ['Aberta por', manutencaoDetalheModal.createdByName || manutencaoDetalheModal.createdByEmail],
                              ['Impacto', manutencaoDetalheModal.impacto],
                              ['Componente', manutencaoDetalheModal.componente],
                              ['Sintoma', manutencaoDetalheModal.sintoma],
                              ['Causa provavel', manutencaoDetalheModal.causaProvavel],
                              ['Acao imediata', manutencaoDetalheModal.acaoImediata],
                              ['Tempo estimado', manutencaoDetalheModal.tempoEstimado],
                              ['Tempo parada', manutencaoDetalheModal.tempoParada],
                              ['Custo estimado', manutencaoDetalheModal.custoEstimado],
                              ['Data falha', formatDateTimeRelatorio(manutencaoDetalheModal.dataFalha)],
                              ['Criado em', formatDateTimeRelatorio(manutencaoDetalheModal.createdAt)],
                              ['Atualizado em', formatDateTimeRelatorio(manutencaoDetalheModal.updatedAt)],
                              ['Reaberta em', formatDateTimeRelatorio(manutencaoDetalheModal.reabertaEm)],
                              ['Reaberta por', manutencaoDetalheModal.reabertaPor?.nome || manutencaoDetalheModal.reabertaPor?.email],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-100 break-words">{value || '-'}</p>
                              </div>
                            ))}
                          </div>

                          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Descricao</p>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                              {manutencaoDetalheModal.descricao || 'Sem descricao informada.'}
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-slate-800 px-6 py-5 lg:border-l lg:border-t-0">
                          {manutencaoDetalheModal.ultimaContestacao?.motivo ? (
                            <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300">Contestacao registrada</p>
                              <p className="mt-2 text-sm text-rose-50 leading-6">
                                {manutencaoDetalheModal.ultimaContestacao.motivo}
                              </p>
                              <p className="mt-2 text-[11px] text-rose-200/70">
                                {manutencaoDetalheModal.ultimaContestacao.reabertaPor?.nome || manutencaoDetalheModal.ultimaContestacao.reabertaPor?.email || 'Usuario'} · {formatDateTimeRelatorio(manutencaoDetalheModal.ultimaContestacao.reabertaEm)}
                              </p>
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Foto anexada</p>
                            {manutencaoDetalheModal.fotoUrl ? (
                              <div className="mt-4 space-y-3">
                                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                                  <img
                                    src={manutencaoDetalheModal.fotoUrl}
                                    alt={`Foto da OS ${manutencaoDetalheModal.id}`}
                                    className="max-h-[60vh] w-full object-contain"
                                  />
                                </div>
                                <a
                                  href={manutencaoDetalheModal.fotoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-blue-500/15"
                                >
                                  Abrir foto em tamanho real
                                </a>
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">Sem foto anexada.</p>
                            )}
                          </div>

                          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Últimos logs desta OS</p>
                            <div className="mt-3 space-y-3">
                              {manutencaoLogs
                                .filter((log) => log.ordemId === manutencaoDetalheModal.id)
                                .slice(0, 6)
                                .map((log) => (
                                  <div key={log.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${getLogAcaoTone(log.acao)}`}>
                                        {getLogAcaoLabel(log.acao)}
                                      </span>
                                      <span className="text-[10px] text-slate-500">{formatDateTimeRelatorio(log.createdAt)}</span>
                                    </div>
                                    <p className="mt-2 text-xs font-semibold text-slate-200">{log.usuario?.nome || log.usuario?.email || 'Usuario'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{log.descricao || 'Sem descricao adicional.'}</p>
                                  </div>
                                ))}
                              {!manutencaoLogs.filter((log) => log.ordemId === manutencaoDetalheModal.id).length ? (
                                <p className="text-sm text-slate-500">Nenhum log específico encontrado para esta OS.</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {statusMaquinaPromptOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-6">
                    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                      <div className="border-b border-slate-800 px-6 py-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">Nova OS</p>
                        <h3 className="mt-2 text-lg font-black text-white">Qual o status da maquina?</h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Selecione antes de abrir a ordem para preencher esse campo automaticamente.
                        </p>
                      </div>
                      <div className="space-y-3 px-6 py-5">
                        <button
                          type="button"
                          onClick={() => handleSelecionarStatusMaquinaNovaOs('Parada')}
                          className="flex w-full items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left text-sm font-bold text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/15"
                        >
                          <span>Parada</span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-rose-200/80">Critico</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelecionarStatusMaquinaNovaOs('Rodando')}
                          className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left text-sm font-bold text-emerald-100 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
                        >
                          <span>Rodando</span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80">Operando</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelecionarStatusMaquinaNovaOs('Em manutencao')}
                          className="flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm font-bold text-amber-100 transition hover:border-amber-400/50 hover:bg-amber-500/15"
                        >
                          <span>Em manutencao</span>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Equipe atuando</span>
                        </button>
                      </div>
                      <div className="border-t border-slate-800 px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setStatusMaquinaPromptOpen(false)}
                          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {manutencaoModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-6">
                    <div data-tour="nova-os-container" className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-950 text-slate-100 shadow-2xl border border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                        <div>
                          <h3 className="text-lg font-black text-white">
                            {manutencaoEditId ? 'Editar Ordem de Servico' : 'Nova Ordem de Servico'}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {manutencaoEditId ? 'Atualize os dados da OS.' : 'Registro rapido de OS.'}
                          </p>
                        </div>
                        <button onClick={() => setManutencaoModalOpen(false)} className="text-slate-500 hover:text-slate-200">Fechar</button>
                      </div>
                      <form data-tour="nova-os-scroll" onSubmit={handleNovaOsSubmit} autoComplete="off" className="max-h-[calc(90vh-120px)] overflow-y-auto space-y-4 px-6 py-5">
                        {!manutencaoEditId && (
                          <div>
                            <label className="text-xs font-bold text-slate-400">Filtrar por Setor</label>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {['Todos', ...Array.from(new Set(listaMaquinas.map((m) => m.setor).filter(Boolean))).sort()].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => {
                                    setNovaOsFiltroSetor(s);
                                    setNovaOsForm((prev) => ({ ...prev, ativo: '', setor: s === 'Todos' ? '' : s, processo: '' }));
                                  }}
                                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                                    novaOsFiltroSetor === s
                                      ? 'bg-blue-600 text-white shadow'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Ativo</label>
                            <div className="md:hidden">
                              <input
                                value={filtroAtivoMobile}
                                onChange={(e) => setFiltroAtivoMobile(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                                placeholder="Pesquisar ativo"
                              />
                            </div>
                            <select
                              name="ativo"
                              value={novaOsForm.ativo}
                              onChange={handleNovaOsChange}
                              data-tour="nova-os-ativo"
                              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none md:hidden"
                            >
                              <option value="">Selecione...</option>
                              {listaMaquinasMobile.map((item) => (
                                <option key={item.id} value={item.nome}>
                                  {getMaquinaOpcaoLabel(item)}
                                </option>
                              ))}
                            </select>
                            <input
                              name="ativo"
                              list="manutencao-ativos"
                              value={novaOsForm.ativo}
                              onChange={handleNovaOsChange}
                              autoComplete="off"
                              data-tour="nova-os-ativo"
                              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none hidden md:block"
                              placeholder="Ex: Injetora 01"
                            />
                            <datalist id="manutencao-ativos">
                              {listaMaquinasNovaOs.map((item) => (
                                <option key={item.id} value={item.nome}>
                                  {getMaquinaOpcaoLabel(item)}
                                </option>
                              ))}
                            </datalist>
</div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Setor</label>
                            <input name="setor" value={novaOsForm.setor} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Producao A" required />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Processo</label>
                          <input
                            name="processo"
                            value={novaOsForm.processo}
                            onChange={handleNovaOsChange}
                            readOnly
                            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Processo da industria"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Prioridade</label>
                            <select name="prioridade" value={novaOsForm.prioridade} onChange={handleNovaOsChange} data-tour="nova-os-prioridade" className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Baixa</option>
                              <option>Media</option>
                              <option>Alta</option>
                              <option>Critica</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Tipo</label>
                            <select name="tipo" value={novaOsForm.tipo} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Corretiva</option>
                              <option>Preventiva</option>
                              <option>Inspecao</option>
                              <option>Melhoria</option>
                              <option>Outro</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Categoria do problema</label>
                            <select name="categoria" value={novaOsForm.categoria} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option value="">Selecione</option>
                              <option>Eletrico</option>
                              <option>Mecanico</option>
                              <option>Hidraulico</option>
                              <option>Pneumatico</option>
                              <option>Automacao/CLP</option>
                              <option>Instrumentacao/Sensores</option>
                              <option>Software</option>
                              <option>Utilidades</option>
                              <option>Qualidade</option>
                              <option>Seguranca</option>
                              <option>Outro</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Impacto</label>
                            <select name="impacto" value={novaOsForm.impacto} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Baixo</option>
                              <option>Medio</option>
                              <option>Alto</option>
                              <option>Critico</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Componente/parte</label>
                            <input name="componente" value={novaOsForm.componente} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Motor, redutor, sensor" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Sintoma</label>
                            <input name="sintoma" value={novaOsForm.sintoma} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Barulho, travando, vazamento" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Data/hora da falha</label>
                            <input type="datetime-local" name="dataFalha" value={novaOsForm.dataFalha} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Tempo estimado (hh:mm)</label>
                            <input name="tempoEstimado" value={novaOsForm.tempoEstimado} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: 02:00" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Solicitante</label>
                            <input name="solicitante" value={novaOsForm.solicitante} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Nome/area" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Custo estimado (R$)</label>
                            <input name="custoEstimado" value={novaOsForm.custoEstimado} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: 350,00" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Causa provavel</label>
                          <input name="causaProvavel" value={novaOsForm.causaProvavel} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Desgaste, falta de lubrificacao" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Acao imediata</label>
                          <input name="acaoImediata" value={novaOsForm.acaoImediata} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Isolar equipamento, ajuste rapido" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Status da OS</label>
                            <select name="status" value={novaOsForm.status} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Aberta</option>
                              <option>Em andamento</option>
                              <option>Aguardando peca</option>
                              <option>Contestada</option>
                              <option>Finalizada</option>
                              <option>Cancelada</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Status da maquina</label>
                            <select name="statusMaquina" value={novaOsForm.statusMaquina} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Rodando</option>
                              <option>Parada</option>
                              <option>Parada programada</option>
                              <option>Parada nao programada</option>
                              <option>Em manutencao</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Sintoma</label>
                          <input name="sintoma" value={novaOsForm.sintoma} onChange={handleNovaOsChange} data-tour="nova-os-sintoma" className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Barulho, travando, vazamento" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Descricao</label>
                          <textarea name="descricao" value={novaOsForm.descricao} onChange={handleNovaOsChange} rows={3} data-tour="nova-os-descricao" className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Descreva a falha ou solicitacao" required />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-400">Foto do problema ou componente</label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleNovaOsFotoChange}
                            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600/20 file:px-3 file:py-1 file:text-xs file:font-bold file:text-blue-100 hover:file:bg-blue-600/30"
                          />
                          <p className="mt-2 text-[11px] text-slate-500">Use a foto para registrar o problema ou o componente envolvido.</p>
                          {novaOsFotoPreview || novaOsForm.fotoUrl ? (
                            <div className="mt-3">
                              <img
                                src={novaOsFotoPreview || novaOsForm.fotoUrl}
                                alt="Foto da OS"
                                className="h-28 w-28 rounded-xl border border-slate-800 object-cover"
                              />
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">Sem foto anexada.</p>
                          )}
                        </div>
                        {manutencaoSaveError && (
                          <div className="text-xs text-rose-300">
                            {manutencaoSaveError}
                          </div>
                        )}
                        <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setManutencaoModalOpen(false);
                              setManutencaoEditId(null);
                            }}
                            className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-500"
                          >
                            Cancelar
                          </button>
                          <button type="submit" data-tour="nova-os-salvar" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500">
                            {manutencaoEditId ? 'Salvar alteracoes' : 'Salvar OS'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {guiaOperadorOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Guia do Operador</p>
                          <h4 className="text-lg font-black text-white">{GUIA_OPERADOR_PASSOS[guiaOperadorStep].titulo}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGuiaOperadorOpen(false)}
                          className="text-slate-400 hover:text-slate-200 text-xs font-bold"
                        >
                          Fechar
                        </button>
                      </div>
                      <div className="px-6 py-5 text-sm text-slate-300">
                        {GUIA_OPERADOR_PASSOS[guiaOperadorStep].texto}
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 text-xs">
                        <span className="text-slate-400">
                          Passo {guiaOperadorStep + 1} de {GUIA_OPERADOR_PASSOS.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setGuiaOperadorStep((prev) => Math.max(prev - 1, 0))}
                            disabled={guiaOperadorStep === 0}
                            className="rounded-full border border-slate-700 px-3 py-1 font-bold text-slate-300 disabled:opacity-40"
                          >
                            Voltar
                          </button>
                          {guiaOperadorStep < GUIA_OPERADOR_PASSOS.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => setGuiaOperadorStep((prev) => Math.min(prev + 1, GUIA_OPERADOR_PASSOS.length - 1))}
                              className="rounded-full bg-cyan-500/80 px-4 py-1 font-bold text-slate-950 hover:bg-cyan-400"
                            >
                              Proximo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGuiaOperadorOpen(false)}
                              className="rounded-full bg-emerald-500/80 px-4 py-1 font-bold text-slate-950 hover:bg-emerald-400"
                            >
                              Finalizar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tourOperadorOpen && (
                  <div className="fixed inset-0 z-[60] pointer-events-none">
                    <div className="absolute inset-0 bg-slate-950/60" />
                    {tourOperadorPos && (!GUIA_OPERADOR_TOUR[tourOperadorStep]?.requiresModal || manutencaoModalOpen) && (
                      <div
                        className="fixed rounded-2xl border border-cyan-400/60 shadow-[0_0_0_4px_rgba(34,211,238,0.2)]"
                        style={{
                          top: tourOperadorPos.rect.top - 6,
                          left: tourOperadorPos.rect.left - 6,
                          width: tourOperadorPos.rect.width + 12,
                          height: tourOperadorPos.rect.height + 12,
                          borderRadius: 14,
                        }}
                      />
                    )}
                    {(tourOperadorPos || (GUIA_OPERADOR_TOUR[tourOperadorStep]?.requiresModal && manutencaoModalOpen)) && (
                      <div
                        className="fixed w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl pointer-events-auto"
                        style={{
                          top: tourOperadorPos ? tourOperadorPos.top : '50%',
                          left: tourOperadorPos ? tourOperadorPos.left : '50%',
                          transform: tourOperadorPos ? tourOperadorPos.transform : 'translate(-50%, -50%)',
                        }}
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Guia interativo</p>
                            <h4 className="text-base font-black text-white">
                              {GUIA_OPERADOR_TOUR[tourOperadorStep]?.titulo}
                            </h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTourOperadorOpen(false)}
                            className="text-slate-400 hover:text-slate-200 text-xs font-bold"
                          >
                            Fechar
                          </button>
                        </div>
                        <div className="px-5 py-4 text-sm text-slate-300">
                          {tourOperadorPos
                            ? GUIA_OPERADOR_TOUR[tourOperadorStep]?.texto
                            : 'Localizando o campo no formulario...'}
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 text-xs">
                          <span className="text-slate-400">
                            Passo {tourOperadorStep + 1} de {GUIA_OPERADOR_TOUR.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTourOperadorOpen(false);
                                setTourOperadorPos(null);
                              }}
                              className="rounded-full border border-slate-700 px-3 py-1 font-bold text-slate-300"
                            >
                              Sair
                            </button>
                            <button
                              type="button"
                              onClick={() => setTourOperadorStep((prev) => Math.max(prev - 1, 0))}
                              disabled={tourOperadorStep === 0}
                              className="rounded-full border border-slate-700 px-3 py-1 font-bold text-slate-300 disabled:opacity-40"
                            >
                              Voltar
                            </button>
                            {tourOperadorStep < GUIA_OPERADOR_TOUR.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => setTourOperadorStep((prev) => Math.min(prev + 1, GUIA_OPERADOR_TOUR.length - 1))}
                                className="rounded-full bg-cyan-500/80 px-4 py-1 font-bold text-slate-950 hover:bg-cyan-400"
                              >
                                Proximo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setTourOperadorOpen(false);
                                  setTourOperadorPos(null);
                                  if (manutencaoModalOpen && !manutencaoEditId) {
                                    setManutencaoModalOpen(false);
                                  }
                                }}
                                className="rounded-full bg-emerald-500/80 px-4 py-1 font-bold text-slate-950 hover:bg-emerald-400"
                              >
                                Finalizar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {assumirModalOs && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-6">
                    <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-950 text-slate-100 shadow-2xl border border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                        <div>
                          <h3 className="text-lg font-black text-white">Assumir OS</h3>
                          <p className="text-xs text-slate-400">
                            Selecione o responsavel para esta ordem.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAssumirModalOs(null)}
                          className="text-slate-400 hover:text-white"
                        >
                          <XCircle size={20} />
                        </button>
                      </div>

                      <div className="px-6 py-5 space-y-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                          <p className="text-xs text-slate-400">OS</p>
                          <p className="text-sm font-bold text-white">
                            {assumirModalOs.ativo || assumirModalOs.id}
                          </p>
                          <p className="text-xs text-slate-500">
                            {assumirModalOs.setor || 'Sem setor'} · {assumirModalOs.prioridade || '-'}
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2">
                            Responsavel
                          </label>
                          <select
                            value={assumirResponsavel}
                            onChange={(e) => setAssumirResponsavel(e.target.value)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                          >
                            <option value="">Selecione...</option>
                            {manutencaoColaboradores.map((colab) => (
                              <option key={colab.id || colab.nome} value={colab.nome}>
                                {colab.nome} {colab.setor ? `- ${colab.setor}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {assumirErro && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                            {assumirErro}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setAssumirModalOs(null)}
                          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!assumirResponsavel) {
                              setAssumirErro('Selecione um responsavel.');
                              return;
                            }
                            atualizarOs(assumirModalOs.id, {
                              responsavel: assumirResponsavel,
                              status: 'Em andamento',
                            });
                            setAssumirModalOs(null);
                          }}
                          className="rounded-full border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20"
                        >
                          Confirmar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
                </div>
             </div>
          )}

          {perfilNomeModalOpen && authUser && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 px-4 py-6">
              <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                <div className="border-b border-slate-800 px-6 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">Identificação</p>
                  <h3 className="mt-2 text-lg font-black text-white">Como você quer aparecer na manutenção?</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Esse nome será salvo no banco da manutenção para logs, contestação e histórico de OS.
                  </p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2">Nome exibido</label>
                    <input
                      value={perfilNomeInput}
                      onChange={(e) => setPerfilNomeInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                      placeholder="Ex: João Silva"
                    />
                    <p className="mt-2 text-[11px] text-slate-500">Login atual: {authUser.email}</p>
                  </div>
                  {perfilNomeErro ? (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {perfilNomeErro}
                    </div>
                  ) : null}
                </div>
                <div className="border-t border-slate-800 px-6 py-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSalvarPerfilNome}
                    className="rounded-full border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/20"
                  >
                    Salvar nome
                  </button>
                </div>
              </div>
            </div>
          )}

          {reaberturaContexto && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 px-4 py-6">
              <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                <div className="border-b border-slate-800 px-6 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-rose-300">Reabertura de OS</p>
                  <h3 className="mt-2 text-lg font-black text-white">Essa OS foi finalizada. Deseja contestar?</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    A contestação segue junto no aviso para quem receber a informação da OS reaberta.
                  </p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <p className="text-xs text-slate-400">OS</p>
                    <p className="text-sm font-bold text-white">
                      {reaberturaContexto.ordem?.ativo || reaberturaContexto.ordem?.id || reaberturaContexto.osId}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status atual: Finalizada · Novo status: {reaberturaStatusDestino}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReaberturaStatusDestino('Aberta')}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${reaberturaStatusDestino === 'Aberta' ? 'bg-blue-500/20 text-blue-100 border border-blue-400/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      Reabrir como Aberta
                    </button>
                    <button
                      type="button"
                      onClick={() => setReaberturaStatusDestino('Contestada')}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${reaberturaStatusDestino === 'Contestada' ? 'bg-rose-500/20 text-rose-100 border border-rose-400/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      Reabrir como Contestada
                    </button>
                    <button
                      type="button"
                      onClick={() => setReaberturaStatusDestino('Em andamento')}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${reaberturaStatusDestino === 'Em andamento' ? 'bg-amber-500/20 text-amber-100 border border-amber-400/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      Reabrir em andamento
                    </button>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                    <input
                      id="contestar-os"
                      type="checkbox"
                      checked={reaberturaContestar}
                      onChange={(e) => setReaberturaContestar(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-rose-400"
                    />
                    <label htmlFor="contestar-os" className="text-sm font-semibold text-slate-200">
                      Marcar esta reabertura como contestação
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2">Motivo da contestação</label>
                    <textarea
                      value={reaberturaMotivo}
                      onChange={(e) => setReaberturaMotivo(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-rose-400 focus:outline-none"
                      placeholder="Ex: O serviço foi finalizado, mas a falha continuou no equipamento."
                    />
                  </div>

                  {reaberturaErro ? (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {reaberturaErro}
                    </div>
                  ) : null}
                </div>
                <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={fecharModalReabertura}
                    className="rounded-full border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarReaberturaOs}
                    className="rounded-full border border-rose-400/60 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/20"
                  >
                    Reabrir OS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ABA DE CONFIGURAÇÃO */}
          {/* ABA PLANEJAMENTO AÇO */}
          {abaAtiva === 'mrp-aco' && (
            <div className="animate-in slide-in-from-top duration-500">
              <MrpAco />
            </div>
          )}

          {/* ABA RASTREABILIDADE */}
          {abaAtiva === 'rastreabilidade' && (
            <div className="animate-in slide-in-from-top duration-500">
              <Rastreabilidade faturamentoLinhas={faturamentoLinhas} clientesPorCodigo={clientesPorCodigo} />
            </div>
          )}

          {abaAtiva === 'configuracao' && (
             <div className="space-y-8 animate-in slide-in-from-top duration-500">
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
                   <button onClick={() => setSubAbaConfig('processos')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'processos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Processos</button>
                   <button onClick={() => setSubAbaConfig('maquinas')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'maquinas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Ativos</button>
                   <button onClick={() => setSubAbaConfig('equipe')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'equipe' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Equipe</button>
                </div>

                {subAbaConfig === 'processos' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Layers size={22} className="text-blue-600" /> Setores Estruturais</h3>
                    <form className="flex flex-wrap gap-4 mb-8" onSubmit={async (e) => {
                      e.preventDefault();
                      const v = e.target.elements.novoSetor.value;
                      await handleSalvarSetor(v);
                      e.target.reset();
                    }}>
                       <input name="novoSetor" type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Ex: Acabamento" />
                       <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2"><Plus size={18}/> Criar</button>
                    </form>
                    {setoresErro && (
                      <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {setoresErro}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                       {listaSetores.map(s => (
                         <div key={s} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex justify-between items-center group">
                            <span className="font-bold text-slate-700 text-sm">{s}</span>
                            <Trash2 size={16} className="text-slate-300 hover:text-rose-500 cursor-pointer" onClick={() => handleExcluirSetor(s)} />
                         </div>
                       ))}
                    </div>
                    </div>
                    <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                      <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><UserCog size={22} className="text-blue-600" /> Supervisores</h3>
                      <form className="flex gap-4 mb-8" onSubmit={(e) => {
                        e.preventDefault();
                        const v = e.target.elements.novoSupervisor.value;
                        if (v && !listaGestores.includes(v)) {
                          setListaGestores([...listaGestores, v]);
                          setDoc(doc(db, 'supervisores', normalizarIdFirestore(v)), { nome: v })
                            .catch((err) => console.error('Erro ao salvar supervisor:', err));
                        }
                        e.target.reset();
                      }}>
                        <input name="novoSupervisor" type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Ex: Thalles" />
                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2"><Plus size={18}/> Criar</button>
                      </form>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {listaGestores.map((g) => (
                          <div key={g} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between gap-3">
                            {supervisorEditando === g ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  value={supervisorNome}
                                  onChange={(e) => setSupervisorNome(e.target.value)}
                                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={salvarEdicaoSupervisor}
                                  className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold"
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelarEdicaoSupervisor}
                                  className="px-3 py-2 rounded-lg bg-slate-200 text-slate-600 text-xs font-bold"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-bold text-slate-700 text-sm">{g}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => iniciarEdicaoSupervisor(g)}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-500"
                                  >
                                    Editar
                                  </button>
                                  <Trash2
                                    size={16}
                                    className="text-slate-300 hover:text-rose-500 cursor-pointer"
                                    onClick={() => {
                                      setListaGestores(listaGestores.filter(x => x !== g));
                                      deleteDoc(doc(db, 'supervisores', normalizarIdFirestore(g)))
                                        .catch((err) => console.error('Erro ao remover supervisor:', err));
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {subAbaConfig === 'maquinas' && (
                  <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Cpu size={22} className="text-blue-600" /> Cadastro de Ativos</h3>
                    <form className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4" onSubmit={async (e) => {
                      e.preventDefault();
                      const n = e.target.elements.nomeMaq.value;
                      const cc = novoAtivoCc;
                      const processo = normalizarTexto(cc) === 'industria' ? novoAtivoProcesso : '';
                      await handleSalvarMaquina(n, cc, processo);
                      e.target.reset();
                      handleResetNovoAtivoForm();
                    }}>
                       <input name="nomeMaq" type="text" className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Nome da Máquina" />
                       <div className="flex flex-col gap-2">
                         <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                             Centro de Custo
                           </label>
                           <input
                             name="setorMaq"
                             value={novoAtivoCc}
                             onChange={(e) => setNovoAtivoCc(e.target.value)}
                             list="config-ativo-cc-opcoes"
                             autoComplete="off"
                             placeholder="Ex: Industria, Transporte, Corte..."
                             className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none"
                             required
                           />
                           <datalist id="config-ativo-cc-opcoes">
                             {Array.from(
                               new Set([
                                 'Industria',
                                 'Transporte',
                                 ...listaMaquinas.map((m) => m.setor).filter(Boolean),
                               ])
                             )
                               .sort()
                               .map((s) => (
                                 <option key={s} value={s} />
                               ))}
                           </datalist>
                         </div>
                         {normalizarTexto(novoAtivoCc) === 'industria' && (
                           <select
                             value={novoAtivoProcesso}
                             onChange={(e) => setNovoAtivoProcesso(e.target.value)}
                             className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none"
                           >
                             <option value="">Processo da industria</option>
                             {listaSetores.map((p) => (
                               <option key={p} value={p}>{p}</option>
                             ))}
                           </select>
                         )}
                       </div>
                       <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2"><Plus size={18}/> Salvar</button>
                    </form>
                    {bensSeedDone && !bensSeedError && (
                      <div className="mb-4 text-xs font-semibold text-emerald-600">
                        Ativos base importados no Firebase.
                      </div>
                    )}
                    {bensSeedError && (
                      <div className="mb-4 text-xs font-semibold text-rose-600">{bensSeedError}</div>
                    )}
                    {maquinasErro && (
                      <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {maquinasErro}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                        <Filter size={14} />
                        Filtro
                      </div>
                      <select
                        value={filtroAtivos}
                        onChange={(e) => setFiltroAtivos(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
                      >
                        <option>Todos</option>
                        {Array.from(new Set(listaMaquinas.map((m) => m.setor).filter(Boolean))).sort().map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {ativosFiltrados.map(m => (
                         <div key={m.id} className="bg-white border border-slate-200 p-4 rounded-xl flex justify-between items-center border-l-4 border-l-blue-600 shadow-sm">
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{m.nome}</p>
                              <p className="text-[10px] text-blue-600 font-bold uppercase">{m.setor}</p>
                              {normalizarTexto(m.setor) === 'industria' && (
                                <p className="text-[10px] font-bold uppercase text-emerald-600">
                                  {m.processo ? `Processo: ${m.processo}` : 'Sem processo'}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {normalizarTexto(m.setor) === 'industria' && (
                                <button
                                  type="button"
                                  className="text-xs font-bold text-blue-600 hover:text-blue-500"
                                  onClick={() => {
                                    setProcessoEditId(m.id);
                                    setProcessoEditValue(m.processo || '');
                                    setProcessoEditOpen(true);
                                  }}
                                >
                                  Editar
                                </button>
                              )}
                              <Trash2 size={16} className="text-slate-200 hover:text-rose-500 cursor-pointer" onClick={() => handleExcluirMaquina(m.id)} />
                            </div>
                          </div>
                       ))}
                    </div>
                    {processoEditOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
                        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
                          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                            <h4 className="text-sm font-bold text-slate-800">Vincular processo</h4>
                            <button
                              type="button"
                              onClick={() => {
                                setProcessoEditOpen(false);
                                setProcessoEditId(null);
                                setProcessoEditValue('');
                              }}
                              className="text-xs font-bold text-slate-400 hover:text-slate-600"
                            >
                              Fechar
                            </button>
                          </div>
                          <div className="px-6 py-5 space-y-4">
                            <div>
                              <label className="text-xs font-bold text-slate-500">Processo da indústria</label>
                              <select
                                value={processoEditValue}
                                onChange={(e) => setProcessoEditValue(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                              >
                                <option value="">Selecione</option>
                                {listaSetores.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setProcessoEditOpen(false);
                                  setProcessoEditId(null);
                                  setProcessoEditValue('');
                                }}
                                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:border-slate-300"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setProcessoEditValue('');
                                }}
                                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:border-slate-300"
                              >
                                Limpar
                              </button>
                              <button
                                type="button"
                                onClick={handleSalvarProcessoMaquina}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {subAbaConfig === 'equipe' && (
                  <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><UserCog size={22} className="text-blue-600" /> Gerenciamento de Pessoal</h3>
                    <form className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8" onSubmit={(e) => {
                      e.preventDefault();
                      const n = e.target.elements.nome.value;
                      const c = e.target.elements.cargo.value;
                      const s = e.target.elements.setor.value;
                      const g = e.target.elements.gestor.value;
                      if(n && c) setColaboradores([...colaboradores, { id: Date.now(), nome: n, cargo: c, setor: s, gestor: g, estaAusente: false }]);
                      e.target.reset();
                    }}>
                       <input name="nome" type="text" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none" placeholder="Nome" />
                       <input name="cargo" type="text" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none" placeholder="Cargo" />
                       <select name="setor" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none">{listaSetores.map(s => <option key={s}>{s}</option>)}</select>
                       <select name="gestor" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none">
                         {listaGestores.map((m) => <option key={m}>{m}</option>)}
                       </select>
                       <button type="submit" className="bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-xs"><Plus size={14}/> Cadastrar</button>
                    </form>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {colaboradores.map(c => (
                         <div key={c.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center group">
                            <div><p className="font-bold text-slate-800 text-xs">{c.nome}</p><p className="text-[9px] text-slate-400 font-bold uppercase">{c.cargo} ? {c.setor}</p></div>
                            <Trash2 size={14} className="text-slate-200 hover:text-rose-500 cursor-pointer" onClick={() => setColaboradores(colaboradores.filter(x => x.id !== c.id))} />
                         </div>
                       ))}
                    </div>
                  </div>
                )}
             </div>
          )}
        </div>
        {metaConfigOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-slate-200">
                  Meta mensal por filial
                </h3>
                <button
                  type="button"
                  onClick={() => setMetaConfigOpen(false)}
                  className="text-slate-400 hover:text-white text-sm font-bold"
                >
                  Fechar
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 px-1">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Filial</span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Meta mensal (R$)</span>
                </div>
                <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                  {(dashboardFiliais || []).map((filial) => (
                    <div key={filial} className="grid grid-cols-2 gap-3 items-center">
                      <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100">
                        Filial {filial}
                      </div>
                      <input
                        type="text"
                        value={metaConfigDraft?.[filial] || ''}
                        onChange={(e) =>
                          setMetaConfigDraft((prev) => ({ ...(prev || {}), [filial]: e.target.value }))
                        }
                        placeholder="Ex.: 350000"
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {metaConfigErro && (
                <p className="mt-3 text-xs text-rose-300">{metaConfigErro}</p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMetaConfigOpen(false)}
                  disabled={metaConfigSaving}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvarMetaFilial}
                  disabled={metaConfigSaving}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-60"
                >
                  {metaConfigSaving ? 'Salvando...' : 'Salvar tudo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Menu Mobile Inferior */}
      {menuMobileMaisAberto && (
        <div
          className="md:hidden fixed inset-0 z-30"
          onClick={() => setMenuMobileMaisAberto(false)}
        />
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 border-t border-slate-800 backdrop-blur">
        {menuMobileMaisAberto && menuItemsMais.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur shadow-2xl overflow-hidden">
            {menuItemsMais.map((item) => {
              const isDisabled = item.id === 'portfolio' && isPortfolioDisabled;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isDisabled) return;
                    setAbaAtiva(item.id);
                    setMenuMobileMaisAberto(false);
                  }}
                  disabled={isDisabled}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wide transition-all border-b border-slate-800/60 last:border-b-0 ${
                    abaAtiva === item.id
                      ? 'text-blue-400 bg-blue-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex">
          {menuItemsPrincipais.map((item) => {
            const isDisabled = item.id === 'portfolio' && isPortfolioDisabled;
            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && setAbaAtiva(item.id)}
                disabled={isDisabled}
                className={`flex flex-1 min-w-[56px] flex-col items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wide transition-all ${
                  abaAtiva === item.id
                    ? 'text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                } ${isDisabled ? 'cursor-not-allowed opacity-50 hover:text-slate-400' : ''}`}
                title={isDisabled ? 'Em ajuste' : undefined}
              >
                <item.icon size={18} />
                <span className="whitespace-nowrap">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
          {menuItemsMais.length > 0 && (
            <button
              onClick={() => setMenuMobileMaisAberto((prev) => !prev)}
              className={`flex flex-1 min-w-[56px] flex-col items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wide transition-all ${
                menuMobileMaisAberto || abaAtivaEstaNoMais
                  ? 'text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {menuMobileMaisAberto ? <ChevronUp size={18} /> : <MoreHorizontal size={18} />}
              <span className="whitespace-nowrap">Mais</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}










