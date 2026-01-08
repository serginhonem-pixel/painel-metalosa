import React, { useState, useEffect, useMemo } from 'react';
import funcionariosBase from './data/funcionarios.json';
import presencaDez from './data/Prensençadez.json';
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
  { id: 'operacional', label: 'Visão Operacional', icon: Factory },
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

const normalizarIdFirestore = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .trim();

// --- Aplicação Principal ---

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('executivo');
  const [subAbaGestao, setSubAbaGestao] = useState('lista');
  const [subAbaConfig, setSubAbaConfig] = useState('processos');
  const [subAbaFaturamento, setSubAbaFaturamento] = useState('2025');
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
  const [supervisorEditando, setSupervisorEditando] = useState(null);
  const [supervisorNome, setSupervisorNome] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!colaboradores.length) {
      const colaboradoresIniciais = (funcionariosBase || []).map((item, index) => ({
        id: index + 1,
        nome: item.nome,
        cargo: 'Operador',
        setor: item.setor,
        gestor: 'Thalles',
        estaAusente: false,
        tipoFalta: 'Presente',
      }));
      setColaboradores(colaboradoresIniciais);
    }
    if (!listaSetores.length) {
      const setoresUnicos = Array.from(
        new Set((funcionariosBase || []).map((item) => item.setor).filter(Boolean))
      );
      setListaSetores(setoresUnicos);
    }
  }, []);

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
    if (!presencaDez || !presencaDez.colaboradores) return;

    setRegistrosPorData((prev) => {
      const jaImportado = Object.keys(prev).some((key) => key.startsWith('2025-12-'));
      if (jaImportado) return prev;

      const normalizar = (texto) =>
        String(texto || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

      const mapaIds = new Map(
        colaboradores.map((colab) => [
          `${normalizar(colab.nome)}||${normalizar(colab.setor)}`,
          colab.id,
        ])
      );

      const mapaCodigos = presencaDez.mapaCodigos || {};
      const registros = { ...prev };
      const mesBase = presencaDez.mes || '2025-12';

      presencaDez.colaboradores.forEach((colab) => {
        const chave = `${normalizar(colab.nome)}||${normalizar(colab.setor)}`;
        const id = mapaIds.get(chave);
        if (!id || !colab.excecoes) return;

        Object.entries(colab.excecoes).forEach(([dia, codigo]) => {
          const bruto = mapaCodigos[codigo] || codigo;
          const normal = normalizar(bruto);
          let tipo = 'Presente';
          if (normal.includes('presen')) tipo = 'Presente';
          else if (normal.includes('justificada')) tipo = 'Falta Justificada';
          else if (normal.includes('injustificada')) tipo = 'Falta Injustificada';
          else if (normal.includes('feria') || normal.includes('fria')) tipo = 'Ferias';
          else if (normal === 'sc') tipo = 'Falta Justificada';
          else if (normal === 'dsr') tipo = 'DSR';

          if (tipo === 'Presente' || tipo === 'DSR') return;

          const diaStr = String(dia).padStart(2, '0');
          const dataISO = `${mesBase}-${diaStr}`;
          if (!registros[dataISO]) registros[dataISO] = {};
          registros[dataISO][id] = { tipoFalta: tipo };
        });
      });

      return registros;
    });
  }, [colaboradores]);

  useEffect(() => {
    const carregarFaturamento = async () => {
      try {
        const resp = await fetch('/data/faturamento-2025.json');
        if (!resp.ok) throw new Error('Falha ao carregar planilha.');
        const linhas = await resp.json();

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
      return {
        ...colab,
        tipoFalta,
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
    return colaboradoresDia.filter((colab) => {
      const supervisorOk = filtroSupervisor === 'Todos' || colab.gestor === filtroSupervisor;
      const setorOk = filtroSetor === 'Todos' || colab.setor === filtroSetor;
      return supervisorOk && setorOk;
    });
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
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Faturamento Atual</h3>
                  <p className="text-slate-400 italic mt-3">Vamos montar esses indicadores depois.</p>
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

          {/* ABA OPERACIONAL */}
          {abaAtiva === 'operacional' && (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-right duration-500">
                {listaMaquinas.map((m, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-all">
                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                      <Cpu size={18} className="text-blue-500 group-hover:scale-110 transition-transform"/> {m.nome}
                    </h3>
                    <div className="space-y-4">
                       <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-500 uppercase tracking-tighter">Setor:</span>
                          <span className="text-blue-600 uppercase tracking-tighter">{m.setor}</span>
                       </div>
                       <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-500 uppercase tracking-tighter">Operação:</span>
                          <span className="text-emerald-600">ATIVO</span>
                       </div>
                       <p className="text-slate-400 text-xs italic">Sem dados do ERP.</p>
                    </div>
                  </div>
                ))}
                {listaMaquinas.length === 0 && (
                  <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                    <p className="text-slate-400 italic">Nenhuma máquina cadastrada. Vá em Configurações.</p>
                  </div>
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
                     <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-4 text-sm font-bold text-slate-500 uppercase">
                       <div className="flex flex-wrap items-center gap-4">
                         <span>Lancamento Diario de Presenca</span>
                         <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                           <CalendarIcon size={14} />
                           <input
                             type="date"
                             value={dataLancamento}
                             onChange={(e) => {
                               setDataLancamento(e.target.value);
                               setDiaHistorico(null);
                             }}
                             className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
                           />
                         </div>
                       </div>
                       <div className="flex flex-wrap gap-3 text-xs">
                         <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14}/> Presente</span>
                         <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={14}/> Falta Justificada</span>
                         <span className="text-rose-600 flex items-center gap-1"><XCircle size={14}/> Falta Injustificada</span>
                         <span className="text-blue-600 flex items-center gap-1"><CalendarIcon size={14}/> Ferias</span>
                       </div>
                     </div>
                     <table className="w-full text-left">
                       <thead>
                         <tr className="bg-slate-100/50 text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-200">
                           <th className="px-6 py-4">Colaborador</th>
                           <th className="px-6 py-4">Setor / Supervisor</th>
                           <th className="px-6 py-4 text-center">Lancamento</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 font-medium">
                        {colaboradoresDiaFiltrados.length > 0 ? (
                        colaboradoresDiaFiltrados.map((colab) => (
                           <tr key={colab.id} className="hover:bg-slate-50 transition-colors">
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
                                 <button onClick={() => alternarPresenca(colab.id)} className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 ${colab.estaAusente ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm shadow-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm shadow-emerald-100'}`}>
                                   {colab.estaAusente ? <XCircle size={14}/> : <CheckCircle2 size={14}/>} {colab.estaAusente ? 'AUSENTE' : 'PRESENTE'}
                                 </button>
                                 <select
                                   value={colab.tipoFalta || 'Presente'}
                                   onChange={(e) => atualizarTipoFalta(colab.id, e.target.value)}
                                   className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600"
                                 >
                                   <option value="Presente">Presente</option>
                                   <option value="Falta Justificada">Falta Justificada</option>
                                   <option value="Falta Injustificada">Falta Injustificada</option>
                                   <option value="Ferias">Ferias</option>
                                 </select>
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
                     <div className="flex items-center gap-2">
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

                       return (
                         <div className="space-y-4">
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
                               const diaSemana = (index % 7);
                               const isWeekend = diaSemana === 0 || diaSemana === 6;
                               const faltas = resumo.total;
                               const base = totalColaboradoresFiltrados || 0;
                               const percentualPresenca = isWeekend
                                 ? 100
                                 : base > 0
                                   ? ((base - faltas) / base) * 100
                                   : 0;
                                return (
                                  <button
                                    key={dataISO}
                                    onClick={() => setDiaHistorico(dataISO)}
                                   className={`h-20 sm:h-24 rounded-xl border px-2 sm:px-3 py-2 text-left transition-all ${
                                      isAtivo
                                        ? 'border-blue-500 bg-blue-950/40'
                                        : 'border-slate-800 bg-slate-900/50 hover:border-blue-500/60 hover:bg-blue-950/30'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs sm:text-sm font-bold text-slate-100">{dia}</span>
                                      {isWeekend ? (
                                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-indigo-200">
                                          DSR
                                        </span>
                                      ) : (
                                        resumo.total > 0 && (
                                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-rose-200">
                                            {resumo.total} falta{resumo.total > 1 ? 's' : ''}
                                          </span>
                                        )
                                      )}
                                    </div>
                                    <div className="mt-2 sm:mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-1.5 sm:px-2 py-1 text-center text-[9px] sm:text-[11px] font-bold text-emerald-200">
                                      {percentualPresenca.toFixed(0)}% presenca
                                    </div>
                                    <div className="mt-1.5 text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">
                                      {isWeekend ? 'Descanso semanal' : (resumo.total === 0 ? 'Sem faltas' : 'Com apontamentos')}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                         </div>
                       );
                     })()}
                   </div>

                   <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                     {diaHistorico ? (
                       (() => {
                         const registros = registrosPorData[diaHistorico] || {};
                         const faltas = Object.entries(registros)
                           .map(([id, registro]) => {
                             const colaborador = colaboradores.find((c) => String(c.id) === String(id));
                             return {
                               id,
                               nome: colaborador?.nome || 'Nao encontrado',
                               setor: colaborador?.setor || '-',
                               gestor: colaborador?.gestor || '-',
                               tipo: registro.tipoFalta || 'Falta Injustificada',
                             };
                           })
                           .filter((item) => {
                             const supervisorOk = filtroSupervisor === 'Todos' || item.gestor === filtroSupervisor;
                             const setorOk = filtroSetor === 'Todos' || item.setor === filtroSetor;
                             return supervisorOk && setorOk;
                           });
                         return (
                           <div className="space-y-4">
                             <div className="flex items-center justify-between">
                               <div>
                                 <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Faltas do dia</p>
                                 <p className="text-sm font-semibold text-slate-800">{diaHistorico}</p>
                               </div>
                               <span className="text-xs text-slate-400">{faltas.length} registros</span>
                             </div>
                             {faltas.length === 0 ? (
                               <p className="text-slate-400 italic">Nenhuma falta registrada neste dia.</p>
                             ) : (
                               <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
                                 <table className="w-full text-left text-xs">
                                   <thead className="sticky top-0 bg-white text-slate-400 uppercase tracking-wider">
                                     <tr>
                                       <th className="px-5 py-3">Colaborador</th>
                                       <th className="px-5 py-3">Setor</th>
                                       <th className="px-5 py-3">Tipo</th>
                                     </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-100">
                                     {faltas.map((item) => (
                                       <tr key={item.id} className="text-slate-700">
                                         <td className="px-5 py-3 font-semibold">{item.nome}</td>
                                         <td className="px-5 py-3 text-slate-500">{item.setor}</td>
                                         <td className="px-5 py-3">
                                           <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-600">
                                             {item.tipo}
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
