import React, { useState, useEffect, useContext, createContext, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { 
  Wrench, Activity, Clock, AlertTriangle, CheckCircle, Users, 
  LayoutDashboard, PlusCircle, Filter, Play, Pause, 
  FileText, LogOut, Menu, X, ArrowUpRight, Download, Save,
  Calendar, Briefcase, Settings
} from 'lucide-react';

/**
 * ==================================================================================
 * 1. MOCK SERVICE LAYER (Simulating Firestore)
 * ==================================================================================
 */

const STORAGE_KEY = 'maintenance_pro_db_v1';

const SEED_DATA = {
  users: [
    { uid: 'u1', name: 'Carlos Gestor', email: 'gestor@empresa.com', role: 'supervisor', sector: 'Geral' },
    { uid: 'u2', name: 'João Técnico', email: 'tec@empresa.com', role: 'maintenance', sector: 'Mecânica' },
    { uid: 'u3', name: 'Ana Elétrica', email: 'ana@empresa.com', role: 'maintenance', sector: 'Elétrica' },
    { uid: 'u4', name: 'Operador Paulo', email: 'op@empresa.com', role: 'operator', sector: 'Produção A' },
  ],
  assets: [
    { id: 'a1', name: 'Injetora 01', sector: 'Produção A', criticality: 'high', manufacturer: 'Romi' },
    { id: 'a2', name: 'Compressor Central', sector: 'Utilidades', criticality: 'critical', manufacturer: 'Schulz' },
    { id: 'a3', name: 'Esteira Transportadora', sector: 'Expedição', criticality: 'medium', manufacturer: 'Local' },
    { id: 'a4', name: 'Empilhadeira Eletrica', sector: 'Logística', criticality: 'high', manufacturer: 'Toyota' },
    { id: 'a5', name: 'Torno CNC', sector: 'Usinagem', criticality: 'medium', manufacturer: 'Haas' },
    { id: 'a6', name: 'Chiller 02', sector: 'Utilidades', criticality: 'high', manufacturer: 'Midea' },
  ],
  workOrders: [] // Will be generated if empty
};

// Generate some random history for KPIs
const generateHistory = () => {
  const osList = [];
  const now = new Date();
  const types = ['corretiva', 'preventiva', 'inspecao', 'melhoria'];
  const priorities = ['baixa', 'media', 'alta', 'critica'];
  const statuses = ['finalizada', 'finalizada', 'finalizada', 'aberta', 'em_andamento', 'aguardando_peca'];
  
  for (let i = 0; i < 40; i++) {
    const isPast = i > 10;
    const dateOffset = Math.floor(Math.random() * 30);
    const createdDate = new Date(now);
    createdDate.setDate(createdDate.getDate() - dateOffset);
    
    const duration = Math.floor(Math.random() * 240) + 30; // minutes
    const finishedDate = new Date(createdDate.getTime() + duration * 60000);

    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    osList.push({
      id: `os-${1000 + i}`,
      assetId: SEED_DATA.assets[Math.floor(Math.random() * SEED_DATA.assets.length)].id,
      type: types[Math.floor(Math.random() * types.length)],
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      status: status,
      symptom: 'Falha simulada para geração de dados históricos.',
      cause: isPast ? 'Desgaste natural' : '',
      action: isPast ? 'Troca de componente' : '',
      openedAt: createdDate.toISOString(),
      startedAt: status !== 'aberta' ? new Date(createdDate.getTime() + 1000 * 60 * 60).toISOString() : null,
      finishedAt: status === 'finalizada' ? finishedDate.toISOString() : null,
      totalMinutes: status === 'finalizada' ? duration : 0,
      assignedTo: i % 2 === 0 ? 'u2' : 'u3',
      createdBy: 'u4',
      events: []
    });
  }
  return osList;
};

const db = {
  load: () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  },
  save: (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event('db-change'));
  },
  init: () => {
    let data = db.load();
    if (!data) {
      data = { ...SEED_DATA, workOrders: generateHistory() };
      db.save(data);
    }
    return data;
  },
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
};

