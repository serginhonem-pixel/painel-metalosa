import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import BOM_ESCADAS from '../data/bomescada.json';
import ESCADA_JSON from '../data/escada.json';
import {
  collection,
  addDoc,
  query,
  orderBy,
  doc,
  onSnapshot,
  writeBatch,
  increment,
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
  FlaskConical,
  FileText,
  Award,
  BarChart3,
  ArrowUpDown,
  Layers,
  Warehouse,
  Cog,
} from 'lucide-react';

const MP_CODIGO = {
  'TUBO (11307)':       { label: 'TUBO RED 1"X1,20 ESC',           codigo: '11307' },
  'CHAPA 1,20 (81730)': { label: 'CH ACO 1,20 ESC',                  codigo: '81730' },
  'CHAPA 1,40 (81731)': { label: 'CH ACO BF 1,40 2,00X1,00 ESC',    codigo: '81731' },
  'ARAME (11308)':      { label: 'ARAME GALV 5,15MM ESC',            codigo: '11308' },
  'BARRA CHATA (11300)':{ label: 'BARRA CHATA 3/8"X1/8" ESC',       codigo: '11300' },
};

// Mapeamento: código do componente (PI) → chave de MP no estoque
const CODIGO_PARA_MP = {
  '81700': 'TUBO (11307)',        // MONT FRONTAL 3 DEG
  '81701': 'TUBO (11307)',        // MONT FRONTAL 4 DEG
  '81702': 'TUBO (11307)',        // MONT FRONTAL 5 DEG
  '81703': 'TUBO (11307)',        // MONT FRONTAL 6 DEG
  '81704': 'TUBO (11307)',        // MONT FRONTAL 7 DEG
  '81705': 'TUBO (11307)',        // MONT TRASEIRO 3 DEG
  '81706': 'TUBO (11307)',        // MONT TRASEIRO 4 DEG
  '81707': 'TUBO (11307)',        // MONT TRASEIRO 5 DEG
  '81708': 'TUBO (11307)',        // MONT TRASEIRO 6 DEG
  '81709': 'TUBO (11307)',        // MONT TRASEIRO 7 DEG
  '81710': 'TUBO (11307)',        // TRAVESSA
  '81711': 'CHAPA 1,20 (81730)', // PATAMAR
  '81712': 'CHAPA 1,20 (81730)', // DEGRAU
  '81714': 'CHAPA 1,20 (81730)', // DOBRADICA
  '81713': 'CHAPA 1,40 (81731)', // ARTICULADOR
  '81731': 'CHAPA 1,40 (81731)', // CHAPA 1,40 direto
  '81715': 'ARAME (11308)',       // ARAME SUST
  '81721': 'BARRA CHATA (11300)',// REFORCO MONT
};

// Mapeamento: código MP comprado → nome no estoque
const CODIGO_PARA_COMPRADO = {
  '11302': 'ARRUELA LISA 3/16"',
  '11303': 'REBITE R-512A',
  '11304': 'REBITE R-519A',
  '11305': 'REBITE R-612',
  '11306': 'CINTA DE SEGURANCA',
};

// Constrói listas de componentes a partir de um modelo do BOM
function buildCompsFromBom(modelo) {
  if (!modelo) return { fab: [], comp: [] };
  const fab = modelo.componentes_rastreados
    .filter((c) => c.tipo === 'PI' && CODIGO_PARA_MP[c.codigo])
    .map((c) => ({
      codigo: c.codigo,
      nome: c.descricao,
      mp: CODIGO_PARA_MP[c.codigo],
      loteId: '',
      qtdConsumida: c.quantidade_por_escada,
    }));
  const comp = modelo.componentes_rastreados
    .filter((c) => c.tipo === 'MP' && CODIGO_PARA_COMPRADO[c.codigo])
    .map((c) => ({
      nome: CODIGO_PARA_COMPRADO[c.codigo],
      codigo: c.codigo,
      loteId: '',
      qtdConsumida: c.quantidade_por_escada,
    }));
  return { fab, comp };
}

const COMP_COMPRADOS = [
  'ARRUELA LISA 3/16"',
  'REBITE R-512A',
  'REBITE R-519A',
  'REBITE R-612',
  'CINTA DE SEGURANCA',
];

const today = () => new Date().toISOString().split('T')[0];

function excelSerialToISO(serial) {
  if (!serial || isNaN(Number(serial))) return String(serial ?? '');
  const base = new Date(1899, 11, 30);
  base.setDate(base.getDate() + Number(serial));
  return base.toISOString().split('T')[0];
}

