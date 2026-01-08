import React, { useState, useEffect, useMemo } from 'react';
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
const GESTORES_INICIAIS = [];
const MAQUINAS_INICIAIS = [];
const CLIENTES_TOP = [];

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

// --- Aplicação Principal ---

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('executivo');
  const [subAbaGestao, setSubAbaGestao] = useState('lista');
  const [subAbaConfig, setSubAbaConfig] = useState('processos');
  const [carregando, setCarregando] = useState(true);

  // --- Estados de Dados ---
  const [listaSetores, setListaSetores] = useState(SETORES_INICIAIS);
  const [listaMaquinas, setListaMaquinas] = useState(MAQUINAS_INICIAIS);
  const [colaboradores, setColaboradores] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setCarregando(false), 500);
    return () => clearTimeout(timer);
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

  const alternarPresenca = (id) => {
    setColaboradores(colaboradores.map(c => 
      c.id === id ? { ...c, estaAusente: !c.estaAusente } : c
    ));
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
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans">
      
      {/* Sidebar Clássica */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-20 shadow-2xl">
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
      <main className="flex-1 ml-64 p-8">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <CardInformativo titulo="Faturamento Mensal" valor="R$ —" subtitulo="Sem dados do ERP" icon={TrendingUp} corFundo="bg-blue-600" />
                <CardInformativo titulo="Meta Acumulada" valor="—" subtitulo="Sem dados do ERP" icon={Target} corFundo="bg-indigo-600" />
                <CardInformativo titulo="Ticket Médio" valor="R$ —" subtitulo="Sem dados do ERP" icon={ShoppingCart} corFundo="bg-emerald-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-lg mb-8">Faturamento por Setor Produtivo</h3>
                  <p className="text-slate-400 italic">Sem dados do ERP.</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-6 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm uppercase tracking-wider">
                    Top 5 Clientes (Maior Volume)
                  </div>
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100 font-medium text-sm">
                      {CLIENTES_TOP.length > 0 ? (
                        CLIENTES_TOP.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-slate-800 font-bold">{c.cliente}</td>
                            <td className="px-6 py-4 text-emerald-600 font-bold">R$ {c.valor}</td>
                            <td className="px-6 py-4 text-slate-400 text-xs font-bold">{c.part}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-6 py-6 text-slate-400 italic" colSpan={3}>Sem dados do ERP.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ABA DE PORTFÓLIO */}
          {abaAtiva === 'portfolio' && (
            <div className="space-y-8 animate-in slide-in-from-right duration-700">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Análise ABC de Portfólio</h3>
                    <p className="text-slate-400 text-sm">Classificação de SKUs por impacto no faturamento total.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Classe A</p>
                      <p className="text-lg font-bold text-blue-800">?</p>
                    </div>
                    <div className="text-center px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-bold text-amber-600 uppercase">Classe B</p>
                      <p className="text-lg font-bold text-amber-800">?</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-2">Distribuição de Mix (Famílias)</h4>
                    <p className="text-slate-400 italic">Sem dados do ERP.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
                    <div className="p-5 font-bold text-slate-700 text-xs uppercase tracking-wider">Principais Produtos (Curva ABC)</div>
                    <div className="divide-y divide-slate-200">
                      <div className="p-6 text-slate-400 italic">Sem dados do ERP.</div>
                    </div>
                  </div>
                </div>
              </div>
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
                 <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                      <span>Lançamento Diário de Presença</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14}/> PRESENTE</span>
                        <span className="text-rose-600 flex items-center gap-1"><XCircle size={14}/> FALTA</span>
                      </div>
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-100/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                          <th className="px-8 py-4">Colaborador</th>
                          <th className="px-8 py-4">Setor / Supervisor</th>
                          <th className="px-8 py-4 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {colaboradores.length > 0 ? (
                        colaboradores.map((colab) => (
                          <tr key={colab.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-5">
                              <div className="font-bold text-slate-800 text-sm">{colab.nome}</div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase">{colab.cargo}</div>
                            </td>
                            <td className="px-8 py-5">
                              <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold uppercase mr-2">{colab.setor}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Supervisor: {colab.gestor}</span>
                            </td>
                            <td className="px-8 py-5 text-center">
                              <button onClick={() => alternarPresenca(colab.id)} className={`inline-flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${colab.estaAusente ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm shadow-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm shadow-emerald-100'}`}>
                                {colab.estaAusente ? <XCircle size={14}/> : <CheckCircle2 size={14}/>} {colab.estaAusente ? 'AUSENTE' : 'PRESENTE'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-8 py-6 text-slate-400 italic" colSpan={3}>Sem dados do ERP.</td>
                        </tr>
                      )}
                      </tbody>
                    </table>
                 </div>
               ) : (
                 <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 italic">
                   Calendário Histórico em processamento com os dados reais do ERP.
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
                       <select name="gestor" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none">{GESTORES_INICIAIS.map(m => <option key={m}>{m}</option>)}</select>
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

    </div>
  );
}
