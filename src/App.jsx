import React, { useState, useEffect, useMemo } from 'react';
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
import bensData from './data/bens.json';
import veiculosData from './data/relacao_veiculos.json';
import { computeCostBreakdown } from './services/costing';
import * as XLSX from 'xlsx';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  Factory, 
  DollarSign, 
  Layers,
  ChevronRight,
  ChevronLeft,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  UserX,
  UserPlus,
  Trash2,
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
  ShoppingCart
} from 'lucide-react';

// --- Constantes e Dados Iniciais ---

const ITENS_MENU = [
  { id: 'dashboard-tv', label: 'Dashboard TV', icon: LayoutDashboard },
  { id: 'executivo', label: 'Painel Executivo', icon: LayoutDashboard },
  { id: 'faturamento', label: 'Faturamento', icon: DollarSign },
  { id: 'custos', label: 'Custos', icon: Layers },
  { id: 'portfolio', label: 'Portfólio / Mix', icon: Briefcase },
  { id: 'gestao', label: 'Operação Diária', icon: Activity },
  { id: 'manutencao', label: 'Manutencao', icon: Wrench },
  { id: 'configuracao', label: 'Configuração Global', icon: Settings },
];

const MANUTENCAO_KPIS = [];
const MANUTENCAO_PARADAS = [];

const SETORES_BASE = ['Industria', 'Transporte'];
const SETORES_INICIAIS = [];
const GESTORES_INICIAIS = ['Thalles'];
const MAQUINAS_INICIAIS = [];

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

const CFOP_SAIDA_TABLE = [
  {
    cfop: '5101',
    descricaoFiscal: 'Venda de produção do estabelecimento',
    pratica: 'Venda de produto fabricado pela própria empresa, dentro do estado',
    faturamento: '✅ Sim',
  },
  {
    cfop: '5102',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros',
    pratica: 'Revenda de mercadoria comprada, dentro do estado',
    faturamento: '✅ Sim',
  },
  {
    cfop: '6101',
    descricaoFiscal: 'Venda de produção do estabelecimento (interestadual)',
    pratica: 'Venda de produto fabricado, para outro estado',
    faturamento: '✅ Sim',
  },
  {
    cfop: '6102',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros (interestadual)',
    pratica: 'Revenda para outro estado',
    faturamento: '✅ Sim',
  },
  {
    cfop: '6107',
    descricaoFiscal: 'Venda de produção fora do estado sem destaque de ICMS',
    pratica: 'Venda interestadual com tratamento fiscal específico',
    faturamento: '⚠️ Depende (normalmente não)',
  },
  {
    cfop: '5401',
    descricaoFiscal: 'Venda de produção do estabelecimento com ST',
    pratica: 'Venda de produto fabricado com ICMS-ST',
    faturamento: '✅ Sim (bruto)',
  },
  {
    cfop: '5403',
    descricaoFiscal: 'Venda de mercadoria adquirida de terceiros com ST',
    pratica: 'Revenda com ICMS-ST',
    faturamento: '✅ Sim (bruto)',
  },
  {
    cfop: '6401',
    descricaoFiscal: 'Venda de produção do estabelecimento com ST (interestadual)',
    pratica: 'Venda interestadual com ST',
    faturamento: '✅ Sim (bruto)',
  },
  {
    cfop: '5152',
    descricaoFiscal: 'Transferência de mercadoria entre estabelecimentos',
    pratica: 'Envio entre filiais da mesma empresa',
    faturamento: '❌ Não',
  },
  {
    cfop: '5405',
    descricaoFiscal: 'Transferência de produção do estabelecimento com ST',
    pratica: 'Transferência interna com ST',
    faturamento: '❌ Não',
  },
  {
    cfop: '5409',
    descricaoFiscal: 'Transferência de mercadoria adquirida de terceiros com ST',
    pratica: 'Transferência interna de mercadoria com ST',
    faturamento: '❌ Não',
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
    faturamento: '⚠️ Depende',
  },
  {
    cfop: '6109',
    descricaoFiscal: 'Outras vendas de mercadorias (interestadual)',
    pratica: 'Venda com tratamento fiscal especial',
    faturamento: '⚠️ Depende',
  },
  {
    cfop: '5201',
    descricaoFiscal: 'Devolução de compra para industrialização',
    pratica: 'Retorno de mercadoria ao fornecedor',
    faturamento: '❌ Não',
  },
  {
    cfop: '6910',
    descricaoFiscal: 'Bonificação / doação / brinde',
    pratica: 'Saída sem cobrança',
    faturamento: '❌ Não',
  },
  {
    cfop: '6915',
    descricaoFiscal: 'Remessa simbólica / retorno de industrialização',
    pratica: 'Ajuste fiscal/logístico',
    faturamento: '❌ Não',
  },
  {
    cfop: '6901',
    descricaoFiscal: 'Remessa para industrialização fora do estabelecimento',
    pratica: 'Envio para industrialização em terceiro',
    faturamento: '❌ Não',
  },
];

const CFOP_FILTER_OPTIONS = CFOP_SAIDA_TABLE.map((item) => item.cfop);
const CFOP_FATURAMENTO_SET = new Set(['5101', '5102', '6101', '6102', '5401', '5403', '6401', '6107']);
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

