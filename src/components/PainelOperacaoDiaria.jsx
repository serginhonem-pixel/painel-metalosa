import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Users,
  Clock,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  UserX,
  UserCheck,
  ShieldAlert,
  Award,
  Search,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart,
  Eye,
  X,
  Calendar as CalendarIcon,
  CheckCircle2,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────
const num = (v) => {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  const t = String(v).trim();
  if (!t) return 0;
  let c = t;
  if (c.includes(',')) c = c.replace(/\./g, '').replace(',', '.');
  c = c.replace(/[^0-9.\-]/g, '');
  const n = Number(c);
  return Number.isNaN(n) ? 0 : n;
};

const normalizeKey = (value) => {
  const raw = String(value ?? '');
  const hasPercent = raw.includes('%');
  const base = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  if (!base) return '';
  if (hasPercent && !base.includes('perc')) return `perc${base}`;
  return base;
};

const resolveHeaderKey = (key) => {
  const k = normalizeKey(key);
  if (!k) return null;
  if (k === 'periodos' || k === 'filial') return 'filial';
  if (k === 'matricula') return 'matricula';
  if (k === 'nome') return 'nome';
  if (k === 'centrocusto') return 'centroCusto';
  if ((k.includes('desc') && k.includes('ccusto')) || k === 'descccusto') return 'setor';
  if (k === 'periododeapontamento') return 'periodo';
  if (k === 'hrsprev' || k === 'horasprev') return 'hrsPrev';
  if (k === 'hrsreal' || k === 'horasreal') return 'hrsReal';
  if (k.includes('perc') && k.includes('hrsreal')) return 'percHrsReal';
  if (k === 'hrsntrab' || k === 'hrsnaotrab' || k === 'hrsnaotrabalhadas') return 'hrsNTrab';
  if (k.includes('perc') && k.includes('hrsntrab')) return 'percHrsNTrab';
  if (k === 'hrsabonadas') return 'hrsAbonadas';
  if (k.includes('perc') && k.includes('abonadas')) return 'percAbonadas';
  if (k === 'hrsafast' || k === 'hrsafastados') return 'hrsAfast';
  if (k.includes('perc') && k.includes('afast')) return 'percAfast';
  return null;
};

const findHeaderIndex = (rows) => {
  const required = ['filial', 'matricula', 'nome', 'setor', 'hrsPrev', 'hrsReal'];
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || [];
    const keys = row.map((cell) => resolveHeaderKey(cell)).filter(Boolean);
    const hits = required.filter((key) => keys.includes(key));
    if (hits.length >= 4) return i;
  }
  return -1;
};

const parseRowsFromArray = (rows) => {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  const headerRow = rows[headerIndex] || [];
  const headerMap = headerRow.map((cell) => resolveHeaderKey(cell));
  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const o = {};
      headerMap.forEach((key, idx) => {
        if (!key) return;
        o[key] = row?.[idx];
      });
      return o;
    })
    .filter((r) => r?.nome != null && String(r.nome).trim() !== '')
    .map((o) => ({
      ...o,
      hrsPrev: num(o.hrsPrev),
      hrsReal: num(o.hrsReal),
      percHrsReal: num(o.percHrsReal),
      hrsNTrab: num(o.hrsNTrab),
      percHrsNTrab: num(o.percHrsNTrab),
      hrsAbonadas: num(o.hrsAbonadas),
      percAbonadas: num(o.percAbonadas),
      hrsAfast: num(o.hrsAfast),
      percAfast: num(o.percAfast),
      nome: String(o.nome || '').trim(),
      setor: String(o.setor || 'SEM SETOR').trim(),
      matricula: String(o.matricula || '').trim(),
      periodo: String(o.periodo || '').trim(),
    }));
};

const parseRows = (raw) => {
  if (!raw) return [];

  if (Array.isArray(raw?.sheets)) {
    const sheets = raw.sheets;
    const periodSheet =
      sheets.find((s) => normalizeKey(s?.name).includes('period')) ||
      sheets[0];
    return parseRowsFromArray(periodSheet?.rows || []);
  }

  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return parseRowsFromArray(raw);
  }

  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[0] === 'object') {
    const HEADER_MAP = {
      'Períodos': 'filial',
      'Unnamed: 1': 'matricula',
      'Unnamed: 2': 'nome',
      'Unnamed: 3': 'centroCusto',
      'Unnamed: 4': 'setor',
      'Unnamed: 5': 'periodo',
      'Unnamed: 6': 'hrsPrev',
      'Unnamed: 7': 'hrsReal',
      'Unnamed: 8': 'percHrsReal',
      'Unnamed: 9': 'hrsNTrab',
      'Unnamed: 10': 'percHrsNTrab',
      'Unnamed: 11': 'hrsAbonadas',
      'Unnamed: 12': 'percAbonadas',
      'Unnamed: 13': 'hrsAfast',
      'Unnamed: 14': 'percAfast',
    };
    return raw
      .slice(1)
      .filter((r) => r['Unnamed: 2'] != null && String(r['Unnamed: 2']).trim() !== '')
      .map((r) => {
        const o = {};
        Object.entries(HEADER_MAP).forEach(([key, name]) => {
          o[name] = r[key];
        });
        o.hrsPrev = num(o.hrsPrev);
        o.hrsReal = num(o.hrsReal);
        o.percHrsReal = num(o.percHrsReal);
        o.hrsNTrab = num(o.hrsNTrab);
        o.percHrsNTrab = num(o.percHrsNTrab);
        o.hrsAbonadas = num(o.hrsAbonadas);
        o.percAbonadas = num(o.percAbonadas);
        o.hrsAfast = num(o.hrsAfast);
        o.percAfast = num(o.percAfast);
        o.nome = String(o.nome || '').trim();
        o.setor = String(o.setor || 'SEM SETOR').trim();
        o.matricula = String(o.matricula || '').trim();
        o.periodo = String(o.periodo || '').trim();
        return o;
      });
  }

  return [];
};