/**
 * ==================================================================================
 * 2. CONTEXTS & HOOKS
 * ==================================================================================
 */

const AuthContext = createContext(null);
const DataContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => SEED_DATA.users[0]);

  const login = (email) => {
    const data = db.init();
    const found = data.users.find(u => u.email === email);
    if (found) {
      setUser(found);
      return true;
    }
    return false;
  };

  const logout = () => setUser(SEED_DATA.users[0]);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const DataProvider = ({ children }) => {
  const [data, setData] = useState({ assets: [], workOrders: [], users: [] });
  const { user } = useContext(AuthContext);

  const refreshData = () => {
    const loaded = db.init();
    setData(loaded);
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('db-change', refreshData);
    return () => window.removeEventListener('db-change', refreshData);
  }, []);

  const addWorkOrder = (os) => {
    const newData = { ...data, workOrders: [os, ...data.workOrders] };
    db.save(newData);
  };

  const updateWorkOrder = (id, updates) => {
    const newOrders = data.workOrders.map(os => os.id === id ? { ...os, ...updates, updatedAt: new Date().toISOString() } : os);
    db.save({ ...data, workOrders: newOrders });
  };

  const addAsset = (asset) => {
    const newData = { ...data, assets: [...data.assets, asset] };
    db.save(newData);
  };

  return (
    <DataContext.Provider value={{ data, addWorkOrder, updateWorkOrder, addAsset, refreshData }}>
      {children}
    </DataContext.Provider>
  );
};

/**
 * ==================================================================================
 * 3. UTILS & HELPERS
 * ==================================================================================
 */

