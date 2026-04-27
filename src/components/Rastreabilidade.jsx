import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  doc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  Package,
  ClipboardList,
  Search,
  Download,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Shield,
  Hash,
  Calendar,
  Building2,
  BoxSelect,
  FlaskConical,
} from 'lucide-react';

// ─── Lista fixa de componentes ─────────────────────────────────────────────────
const COMPONENTES = [
  'MONT.',
  'TRAVESSA',
  'PATAMAR',
  'DEGRAU',
  'ARTICULADOR',
  'DOBRADIÇA',
  'ARAME SUST. PAT.',
  'REFORÇO MONT.',
  'ARRUELA LISA 3/16"',
  'REBITE R-512A',
  'REBITE R-519A',
  'REBITE R-612',
  'CINTA SEG.',
];

const today = () => new Date().toISOString().split('T')[0];

// ─── Utilitários ───────────────────────────────────────────────────────────────
function Badge({ children, color = 'slate' }) {
  const map = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rose:    'bg-rose-100 text-rose-700 border-rose-200',
    amber:   'bg-amber-100 text-amber-700 border-amber-200',
    blue:    'bg-blue-100 text-blue-700 border-blue-200',
    slate:   'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${map[color]}`}>
      {children}
    </span>
  );
}

function Feedback({ feedback }) {
  if (!feedback) return null;
  const ok = feedback.tipo === 'ok';
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold mb-5 ${ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
      {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {feedback.msg}
    </div>
  );
}

function Label({ children }) {
  return (
    <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1.5">
      {children}
    </label>
  );
}

function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-slate-300 ${className}`}
      {...props}
    />
  );
}

function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5 mb-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-100">
        <Icon size={18} className="text-blue-600" />
      </div>
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">{children}</h3>
    </div>
  );
}

// ─── Sub-tela 1: Entrada de Lote ───────────────────────────────────────────────
function EntradaLote({ lotes }) {
  const [form, setForm] = useState({
    componente: COMPONENTES[0],
    nroNF: '',
    nroLoteFornecedor: '',
    fornecedor: '',
    qtdRecebida: '',
    dataEntrada: today(),
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nroNF.trim() || !form.nroLoteFornecedor.trim() || !form.fornecedor.trim() || !form.qtdRecebida) {
      setFeedback({ tipo: 'erro', msg: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'rastreabilidade_lotes'), {
        componente: form.componente,
        nroNF: form.nroNF.trim(),
        nroLoteFornecedor: form.nroLoteFornecedor.trim(),
        fornecedor: form.fornecedor.trim(),
        qtdRecebida: Number(form.qtdRecebida),
        qtdDisponivel: Number(form.qtdRecebida),
        dataEntrada: form.dataEntrada,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: 'Lote registrado com sucesso!' });
      setForm({ componente: COMPONENTES[0], nroNF: '', nroLoteFornecedor: '', fornecedor: '', qtdRecebida: '', dataEntrada: today() });
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const lotesAtivos = lotes.filter((l) => l.ativo);
  const totalLotes = lotesAtivos.length;
  const totalItens = lotesAtivos.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);
  const semEstoque  = lotesAtivos.filter((l) => l.qtdDisponivel === 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Lotes ativos',      value: totalLotes, color: 'text-slate-900' },
          { label: 'Itens disponíveis', value: totalItens, color: 'text-emerald-600' },
          { label: 'Lotes zerados',     value: semEstoque, color: 'text-rose-500'  },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>
            <p className={`text-3xl font-black mt-2 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle icon={Package}>Registrar Recebimento de Componente</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label>Componente</Label>
            <Select value={form.componente} onChange={(e) => set('componente', e.target.value)}>
              {COMPONENTES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label>Nº da Nota Fiscal</Label>
            <Input value={form.nroNF} onChange={(e) => set('nroNF', e.target.value)} placeholder="Ex: 123456" />
          </div>
          <div>
            <Label>Nº do Lote do Fornecedor</Label>
            <Input value={form.nroLoteFornecedor} onChange={(e) => set('nroLoteFornecedor', e.target.value)} placeholder="Ex: LOT-2024-001" />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={form.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} placeholder="Razão social ou nome comercial" />
          </div>
          <div>
            <Label>Quantidade Recebida</Label>
            <Input type="number" min="1" value={form.qtdRecebida} onChange={(e) => set('qtdRecebida', e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Data de Entrada</Label>
            <Input type="date" value={form.dataEntrada} onChange={(e) => set('dataEntrada', e.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
              <Plus size={15} /> {saving ? 'Salvando...' : 'Registrar Lote'}
            </button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Histórico de Lotes</p>
          <Badge color={lotesAtivos.length > 0 ? 'blue' : 'slate'}>{lotesAtivos.length} registros</Badge>
        </div>
        {lotesAtivos.length === 0 ? (
          <div className="text-center py-12 text-slate-300">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-slate-400">Nenhum lote registrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Componente', 'NF', 'Lote Fornecedor', 'Fornecedor', 'Recebido', 'Disponível', 'Entrada'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lotesAtivos.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-800">{l.componente}</td>
                    <td className="py-3 px-3"><span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{l.nroNF || '—'}</span></td>
                    <td className="py-3 px-3"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{l.nroLoteFornecedor}</span></td>
                    <td className="py-3 px-3 text-slate-600">{l.fornecedor}</td>
                    <td className="py-3 px-3 text-slate-500">{l.qtdRecebida}</td>
                    <td className="py-3 px-3"><span className={`font-black ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span></td>
                    <td className="py-3 px-3 text-slate-500 font-mono">{l.dataEntrada}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-tela 2: Ordem de Produção ─────────────────────────────────────────────
function OrdemProducao({ lotes, lotesDisponiveis }) {
  const [nroSerie, setNroSerie] = useState('');
  const [dataProd, setDataProd] = useState(today());
  const [comps, setComps] = useState(
    COMPONENTES.map((c) => ({ componente: c, loteId: '', qtdConsumida: 1 })),
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const setLote = (idx, loteId) =>
    setComps((prev) => prev.map((c, i) => i === idx ? { ...c, loteId } : c));
  const setQtd = (idx, qtd) =>
    setComps((prev) => prev.map((c, i) => i === idx ? { ...c, qtdConsumida: Number(qtd) } : c));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nroSerie.trim()) {
      setFeedback({ tipo: 'erro', msg: 'Informe o número de série da escada.' });
      return;
    }
    for (const co of comps) {
      if (!co.loteId) continue;
      const lote = lotes.find((l) => l.id === co.loteId);
      if (lote && lote.qtdDisponivel < co.qtdConsumida) {
        setFeedback({ tipo: 'erro', msg: `Saldo insuficiente no lote "${lote.nroLoteFornecedor}" de ${co.componente}. Disponível: ${lote.qtdDisponivel}.` });
        return;
      }
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const componentesDenorm = comps
        .filter((co) => co.loteId)
        .map((co) => {
          const l = lotes.find((x) => x.id === co.loteId);
          return {
            componente: co.componente,
            loteId: co.loteId,
            nroLoteFornecedor: l?.nroLoteFornecedor ?? '',
            fornecedor: l?.fornecedor ?? '',
            dataEntrada: l?.dataEntrada ?? '',
            qtdConsumida: co.qtdConsumida,
          };
        });
      const ordemRef = doc(collection(db, 'rastreabilidade_ordens'));
      batch.set(ordemRef, {
        nroSerie: nroSerie.trim(),
        dataProd,
        componentes: componentesDenorm,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      for (const co of comps) {
        if (!co.loteId) continue;
        const lote = lotes.find((l) => l.id === co.loteId);
        if (lote) {
          batch.update(doc(db, 'rastreabilidade_lotes', co.loteId), {
            qtdDisponivel: lote.qtdDisponivel - co.qtdConsumida,
          });
        }
      }
      await batch.commit();
      setFeedback({ tipo: 'ok', msg: `Ordem registrada — Escada ${nroSerie.trim()}` });
      setNroSerie('');
      setDataProd(today());
      setComps(COMPONENTES.map((c) => ({ componente: c, loteId: '', qtdConsumida: 1 })));
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const selecionados = comps.filter((c) => c.loteId).length;

  return (
    <Card>
      <SectionTitle icon={ClipboardList}>Registrar Montagem de Escada</SectionTitle>
      <Feedback feedback={feedback} />
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-6 border-b border-slate-100">
          <div>
            <Label>Nº de Série da Escada</Label>
            <Input value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} placeholder="Ex: ESC-2026-0001" />
          </div>
          <div>
            <Label>Data de Produção</Label>
            <Input type="date" value={dataProd} onChange={(e) => setDataProd(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Componentes e Lotes Utilizados</p>
            <Badge color={selecionados > 0 ? 'blue' : 'slate'}>{selecionados}/{COMPONENTES.length} vinculados</Badge>
          </div>
          <div className="space-y-2">
            {comps.map((co, idx) => {
              const disp = lotesDisponiveis(co.componente);
              return (
                <div key={co.componente} className={`grid grid-cols-12 items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${co.loteId ? 'bg-blue-50/60 border border-blue-100' : 'bg-slate-50 border border-transparent'}`}>
                  <div className="col-span-3 xl:col-span-2">
                    <p className="text-xs font-bold text-slate-700 leading-tight">{co.componente}</p>
                    {disp.length === 0 && <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Sem lote</p>}
                  </div>
                  <div className="col-span-7 xl:col-span-8">
                    <select value={co.loteId} onChange={(e) => setLote(idx, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition">
                      <option value="">— selecionar lote —</option>
                      {disp.map((l) => (
                        <option key={l.id} value={l.id}>{l.nroLoteFornecedor} · {l.fornecedor} · Disp: {l.qtdDisponivel}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 xl:col-span-2">
                    <input type="number" min="1" value={co.qtdConsumida} onChange={(e) => setQtd(idx, e.target.value)} disabled={!co.loteId} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-40 text-center" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
            <Plus size={15} /> {saving ? 'Salvando...' : 'Registrar Ordem'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// ─── Sub-tela 3: Consultar Escada ──────────────────────────────────────────────
function ConsultarEscada({ ordens }) {
  const [busca, setBusca]         = useState('');
  const [resultado, setResultado] = useState(null);
  const [buscou, setBuscou]       = useState(false);

  const buscar = () => {
    const t = busca.trim().toLowerCase();
    if (!t) return;
    setResultado(ordens.find((o) => o.nroSerie?.toLowerCase() === t && o.ativo) ?? null);
    setBuscou(true);
  };

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={Search}>Consulta de Rastreabilidade</SectionTitle>
        <div className="flex gap-3 max-w-xl">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Nº de série da escada..." />
          <button type="button" onClick={buscar} className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
            <Search size={14} /> Buscar
          </button>
        </div>
      </Card>
      {buscou && !resultado && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          <AlertTriangle size={18} className="shrink-0" />
          Nenhuma escada encontrada com o número de série <span className="font-black font-mono mx-1">"{busca.trim()}"</span>.
        </div>
      )}
      {resultado && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-5 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
                <Shield size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-0.5">Ficha de Rastreabilidade INMETRO</p>
                <h4 className="text-2xl font-black text-slate-900 tracking-tight">Escada {resultado.nroSerie}</h4>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge color="emerald">Rastreada</Badge>
              <p className="text-xs text-slate-400 font-mono">Produzida em {resultado.dataProd}</p>
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">
            Componentes utilizados — {(resultado.componentes ?? []).length} itens vinculados
          </p>
          {(resultado.componentes ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 italic">Nenhum componente vinculado a esta ordem.</p>
          ) : (
            <div className="space-y-2">
              {resultado.componentes.map((c, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <div className="col-span-3">
                    <p className="text-xs font-bold text-slate-800">{c.componente}</p>
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    <Hash size={12} className="text-slate-300 shrink-0" />
                    <span className="font-mono text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md truncate">{c.nroLoteFornecedor}</span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    <Building2 size={12} className="text-slate-300 shrink-0" />
                    <span className="text-xs text-slate-600 truncate">{c.fornecedor}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Calendar size={12} className="text-slate-300 shrink-0" />
                    <span className="text-xs font-mono text-slate-500">{c.dataEntrada}</span>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-xs font-black text-blue-600">{c.qtdConsumida}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Sub-tela 4: Exportar INMETRO ──────────────────────────────────────────────
function ExportarInmetro({ ordens }) {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [selecionados, setSel]      = useState(new Set());

  const filtradas = ordens.filter((o) => {
    if (!o.ativo) return false;
    if (dataInicio && o.dataProd < dataInicio) return false;
    if (dataFim   && o.dataProd > dataFim)     return false;
    return true;
  });

  const toggle    = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = ()   => setSel(selecionados.size === filtradas.length ? new Set() : new Set(filtradas.map((o) => o.id)));

  const exportar = () => {
    const alvos = filtradas.filter((o) => selecionados.has(o.id));
    if (!alvos.length) return;
    const rows = [];
    for (const ordem of alvos) {
      const cs = ordem.componentes ?? [];
      if (!cs.length) {
        rows.push({ 'Nº Série Escada': ordem.nroSerie, 'Data Produção': ordem.dataProd, Componente: '', 'Nº Lote Fornecedor': '', Fornecedor: '', 'Data Entrada Componente': '', 'Qtd Consumida': '' });
      } else {
        for (const c of cs) {
          rows.push({ 'Nº Série Escada': ordem.nroSerie, 'Data Produção': ordem.dataProd, Componente: c.componente, 'Nº Lote Fornecedor': c.nroLoteFornecedor, Fornecedor: c.fornecedor, 'Data Entrada Componente': c.dataEntrada, 'Qtd Consumida': c.qtdConsumida });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rastreabilidade');
    XLSX.writeFile(wb, `INMETRO_Rastreabilidade_${today()}.xlsx`);
  };

  return (
    <Card>
      <SectionTitle icon={Download}>Exportar para INMETRO</SectionTitle>
      <div className="flex flex-wrap items-end gap-4 mb-6 pb-6 border-b border-slate-100">
        <div>
          <Label>Data Inicial</Label>
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Data Final</Label>
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-44" />
        </div>
        <div className="flex-1" />
        <button type="button" onClick={exportar} disabled={selecionados.size === 0} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all shadow-sm hover:shadow-emerald-200 hover:shadow-md">
          <Download size={14} /> Exportar Excel{selecionados.size > 0 ? ` (${selecionados.size})` : ''}
        </button>
      </div>
      {filtradas.length === 0 ? (
        <div className="text-center py-12">
          <BoxSelect size={32} className="mx-auto mb-3 opacity-30 text-slate-400" />
          <p className="text-sm font-semibold text-slate-400">Nenhuma ordem no período selecionado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-2.5 px-3 text-left w-10">
                  <input type="checkbox" checked={selecionados.size === filtradas.length && filtradas.length > 0} onChange={toggleAll} className="rounded accent-blue-600" />
                </th>
                {['Nº Série', 'Data Produção', 'Componentes'].map((h) => (
                  <th key={h} className="text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtradas.map((o) => (
                <tr key={o.id} className={`hover:bg-slate-50 transition-colors cursor-pointer ${selecionados.has(o.id) ? 'bg-blue-50/40' : ''}`} onClick={() => toggle(o.id)}>
                  <td className="py-3 px-3">
                    <input type="checkbox" checked={selecionados.has(o.id)} onChange={() => toggle(o.id)} onClick={(e) => e.stopPropagation()} className="rounded accent-blue-600" />
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-800">{o.nroSerie}</td>
                  <td className="py-3 px-3 font-mono text-slate-500">{o.dataProd}</td>
                  <td className="py-3 px-3">
                    <Badge color={(o.componentes ?? []).length > 0 ? 'blue' : 'slate'}>{(o.componentes ?? []).length} comp.</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
const ABAS = [
  { id: 'lote',      label: 'Entrada de Lote',   icon: Package       },
  { id: 'ordem',     label: 'Ordem de Produção',  icon: ClipboardList },
  { id: 'consultar', label: 'Consultar Escada',   icon: Search        },
  { id: 'exportar',  label: 'Exportar INMETRO',   icon: Download      },
];

// ─── Dados mock ────────────────────────────────────────────────────────────────
const MOCK_LOTES = [
  { componente: 'MONT.',             nroNF: '100001', nroLoteFornecedor: 'LOT-MONT-001',  fornecedor: 'Metalúrgica Irmãos SA',   qtdRecebida: 500, qtdDisponivel: 500, dataEntrada: '2026-04-01' },
  { componente: 'TRAVESSA',          nroNF: '100001', nroLoteFornecedor: 'LOT-TRAV-001',  fornecedor: 'Metalúrgica Irmãos SA',   qtdRecebida: 500, qtdDisponivel: 500, dataEntrada: '2026-04-01' },
  { componente: 'PATAMAR',           nroNF: '100002', nroLoteFornecedor: 'LOT-PAT-001',   fornecedor: 'Peças & Cia Ltda',        qtdRecebida: 300, qtdDisponivel: 300, dataEntrada: '2026-04-05' },
  { componente: 'DEGRAU',            nroNF: '100002', nroLoteFornecedor: 'LOT-DEG-001',   fornecedor: 'Peças & Cia Ltda',        qtdRecebida: 600, qtdDisponivel: 600, dataEntrada: '2026-04-05' },
  { componente: 'ARTICULADOR',       nroNF: '100003', nroLoteFornecedor: 'LOT-ART-001',   fornecedor: 'Ferr. Sul Distribuidora', qtdRecebida: 400, qtdDisponivel: 400, dataEntrada: '2026-04-08' },
  { componente: 'DOBRADIÇA',         nroNF: '100003', nroLoteFornecedor: 'LOT-DOB-001',   fornecedor: 'Ferr. Sul Distribuidora', qtdRecebida: 400, qtdDisponivel: 400, dataEntrada: '2026-04-08' },
  { componente: 'ARAME SUST. PAT.',  nroNF: '100004', nroLoteFornecedor: 'LOT-ARAM-001',  fornecedor: 'Aço Brasil Comércio',     qtdRecebida: 1000,qtdDisponivel: 1000,dataEntrada: '2026-04-10' },
  { componente: 'REFORÇO MONT.',     nroNF: '100004', nroLoteFornecedor: 'LOT-REF-001',   fornecedor: 'Aço Brasil Comércio',     qtdRecebida: 500, qtdDisponivel: 500, dataEntrada: '2026-04-10' },
  { componente: 'ARRUELA LISA 3/16"',nroNF: '100005', nroLoteFornecedor: 'LOT-ARR-001',   fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 2000,qtdDisponivel: 2000,dataEntrada: '2026-04-12' },
  { componente: 'REBITE R-512A',     nroNF: '100005', nroLoteFornecedor: 'LOT-R512-001',  fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 5000,qtdDisponivel: 5000,dataEntrada: '2026-04-12' },
  { componente: 'REBITE R-519A',     nroNF: '100005', nroLoteFornecedor: 'LOT-R519-001',  fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 5000,qtdDisponivel: 5000,dataEntrada: '2026-04-12' },
  { componente: 'REBITE R-612',      nroNF: '100006', nroLoteFornecedor: 'LOT-R612-001',  fornecedor: 'Rebites & Fix. Ltda',     qtdRecebida: 3000,qtdDisponivel: 3000,dataEntrada: '2026-04-15' },
  { componente: 'CINTA SEG.',        nroNF: '100006', nroLoteFornecedor: 'LOT-CINTA-001', fornecedor: 'Rebites & Fix. Ltda',     qtdRecebida: 800, qtdDisponivel: 800, dataEntrada: '2026-04-15' },
];

const MOCK_ORDENS = [
  {
    nroSerie: 'ESC-2026-0001', dataProd: '2026-04-20',
    componentes: [
      { componente: 'MONT.',            nroLoteFornecedor: 'LOT-MONT-001',  fornecedor: 'Metalúrgica Irmãos SA',   dataEntrada: '2026-04-01', qtdConsumida: 2  },
      { componente: 'TRAVESSA',         nroLoteFornecedor: 'LOT-TRAV-001',  fornecedor: 'Metalúrgica Irmãos SA',   dataEntrada: '2026-04-01', qtdConsumida: 4  },
      { componente: 'PATAMAR',          nroLoteFornecedor: 'LOT-PAT-001',   fornecedor: 'Peças & Cia Ltda',        dataEntrada: '2026-04-05', qtdConsumida: 1  },
      { componente: 'DEGRAU',           nroLoteFornecedor: 'LOT-DEG-001',   fornecedor: 'Peças & Cia Ltda',        dataEntrada: '2026-04-05', qtdConsumida: 6  },
      { componente: 'ARTICULADOR',      nroLoteFornecedor: 'LOT-ART-001',   fornecedor: 'Ferr. Sul Distribuidora', dataEntrada: '2026-04-08', qtdConsumida: 2  },
      { componente: 'DOBRADIÇA',        nroLoteFornecedor: 'LOT-DOB-001',   fornecedor: 'Ferr. Sul Distribuidora', dataEntrada: '2026-04-08', qtdConsumida: 2  },
      { componente: 'REBITE R-512A',    nroLoteFornecedor: 'LOT-R512-001',  fornecedor: 'Fixadores Nacionais ME',  dataEntrada: '2026-04-12', qtdConsumida: 12 },
      { componente: 'REBITE R-519A',    nroLoteFornecedor: 'LOT-R519-001',  fornecedor: 'Fixadores Nacionais ME',  dataEntrada: '2026-04-12', qtdConsumida: 8  },
      { componente: 'CINTA SEG.',       nroLoteFornecedor: 'LOT-CINTA-001', fornecedor: 'Rebites & Fix. Ltda',     dataEntrada: '2026-04-15', qtdConsumida: 1  },
    ],
  },
  {
    nroSerie: 'ESC-2026-0002', dataProd: '2026-04-21',
    componentes: [
      { componente: 'MONT.',            nroLoteFornecedor: 'LOT-MONT-001',  fornecedor: 'Metalúrgica Irmãos SA',   dataEntrada: '2026-04-01', qtdConsumida: 2  },
      { componente: 'TRAVESSA',         nroLoteFornecedor: 'LOT-TRAV-001',  fornecedor: 'Metalúrgica Irmãos SA',   dataEntrada: '2026-04-01', qtdConsumida: 4  },
      { componente: 'DEGRAU',           nroLoteFornecedor: 'LOT-DEG-001',   fornecedor: 'Peças & Cia Ltda',        dataEntrada: '2026-04-05', qtdConsumida: 6  },
      { componente: 'ARTICULADOR',      nroLoteFornecedor: 'LOT-ART-001',   fornecedor: 'Ferr. Sul Distribuidora', dataEntrada: '2026-04-08', qtdConsumida: 2  },
      { componente: 'REBITE R-612',     nroLoteFornecedor: 'LOT-R612-001',  fornecedor: 'Rebites & Fix. Ltda',     dataEntrada: '2026-04-15', qtdConsumida: 10 },
      { componente: 'CINTA SEG.',       nroLoteFornecedor: 'LOT-CINTA-001', fornecedor: 'Rebites & Fix. Ltda',     dataEntrada: '2026-04-15', qtdConsumida: 1  },
    ],
  },
  {
    nroSerie: 'ESC-2026-0003', dataProd: '2026-04-22',
    componentes: [
      { componente: 'MONT.',            nroLoteFornecedor: 'LOT-MONT-001',  fornecedor: 'Metalúrgica Irmãos SA',   dataEntrada: '2026-04-01', qtdConsumida: 2  },
      { componente: 'PATAMAR',          nroLoteFornecedor: 'LOT-PAT-001',   fornecedor: 'Peças & Cia Ltda',        dataEntrada: '2026-04-05', qtdConsumida: 1  },
      { componente: 'DEGRAU',           nroLoteFornecedor: 'LOT-DEG-001',   fornecedor: 'Peças & Cia Ltda',        dataEntrada: '2026-04-05', qtdConsumida: 6  },
      { componente: 'DOBRADIÇA',        nroLoteFornecedor: 'LOT-DOB-001',   fornecedor: 'Ferr. Sul Distribuidora', dataEntrada: '2026-04-08', qtdConsumida: 2  },
      { componente: 'ARAME SUST. PAT.', nroLoteFornecedor: 'LOT-ARAM-001',  fornecedor: 'Aço Brasil Comércio',     dataEntrada: '2026-04-10', qtdConsumida: 3  },
      { componente: 'REBITE R-512A',    nroLoteFornecedor: 'LOT-R512-001',  fornecedor: 'Fixadores Nacionais ME',  dataEntrada: '2026-04-12', qtdConsumida: 12 },
      { componente: 'ARRUELA LISA 3/16"',nroLoteFornecedor:'LOT-ARR-001',   fornecedor: 'Fixadores Nacionais ME',  dataEntrada: '2026-04-12', qtdConsumida: 4  },
    ],
  },
];

async function seedMocks(setSeedStatus) {
  setSeedStatus('loading');
  try {
    const batch = writeBatch(db);
    const loteDocs = [];
    for (const l of MOCK_LOTES) {
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, { ...l, ativo: true, criadoEm: new Date().toISOString() });
      loteDocs.push({ ref: r, data: l });
    }
    for (const o of MOCK_ORDENS) {
      const r = doc(collection(db, 'rastreabilidade_ordens'));
      batch.set(r, { ...o, ativo: true, criadoEm: new Date().toISOString() });
    }
    await batch.commit();
    setSeedStatus('ok');
    setTimeout(() => setSeedStatus(null), 4000);
  } catch {
    setSeedStatus('erro');
    setTimeout(() => setSeedStatus(null), 4000);
  }
}

export default function Rastreabilidade() {
  const [subAba, setSubAba]       = useState('lote');
  const [lotes,  setLotes]        = useState([]);
  const [ordens, setOrdens]       = useState([]);
  const [seedStatus, setSeedStatus] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'rastreabilidade_lotes'),  orderBy('criadoEm', 'desc')),
      (s) => setLotes(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const u2 = onSnapshot(
      query(collection(db, 'rastreabilidade_ordens'), orderBy('criadoEm', 'desc')),
      (s) => setOrdens(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { u1(); u2(); };
  }, []);

  const lotesDisponiveis = useCallback(
    (componente) => lotes.filter((l) => l.componente === componente && l.ativo && l.qtdDisponivel > 0),
    [lotes],
  );

  const totalLotes  = lotes.filter((l) => l.ativo).length;
  const totalOrdens = ordens.filter((o) => o.ativo).length;

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-700">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner">
              <ScanLine size={28} className="text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Controle INMETRO — Produto Acabado</p>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">Rastreabilidade</h2>
              <p className="text-sm text-slate-400 mt-1 font-medium">
                Escadas — {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <button
              type="button"
              onClick={() => seedMocks(setSeedStatus)}
              disabled={seedStatus === 'loading'}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-all"
            >
              <FlaskConical size={13} />
              {seedStatus === 'loading' ? 'Carregando...' : seedStatus === 'ok' ? '✓ Mocks inseridos' : seedStatus === 'erro' ? '✗ Erro' : 'Inserir dados de teste'}
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-[320px]">
            {[
              { label: 'Lotes registrados',  value: totalLotes,         color: 'text-blue-200'    },
              { label: 'Escadas rastreadas', value: totalOrdens,        color: 'text-emerald-200' },
              { label: 'Componentes',        value: COMPONENTES.length, color: 'text-slate-200'   },
              { label: 'Auditoria',          value: '100%',             color: 'text-amber-300'   },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 font-bold">{label}</p>
                <p className={`text-2xl font-black mt-1.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>          </div>        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ABAS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setSubAba(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subAba === id ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      {subAba === 'lote'      && <EntradaLote lotes={lotes} />}
      {subAba === 'ordem'     && <OrdemProducao lotes={lotes} lotesDisponiveis={lotesDisponiveis} />}
      {subAba === 'consultar' && <ConsultarEscada ordens={ordens} />}
      {subAba === 'exportar'  && <ExportarInmetro ordens={ordens} />}
    </div>
  );
}