export default function App() {
  const [authUser, setAuthUser] = useState(null);
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
  const [filtroFilial2025, setFiltroFilial2025] = useState('Todas');
  const [filtroCfops2025, setFiltroCfops2025] = useState([]);
  const [filtroFilial, setFiltroFilial] = useState('08');
  const [filtroCfops, setFiltroCfops] = useState(CFOP_DEFAULTS);
  const [mostrarFiltroCfop, setMostrarFiltroCfop] = useState(false);
  const [mostrarFiltroFaturamento, setMostrarFiltroFaturamento] = useState(false);
  const [diaFaturamentoSelecionado, setDiaFaturamentoSelecionado] = useState(null);
  const [faturamentoTabelaView, setFaturamentoTabelaView] = useState('dia');
  const [faturamentoInicio, setFaturamentoInicio] = useState('');
  const [faturamentoFim, setFaturamentoFim] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const [bensSeedLoading, setBensSeedLoading] = useState(false);
  const [bensSeedError, setBensSeedError] = useState('');
  const [bensSeedDone, setBensSeedDone] = useState(false);
  const [rapidoSupervisor, setRapidoSupervisor] = useState('');
  const [rapidoSupervisorErro, setRapidoSupervisorErro] = useState('');
  const [modoRapidoOpen, setModoRapidoOpen] = useState(false);
  const [modoRapidoIndex, setModoRapidoIndex] = useState(0);
  const [manutencaoModalOpen, setManutencaoModalOpen] = useState(false);
  const [manutencaoOrdens, setManutencaoOrdens] = useState([]);
  const [manutencaoOrdensLoading, setManutencaoOrdensLoading] = useState(true);
  const [manutencaoOrdensError, setManutencaoOrdensError] = useState('');
  const [manutencaoSaveError, setManutencaoSaveError] = useState('');
  const [manutencaoEditId, setManutencaoEditId] = useState(null);
  const [processoEditOpen, setProcessoEditOpen] = useState(false);
  const [processoEditId, setProcessoEditId] = useState(null);
  const [processoEditValue, setProcessoEditValue] = useState('');
  const [novoAtivoCc, setNovoAtivoCc] = useState('');
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
    descricao: '',
    fotoUrl: '',
    fechadaEm: '',
  };
  const [novaOsForm, setNovaOsForm] = useState(novaOsDefaults);

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

  const handleNovaOsSubmit = async (e) => {
    e.preventDefault();
    setManutencaoSaveError('');
    if (!isAllowedDomain) {
      setManutencaoSaveError('Sem permissao para salvar.');
      return;
    }
    const osId = manutencaoEditId || `os-${Date.now()}`;
    let fotoUrl = novaOsForm.fotoUrl || '';
    if (novaOsFotoFile) {
      const safeName = `${Date.now()}-${novaOsFotoFile.name}`;
      const storageRef = ref(storage, `manutencao_os/${osId}/${safeName}`);
      await uploadBytes(storageRef, novaOsFotoFile);
      fotoUrl = await getDownloadURL(storageRef);
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
      processo: novaOsForm.processo,
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
      descricao: novaOsForm.descricao,
      fotoUrl,
      responsavel: authUser?.displayName || authUser?.email || 'Usuario',
      createdAt: manutencaoEditId ? novaOsForm.createdAt : new Date().toISOString(),
      fechadaEm: fechadaEmFinal,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'manutencao_os', osId), payload);
      setManutencaoOrdens((prev) => {
        const next = prev.filter((item) => item.id !== osId);
        return [{ id: osId, ...payload }, ...next];
      });
      setManutencaoModalOpen(false);
      setManutencaoEditId(null);
      setNovaOsFotoFile(null);
      setNovaOsFotoPreview('');
      setNovaOsForm(novaOsDefaults);
    } catch (err) {
      console.error('Erro ao salvar OS:', err);
      const message =
        err?.message ||
        err?.code ||
        'Nao foi possivel salvar a OS.';
      setManutencaoSaveError(message);
    }
  };

  const handleEditarOs = (ordem) => {
    setManutencaoEditId(ordem.id);
    setNovaOsForm({
      ativo: ordem.ativo || '',
      setor: ordem.setor || '',
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
      descricao: ordem.descricao || '',
      fotoUrl: ordem.fotoUrl || '',
      fechadaEm: ordem.fechadaEm || '',
      createdAt: ordem.createdAt || new Date().toISOString(),
    });
    setNovaOsFotoFile(null);
    setNovaOsFotoPreview('');
    setManutencaoSaveError('');
    setManutencaoModalOpen(true);
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
    const timer = setTimeout(() => setCarregando(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isAllowedDomain =
    authUser?.email?.toLowerCase()?.endsWith('@metalosa.com.br');
  const isManutencaoOnly =
    authUser?.email?.toLowerCase() === 'manutencao@metalosa.com.br';
  const isManutencaoOperador = [
    'manutencao@metalosa.com.br',
    'pcp@metalosa.com.br',
  ].includes(authUser?.email?.toLowerCase());
  const isPortfolioDisabled = true;
  const currentUserLabel = authUser?.displayName || authUser?.email || 'Usuario';

  const menuItems = useMemo(
    () =>
      isManutencaoOnly
        ? ITENS_MENU.filter((item) => item.id === 'manutencao')
        : ITENS_MENU,
    [isManutencaoOnly]
  );

  const ativosFiltrados = useMemo(() => {
    if (filtroAtivos === 'Todos') return listaMaquinas;
    const filtroNorm = normalizarTexto(filtroAtivos);
    return listaMaquinas.filter((item) =>
      normalizarTexto(item.setor).includes(filtroNorm)
    );
  }, [filtroAtivos, listaMaquinas]);

  const manutencaoOperadorListas = useMemo(() => {
    const abertas = manutencaoOrdens.filter((os) => os.status === 'Aberta');
    const minhas = manutencaoOrdens.filter((os) =>
      (os.responsavel || '').toLowerCase() === currentUserLabel.toLowerCase()
    );
    return { abertas, minhas };
  }, [manutencaoOrdens, currentUserLabel]);

  const manutencaoKpis = useMemo(() => {
    const abertas = manutencaoOrdens.filter((os) => os.status === 'Aberta').length;
    const emAndamento = manutencaoOrdens.filter((os) => os.status === 'Em andamento').length;
    const finalizadas = manutencaoOrdens.filter((os) => os.status === 'Finalizada').length;
    const total = manutencaoOrdens.length;
    return [
      { id: 'abertas', label: 'OS Abertas', value: abertas, tone: 'bg-amber-500/20 text-amber-200' },
      { id: 'andamento', label: 'Em andamento', value: emAndamento, tone: 'bg-blue-500/20 text-blue-200' },
      { id: 'finalizadas', label: 'Finalizadas', value: finalizadas, tone: 'bg-emerald-500/20 text-emerald-200' },
      { id: 'total', label: 'Total de OS', value: total, tone: 'bg-slate-500/20 text-slate-200' },
    ];
  }, [manutencaoOrdens]);

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

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      alert('Nao foi possivel preparar o PDF.');
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) return;
      frameWindow.focus();
      frameWindow.print();
      setTimeout(() => {
        iframe.remove();
      }, 1000);
    };
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

    const html = `
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Impressao OS</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #f1f5f9; }
          h1 { font-size: 22px; margin: 0; }
          h2 { font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.18em; color: #64748b; }
          .page { padding: 28px; }
          .header { background: linear-gradient(120deg, #0f172a, #1e293b); color: #f8fafc; padding: 20px 24px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand img { height: 40px; width: auto; }
          .brand small { display: block; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #94a3b8; }
          .meta { font-size: 11px; color: #cbd5f5; }
          .badges { display: flex; gap: 6px; flex-wrap: wrap; }
          .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 4px 8px; border-radius: 999px; letter-spacing: 0.08em; }
          .badge-danger { background: #fecaca; color: #991b1b; }
          .badge-warn { background: #fde68a; color: #92400e; }
          .badge-info { background: #bae6fd; color: #075985; }
          .badge-success { background: #bbf7d0; color: #166534; }
          .badge-muted { background: #e2e8f0; color: #475569; }
          .section { margin-top: 18px; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
          .card { background: #ffffff; border-radius: 14px; padding: 12px 14px; border: 1px solid #e2e8f0; }
          .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #94a3b8; }
          .card .value { margin-top: 6px; font-size: 12px; font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; background: #fff; border-radius: 12px; overflow: hidden; }
          th, td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
          th { width: 28%; background: #f8fafc; color: #475569; font-weight: 600; }
          tr:last-child td, tr:last-child th { border-bottom: none; }
          .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; background: #fff; }
          .photo { background: #fff; border-radius: 12px; padding: 10px; border: 1px solid #e2e8f0; }
          .photo img { max-width: 100%; border-radius: 10px; border: 1px solid #e2e8f0; }
          .footer { margin-top: 18px; font-size: 10px; color: #64748b; text-align: right; }
          @media print {
            body { background: #fff; }
            .page { padding: 12mm; }
            .header { border-radius: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
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
              <div class="badges" style="margin-top:6px;">
                <span class="badge ${getBadgeTone(prioridade)}">Prioridade: ${escapeHtmlRelatorio(ordem?.prioridade || '-')}</span>
                <span class="badge ${getBadgeTone(status)}">Status: ${escapeHtmlRelatorio(ordem?.status || '-')}</span>
                <span class="badge ${getBadgeTone(statusMaquina)}">Maquina: ${escapeHtmlRelatorio(ordem?.statusMaquina || '-')}</span>
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="label">OS</div>
              <div class="value">${escapeHtmlRelatorio(ordem?.id || '-')}</div>
            </div>
            <div class="card">
              <div class="label">Ativo</div>
              <div class="value">${escapeHtmlRelatorio(ordem?.ativo || '-')}</div>
            </div>
            <div class="card">
              <div class="label">Setor / Processo</div>
              <div class="value">${escapeHtmlRelatorio(`${ordem?.setor || '-'} • ${ordem?.processo || '-'}`)}</div>
            </div>
            <div class="card">
              <div class="label">Responsavel</div>
              <div class="value">${escapeHtmlRelatorio(ordem?.responsavel || '-')}</div>
            </div>
            <div class="card">
              <div class="label">Solicitante</div>
              <div class="value">${escapeHtmlRelatorio(ordem?.solicitante || '-')}</div>
            </div>
            <div class="card">
              <div class="label">Data da falha</div>
              <div class="value">${escapeHtmlRelatorio(formatDateTimeRelatorio(ordem?.dataFalha))}</div>
            </div>
          </div>

          <div class="section">
            <h2>Detalhes da OS</h2>
            <table>
              <tbody>
                ${linhasHtml || '<tr><td colspan="2">Sem dados disponiveis.</td></tr>'}
              </tbody>
            </table>
          </div>

          ${sintomaHtml}
          ${descricaoHtml}
          ${fotoHtml ? `<div class="section">${fotoHtml.replace('<div class="section">', '').replace('</div>', '')}</div>` : ''}
          <div class="footer">Metalosa · Manutencao</div>
        </div>
      </body>
      </html>
    `;

    printHtmlRelatorio(html);
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

  useEffect(() => {
    if (isManutencaoOnly && abaAtiva !== 'manutencao') {
      setAbaAtiva('manutencao');
    }
  }, [isManutencaoOnly, abaAtiva]);

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
    } catch (err) {
      setLoginError('Email ou senha invalidos.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const atualizarOs = async (osId, updates) => {
    if (!isAllowedDomain) {
      setManutencaoSaveError('Sem permissao para salvar.');
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
    try {
      await setDoc(doc(db, 'manutencao_os', osId), patch, { merge: true });
      setManutencaoOrdens((prev) =>
        prev.map((item) => (item.id === osId ? { ...item, ...patch } : item))
      );
    } catch (err) {
      setManutencaoSaveError('Nao foi possivel atualizar a OS.');
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
        let items = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
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
        const fallbackBens = (bensData || [])
          .map((item) => ({
            id: normalizarIdFirestore(item.bem || item.nome || ''),
            nome: item.nome || item.bem || 'Sem nome',
            setor: item.familia || 'Industria',
          }))
          .filter((item) => item.id);
        const fallbackVeiculos = (veiculosData || [])
          .map((item) => {
            const placa = item?.PLACAS || item?.placas || '';
            const modelo = item?.MODELO || item?.modelo || '';
            const nome = placa && modelo ? `${placa} - ${modelo}` : placa || modelo;
            return {
              id: normalizarIdFirestore(placa || modelo || ''),
              nome: nome || 'Sem nome',
              setor: 'Transporte',
            };
          })
          .filter((item) => item.id);
        const fallback = [...fallbackBens, ...fallbackVeiculos];
        const mergedMap = new Map();
        items.forEach((item) => mergedMap.set(item.id, item));
        fallback.forEach((item) => {
          if (!mergedMap.has(item.id)) {
            mergedMap.set(item.id, item);
          }
        });
        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
        setListaMaquinas(merged);
      } catch (err) {
        if (!ativo) return;
        if ((bensData?.length || 0) + (veiculosData?.length || 0) > 0) {
          const fallbackBens = (bensData || [])
            .map((item) => ({
              id: normalizarIdFirestore(item.bem || item.nome || ''),
              nome: item.nome || item.bem || 'Sem nome',
              setor: item.familia || 'Industria',
            }))
            .filter((item) => item.id);
          const fallbackVeiculos = (veiculosData || [])
            .map((item) => {
              const placa = item?.PLACAS || item?.placas || '';
              const modelo = item?.MODELO || item?.modelo || '';
              const nome = placa && modelo ? `${placa} - ${modelo}` : placa || modelo;
              return {
                id: normalizarIdFirestore(placa || modelo || ''),
                nome: nome || 'Sem nome',
                setor: 'Transporte',
              };
            })
            .filter((item) => item.id);
          const fallback = [...fallbackBens, ...fallbackVeiculos];
          fallback.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
          setListaMaquinas(fallback);
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
        (bensData || []).forEach((item) => {
          if (item.familia) {
            merged.add(item.familia);
          }
        });
        SETORES_BASE.forEach((setor) => merged.add(setor));
        const mergedList = Array.from(merged)
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b)));
        setListaSetores(mergedList);
        setSetoresCarregadosFirestore(true);
      } catch (err) {
        if (!ativo) return;
        if (bensData?.length || SETORES_BASE.length) {
          const fallback = Array.from(
            new Set([...bensData.map((item) => item.familia).filter(Boolean), ...SETORES_BASE])
          ).sort((a, b) => String(a).localeCompare(String(b)));
          setListaSetores(fallback);
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
    const carregarFaturamento = async () => {
        try {
          let linhas = Array.isArray(faturamentoData) ? [...faturamentoData] : [];
          const devolucoes = Array.isArray(devolucaoData) ? [...devolucaoData] : [];
          try {
            const resp = await fetch('/data/faturamento-2025.json');
            if (resp.ok) {
              const antigas = await resp.json();
              if (Array.isArray(antigas)) {
                linhas = [...antigas, ...linhas];
              }
            }
            const respDevolucao = await fetch('/data/devolucao-2025.json');
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

          setFaturamentoLinhas(linhas);
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
        setFaturamentoLinhas([]);
        setFaturamentoDados({
          carregando: false,
          erro: err instanceof Error ? err.message : 'Erro ao processar planilha.',
          total: 0,
          porGrupo: [],
          porMes: [],
        });
      }
    };

    carregarFaturamento();
  }, []);

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

    Object.entries(registrosPorData).forEach(([dataISO, registros]) => {
      if (!dataISO.startsWith(mesStr)) return;
      if (isDiaDesconsiderado(dataISO)) return;
      if (isDataSemApontamento(dataISO)) return;
      Object.entries(registros || {}).forEach(([id, registro]) => {
        if (!idsFiltrados.has(String(id))) return;
        faltasTotal += 1;
        diasComFalta.add(dataISO);
        const tipo = registro?.tipoFalta || 'Falta Injustificada';
        if (tipo === 'Falta Justificada') faltasJust += 1;
        else if (tipo === 'Falta Injustificada') faltasInjust += 1;
        else if (tipo === 'Ferias') {
          feriasOcorrencias += 1;
          feriasColaboradores.add(String(id));
        }
      });
    });

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
      feriasColaboradores: feriasColaboradores.size,
      diasComFalta: diasComFalta.size,
      percentualPresenca,
    };
  }, [colaboradores, filtroSupervisor, filtroSetor, registrosPorData, mesHistorico, anoHistorico]);

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
        const key = `${item.codigo ?? ''}||${item.descricao ?? ''}`;
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
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo: row?.Codigo ?? row?.codigo ?? '',
        descricao: row?.Descricao ?? row?.descricao ?? '',
        filial: row?.Filial ?? row?.filial ?? 'Sem filial',
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

    const filiaisBase = Array.from(
      new Set(linhasMes.map((row) => row.filial).filter((item) => item && item !== 'Sem filial'))
    ).sort((a, b) => String(a).localeCompare(String(b)));

    const filtradasPorFilial =
      filtroFilial === 'Todas'
        ? linhasMes
        : linhasMes.filter((row) => row.filial === filtroFilial);
    const linhasFiltradas =
      filtroCfops.length === 0
        ? filtradasPorFilial
        : filtradasPorFilial.filter((row) => {
            if (row.tipoMovimento === 'devolucao') return true;
            const cfop = String(row.cfop || '').trim();
            return cfop ? filtroCfops.includes(cfop) : false;
          });

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
          : `${row.emissao ? row.emissao.toISOString().slice(0, 10) : 'semdata'}||${chaveCliente}||${row.valorTotal}`;
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
          : `${row.emissao ? row.emissao.toISOString().slice(0, 10) : 'semdata'}||${chaveCliente}||${row.valorTotal}`;
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

      const chaveProd = `${row.codigo || ''}||${row.descricao || ''}`;
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
        const diaISO = row.emissao.toISOString().slice(0, 10);
        diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + row.valorTotal);
        if (!diaFilialMap.has(diaISO)) {
          diaFilialMap.set(diaISO, new Map());
        }
        const mapaFilial = diaFilialMap.get(diaISO);
        mapaFilial.set(filial, (mapaFilial.get(filial) || 0) + row.valorTotal);
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
        const descricaoFinal = descricao || produtosPorCodigo.get(codigoNorm) || '';
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
  }, [faturamentoLinhas, filtroFilial, filtroCfops]);

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

    if (!faturamentoLinhas.length) {
      return {
        linhasMes: [],
        filiais: [],
        mes: '',
        produtosPorCodigo,
        municipiosPorChave,
        clientesPorCodigo,
      };
    }

    const normalizadas = faturamentoLinhas.map((row) => {
      const mesInfo = obterMesKey(row);
      const tipoMovimento = normalizarTipoMovimento(row?.TipoMovimento ?? row?.tipoMovimento);
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo: row?.Codigo ?? row?.codigo ?? '',
        descricao: row?.Descricao ?? row?.descricao ?? '',
        filial: row?.Filial ?? row?.filial ?? 'Sem filial',
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

    return {
      linhasMes,
      filiais,
      mes: mesAtualDisplay,
      produtosPorCodigo,
      municipiosPorChave,
      clientesPorCodigo,
    };
  }, [faturamentoLinhas, produtosData, municipiosLatLong, clientesData]);

  const dashboardFiliais = dashboardFaturamentoBase.filiais;
  const dashboardFilialAtual =
    dashboardFiliais.length > 0
      ? dashboardFiliais[Math.min(dashboardFilialIndex, dashboardFiliais.length - 1)]
      : null;

  useEffect(() => {
    setDashboardFilialIndex(0);
  }, [dashboardFiliais.length]);

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
    const { linhasMes, clientesPorCodigo, produtosPorCodigo, municipiosPorChave } = dashboardFaturamentoBase;
    const linhasBase = dashboardFilialAtual
      ? linhasMes.filter((row) => row.filial === dashboardFilialAtual)
      : linhasMes;
    const linhasFiltradas =
      filtroCfops.length === 0
        ? linhasBase
        : linhasBase.filter((row) => {
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

      const chaveProd = `${row.codigo || ''}||${row.descricao || ''}`;
      if (!produtosMap.has(chaveProd)) {
        produtosMap.set(chaveProd, { valor: 0, quantidade: 0, unidades: new Map() });
      }
      const prod = produtosMap.get(chaveProd);
      prod.valor += row.valorTotal;
      const qtd = Number.isFinite(row.quantidade) ? row.quantidade : 0;
      prod.quantidade += qtd;
      const unidadeKey = String(row.unidade || 'N/A');
      prod.unidades.set(unidadeKey, (prod.unidades.get(unidadeKey) || 0) + (qtd || 1));

      if (row.emissao) {
        const diaISO = row.emissao.toISOString().slice(0, 10);
        diaMap.set(diaISO, (diaMap.get(diaISO) || 0) + row.valorTotal);
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
        const descricaoFinal = descricao || produtosPorCodigo.get(codigoNorm) || '';
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
    if (!diaFaturamentoSelecionado) return null;
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
      return row.emissao.toISOString().slice(0, 10) === diaFaturamentoSelecionado;
    });
    if (!linhasDia.length) return null;
    const linhasOrdenadas = [...linhasDia].sort((a, b) => {
      if (a.tipoMovimento === b.tipoMovimento) {
        return Math.abs(b.valorTotal) - Math.abs(a.valorTotal);
      }
      return a.tipoMovimento.localeCompare(b.tipoMovimento);
    });
    const linhasComDescricao = linhasOrdenadas.map((row) => {
      const descricaoAtual = row.descricao ?? '';
      if (descricaoAtual && descricaoAtual !== 0) return row;
      const codigoNorm = normalizarCodigoProduto(row.codigo);
      const descricao = produtosPorCodigo.get(codigoNorm) || '';
      return { ...row, descricao };
    });
    const linhasComCliente = linhasComDescricao.map((row) => {
      const codigoCliente = normalizarCodigoCliente(row.cliente);
      const infoCliente = clientesPorCodigo.get(codigoCliente);
      const clienteNome = row.clienteNome ?? infoCliente?.nome ?? '';
      const vendedorCodigo = infoCliente?.vendedor || '';
      const vendedorNome = vendedoresPorCodigo.get(vendedorCodigo) || '';
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
    };
  }, [diaFaturamentoSelecionado, faturamentoAtual.linhas]);

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
        const vendedorCodigo = clientesPorCodigoVendedor.get(codigoCliente) || '';
        const vendedorNome = vendedoresPorCodigo.get(vendedorCodigo) || '';
        return { ...row, vendedorNome };
      }),
    [faturamentoAtual.linhas, clientesPorCodigoVendedor, vendedoresPorCodigo]
  );

  const faturamentoLinhasFiltradas = useMemo(() => {
    if (!faturamentoInicio && !faturamentoFim) return faturamentoLinhasComVendedor;
    return faturamentoLinhasComVendedor.filter((row) => {
      const emissao = row.emissao instanceof Date ? row.emissao : parseEmissaoData(row.emissao);
      if (!emissao) return false;
      const dataISO = emissao.toISOString().slice(0, 10);
      if (faturamentoInicio && dataISO < faturamentoInicio) return false;
      if (faturamentoFim && dataISO > faturamentoFim) return false;
      return true;
    });
  }, [faturamentoLinhasComVendedor, faturamentoInicio, faturamentoFim]);

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

  const exportFaturamentoDisponivel =
    faturamentoTabelaView === 'dia'
      ? (detalhesDiaFaturamento?.linhas || []).length > 0
      : faturamentoLinhasFiltradas.length > 0;

  const handleExportarFaturamentoExcel = () => {
    const linhasBase =
      faturamentoTabelaView === 'dia' && diaFaturamentoSelecionado
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
      const data = valor instanceof Date ? valor : parseEmissaoData(valor);
      return data ? data.toLocaleDateString('pt-BR') : '';
    };

    const linhasExport = linhasBase.map((row) => ({
      Data: formatarData(row.emissao) || diaFaturamentoSelecionado || '',
      Tipo: row.tipoMovimento === 'devolucao' ? 'Devolucao' : 'Venda',
      Cliente: row.cliente || '',
      Nome: row.clienteNome || '',
      Vendedor: row.vendedorNome || '',
      Filial: row.filial || '',
      Grupo: row.grupo || '',
      Codigo: row.codigo || '',
      Descricao: row.descricao || produtosPorCodigo.get(normalizarCodigoProduto(row.codigo)) || '',
      Quantidade: row.quantidade ?? 0,
      Unidade: row.unidade || '',
      Valor: row.valorTotal ?? 0,
      NF: row.nf || '',
      CFOP: row.cfop || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(linhasExport);
    XLSX.utils.book_append_sheet(wb, ws, 'Faturamento');

    const periodo = diaFaturamentoSelecionado
      ? diaFaturamentoSelecionado
      : [faturamentoInicio, faturamentoFim].filter(Boolean).join('_') || 'completo';
    const nomeArquivo = `faturamento_${periodo}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

  useEffect(() => {
    if (!diaFaturamentoSelecionado) return;
    const existeDia = faturamentoAtual.porDia.some((item) => item.dia === diaFaturamentoSelecionado);
    if (!existeDia) {
      setDiaFaturamentoSelecionado(null);
    }
  }, [diaFaturamentoSelecionado, faturamentoAtual.porDia]);

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
        row?.Descricao ?? row?.descricao ?? produtosPorCodigo.get(normalizarCodigoProduto(codigo)) ?? '';
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo,
        descricao,
        filial: row?.Filial ?? row?.filial ?? 'Sem filial',
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
        diasSet.add(row.emissao.toISOString().slice(0, 10));
      }

      const pedidoKey = row.nf
        ? String(row.nf).trim()
        : `${row.emissao ? row.emissao.toISOString().slice(0, 10) : 'semdata'}||${row.cliente}||${row.valorTotal}`;
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

      const prodKey = `${row.codigo || ''}||${row.descricao || ''}`;
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
      const filial = row?.Filial ?? row?.filial ?? '';
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

      const filial = row?.Filial ?? row?.filial ?? 'Sem filial';
      if (filtroFilial2025 !== 'Todas' && filial !== filtroFilial2025) return;

      if (filtroCfops2025.length) {
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
  const primeiro = custosData.find((item) => item.Valores && Object.keys(item.Valores).length);
  if (!primeiro) return [];
  return Object.keys(primeiro.Valores);
}, [custosData]);

const mesCustoAtual = mesesCustos.length ? mesesCustos[mesesCustos.length - 1] : '';

const faturamentoComCustos = useMemo(
  () =>
    computeCostBreakdown({
      linhas: faturamentoAtual.linhas,
      produtoDescricaoMap,
      custosDiretos: custosData,
      custosDiretosAnoAnterior: custosPrevanoData,
      custosIndiretos: custosIndiretosData,
      mesCustoAtual,
    }),
  [
    faturamentoAtual.linhas,
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
  return custosData.reduce((acc, item) => acc + parseValor(item?.Valores?.[mesCustoAtual]), 0);
}, [custosData, mesCustoAtual]);

const totalDiretoPlanilhaPrev = useMemo(() => {
  if (!mesCustoAtual) return 0;
  return custosPrevanoData.reduce((acc, item) => acc + parseValor(item?.Valores?.[mesCustoAtual]), 0);
}, [custosPrevanoData, mesCustoAtual]);

const variacaoDiretoPlanilha = useMemo(() => {
  if (!totalDiretoPlanilhaPrev) return 0;
  return ((totalDiretoPlanilhaAtual - totalDiretoPlanilhaPrev) / totalDiretoPlanilhaPrev) * 100;
}, [totalDiretoPlanilhaAtual, totalDiretoPlanilhaPrev]);

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
  return faturamentoAtual.linhas.filter(
    (row) => normalizarCodigoProduto(row.codigo || '') === alvo
  );
}, [custoDetalheItem, faturamentoAtual.linhas]);

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
  itensCustosOrdenados.forEach((item) => {
    const codigo = normalizarCodigoProduto(item.codigo || item.skuNormalized || '');
    if (!codigo) return;
    map.set(codigo, {
      ...item,
      custoUnit: item.quantidade ? item.custo / item.quantidade : 0,
    });
  });
  return map;
}, [itensCustosOrdenados]);

const handleSeedBensFirestore = async () => {
  if (!isAllowedDomain || !authUser) {
    setBensSeedError('Sem permissao para importar bens.');
    return;
  }
  if (!bensData?.length) {
    setBensSeedError('Planilha de bens vazia ou nao carregada.');
    return;
  }
  setBensSeedError('');
  setBensSeedLoading(true);
  try {
    const maquinas = bensData
      .map((item) => ({
        id: normalizarIdFirestore(item.bem || item.nome || ''),
        nome: item.nome || item.bem || 'Sem nome',
        setor: item.familia || 'Geral',
      }))
      .filter((item) => item.id);

    const setores = Array.from(
      new Set(bensData.map((item) => item.familia).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b)));

    const chunkSize = 450;
    for (let i = 0; i < maquinas.length; i += chunkSize) {
      const batch = writeBatch(db);
      const slice = maquinas.slice(i, i + chunkSize);
      slice.forEach((item) => {
        batch.set(doc(db, 'maquinas', item.id), item, { merge: true });
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

    const mergedMap = new Map();
    listaMaquinas.forEach((item) => mergedMap.set(item.id, item));
    maquinas.forEach((item) => {
      if (!mergedMap.has(item.id)) {
        mergedMap.set(item.id, item);
      }
    });
    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    setListaMaquinas(merged);

    const setoresMerged = Array.from(new Set([...listaSetores, ...setores]))
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
                  {modalLancamento.setor} • {modalLancamento.gestor} • {dataLancamento}
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
              <button
                type="button"
                onClick={() => setModalTabelaCustosOpen(false)}
                className="rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Fechar
              </button>
            </div>
            <div className="p-6">
              {itensCustosOrdenados.length ? (
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
                      {itensCustosOrdenados.map((item) => (
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
                  {dataLancamento} • {colaboradoresDiaFiltrados.length} colaboradores filtrados
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
                            {colab.setor} • {colab.gestor}
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
                  {(authUser.displayName || authUser.email || '?')
                    .trim()
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {authUser.displayName || (authUser.email ? authUser.email.split('@')[0] : 'Usuario')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{authUser.email}</div>
                </div>
              </div>
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
      <main className={`flex-1 px-4 md:px-6 ${abaAtiva === 'dashboard-tv' ? 'pb-4' : 'pb-24 md:pb-8'}`}>
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
                <div className="xl:col-span-6 space-y-4">
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
                        {faturamentoAtual.porDia.length} dias
                      </span>
                    </div>
                    {(() => {
                      const diasExibidos = faturamentoAtual.porDia.slice(-8);
                      if (!diasExibidos.length) {
                        return (
                          <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl">
                            <p className="text-slate-400 text-xs italic">Aguardando dados do ERP...</p>
                          </div>
                        );
                      }
                      const maxValor = diasExibidos.reduce((acc, item) => Math.max(acc, item.valor), 1);
                      const mediaDia =
                        faturamentoAtual.diasAtivos > 0 ? faturamentoAtual.total / faturamentoAtual.diasAtivos : 0;
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

                <div className="xl:col-span-6 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500 font-black">Custos consolidados</p>
                        <p className="text-4xl font-black text-slate-900">{formatarMoeda(totalCustosMes)}</p>
                        <p className="text-xs text-slate-400 mt-1">{mesCustoAtual || 'Planilha de custos'}</p>
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
                        Base {mesCustoAtual || 'planilha atual'} - {faturamentoAtual.movimentos || 0} movimentos
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-[320px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Total de custos</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-emerald-300">{formatarMoeda(totalCustosMes)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">Custo / movimento</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-blue-200">{formatarMoeda(custoMedioMovimento)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">% custo no faturamento</p>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-amber-200">
                          {Number.isFinite(percentualCustoSobreFaturamento) ? `${percentualCustoSobreFaturamento.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="mr-2">Filiais</span>
                  {['Todas', ...(faturamentoAtual.filiais || [])].map((filial) => (
                    <button
                      key={filial}
                      type="button"
                      onClick={() => setFiltroFilial(filial)}
                      className={`rounded-full px-3 py-1.5 transition-all ${
                        filtroFilial === filial
                          ? 'bg-emerald-500 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {filial}
                    </button>
                  ))}
                  {faturamentoAtual.filiais?.length === 0 && (
                    <span className="text-[10px] text-slate-500">Sem filiais cadastradas.</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Indicadores</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-[10px]">Margem sobre faturamento</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">
                        {Number.isFinite(margemPercentual) ? `${margemPercentual.toFixed(1)}%` : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-[10px]">Markup sobre custo</p>
                      <p className="text-2xl font-bold text-blue-300 mt-1">
                        {Number.isFinite(markupPercentual) ? `${markupPercentual.toFixed(1)}%` : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-[10px]">Custo medio / dia</p>
                      <p className="text-2xl font-bold text-slate-100 mt-1">{formatarMoeda(custoMedioDia)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-[10px]">Qtd SKUs com custo</p>
                      <p className="text-2xl font-bold text-slate-100 mt-1">{faturamentoComCustos.itens.length || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Diretos x indiretos</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Custos diretos</span>
                        <span className="font-bold text-emerald-300">{formatarMoeda(totalDiretoMes)}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(percentualDireto, 100)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Custos indiretos (CIF)</span>
                        <span className="font-bold text-amber-300">{formatarMoeda(totalIndiretoMes)}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${Math.min(percentualIndireto, 100)}%` }} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
                      Rateio aplicado: {formatarMoeda(faturamentoComCustos.summary?.alocado || 0)}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Comparativo ano anterior</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Direto mes atual</span>
                      <span className="font-bold text-slate-100">{formatarMoeda(totalDiretoPlanilhaAtual)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Direto ano anterior</span>
                      <span className="font-bold text-slate-100">{formatarMoeda(totalDiretoPlanilhaPrev)}</span>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex items-center justify-between text-xs text-slate-300">
                      <span>Variacao</span>
                      <span className={`flex items-center gap-2 font-bold ${variacaoDiretoPlanilha >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {variacaoDiretoPlanilha >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {Number.isFinite(variacaoDiretoPlanilha) ? `${variacaoDiretoPlanilha.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Comparativo usa a mesma base de mes da planilha atual.</p>
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
                  {topCustoItens.length ? (
                    <div className="space-y-3">
                      {topCustoItens.map((item) => (
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
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Margens negativas</h3>
                  {pioresMargens.length ? (
                    <div className="space-y-3">
                      {pioresMargens.map((item) => (
                        <button
                          key={`${item.codigo}-${item.descricao}`}
                          type="button"
                          onClick={() => {
                            setCustoDetalheItem(item);
                            setCustoDetalheModalOpen(true);
                          }}
                          className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-left transition hover:border-rose-400/70 hover:bg-rose-500/15"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-100">{item.codigo || '-'}</span>
                            <span className="text-xs font-bold text-rose-200">{item.margem.toFixed(1)}%</span>
                          </div>
                          <p className="text-[11px] text-rose-200/70">{item.descricao || 'Sem descricao'}</p>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-rose-200/70">
                            <span>Custo {formatarMoeda(item.custo)}</span>
                            <span>Receita {formatarMoeda(item.receita)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-rose-200/70">
                            <span>
                              Preco medio {formatarMoeda(item.quantidade ? item.receita / item.quantidade : 0)}
                            </span>
                            <span>
                              Custo medio {formatarMoeda(item.quantidade ? item.custo / item.quantidade : 0)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Nenhuma margem negativa encontrada.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Confiabilidade do custo</h3>
                  {confiabilidadeCustos.total ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Custo direto atual</span>
                          <span className="font-bold text-emerald-300">{confiabilidadeCustos.atual.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${confiabilidadeCustos.atual}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Fallback ano anterior</span>
                          <span className="font-bold text-blue-300">{confiabilidadeCustos.fallback.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${confiabilidadeCustos.fallback}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Estimado/rateado</span>
                          <span className="font-bold text-amber-300">{confiabilidadeCustos.proxy.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${confiabilidadeCustos.proxy}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Sem custo direto</span>
                          <span className="font-bold text-rose-300">{confiabilidadeCustos.semCusto.toFixed(1)}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${confiabilidadeCustos.semCusto}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sem dados suficientes para medir confiabilidade.</p>
                  )}
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                    Base analisada: {confiabilidadeCustos.total} SKUs com receita.
                  </div>
                </div>
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
                {semCustoTop.length ? (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {semCustoTop.slice(0, 9).map((item) => (
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
                  <p className="mt-4 text-xs text-slate-400 italic">Nenhum SKU sem custo identificado.</p>
                )}
              </div>
            </div>
          )}

          {/* DASHBOARD TV */}
          {abaAtiva === 'dashboard-tv' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl">
                <div className="absolute -top-24 -right-16 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="relative flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]" />
                      <span className="text-[10px] uppercase tracking-[0.4em] text-emerald-200 font-bold">Live KPI</span>
                    </div>
                    <h2 className="text-5xl font-black text-white tracking-tight">Dashboard TV</h2>
                    <p className="text-lg text-slate-300 mt-1 font-medium">
                      Atualizado em {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {agora.toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {dashboardView === 'faturamento' && dashboardFilialAtual && (
                      <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-bold uppercase tracking-widest text-emerald-200">
                        Filial {dashboardFilialAtual} · troca 10s
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDashboardView('faturamento')}
                      className={`px-6 py-3 rounded-2xl text-base font-bold uppercase tracking-wider transition-all ${
                        dashboardView === 'faturamento'
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'border border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      Faturamento
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardView('manutencao')}
                      className={`px-6 py-3 rounded-2xl text-base font-bold uppercase tracking-wider transition-all ${
                        dashboardView === 'manutencao'
                          ? 'bg-emerald-500 text-slate-950 shadow-lg'
                          : 'border border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      Manutencao
                    </button>
                  </div>
                </div>
              </div>

              {dashboardView === 'faturamento' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">
                        Faturamento total {dashboardFilialAtual ? `· Filial ${dashboardFilialAtual}` : ''}
                      </p>
                      <p className="text-3xl font-black text-blue-300 mt-2">
                        {formatarMoeda(dashboardFaturamentoFilial.total || 0)}
                      </p>
                      <p className="text-base text-slate-400 mt-2">{dashboardFaturamentoFilial.movimentos || 0} movimentos</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.9)]">
                      <p className="text-sm uppercase tracking-[0.4em] text-slate-400 font-bold">Devolucoes</p>
                      <p className="text-3xl font-black text-rose-300 mt-2">{formatarMoeda(dashboardFaturamentoFilial.totalDevolucao || 0)}</p>
                      <p className="text-base text-slate-400 mt-2">Impacto no mes</p>
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
                          const width = 520;
                            const height = 380;
                          const margin = { top: 24, right: 16, bottom: 30, left: 16 };
                          const chartW = width - margin.left - margin.right;
                          const chartH = height - margin.top - margin.bottom;
                          const maxValor = Math.max(...dados.map((item) => item.valor), 1);
                          const media = dados.reduce((acc, item) => acc + item.valor, 0) / dados.length;
                          const yMedia = margin.top + chartH - (media / maxValor) * chartH;
                          const barW = chartW / Math.max(dados.length, 1);
                          const barWidth = Math.max(barW - 12, 10);
                          return (
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
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
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {manutencaoKpis.map((kpi) => (
                      <div key={kpi.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.9)]">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400 font-bold">{kpi.label}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-3xl font-black text-white">{kpi.value}</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${kpi.tone}`}>Hoje</span>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-6 shadow-[0_20px_40px_-30px_rgba(244,63,94,0.6)]">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-rose-200 font-bold">Paradas ativas</p>
                      <p className="text-3xl font-black text-rose-100 mt-3">{manutencaoParadas.length}</p>
                      <p className="text-xs text-rose-200/80 mt-2">Processos parados</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Paradas em andamento</h3>
                      <div className="mt-4 space-y-3">
                        {manutencaoParadas.length ? (
                          manutencaoParadas.slice(0, 6).map((item) => (
                            <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-white">{item.ativo || item.setor || item.id}</p>
                                  <p className="text-xs text-slate-400">{item.statusMaquina || 'Parada'} - {item.descricao || 'Aguardando detalhes'}</p>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-900/80 text-slate-200">
                                  {item.prioridade || 'Media'}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                            Sem paradas registradas.
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">Resumo operacional</h3>
                      <div className="mt-4 grid grid-cols-1 gap-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">OS abertas</p>
                          <p className="text-2xl font-black text-white mt-2">
                            {manutencaoKpis.find((kpi) => kpi.id === 'abertas')?.value || 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Em andamento</p>
                          <p className="text-2xl font-black text-blue-200 mt-2">
                            {manutencaoKpis.find((kpi) => kpi.id === 'andamento')?.value || 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Finalizadas</p>
                          <p className="text-2xl font-black text-emerald-200 mt-2">
                            {manutencaoKpis.find((kpi) => kpi.id === 'finalizadas')?.value || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA DE FATURAMENTO */}
          {abaAtiva === 'faturamento' && (
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
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSubAbaFaturamento('atual')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subAbaFaturamento === 'atual' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                >
                  Faturamento Atual
                </button>
                <button
                  onClick={() => setSubAbaFaturamento('2025')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subAbaFaturamento === '2025' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                >
                  Faturamento 2025
                </button>
              </div>

              {subAbaFaturamento === '2025' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-black">Consolidado 2025</p>
                        <h2 className="text-2xl font-black text-slate-900 mt-1">Painel Faturamento 2025</h2>
                        <p className="text-xs text-slate-400 mt-1">Inclui devolucoes registradas na planilha</p>
                      </div>
                      {faturamentoDados.carregando ? (
                        <span className="text-xs text-slate-400 italic">Carregando planilha...</span>
                      ) : faturamentoDados.erro ? (
                        <span className="text-xs text-rose-600 font-semibold">{faturamentoDados.erro}</span>
                      ) : (
                        <span className="text-xs text-emerald-600 font-semibold">
                          Atualizado com {faturamento2025.movimentos} movimentos
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                        Filtros 2025
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {filtroCfops2025.length ? `${filtroCfops2025.length} CFOPs` : 'Todos os CFOPs'}
                      </span>
                    </div>
                    <CfopFilterSelector
                      selected={filtroCfops2025}
                      onSelect={toggleCfopFilter2025}
                      label="CFOP"
                      options={cfops2025Options}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span className="mr-2">Filiais</span>
                      {filiais2025.map((filial) => (
                        <button
                          key={filial}
                          type="button"
                          onClick={() => setFiltroFilial2025(filial)}
                          className={`rounded-full px-3 py-1.5 transition-all ${
                            filtroFilial2025 === filial
                              ? 'bg-blue-600 text-white shadow'
                              : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {filial}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Total liquido</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">{formatarMoeda(faturamento2025.total)}</p>
                      <p className="text-xs text-slate-400 mt-1">Receita apos devolucoes</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Total bruto</p>
                      <p className="text-2xl font-black text-blue-600 mt-2">{formatarMoeda(faturamento2025.totalBruto)}</p>
                      <p className="text-xs text-slate-400 mt-1">Somente vendas</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Devolucoes</p>
                      <p className="text-2xl font-black text-rose-500 mt-2">{formatarMoeda(faturamento2025.totalDevolucao)}</p>
                      <p className="text-xs text-slate-400 mt-1">{faturamento2025.devolucaoPercent.toFixed(2)}% do bruto</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Ticket medio</p>
                      <p className="text-2xl font-black text-emerald-600 mt-2">{formatarMoeda(faturamento2025.ticketMedio)}</p>
                      <p className="text-xs text-slate-400 mt-1">{faturamento2025.pedidos} pedidos</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Clientes ativos</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">{faturamento2025.clientesAtivos}</p>
                      <p className="text-xs text-slate-400 mt-1">No ano</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Movimentos</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">{faturamento2025.movimentos}</p>
                      <p className="text-xs text-slate-400 mt-1">Linhas processadas</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Dias ativos</p>
                      <p className="text-2xl font-black text-amber-500 mt-2">{faturamento2025.diasAtivos}</p>
                      <p className="text-xs text-slate-400 mt-1">Dias com emissao</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Media mensal</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">{formatarMoeda(faturamento2025.mediaMensal)}</p>
                      <p className="text-xs text-slate-400 mt-1">{faturamento2025.porMes.length} meses</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Melhor mes</p>
                      <p className="text-xl font-black text-emerald-600 mt-2">
                        {faturamento2025.melhorMes ? faturamento2025.melhorMes.mes : '-'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {faturamento2025.melhorMes ? formatarMoeda(faturamento2025.melhorMes.valor) : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Pior mes</p>
                      <p className="text-xl font-black text-rose-500 mt-2">
                        {faturamento2025.piorMes ? faturamento2025.piorMes.mes : '-'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {faturamento2025.piorMes ? formatarMoeda(faturamento2025.piorMes.valor) : '-'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Ultimo mes</p>
                      <p className="text-xl font-black text-slate-900 mt-2">
                        {faturamento2025.variacaoUltimoMes === null
                          ? '-'
                          : `${faturamento2025.variacaoUltimoMes >= 0 ? '+' : ''}${(faturamento2025.variacaoUltimoMes * 100).toFixed(1)}%`}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Variacao MoM</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Insights 2025</h3>
                      <div className="mt-4 space-y-3 text-sm text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Share top 5 grupos</span>
                          <span className="font-black text-slate-900">{faturamento2025.shareTop5Grupos.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Percentual devolucoes</span>
                          <span className="font-black text-rose-500">{faturamento2025.devolucaoPercent.toFixed(2)}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Ticket medio por pedido</span>
                          <span className="font-black text-emerald-600">{formatarMoeda(faturamento2025.ticketMedio)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Clientes ativos</span>
                          <span className="font-black text-slate-900">{faturamento2025.clientesAtivos}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Dias com emissao</span>
                          <span className="font-black text-amber-500">{faturamento2025.diasAtivos}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Top grupos</h3>
                      <div className="mt-4 space-y-3">
                        {faturamento2025.topGrupos.slice(0, 5).map((item) => {
                          const share = faturamento2025.total !== 0 ? (item.valor / faturamento2025.total) * 100 : 0;
                          return (
                            <div key={item.grupo} className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="font-semibold text-slate-700">{item.grupo}</span>
                                <span>{formatarValorCurto(item.valor)}</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {faturamento2025.topGrupos.length === 0 && (
                          <p className="text-xs text-slate-400 italic">Sem dados por grupo.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Devolucao por CFOP</h3>
                      <div className="mt-4 space-y-3">
                        {faturamento2025.devolucoesPorCfop.slice(0, 6).map((item) => (
                          <div key={item.cfop} className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">CFOP {item.cfop}</span>
                            <span className="font-black text-rose-500">{formatarMoeda(item.valor)}</span>
                          </div>
                        ))}
                        {faturamento2025.devolucoesPorCfop.length === 0 && (
                          <p className="text-xs text-slate-400 italic">Sem devolucoes com CFOP.</p>
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
                            Filtros (Filiais/CFOP)
                          </button>
                          <span className="text-[10px] text-slate-400">
                            {filtroFilial} | {filtroCfops.length} CFOPs
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Faturamento do periodo</p>
                          <p className="text-xl font-bold text-slate-900 mt-2">
                            R$ {faturamentoAtual.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Liquido no periodo.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Devolucoes (CFOP)</p>
                            <span
                              title={[
                                'Situacao CFOP',
                                ...Object.entries(CFOP_DEVOLUCAO_LABELS).map(([cfop, label]) => {
                                  const valor = faturamentoAtual.devolucoesPorCfop?.[cfop] || 0;
                                  return `${label} (${cfop}): ${formatarMoeda(valor)}`;
                                }),
                              ].join('\n')}
                              className="text-slate-400"
                            >
                              <Info size={14} />
                            </span>
                          </div>
                          <p className="text-xl font-bold text-slate-900 mt-2">
                            R$ {faturamentoAtual.totalDevolucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Valores de devolucao no periodo.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Fat. medio/dia</p>
                          <p className="text-xl font-bold text-slate-900 mt-2 leading-tight">
                            R$ {(faturamentoAtual.diasAtivos > 0 ? faturamentoAtual.total / faturamentoAtual.diasAtivos : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Media nos dias com faturamento.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Ticket medio</p>
                          <p className="text-xl font-bold text-slate-900 mt-2">
                            R$ {faturamentoAtual.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Por movimento.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Clientes ativos</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">
                            {faturamentoAtual.clientesAtivos}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Com vendas no mes.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Dias ativos</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">
                            {faturamentoAtual.diasAtivos}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Dias com faturamento.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm xl:col-span-3">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Faturamento por dia</h4>
                            <span className="text-xs text-slate-400">{faturamentoAtual.porDia.length} dias</span>
                          </div>
                          {(() => {
                            const width = 1000;
                            const height = 310;
                            const margin = { top: 54, right: 20, bottom: 50, left: 58 };
                            const chartW = width - margin.left - margin.right;
                            const chartH = height - margin.top - margin.bottom;
                            const dados = faturamentoAtual.porDia;
                            const maxValor = Math.max(...dados.map((item) => item.valor), 1);
                            const barW = chartW / Math.max(dados.length, 1);
                            const barGap = 30;
                            const barWidth = Math.max(barW - barGap, 6);
                            const variacoes = dados.map((item, i) => {
                              if (i === 0) return null;
                              const anterior = dados[i - 1].valor;
                              if (!Number.isFinite(anterior) || anterior === 0) return null;
                              return ((item.valor - anterior) / anterior) * 100;
                            });

                            const handleDiaClick = (dia) => {
                              setDiaFaturamentoSelecionado((prev) => (prev === dia ? null : dia));
                            };

                            return (
                              <div className="space-y-4">
                                <svg
                                  viewBox={`0 0 ${width} ${height}`}
                                  className="w-full h-80"
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
                                  const barH = (item.valor / maxValor) * chartH;
                                  const y = margin.top + chartH - barH;
                                  const isSelecionado = diaFaturamentoSelecionado === item.dia;
                                  const variacao = variacoes[i];
                                  const variacaoTexto =
                                    variacao === null || !Number.isFinite(variacao)
                                      ? null
                                      : `${variacao > 0 ? '+' : ''}${variacao.toFixed(0)}%`;
                                  const isPositiva = variacao !== null && variacao >= 0;
                                  const corVariacao = isPositiva ? '#22c55e' : '#f87171';
                                  const xCentro = xBase + barWidth / 2;
                                  const xVariacao = xBase - 8;
                                  const yVariacao = Math.min(y + 14, margin.top + chartH - 10);
                                  return (
                                    <g key={item.dia} className="cursor-pointer" onClick={() => handleDiaClick(item.dia)}>
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
                              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                                      {faturamentoTabelaView === 'dia' ? 'Detalhe do dia' : 'Visao por vendedor'}
                                    </p>
                                    {faturamentoTabelaView === 'dia' ? (
                                      diaFaturamentoSelecionado ? (
                                        <p className="text-lg font-black text-white">
                                          {new Date(`${diaFaturamentoSelecionado}T00:00:00`).toLocaleDateString('pt-BR')}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-slate-400">
                                          Selecione um dia no grafico para ver as linhas.
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
                                    {faturamentoTabelaView === 'dia' && diaFaturamentoSelecionado && (
                                      <button
                                        type="button"
                                        onClick={() => setDiaFaturamentoSelecionado(null)}
                                        className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white"
                                      >
                                        Limpar dia
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {faturamentoTabelaView === 'dia' ? (
                                  diaFaturamentoSelecionado ? (
                                    <>
                                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                                        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                          <p>Total do dia</p>
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
                                      Clique em um dia no grafico para abrir a tabela com faturamento e devolucoes.
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
               <div className="flex gap-6 border-b border-slate-200">
                  <button onClick={() => setSubAbaGestao('lista')} className={`pb-3 text-sm font-bold transition-all ${subAbaGestao === 'lista' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Quadro de Faltas</button>
                  <button onClick={() => setSubAbaGestao('calendario')} className={`pb-3 text-sm font-bold transition-all flex items-center gap-2 ${subAbaGestao === 'calendario' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><CalendarIcon size={16} /> Histórico Mensal</button>
               </div>

               {subAbaGestao === 'lista' ? (
                 <div className="space-y-6">
                   <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                     <div className="flex flex-wrap items-center gap-4">
                       <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Filtros</div>
                       <div className="flex flex-wrap items-center gap-3">
                         <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                           <span>Supervisor</span>
                           <select
                             value={filtroSupervisor}
                             onChange={(e) => setFiltroSupervisor(e.target.value)}
                             className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                           >
                             {supervisoresDisponiveis.map((supervisor) => (
                               <option key={supervisor} value={supervisor}>
                                 {supervisor}
                               </option>
                             ))}
                           </select>
                         </div>
                         <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                           <span>Processo</span>
                           <select
                             value={filtroSetor}
                             onChange={(e) => setFiltroSetor(e.target.value)}
                             className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                           >
                             {setoresDisponiveis.map((setor) => (
                               <option key={setor} value={setor}>
                                 {setor}
                               </option>
                             ))}
                           </select>
                         </div>
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                       <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Total</p>
                       <p className="text-2xl font-bold text-slate-900 mt-1">{resumoFaltas.total}</p>
                       <p className="text-xs text-slate-400">Colaboradores ativos</p>
                     </div>
                     <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                       <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Presentes</p>
                       <p className="text-2xl font-bold text-emerald-600 mt-1">{resumoFaltas.presentes}</p>
                       <p className="text-xs text-slate-400">
                         {resumoFaltas.percentualPresenca.toFixed(1)}% de presenca
                       </p>
                     </div>
                     <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                       <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Ausentes</p>
                       <p className="text-2xl font-bold text-rose-600 mt-1">{resumoFaltas.ausentes}</p>
                       <p className="text-xs text-slate-400">Com faltas registradas</p>
                     </div>
                     <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                       <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Ferias</p>
                       <p className="text-2xl font-bold text-amber-600 mt-1">{resumoFaltas.porTipo['Ferias'] || 0}</p>
                       <p className="text-xs text-slate-400">Lancadas no dia</p>
                     </div>
                   </div>

                   <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                     <div className="p-6 border-b border-slate-200 bg-slate-900/80 flex flex-wrap justify-between items-center gap-4 text-sm font-bold text-slate-200 uppercase">
                       <div className="flex flex-wrap items-center gap-4">
                         <span>Lancamento Diario de Presenca</span>
                         <div className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.25)]">
                           <CalendarIcon size={14} />
                           <input
                             type="date"
                             value={dataLancamento}
                             onChange={(e) => {
                               setDataLancamento(e.target.value);
                               setDiaHistorico(null);
                             }}
                            className="rounded-full border border-amber-400/60 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-amber-100 outline-none focus:ring-2 focus:ring-amber-400/60"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14}/> Presente</span>
                        <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={14}/> Falta Justificada</span>
                        <span className="text-rose-400 flex items-center gap-1"><XCircle size={14}/> Falta Injustificada</span>
                        <span className="text-amber-300 flex items-center gap-1"><AlertTriangle size={14}/> Falta Parcial</span>
                        <span className="text-blue-400 flex items-center gap-1"><CalendarIcon size={14}/> Ferias</span>
                        <button
                          type="button"
                          onClick={abrirModalFerias}
                          className="ml-2 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-900"
                        >
                          Lançar férias
                        </button>
                        <button
                          type="button"
                          onClick={abrirModoRapido}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-blue-600/80 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-500"
                        >
                          Modo rápido
                        </button>
                      </div>
                    </div>
                     <table className="w-full text-left">
                       <thead>
                         <tr className="bg-slate-900/70 text-slate-200 text-xs uppercase font-bold tracking-wider border-b border-slate-700">
                           <th className="px-6 py-4">Colaborador</th>
                           <th className="px-6 py-4">Setor / Supervisor</th>
                           <th className="px-6 py-4 text-center">Lancamento</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 font-medium">
                        {colaboradoresDiaFiltrados.length > 0 ? (
                        colaboradoresDiaFiltrados.map((colab) => (
                           <tr key={colab.id} className="hover:bg-slate-800/70 transition-colors">
                             <td className="px-6 py-4">
                               <div className="font-bold text-slate-800 text-base">{colab.nome}</div>
                               <div className="text-xs text-slate-400 font-bold uppercase">{colab.cargo}</div>
                             </td>
                             <td className="px-6 py-4">
                               <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold uppercase mr-2">{colab.setor}</span>
                               <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Supervisor: {colab.gestor}</span>
                             </td>
                             <td className="px-6 py-4">
                               <div className="flex flex-wrap items-center justify-end gap-3">
                                 <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${
                                   colab.tipoFalta === 'Presente'
                                     ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                     : colab.tipoFalta === 'Falta Parcial'
                                       ? 'bg-amber-50 text-amber-600 border-amber-200'
                                       : colab.tipoFalta === 'Ferias'
                                         ? 'bg-blue-50 text-blue-600 border-blue-200'
                                         : 'bg-rose-50 text-rose-600 border-rose-200'
                                 }`}>
                                   {colab.tipoFalta === 'Presente' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                                   {colab.tipoFalta === 'Falta Parcial' && colab.tempoParcial
                                     ? `Falta Parcial (${colab.tempoParcial})`
                                     : colab.tipoFalta}
                                 </span>
                                 <button
                                   type="button"
                                   onClick={() => abrirModalLancamento(colab)}
                                   className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
                                 >
                                   Lancar
                                 </button>
                               </div>
                             </td>
                           </tr>
                         ))
                       ) : (
                         <tr>
                          <td className="px-6 py-6 text-slate-400 italic" colSpan={3}>Sem dados para os filtros selecionados.</td>
                         </tr>
                       )}
                       </tbody>
                     </table>
                  </div>
                 </div>
               ) : (
                 <div className="space-y-6">
                   <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
                     <div>
                       <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Historico Mensal ({anoHistorico})</h3>
                       <p className="text-xs text-slate-400 mt-1">Selecione o mes para ver o calendario e as faltas registradas.</p>
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                       <select
                         value={filtroSupervisor}
                         onChange={(e) => setFiltroSupervisor(e.target.value)}
                         className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                       >
                         {supervisoresDisponiveis.map((supervisor) => (
                           <option key={supervisor} value={supervisor}>
                             {supervisor}
                           </option>
                         ))}
                       </select>
                       <select
                         value={mesHistorico}
                         onChange={(e) => {
                           setMesHistorico(Number(e.target.value));
                           setDiaHistorico(null);
                         }}
                         className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                       >
                         {[
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
                         ].map((mes, index) => (
                           <option key={mes} value={index}>
                             {mes}
                           </option>
                         ))}
                       </select>
                       <select
                         value={anoHistorico}
                         onChange={(e) => {
                           setAnoHistorico(Number(e.target.value));
                           setDiaHistorico(null);
                         }}
                         className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                       >
                         {[2025, 2026].map((ano) => (
                           <option key={ano} value={ano}>
                             {ano}
                           </option>
                         ))}
                       </select>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                     <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                       <div className="flex items-center justify-between">
                         <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Presenca media</p>
                         <CheckCircle2 size={16} className="text-emerald-300" />
                       </div>
                       <p className="mt-2 text-2xl font-bold text-slate-100">
                         {resumoHistorico.percentualPresenca.toFixed(0)}%
                       </p>
                       <p className="text-xs text-slate-400">
                         Base: {resumoHistorico.totalColab} colabs
                       </p>
                     </div>
                     <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                       <div className="flex items-center justify-between">
                         <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Faltas no mes</p>
                         <AlertTriangle size={16} className="text-rose-300" />
                       </div>
                       <p className="mt-2 text-2xl font-bold text-slate-100">
                         {Math.max(resumoHistorico.faltasTotal - resumoHistorico.feriasOcorrencias, 0)}
                       </p>
                       <p className="text-xs text-slate-400">
                         {resumoHistorico.diasComFalta} dias com apontamentos
                       </p>
                     </div>
                     <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                       <div className="flex items-center justify-between">
                         <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Just. x Injust.</p>
                         <UserX size={16} className="text-amber-300" />
                       </div>
                       <p className="mt-2 text-2xl font-bold text-slate-100">
                         {resumoHistorico.faltasJust} / {resumoHistorico.faltasInjust}
                       </p>
                       <p className="text-xs text-slate-400">Justificadas vs Injustificadas</p>
                     </div>
                     <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                       <div className="flex items-center justify-between">
                         <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ferias</p>
                         <CalendarIcon size={16} className="text-blue-300" />
                       </div>
                       <p className="mt-2 text-2xl font-bold text-slate-100">
                         {resumoHistorico.feriasColaboradores}
                       </p>
                       <p className="text-xs text-slate-400">Dias no mes: {resumoHistorico.diasNoMes}</p>
                     </div>
                   </div>

                   <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                     {(() => {
                       const anoBase = anoHistorico;
                       const diasNoMes = new Date(anoBase, mesHistorico + 1, 0).getDate();
                       const primeiroDia = new Date(anoBase, mesHistorico, 1).getDay();
                       const offset = primeiroDia;
                       const dias = Array.from({ length: diasNoMes }, (_, i) => i + 1);
                       const totalCells = offset + diasNoMes;
                       const linhas = Math.ceil(totalCells / 7);
                       const cells = Array.from({ length: linhas * 7 }, (_, i) => {
                         const dia = i - offset + 1;
                         if (dia < 1 || dia > diasNoMes) return null;
                         return dia;
                       });

                       const hojeISO = new Date().toLocaleDateString('en-CA');
                       return (
                         <div className="space-y-4">
                           <div className="overflow-x-auto">
                             <div className="min-w-[560px]">
                               <div className="grid grid-cols-7 gap-2 text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                 {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((label) => (
                                   <div key={label} className="text-center">{label}</div>
                                 ))}
                               </div>
                               <div className="grid grid-cols-7 gap-2">
                                 {cells.map((dia, index) => {
                               if (!dia) {
                                 return <div key={`empty-${index}`} className="h-20 rounded-xl border border-dashed border-slate-700/60 bg-slate-900/40" />;
                               }
                               const mes = String(mesHistorico + 1).padStart(2, '0');
                               const diaStr = String(dia).padStart(2, '0');
                               const dataISO = `${anoBase}-${mes}-${diaStr}`;
                               const resumo = obterResumoDia(dataISO);
                               const isAtivo = diaHistorico === dataISO;
                               const isHoje = dataISO === hojeISO;
                               const diaSemana = (index % 7);
                               const isWeekend = diaSemana === 0 || diaSemana === 6;
                               const faltas = resumo.total;
                               const base = totalColaboradoresFiltrados || 0;
                               const isFolga = isFolgaColetiva(dataISO);
                               const ferias = resumo.tipos?.Ferias || 0;
                               const faltasSemFerias = Math.max(faltas - ferias, 0);
                               const semLancamento = (isWeekend || isFolga) && resumo.total === 0;
                               const mostraPercentual = !isWeekend && !isFolga;
                               const percentualPresenca = base > 0 ? ((base - faltas) / base) * 100 : 0;
                                return (
                                  <button
                                    key={dataISO}
                                    onClick={() => {
                                      setDiaHistorico(dataISO);
                                      setFiltroTipoDia('Todos');
                                    }}
                                    className={`h-20 sm:h-24 rounded-xl border px-2 sm:px-3 py-2 text-left transition-all ${
                                      isHoje
                                        ? 'border-emerald-400/70 bg-emerald-950/40 ring-2 ring-emerald-400/40'
                                        : isAtivo
                                          ? 'border-blue-500 bg-blue-950/40'
                                          : 'border-slate-800 bg-slate-900/50 hover:border-blue-500/60 hover:bg-blue-950/30'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs sm:text-sm font-bold text-slate-100">{dia}</span>
                                      {isFolga ? (
                                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-200">
                                          Folga
                                        </span>
                                      ) : isWeekend ? (
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-bold ${
                                          semLancamento
                                            ? 'bg-slate-500/20 text-slate-200'
                                            : 'bg-indigo-500/20 text-indigo-200'
                                        }`}>
                                          DSR
                                        </span>
                                      ) : (
                                        <>
                                          {ferias > 0 && (
                                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-200">
                                              {ferias} ferias
                                            </span>
                                          )}
                                          {faltasSemFerias > 0 && (
                                            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-rose-200">
                                              {faltasSemFerias} falta{faltasSemFerias > 1 ? 's' : ''}
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <div className={`mt-2 sm:mt-3 rounded-lg border px-1.5 sm:px-2 py-1 text-center text-[9px] sm:text-[11px] font-bold ${
                                      semLancamento || !mostraPercentual
                                        ? 'border-slate-700 bg-slate-900/50 text-slate-300'
                                        : 'border-slate-800 bg-slate-950/60 text-emerald-200'
                                    }`}>
                                      {dataISO > new Date().toISOString().slice(0, 10)
                                        ? '-'
                                        : isFolga
                                          ? 'Folga coletiva'
                                          : isWeekend
                                            ? 'Descanso semanal'
                                            : semLancamento
                                              ? 'Sem lancamento'
                                              : `${percentualPresenca.toFixed(0)}% presenca`}
                                    </div>
                                    <div className="mt-1.5 text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">
                                      {isFolga
                                        ? 'Folga coletiva'
                                        : isWeekend
                                          ? semLancamento
                                            ? 'Sem lancamento'
                                            : 'Descanso semanal'
                                          : (resumo.total === 0 ? 'Sem faltas' : 'Com apontamentos')}
                                    </div>
                                  </button>
                                );
                                 })}
                               </div>
                             </div>
                           </div>
                         </div>
                       );
                     })()}
                   </div>

                   <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                     {diaHistorico ? (
                       (() => {
                         const resumoDia = obterResumoDia(diaHistorico);
                         const resumoDoExcel = resumoDia?.fonte === 'excel';
                         const registros = (isDataSemApontamento(diaHistorico) || isDiaDesconsiderado(diaHistorico))
                           ? {}
                           : (registrosPorData[diaHistorico] || {});
                            const faltas = Object.entries(registros)
                               .map(([id, registro]) => {
                                 const colaborador = colaboradores.find((c) => String(c.id) === String(id));
                                 if (!colaborador) return null;
                                 return {
                                   id,
                                   nome: colaborador.nome || 'Nao encontrado',
                                   setor: colaborador.setor || '-',
                                   gestor: colaborador.gestor || '-',
                                   tipo: registro.tipoFalta || 'Falta Injustificada',
                                   tempoParcial: registro.tempoParcial || '',
                                 };
                               })
                               .filter(Boolean)
                               .filter((item) => {
                                 const supervisorOk = filtroSupervisor === 'Todos' || item.gestor === filtroSupervisor;
                                 const setorOk = filtroSetor === 'Todos' || item.setor === filtroSetor;
                                 const tipoOk = filtroTipoDia === 'Todos'
                                   ? true
                                   : filtroTipoDia === 'Ferias'
                                     ? item.tipo === 'Ferias'
                                     : item.tipo !== 'Ferias';
                                 return supervisorOk && setorOk && tipoOk;
                               });
                         return (
                           <div className="space-y-4">
                             <div className="flex items-center justify-between">
                               <div>
                                 <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Faltas do dia</p>
                                 <p className="text-sm font-semibold text-slate-800">{diaHistorico}</p>
                               </div>
                               <div className="flex items-center gap-3">
                                 <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-[11px] font-bold text-slate-500">
                                   {['Todos', 'Faltas', 'Ferias'].map((tipo) => (
                                     <button
                                       key={tipo}
                                       type="button"
                                       onClick={() => setFiltroTipoDia(tipo)}
                                       className={`px-3 py-1 rounded-full transition-colors ${
                                         filtroTipoDia === tipo
                                           ? 'bg-slate-900 text-white'
                                           : 'text-slate-500 hover:text-slate-700'
                                       }`}
                                     >
                                       {tipo}
                                     </button>
                                   ))}
                                 </div>
                                 <span className="text-xs text-slate-400">
                                   {resumoDoExcel ? resumoDia.total : faltas.length} registros
                                 </span>
                               </div>
                             </div>
                             {resumoDoExcel ? (
                               <div className="rounded-xl border border-slate-100 p-4 text-sm text-slate-600">
                                 <div className="font-bold text-slate-700 mb-2">Resumo do dia (planilha)</div>
                                 {(filtroTipoDia === 'Todos' || filtroTipoDia === 'Ferias') && (
                                   <div>Ferias: {resumoDia.tipos?.Ferias || 0}</div>
                                 )}
                                 {(filtroTipoDia === 'Todos' || filtroTipoDia === 'Faltas') && (
                                   <div>Falta Justificada: {resumoDia.tipos?.['Falta Justificada'] || 0}</div>
                                 )}
                                 {(filtroTipoDia === 'Todos' || filtroTipoDia === 'Faltas') && (
                                   <div>Falta Injustificada: {resumoDia.tipos?.['Falta Injustificada'] || 0}</div>
                                 )}
                               </div>
                             ) : faltas.length === 0 ? (
                               <p className="text-slate-400 italic">Nenhuma falta registrada neste dia.</p>
                             ) : (
                               <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
                                 <table className="w-full text-left text-xs">
                                   <thead className="sticky top-0 bg-white text-slate-400 uppercase tracking-wider">
                                     <tr>
                                       <th className="px-5 py-3">Colaborador</th>
                                       <th className="px-5 py-3">Setor</th>
                                       <th className="px-5 py-3">Supervisor</th>
                                       <th className="px-5 py-3">Tipo</th>
                                     </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-100">
                                     {faltas.map((item) => (
                                       <tr key={item.id} className="text-slate-700">
                                         <td className="px-5 py-3 font-semibold">{item.nome}</td>
                                         <td className="px-5 py-3 text-slate-500">{item.setor}</td>
                                         <td className="px-5 py-3 text-slate-500">{item.gestor}</td>
                                         <td className="px-5 py-3">
                                           <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                             item.tipo === 'Ferias'
                                               ? 'bg-amber-500/20 text-amber-700'
                                               : item.tipo === 'Falta Parcial'
                                                 ? 'bg-amber-100 text-amber-700'
                                                 : 'bg-rose-100 text-rose-600'
                                           }`}>
                                             {item.tipo === 'Falta Parcial' && item.tempoParcial
                                               ? `Falta Parcial (${item.tempoParcial})`
                                               : item.tipo}
                                           </span>
                                         </td>
                                       </tr>
                                     ))}
                                   </tbody>
                                 </table>
                               </div>
                             )}
                           </div>
                         );
                       })()
                     ) : (
                       <p className="text-slate-400 italic">Selecione um dia no calendario para ver os registros.</p>
                     )}
                   </div>
                 </div>
               )}
            </div>
          )}



          
          {/* ABA DE MANUTENCAO */}
          {abaAtiva === 'manutencao' && (
             <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.8)]">
                <div className="pointer-events-none absolute -top-20 -right-10 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl"></div>
                <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"></div>
                <div className="relative space-y-8 animate-in slide-in-from-top duration-500">
                <div className="flex flex-wrap items-center gap-3">
                   <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                      <button onClick={() => setSubAbaManutencao('resumo')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaManutencao === 'resumo' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Resumo</button>
                      <button onClick={() => setSubAbaManutencao('ordens')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaManutencao === 'ordens' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Ordens</button>
                      <button onClick={() => setSubAbaManutencao('agenda')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaManutencao === 'agenda' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Agenda</button>
                      {isManutencaoOperador && (
                        <button onClick={() => setSubAbaManutencao('operador')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaManutencao === 'operador' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>Operador</button>
                      )}
                   </div>
                   <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => {
                          setManutencaoEditId(null);
                          setNovaOsForm(novaOsDefaults);
                          setNovaOsFotoFile(null);
                          setNovaOsFotoPreview('');
                          setManutencaoSaveError('');
                          setManutencaoModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400/90 to-blue-500/90 text-slate-950 text-xs font-bold shadow hover:brightness-110"
                      >
                        Nova OS
                      </button>
                      <button
                        onClick={handleExportarManutencaoPdf}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-200 hover:border-slate-500 hover:text-white"
                      >
                        Exportar
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-200 hover:border-slate-500 hover:text-white md:hidden"
                      >
                        Sair
                      </button>
                   </div>
                </div>

                {subAbaManutencao === 'resumo' && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-500/20 via-slate-900/60 to-slate-900/20 p-5 shadow-[0_12px_40px_-20px_rgba(244,63,94,0.6)]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-200/80">Alerta de parada</p>
                          <h3 className="mt-2 text-lg font-black text-white">
                            {manutencaoParadas.length
                              ? `${manutencaoParadas.length} processo(s) parado(s)`
                              : 'Nenhuma parada registrada'}
                          </h3>
                          <p className="mt-1 text-xs text-slate-300">
                            {manutencaoParadas.length
                              ? 'Processos dependentes de manutencao.'
                              : 'Sem processos parados no momento.'}
                          </p>
                          {manutencaoParadas.length ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-100">
                              {manutencaoParadas.slice(0, 4).map((os) => (
                                <span key={os.id} className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1">
                                  {os.ativo || os.setor || os.id}
                                </span>
                              ))}
                              {manutencaoParadas.length > 4 && (
                                <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1">
                                  +{manutencaoParadas.length - 4} mais
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-rose-500/30 px-3 py-1 text-xs font-bold text-rose-100">
                            {manutencaoParadas.length ? 'Critico' : 'OK'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSubAbaManutencao('ordens')}
                            className="rounded-full border border-rose-400/60 px-3 py-1 text-xs font-bold text-rose-100 hover:bg-rose-500/20"
                          >
                            Ver OS
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {manutencaoKpis.map((kpi) => (
                        <div key={kpi.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-2xl font-black text-white">{kpi.value}</span>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${kpi.tone}`}>Hoje</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Paradas em andamento</h3>
                        {manutencaoParadas.length ? (
                          <div className="space-y-3">
                            {manutencaoParadas.map((item) => {
                              const prioridade = String(item.prioridade || 'Media').toLowerCase();
                              const impactoTone =
                                prioridade === 'alta'
                                  ? 'border-rose-400/80 bg-rose-500/10 text-rose-200'
                                  : prioridade === 'media'
                                    ? 'border-amber-400/80 bg-amber-500/10 text-amber-200'
                                    : 'border-emerald-400/80 bg-emerald-500/10 text-emerald-200';
                              return (
                                <div key={item.id} className={`flex items-center justify-between rounded-xl border border-slate-800 p-4 border-l-4 ${impactoTone}`}>
                                  <div>
                                    <p className="text-sm font-bold text-white">{item.ativo || item.setor || item.id}</p>
                                    <p className="text-xs text-slate-400">{item.statusMaquina || 'Parada'} - {item.descricao || 'Aguardando detalhes'}</p>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-900/80 text-slate-200">{item.prioridade || 'Media'}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                            Sem paradas registradas.
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Alertas rapidos</h3>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                          Sem alertas cadastrados.
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-4">Backlog por setor</h3>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                          Sem dados de backlog.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'ordens' && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)] overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Ordens recentes</h3>
                      <div className="flex gap-2 text-xs">
                        <button className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-bold">Todas</button>
                        <button className="px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 font-bold">Abertas</button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="px-4 py-3">OS</th>
                            <th className="px-4 py-3">Ativo</th>
                            <th className="px-4 py-3">Setor</th>
                            <th className="px-4 py-3">Prioridade</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Responsavel</th>
                            <th className="px-4 py-3">Acoes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-200">
                          {manutencaoOrdensLoading ? (
                            <tr>
                              <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                                Carregando ordens...
                              </td>
                            </tr>
                          ) : manutencaoOrdensError ? (
                            <tr>
                              <td className="px-4 py-6 text-sm text-rose-300" colSpan={7}>
                                {manutencaoOrdensError}
                              </td>
                            </tr>
                          ) : manutencaoOrdens.length ? (
                            manutencaoOrdens.map((ordem) => (
                              <tr key={ordem.id} className="hover:bg-slate-900/60">
                                <td className="px-4 py-3 font-semibold text-white">{ordem.id}</td>
                                <td className="px-4 py-3 text-slate-300">{ordem.ativo || '-'}</td>
                                <td className="px-4 py-3 text-slate-400">{ordem.setor || '-'}</td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-800 text-slate-200">{ordem.prioridade || '-'}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">{ordem.status || '-'}</span>
                                </td>
                                <td className="px-4 py-3 text-slate-300">{ordem.responsavel || '-'}</td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => handleEditarOs(ordem)}
                                    className="text-xs font-bold text-cyan-200 hover:text-white"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleImprimirOs(ordem)}
                                    className="ml-3 text-xs font-bold text-slate-300 hover:text-white"
                                  >
                                    Imprimir
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                                Sem ordens registradas.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {subAbaManutencao === 'agenda' && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
                    Agenda sem dados no momento.
                  </div>
                )}

                {subAbaManutencao === 'operador' && isManutencaoOperador && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Fila de OS</h3>
                        <span className="text-[10px] font-bold text-slate-400">
                          {manutencaoOperadorListas.abertas.length} abertas
                        </span>
                      </div>
                      {manutencaoOperadorListas.abertas.length ? (
                        <div className="space-y-3">
                          {manutencaoOperadorListas.abertas.map((os) => (
                            <div key={os.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-white">{os.ativo || os.id}</p>
                                  <p className="text-xs text-slate-400">{os.setor || 'Sem setor'} · {os.prioridade || '-'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    atualizarOs(os.id, {
                                      responsavel: currentUserLabel,
                                      status: 'Em andamento',
                                    })
                                  }
                                  className="rounded-full border border-cyan-400/60 px-3 py-1 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10"
                                >
                                  Assumir
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                          Nenhuma OS aguardando atendimento.
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Minhas OS</h3>
                        <span className="text-[10px] font-bold text-slate-400">
                          {manutencaoOperadorListas.minhas.length} atribuida(s)
                        </span>
                      </div>
                      {manutencaoOperadorListas.minhas.length ? (
                        <div className="space-y-3">
                          {manutencaoOperadorListas.minhas.map((os) => (
                            <div key={os.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold text-white">{os.ativo || os.id}</p>
                                  <p className="text-xs text-slate-400">
                                    {os.status || '-'} · {os.statusMaquina || 'Rodando'}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => atualizarOs(os.id, { status: 'Em andamento' })}
                                    className="rounded-full border border-blue-400/60 px-3 py-1 font-bold text-blue-100 hover:bg-blue-500/10"
                                  >
                                    Iniciar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => atualizarOs(os.id, { status: 'Aguardando peca' })}
                                    className="rounded-full border border-amber-400/60 px-3 py-1 font-bold text-amber-100 hover:bg-amber-500/10"
                                  >
                                    Pausar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => atualizarOs(os.id, { status: 'Finalizada' })}
                                    className="rounded-full border border-emerald-400/60 px-3 py-1 font-bold text-emerald-100 hover:bg-emerald-500/10"
                                  >
                                    Finalizar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditarOs(os)}
                                    className="rounded-full border border-slate-600 px-3 py-1 font-bold text-slate-200 hover:bg-slate-800"
                                  >
                                    Editar
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                          Nenhuma OS atribuida a voce.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {manutencaoModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-6">
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-950 text-slate-100 shadow-2xl border border-slate-800">
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
                      <form onSubmit={handleNovaOsSubmit} className="max-h-[calc(90vh-120px)] overflow-y-auto space-y-4 px-6 py-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-400">Ativo</label>
                            <input name="ativo" list="manutencao-ativos" value={novaOsForm.ativo} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: Injetora 01" required />
                            <datalist id="manutencao-ativos">
                              {listaMaquinas.map((item) => (
                                <option key={item.id} value={item.nome}>{`${item.nome} • ${item.setor}`}</option>
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
                            <select name="prioridade" value={novaOsForm.prioridade} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
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
                            <label className="text-xs font-bold text-slate-400">Parada</label>
                            <select name="parada" value={novaOsForm.parada} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none">
                              <option>Nao</option>
                              <option>Sim</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400">Tempo de parada (hh:mm)</label>
                            <input name="tempoParada" value={novaOsForm.tempoParada} onChange={handleNovaOsChange} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Ex: 01:30" />
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
                          <label className="text-xs font-bold text-slate-400">Descricao</label>
                          <textarea name="descricao" value={novaOsForm.descricao} onChange={handleNovaOsChange} rows={3} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none" placeholder="Descreva a falha ou solicitacao" required />
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
                          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500">
                            {manutencaoEditId ? 'Salvar alteracoes' : 'Salvar OS'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
                </div>
             </div>
          )}
          {/* ABA DE CONFIGURAÇÃO */}
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
                      setNovoAtivoCc('');
                      setNovoAtivoProcesso('');
                    }}>
                       <input name="nomeMaq" type="text" className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Nome da Máquina" />
                       <div className="flex flex-col gap-2">
                         <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                             Centro de Custo
                           </label>
                           <select
                             name="setorMaq"
                             value={novoAtivoCc}
                             onChange={(e) => setNovoAtivoCc(e.target.value)}
                             className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none"
                             required
                           >
                             <option>Industria</option>
                             <option>Transporte</option>
                           </select>
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
                        Bens importados no Firebase.
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
                        <option>Industria</option>
                        <option>Transporte</option>
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
                            <div><p className="font-bold text-slate-800 text-xs">{c.nome}</p><p className="text-[9px] text-slate-400 font-bold uppercase">{c.cargo} • {c.setor}</p></div>
                            <Trash2 size={14} className="text-slate-200 hover:text-rose-500 cursor-pointer" onClick={() => setColaboradores(colaboradores.filter(x => x.id !== c.id))} />
                         </div>
                       ))}
                    </div>
                  </div>
                )}
             </div>
          )}
        </div>
      </main>

      {/* Menu Mobile Inferior */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 border-t border-slate-800 backdrop-blur">
        <div className="grid grid-cols-6">
          {menuItems.map((item) => (
            (() => {
              const isDisabled = item.id === 'portfolio' && isPortfolioDisabled;
              return (
                <button
                  key={item.id}
                  onClick={() => !isDisabled && setAbaAtiva(item.id)}
                  disabled={isDisabled}
                  className={`flex flex-col items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wide transition-all ${
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
            })()
          ))}
        </div>
      </nav>
    </div>
  );
}