const formatDate = (isoString) => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const getStatusColor = (status) => {
  const map = {
    'aberta': 'bg-blue-100 text-blue-800 border-blue-200',
    'em_andamento': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'aguardando_peca': 'bg-orange-100 text-orange-800 border-orange-200',
    'aguardando_operacao': 'bg-purple-100 text-purple-800 border-purple-200',
    'finalizada': 'bg-green-100 text-green-800 border-green-200',
    'cancelada': 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return map[status] || 'bg-gray-100';
};

const getPriorityColor = (p) => {
  const map = {
    'baixa': 'text-gray-500',
    'media': 'text-blue-500',
    'alta': 'text-orange-500 font-bold',
    'critica': 'text-red-600 font-extrabold animate-pulse',
  };
  return map[p] || 'text-gray-500';
};

/**
 * ==================================================================================
 * 4. COMPONENTS
 * ==================================================================================
 */

const Sidebar = ({ activePage, setPage, user, logout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, role: ['supervisor'] },
    { id: 'kanban', label: 'Acompanhamento', icon: Wrench, role: ['supervisor', 'maintenance', 'operator'] },
    { id: 'new-os', label: 'Novo Apontamento', icon: PlusCircle, role: ['supervisor', 'maintenance', 'operator'] },
    { id: 'assets', label: 'Ativos', icon: Briefcase, role: ['supervisor'] },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="text-blue-400" /> ManutPro
        </h1>
        <p className="text-xs text-slate-400 mt-1">Versão v1.0 (Demo)</p>
      </div>
      
      <div className="flex-1 py-4">
        {menuItems.map(item => {
          if (!item.role.includes(user.role)) return null;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-6 py-3 hover:bg-slate-800 transition-colors ${activePage === item.id ? 'bg-blue-600 text-white border-r-4 border-blue-300' : 'text-slate-300'}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-300 hover:bg-slate-800 rounded">
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  );
};

const MobileNav = ({ activePage, setPage, user }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dash', icon: LayoutDashboard, role: ['supervisor'] },
    { id: 'kanban', label: 'OS', icon: Wrench, role: ['supervisor', 'maintenance', 'operator'] },
    { id: 'new-os', label: 'Criar', icon: PlusCircle, role: ['supervisor', 'maintenance', 'operator'] },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 z-50 pb-safe">
      {menuItems.map(item => {
        if (!item.role.includes(user.role)) return null;
        return (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`flex flex-col items-center p-2 rounded-lg ${activePage === item.id ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
          >
            <item.icon size={24} />
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        )
      })}
    </div>
  );
};

// -- DASHBOARD COMPONENTS --

const KpiCard = ({ title, value, subtitle, icon: Icon, trend }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500 font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      {subtitle && <p className={`text-xs mt-1 ${trend === 'bad' ? 'text-red-500' : 'text-green-500'}`}>{subtitle}</p>}
    </div>
    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
      <Icon size={24} />
    </div>
  </div>
);

const Dashboard = ({ data }) => {
  const { workOrders, assets } = data;

  // Calculos
  const finished = workOrders.filter(o => o.status === 'finalizada');
  const open = workOrders.filter(o => o.status !== 'finalizada' && o.status !== 'cancelada');

  // MTTR: Media de tempo total das finalizadas
  const totalRepairTime = finished.reduce((acc, curr) => acc + (curr.totalMinutes || 0), 0);
  const mttr = finished.length ? (totalRepairTime / finished.length).toFixed(1) : 0;

  // Backlog
  const backlogCount = open.length;

  // Top Failures Asset
  const assetFailures = {};
  workOrders.forEach(os => {
    const assetName = assets.find(a => a.id === os.assetId)?.name || 'Unknown';
    assetFailures[assetName] = (assetFailures[assetName] || 0) + 1;
  });
  const chartData = Object.keys(assetFailures).map(key => ({ name: key, falhas: assetFailures[key] })).sort((a,b) => b.falhas - a.falhas).slice(0, 5);

  // Status Distribution
  const statusDist = {};
  workOrders.forEach(os => {
    statusDist[os.status] = (statusDist[os.status] || 0) + 1;
  });
  const pieData = Object.keys(statusDist).map(key => ({ name: key.replace('_', ' '), value: statusDist[key] }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="space-y-6 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="MTTR (Médio)" value={`${mttr} min`} subtitle="Tempo Médio Reparo" icon={Clock} />
        <KpiCard title="Backlog Atual" value={backlogCount} subtitle="OS Pendentes" icon={AlertTriangle} trend="bad" />
        <KpiCard title="Total Finalizadas" value={finished.length} subtitle="Últimos 30 dias" icon={CheckCircle} />
        <KpiCard title="Ativos Monitorados" value={assets.length} subtitle="Total na planta" icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-4">Top 5 Ativos com Falhas</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} style={{fontSize: '12px'}} />
                <RechartsTooltip />
                <Bar dataKey="falhas" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-4">Distribuição por Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Insights Simulation */}
      <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl">
        <h3 className="font-bold text-indigo-900 flex items-center gap-2 mb-2">
           ✨ Insights Automáticos
        </h3>
        <ul className="space-y-2 text-indigo-800 text-sm">
          {chartData.length > 0 && (
            <li>• O ativo <strong>{chartData[0].name}</strong> é responsável por {((chartData[0].falhas / workOrders.length) * 100).toFixed(0)}% das ordens de serviço.</li>
          )}
          {mttr > 120 && (
             <li>• Atenção: O MTTR está acima de 2 horas. Considere treinamento ou estoque de peças críticas.</li>
          )}
          <li>• O setor de <strong>Produção A</strong> tem o maior volume de chamados corretivos esta semana.</li>
        </ul>
      </div>
    </div>
  );
};

// -- KANBAN / LIST COMPONENTS --

const KanbanCard = ({ os, assets, users, onView }) => {
  const assetName = assets.find(a => a.id === os.assetId)?.name || 'Ativo Removido';
  const techName = users.find(u => u.uid === os.assignedTo)?.name.split(' ')[0] || 'Sem técnico';

  return (
    <div 
      onClick={() => onView(os)}
      className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md transition-shadow mb-3"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-gray-400">#{os.id.slice(-4)}</span>
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getPriorityColor(os.priority)} bg-gray-50 border border-gray-100`}>
          {os.priority}
        </span>
      </div>
      <h4 className="font-semibold text-gray-800 text-sm mb-1">{assetName}</h4>
      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{os.symptom}</p>
      
      <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-1">
          <Users size={12} /> {techName}
        </div>
        <div>{formatDate(os.openedAt).split(' ')[0]}</div>
      </div>
    </div>
  );
};

const KanbanBoard = ({ data, onView, updateWorkOrder }) => {
  const [filterTech, setFilterTech] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const columns = [
    { id: 'aberta', label: 'Abertas' },
    { id: 'em_andamento', label: 'Em Andamento' },
    { id: 'aguardando_peca', label: 'Peça/Terceiro' },
    { id: 'finalizada', label: 'Finalizadas' }
  ];

  const filteredOrders = data.workOrders.filter(os => {
    if (filterTech && os.assignedTo !== filterTech) return false;
    if (filterPriority && os.priority !== filterPriority) return false;
    return true;
  });

  const exportCSV = () => {
    const headers = "ID,Ativo,Tipo,Prioridade,Status,AbertoEm,FinalizadoEm\n";
    const rows = filteredOrders.map(os => 
      `${os.id},${data.assets.find(a=>a.id===os.assetId)?.name},${os.type},${os.priority},${os.status},${os.openedAt},${os.finishedAt}`
    ).join("\n");
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio_os.csv';
    a.click();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filters Header */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <select 
              className="bg-gray-50 border border-gray-200 text-sm rounded-md p-2"
              onChange={(e) => setFilterTech(e.target.value)}
            >
              <option value="">Todos Técnicos</option>
              {data.users.filter(u => u.role === 'maintenance').map(u => (
                <option key={u.uid} value={u.uid}>{u.name}</option>
              ))}
            </select>
            <select
              className="bg-gray-50 border border-gray-200 text-sm rounded-md p-2"
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="">Todas Prioridades</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* Board Columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-w-[1000px] h-full pb-4">
          {columns.map(col => (
            <div key={col.id} className="flex-1 min-w-[280px] bg-slate-100 rounded-xl flex flex-col">
              <div className="p-3 font-bold text-gray-700 border-b border-gray-200 flex justify-between">
                {col.label}
                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  {filteredOrders.filter(o => o.status === col.id).length}
                </span>
              </div>
              <div className="p-2 flex-1 overflow-y-auto">
                {filteredOrders
                  .filter(o => o.status === col.id)
                  .sort((a,b) => new Date(b.openedAt) - new Date(a.openedAt)) // Most recent first
                  .map(os => (
                    <KanbanCard 
                      key={os.id} 
                      os={os} 
                      assets={data.assets} 
                      users={data.users}
                      onView={onView}
                    />
                  ))
                }
                {filteredOrders.filter(o => o.status === col.id).length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-10 p-4 border-2 border-dashed border-gray-200 rounded-lg">
                    Vazio
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// -- WORK ORDER FORM / DETAILS --

const WorkOrderForm = ({ data, addWorkOrder, updateWorkOrder, initialData = null, onClose, user }) => {
  const [formData, setFormData] = useState({
    assetId: '', type: 'corretiva', category: 'mecânica', priority: 'media',
    symptom: '', cause: '', action: '', assignedTo: user.role === 'maintenance' ? user.uid : '',
    status: 'aberta'
  });
  const [timerActive, setTimerActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      if (initialData.startedAt && !initialData.finishedAt) {
        setTimerActive(true);
        // Calc elapsed since start
        const start = new Date(initialData.startedAt).getTime();
        const now = new Date().getTime();
        setElapsed(Math.floor((now - start) / 1000));
      }
    }
  }, [initialData]);

  // Timer simulation
  useEffect(() => {
    let interval;
    if (timerActive) {
      interval = setInterval(() => setElapsed(p => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleStart = () => {
    const now = new Date().toISOString();
    setFormData(prev => ({ ...prev, status: 'em_andamento', startedAt: now }));
    updateWorkOrder(initialData.id, { status: 'em_andamento', startedAt: now });
    setTimerActive(true);
  };

  const handlePause = () => {
    setTimerActive(false);
    updateWorkOrder(initialData.id, { status: 'aguardando_peca' });
    setFormData(prev => ({ ...prev, status: 'aguardando_peca' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (initialData) {
      // Finalize
      if (formData.status === 'finalizada') {
        if (!formData.action || !formData.cause) {
          alert('Preencha a Causa e Ação para finalizar.');
          return;
        }
        const now = new Date();
        const start = new Date(formData.startedAt || now);
        const totalMins = Math.round((now - start) / 60000);
        
        updateWorkOrder(initialData.id, { 
          ...formData, 
          finishedAt: now.toISOString(),
          totalMinutes: totalMins > 0 ? totalMins : 1
        });
      } else {
        updateWorkOrder(initialData.id, formData);
      }
      onClose();
    } else {
      // Create New
      const newOS = {
        ...formData,
        id: `os-${Date.now()}`,
        openedAt: new Date().toISOString(),
        createdBy: user.uid,
        events: [{ type: 'created', at: new Date().toISOString(), by: user.name }],
        totalMinutes: 0
      };
      addWorkOrder(newOS);
      onClose();
    }
  };

  const formatSeconds = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-end z-[60]">
      <div className="w-full md:w-[500px] bg-white h-full overflow-y-auto p-6 shadow-2xl animate-slideInRight">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {initialData ? `OS #${initialData.id.slice(-4)}` : 'Nova Ordem de Serviço'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={24}/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ativo/Equipamento</label>
              <select 
                name="assetId" 
                required 
                className="w-full border rounded p-2 text-sm bg-white"
                value={formData.assetId}
                onChange={handleChange}
                disabled={!!initialData}
              >
                <option value="">Selecione...</option>
                {data.assets.map(a => <option key={a.id} value={a.id}>{a.name} - {a.sector}</option>)}
              </select>
             </div>
             <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Prioridade</label>
              <select name="priority" value={formData.priority} onChange={handleChange} className="w-full border rounded p-2 text-sm bg-white">
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label>
              <select name="type" value={formData.type} onChange={handleChange} className="w-full border rounded p-2 text-sm bg-white">
                <option value="corretiva">Corretiva</option>
                <option value="preventiva">Preventiva</option>
                <option value="melhoria">Melhoria</option>
              </select>
             </div>
             <div>
               <label className="block text-xs font-bold text-gray-500 mb-1">Categoria</label>
               <select name="category" value={formData.category} onChange={handleChange} className="w-full border rounded p-2 text-sm bg-white">
                <option value="mecânica">Mecânica</option>
                <option value="elétrica">Elétrica</option>
                <option value="hidráulica">Hidráulica</option>
               </select>
             </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Sintoma / Falha</label>
            <textarea 
              name="symptom" 
              required
              rows={3} 
              className="w-full border rounded p-2 text-sm"
              value={formData.symptom}
              onChange={handleChange}
              placeholder="Descreva o problema..."
            />
          </div>

          {/* Execution Fields (Only visible if OS exists) */}
          {initialData && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
              <div className="flex justify-between items-center mb-2">
                 <h3 className="font-bold text-slate-700 flex items-center gap-2"><Wrench size={16}/> Execução</h3>
                 {timerActive ? (
                   <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-mono font-bold animate-pulse">
                     {formatSeconds(elapsed)}
                   </span>
                 ) : (
                   <span className="text-xs text-gray-500">Parado</span>
                 )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {!timerActive && formData.status !== 'finalizada' && (
                  <button type="button" onClick={handleStart} className="flex-1 bg-green-600 text-white py-2 rounded flex items-center justify-center gap-2 hover:bg-green-700">
                    <Play size={16}/> Iniciar/Retomar
                  </button>
                )}
                {timerActive && (
                  <button type="button" onClick={handlePause} className="flex-1 bg-yellow-500 text-white py-2 rounded flex items-center justify-center gap-2 hover:bg-yellow-600">
                    <Pause size={16}/> Pausar
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Causa Raiz</label>
                <input name="cause" value={formData.cause} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="O que causou a falha?" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Ação Realizada</label>
                <textarea name="action" value={formData.action} onChange={handleChange} rows={2} className="w-full border rounded p-2 text-sm" placeholder="O que foi feito?" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Status Atual</label>
                <select name="status" value={formData.status} onChange={handleChange} className="w-full border rounded p-2 text-sm font-semibold">
                  <option value="aberta">Aberta</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="aguardando_peca">Aguardando Peça</option>
                  <option value="aguardando_operacao">Aguardando Operação</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow-md flex justify-center items-center gap-2">
              <Save size={18}/> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AssetList = ({ data, addAsset }) => {
  const [showForm, setShowForm] = useState(false);
  const [newAsset, setNewAsset] = useState({ name: '', sector: '', criticality: 'medium', manufacturer: '' });

  const handleSave = (e) => {
    e.preventDefault();
    addAsset({ ...newAsset, id: `a${Date.now()}` });
    setShowForm(false);
    setNewAsset({ name: '', sector: '', criticality: 'medium', manufacturer: '' });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="font-bold text-gray-700">Cadastro de Ativos</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1 hover:bg-blue-700">
          <PlusCircle size={16}/> Novo Ativo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="p-4 bg-blue-50 border-b border-blue-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-gray-500">Nome do Equipamento</label>
            <input required className="w-full border p-2 rounded text-sm" value={newAsset.name} onChange={e => setNewAsset({...newAsset, name: e.target.value})} placeholder="Ex: Motor 01" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Setor</label>
            <input required className="w-full border p-2 rounded text-sm" value={newAsset.sector} onChange={e => setNewAsset({...newAsset, sector: e.target.value})} placeholder="Ex: Usinagem" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Criticidade</label>
            <select className="w-full border p-2 rounded text-sm" value={newAsset.criticality} onChange={e => setNewAsset({...newAsset, criticality: e.target.value})}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </div>
          <button type="submit" className="bg-green-600 text-white p-2 rounded text-sm font-bold">Salvar</button>
        </form>
      )}

      <table className="w-full text-sm text-left">
        <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
          <tr>
            <th className="p-3">Nome</th>
            <th className="p-3">Setor</th>
            <th className="p-3">Criticidade</th>
            <th className="p-3">Fabricante</th>
          </tr>
        </thead>
        <tbody>
          {data.assets.map(asset => (
            <tr key={asset.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="p-3 font-medium text-gray-800">{asset.name}</td>
              <td className="p-3 text-gray-600">{asset.sector}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${asset.criticality === 'critical' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                  {asset.criticality}
                </span>
              </td>
              <td className="p-3 text-gray-500">{asset.manufacturer || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// -- LOGIN SCREEN --

const Login = () => {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('gestor@empresa.com');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!login(email)) {
      setError('Usuário não encontrado no Demo. Tente os sugeridos.');
    }
  };

  const resetDemo = () => {
    if(confirm("Isso apagará seus dados locais e recarregará o Demo. Continuar?")) {
      db.reset();
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-600 p-4 rounded-full text-white mb-3 shadow-lg shadow-blue-500/30">
            <Activity size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">MaintenancePro</h1>
          <p className="text-gray-500 text-sm">Sistema de Manutenção Inteligente</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
               <Users className="absolute left-3 top-3 text-gray-400" size={18} />
               <input 
                 type="email" 
                 className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 required
               />
            </div>
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md">
            Entrar
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-center text-gray-400 mb-3 uppercase tracking-wider font-bold">Acessos Demo</p>
          <div className="space-y-2 text-sm">
            <button onClick={() => setEmail('gestor@empresa.com')} className="w-full p-2 bg-gray-50 hover:bg-gray-100 rounded text-left flex justify-between items-center text-gray-600">
              <span>Gestor (Supervisor)</span>
              <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">gestor@empresa.com</span>
            </button>
            <button onClick={() => setEmail('tec@empresa.com')} className="w-full p-2 bg-gray-50 hover:bg-gray-100 rounded text-left flex justify-between items-center text-gray-600">
              <span>Técnico (Manutenção)</span>
              <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">tec@empresa.com</span>
            </button>
          </div>
          <button onClick={resetDemo} className="w-full mt-6 text-xs text-red-400 hover:text-red-600 underline">
            Resetar banco de dados (Demo)
          </button>
        </div>
      </div>
    </div>
  );
};

// -- MAIN LAYOUT --

const MainLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const { data, addWorkOrder, updateWorkOrder, addAsset } = useContext(DataContext);
  const [activePage, setActivePage] = useState(user.role === 'maintenance' ? 'kanban' : 'dashboard');
  const [editingOrder, setEditingOrder] = useState(null);

  // If user clicks "New OS" from menu, we open the modal with empty data
  const handlePageChange = (page) => {
    if (page === 'new-os') {
      setEditingOrder(null); // Ensure creation mode
      // We don't change 'activePage' to 'new-os' because it's a modal, usually over kanban
    } else {
      setActivePage(page);
    }
  };

  const renderContent = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard data={data} />;
      case 'kanban':
        return <KanbanBoard data={data} onView={setEditingOrder} updateWorkOrder={updateWorkOrder} />;
      case 'assets':
        return <AssetList data={data} addAsset={addAsset} />;
      default:
        return <KanbanBoard data={data} onView={setEditingOrder} updateWorkOrder={updateWorkOrder} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar activePage={activePage} setPage={handlePageChange} user={user} logout={logout} />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-64 relative">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 md:hidden">
            <h1 className="font-bold text-gray-700 flex items-center gap-2"><Activity className="text-blue-500"/> ManutPro</h1>
            <button onClick={logout} className="text-gray-400"><LogOut size={20}/></button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-7xl mx-auto">
             <div className="flex justify-between items-end mb-6">
                <div>
                   <h2 className="text-2xl font-bold text-gray-800 capitalize">{activePage}</h2>
                   <p className="text-sm text-gray-500 hidden md:block">Gerencie as operações de manutenção em tempo real.</p>
                </div>
                {activePage !== 'dashboard' && (
                  <button 
                    onClick={() => setEditingOrder({})} // Empty object triggers creation mode logic inside modal but not "null"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-bold transition-transform active:scale-95"
                  >
                    <PlusCircle size={20} /> <span className="hidden md:inline">Nova OS</span> <span className="md:hidden">Nova</span>
                  </button>
                )}
             </div>
             {renderContent()}
          </div>
        </main>
      </div>

      <MobileNav activePage={activePage} setPage={handlePageChange} user={user} />

      {/* Conditional Rendering of the Modal */}
      {(editingOrder || activePage === 'new-os') && (
        <WorkOrderForm 
          data={data}
          addWorkOrder={addWorkOrder}
          updateWorkOrder={updateWorkOrder}
          initialData={editingOrder && editingOrder.id ? editingOrder : null}
          user={user}
          onClose={() => {
            setEditingOrder(null);
            if (activePage === 'new-os') setActivePage('kanban'); // Fallback after close
          }}
        />
      )}
    </div>
  );
};

/**
 * ==================================================================================
 * 5. APP ROOT
 * ==================================================================================
 */

const App = () => {
  return (
    <AuthProvider>
      <ContextConsumer />
    </AuthProvider>
  );
};

const ContextConsumer = () => {
  const { user } = useContext(AuthContext);

  if (!user) return null;

  return (
    <DataProvider>
      <MainLayout />
    </DataProvider>
  );
};

export default App;
