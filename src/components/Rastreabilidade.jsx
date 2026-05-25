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
  getDocs,
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
  SlidersHorizontal,
  PackagePlus,
  Truck,
  X,
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
  '11306': 'FITA POLIPROPILENO 25MM',
  '40201': 'ETIQUETA INMETRO',
  '40202': 'ETIQUETA IDENTIFICACAO',
  '40203': 'PONTEIRA DE PLASTICO',
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
  'FITA POLIPROPILENO 25MM',
  'ETIQUETA INMETRO',
  'ETIQUETA IDENTIFICACAO',
  'PONTEIRA DE PLASTICO',
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

function Tooltip({ text, children }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 rounded-2xl bg-slate-900 text-white text-[11px] font-medium px-4 py-3 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-2xl border border-white/10">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
      </div>
    </div>
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
    origemTubo: 'comprado', // 'comprado' | 'producao'
    nroOPTubo: '',
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
  const handleMpChange = (v) => setForm((p) => ({ ...p, mp: v, origemTubo: 'comprado', nroOPTubo: '' }));

  const isProducao = form.origemTubo === 'producao';
  const danfeLabel = isProducao ? 'DANFE da Materia-Prima Mae *'     : 'DANFE / Numero Nota Fiscal *';
  const loteLabel  = isProducao ? 'Lote da MP Mae'                   : 'Numero Lote do Fornecedor *';
  const certLabel  = isProducao ? 'Certificado da MP Mae (Usina)'    : 'Certificado de Qualidade';
  const fornLabel  = isProducao ? 'Fornecedor da MP Mae *'           : 'Fornecedor *';

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
        origemTubo: form.origemTubo,
        ...(isProducao && form.nroOPTubo.trim() && { nroOPTubo: form.nroOPTubo.trim() }),
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
        mp: Object.keys(MP_CODIGO)[0], origemTubo: 'comprado', nroOPTubo: '',
        danfe: '', nroLoteFornecedor: '',
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
              <Select value={form.mp} onChange={(e) => handleMpChange(e.target.value)}>
                {Object.keys(MP_CODIGO).map((k) => <option key={k} value={k}>{MP_CODIGO[k].label}</option>)}
              </Select>
            </div>
            <div>
              <Label>{danfeLabel}</Label>
              <Input value={form.danfe} onChange={(e) => set('danfe', e.target.value)} placeholder="Ex: 000123456" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-blue-100 bg-blue-50/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Origem:</p>
              {[{v:'comprado',label:'Comprado (por NF)'},{v:'producao',label:'Produzido aqui'}].map(({v,label})=>(
                <button key={v} type="button" onClick={() => set('origemTubo', v)}
                  className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${form.origemTubo===v ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-blue-200 text-blue-500 hover:bg-blue-50'}`}>
                  {label}
                </button>
              ))}
              {isProducao && <p className="w-full text-[10px] text-blue-500 font-semibold mt-0.5">Informe os dados da materia-prima mae + a OP interna que gerou este material.</p>}
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>{loteLabel}</Label>
              <Input value={form.nroLoteFornecedor} onChange={(e) => set('nroLoteFornecedor', e.target.value)} placeholder="Ex: LOT-2026-001" />
            </div>
            <div>
              <Label>{certLabel}</Label>
              <Input value={form.certificadoQualidade} onChange={(e) => set('certificadoQualidade', e.target.value)} placeholder="Ex: CERT-2026-XYZ" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>{fornLabel}</Label>
              <Input value={form.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} placeholder="Razao social" />
            </div>
            <div>
              <Label>Data de {isProducao ? 'Producao' : 'Entrada'} *</Label>
              <Input type="date" value={form.dataEntrada} onChange={(e) => set('dataEntrada', e.target.value)} />
            </div>
          </div>
          {isProducao && (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
              <Label>OP de Producao *</Label>
              <Input value={form.nroOPTubo} onChange={(e) => set('nroOPTubo', e.target.value)} placeholder="Ex: OP-2026-0001" />
              <p className="text-[10px] text-violet-500 font-semibold mt-1.5">Numero da ordem interna que transformou a MP mae neste material.</p>
            </div>
          )}
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
                  <tr key={l.id} className="row-hover transition-colors">
                    <td className="py-3 px-2 whitespace-nowrap">
                      <p className="font-bold text-slate-800">{MP_CODIGO[l.mp]?.label ?? l.mp}</p>
                      {l.origemTubo === 'producao' && <span className="text-[9px] font-black uppercase tracking-widest bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded mt-0.5 inline-block">Produzido aqui</span>}
                      {l.origemTubo === 'comprado' && <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">Comprado</span>}
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-mono text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{l.danfe || '--'}</span>
                      {l.nroOPTubo && <p className="text-[10px] font-mono text-violet-500 mt-0.5">OP {l.nroOPTubo}</p>}
                    </td>
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
                  <tr key={l.id} className="row-hover transition-colors">
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

function ConsultarEscada({ ordens, lotes = [], saidas = [] }) {
  const [busca, setBusca]               = useState('');
  const [resultado, setResultado]       = useState(null);
  const [buscou, setBuscou]             = useState(false);
  const [modo, setModo]                 = useState('serie');
  const [estornando, setEstornando]     = useState(false);
  const [feedbackEstorno, setFeedbackEstorno] = useState(null);
  const [confirmEstorno, setConfirmEstorno]   = useState(false);
  const [filtroLista, setFiltroLista]         = useState('');
  const [loteIdSel, setLoteIdSel]             = useState('');
  const [resultadosLote, setResultadosLote]   = useState([]);

  const buscar = () => {
    if (modo === 'lote') {
      if (!loteIdSel) return;
      const lote = lotes.find((l) => l.id === loteIdSel);
      if (!lote) { setResultadosLote([]); setResultado(null); setBuscou(true); return; }
      let found = [];
      if (lote.tipo === 'MP') {
        found = ordens.filter((o) => o.ativo &&
          (o.componentesFabricados ?? []).some((c) =>
            (c.mpLotesConsumidos ?? []).some((m) => m.loteId === loteIdSel)
          )
        );
      } else if (lote.tipo === 'PI') {
        found = ordens.filter((o) => o.ativo &&
          (o.componentesFabricados ?? []).some((c) => c.lotePiId === loteIdSel)
        );
      } else if (lote.tipo === 'COMPRADO') {
        found = ordens.filter((o) => o.ativo &&
          (o.componentesComprados ?? []).some((c) => c.loteId === loteIdSel)
        );
      }
      setResultadosLote(found);
      setResultado(null);
      setBuscou(true);
      setConfirmEstorno(false);
      setFeedbackEstorno(null);
      return;
    }
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

  const saidaVinculada = resultado
    ? saidas.find((s) => s.ativo && (s.numerosSerieVinculados ?? []).includes(resultado.nroSerie))
    : null;

  const ordensAtivas = ordens.filter((o) => o.ativo);
  const ordensFiltradas = ordensAtivas.filter((o) => {
    const q = filtroLista.toLowerCase();
    return !q || o.nroSerie?.toLowerCase().includes(q) || o.nroOP?.toLowerCase().includes(q) || o.descricaoModelo?.toLowerCase().includes(q);
  });

  const selecionar = (o) => {
    setResultado(o);
    setBuscou(true);
    setConfirmEstorno(false);
    setFeedbackEstorno(null);
    setBusca(o.nroSerie ?? '');
  };

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={Search}>Consulta de Rastreabilidade</SectionTitle>
        <div className="flex gap-2 mb-4 flex-wrap">
          {[{ id: 'serie', label: 'Nr de Serie' }, { id: 'op', label: 'Nr da OP' }, { id: 'lote', label: 'Por Lote (Recall)' }].map((m) => (
            <button key={m.id} type="button" onClick={() => { setModo(m.id); setResultado(null); setBuscou(false); setBusca(''); setLoteIdSel(''); setResultadosLote([]); }}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${modo === m.id ? (m.id === 'lote' ? 'bg-rose-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm') : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {m.label}
            </button>
          ))}
        </div>
        {modo === 'lote' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              <AlertTriangle size={13} className="shrink-0" />
              Selecione um lote para ver todas as escadas fabricadas com ele — identifica unidades afetadas em situação de recall.
            </div>
            <div className="flex gap-3 max-w-2xl">
              <select value={loteIdSel} onChange={(e) => setLoteIdSel(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition">
                <option value="">-- selecionar lote de material --</option>
                {(() => {
                  const ativos = lotes.filter((l) => l.ativo);
                  const mp   = ativos.filter((l) => l.tipo === 'MP');
                  const pi   = ativos.filter((l) => l.tipo === 'PI');
                  const comp = ativos.filter((l) => l.tipo === 'COMPRADO');
                  return (
                    <>
                      {mp.length > 0 && (
                        <optgroup label="Materia-Prima (MP)">
                          {mp.map((l) => (
                            <option key={l.id} value={l.id}>
                              {MP_CODIGO[l.mp]?.label ?? l.mp} · {l.nroLoteFornecedor} · NF {l.danfe} · {l.fornecedor}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {pi.length > 0 && (
                        <optgroup label="Produto Intermediario (PI)">
                          {pi.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.descricaoPi ?? l.codigoPi} · OP {l.nroOP || '--'} · {l.dataEntrada}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {comp.length > 0 && (
                        <optgroup label="Componentes Comprados">
                          {comp.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.nomeComp} · {l.nroLoteFornecedor} · {l.fornecedor}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
              <button type="button" onClick={buscar} disabled={!loteIdSel}
                className="shrink-0 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-rose-200 hover:shadow-md">
                <Search size={14} /> Buscar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 max-w-xl">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder={modo === 'serie' ? 'Nr de serie da escada...' : 'Nr da OP...'} />
            <button type="button" onClick={buscar} className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md">
              <Search size={14} /> Buscar
            </button>
          </div>
        )}
      </Card>

      {modo === 'lote' && buscou && (
        <Card>
          {resultadosLote.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              <AlertTriangle size={16} className="shrink-0" />
              Nenhuma escada encontrada para este lote. Pode indicar que o lote ainda nao foi consumido em nenhuma ordem de producao.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <SectionTitle icon={AlertTriangle}>Escadas Afetadas — Recall</SectionTitle>
                <Badge color="rose">{resultadosLote.length} escada(s)</Badge>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 mb-5 text-xs font-semibold text-rose-700">
                <AlertTriangle size={13} className="shrink-0" />
                {resultadosLote.length} escada(s) fabricada(s) com este lote. Clique em uma para ver a ficha completa.
              </div>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b-2 border-slate-100">
                      <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Nr Serie</th>
                      <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">OP</th>
                      <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</th>
                      <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Data Prod.</th>
                      <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="py-2 px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosLote.map((o) => {
                      const entregue = saidas.find((s) => s.ativo && (s.numerosSerieVinculados ?? []).includes(o.nroSerie));
                      const selecionada = resultado?.id === o.id;
                      return (
                        <tr key={o.id} onClick={() => selecionar(o)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors ${selecionada ? 'bg-rose-50 border-rose-100' : 'hover:bg-rose-50/40'}`}>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">{o.nroSerie || '—'}</td>
                          <td className="py-3 px-3 font-mono text-slate-500">{o.nroOP || '—'}</td>
                          <td className="py-3 px-3 text-slate-600">{o.descricaoModelo || o.modeloCod || '—'}</td>
                          <td className="py-3 px-3 text-slate-400">{o.dataProd || '—'}</td>
                          <td className="py-3 px-3">
                            {entregue
                              ? <Badge color="emerald">Entregue</Badge>
                              : <Badge color="amber">Em estoque</Badge>}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="text-rose-500 font-black text-[10px] uppercase tracking-widest">Ver →</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {modo !== 'lote' && ordensAtivas.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle icon={ClipboardList}>Todas as Escadas Registradas</SectionTitle>
            <Badge color="blue">{ordensAtivas.length} registros</Badge>
          </div>
          <div className="mb-4 max-w-sm">
            <Input value={filtroLista} onChange={(e) => setFiltroLista(e.target.value)} placeholder="Filtrar por serie, OP ou modelo..." />
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Nr Serie</th>
                  <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">OP</th>
                  <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</th>
                  <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Data</th>
                  <th className="text-left py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {ordensFiltradas.map((o) => {
                  const entregue = saidas.find((s) => s.ativo && (s.numerosSerieVinculados ?? []).includes(o.nroSerie));
                  const selecionada = resultado?.id === o.id;
                  return (
                    <tr key={o.id}
                      onClick={() => selecionar(o)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${selecionada ? 'bg-blue-50 border-blue-100' : 'hover:bg-slate-50'}`}>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">{o.nroSerie || '—'}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{o.nroOP || '—'}</td>
                      <td className="py-3 px-3 text-slate-600">{o.descricaoModelo || o.modeloCod || '—'}</td>
                      <td className="py-3 px-3 text-slate-400">{o.dataProd || '—'}</td>
                      <td className="py-3 px-3">
                        {entregue
                          ? <Badge color="emerald">Entregue</Badge>
                          : <Badge color="amber">Em estoque</Badge>}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-blue-500 font-black text-[10px] uppercase tracking-widest">Ver →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {feedbackEstorno && (
        <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold ${feedbackEstorno.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {feedbackEstorno.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
          {feedbackEstorno.msg}
        </div>
      )}
      {buscou && !resultado && modo !== 'lote' && (
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
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 mb-5 ${saidaVinculada ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            <Truck size={16} className={saidaVinculada ? 'text-emerald-600 shrink-0' : 'text-amber-500 shrink-0'} />
            {saidaVinculada ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="font-black text-emerald-700 uppercase tracking-widest">Entregue</span>
                <span className="text-emerald-700"><span className="font-semibold">NF:</span> {saidaVinculada.nfSaida}</span>
                <span className="text-emerald-700"><span className="font-semibold">Cliente:</span> {saidaVinculada.cliente}</span>
                <span className="text-emerald-700"><span className="font-semibold">Data:</span> {saidaVinculada.dataEntrega}</span>
                {saidaVinculada.observacao && <span className="text-emerald-600 italic">{saidaVinculada.observacao}</span>}
              </div>
            ) : (
              <span className="text-xs font-semibold text-amber-700">Em estoque — nenhuma saída registrada</span>
            )}
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

// ---------- AJUSTE DE ESTOQUE ----------------------------------------
function AjusteEstoque({ lotes }) {
  const todos = lotes.filter((l) => l.ativo);
  const [loteId,     setLoteId]     = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('inventario');
  const [novaQtd,    setNovaQtd]    = useState('');
  const [motivo,     setMotivo]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [feedback,   setFeedback]   = useState(null);

  const lote = todos.find((l) => l.id === loteId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loteId || novaQtd === '') {
      setFeedback({ tipo: 'erro', msg: 'Selecione o lote e informe a nova quantidade.' });
      return;
    }
    const novaQtdNum = Number(novaQtd);
    if (novaQtdNum < 0) {
      setFeedback({ tipo: 'erro', msg: 'Quantidade nao pode ser negativa.' });
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const delta = novaQtdNum - (lote?.qtdDisponivel ?? 0);
      batch.update(doc(db, 'rastreabilidade_lotes', loteId), {
        qtdDisponivel: novaQtdNum,
      });
      // Registra historico do ajuste
      batch.set(doc(collection(db, 'rastreabilidade_ajustes')), {
        loteId,
        tipo: lote?.tipo ?? '',
        mp: lote?.mp ?? lote?.codigoPi ?? lote?.nomeComp ?? '',
        nroLote: lote?.nroLoteFornecedor ?? lote?.nroOP ?? '',
        qtdAntes: lote?.qtdDisponivel ?? 0,
        qtdDepois: novaQtdNum,
        delta,
        tipoAjuste,
        motivo: motivo.trim(),
        ajustadoEm: new Date().toISOString(),
      });
      await batch.commit();
      setFeedback({ tipo: 'ok', msg: `Saldo ajustado de ${lote?.qtdDisponivel ?? 0} para ${novaQtdNum} (${delta >= 0 ? '+' : ''}${delta}).` });
      setLoteId(''); setNovaQtd(''); setMotivo('');
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const tiposAjuste = [
    { v: 'inventario', label: 'Inventario fisico' },
    { v: 'correcao',   label: 'Correcao de lancamento' },
    { v: 'perda',      label: 'Perda / Avaria' },
    { v: 'retorno',    label: 'Retorno / Devolucao' },
    { v: 'outro',      label: 'Outro' },
  ];

  // Agrupa para exibir no select por tipo
  const gruposMp   = todos.filter((l) => l.tipo === 'MP');
  const gruposPi   = todos.filter((l) => l.tipo === 'PI');
  const gruposComp = todos.filter((l) => l.tipo === 'COMPRADO');

  return (
    <Card>
      <SectionTitle icon={SlidersHorizontal}>Ajuste de Estoque</SectionTitle>
      <Feedback feedback={feedback} />
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label>Selecione o Lote *</Label>
            <select value={loteId} onChange={(e) => { setLoteId(e.target.value); setNovaQtd(''); }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 transition">
              <option value="">-- selecionar lote --</option>
              {gruposMp.length > 0 && (
                <optgroup label="Materia-Prima (MP)">
                  {gruposMp.map((l) => <option key={l.id} value={l.id}>{MP_CODIGO[l.mp]?.label ?? l.mp} | Lote {l.nroLoteFornecedor} | Saldo: {l.qtdDisponivel}</option>)}
                </optgroup>
              )}
              {gruposPi.length > 0 && (
                <optgroup label="Produto Intermediario (PI)">
                  {gruposPi.map((l) => <option key={l.id} value={l.id}>{l.descricaoPi ?? l.nomePi ?? l.codigoPi} | OP {l.nroOP || '--'} | Saldo: {l.qtdDisponivel}</option>)}
                </optgroup>
              )}
              {gruposComp.length > 0 && (
                <optgroup label="Comprado">
                  {gruposComp.map((l) => <option key={l.id} value={l.id}>{l.nomeComp} | Lote {l.nroLoteFornecedor} | Saldo: {l.qtdDisponivel}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <Label>Tipo de Ajuste *</Label>
            <Select value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}>
              {tiposAjuste.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </Select>
          </div>
        </div>
        {lote && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo</p>
              <p className="text-sm font-bold text-slate-700 mt-1">{lote.tipo}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Material</p>
              <p className="text-sm font-bold text-slate-700 mt-1">{MP_CODIGO[lote.mp]?.label ?? lote.descricaoPi ?? lote.nomeComp ?? lote.mp ?? '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo Atual</p>
              <p className={`text-2xl font-black mt-1 ${lote.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{lote.qtdDisponivel}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">DANFE / OP</p>
              <p className="text-sm font-mono text-slate-600 mt-1">{lote.danfe || lote.nroOP || '--'}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label>Nova Quantidade (saldo correto) *</Label>
            <Input type="number" min="0" value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} placeholder="Ex: 250" disabled={!loteId} />
            {lote && novaQtd !== '' && (
              <p className={`text-[10px] font-black mt-1 ${Number(novaQtd) > lote.qtdDisponivel ? 'text-emerald-600' : Number(novaQtd) < lote.qtdDisponivel ? 'text-rose-500' : 'text-slate-400'}`}>
                Diferenca: {Number(novaQtd) - lote.qtdDisponivel >= 0 ? '+' : ''}{Number(novaQtd) - lote.qtdDisponivel} unidades
              </p>
            )}
          </div>
          <div>
            <Label>Motivo / Observacao</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Contagem fisica em 27/04/2026" disabled={!loteId} />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={saving || !loteId || novaQtd === ''} className="bg-amber-500 hover:bg-amber-400 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-amber-200 hover:shadow-md">
            <SlidersHorizontal size={15} /> {saving ? 'Salvando...' : 'Confirmar Ajuste'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// ---------- PRODUTO ACABADO -------------------------------------------
function RegistroProdutoAcabado({ ordens, lotes }) {
  const modelos = BOM_ESCADAS.bom_escadas_rastreados;
  const [form, setForm] = useState({
    nroSerie: '',
    nroOP: '',
    modeloCod: '',
    dataProd: today(),
    dataInspecao: today(),
    inspetor: '',
    statusQC: 'aprovado',
    nroLacre: '',
    observacao: '',
  });
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nroSerie.trim() || !form.modeloCod || !form.inspetor.trim()) {
      setFeedback({ tipo: 'erro', msg: 'Preencha: Nr Serie, Modelo e Inspetor.' });
      return;
    }
    const duplicado = ordens.find((o) => o.nroSerie?.trim() === form.nroSerie.trim() && o.tipo === 'PA');
    if (duplicado) {
      setFeedback({ tipo: 'erro', msg: `Nr de serie ${form.nroSerie.trim()} ja registrado.` });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'rastreabilidade_ordens'), {
        tipo: 'PA',
        nroSerie: form.nroSerie.trim(),
        nroOP: form.nroOP.trim(),
        modeloCod: form.modeloCod,
        descricaoModelo: modelos.find((m) => m.codigo_produto === form.modeloCod)?.descricao ?? '',
        dataProd: form.dataProd,
        dataInspecao: form.dataInspecao,
        inspetor: form.inspetor.trim(),
        statusQC: form.statusQC,
        nroLacre: form.nroLacre.trim(),
        observacao: form.observacao.trim(),
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: `Escada ${form.nroSerie.trim()} registrada como PA.` });
      setForm({ nroSerie: '', nroOP: '', modeloCod: '', dataProd: today(), dataInspecao: today(), inspetor: '', statusQC: 'aprovado', nroLacre: '', observacao: '' });
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const paRegistrados = ordens.filter((o) => o.tipo === 'PA' && o.ativo).slice(0, 50);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={PackagePlus}>Registrar Produto Acabado (PA)</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <Label>Numero de Serie *</Label>
                <Input value={form.nroSerie} onChange={(e) => set('nroSerie', e.target.value)} placeholder="Ex: ESC-2026-0001" />
              </div>
              <div>
                <Label>Numero da OP</Label>
                <Input value={form.nroOP} onChange={(e) => set('nroOP', e.target.value)} placeholder="Ex: OP-2026-0001" />
              </div>
              <div>
                <Label>Modelo *</Label>
                <Select value={form.modeloCod} onChange={(e) => set('modeloCod', e.target.value)}>
                  <option value="">-- selecione --</option>
                  {modelos.map((m) => <option key={m.codigo_produto} value={m.codigo_produto}>{m.codigo_produto} — {m.descricao}</option>)}
                </Select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>Data de Producao</Label>
              <Input type="date" value={form.dataProd} onChange={(e) => set('dataProd', e.target.value)} />
            </div>
            <div>
              <Label>Data da Inspecao</Label>
              <Input type="date" value={form.dataInspecao} onChange={(e) => set('dataInspecao', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <Label>Inspetor / Responsavel *</Label>
              <Input value={form.inspetor} onChange={(e) => set('inspetor', e.target.value)} placeholder="Nome do inspetor" />
            </div>
            <div>
              <Label>Status QC *</Label>
              <Select value={form.statusQC} onChange={(e) => set('statusQC', e.target.value)}>
                <option value="aprovado">Aprovado</option>
                <option value="reprovado">Reprovado</option>
                <option value="pendente">Pendente de inspecao</option>
              </Select>
            </div>
            <div>
              <Label>Nr Lacre / Etiqueta INMETRO</Label>
              <Input value={form.nroLacre} onChange={(e) => set('nroLacre', e.target.value)} placeholder="Ex: LAC-2026-0001" />
            </div>
          </div>
          <div>
            <Label>Observacoes</Label>
            <Input value={form.observacao} onChange={(e) => set('observacao', e.target.value)} placeholder="Observacoes adicionais" />
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-emerald-200 hover:shadow-md">
              <PackagePlus size={15} /> {saving ? 'Salvando...' : 'Registrar Produto Acabado'}
            </button>
          </div>
        </form>
      </Card>
      {paRegistrados.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Produtos Acabados Registrados</p>
            <Badge color="emerald">{paRegistrados.length} registros</Badge>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Nr Serie','OP','Modelo','Prod.','Inspecao','Inspetor','Status QC','Lacre INMETRO'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paRegistrados.map((o) => (
                  <tr key={o.id} className="row-hover transition-colors">
                    <td className="py-3 px-2 font-bold text-slate-800 font-mono whitespace-nowrap">{o.nroSerie}</td>
                    <td className="py-3 px-2 font-mono text-slate-500">{o.nroOP || '--'}</td>
                    <td className="py-3 px-2">
                      <p className="font-semibold text-slate-700">{o.modeloCod}</p>
                      <p className="text-[10px] text-slate-400">{o.descricaoModelo}</p>
                    </td>
                    <td className="py-3 px-2 font-mono text-slate-500 whitespace-nowrap">{o.dataProd}</td>
                    <td className="py-3 px-2 font-mono text-slate-500 whitespace-nowrap">{o.dataInspecao}</td>
                    <td className="py-3 px-2 text-slate-600">{o.inspetor}</td>
                    <td className="py-3 px-2">
                      {o.statusQC === 'aprovado'  && <Badge color="emerald">Aprovado</Badge>}
                      {o.statusQC === 'reprovado' && <Badge color="rose">Reprovado</Badge>}
                      {o.statusQC === 'pendente'  && <Badge color="amber">Pendente</Badge>}
                    </td>
                    <td className="py-3 px-2 font-mono text-slate-500">{o.nroLacre || '--'}</td>
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
                <tr key={o.id} className={`row-hover transition-colors cursor-pointer ${selecionados.has(o.id) ? 'bg-blue-50/40' : ''}`} onClick={() => toggle(o.id)}>
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

// ─── Inventário Real (Escadas - Lotes.xlsx / Planilha6) ───────────────────────
const INVENTARIO_REAL = {
  mp: [
    {
      mp_key: 'TUBO (11307)',
      mpCodigo: '11307',
      loteId: 'TUB0002',
      danfe: '000019643',
      fornecedor: 'BELOACO DOX',
      certificado: '',
      nroLote: 'TUB0002',
      dataEntrada: '2024-03-12',
      qtdRecebida: 0,   // desconhecida — saldo físico registrado no PI
      qtdAprovada: 0,
      qtdDisponivel: 0, // MP já virou PI; saldo está nos lotes PI abaixo
    },
    {
      mp_key: 'CHAPA 1,20 (81730)',
      mpCodigo: '81730',
      loteId: 'CHAPA120-001',
      danfe: '005290443',
      fornecedor: 'USIMINAS',
      certificado: '2222765',
      nroLote: 'CHAPA120-001',
      dataEntrada: '2024-01-01',
      qtdRecebida: 0,
      qtdAprovada: 0,
      qtdDisponivel: 0,
    },
    {
      mp_key: 'CHAPA 1,40 (81731)',
      mpCodigo: '81731',
      loteId: 'CHAPA140-001',
      danfe: '006944758',
      fornecedor: 'CSN',
      certificado: 'D51330-0302',
      nroLote: 'CHAPA140-001',
      dataEntrada: '2024-01-01',
      qtdRecebida: 0,
      qtdAprovada: 0,
      qtdDisponivel: 0,
    },
    {
      mp_key: 'ARAME (11308)',
      mpCodigo: '11308',
      loteId: 'ARA0002',
      danfe: '000316083',
      fornecedor: 'MACCAFERRI',
      certificado: '',
      nroLote: 'ARA0002',
      dataEntrada: '2024-01-01',
      qtdRecebida: 0,
      qtdAprovada: 0,
      qtdDisponivel: 0,
    },
    {
      mp_key: 'BARRA CHATA (11300)',
      mpCodigo: '11300',
      loteId: 'BAR0002',
      danfe: '001490153',
      fornecedor: 'ARCELOR MITTAL',
      certificado: '',
      nroLote: 'BAR0002',
      dataEntrada: '2024-01-01',
      qtdRecebida: 0,
      qtdAprovada: 0,
      qtdDisponivel: 0,
    },
  ],
  pi: [
    // ── Patamar (81711) ──────────────────
    { codigo: '81711', nome: 'PATAMAR # 1,20 ED', mp_key: 'CHAPA 1,20 (81730)', mpLoteId: 'CHAPA120-001',
      loteId: 'PAT0002', danfe: '005290443', fornecedor: 'USIMINAS', certificado: '2222765', op: '018996',
      avulso: 12, soldado: 198 },
    { codigo: '81712', nome: 'DEGRAU # 1,20 ED', mp_key: 'CHAPA 1,20 (81730)', mpLoteId: 'CHAPA120-001',
      loteId: 'DEG0002', danfe: '005290443', fornecedor: 'USIMINAS', certificado: '2222765', op: '018996',
      avulso: 220, soldado: 890 },
    { codigo: '81713', nome: 'ARTICULADOR # 1,40 ED', mp_key: 'CHAPA 1,40 (81731)', mpLoteId: 'CHAPA140-001',
      loteId: 'ART0001', danfe: '006944758', fornecedor: 'CSN', certificado: 'D51330-0302', op: '',
      avulso: 0, soldado: 396 },
    { codigo: '81714', nome: 'DOBRADICA # 1,20 ED', mp_key: 'CHAPA 1,20 (81730)', mpLoteId: 'CHAPA120-001',
      loteId: 'DOB0001', danfe: '007012435', fornecedor: 'CSN', certificado: 'D61101-1001', op: '',
      avulso: 0, soldado: 56 },
    { codigo: '81715', nome: 'ARAME SUST PATAMAR 05MM ED', mp_key: 'ARAME (11308)', mpLoteId: 'ARA0002',
      loteId: 'ARA0002-PI', danfe: '000316083', fornecedor: 'MACCAFERRI', certificado: '', op: '',
      avulso: 0, soldado: 71 },
    { codigo: '81721', nome: 'REFORCO MONT. FRONTAL ED', mp_key: 'BARRA CHATA (11300)', mpLoteId: 'BAR0002',
      loteId: 'BAR0002-PI', danfe: '001490153', fornecedor: 'ARCELOR MITTAL', certificado: '', op: '',
      avulso: 0, soldado: 170 },
    { codigo: '81701', nome: 'MONT FRONTAL ED 04 DEGRAUS', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-MF4-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 28 },
    { codigo: '81702', nome: 'MONT FRONTAL ED 05 DEGRAUS', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-MF5-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 107 },
    { codigo: '81704', nome: 'MONT FRONTAL ED 07 DEGRAUS', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-MF7-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 63 },
    { codigo: '81705', nome: 'MONT TRASEIRO ED 03 DEGRAUS', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-MT3-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 64 },
    { codigo: '81709', nome: 'MONT TRASEIRO ED 07 DEGRAUS', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-MT7-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 72 },
    { codigo: '81710', nome: 'TRAVESSA # 1,20 ED', mp_key: 'TUBO (11307)', mpLoteId: 'TUB0002',
      loteId: 'TUB-TV-001', danfe: '000019643', fornecedor: 'BELOACO DOX', certificado: '', op: '',
      avulso: 0, soldado: 110 },
  ],
  comprados: [
    { codigo: '11302', nome: 'ARRUELA LISA 3/16"',    loteId: 'REB-001', danfe: '000090334', fornecedor: 'RENA',         qtd: 0    },
    { codigo: '11303', nome: 'REBITE R-512A',          loteId: 'REB-001', danfe: '000090334', fornecedor: 'RENA',         qtd: 269  },
    { codigo: '11304', nome: 'REBITE R-519A',          loteId: 'REB-001', danfe: '000090334', fornecedor: 'RENA',         qtd: 1800 },
    { codigo: '11305', nome: 'REBITE R-612',           loteId: 'REB-001', danfe: '000090334', fornecedor: 'RENA',         qtd: 900  },
    { codigo: '11306', nome: 'FITA POLIPROPILENO 25MM',loteId: 'FITA-001',danfe: '000000224', fornecedor: 'TUDO DE BOM',  qtd: 500  },
    { codigo: '40201', nome: 'ETIQUETA INMETRO',       loteId: 'ETQ-001', danfe: '',          fornecedor: '',            qtd: 0    },
    { codigo: '40202', nome: 'ETIQUETA IDENTIFICACAO', loteId: 'ETQ-001', danfe: '',          fornecedor: '',            qtd: 0    },
    { codigo: '40203', nome: 'PONTEIRA DE PLASTICO',   loteId: 'PNT-001', danfe: '',          fornecedor: '',            qtd: 0    },
  ],
};

async function seedInventarioReal(setStatus) {
  setStatus('loading');
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // MP lots (estoque esgotado — já processados em PI)
    for (const m of INVENTARIO_REAL.mp) {
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, {
        tipo: 'MP',
        mp: m.mp_key,
        mpCodigo: m.mpCodigo,
        nroLoteFornecedor: m.nroLote,
        danfe: m.danfe,
        certificadoQualidade: m.certificado,
        fornecedor: m.fornecedor,
        qtdRecebida: m.qtdRecebida,
        qtdAprovada: m.qtdAprovada,
        qtdReprovada: 0,
        qtdDisponivel: m.qtdDisponivel,
        dataEntrada: m.dataEntrada,
        ativo: true,
        criadoEm: now,
        origem: 'inventario_inicial',
      });
    }

    // PI lots — saldo real do inventário físico
    for (const p of INVENTARIO_REAL.pi) {
      const total = p.avulso + p.soldado;
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, {
        tipo: 'PI',
        codigoPi: p.codigo,
        descricaoPi: p.nome,
        mpKey: p.mp_key,
        mpCodigo: MP_CODIGO[p.mp_key]?.codigo ?? '',
        mpLoteId: p.mpLoteId,
        nroOP: p.op,
        danfe: p.danfe,
        certificadoQualidade: p.certificado,
        fornecedor: p.fornecedor,
        qtdProduzida: total,
        qtdAprovada: total,
        qtdReprovada: 0,
        qtdDisponivel: total,
        qtdAvulso: p.avulso,
        qtdSoldado: p.soldado,
        dataEntrada: '2024-01-01',
        ativo: true,
        criadoEm: now,
        origem: 'inventario_inicial',
      });
    }

    // COMPRADO lots
    for (const c of INVENTARIO_REAL.comprados) {
      const r = doc(collection(db, 'rastreabilidade_lotes'));
      batch.set(r, {
        tipo: 'COMPRADO',
        nomeComp: c.nome,
        codigo: c.codigo,
        danfe: c.danfe,
        nroLoteFornecedor: c.loteId,
        certificadoQualidade: '',
        fornecedor: c.fornecedor,
        qtdRecebida: c.qtd,
        qtdAprovada: c.qtd,
        qtdReprovada: 0,
        qtdDisponivel: c.qtd,
        dataEntrada: '2024-01-01',
        ativo: true,
        criadoEm: now,
        origem: 'inventario_inicial',
      });
    }

    await batch.commit();
    setStatus('ok');
    setTimeout(() => setStatus(null), 5000);
  } catch (err) {
    console.error(err);
    setStatus('erro');
    setTimeout(() => setStatus(null), 5000);
  }
}

async function limparColecao(nome) {
  const snap = await getDocs(collection(db, nome));
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, nome, id)));
    await batch.commit();
  }
}

async function limparEReimportar(setStatus) {
  setStatus('loading');
  try {
    await limparColecao('rastreabilidade_lotes');
    await limparColecao('rastreabilidade_ordens');
    await limparColecao('rastreabilidade_saidas');
    await seedInventarioReal(() => {});
    setStatus('ok');
    setTimeout(() => setStatus(null), 5000);
  } catch (err) {
    console.error(err);
    setStatus('erro');
    setTimeout(() => setStatus(null), 5000);
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
                  <tr key={l.id} className="row-hover transition-colors">
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
  const [expandidos, setExpandidos] = useState({});
  const toggle = (key) => setExpandidos((p) => ({ ...p, [key]: !p[key] }));

  const gruposMp = Object.keys(MP_CODIGO).map((mpKey) => {
    const lotesDaMp = ativos.filter((l) => l.tipo === 'MP' && l.mp === mpKey);
    const totalDisp = lotesDaMp.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);
    const totalRec  = lotesDaMp.reduce((s, l) => s + (l.qtdRecebida  ?? 0), 0);
    return { mpKey, label: MP_CODIGO[mpKey].label, codigo: MP_CODIGO[mpKey].codigo, lotes: lotesDaMp, totalDisp, totalRec };
  }).filter((g) => g.lotes.length > 0);

  const nomesComp = [...new Set(ativos.filter((l) => l.tipo === 'COMPRADO').map((l) => l.nomeComp))].sort();
  const gruposComp = nomesComp.map((nome) => {
    const ls = ativos.filter((l) => l.tipo === 'COMPRADO' && l.nomeComp === nome);
    const totalDisp = ls.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0);
    const totalRec  = ls.reduce((s, l) => s + (l.qtdRecebida  ?? 0), 0);
    return { nome, codigo: ls[0]?.codigo ?? '', lotes: ls, totalDisp, totalRec };
  });

  const semLotes = gruposMp.length === 0 && gruposComp.length === 0;

  const ColsLote = ({ l, danfeColor = 'amber' }) => (
    <>
      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">{l.nroLoteFornecedor || '--'}</td>
      <td className="py-2.5 px-3">
        <span className={`font-mono text-[10px] bg-${danfeColor}-50 border border-${danfeColor}-100 text-${danfeColor}-700 px-1.5 py-0.5 rounded`}>{l.danfe || '--'}</span>
        {l.nroOPTubo && <span className="ml-1 font-mono text-[10px] text-violet-500">OP {l.nroOPTubo}</span>}
      </td>
      <td className="py-2.5 px-3 text-[10px] text-slate-400 whitespace-nowrap">{l.fornecedor || '--'}</td>
      <td className="py-2.5 px-3 text-[10px] text-slate-400 text-right whitespace-nowrap">{l.dataEntrada || '--'}</td>
      <td className="py-2.5 px-3 text-right">
        <span className={`font-black text-sm ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span>
        {l.origemTubo === 'producao' && <span className="ml-1 text-[9px] font-black uppercase text-violet-500">Prod.</span>}
      </td>
    </>
  );

  const thCls = 'text-left py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap';

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
          return { cod, descricao: LOTES_PI_MAP[cod] ?? ls[0]?.descricaoPi ?? ls[0]?.nomePi ?? cod, lotes: ls, totalDisp: ls.reduce((s, l) => s + (l.qtdDisponivel ?? 0), 0) };
        });
        return (
          <Card>
            <SectionTitle icon={Cog}>Produtos Intermediarios (PI) em Estoque</SectionTitle>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className={thCls} style={{width:32}} />
                  <th className={thCls}>PI</th>
                  <th className={thCls}>Lotes</th>
                  <th className={`${thCls} text-right`}>Saldo</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {gruposPi.map((g) => (
                  <React.Fragment key={g.cod}>
                    <tr className="row-hover transition-colors cursor-pointer border-b border-slate-50" onClick={() => toggle('pi_' + g.cod)}>
                      <td className="py-3 px-2 text-slate-400 text-center">{expandidos['pi_' + g.cod] ? '▾' : '▸'}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[10px] bg-violet-50 border border-violet-100 text-violet-700 px-1.5 py-0.5 rounded mr-2">{g.cod}</span>
                        <span className="font-black text-slate-800">{g.descricao}</span>
                      </td>
                      <td />
                      <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                      <td className="py-3 px-3 text-right"><span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 10 ? 'text-amber-500' : 'text-emerald-600'}`}>{g.totalDisp.toLocaleString('pt-BR')}</span></td>
                      <td className="py-3 px-3">{g.totalDisp === 0 ? <Badge color="rose">Zerado</Badge> : g.totalDisp < 10 ? <Badge color="amber">Baixo</Badge> : <Badge color="emerald">OK</Badge>}</td>
                    </tr>
                    {expandidos['pi_' + g.cod] && g.lotes.map((l) => (
                      <tr key={l.id} className="bg-violet-50/30 border-b border-violet-100/50">
                        <td />
                        <td colSpan={2} className="py-2 px-3 text-[10px] text-slate-500">
                          {l.nroOP
                            ? <>OP <span className="font-mono font-bold">{l.nroOP}</span> &mdash; {l.dataEntrada}</>
                            : <>
                                <span className="italic text-amber-600 font-semibold">Saldo Inicial</span>
                                {l.danfe && <> &mdash; NF <span className="font-mono font-bold text-slate-600">{l.danfe}</span></>}
                                {l.fornecedor && <span className="text-slate-400"> ({l.fornecedor})</span>}
                              </>}
                        </td>
                        <td className="py-2 px-3 text-[10px] text-slate-400">
                          {l.mpKey && <><span className="text-slate-500">consumo de</span> <span className="font-semibold text-slate-300">{l.mpKey}</span></>}
                        </td>
                        <td className="py-2 px-3 text-right"><span className={`font-black text-sm ${l.qtdDisponivel === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{l.qtdDisponivel}</span></td>
                        <td />
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })()}

      {gruposMp.length > 0 && (
        <Card>
          <SectionTitle icon={Package}>Materia-Prima (MP)</SectionTitle>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className={thCls} style={{width:32}} />
                <th className={thCls}>Material</th>
                <th className={thCls}>Lotes</th>
                <th className={`${thCls} text-right`}>Qtd Recebida</th>
                <th className={`${thCls} text-right`}>Saldo Disponivel</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {gruposMp.map((g) => (
                <React.Fragment key={g.mpKey}>
                  <tr className="row-hover transition-colors cursor-pointer border-b border-slate-50" onClick={() => toggle('mp_' + g.mpKey)}>
                    <td className="py-3 px-2 text-slate-400 text-center">{expandidos['mp_' + g.mpKey] ? '▾' : '▸'}</td>
                    <td className="py-3 px-3">
                      <p className="font-black text-slate-800 leading-tight">{g.label}</p>
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">{g.codigo}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                    <td className="py-3 px-3 text-slate-600 text-right">{g.totalRec.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 50 ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {g.totalDisp.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {g.totalDisp === 0 ? <Badge color="rose">Zerado</Badge> : g.totalDisp < 50 ? <Badge color="amber">Baixo</Badge> : <Badge color="emerald">OK</Badge>}
                    </td>
                  </tr>
                  {expandidos['mp_' + g.mpKey] && (
                    <>
                      <tr className="bg-slate-50/60">
                        <td />
                        <th className={thCls}>Lote</th>
                        <th className={thCls}>Nr Lote Forn.</th>
                        <th className={thCls}>DANFE</th>
                        <th className={thCls}>Fornecedor</th>
                        <th className={thCls}>Entrada</th>
                        <th className={`${thCls} text-right`}>Disponivel</th>
                      </tr>
                      {g.lotes.map((l) => (
                        <tr key={l.id} className="bg-slate-50/40 border-b border-slate-100">
                          <td />
                          <td className="py-2 px-3 font-mono text-[10px] text-blue-600 font-bold">{l.nroLoteFornecedor}</td>
                          <ColsLote l={l} />
                        </tr>
                      ))}
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {gruposComp.length > 0 && (
        <Card>
          <SectionTitle icon={Layers}>Componentes Comprados</SectionTitle>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className={thCls} style={{width:32}} />
                <th className={thCls}>Componente</th>
                <th className={thCls}>Lotes</th>
                <th className={`${thCls} text-right`}>Qtd Recebida</th>
                <th className={`${thCls} text-right`}>Saldo Disponivel</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {gruposComp.map((g) => (
                <React.Fragment key={g.nome}>
                  <tr className="row-hover transition-colors cursor-pointer border-b border-slate-50" onClick={() => toggle('comp_' + g.nome)}>
                    <td className="py-3 px-2 text-slate-400 text-center">{expandidos['comp_' + g.nome] ? '▾' : '▸'}</td>
                    <td className="py-3 px-3">
                      {g.codigo && <span className="font-mono text-[10px] bg-cyan-50 border border-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded mr-2">{g.codigo}</span>}
                      <span className="font-black text-slate-800">{g.nome}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{g.lotes.length}</td>
                    <td className="py-3 px-3 text-slate-600 text-right">{g.totalRec.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-base font-black ${g.totalDisp === 0 ? 'text-rose-500' : g.totalDisp < 100 ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {g.totalDisp.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {g.totalDisp === 0 ? <Badge color="rose">Zerado</Badge> : g.totalDisp < 100 ? <Badge color="amber">Baixo</Badge> : <Badge color="emerald">OK</Badge>}
                    </td>
                  </tr>
                  {expandidos['comp_' + g.nome] && (
                    <>
                      <tr className="bg-slate-50/60">
                        <td />
                        <th className={thCls}>Lote</th>
                        <th className={thCls}>Nr Lote Forn.</th>
                        <th className={thCls}>DANFE</th>
                        <th className={thCls}>Fornecedor</th>
                        <th className={thCls}>Entrada</th>
                        <th className={`${thCls} text-right`}>Disponivel</th>
                      </tr>
                      {g.lotes.map((l) => (
                        <tr key={l.id} className="bg-slate-50/40 border-b border-slate-100">
                          <td />
                          <td className="py-2 px-3 font-mono text-[10px] text-blue-600 font-bold">{l.nroLoteFornecedor}</td>
                          <ColsLote l={l} danfeColor="cyan" />
                        </tr>
                      ))}
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function SaidaVenda({ ordens, saidas }) {
  const [form, setForm] = useState({ nfSaida: '', cliente: '', dataEntrega: today(), observacao: '' });
  const [selecionadas, setSelecionadas] = useState([]);
  const [saving, setSaving]             = useState(false);
  const [feedback, setFeedback]         = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const seriesJaSaidas = new Set(saidas.flatMap((s) => s.numerosSerieVinculados ?? []));
  const ordensDisponiveis = ordens
    .filter((o) => o.ativo && !seriesJaSaidas.has(o.nroSerie))
    .sort((a, b) => (b.dataProd ?? '').localeCompare(a.dataProd ?? ''));

  const adicionar = (nroSerie) => {
    if (!nroSerie || selecionadas.includes(nroSerie)) return;
    setSelecionadas((p) => [...p, nroSerie]);
  };

  const remover = (nroSerie) => setSelecionadas((p) => p.filter((s) => s !== nroSerie));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nfSaida.trim() || !form.cliente.trim()) {
      setFeedback({ tipo: 'erro', msg: 'Preencha NF de saída e cliente.' });
      return;
    }
    if (selecionadas.length === 0) {
      setFeedback({ tipo: 'erro', msg: 'Selecione pelo menos uma escada.' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'rastreabilidade_saidas'), {
        nfSaida: form.nfSaida.trim(),
        cliente: form.cliente.trim(),
        dataEntrega: form.dataEntrega,
        observacao: form.observacao.trim(),
        numerosSerieVinculados: selecionadas,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: `Saída registrada — ${selecionadas.length} escada(s) vinculadas à NF ${form.nfSaida.trim()}` });
      setForm({ nfSaida: '', cliente: '', dataEntrega: today(), observacao: '' });
      setSelecionadas([]);
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle icon={Truck}>Registrar Saída / Venda</SectionTitle>
        <Feedback feedback={feedback} />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>NF de Saída *</Label>
              <Input value={form.nfSaida} onChange={(e) => set('nfSaida', e.target.value)} placeholder="Ex: 000123456" />
            </div>
            <div>
              <Label>Cliente *</Label>
              <Input value={form.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Razão social ou nome" />
            </div>
            <div>
              <Label>Data de Entrega *</Label>
              <Input type="date" value={form.dataEntrega} onChange={(e) => set('dataEntrega', e.target.value)} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => set('observacao', e.target.value)} placeholder="Pedido, romaneio, etc." />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Escadas nesta saída</p>
            <div className="flex gap-3">
              <Select
                value=""
                onChange={(e) => adicionar(e.target.value)}
                className="max-w-sm"
              >
                <option value="">-- adicionar escada --</option>
                {ordensDisponiveis.map((o) => (
                  <option key={o.id} value={o.nroSerie}>
                    {o.nroSerie} · {o.dataProd}
                  </option>
                ))}
              </Select>
              <span className="text-[10px] font-semibold text-slate-400 self-center">
                {ordensDisponiveis.length} em estoque disponíveis
              </span>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {selecionadas.length === 0 && (
                <span className="text-xs text-slate-400 italic self-center">Nenhuma escada selecionada</span>
              )}
              {selecionadas.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 bg-blue-100 border border-blue-200 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                  {s}
                  <button type="button" onClick={() => remover(s)} className="text-blue-400 hover:text-blue-700 transition">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            {selecionadas.length > 0 && (
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                {selecionadas.length} escada(s) selecionada(s)
              </p>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-xs uppercase tracking-widest py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-60 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md"
            >
              <Truck size={15} /> {saving ? 'Salvando...' : 'Registrar Saída'}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle icon={BarChart3}>Histórico de Saídas</SectionTitle>
        {saidas.filter((s) => s.ativo).length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nenhuma saída registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-black text-slate-400">NF Saída</th>
                  <th className="px-4 py-2.5 text-left font-black text-slate-400">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-black text-slate-400">Data Entrega</th>
                  <th className="px-4 py-2.5 text-center font-black text-slate-400">Qtd</th>
                  <th className="px-4 py-2.5 text-left font-black text-slate-400">Números de Série</th>
                  <th className="px-4 py-2.5 text-left font-black text-slate-400">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {saidas.filter((s) => s.ativo).map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-amber-700">{s.nfSaida}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.cliente}</td>
                    <td className="px-4 py-3 text-slate-600">{s.dataEntrega}</td>
                    <td className="px-4 py-3 text-center font-black text-blue-600">{(s.numerosSerieVinculados ?? []).length}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(s.numerosSerieVinculados ?? []).map((nr) => (
                          <span key={nr} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">{nr}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 italic">{s.observacao || '—'}</td>
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

const STEP_COLORS = {
  'Formação Tubo':  'bg-blue-100 text-blue-700',
  'Corte Tubo':     'bg-sky-100 text-sky-700',
  'Dobra Tubo':     'bg-indigo-100 text-indigo-700',
  'Furação':        'bg-purple-100 text-purple-700',
  'Guilhotina':     'bg-slate-100 text-slate-600',
  'Prensa Estampa': 'bg-amber-100 text-amber-700',
  'Prensa Furação': 'bg-orange-100 text-orange-700',
  'Corte Prensa':   'bg-amber-100 text-amber-700',
  'Dobra':          'bg-indigo-100 text-indigo-700',
  'Estampa':        'bg-orange-100 text-orange-700',
  'Corte':          'bg-slate-100 text-slate-600',
  'Solda':          'bg-yellow-100 text-yellow-700',
  'Pintura':        'bg-rose-100 text-rose-700',
  'Montagem':       'bg-emerald-100 text-emerald-700',
};

const COTAS_LABELS = [
  { key: 'A_tamanho_mm',          cota: 'A', label: 'Tamanho da escada',                              detalhe: '↕' },
  { key: 'B_incl_dianteira_mm',   cota: 'B', label: 'Inclinação',                                     detalhe: 'Lateral dianteira' },
  { key: 'B_incl_traseira_mm',    cota: 'B', label: 'Inclinação',                                     detalhe: 'Lateral traseira' },
  { key: 'C_largura_paralela_mm', cota: 'C', label: 'Largura da escada',                              detalhe: 'Paralela' },
  { key: 'E_prof_degrau_mm',      cota: 'E', label: 'Profundidade do degrau',                         detalhe: '↕' },
  { key: 'F_apoio_frontal_mm',    cota: 'F', label: 'Distância de apoio frontal e traseiro',          detalhe: 'Paralela (Frontal)' },
  { key: 'F_apoio_traseiro_mm',   cota: 'F', label: 'Distância de apoio frontal e traseiro',          detalhe: 'Paralela (Traseiro)' },
  { key: 'G_espacador_mm',        cota: 'G', label: 'Espaçador ou trava',                             detalhe: '↕' },
  { key: 'H_dist_degraus_mm',     cota: 'H', label: 'Distância entre degraus',                        detalhe: '↕' },
  { key: 'I_paralelismo_mm',      cota: 'I', label: 'Paralelismo entre degraus',                      detalhe: '↕' },
  { key: 'J_dist_degrau_solo_mm', cota: 'J', label: 'Distância do degrau mais baixo ao solo',         detalhe: '↕' },
  { key: 'L_aresta_plataforma_mm',cota: 'L', label: 'Largura da aresta frontal da plataforma',        detalhe: '↕' },
  { key: 'M_altura_alca_mm',      cota: 'M', label: 'Altura da alça de apoio em relação à plataforma',detalhe: '↕' },
];

function FichaTecnica() {
  const [produto, setProduto] = useState('00185');
  const modelo = BOM_ESCADAS.bom_escadas_rastreados.find((e) => e.codigo_produto === produto);
  const fluxo  = BOM_ESCADAS.fluxo_processo || {};

  const fmtQtd = (c) => {
    const v = c.quantidade_por_escada;
    const u = c.unidade;
    if (u === 'M')  return `${v} m`;
    if (u === 'KG') return `${v} kg`;
    return String(v);
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle icon={Layers}>Ficha Técnica da Escada</SectionTitle>

        <div className="flex gap-2 flex-wrap mb-8">
          {BOM_ESCADAS.bom_escadas_rastreados.map((e) => (
            <button
              key={e.codigo_produto}
              type="button"
              onClick={() => setProduto(e.codigo_produto)}
              className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${produto === e.codigo_produto ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            >
              {e.codigo_produto} · {e.descricao.replace('ESCADA DOMEST ', '').replace(' S/ PISO', '')}
            </button>
          ))}
        </div>

        {modelo && (
          <>
            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3 flex items-center gap-2">
              <Hash size={12} /> Cotas Dimensionais (mm)
            </h4>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-8">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-black text-slate-400 w-12">Cota</th>
                    <th className="px-4 py-2.5 text-left font-black text-slate-400">Característica</th>
                    <th className="px-4 py-2.5 text-left font-black text-slate-400">Detalhe</th>
                    <th className="px-4 py-2.5 text-right font-black text-slate-400 w-24">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {COTAS_LABELS.map(({ key, cota, label, detalhe }) => (
                    <tr key={key} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 font-black text-blue-600 text-sm">{cota}</td>
                      <td className="px-4 py-2.5 text-slate-700">{label}</td>
                      <td className="px-4 py-2.5 text-slate-400 italic">{detalhe}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{modelo.cotas[key]} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3 flex items-center gap-2">
              <Cog size={12} /> Lista de Componentes e Fluxo de Processo
            </h4>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left font-black text-slate-400 w-20">Código</th>
                    <th className="px-3 py-2.5 text-left font-black text-slate-400">Descrição</th>
                    <th className="px-3 py-2.5 text-center font-black text-slate-400 w-14">Tipo</th>
                    <th className="px-3 py-2.5 text-center font-black text-slate-400 w-14">Nível</th>
                    <th className="px-3 py-2.5 text-right font-black text-slate-400 w-20">Qtd/Esc.</th>
                    <th className="px-3 py-2.5 text-left font-black text-slate-400">Fluxo de Processo</th>
                  </tr>
                </thead>
                <tbody>
                  {modelo.componentes_rastreados.map((comp, i) => (
                    <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${comp.nivel === 3 ? 'bg-slate-50/60' : ''}`}>
                      <td className="px-3 py-2.5 font-mono text-slate-400">{comp.codigo}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{comp.descricao}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${comp.tipo === 'PI' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {comp.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{comp.nivel}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{fmtQtd(comp)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(fluxo[comp.codigo] || []).map((step, j) => (
                            <React.Fragment key={j}>
                              {j > 0 && <span className="text-slate-300 text-[9px] select-none">›</span>}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STEP_COLORS[step] ?? 'bg-slate-100 text-slate-600'}`}>
                                {step}
                              </span>
                            </React.Fragment>
                          ))}
                          {!fluxo[comp.codigo] && <span className="text-slate-300 text-[10px] italic">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

const ABAS = [
  {
    id: 'estoque', label: 'Estoque', icon: Warehouse,
    tooltip: 'Mostra o saldo atual de todos os lotes — matéria-prima, peças intermediárias (PI) e componentes comprados. Veja o que está disponível para produção.',
  },
  {
    id: 'lote', label: 'Entrada de Lotes', icon: Package,
    tooltip: '1ª etapa — Registra o recebimento de matéria-prima (tubo, chapa, arame) e componentes comprados (rebites, arruelas, fita). Informe DANFE, fornecedor e certificado de qualidade.',
  },
  {
    id: 'producaopi', label: 'Producao de PI', icon: Cog,
    tooltip: '2ª etapa — Transforma matéria-prima em peças intermediárias. Ex: lote de tubo → montantes e travessas. O saldo da MP diminui e o saldo do PI é criado com rastreio de origem.',
  },
  {
    id: 'ordem', label: 'Ordem de Producao', icon: ClipboardList,
    tooltip: '3ª etapa — Registra a montagem de uma escada. O BOM é carregado automaticamente pelo modelo e os lotes de PI são pré-selecionados em ordem FIFO.',
  },
  {
    id: 'pa', label: 'Produto Acabado', icon: PackagePlus,
    tooltip: '4ª etapa — Atribui o número de série à escada finalizada, fechando o vínculo com todos os componentes e lotes utilizados na montagem.',
  },
  {
    id: 'ajuste', label: 'Ajuste de Estoque', icon: SlidersHorizontal,
    tooltip: 'Corrige saldos por diferença de inventário, quebra ou recontagem. Toda correção fica registrada com motivo e data.',
  },
  {
    id: 'consultar', label: 'Rastreabilidade', icon: ArrowUpDown,
    tooltip: 'Consulta qualquer escada pelo número de série ou OP. Exibe todos os componentes, lotes de PI, DANFEs e certificados de qualidade usados. Também mostra se a escada já foi entregue e para qual cliente.',
  },
  {
    id: 'saida', label: 'Saída / Venda', icon: Truck,
    tooltip: '5ª etapa — Registra a entrega ao cliente vinculando a NF de saída aos números de série das escadas. Fecha o ciclo completo do rastreio: MP → PI → PA → Cliente.',
  },
  {
    id: 'exportar', label: 'Exportar INMETRO', icon: Download,
    tooltip: 'Gera o relatório de rastreabilidade no formato exigido pelo INMETRO para auditoria ou situação de recall de produto.',
  },
  {
    id: 'ficha', label: 'Ficha Técnica', icon: Layers,
    tooltip: 'Exibe o BOM completo de cada modelo de escada com cotas dimensionais (mm) e o fluxo de processo de fabricação por componente.',
  },
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
  const [saidas, setSaidas]             = useState([]);
  const [resetStatus, setResetStatus]   = useState(null);

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
    const u3 = onSnapshot(
      query(collection(db, 'rastreabilidade_saidas'), orderBy('criadoEm', 'desc')),
      (s) => setSaidas(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { u1(); u2(); u3(); };
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
              disabled={resetStatus === 'loading'}
              onClick={() => {
                if (window.confirm('Isso vai apagar TODOS os lotes e reimportar só o inventário real. Continua?'))
                  limparEReimportar(setResetStatus);
              }}
              className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-600/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-rose-300 transition hover:bg-rose-600/20 disabled:opacity-50"
            >
              <ArrowUpDown size={14} />
              {resetStatus === 'loading' ? 'Limpando...' : resetStatus === 'ok' ? 'Reimportado!' : resetStatus === 'erro' ? 'Erro — ver console' : 'Resetar e reimportar'}
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {ABAS.map(({ id, label, icon: Icon, tooltip }) => (
          <Tooltip key={id} text={tooltip}>
            <button
              type="button"
              onClick={() => setSubAba(id)}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${subAba === id ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            >
              <Icon size={14} /> {label}
            </button>
          </Tooltip>
        ))}
      </div>
      {subAba === 'estoque'    && <EstoqueAtual lotes={lotes} />}
      {subAba === 'lote'       && <div className="space-y-8"><EntradaLoteMP lotes={lotes} /><EntradaLoteComprado lotes={lotes} /></div>}
      {subAba === 'producaopi' && <ProducaoPI lotes={lotes} />}
      {subAba === 'ordem'      && <OrdemProducao lotes={lotes} />}
      {subAba === 'pa'         && <RegistroProdutoAcabado ordens={ordens} lotes={lotes} />}
      {subAba === 'ajuste'     && <AjusteEstoque lotes={lotes} />}
      {subAba === 'consultar'  && <ConsultarEscada ordens={ordens} lotes={lotes} saidas={saidas} />}
      {subAba === 'saida'      && <SaidaVenda ordens={ordens} saidas={saidas} />}
      {subAba === 'exportar'   && <ExportarInmetro ordens={ordens} />}
      {subAba === 'ficha'      && <FichaTecnica />}
    </div>
  );
}
