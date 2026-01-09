import React, { useState, useEffect, useMemo } from 'react';
import funcionariosBase from './data/funcionarios.json';
import presencaDez from './data/Prensençadez.json';
import faturamentoData from './data/faturamento.json';
import clientesData from './Faturamento/clientes.json';
import produtosData from './data/produtos.json';
import municipiosLatLong from './data/municipios_brasil_latlong.json';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
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
  Search,
  Activity,
  Cpu,
  UserCog,
  Briefcase,
  Target,
  ShoppingCart
} from 'lucide-react';

// --- Constantes e Dados Iniciais ---

const ITENS_MENU = [
  { id: 'executivo', label: 'Painel Executivo', icon: LayoutDashboard },
  { id: 'faturamento', label: 'Faturamento', icon: DollarSign },
  { id: 'portfolio', label: 'Portfólio / Mix', icon: Briefcase },
  { id: 'gestao', label: 'Operação Diária', icon: Activity },
  { id: 'configuracao', label: 'Configuração Global', icon: Settings },
];

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
        <p className="text-2xl font-bold text-slate-900 mt-1">{valor}</p>
        <p className="text-slate-400 text-[11px] mt-1 font-medium">{subtitulo}</p>
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

const formatarValorCurto = (valor) => {
  if (!Number.isFinite(valor)) return '-';
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)}k`;
  return `R$ ${Math.round(valor)}`;
};

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
  const [abaAtiva, setAbaAtiva] = useState('executivo');
  const [subAbaGestao, setSubAbaGestao] = useState('lista');
  const [subAbaConfig, setSubAbaConfig] = useState('processos');
  const [subAbaFaturamento, setSubAbaFaturamento] = useState('atual');
  const [filtroFilial, setFiltroFilial] = useState('Todas');
  const [carregando, setCarregando] = useState(true);

  // --- Estados de Dados ---
  const [listaSetores, setListaSetores] = useState(SETORES_INICIAIS);
  const [listaGestores, setListaGestores] = useState(GESTORES_INICIAIS);
  const [listaMaquinas, setListaMaquinas] = useState(MAQUINAS_INICIAIS);
  const [colaboradores, setColaboradores] = useState([]);
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
  const [rapidoSupervisor, setRapidoSupervisor] = useState('');
  const [rapidoSupervisorErro, setRapidoSupervisorErro] = useState('');
  const [modoRapidoOpen, setModoRapidoOpen] = useState(false);
  const [modoRapidoIndex, setModoRapidoIndex] = useState(0);
  const [modoRapidoTempo, setModoRapidoTempo] = useState('02:00');
  const [modoRapidoErro, setModoRapidoErro] = useState('');
  const [supervisorEditando, setSupervisorEditando] = useState(null);
  const [supervisorNome, setSupervisorNome] = useState('');
  const [faltasCarregadas, setFaltasCarregadas] = useState(false);
  const [presencaLeandroExcel, setPresencaLeandroExcel] = useState(null);
  const [resumoLeandroExcel, setResumoLeandroExcel] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 500);
    return () => clearTimeout(timer);
  }, []);

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
    if (!colaboradores.length) {
      const colaboradoresIniciais = (funcionariosBase || []).map((item, index) => ({
        id: index + 1,
        nome: item.nome,
        cargo: 'Operador',
        setor: item.setor,
        gestor: item.gestor || 'Thalles',
        estaAusente: false,
        tipoFalta: 'Presente',
      }));

      const chaves = new Set(
        colaboradoresIniciais.map((c) => `${normalizarTexto(c.nome)}||${normalizarTexto(c.setor)}`)
      );

      if (presencaLeandroExcel?.colaboradores?.length) {
        const gestorPadrao = 'Leandro Souza';
        presencaLeandroExcel.colaboradores.forEach((colab) => {
          if (!colab || typeof colab.setor !== 'string') return;
          const chave = `${normalizarTexto(colab.nome)}||${normalizarTexto(colab.setor)}`;
          if (chaves.has(chave)) return;
          colaboradoresIniciais.push({
            id: colaboradoresIniciais.length + 1,
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
    if (!listaSetores.length) {
      const setores = new Set((funcionariosBase || []).map((item) => item.setor).filter(Boolean));
      if (presencaLeandroExcel?.colaboradores?.length) {
        presencaLeandroExcel.colaboradores.forEach((colab) => {
          if (typeof colab?.setor === 'string' && colab.setor.trim()) {
            setores.add(colab.setor.trim());
          }
        });
      }
      setListaSetores(Array.from(setores));
    }
  }, [presencaLeandroExcel]);

  useEffect(() => {
    if (!presencaLeandroExcel?.colaboradores?.length) return;

    setColaboradores((prev) => {
      const existentes = new Set(
        prev.map((c) => `${normalizarTexto(c.nome)}||${normalizarTexto(c.setor)}`)
      );
      let next = [...prev];
      const gestorPadrao = 'Leandro Souza';

      presencaLeandroExcel.colaboradores.forEach((colab) => {
        if (!colab || typeof colab.setor !== 'string') return;
        const chave = `${normalizarTexto(colab.nome)}||${normalizarTexto(colab.setor)}`;
        if (existentes.has(chave)) return;
        next = [
          ...next,
          {
            id: next.length + 1,
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
  }, []);

  useEffect(() => {
    if (!colaboradores.length) return;

    setRegistrosPorData((prev) => {
      const mapaIds = new Map(
        colaboradores.map((colab) => [
          `${normalizarTexto(colab.nome)}||${normalizarTexto(colab.setor)}`,
          colab.id,
        ])
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
          const chave = `${normalizarTexto(colab.nome)}||${normalizarTexto(colab.setor)}`;
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
  }, []);

  useEffect(() => {
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
        try {
          const resp = await fetch('/data/faturamento-2025.json');
          if (resp.ok) {
            const antigas = await resp.json();
            if (Array.isArray(antigas)) {
              linhas = [...antigas, ...linhas];
            }
          }
        } catch (err) {
          console.warn('Nao foi possivel carregar faturamento-2025.json:', err);
        }

        setFaturamentoLinhas(linhas);
        const total = linhas.reduce((acc, row) => acc + parseValor(row['ValorTotal']), 0);

        const porGrupoMap = linhas.reduce((acc, row) => {
          const grupoRaw = row['Grupo'];
          const grupo = grupoRaw && String(grupoRaw).trim() ? String(grupoRaw).trim() : 'Sem grupo';
          const valor = parseValor(row['ValorTotal']);
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

        const porMesMap = linhas.reduce((acc, row) => {
          const mes = row['MesEmissao'];
          if (!mes) return acc;
          const valor = parseValor(row['ValorTotal']);
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
    let ferias = 0;
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
        else if (tipo === 'Ferias') ferias += 1;
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
      ferias,
      diasComFalta: diasComFalta.size,
      percentualPresenca,
    };
  }, [colaboradores, filtroSupervisor, filtroSetor, registrosPorData, mesHistorico, anoHistorico]);

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
      if (colaborador) {
        const supervisorOk = filtroSupervisor === 'Todos' || colaborador.gestor === filtroSupervisor;
        const setorOk = filtroSetor === 'Todos' || colaborador.setor === filtroSetor;
        if (!supervisorOk || !setorOk) {
          return;
        }
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
      return {
        cliente: row?.Cliente ?? row?.cliente ?? 'Sem cliente',
        grupo: row?.Grupo ?? row?.grupo ?? 'Sem grupo',
        codigo: row?.Codigo ?? row?.codigo ?? '',
        descricao: row?.Descricao ?? row?.descricao ?? '',
        filial: row?.Filial ?? row?.filial ?? 'Sem filial',
        unidade: row?.Unidade ?? row?.unidade ?? '',
        nf: row?.NF ?? row?.Nf ?? row?.NotaFiscal ?? row?.notaFiscal ?? '',
        quantidade: parseValor(row?.Quantidade ?? row?.quantidade),
        valorUnitario: parseValor(row?.ValorUnitario ?? row?.valorUnitario),
        valorTotal: parseValor(row?.ValorTotal ?? row?.valorTotal),
        emissao: parseEmissaoData(row?.Emissao ?? row?.emissao),
        mesKey: mesInfo?.key,
        mesDisplay: mesInfo?.display,
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

    const linhasFiltradas =
      filtroFilial === 'Todas'
        ? linhasMes
        : linhasMes.filter((row) => row.filial === filtroFilial);

    const total = linhasFiltradas.reduce((acc, row) => acc + row.valorTotal, 0);
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
  }, [faturamentoLinhas, filtroFilial]);

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
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg">
              <Activity size={24} />
            </div>
            <span className="font-bold text-xl tracking-tight leading-tight">Painel<br/>Industrial</span>
          </div>

          <nav className="space-y-1">
            {ITENS_MENU.map((item) => (
              <button
                key={item.id}
                onClick={() => setAbaAtiva(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  abaAtiva === item.id 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-800">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
            Conectado ao TOTVS
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 md:ml-64 p-6 md:p-8 pb-24 md:pb-8">
        <header className="max-w-7xl mx-auto mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {ITENS_MENU.find(i => i.id === abaAtiva)?.label}
            </h1>
            <p className="text-slate-500 mt-1">Status da operação em {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <div className="flex gap-4">
             <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
                <Search size={20} className="text-slate-400" />
             </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          
          {/* ABA EXECUTIVA */}
          {abaAtiva === 'executivo' && (
            <div className="space-y-8 animate-in fade-in duration-700">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <CardInformativo titulo="Faturamento Bruto" valor="R$ —" subtitulo="Sem dados do ERP" icon={DollarSign} corFundo="bg-blue-600" />
                <CardInformativo titulo="Faltas Hoje" valor="—" subtitulo="Sem dados do ERP" icon={UserX} corFundo="bg-rose-600" />
                <CardInformativo titulo="Eficiência (OEE)" valor="—" subtitulo="Sem dados do ERP" icon={BarChart3} corFundo="bg-amber-500" />
                <CardInformativo titulo="Impacto em Faltas" valor="R$ —" subtitulo="Sem dados do ERP" icon={AlertTriangle} corFundo="bg-orange-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-lg mb-8 flex items-center gap-2">
                    <TrendingUp className="text-blue-600" size={20} />
                    Absenteísmo por Processo (Alertas)
                  </h3>
                  {listaSetores.length > 0 ? (
                    <div className="space-y-2">
                      {listaSetores.map((setor) => (
                        <BarraProgresso 
                          key={setor} 
                          rotulo={setor} 
                          atual={metricas.faltasPorSetor[setor] || 0} 
                          total={10} 
                          unidade=" faltas" 
                          cor={(metricas.faltasPorSetor[setor] || 0) > 3 ? "bg-rose-500" : "bg-blue-600"} 
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Sem dados do ERP.</p>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                   <h3 className="font-bold text-slate-800 text-lg mb-6">Mão de Obra</h3>
                   <div className="space-y-6">
                      <p className="text-slate-400 text-[11px] text-center italic mt-4">
                        Sem dados do ERP.
                      </p>
                   </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA DE FATURAMENTO */}
          {abaAtiva === 'faturamento' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
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
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-800 mb-2">Resumo da Planilha 2025</h2>
                  {faturamentoDados.carregando ? (
                    <p className="text-slate-400 italic">Carregando planilha...</p>
                  ) : faturamentoDados.erro ? (
                    <p className="text-rose-600 text-sm font-medium">{faturamentoDados.erro}</p>
                  ) : (
                    <div className="text-2xl font-bold text-slate-900">
                      R$ {faturamentoDados.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              )}

              {subAbaFaturamento === '2025' && (
                <div className="grid grid-cols-1 gap-8">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-6 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm uppercase tracking-wider">
                    Faturamento por Mês (2025)
                  </div>
                  <div className="p-6 border-b border-slate-200">
                    {faturamentoDados.carregando ? (
                      <p className="text-slate-400 italic">Carregando planilha...</p>
                    ) : faturamentoDados.erro ? (
                      <p className="text-rose-600 text-sm font-medium">{faturamentoDados.erro}</p>
                    ) : faturamentoDados.porMes.length === 0 ? (
                      <p className="text-slate-400 italic">Sem dados na planilha.</p>
                    ) : (
                      (() => {
                        const width = 1200;
                        const height = 320;
                        const margin = { top: 20, right: 20, bottom: 40, left: 50 };
                        const chartW = width - margin.left - margin.right;
                        const chartH = height - margin.top - margin.bottom;
                        const maxValor = Math.max(...faturamentoDados.porMes.map((item) => item.valor), 1);
                        const stepX = chartW / Math.max(faturamentoDados.porMes.length - 1, 1);

                        const pontos = faturamentoDados.porMes.map((item, i) => {
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
              </div>
              )}

              {subAbaFaturamento === 'atual' && (
                <div className="space-y-6">
                  {faturamentoAtual.linhas.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                      <p className="text-slate-400 italic">Sem dados de faturamento para o periodo atual.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
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
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Total no mes</p>
                          <p className="text-xl font-bold text-slate-900 mt-2">
                            R$ {faturamentoAtual.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Soma do periodo.</p>
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
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Movimentos</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">
                            {faturamentoAtual.movimentos}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Linhas registradas.</p>
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
                            let acumulado = 0;
                            const totalPeriodo = dados.reduce((acc, item) => acc + item.valor, 0);
                            const linePoints = dados.map((item, i) => {
                              acumulado += item.valor;
                              const perc = totalPeriodo > 0 ? acumulado / totalPeriodo : 0;
                              const x = margin.left + i * barW + (barW - 14) / 2 + 7;
                              const y = margin.top + chartH * (1 - perc);
                              return { x, y, item, perc };
                            });
                            const linePath = linePoints.map((p) => `${p.x},${p.y}`).join(' ');
                            const areaPath = `${margin.left},${margin.top + chartH} ${linePath} ${margin.left + (linePoints.length - 1) * barW + (barW - 14) / 2 + 7},${margin.top + chartH}`;

                            return (
                              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
                                <defs>
                                  <linearGradient id="diaBar" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.95" />
                                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.9" />
                                  </linearGradient>
                                  <linearGradient id="linhaAcum" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
                                  </linearGradient>
                                  <filter id="linhaGlow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="2.2" result="blur" />
                                    <feMerge>
                                      <feMergeNode in="blur" />
                                      <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                  </filter>
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
                                <text x={margin.left} y={margin.top - 18} fontSize="12" fill="#94a3b8">
                                  Acumulado (%)
                                </text>
                                {dados.map((item, i) => {
                                  const xBase = margin.left + i * barW + 7;
                                  const barH = (item.valor / maxValor) * chartH;
                                  const y = margin.top + chartH - barH;
                                  return (
                                    <g key={item.dia}>
                                      <rect
                                        x={xBase}
                                        y={y}
                                        width={barW - 14}
                                        height={barH}
                                        rx="6"
                                        fill="url(#diaBar)"
                                      />
                                      <text
                                        x={xBase + (barW - 14) / 2}
                                        y={Math.max(y - 10, 18)}
                                        textAnchor="middle"
                                        fontSize="14"
                                        fill="#e2e8f0"
                                        fontWeight="700"
                                      >
                                        {formatarValorCurto(item.valor)}
                                      </text>
                                      <text
                                        x={xBase + (barW - 14) / 2}
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
                                <polygon points={areaPath} fill="url(#linhaAcum)" opacity="0.35" />
                                <polyline
                                  points={linePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                                  fill="none"
                                  stroke="#fbbf24"
                                  strokeWidth="3.5"
                                  filter="url(#linhaGlow)"
                                />
                                {linePoints.map((p) => (
                                  <circle
                                    key={`line-${p.item.dia}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r="4.5"
                                    fill="#fbbf24"
                                    filter="url(#linhaGlow)"
                                  />
                                ))}
                              </svg>
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
                  )}
                </div>
              )}
            </div>
          )}

          {/* ABA DE PORTFOLIO */}
          {abaAtiva === 'portfolio' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
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
                        {Math.max(resumoHistorico.faltasTotal - resumoHistorico.ferias, 0)}
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
                         {resumoHistorico.ferias}
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
                                 return {
                                   id,
                                   nome: colaborador?.nome || 'Nao encontrado',
                                   setor: colaborador?.setor || '-',
                                   gestor: colaborador?.gestor || '-',
                                   tipo: registro.tipoFalta || 'Falta Injustificada',
                                   tempoParcial: registro.tempoParcial || '',
                                 };
                               })
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

          {/* ABA DE CONFIGURAÇÃO */}
          {abaAtiva === 'configuracao' && (
             <div className="space-y-8 animate-in slide-in-from-top duration-500">
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
                   <button onClick={() => setSubAbaConfig('processos')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'processos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Processos</button>
                   <button onClick={() => setSubAbaConfig('maquinas')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'maquinas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Máquinas</button>
                   <button onClick={() => setSubAbaConfig('equipe')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${subAbaConfig === 'equipe' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>Equipe</button>
                </div>

                {subAbaConfig === 'processos' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Layers size={22} className="text-blue-600" /> Setores Estruturais</h3>
                    <form className="flex gap-4 mb-8" onSubmit={(e) => {
                      e.preventDefault();
                      const v = e.target.elements.novoSetor.value;
                      if(v && !listaSetores.includes(v)) setListaSetores([...listaSetores, v]);
                      e.target.reset();
                    }}>
                       <input name="novoSetor" type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Ex: Acabamento" />
                       <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2"><Plus size={18}/> Criar</button>
                    </form>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                       {listaSetores.map(s => (
                         <div key={s} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex justify-between items-center group">
                            <span className="font-bold text-slate-700 text-sm">{s}</span>
                            <Trash2 size={16} className="text-slate-300 hover:text-rose-500 cursor-pointer" onClick={() => setListaSetores(listaSetores.filter(x => x !== s))} />
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
                    <form className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" onSubmit={(e) => {
                      e.preventDefault();
                      const n = e.target.elements.nomeMaq.value;
                      const s = e.target.elements.setorMaq.value;
                      if(n) setListaMaquinas([...listaMaquinas, { id: Date.now(), nome: n, setor: s }]);
                      e.target.reset();
                    }}>
                       <input name="nomeMaq" type="text" className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none" placeholder="Nome da Máquina" />
                       <select name="setorMaq" className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none">
                          {listaSetores.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                       <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2"><Plus size={18}/> Salvar</button>
                    </form>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {listaMaquinas.map(m => (
                         <div key={m.id} className="bg-white border border-slate-200 p-4 rounded-xl flex justify-between items-center border-l-4 border-l-blue-600 shadow-sm">
                            <div><p className="font-bold text-slate-800 text-sm">{m.nome}</p><p className="text-[10px] text-blue-600 font-bold uppercase">{m.setor}</p></div>
                            <Trash2 size={16} className="text-slate-200 hover:text-rose-500 cursor-pointer" onClick={() => setListaMaquinas(listaMaquinas.filter(x => x.id !== m.id))} />
                         </div>
                       ))}
                    </div>
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
          {ITENS_MENU.map((item) => (
            <button
              key={item.id}
              onClick={() => setAbaAtiva(item.id)}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wide transition-all ${
                abaAtiva === item.id
                  ? 'text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <item.icon size={18} />
              <span className="whitespace-nowrap">{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