function Badge({ children, color = 'slate' }) {
  const map = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rose:    'bg-rose-100 text-rose-700 border-rose-200',
    amber:   'bg-amber-100 text-amber-700 border-amber-200',
    blue:    'bg-blue-100 text-blue-700 border-blue-200',
    slate:   'bg-slate-100 text-slate-600 border-slate-200',
    violet:  'bg-violet-100 text-violet-700 border-violet-200',
    cyan:    'bg-cyan-100 text-cyan-700 border-cyan-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${map[color] ?? map.slate}`}>
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

function EntradaLoteMP({ lotes }) {
  const [form, setForm] = useState({
    mp: Object.keys(MP_CODIGO)[0],
    danfe: '',
    nroLoteFornecedor: '',
    certificadoQualidade: '',
    fornecedor: '',
    qtdRecebida: '',
    qtdAprovada: '',
    qtdReprovada: '',
    pesoBrutoKg: '',
    pesoLiquidoKg: '',
    dataEntrada: today(),
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const percPerda =
    form.pesoBrutoKg && form.pesoLiquidoKg && Number(form.pesoBrutoKg) > 0
      ? (((Number(form.pesoBrutoKg) - Number(form.pesoLiquidoKg)) / Number(form.pesoBrutoKg)) * 100).toFixed(1)
      : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.danfe.trim() || !form.nroLoteFornecedor.trim() || !form.fornecedor.trim() || !form.qtdRecebida) {
      setFeedback({ tipo: 'erro', msg: 'Preencha todos os campos obrigatórios (DANFE, Lote, Fornecedor, Qtd).' });
      return;
    }
    setSaving(true);
    try {
      const qtdRec   = Number(form.qtdRecebida);
      const qtdAprov = form.qtdAprovada  ? Number(form.qtdAprovada)  : qtdRec;
      const qtdRep   = form.qtdReprovada ? Number(form.qtdReprovada) : 0;
      await addDoc(collection(db, 'rastreabilidade_lotes'), {
        tipo: 'MP',
        mp: form.mp,
        mpCodigo: MP_CODIGO[form.mp]?.codigo ?? '',
        danfe: form.danfe.trim(),
        nroLoteFornecedor: form.nroLoteFornecedor.trim(),
        certificadoQualidade: form.certificadoQualidade.trim(),
        fornecedor: form.fornecedor.trim(),
        qtdRecebida: qtdRec,
        qtdAprovada: qtdAprov,
        qtdReprovada: qtdRep,
        pesoBrutoKg:   form.pesoBrutoKg   ? Number(form.pesoBrutoKg)   : null,
        pesoLiquidoKg: form.pesoLiquidoKg ? Number(form.pesoLiquidoKg) : null,
        percPerda: percPerda ? Number(percPerda) : null,
        qtdDisponivel: qtdAprov,
        dataEntrada: form.dataEntrada,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: `Lote de ${MP_CODIGO[form.mp]?.label} registrado!` });
      setForm({
        mp: Object.keys(MP_CODIGO)[0], danfe: '', nroLoteFornecedor: '',
        certificadoQualidade: '', fornecedor: '',
        qtdRecebida: '', qtdAprovada: '', qtdReprovada: '',
        pesoBrutoKg: '', pesoLiquidoKg: '', dataEntrada: today(),
      });
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const lotesMP = lotes.filter((l) => l.tipo === 'MP' && l.ativo);
  const totalDisp = lotesMP.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Lotes de MP',    value: lotesMP.length, color: 'text-slate-900' },
          { label: 'Qtd disponivel', value: totalDisp,       color: 'text-emerald-600' },
          { label: 'Lotes zerados',  value: lotesMP.filter((l) => l.qtdDisponivel === 0).length, color: 'text-rose-500' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>
            <p className={`text-3xl font-black mt-2 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle icon={Package}>Recebimento de Materia-Prima</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Materia-Prima *</Label>
              <Select value={form.mp} onChange={(e) => set('mp', e.target.value)}>
                {Object.keys(MP_CODIGO).map((k) => <option key={k} value={k}>{MP_CODIGO[k].label}</option>)}
              </Select>
            </div>
            <div>
              <Label>DANFE / Numero Nota Fiscal *</Label>
              <Input value={form.danfe} onChange={(e) => set('danfe', e.target.value)} placeholder="Ex: 000123456" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Numero Lote do Fornecedor *</Label>
              <Input value={form.nroLoteFornecedor} onChange={(e) => set('nroLoteFornecedor', e.target.value)} placeholder="Ex: LOT-2026-001" />
            </div>
            <div>
              <Label>Certificado de Qualidade</Label>
              <Input value={form.certificadoQualidade} onChange={(e) => set('certificadoQualidade', e.target.value)} placeholder="Ex: CERT-2026-XYZ" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Fornecedor *</Label>
              <Input value={form.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} placeholder="Razao social" />
            </div>
            <div>
              <Label>Data de Entrada *</Label>
              <Input type="date" value={form.dataEntrada} onChange={(e) => set('dataEntrada', e.target.value)} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
              <BarChart3 size={13} /> Metricas de Producao / Recebimento
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label>Qtd Recebida *</Label>
                <Input type="number" min="1" value={form.qtdRecebida} onChange={(e) => set('qtdRecebida', e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label>Qtd Aprovada</Label>
                <Input type="number" min="0" value={form.qtdAprovada} onChange={(e) => set('qtdAprovada', e.target.value)} placeholder="= Recebida" />
              </div>
              <div>
                <Label>Qtd Reprovada</Label>
                <Input type="number" min="0" value={form.qtdReprovada} onChange={(e) => set('qtdReprovada', e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label>Peso Bruto (kg)</Label>
                <Input type="number" step="0.01" min="0" value={form.pesoBrutoKg} onChange={(e) => set('pesoBrutoKg', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Peso Liquido (kg)</Label>
                <Input type="number" step="0.01" min="0" value={form.pesoLiquidoKg} onChange={(e) => set('pesoLiquidoKg', e.target.value)} placeholder="0,00" />
              </div>
              <div className="flex flex-col justify-end">
                <Label>% Perda (calc.)</Label>
                <div className={`rounded-xl px-3.5 py-2.5 text-sm font-black border ${percPerda !== null ? (Number(percPerda) > 5 ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                  {percPerda !== null ? `${percPerda}%` : '--'}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
              <Plus size={15} /> {saving ? 'Salvando...' : 'Registrar Lote'}
            </button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Historico de Lotes de MP</p>
          <Badge color={lotesMP.length > 0 ? 'blue' : 'slate'}>{lotesMP.length} registros</Badge>
        </div>
        {lotesMP.length === 0 ? (
          <div className="text-center py-12 text-slate-300">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-slate-400">Nenhum lote registrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[820px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['MP', 'DANFE', 'Lote Forn.', 'Cert. Qual.', 'Fornecedor', 'Receb.', 'Aprov.', 'Reprov.', '% Perda', 'Disponivel', 'Entrada'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lotesMP.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">{MP_CODIGO[l.mp]?.label ?? l.mp}</td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{l.danfe || '--'}</span></td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{l.nroLoteFornecedor}</span></td>
                    <td className="py-3 px-2">
                      {l.certificadoQualidade
                        ? <span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{l.certificadoQualidade}</span>
                        : <span className="text-slate-300">--</span>}
                    </td>
                    <td className="py-3 px-2 text-slate-600 whitespace-nowrap">{l.fornecedor}</td>
                    <td className="py-3 px-2 text-slate-500 text-right">{l.qtdRecebida}</td>
                    <td className="py-3 px-2 text-right"><span className="text-emerald-600 font-bold">{l.qtdAprovada ?? '--'}</span></td>
                    <td className="py-3 px-2 text-right"><span className={l.qtdReprovada > 0 ? 'text-rose-500 font-bold' : 'text-slate-300'}>{l.qtdReprovada ?? '--'}</span></td>
                    <td className="py-3 px-2 text-right">
                      {l.percPerda !== null && l.percPerda !== undefined
                        ? <span className={l.percPerda > 5 ? 'text-rose-500 font-bold' : 'text-slate-500'}>{l.percPerda}%</span>
                        : <span className="text-slate-300">--</span>}
                    </td>
                    <td className="py-3 px-2 text-right"><span className={`font-black ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span></td>
                    <td className="py-3 px-2 text-slate-500 font-mono whitespace-nowrap">{excelSerialToISO(l.dataEntrada)}</td>
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

// ---------- MAPA DE PIs -----------------------------------------------
const LOTES_PI_MAP = Object.fromEntries(
  (ESCADA_JSON.lotes_PI ?? []).map((p) => [p.codigo_pi, p.descricao_pi])
);

// ---------- PRODUCAO DE PI --------------------------------------------
function ProducaoPI({ lotes }) {
  const piOpcoes = ESCADA_JSON.lotes_PI ?? [];

  const [codigoPi, setCodigoPi]     = useState(piOpcoes[0]?.codigo_pi ?? '');
  const [nroOP, setNroOP]           = useState('');
  const [dataProd, setDataProd]     = useState(today());
  const [qtdProduzida, setQtdProd]  = useState('');
  const [qtdAprovada, setQtdAprov]  = useState('');
  const [qtdReprovada, setQtdRep]   = useState('');
  // consumo de MP: array de { loteId, qtdConsumida }
  const [consumoMp, setConsumoMp]   = useState([{ loteId: '', qtdConsumida: '' }]);
  const [saving, setSaving]         = useState(false);
  const [feedback, setFeedback]     = useState(null);

  const piSel    = piOpcoes.find((p) => p.codigo_pi === codigoPi);
  const mpKey    = piSel?.mp_key ?? '';
  const mpDisp   = lotes.filter((l) => l.tipo === 'MP' && l.mp === mpKey && l.ativo && l.qtdDisponivel > 0)
                        .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada)); // FIFO order for display

  const addLinhaMp    = () => setConsumoMp((p) => [...p, { loteId: '', qtdConsumida: '' }]);
  const removeLinhaMp = (i) => setConsumoMp((p) => p.filter((_, idx) => idx !== i));
  const setLinhaMp    = (i, k, v) => setConsumoMp((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const aprov = Number(qtdAprovada || qtdProduzida);
    if (!codigoPi || !aprov) {
      setFeedback({ tipo: 'erro', msg: 'Informe o PI e a quantidade aprovada.' });
      return;
    }
    const linhasValidas = consumoMp.filter((r) => r.loteId && r.qtdConsumida);
    for (const r of linhasValidas) {
      const lote = lotes.find((l) => l.id === r.loteId);
      if (lote && lote.qtdDisponivel < Number(r.qtdConsumida)) {
        setFeedback({ tipo: 'erro', msg: `Saldo insuficiente no lote "${lote.nroLoteFornecedor}". Disponivel: ${lote.qtdDisponivel}.` });
        return;
      }
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      // Gera lote PI
      const loteRef = doc(collection(db, 'rastreabilidade_lotes'));
      const mpLotesConsumidos = linhasValidas.map((r) => {
        const l = lotes.find((x) => x.id === r.loteId);
        return {
          loteId: r.loteId,
          nroLoteFornecedor: l?.nroLoteFornecedor ?? '',
          danfe: l?.danfe ?? '',
          certificadoQualidade: l?.certificadoQualidade ?? '',
          fornecedor: l?.fornecedor ?? '',
          dataEntrada: l?.dataEntrada ?? '',
          mpKey,
          qtdConsumida: Number(r.qtdConsumida),
        };
      });
      batch.set(loteRef, {
        tipo: 'PI',
        codigoPi,
        descricaoPi: LOTES_PI_MAP[codigoPi] ?? codigoPi,
        mpKey,
        mpCodigo: MP_CODIGO[mpKey]?.codigo ?? '',
        nroOP: nroOP.trim(),
        qtdProduzida: Number(qtdProduzida || qtdAprovada),
        qtdAprovada: aprov,
        qtdReprovada: Number(qtdReprovada || 0),
        qtdDisponivel: aprov,
        mpLotesConsumidos,
        dataEntrada: dataProd,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      // Desconta MP consumida
      for (const r of linhasValidas) {
        batch.update(doc(db, 'rastreabilidade_lotes', r.loteId), {
          qtdDisponivel: increment(-Number(r.qtdConsumida)),
        });
      }
      await batch.commit();
      setFeedback({ tipo: 'ok', msg: `Lote de PI (${codigoPi}) registrado — ${aprov} pcs aprovadas.` });
      setNroOP(''); setQtdProd(''); setQtdAprov(''); setQtdRep('');
      setConsumoMp([{ loteId: '', qtdConsumida: '' }]);
      setDataProd(today());
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const lotesPi = lotes.filter((l) => l.tipo === 'PI' && l.ativo);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={Cog}>Registrar Producao de PI (Produto Intermediario)</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-violet-100 bg-violet-50/40 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label>Produto Intermediario (PI) *</Label>
                <Select value={codigoPi} onChange={(e) => { setCodigoPi(e.target.value); setConsumoMp([{ loteId: '', qtdConsumida: '' }]); }}>
                  {piOpcoes.map((p) => (
                    <option key={p.codigo_pi} value={p.codigo_pi}>{p.codigo_pi} — {p.descricao_pi}</option>
                  ))}
                </Select>
                {mpKey && <p className="text-[10px] text-violet-600 font-bold mt-1.5 uppercase tracking-widest">MP: {mpKey}</p>}
              </div>
              <div>
                <Label>Numero da OP</Label>
                <Input value={nroOP} onChange={(e) => setNroOP(e.target.value)} placeholder="Ex: OP-2026-0001" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Data de Producao</Label>
              <Input type="date" value={dataProd} onChange={(e) => setDataProd(e.target.value)} />
            </div>
            <div>
              <Label>Qtd Produzida</Label>
              <Input type="number" min="1" value={qtdProduzida} onChange={(e) => setQtdProd(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Qtd Aprovada *</Label>
              <Input type="number" min="1" value={qtdAprovada} onChange={(e) => setQtdAprov(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Qtd Reprovada</Label>
              <Input type="number" min="0" value={qtdReprovada} onChange={(e) => setQtdRep(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Consumo de MP ({MP_CODIGO[mpKey]?.label ?? mpKey})</p>
              <button type="button" onClick={addLinhaMp} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-600 hover:text-violet-700 transition">
                <Plus size={11} /> Adicionar lote
              </button>
            </div>
            {consumoMp.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-7">
                  <select value={r.loteId} onChange={(e) => setLinhaMp(i, 'loteId', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-violet-500 transition">
                    <option value="">-- selecionar lote de MP --</option>
                    {mpDisp.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nroLoteFornecedor} | DANFE {l.danfe} | {l.fornecedor} | Disp: {l.qtdDisponivel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <Input type="number" min="1" value={r.qtdConsumida} onChange={(e) => setLinhaMp(i, 'qtdConsumida', e.target.value)} placeholder="Qtd consumida" disabled={!r.loteId} />
                </div>
                <div className="col-span-2 flex justify-end">
                  {consumoMp.length > 1 && (
                    <button type="button" onClick={() => removeLinhaMp(i)} className="text-rose-400 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest transition">Remover</button>
                  )}
                </div>
              </div>
            ))}
            {mpDisp.length === 0 && (
              <p className="text-xs text-amber-600 font-semibold">Sem lotes de MP disponivel para {mpKey}. Registre o recebimento primeiro.</p>
            )}
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-500 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-violet-200 hover:shadow-md">
              <Plus size={15} /> {saving ? 'Salvando...' : 'Registrar Producao de PI'}
            </button>
          </div>
        </form>
      </Card>
      {lotesPi.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Lotes de PI em Estoque</p>
            <Badge color="violet">{lotesPi.length} lotes</Badge>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['PI', 'Codigo', 'OP', 'Aprovadas', 'Reprovadas', 'Disponivel', 'MP Origem', 'Data'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lotesPi.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">{l.descricaoPi}</td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{l.codigoPi}</span></td>
                    <td className="py-3 px-2 font-mono text-slate-500">{l.nroOP || '--'}</td>
                    <td className="py-3 px-2 text-right text-emerald-600 font-bold">{l.qtdAprovada}</td>
                    <td className="py-3 px-2 text-right"><span className={l.qtdReprovada > 0 ? 'text-rose-500 font-bold' : 'text-slate-300'}>{l.qtdReprovada ?? 0}</span></td>
                    <td className="py-3 px-2 text-right"><span className={`font-black ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span></td>
                    <td className="py-3 px-2 text-slate-500">{MP_CODIGO[l.mpKey]?.label ?? l.mpKey}</td>
                    <td className="py-3 px-2 font-mono text-slate-500 whitespace-nowrap">{excelSerialToISO(l.dataEntrada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- ORDEM DE PRODUCAO (consome lotes PI via FIFO) -------------
function OrdemProducao({ lotes }) {
  const modelos = BOM_ESCADAS.bom_escadas_rastreados;

  const [modeloCod, setModeloCod] = useState('');
  const [nroOP, setNroOP]         = useState('');
  const [nroSerie, setNroSerie]   = useState('');
  const [dataProd, setDataProd]   = useState(today());
  const [compFab, setCompFab]     = useState([]);
  const [comprado, setComprado]   = useState([]);
  const [saving, setSaving]       = useState(false);
  const [feedback, setFeedback]   = useState(null);

  // Retorna lotes PI disponíveis para um código de PI, ordenados FIFO
  const piDisponiveis = (codigoPi) =>
    lotes
      .filter((l) => l.tipo === 'PI' && l.codigoPi === codigoPi && l.ativo && l.qtdDisponivel > 0)
      .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));

  // Ao trocar o modelo, reconstrói listas com FIFO automático para PI
  const handleModelo = (cod) => {
    setModeloCod(cod);
    const modelo = modelos.find((m) => m.codigo_produto === cod);
    const { fab, comp } = buildCompsFromBom(modelo);
    // Pré-seleciona lote PI mais antigo disponível (FIFO)
    const fabComFifo = fab.map((c) => {
      const fifo = lotes
        .filter((l) => l.tipo === 'PI' && l.codigoPi === c.codigo && l.ativo && l.qtdDisponivel > 0)
        .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));
      return { ...c, loteId: fifo[0]?.id ?? '' };
    });
    setCompFab(fabComFifo);
    setComprado(comp);
  };

  const setLoteFab  = (idx, loteId) => setCompFab((prev)  => prev.map((c, i) => i === idx ? { ...c, loteId } : c));
  const setQtdFab   = (idx, qtd)    => setCompFab((prev)  => prev.map((c, i) => i === idx ? { ...c, qtdConsumida: Number(qtd) } : c));
  const setLoteComp = (idx, loteId) => setComprado((prev) => prev.map((c, i) => i === idx ? { ...c, loteId } : c));
  const setQtdComp  = (idx, qtd)    => setComprado((prev) => prev.map((c, i) => i === idx ? { ...c, qtdConsumida: Number(qtd) } : c));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nroSerie.trim()) {
      setFeedback({ tipo: 'erro', msg: 'Informe o numero de serie da escada.' });
      return;
    }
    for (const cf of compFab) {
      if (!cf.loteId) continue;
      const lote = lotes.find((l) => l.id === cf.loteId);
      if (lote && lote.qtdDisponivel < cf.qtdConsumida) {
        setFeedback({ tipo: 'erro', msg: `Saldo insuficiente no lote de PI "${lote.descricaoPi ?? lote.nroLoteFornecedor}". Disponivel: ${lote.qtdDisponivel}.` });
        return;
      }
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const compsFab = compFab
        .filter((cf) => cf.loteId)
        .map((cf) => {
          const l = lotes.find((x) => x.id === cf.loteId);
          // Rastreabilidade completa: PI → MP de origem
          const mpOrigem = l?.mpLotesConsumidos?.[0] ?? {};
          return {
            componente: cf.nome,
            codigoComp: cf.codigo,
            tipoPeca: 'PI',
            // Dados do lote PI
            lotePiId: cf.loteId,
            codigoPi: l?.codigoPi ?? cf.codigo,
            descricaoPi: l?.descricaoPi ?? cf.nome,
            // Dados da MP de origem (rastreabilidade)
            mp: l?.mpKey ?? cf.mp,
            mpCodigo: l?.mpCodigo ?? MP_CODIGO[cf.mp]?.codigo ?? '',
            danfe: mpOrigem.danfe ?? '',
            certificadoQualidade: mpOrigem.certificadoQualidade ?? '',
            nroLoteFornecedor: mpOrigem.nroLoteFornecedor ?? '',
            fornecedor: mpOrigem.fornecedor ?? '',
            dataEntrada: mpOrigem.dataEntrada ?? '',
            mpLotesConsumidos: l?.mpLotesConsumidos ?? [],
            qtdConsumida: cf.qtdConsumida,
          };
        });
      const compsComp = comprado
        .filter((c) => c.loteId)
        .map((c) => {
          const l = lotes.find((x) => x.id === c.loteId);
          return {
            componente: c.nome,
            tipo: 'COMPRADO',
            loteId: c.loteId,
            nroLoteFornecedor: l?.nroLoteFornecedor ?? '',
            danfe: l?.danfe ?? '',
            certificadoQualidade: l?.certificadoQualidade ?? '',
            fornecedor: l?.fornecedor ?? '',
            dataEntrada: l?.dataEntrada ?? '',
            qtdConsumida: c.qtdConsumida,
          };
        });
      const ordemRef = doc(collection(db, 'rastreabilidade_ordens'));
      batch.set(ordemRef, {
        nroOP: nroOP.trim(),
        nroSerie: nroSerie.trim(),
        dataProd,
        componentesFabricados: compsFab,
        componentesComprados: compsComp,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      for (const cf of compFab) {
        if (!cf.loteId) continue;
        batch.update(doc(db, 'rastreabilidade_lotes', cf.loteId), {
          qtdDisponivel: increment(-cf.qtdConsumida),
        });
      }
      for (const c of comprado) {
        if (!c.loteId) continue;
        batch.update(doc(db, 'rastreabilidade_lotes', c.loteId), {
          qtdDisponivel: increment(-c.qtdConsumida),
        });
      }
      await batch.commit();
      setFeedback({ tipo: 'ok', msg: `Ordem registrada — Escada ${nroSerie.trim()}` });
      setNroOP(''); setNroSerie(''); setDataProd(today());
      const modelo = modelos.find((m) => m.codigo_produto === modeloCod);
      const { fab, comp } = buildCompsFromBom(modelo);
      const fabComFifo = fab.map((c) => {
        const fifo = lotes
          .filter((l) => l.tipo === 'PI' && l.codigoPi === c.codigo && l.ativo && l.qtdDisponivel > 0)
          .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));
        return { ...c, loteId: fifo[0]?.id ?? '' };
      });
      setCompFab(fabComFifo);
      setComprado(comp.map((c) => ({ ...c, loteId: '' })));
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const vinculadosFab  = compFab.filter((c) => c.loteId).length;
  const vinculadosComp = comprado.filter((c) => c.loteId).length;
  const modeloSel      = modelos.find((m) => m.codigo_produto === modeloCod);

  return (
    <Card>
      <SectionTitle icon={ClipboardList}>Registrar Montagem de Escada</SectionTitle>
      <Feedback feedback={feedback} />
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border-2 border-blue-100 bg-blue-50/40 p-5">
          <Label>Modelo da Escada (BOM) *</Label>
          <Select value={modeloCod} onChange={(e) => handleModelo(e.target.value)}>
            <option value="">-- selecione o modelo --</option>
            {modelos.map((m) => (
              <option key={m.codigo_produto} value={m.codigo_produto}>
                {m.codigo_produto} — {m.descricao}
              </option>
            ))}
          </Select>
          {modeloSel && (
            <p className="text-[10px] text-blue-600 font-bold mt-2 uppercase tracking-widest">
              BOM carregado: {compFab.length} fabricados + {comprado.length} comprados — FIFO pre-selecionado
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-6 border-b border-slate-100">
          <div>
            <Label>Numero da OP</Label>
            <Input value={nroOP} onChange={(e) => setNroOP(e.target.value)} placeholder="Ex: OP-2026-0001" />
          </div>
          <div>
            <Label>Numero de Serie da Escada *</Label>
            <Input value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} placeholder="Ex: ESC-2026-0001" />
          </div>
          <div>
            <Label>Data de Producao</Label>
            <Input type="date" value={dataProd} onChange={(e) => setDataProd(e.target.value)} />
          </div>
        </div>
        <div>
          {!modeloCod && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              <AlertTriangle size={14} /> Selecione o modelo da escada acima para carregar os componentes do BOM.
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Componentes Fabricados — Lotes PI (FIFO)</p>
            <Badge color={vinculadosFab > 0 ? 'blue' : 'slate'}>{vinculadosFab}/{compFab.length} vinculados</Badge>
          </div>
          <div className="space-y-2">
            {compFab.map((cf, idx) => {
              const disp = piDisponiveis(cf.codigo);
              return (
                <div key={cf.codigo} className={`grid grid-cols-12 items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${cf.loteId ? 'bg-blue-50/60 border border-blue-100' : 'bg-slate-50 border border-transparent'}`}>
                  <div className="col-span-3">
                    <p className="text-xs font-bold text-slate-700 leading-tight">{cf.nome}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">PI {cf.codigo}</p>
                    {disp.length === 0 && <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Sem lote PI — produza antes</p>}
                  </div>
                  <div className="col-span-7">
                    <select value={cf.loteId} onChange={(e) => setLoteFab(idx, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition">
                      <option value="">-- lote PI (FIFO) --</option>
                      {disp.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nroOP ? `OP ${l.nroOP} | ` : ''}{l.dataEntrada} | Disp: {l.qtdDisponivel} pcs
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" min="1" value={cf.qtdConsumida} onChange={(e) => setQtdFab(idx, e.target.value)} disabled={!cf.loteId} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-40 text-center" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Componentes Comprados</p>
            <Badge color={vinculadosComp > 0 ? 'cyan' : 'slate'}>{vinculadosComp}/{comprado.length} vinculados</Badge>
          </div>
          <div className="space-y-2">
            {comprado.map((c, idx) => {
              const disp = lotes.filter((l) => l.tipo === 'COMPRADO' && l.nomeComp === c.nome && l.ativo && l.qtdDisponivel > 0)
                                .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));
              return (
                <div key={c.nome} className={`grid grid-cols-12 items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${c.loteId ? 'bg-cyan-50/60 border border-cyan-100' : 'bg-slate-50 border border-transparent'}`}>
                  <div className="col-span-3">
                    <p className="text-xs font-bold text-slate-700 leading-tight">{c.nome}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Comprado</p>
                    {disp.length === 0 && <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Sem lote</p>}
                  </div>
                  <div className="col-span-7">
                    <select value={c.loteId} onChange={(e) => setLoteComp(idx, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition">
                      <option value="">-- selecionar lote --</option>
                      {disp.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nroLoteFornecedor} | DANFE {l.danfe} | {l.fornecedor} | Disp: {l.qtdDisponivel}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" min="1" value={c.qtdConsumida} onChange={(e) => setQtdComp(idx, e.target.value)} disabled={!c.loteId} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-40 text-center" />
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

function ConsultarEscada({ ordens }) {
  const [busca, setBusca]               = useState('');
  const [resultado, setResultado]       = useState(null);
  const [buscou, setBuscou]             = useState(false);
  const [modo, setModo]                 = useState('serie');
  const [estornando, setEstornando]     = useState(false);
  const [feedbackEstorno, setFeedbackEstorno] = useState(null);
  const [confirmEstorno, setConfirmEstorno]   = useState(false);

  const buscar = () => {
    const t = busca.trim().toLowerCase();
    if (!t) return;
    let found = null;
    if (modo === 'serie') {
      found = ordens.find((o) => o.nroSerie?.toLowerCase() === t && o.ativo) ?? null;
    } else {
      found = ordens.find((o) => o.nroOP?.toLowerCase() === t && o.ativo) ?? null;
    }
    setResultado(found);
    setBuscou(true);
    setConfirmEstorno(false);
    setFeedbackEstorno(null);
  };

  const estornar = async () => {
    if (!resultado) return;
    setEstornando(true);
    try {
      const batch = writeBatch(db);
      for (const c of resultado.componentesFabricados ?? []) {
        if (!c.loteId || !c.qtdConsumida) continue;
        batch.update(doc(db, 'rastreabilidade_lotes', c.loteId), {
          qtdDisponivel: increment(+c.qtdConsumida),
        });
      }
      for (const c of resultado.componentesComprados ?? []) {
        if (!c.loteId || !c.qtdConsumida) continue;
        batch.update(doc(db, 'rastreabilidade_lotes', c.loteId), {
          qtdDisponivel: increment(+c.qtdConsumida),
        });
      }
      batch.update(doc(db, 'rastreabilidade_ordens', resultado.id), { ativo: false });
      await batch.commit();
      setFeedbackEstorno({ tipo: 'ok', msg: `Ordem da escada ${resultado.nroSerie} estornada. Saldos restaurados.` });
      setResultado(null);
      setBuscou(false);
      setBusca('');
    } catch {
      setFeedbackEstorno({ tipo: 'erro', msg: 'Erro ao estornar. Tente novamente.' });
    } finally {
      setEstornando(false);
      setConfirmEstorno(false);
      setTimeout(() => setFeedbackEstorno(null), 5000);
    }
  };

  const allComps = resultado
    ? [...(resultado.componentesFabricados ?? []), ...(resultado.componentesComprados ?? [])]
    : [];

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={Search}>Consulta de Rastreabilidade</SectionTitle>
        <div className="flex gap-2 mb-4">
          {[{ id: 'serie', label: 'Nr de Serie' }, { id: 'op', label: 'Nr da OP' }].map((m) => (
            <button key={m.id} type="button" onClick={() => { setModo(m.id); setResultado(null); setBuscou(false); setBusca(''); }}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${modo === m.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 max-w-xl">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder={modo === 'serie' ? 'Nr de serie da escada...' : 'Nr da OP...'} />
          <button type="button" onClick={buscar} className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
            <Search size={14} /> Buscar
          </button>
        </div>
      </Card>
      {feedbackEstorno && (
        <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold ${feedbackEstorno.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {feedbackEstorno.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
          {feedbackEstorno.msg}
        </div>
      )}
      {buscou && !resultado && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          <AlertTriangle size={18} className="shrink-0" />
          Nenhum registro encontrado para <span className="font-black font-mono mx-1">"{busca.trim()}"</span>.
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
                {resultado.nroOP && <p className="text-xs text-slate-400 font-mono mt-0.5">OP: {resultado.nroOP}</p>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge color="emerald">Rastreada</Badge>
              <p className="text-xs text-slate-400 font-mono">Produzida em {excelSerialToISO(resultado.dataProd)}</p>
              {!confirmEstorno ? (
                <button
                  type="button"
                  onClick={() => setConfirmEstorno(true)}
                  className="mt-1 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600 transition hover:bg-rose-100"
                >
                  <AlertTriangle size={11} /> Estornar Ordem
                </button>
              ) : (
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2">
                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-wide">Confirmar estorno?</span>
                  <button
                    type="button"
                    onClick={estornar}
                    disabled={estornando}
                    className="rounded-lg bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white hover:bg-rose-500 disabled:opacity-60 transition"
                  >
                    {estornando ? 'Estornando...' : 'Sim'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmEstorno(false)}
                    className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-300 transition"
                  >
                    Nao
                  </button>
                </div>
              )}
            </div>
          </div>
          {(resultado.componentesFabricados ?? []).length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 flex items-center gap-2">
                <Layers size={12} /> Componentes Fabricados - rastreados pela MP
              </p>
              <div className="space-y-2">
                {(resultado.componentesFabricados ?? []).map((c, i) => (
                  <div key={i} className="grid grid-cols-12 items-start gap-2 bg-blue-50/40 border border-blue-100 rounded-2xl px-4 py-3">
                    <div className="col-span-3">
                      <p className="text-xs font-bold text-slate-800">{c.componente}</p>
                      <p className="text-[10px] text-slate-400">MP: {MP_CODIGO[c.mp]?.label ?? c.mp}</p>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <FileText size={11} className="text-amber-400 shrink-0" />
                      <span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{c.danfe || '--'}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Award size={11} className="text-violet-400 shrink-0" />
                      <span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{c.certificadoQualidade || '--'}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Hash size={11} className="text-slate-300 shrink-0" />
                      <span className="font-mono text-xs text-slate-600 truncate">{c.nroLoteFornecedor}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Building2 size={11} className="text-slate-300 shrink-0" />
                      <span className="text-xs text-slate-600 truncate">{c.fornecedor}</span>
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-xs font-black text-blue-600">{c.qtdConsumida}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(resultado.componentesComprados ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 flex items-center gap-2">
                <Package size={12} /> Componentes Comprados
              </p>
              <div className="space-y-2">
                {(resultado.componentesComprados ?? []).map((c, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 bg-slate-50 rounded-2xl px-4 py-3">
                    <div className="col-span-3">
                      <p className="text-xs font-bold text-slate-800">{c.componente}</p>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <FileText size={11} className="text-amber-400 shrink-0" />
                      <span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{c.danfe || '--'}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Award size={11} className="text-violet-400 shrink-0" />
                      <span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{c.certificadoQualidade || '--'}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Hash size={11} className="text-slate-300 shrink-0" />
                      <span className="font-mono text-xs text-slate-600 truncate">{c.nroLoteFornecedor}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Building2 size={11} className="text-slate-300 shrink-0" />
                      <span className="text-xs text-slate-600 truncate">{c.fornecedor}</span>
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-xs font-black text-slate-600">{c.qtdConsumida}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {allComps.length === 0 && (
            <p className="text-sm text-slate-400 italic">Nenhum componente vinculado a esta ordem.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function ExportarInmetro({ ordens }) {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [selecionados, setSel]      = useState(new Set());

  const filtradas = ordens.filter((o) => {
    if (!o.ativo) return false;
    const d = excelSerialToISO(o.dataProd);
    if (dataInicio && d < dataInicio) return false;
    if (dataFim    && d > dataFim)    return false;
    return true;
  });

  const toggle    = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = ()   => setSel(selecionados.size === filtradas.length ? new Set() : new Set(filtradas.map((o) => o.id)));

  const exportar = () => {
    const alvos = filtradas.filter((o) => selecionados.has(o.id));
    if (!alvos.length) return;
    const rows = [];
    for (const ordem of alvos) {
      const fab  = ordem.componentesFabricados ?? [];
      const comp = ordem.componentesComprados  ?? [];
      const todos = [...fab, ...comp];
      if (!todos.length) {
        rows.push({ 'OP': ordem.nroOP ?? '', 'Nr Serie Escada': ordem.nroSerie, 'Data Producao': excelSerialToISO(ordem.dataProd), 'Tipo': '', 'Componente': '', 'MP': '', 'Cod MP': '', 'DANFE': '', 'Cert Qualidade': '', 'Lote Fornecedor': '', 'Fornecedor': '', 'Data Entrada': '', 'Qtd Consumida': '' });
      } else {
        for (const c of todos) {
          rows.push({
            'OP': ordem.nroOP ?? '',
            'Nr Serie Escada': ordem.nroSerie,
            'Data Producao': excelSerialToISO(ordem.dataProd),
            'Tipo': c.tipo === 'COMPRADO' ? 'Comprado' : 'Fabricado',
            'Componente': c.componente,
            'MP': c.mp ?? '',
            'Cod MP': c.mpCodigo ?? '',
            'DANFE': c.danfe ?? '',
            'Cert Qualidade': c.certificadoQualidade ?? '',
            'Lote Fornecedor': c.nroLoteFornecedor,
            'Fornecedor': c.fornecedor,
            'Data Entrada': excelSerialToISO(c.dataEntrada),
            'Qtd Consumida': c.qtdConsumida,
          });
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
          <Download size={32} className="mx-auto mb-3 opacity-30 text-slate-400" />
          <p className="text-sm font-semibold text-slate-400">Nenhuma ordem no periodo selecionado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-2.5 px-3 text-left w-10">
                  <input type="checkbox" checked={selecionados.size === filtradas.length && filtradas.length > 0} onChange={toggleAll} className="rounded accent-blue-600" />
                </th>
                {['OP', 'Nr Serie', 'Data Producao', 'Fab.', 'Comp.'].map((h) => (
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
                  <td className="py-3 px-3 font-mono text-slate-500">{o.nroOP || '--'}</td>
                  <td className="py-3 px-3 font-bold text-slate-800">{o.nroSerie}</td>
                  <td className="py-3 px-3 font-mono text-slate-500">{excelSerialToISO(o.dataProd)}</td>
                  <td className="py-3 px-3"><Badge color="blue">{(o.componentesFabricados ?? []).length}</Badge></td>
                  <td className="py-3 px-3"><Badge color="cyan">{(o.componentesComprados ?? []).length}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const MOCK_LOTES_MP = [
  { tipo: 'MP', mp: 'TUBO (11307)',       mpCodigo: '11307', danfe: '000100001', nroLoteFornecedor: 'LOT-TUBO-001',  certificadoQualidade: 'CERT-T-001',  fornecedor: 'Metalurgica Irmaos SA',   qtdRecebida: 500,  qtdAprovada: 490, qtdReprovada: 10, pesoBrutoKg: 2500, pesoLiquidoKg: 2450, percPerda: 2.0, qtdDisponivel: 490, dataEntrada: '2026-04-01' },
  { tipo: 'MP', mp: 'CHAPA 1,20 (81730)', mpCodigo: '81730', danfe: '000100002', nroLoteFornecedor: 'LOT-CH120-001', certificadoQualidade: 'CERT-C1-001', fornecedor: 'Aco Brasil Comercio',     qtdRecebida: 300,  qtdAprovada: 295, qtdReprovada: 5,  pesoBrutoKg: 1800, pesoLiquidoKg: 1740, percPerda: 3.3, qtdDisponivel: 295, dataEntrada: '2026-04-03' },
  { tipo: 'MP', mp: 'CHAPA 1,40 (81731)', mpCodigo: '81731', danfe: '000100002', nroLoteFornecedor: 'LOT-CH140-001', certificadoQualidade: 'CERT-C2-001', fornecedor: 'Aco Brasil Comercio',     qtdRecebida: 200,  qtdAprovada: 200, qtdReprovada: 0,  pesoBrutoKg: 1400, pesoLiquidoKg: 1380, percPerda: 1.4, qtdDisponivel: 200, dataEntrada: '2026-04-03' },
  { tipo: 'MP', mp: 'ARAME (11308)',       mpCodigo: '11308', danfe: '000100003', nroLoteFornecedor: 'LOT-ARAM-001',  certificadoQualidade: '',             fornecedor: 'Ferr. Sul Distribuidora', qtdRecebida: 1000, qtdAprovada: 1000,qtdReprovada: 0,  pesoBrutoKg: 500,  pesoLiquidoKg: 498,  percPerda: 0.4, qtdDisponivel: 1000,dataEntrada: '2026-04-05' },
  { tipo: 'MP', mp: 'BARRA CHATA (11300)', mpCodigo: '11300', danfe: '000100004', nroLoteFornecedor: 'LOT-BC-001',    certificadoQualidade: 'CERT-BC-001', fornecedor: 'Pecas e Cia Ltda',        qtdRecebida: 400,  qtdAprovada: 395, qtdReprovada: 5,  pesoBrutoKg: 800,  pesoLiquidoKg: 792,  percPerda: 1.0, qtdDisponivel: 395, dataEntrada: '2026-04-07' },
];

const MOCK_LOTES_COMPRADOS = [
  { tipo: 'COMPRADO', nomeComp: 'ARRUELA LISA 3/16"', danfe: '000200001', nroLoteFornecedor: 'LOT-ARR-001',   certificadoQualidade: '',             fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 2000, qtdAprovada: 2000, qtdReprovada: 0, qtdDisponivel: 2000, dataEntrada: '2026-04-10' },
  { tipo: 'COMPRADO', nomeComp: 'REBITE R-512A',       danfe: '000200001', nroLoteFornecedor: 'LOT-R512-001',  certificadoQualidade: '',             fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 5000, qtdAprovada: 5000, qtdReprovada: 0, qtdDisponivel: 5000, dataEntrada: '2026-04-10' },
  { tipo: 'COMPRADO', nomeComp: 'REBITE R-519A',       danfe: '000200001', nroLoteFornecedor: 'LOT-R519-001',  certificadoQualidade: '',             fornecedor: 'Fixadores Nacionais ME',  qtdRecebida: 5000, qtdAprovada: 5000, qtdReprovada: 0, qtdDisponivel: 5000, dataEntrada: '2026-04-10' },
  { tipo: 'COMPRADO', nomeComp: 'REBITE R-612',        danfe: '000200002', nroLoteFornecedor: 'LOT-R612-001',  certificadoQualidade: '',             fornecedor: 'Rebites e Fix. Ltda',     qtdRecebida: 3000, qtdAprovada: 3000, qtdReprovada: 0, qtdDisponivel: 3000, dataEntrada: '2026-04-12' },
  { tipo: 'COMPRADO', nomeComp: 'CINTA DE SEGURANCA',  danfe: '000200003', nroLoteFornecedor: 'LOT-CINTA-001', certificadoQualidade: 'CERT-CIN-001', fornecedor: 'Rebites e Fix. Ltda',     qtdRecebida: 800,  qtdAprovada: 800,  qtdReprovada: 0, qtdDisponivel: 800,  dataEntrada: '2026-04-12' },
];

async function seedFromEscadaJson(setStatus) {
  setStatus('loading');
  try {
    const batch = writeBatch(db);

    // Seção A: Matérias-Primas
    for (const mp of ESCADA_JSON.rastreabilidade_mp) {
      for (const l of mp.lotes) {
        const r = doc(collection(db, 'rastreabilidade_lotes'));
        batch.set(r, {
          tipo: 'MP',
          mp: mp.mp_key,
          mpCodigo: mp.codigo_mp,
          nroLoteFornecedor: l.lote,
          danfe: l.danfe ?? '',
          certificadoQualidade: l.certificado ?? '',
          fornecedor: l.fornecedor ?? '',
          qtdRecebida: l.qtd_recebida ?? 0,
          qtdAprovada: l.qtd_aprovada ?? 0,
          qtdReprovada: l.qtd_reprovada ?? 0,
          pesoBrutoKg: l.kg_bruto ?? null,
          pesoLiquidoKg: l.kg_liquido ?? null,
          percPerda: l.perc_perda ?? null,
          qtdDisponivel: l.saldo_pcs ?? l.qtd_aprovada ?? 0,
          dataEntrada: l.data_iso ?? '',
          ativo: true,
          criadoEm: new Date().toISOString(),
        });
      }
    }

    // Seção C: Componentes Comprados
    for (const item of ESCADA_JSON.estoque_componentes_comprados) {
      for (const l of item.lotes) {
        const r = doc(collection(db, 'rastreabilidade_lotes'));
        batch.set(r, {
          tipo: 'COMPRADO',
          nomeComp: item.nome_controle,
          codigo: item.codigo,
          danfe: l.danfe ?? '',
          nroLoteFornecedor: l.lote,
          certificadoQualidade: '',
          fornecedor: l.fornecedor ?? '',
          qtdRecebida: l.qtd_recebida ?? 0,
          qtdAprovada: l.qtd_aprovada ?? 0,
          qtdReprovada: 0,
          qtdDisponivel: l.qtd_aprovada ?? 0,
          dataEntrada: l.data_iso ?? '',
          ativo: true,
          criadoEm: new Date().toISOString(),
        });
      }
    }

    await batch.commit();
    setStatus('ok');
    setTimeout(() => setStatus(null), 4000);
  } catch {
    setStatus('erro');
    setTimeout(() => setStatus(null), 4000);
  }
}

async function seedMocks(setSeedStatus) {
  setSeedStatus('loading');
  try {
    const batch = writeBatch(db);
    for (const l of MOCK_LOTES_MP) {
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, { ...l, ativo: true, criadoEm: new Date().toISOString() });
    }
    for (const l of MOCK_LOTES_COMPRADOS) {
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, { ...l, ativo: true, criadoEm: new Date().toISOString() });
    }
    await batch.commit();
    setSeedStatus('ok');
    setTimeout(() => setSeedStatus(null), 4000);
  } catch {
    setSeedStatus('erro');
    setTimeout(() => setSeedStatus(null), 4000);
  }
}

function EntradaLoteComprado({ lotes }) {
  const [form, setForm] = useState({
    codigo: Object.keys(CODIGO_PARA_COMPRADO)[0],
    danfe: '',
    nroLoteFornecedor: '',
    certificadoQualidade: '',
    fornecedor: '',
    qtdRecebida: '',
    qtdAprovada: '',
    qtdReprovada: '',
    dataEntrada: today(),
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.danfe.trim() || !form.nroLoteFornecedor.trim() || !form.fornecedor.trim() || !form.qtdRecebida) {
      setFeedback({ tipo: 'erro', msg: 'Preencha todos os campos obrigatorios (DANFE, Lote, Fornecedor, Qtd).' });
      return;
    }
    setSaving(true);
    try {
      const qtdRec   = Number(form.qtdRecebida);
      const qtdAprov = form.qtdAprovada  ? Number(form.qtdAprovada)  : qtdRec;
      const qtdRep   = form.qtdReprovada ? Number(form.qtdReprovada) : 0;
      await addDoc(collection(db, 'rastreabilidade_lotes'), {
        tipo: 'COMPRADO',
        nomeComp: CODIGO_PARA_COMPRADO[form.codigo],
        codigo: form.codigo,
        danfe: form.danfe.trim(),
        nroLoteFornecedor: form.nroLoteFornecedor.trim(),
        certificadoQualidade: form.certificadoQualidade.trim(),
        fornecedor: form.fornecedor.trim(),
        qtdRecebida: qtdRec,
        qtdAprovada: qtdAprov,
        qtdReprovada: qtdRep,
        qtdDisponivel: qtdAprov,
        dataEntrada: form.dataEntrada,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: `Lote de ${CODIGO_PARA_COMPRADO[form.codigo]} registrado!` });
      setForm({
        codigo: Object.keys(CODIGO_PARA_COMPRADO)[0], danfe: '', nroLoteFornecedor: '',
        certificadoQualidade: '', fornecedor: '',
        qtdRecebida: '', qtdAprovada: '', qtdReprovada: '', dataEntrada: today(),
      });
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const lotesComp = lotes.filter((l) => l.tipo === 'COMPRADO' && l.ativo);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={Package}>Recebimento de Componentes Comprados</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Componente *</Label>
              <Select value={form.codigo} onChange={(e) => set('codigo', e.target.value)}>
                {Object.entries(CODIGO_PARA_COMPRADO).map(([cod, nome]) => (
                  <option key={cod} value={cod}>{cod} — {nome}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>DANFE / Numero Nota Fiscal *</Label>
              <Input value={form.danfe} onChange={(e) => set('danfe', e.target.value)} placeholder="Ex: 000123456" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Numero Lote do Fornecedor *</Label>
              <Input value={form.nroLoteFornecedor} onChange={(e) => set('nroLoteFornecedor', e.target.value)} placeholder="Ex: LOT-2026-001" />
            </div>
            <div>
              <Label>Certificado de Qualidade</Label>
              <Input value={form.certificadoQualidade} onChange={(e) => set('certificadoQualidade', e.target.value)} placeholder="Ex: CERT-2026-XYZ" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Fornecedor *</Label>
              <Input value={form.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} placeholder="Razao social" />
            </div>
            <div>
              <Label>Data de Entrada *</Label>
              <Input type="date" value={form.dataEntrada} onChange={(e) => set('dataEntrada', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Qtd Recebida *</Label>
              <Input type="number" min="1" value={form.qtdRecebida} onChange={(e) => set('qtdRecebida', e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Qtd Aprovada</Label>
              <Input type="number" min="0" value={form.qtdAprovada} onChange={(e) => set('qtdAprovada', e.target.value)} placeholder="= Recebida" />
            </div>
            <div>
              <Label>Qtd Reprovada</Label>
              <Input type="number" min="0" value={form.qtdReprovada} onChange={(e) => set('qtdReprovada', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-cyan-200 hover:shadow-md">
              <Plus size={15} /> {saving ? 'Salvando...' : 'Registrar Lote Comprado'}
            </button>
          </div>
        </form>
      </Card>
      {lotesComp.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Historico de Componentes Comprados</p>
            <Badge color="cyan">{lotesComp.length} registros</Badge>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Componente', 'Codigo', 'DANFE', 'Lote Forn.', 'Cert. Qual.', 'Fornecedor', 'Receb.', 'Aprov.', 'Disponivel', 'Entrada'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lotesComp.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">{l.nomeComp}</td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{l.codigo || '--'}</span></td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{l.danfe || '--'}</span></td>
                    <td className="py-3 px-2"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{l.nroLoteFornecedor}</span></td>
                    <td className="py-3 px-2">
                      {l.certificadoQualidade
                        ? <span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{l.certificadoQualidade}</span>
                        : <span className="text-slate-300">--</span>}
                    </td>
                    <td className="py-3 px-2 text-slate-600 whitespace-nowrap">{l.fornecedor}</td>
                    <td className="py-3 px-2 text-slate-500 text-right">{l.qtdRecebida}</td>
                    <td className="py-3 px-2 text-right"><span className="text-emerald-600 font-bold">{l.qtdAprovada ?? '--'}</span></td>
                    <td className="py-3 px-2 text-right"><span className={`font-black ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span></td>
                    <td className="py-3 px-2 text-slate-500 font-mono whitespace-nowrap">{excelSerialToISO(l.dataEntrada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function EstoqueAtual({ lotes }) {
  const ativos = lotes.filter((l) => l.ativo);

  // Agrupar MP por chave de material
  const gruposMp = Object.keys(MP_CODIGO).map((mpKey) => {
    const lotesDaMp = ativos.filter((l) => l.tipo === 'MP' && l.mp === mpKey);
    const totalDisp = lotesDaMp.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);
    const totalRec  = lotesDaMp.reduce((s, l) => s + (l.qtdRecebida  ?? 0), 0);
    return { mpKey, label: MP_CODIGO[mpKey].label, codigo: MP_CODIGO[mpKey].codigo, lotes: lotesDaMp, totalDisp, totalRec };
  }).filter((g) => g.lotes.length > 0);

  // Agrupar Comprados por nome
  const nomesComp = [...new Set(ativos.filter((l) => l.tipo === 'COMPRADO').map((l) => l.nomeComp))].sort();
  const gruposComp = nomesComp.map((nome) => {
    const ls = ativos.filter((l) => l.tipo === 'COMPRADO' && l.nomeComp === nome);
    const totalDisp = ls.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);
    const totalRec  = ls.reduce((s, l) => s + (l.qtdRecebida  ?? 0), 0);
    return { nome, lotes: ls, totalDisp, totalRec };
  });

  const semLotes = gruposMp.length === 0 && gruposComp.length === 0;

  return (
    <div className="space-y-5">
      {semLotes && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          <AlertTriangle size={18} className="shrink-0" />
          Nenhum lote cadastrado ainda. Clique em <strong>"Dados de teste"</strong> no topo para inserir exemplos, ou registre lotes na aba <strong>Entrada de MP</strong>.
        </div>
      )}

      {/* Estoque PI */}
      {(() => {
        const lotesPi = ativos.filter((l) => l.tipo === 'PI');
        if (lotesPi.length === 0) return null;
        const gruposPi = [...new Set(lotesPi.map((l) => l.codigoPi))].sort().map((cod) => {
          const ls = lotesPi.filter((l) => l.codigoPi === cod);
          return { cod, descricao: ls[0]?.descricaoPi ?? cod, lotes: ls, totalDisp: ls.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0) };
        });
        return (
          <Card>
            <SectionTitle icon={Cog}>Produtos Intermediarios (PI) em Estoque</SectionTitle>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    {['PI', 'Codigo', 'Lotes', 'Saldo Disponivel', 'Status'].map((h) => (
                      <th key={h} className="text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gruposPi.map((g) => (
                    <tr key={g.cod} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-black text-slate-800">{g.descricao}</td>
                      <td className="py-3 px-3"><span className="font-mono text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-md">{g.cod}</span></td>
                      <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                      <td className="py-3 px-3 text-right"><span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 10 ? 'text-amber-500' : 'text-emerald-600'}`}>{g.totalDisp.toLocaleString('pt-BR')}</span></td>
                      <td className="py-3 px-3">{g.totalDisp === 0 ? <Badge color="rose">Zerado</Badge> : g.totalDisp < 10 ? <Badge color="amber">Baixo</Badge> : <Badge color="emerald">OK</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}

      {gruposMp.length > 0 && (
        <Card>
          <SectionTitle icon={Package}>Materia-Prima (MP)</SectionTitle>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Material', 'Codigo', 'Lotes', 'Qtd Recebida', 'Saldo Disponivel', 'Status'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gruposMp.map((g) => (
                  <tr key={g.mpKey} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-black text-slate-800">{g.label}</td>
                    <td className="py-3 px-3"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{g.codigo}</span></td>
                    <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                    <td className="py-3 px-3 text-slate-600 text-right">{g.totalRec.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 50 ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {g.totalDisp.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {g.totalDisp === 0
                        ? <Badge color="rose">Zerado</Badge>
                        : g.totalDisp < 50
                        ? <Badge color="amber">Baixo</Badge>
                        : <Badge color="emerald">OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-1">
            {gruposMp.map((g) =>
              g.lotes.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-2 text-xs">
                  <span className="font-bold text-slate-600 w-24 shrink-0">{g.label}</span>
                  <span className="font-mono text-slate-400">{l.nroLoteFornecedor}</span>
                  <span className="text-slate-400">DANFE {l.danfe || '--'}</span>
                  <span className="text-slate-400">{l.fornecedor}</span>
                  <span className="ml-auto font-black text-sm" style={{ color: l.qtdDisponivel === 0 ? '#ef4444' : '#059669' }}>{l.qtdDisponivel}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {gruposComp.length > 0 && (
        <Card>
          <SectionTitle icon={Layers}>Componentes Comprados</SectionTitle>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Componente', 'Lotes', 'Qtd Recebida', 'Saldo Disponivel', 'Status'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gruposComp.map((g) => (
                  <tr key={g.nome} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-black text-slate-800">{g.nome}</td>
                    <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                    <td className="py-3 px-3 text-slate-600 text-right">{g.totalRec.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 100 ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {g.totalDisp.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {g.totalDisp === 0
                        ? <Badge color="rose">Zerado</Badge>
                        : g.totalDisp < 100
                        ? <Badge color="amber">Baixo</Badge>
                        : <Badge color="emerald">OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-1">
            {gruposComp.map((g) =>
              g.lotes.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-2 text-xs">
                  <span className="font-bold text-slate-600 w-36 shrink-0 truncate">{g.nome}</span>
                  <span className="font-mono text-slate-400">{l.nroLoteFornecedor}</span>
                  <span className="text-slate-400">DANFE {l.danfe || '--'}</span>
                  <span className="text-slate-400">{l.fornecedor}</span>
                  <span className="ml-auto font-black text-sm" style={{ color: l.qtdDisponivel === 0 ? '#ef4444' : '#059669' }}>{l.qtdDisponivel}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

const ABAS = [
  { id: 'estoque',   label: 'Estoque',             icon: Warehouse     },
  { id: 'lote',      label: 'Entrada de Lotes',     icon: Package       },
  { id: 'producaopi',label: 'Producao de PI',       icon: Cog           },
  { id: 'ordem',     label: 'Ordem de Producao',   icon: ClipboardList },
  { id: 'consultar', label: 'Rastreabilidade',     icon: ArrowUpDown   },
  { id: 'exportar',  label: 'Exportar INMETRO',    icon: Download      },
];

const SENHA_ACESSO = 'escada';

function TelaLogin({ onLogin }) {
  const [senha, setSenha]   = useState('');
  const [erro, setErro]     = useState(false);
  const [vis, setVis]       = useState(false);

  const tentar = (e) => {
    e.preventDefault();
    if (senha === SENHA_ACESSO) {
      onLogin();
    } else {
      setErro(true);
      setSenha('');
      setTimeout(() => setErro(false), 2500);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 mb-6">
              <ScanLine size={26} className="text-blue-300" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-1">Acesso Restrito</p>
            <h2 className="text-2xl font-black text-white tracking-tight mb-1">Rastreabilidade</h2>
            <p className="text-slate-500 text-xs mb-7">Insira a senha para acessar este modulo.</p>
            <form onSubmit={tentar} className="space-y-4">
              <div className="relative">
                <input
                  type={vis ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Senha de acesso"
                  autoFocus
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 transition placeholder-slate-500 pr-12 ${erro ? 'border-rose-500 focus:ring-rose-500/40' : 'border-white/10 focus:ring-blue-500/40 focus:border-blue-500/50'}`}
                />
                <button type="button" onClick={() => setVis((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition text-xs font-bold select-none">
                  {vis ? 'OCULTAR' : 'VER'}
                </button>
              </div>
              {erro && (
                <div className="flex items-center gap-2 text-xs text-rose-400 font-semibold">
                  <AlertTriangle size={13} /> Senha incorreta. Tente novamente.
                </div>
              )}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-all shadow-sm hover:shadow-blue-500/20 hover:shadow-md">
                Entrar
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Rastreabilidade() {
  const [autenticado, setAutenticado]   = useState(false);
  const [subAba, setSubAba]             = useState('estoque');
  const [lotes,  setLotes]              = useState([]);
  const [ordens, setOrdens]             = useState([]);
  const [seedStatus, setSeedStatus]         = useState(null);
  const [importStatus, setImportStatus]     = useState(null);

  useEffect(() => {
    if (!autenticado) return;
    const u1 = onSnapshot(
      query(collection(db, 'rastreabilidade_lotes'),  orderBy('criadoEm', 'desc')),
      (s) => setLotes(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const u2 = onSnapshot(
      query(collection(db, 'rastreabilidade_ordens'), orderBy('criadoEm', 'desc')),
      (s) => setOrdens(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { u1(); u2(); };
  }, [autenticado]);

  const lotesDisponiveisMp = useCallback(
    (mpKey) => lotes.filter((l) => l.tipo === 'MP' && l.mp === mpKey && l.ativo && l.qtdDisponivel > 0),
    [lotes],
  );

  const totalLotesMP = lotes.filter((l) => l.tipo === 'MP' && l.ativo).length;
  const totalOrdens  = ordens.filter((o) => o.ativo).length;
  const totalComps   = lotes.filter((l) => l.tipo === 'COMPRADO' && l.ativo).length;
  const totalPI      = lotes.filter((l) => l.tipo === 'PI' && l.ativo).length;

  if (!autenticado) return <TelaLogin onLogin={() => setAutenticado(true)} />;

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
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Controle INMETRO - Produto Acabado</p>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">Rastreabilidade</h2>
              <p className="text-slate-400 text-sm mt-1">MP para Componentes para Escada - DANFE + Certificado de Qualidade</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {[
              { label: 'Lotes de MP',     value: totalLotesMP },
              { label: 'Lotes PI',        value: totalPI      },
              { label: 'Escadas',         value: totalOrdens  },
              { label: 'Lotes Comprados', value: totalComps   },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">{label}</p>
              </div>
            ))}
            <button
              type="button"
              disabled={importStatus === 'loading'}
              onClick={() => seedFromEscadaJson(setImportStatus)}
              className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-600/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-blue-300 transition hover:bg-blue-600/20 disabled:opacity-50"
            >
              <FileText size={14} />
              {importStatus === 'loading' ? 'Importando...' : importStatus === 'ok' ? 'Importado!' : importStatus === 'erro' ? 'Erro' : 'Importar escada.json'}
            </button>
            <button
              type="button"
              disabled={seedStatus === 'loading'}
              onClick={() => seedMocks(setSeedStatus)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <FlaskConical size={14} />
              {seedStatus === 'loading' ? 'Inserindo...' : seedStatus === 'ok' ? 'Inserido' : seedStatus === 'erro' ? 'Erro' : 'Dados de teste'}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {ABAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubAba(id)}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${subAba === id ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {subAba === 'estoque'    && <EstoqueAtual lotes={lotes} />}
      {subAba === 'lote'       && <div className="space-y-8"><EntradaLoteMP lotes={lotes} /><EntradaLoteComprado lotes={lotes} /></div>}
      {subAba === 'producaopi' && <ProducaoPI lotes={lotes} />}
      {subAba === 'ordem'      && <OrdemProducao lotes={lotes} />}
      {subAba === 'consultar'  && <ConsultarEscada ordens={ordens} />}
      {subAba === 'exportar'   && <ExportarInmetro ordens={ordens} />}
    </div>
  );
}