// ─── KPI Card ───────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, suffix, tone = 'text-white', sub }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 flex flex-col gap-1 min-w-0">
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-slate-400 shrink-0" />}
      <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 font-bold truncate">{label}</p>
    </div>
    <div className="flex items-end gap-1">
      <span className={`text-2xl font-black ${tone}`}>{value}</span>
      {suffix && <span className="text-[10px] text-slate-500 mb-1">{suffix}</span>}
    </div>
    {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
  </div>
);

// ─── Progress Bar ───────────────────────────────────────────────
const BarRow = ({ label, value, max, color = 'bg-rose-500', extra }) => {
  const pctWidth = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
        <span className="truncate mr-2">{label}</span>
        <span className="shrink-0">{typeof value === 'number' ? value.toFixed(1) : value}%</span>
      </div>
      {extra && <div className="flex items-center justify-between text-[10px] text-slate-500">{extra}</div>}
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pctWidth}%` }} />
      </div>
    </div>
  );
};

// ─── Insight Card ───────────────────────────────────────────────
const InsightCard = ({ icon: Icon, titulo, texto, tone = 'border-blue-500/30 bg-blue-500/5' }) => (
  <div className={`rounded-xl border ${tone} p-4 flex items-start gap-3`}>
    {Icon && <Icon size={18} className="text-slate-300 shrink-0 mt-0.5" />}
    <div className="min-w-0">
      <p className="text-xs font-bold text-slate-200">{titulo}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{texto}</p>
    </div>
  </div>
);

// ─── Modal de Detalhes do Setor ─────────────────────────────────
const ModalSetor = ({ setor, colaboradores, onClose }) => {
  if (!setor) return null;
  const colabs = colaboradores
    .filter((c) => c.setor === setor.setor)
    .sort((a, b) => b.percHrsNTrab - a.percHrsNTrab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-slate-950 border border-slate-700 rounded-3xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X size={20} />
        </button>
        <h3 className="text-lg font-black text-white mb-1">{setor.setor}</h3>
        <p className="text-xs text-slate-400 mb-4">
          {setor.colabs} colaboradores · {setor.absPerc.toFixed(1)}% absenteísmo · {setor.nTrab.toFixed(1)}h não trabalhadas
        </p>
        <div className="overflow-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3 text-right">Hrs Prev</th>
                <th className="px-4 py-3 text-right">Hrs Real</th>
                <th className="px-4 py-3 text-right">Hrs N.Trab</th>
                <th className="px-4 py-3 text-right">% Absent.</th>
                <th className="px-4 py-3 text-right">Hrs Abon.</th>
                <th className="px-4 py-3 text-right">Hrs Afast.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {colabs.map((c) => (
                <tr key={c.matricula} className="text-slate-300 hover:bg-slate-900/50">
                  <td className="px-4 py-2.5 font-semibold">{c.nome}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{c.hrsPrev.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right">{c.hrsReal.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-300">{c.hrsNTrab.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-bold ${c.percHrsNTrab > 10 ? 'text-rose-400' : c.percHrsNTrab > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {c.percHrsNTrab.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-300">{c.hrsAbonadas > 0 ? c.hrsAbonadas.toFixed(1) : '-'}</td>
                  <td className="px-4 py-2.5 text-right text-purple-300">{c.hrsAfast > 0 ? c.hrsAfast.toFixed(1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── COMPONENTE HISTÓRICO MENSAL (Calendário) ──────────────────
const HistoricoMensal = ({
  registrosPorData, colaboradores, supervisoresDisponiveis, setoresDisponiveis,
  filtroSupervisor, setFiltroSupervisor, filtroSetor, setFiltroSetor,
  filtroTipoDia, setFiltroTipoDia,
  mesHistorico, setMesHistorico, anoHistorico, setAnoHistorico,
  diaHistorico, setDiaHistorico, totalColaboradoresFiltrados,
  obterResumoDia, isFolgaColetiva, isDataSemApontamento, isDiaDesconsiderado,
  resumoHistorico,
  faltasPlanilhaPorData = {},
}) => {
  const MESES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const rh = resumoHistorico || {
    totalColab: 0, diasNoMes: 0, faltasTotal: 0, faltasJust: 0, faltasInjust: 0,
    feriasOcorrencias: 0, feriasColaboradores: 0, diasComFalta: 0, percentualPresenca: 0,
  };

  // Calendário
  const anoBase = anoHistorico || 2026;
  const mesBase = mesHistorico ?? new Date().getMonth();
  const diasNoMes = new Date(anoBase, mesBase + 1, 0).getDate();
  const primeiroDia = new Date(anoBase, mesBase, 1).getDay();
  const totalCells = primeiroDia + diasNoMes;
  const linhas = Math.ceil(totalCells / 7);
  const cells = Array.from({ length: linhas * 7 }, (_, i) => {
    const dia = i - primeiroDia + 1;
    if (dia < 1 || dia > diasNoMes) return null;
    return dia;
  });
  const hojeISO = new Date().toLocaleDateString('en-CA');

  return (
    <div className="space-y-6">
      {/* Header + filtros */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Historico Mensal ({anoBase})</h3>
          <p className="text-xs text-slate-500 mt-1">Selecione o mes para ver o calendario e as faltas registradas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroSupervisor || 'Todos'}
            onChange={(e) => setFiltroSupervisor?.(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 [&>option]:bg-slate-800 [&>option]:text-slate-200"
            style={{ colorScheme: 'dark' }}
          >
            {(supervisoresDisponiveis || ['Todos']).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={mesBase}
            onChange={(e) => { setMesHistorico?.(Number(e.target.value)); setDiaHistorico?.(null); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 [&>option]:bg-slate-800 [&>option]:text-slate-200"
            style={{ colorScheme: 'dark' }}
          >
            {MESES.map((mes, index) => (
              <option key={mes} value={index}>{mes}</option>
            ))}
          </select>
          <select
            value={anoBase}
            onChange={(e) => { setAnoHistorico?.(Number(e.target.value)); setDiaHistorico?.(null); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 [&>option]:bg-slate-800 [&>option]:text-slate-200"
            style={{ colorScheme: 'dark' }}
          >
            {[2025, 2026].map((ano) => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Presenca media</p>
            <CheckCircle2 size={16} className="text-emerald-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-100">{rh.percentualPresenca.toFixed(0)}%</p>
          <p className="text-xs text-slate-400">Base: {rh.totalColab} colabs</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Faltas no mes</p>
            <AlertTriangle size={16} className="text-rose-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-100">{Math.max(rh.faltasTotal - rh.feriasOcorrencias, 0)}</p>
          <p className="text-xs text-slate-400">{rh.diasComFalta} dias com apontamentos</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Just. x Injust.</p>
            <UserX size={16} className="text-amber-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-100">{rh.faltasJust} / {rh.faltasInjust}</p>
          <p className="text-xs text-slate-400">Justificadas vs Injustificadas</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ferias</p>
            <CalendarIcon size={16} className="text-blue-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-100">{rh.feriasColaboradores}</p>
          <p className="text-xs text-slate-400">Dias no mes: {rh.diasNoMes}</p>
        </div>
      </div>

      {/* Grid do calendário */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 gap-2 text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((label) => (
                <div key={label} className="text-center">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((dia, index) => {
                if (!dia) {
                  return <div key={`empty-${index}`} className="h-20 rounded-xl border border-dashed border-slate-700/60 bg-slate-900/40" />;
                }
                const mes = String(mesBase + 1).padStart(2, '0');
                const diaStr = String(dia).padStart(2, '0');
                const dataISO = `${anoBase}-${mes}-${diaStr}`;
                const resumoDia = obterResumoDia ? obterResumoDia(dataISO) : { total: 0, tipos: {} };
                const isAtivo = diaHistorico === dataISO;
                const isHoje = dataISO === hojeISO;
                const diaSemana = (index % 7);
                const isWeekend = diaSemana === 0 || diaSemana === 6;
                const faltas = resumoDia.total;
                const base = totalColaboradoresFiltrados || 0;
                const isFolga = isFolgaColetiva ? isFolgaColetiva(dataISO) : false;
                const ferias = resumoDia.tipos?.Ferias || 0;
                const faltasSemFerias = Math.max(faltas - ferias, 0);
                const semLancamento = (isWeekend || isFolga) && resumoDia.total === 0;
                const mostraPercentual = !isWeekend && !isFolga;
                const percentualPresenca = base > 0 ? ((base - faltasSemFerias) / base) * 100 : 0;

                return (
                  <button
                    key={dataISO}
                    onClick={() => { setDiaHistorico?.(dataISO); setFiltroTipoDia?.('Todos'); }}
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
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-200">Folga</span>
                      ) : isWeekend ? (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-bold ${semLancamento ? 'bg-slate-500/20 text-slate-200' : 'bg-indigo-500/20 text-indigo-200'}`}>DSR</span>
                      ) : (
                        <>
                          {ferias > 0 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-200">{ferias} ferias</span>}
                          {faltasSemFerias > 0 && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-rose-200">{faltasSemFerias} falta{faltasSemFerias > 1 ? 's' : ''}</span>}
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
                          ? semLancamento ? 'Sem lancamento' : 'Descanso semanal'
                          : (resumoDia.total === 0 ? 'Sem faltas' : 'Com apontamentos')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detalhes do Dia Selecionado */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
        {diaHistorico ? (
          (() => {
            const resumoDia = obterResumoDia ? obterResumoDia(diaHistorico) : { total: 0, tipos: {} };
            const resumoDoExcel = resumoDia?.fonte === 'excel';
            const desconsiderado = (isDataSemApontamento ? isDataSemApontamento(diaHistorico) : false) || (isDiaDesconsiderado ? isDiaDesconsiderado(diaHistorico) : false);
            const registros = desconsiderado ? {} : (registrosPorData[diaHistorico] || {});
            const normalizarNome = (valor) =>
              String(valor || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
            const mapaPorNome = new Map(
              (colaboradores || []).map((c) => [normalizarNome(c.nome), c])
            );
            const faltasPlanilha = ((faltasPlanilhaPorData?.[diaHistorico]) || [])
              .map((item, index) => {
                const colab = mapaPorNome.get(normalizarNome(item.nome));
                return {
                  id: `xlsx-${item.matriculaRaw || item.matricula || index}`,
                  nome: item.nome || 'Nao encontrado',
                  setor: colab?.setor || '-',
                  gestor: colab?.gestor || '-',
                  tipo: item.tipoFalta || 'Falta Injustificada',
                  tempoParcial: '',
                };
              });
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
                const supervisorOk = !filtroSupervisor || filtroSupervisor === 'Todos' || item.gestor === filtroSupervisor;
                const setorOk = !filtroSetor || filtroSetor === 'Todos' || item.setor === filtroSetor;
                const tipoFiltro = filtroTipoDia || 'Todos';
                const tipoOk = tipoFiltro === 'Todos'
                  ? true
                  : tipoFiltro === 'Ferias'
                    ? item.tipo === 'Ferias'
                    : item.tipo !== 'Ferias';
                return supervisorOk && setorOk && tipoOk;
              });
            const faltasExibidas = resumoDoExcel
              ? faltasPlanilha.filter((item) => {
                const supervisorOk = !filtroSupervisor || filtroSupervisor === 'Todos' || item.gestor === filtroSupervisor;
                const setorOk = !filtroSetor || filtroSetor === 'Todos' || item.setor === filtroSetor;
                const tipoFiltro = filtroTipoDia || 'Todos';
                const tipoOk = tipoFiltro === 'Todos'
                  ? true
                  : tipoFiltro === 'Ferias'
                    ? item.tipo === 'Ferias'
                    : item.tipo !== 'Ferias';
                return supervisorOk && setorOk && tipoOk;
              })
              : faltas;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Faltas do dia</p>
                    <p className="text-sm font-semibold text-slate-200">{diaHistorico}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/50 p-1 text-[11px] font-bold text-slate-400">
                      {['Todos', 'Faltas', 'Ferias'].map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => setFiltroTipoDia?.(tipo)}
                          className={`px-3 py-1 rounded-full transition-colors ${
                            (filtroTipoDia || 'Todos') === tipo
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {tipo}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-slate-500">
                      {faltasExibidas.length} registros
                    </span>
                  </div>
                </div>
                {resumoDoExcel ? (
                  <>
                    <div className="rounded-xl border border-slate-700 p-4 text-sm text-slate-400">
                      <div className="font-bold text-slate-300 mb-2">Resumo do dia (planilha)</div>
                      {((filtroTipoDia || 'Todos') === 'Todos' || filtroTipoDia === 'Ferias') && (
                        <div>Ferias: {resumoDia.tipos?.Ferias || 0}</div>
                      )}
                      {((filtroTipoDia || 'Todos') === 'Todos' || filtroTipoDia === 'Faltas') && (
                        <div>Falta Justificada: {resumoDia.tipos?.['Falta Justificada'] || 0}</div>
                      )}
                      {((filtroTipoDia || 'Todos') === 'Todos' || filtroTipoDia === 'Faltas') && (
                        <div>Falta Injustificada: {resumoDia.tipos?.['Falta Injustificada'] || 0}</div>
                      )}
                    </div>
                    {faltasExibidas.length === 0 ? (
                      <p className="text-slate-500 italic">Nenhuma falta registrada neste dia.</p>
                    ) : (
                      <div className="max-h-72 overflow-auto rounded-xl border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-5 py-3">Colaborador</th>
                              <th className="px-5 py-3">Setor</th>
                              <th className="px-5 py-3">Supervisor</th>
                              <th className="px-5 py-3">Tipo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {faltasExibidas.map((item) => (
                              <tr key={item.id} className="text-slate-300">
                                <td className="px-5 py-3 font-semibold">{item.nome}</td>
                                <td className="px-5 py-3 text-slate-500">{item.setor}</td>
                                <td className="px-5 py-3 text-slate-500">{item.gestor}</td>
                                <td className="px-5 py-3">
                                  <span className="rounded-full px-2 py-1 text-[10px] font-bold bg-rose-500/20 text-rose-300">
                                    {item.tipo}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : faltasExibidas.length === 0 ? (
                  <p className="text-slate-500 italic">Nenhuma falta registrada neste dia.</p>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3">Colaborador</th>
                          <th className="px-5 py-3">Setor</th>
                          <th className="px-5 py-3">Supervisor</th>
                          <th className="px-5 py-3">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {faltasExibidas.map((item) => (
                          <tr key={item.id} className="text-slate-300">
                            <td className="px-5 py-3 font-semibold">{item.nome}</td>
                            <td className="px-5 py-3 text-slate-500">{item.setor}</td>
                            <td className="px-5 py-3 text-slate-500">{item.gestor}</td>
                            <td className="px-5 py-3">
                              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                item.tipo === 'Ferias'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : item.tipo === 'Falta Parcial'
                                    ? 'bg-amber-500/10 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
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
          <p className="text-slate-500 italic">Selecione um dia no calendario para ver os registros.</p>
        )}
      </div>
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────
export default function PainelOperacaoDiaria({
  // Props para o Histórico Mensal (calendário)
  registrosPorData = {},
  colaboradores = [],
  supervisoresDisponiveis = ['Todos'],
  setoresDisponiveis = ['Todos'],
  filtroSupervisor: propFiltroSupervisor,
  setFiltroSupervisor: propSetFiltroSupervisor,
  filtroSetor: propFiltroSetorCal,
  setFiltroSetor: propSetFiltroSetorCal,
  filtroTipoDia: propFiltroTipoDia,
  setFiltroTipoDia: propSetFiltroTipoDia,
  mesHistorico: propMesHistorico,
  setMesHistorico: propSetMesHistorico,
  anoHistorico: propAnoHistorico,
  setAnoHistorico: propSetAnoHistorico,
  diaHistorico: propDiaHistorico,
  setDiaHistorico: propSetDiaHistorico,
  totalColaboradoresFiltrados = 0,
  obterResumoDia,
  isFolgaColetiva,
  isDataSemApontamento,
  isDiaDesconsiderado,
  resumoHistorico: propResumoHistorico,
  resumoLeandroExcel,
  faltasPlanilhaPorData = {},
}) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('Todos');
  const [modalSetor, setModalSetor] = useState(null);
  const [expandirAusentes, setExpandirAusentes] = useState(false);
  const [expandirPresentes, setExpandirPresentes] = useState(false);
  const [expandirAfastados, setExpandirAfastados] = useState(false);
  const [subAba, setSubAba] = useState('quadro');


  // ─── Fetch data ───────────────────────────────────────────────
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const resp = await fetch('/data/absenteismo.json');
        if (!resp.ok) throw new Error('Falha ao carregar absenteismo.json');
        const raw = await resp.json();
        if (!ativo) return;
        const parsed = parseRows(raw);
        setDados(parsed);
      } catch (err) {
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    carregar();
    return () => { ativo = false; };
  }, []);

  // ─── Derived data ─────────────────────────────────────────────
  const resumo = useMemo(() => {
    if (!dados.length) return null;

    const totalPrev = dados.reduce((a, c) => a + c.hrsPrev, 0);
    const totalReal = dados.reduce((a, c) => a + c.hrsReal, 0);
    const totalNTrab = dados.reduce((a, c) => a + c.hrsNTrab, 0);
    const totalAbonadas = dados.reduce((a, c) => a + c.hrsAbonadas, 0);
    const totalAfast = dados.reduce((a, c) => a + c.hrsAfast, 0);
    const totalColab = dados.length;
    const absPerc = totalPrev > 0 ? (totalNTrab / totalPrev) * 100 : 0;
    const presPerc = totalPrev > 0 ? ((totalPrev - totalNTrab) / totalPrev) * 100 : 0;
    const periodoLabel = dados[0]?.periodo || '';

    // Por setor
    const setorMap = new Map();
    dados.forEach((c) => {
      if (!setorMap.has(c.setor)) {
        setorMap.set(c.setor, { setor: c.setor, prev: 0, real: 0, nTrab: 0, abonadas: 0, afast: 0, colabs: 0 });
      }
      const s = setorMap.get(c.setor);
      s.prev += c.hrsPrev;
      s.real += c.hrsReal;
      s.nTrab += c.hrsNTrab;
      s.abonadas += c.hrsAbonadas;
      s.afast += c.hrsAfast;
      s.colabs += 1;
    });
    const porSetor = Array.from(setorMap.values())
      .map((s) => ({ ...s, absPerc: s.prev > 0 ? (s.nTrab / s.prev) * 100 : 0 }))
      .sort((a, b) => b.absPerc - a.absPerc);

    // Top ausentes
    const topAusentes = [...dados]
      .filter((c) => c.hrsNTrab > 0)
      .sort((a, b) => b.percHrsNTrab - a.percHrsNTrab);

    // Presença total
    const presencaTotal = dados.filter((c) => c.hrsNTrab === 0 && c.hrsAfast === 0 && c.hrsReal > 0);

    // Afastados
    const afastados = dados.filter((c) => c.hrsAfast > 0).sort((a, b) => b.hrsAfast - a.hrsAfast);

    // Com abono
    const comAbono = dados.filter((c) => c.hrsAbonadas > 0).sort((a, b) => b.hrsAbonadas - a.hrsAbonadas);

    // Lista de setores
    const setores = ['Todos', ...porSetor.map((s) => s.setor)];

    return {
      totalPrev, totalReal, totalNTrab, totalAbonadas, totalAfast,
      totalColab, absPerc, presPerc, periodoLabel,
      porSetor, topAusentes, presencaTotal, afastados, comAbono, setores,
    };
  }, [dados]);

  // ─── Filtered data ────────────────────────────────────────────
  const dadosFiltrados = useMemo(() => {
    if (!dados.length) return [];
    let result = dados;
    if (filtroSetor !== 'Todos') {
      result = result.filter((c) => c.setor === filtroSetor);
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      result = result.filter((c) =>
        c.nome.toLowerCase().includes(q) ||
        c.setor.toLowerCase().includes(q) ||
        c.matricula.includes(q)
      );
    }
    return result;
  }, [dados, filtroSetor, busca]);

  // ─── Insights automáticos ─────────────────────────────────────
  const insights = useMemo(() => {
    if (!resumo) return [];
    const items = [];
    const piores = resumo.porSetor.filter((s) => s.absPerc > 10);
    if (piores.length > 0) {
      items.push({
        icon: AlertTriangle,
        titulo: `${piores.length} setor${piores.length > 1 ? 'es' : ''} com absenteísmo acima de 10%`,
        texto: piores.map((s) => `${s.setor} (${s.absPerc.toFixed(1)}%)`).join(', '),
        tone: 'border-rose-500/30 bg-rose-500/5',
      });
    }
    if (resumo.afastados.length > 0) {
      items.push({
        icon: ShieldAlert,
        titulo: `${resumo.afastados.length} colaborador${resumo.afastados.length > 1 ? 'es' : ''} afastado${resumo.afastados.length > 1 ? 's' : ''}`,
        texto: `Total de ${resumo.totalAfast.toFixed(1)}h de afastamento no período. ${resumo.afastados.slice(0, 3).map((a) => a.nome).join(', ')}${resumo.afastados.length > 3 ? '...' : ''}`,
        tone: 'border-purple-500/30 bg-purple-500/5',
      });
    }
    if (resumo.presencaTotal.length > 0) {
      const pct = ((resumo.presencaTotal.length / resumo.totalColab) * 100).toFixed(0);
      items.push({
        icon: Award,
        titulo: `${resumo.presencaTotal.length} colaboradores com presença total (${pct}%)`,
        texto: `Esses colaboradores cumpriram 100% das horas previstas sem faltas ou atrasos.`,
        tone: 'border-emerald-500/30 bg-emerald-500/5',
      });
    }
    if (resumo.totalAbonadas > 0) {
      items.push({
        icon: Clock,
        titulo: `${resumo.totalAbonadas.toFixed(1)}h abonadas no período`,
        texto: `${resumo.comAbono.length} colaborador${resumo.comAbono.length > 1 ? 'es' : ''} tiveram horas abonadas.`,
        tone: 'border-blue-500/30 bg-blue-500/5',
      });
    }
    const melhorSetor = resumo.porSetor[resumo.porSetor.length - 1];
    if (melhorSetor && melhorSetor.absPerc < 3) {
      items.push({
        icon: TrendingUp,
        titulo: `Melhor setor: ${melhorSetor.setor}`,
        texto: `Apenas ${melhorSetor.absPerc.toFixed(1)}% de absenteísmo com ${melhorSetor.colabs} colaboradores.`,
        tone: 'border-emerald-500/30 bg-emerald-500/5',
      });
    }
    return items;
  }, [resumo]);

  // ─── Render ───────────────────────────────────────────────────
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="ml-3 text-slate-400 text-sm">Carregando dados de absenteísmo...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6">
        <p className="text-rose-400 font-semibold text-sm">{erro}</p>
      </div>
    );
  }

  if (!resumo) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-6">
        <p className="text-slate-400 italic text-sm">Nenhum dado encontrado no arquivo.</p>
      </div>
    );
  }

  const maxAbsSetor = Math.max(...resumo.porSetor.map((s) => s.absPerc), 1);

  return (
    <div className="space-y-6">
      {/* ─── SUB-ABAS ─────────────────────────────────────────── */}
      <div className="flex gap-6 border-b border-slate-700">
        <button
          onClick={() => setSubAba('quadro')}
          className={`pb-3 text-sm font-bold transition-all ${subAba === 'quadro' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Quadro de Faltas
        </button>
      </div>

      {subAba === 'quadro' ? (
        <div className="space-y-6">
      {/* ─── HEADER + KPIs ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative space-y-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 font-bold">Absenteísmo Consolidado</p>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">Operação Diária</h2>
              <p className="text-sm text-slate-400 mt-1 font-medium">
                {resumo.periodoLabel ? `Período: ${resumo.periodoLabel}` : 'Período não informado'}
              </p>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <KpiCard icon={TrendingDown} label="% Absenteísmo" value={resumo.absPerc.toFixed(1)} suffix="%" tone="text-rose-300" />
            <KpiCard icon={TrendingUp} label="% Presença" value={resumo.presPerc.toFixed(1)} suffix="%" tone="text-emerald-300" />
            <KpiCard icon={Clock} label="Hrs N. Trab." value={resumo.totalNTrab.toFixed(1)} suffix="h" tone="text-amber-300" />
            <KpiCard icon={Clock} label="Hrs Previstas" value={resumo.totalPrev.toFixed(1)} suffix="h" tone="text-blue-200" />
            <KpiCard icon={Users} label="Colaboradores" value={resumo.totalColab} tone="text-emerald-200" />
            <KpiCard icon={ShieldAlert} label="Hrs Afastam." value={resumo.totalAfast.toFixed(1)} suffix="h" tone="text-purple-300" sub={`${resumo.afastados.length} afastados`} />
            <KpiCard icon={Award} label="Hrs Abonadas" value={resumo.totalAbonadas.toFixed(1)} suffix="h" tone="text-cyan-300" sub={`${resumo.comAbono.length} colab.`} />
          </div>
        </div>
      </div>

      {/* ─── INSIGHTS AUTOMÁTICOS ──────────────────────────────── */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {insights.map((item, i) => (
            <InsightCard key={i} {...item} />
          ))}
        </div>
      )}

      {/* ─── FILTROS ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar colaborador, setor ou matrícula..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/50 pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={filtroSetor}
          onChange={(e) => setFiltroSetor(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 focus:border-blue-500 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-slate-200"
          style={{ colorScheme: 'dark' }}
        >
          {resumo.setores.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-[10px] text-slate-500 font-bold">
          {dadosFiltrados.length} de {resumo.totalColab} colaboradores
        </span>
      </div>

      {/* ─── GRID PRINCIPAL ────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Absenteísmo por setor */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-rose-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Absenteísmo por Setor</h3>
            </div>
            <span className="text-[10px] text-slate-500 font-bold">{resumo.porSetor.length} setores</span>
          </div>
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
            {resumo.porSetor.map((item) => (
              <button
                key={item.setor}
                className="w-full text-left hover:bg-slate-900/50 rounded-lg p-1.5 -m-1.5 transition-colors"
                onClick={() => setModalSetor(item)}
              >
                <BarRow
                  label={item.setor}
                  value={item.absPerc}
                  max={maxAbsSetor}
                  color={
                    item.absPerc > 15 ? 'bg-rose-500'
                      : item.absPerc > 8 ? 'bg-amber-500'
                        : item.absPerc > 3 ? 'bg-yellow-500'
                          : 'bg-emerald-500'
                  }
                  extra={
                    <>
                      <span>{item.colabs} colab{item.colabs > 1 ? 's' : ''}</span>
                      <span>{item.nTrab.toFixed(1)}h não trabalhadas</span>
                    </>
                  }
                />
              </button>
            ))}
          </div>
        </div>

        {/* Top Ausentes */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <UserX size={16} className="text-amber-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Maiores Ausências</h3>
            </div>
            <button
              onClick={() => setExpandirAusentes(!expandirAusentes)}
              className="flex items-center gap-1 text-[10px] text-slate-500 font-bold hover:text-slate-300 transition-colors"
            >
              {expandirAusentes ? 'Top 10' : `Todos (${resumo.topAusentes.length})`}
              {expandirAusentes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          <div className="overflow-auto max-h-[460px] rounded-xl border border-slate-800 custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Colaborador</th>
                  <th className="px-3 py-2.5">Setor</th>
                  <th className="px-3 py-2.5 text-right">H N.Trab</th>
                  <th className="px-3 py-2.5 text-right">%Abs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {(expandirAusentes ? resumo.topAusentes : resumo.topAusentes.slice(0, 10)).map((c, i) => (
                  <tr key={c.matricula} className="text-slate-300 hover:bg-slate-900/50 transition-colors">
                    <td className="px-3 py-2 text-slate-500 font-bold">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold truncate max-w-[160px]">{c.nome}</td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]">{c.setor}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-300">{c.hrsNTrab.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-bold ${c.percHrsNTrab > 20 ? 'text-rose-400' : c.percHrsNTrab > 10 ? 'text-amber-400' : 'text-yellow-400'}`}>
                        {c.percHrsNTrab.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── SEGUNDA ROW ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Afastados */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-purple-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Afastados</h3>
            </div>
            <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-purple-300">
              {resumo.afastados.length}
            </span>
          </div>
          {resumo.afastados.length === 0 ? (
            <p className="text-slate-500 text-xs italic">Nenhum colaborador afastado no período.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {(expandirAfastados ? resumo.afastados : resumo.afastados.slice(0, 6)).map((c) => (
                <div key={c.matricula} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{c.nome}</p>
                    <p className="text-[10px] text-slate-500">{c.setor}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-bold text-purple-300">{c.hrsAfast.toFixed(1)}h</p>
                    <p className="text-[10px] text-slate-500">{c.percAfast.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
              {resumo.afastados.length > 6 && (
                <button
                  onClick={() => setExpandirAfastados(!expandirAfastados)}
                  className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 py-1 transition-colors"
                >
                  {expandirAfastados ? 'Mostrar menos' : `Ver todos (${resumo.afastados.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Presença Total */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Presença Total</h3>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
              {resumo.presencaTotal.length}
            </span>
          </div>
          {resumo.presencaTotal.length === 0 ? (
            <p className="text-slate-500 text-xs italic">Nenhum colaborador com 100% de presença.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {(expandirPresentes ? resumo.presencaTotal : resumo.presencaTotal.slice(0, 6)).map((c) => (
                <div key={c.matricula} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{c.nome}</p>
                    <p className="text-[10px] text-slate-500">{c.setor}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-bold text-emerald-300">{c.hrsReal.toFixed(1)}h</p>
                    <p className="text-[10px] text-emerald-500">100%</p>
                  </div>
                </div>
              ))}
              {resumo.presencaTotal.length > 6 && (
                <button
                  onClick={() => setExpandirPresentes(!expandirPresentes)}
                  className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 py-1 transition-colors"
                >
                  {expandirPresentes ? 'Mostrar menos' : `Ver todos (${resumo.presencaTotal.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Distribuição rápida */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={16} className="text-blue-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Distribuição de Horas</h3>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Horas Trabalhadas', value: resumo.totalReal, total: resumo.totalPrev, color: 'bg-emerald-500', textColor: 'text-emerald-300' },
              { label: 'Horas Não Trabalhadas', value: resumo.totalNTrab, total: resumo.totalPrev, color: 'bg-amber-500', textColor: 'text-amber-300' },
              { label: 'Horas Abonadas', value: resumo.totalAbonadas, total: resumo.totalPrev, color: 'bg-cyan-500', textColor: 'text-cyan-300' },
              { label: 'Horas Afastamento', value: resumo.totalAfast, total: resumo.totalPrev, color: 'bg-purple-500', textColor: 'text-purple-300' },
            ].map((item) => {
              const pct = item.total > 0 ? (item.value / item.total) * 100 : 0;
              return (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className={`text-xs font-bold ${item.textColor}`}>{item.value.toFixed(1)}h ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}

            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Média H/Colab</p>
                  <p className="text-lg font-black text-slate-200">{(resumo.totalPrev / Math.max(resumo.totalColab, 1)).toFixed(1)}h</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Média Falta/Colab</p>
                  <p className="text-lg font-black text-amber-300">{(resumo.totalNTrab / Math.max(resumo.totalColab, 1)).toFixed(1)}h</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── TABELA COMPLETA ───────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-slate-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Visão Detalhada</h3>
          </div>
          <span className="text-[10px] text-slate-500 font-bold">{dadosFiltrados.length} registros</span>
        </div>
        <div className="overflow-auto max-h-[500px] rounded-xl border border-slate-800 custom-scrollbar">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Mat.</th>
                <th className="px-3 py-2.5">Colaborador</th>
                <th className="px-3 py-2.5">Setor</th>
                <th className="px-3 py-2.5 text-right">H Prev</th>
                <th className="px-3 py-2.5 text-right">H Real</th>
                <th className="px-3 py-2.5 text-right">H N.Trab</th>
                <th className="px-3 py-2.5 text-right">%Abs</th>
                <th className="px-3 py-2.5 text-right">H Abon.</th>
                <th className="px-3 py-2.5 text-right">H Afast.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {dadosFiltrados.map((c) => (
                <tr key={c.matricula} className="text-slate-300 hover:bg-slate-900/50 transition-colors">
                  <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{c.matricula}</td>
                  <td className="px-3 py-2 font-semibold truncate max-w-[180px]">{c.nome}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]">{c.setor}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{c.hrsPrev.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{c.hrsReal.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-bold text-amber-300">{c.hrsNTrab > 0 ? c.hrsNTrab.toFixed(1) : '-'}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${c.percHrsNTrab > 20 ? 'text-rose-400' : c.percHrsNTrab > 10 ? 'text-amber-400' : c.percHrsNTrab > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {c.percHrsNTrab > 0 ? `${c.percHrsNTrab.toFixed(1)}%` : '0%'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-cyan-300">{c.hrsAbonadas > 0 ? c.hrsAbonadas.toFixed(1) : '-'}</td>
                  <td className="px-3 py-2 text-right text-purple-300">{c.hrsAfast > 0 ? c.hrsAfast.toFixed(1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal de setor ────────────────────────────────────── */}
      {modalSetor && (
        <ModalSetor setor={modalSetor} colaboradores={dados} onClose={() => setModalSetor(null)} />
      )}
    </div>
      ) : (
        /* ─── ABA HISTÓRICO MENSAL / CALENDÁRIO ─────────────────── */
        <HistoricoMensal
          registrosPorData={registrosPorData}
          colaboradores={colaboradores}
          supervisoresDisponiveis={supervisoresDisponiveis}
          setoresDisponiveis={setoresDisponiveis}
          filtroSupervisor={propFiltroSupervisor}
          setFiltroSupervisor={propSetFiltroSupervisor}
          filtroSetor={propFiltroSetorCal}
          setFiltroSetor={propSetFiltroSetorCal}
          filtroTipoDia={propFiltroTipoDia}
          setFiltroTipoDia={propSetFiltroTipoDia}
          mesHistorico={propMesHistorico}
          setMesHistorico={propSetMesHistorico}
          anoHistorico={propAnoHistorico}
          setAnoHistorico={propSetAnoHistorico}
          diaHistorico={propDiaHistorico}
          setDiaHistorico={propSetDiaHistorico}
          totalColaboradoresFiltrados={totalColaboradoresFiltrados}
          obterResumoDia={obterResumoDia}
          isFolgaColetiva={isFolgaColetiva}
          isDataSemApontamento={isDataSemApontamento}
          isDiaDesconsiderado={isDiaDesconsiderado}
          resumoHistorico={propResumoHistorico}
          faltasPlanilhaPorData={faltasPlanilhaPorData}
        />
      )}
    </div>
  );
}
