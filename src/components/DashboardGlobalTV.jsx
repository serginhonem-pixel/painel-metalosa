import React, { useEffect, useMemo, useState } from 'react';
import { maquinasBaseData } from '../data/maquinasBase';

const normalizarStr = (valor) =>
  String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const formatarTempo = (segundos) => {
  const total = Math.max(Math.round(segundos || 0), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getSegundosParada = (os, agora) => {
  const inicio = os?.dataFalha || os?.createdAt;
  if (!inicio) return 0;
  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return 0;
  const diff = (agora.getTime() - d.getTime()) / 1000;
  return diff > 0 ? diff : 0;
};

const DashboardGlobalTV = ({ manutencaoParadas, manutencaoOrdens, agora, logoSrc }) => {
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Mapa nome_normalizado → { status, os }
  const statusMap = useMemo(() => {
    const map = new Map();

    // VERMELHO: máquinas paradas (sem "andamento")
    manutencaoParadas.forEach((os) => {
      const nome = normalizarStr(os.ativo || os.setor || '');
      if (nome && !map.has(nome)) {
        map.set(nome, { status: 'parada', os });
      }
    });

    // AMARELO: ordens em andamento (só se não já parada)
    manutencaoOrdens
      .filter((os) => String(os.status || '').toLowerCase().includes('andamento'))
      .forEach((os) => {
        const nome = normalizarStr(os.ativo || os.setor || '');
        if (nome && !map.has(nome)) {
          map.set(nome, { status: 'andamento', os });
        }
      });

    return map;
  }, [manutencaoParadas, manutencaoOrdens]);

  // Agrupa máquinas por setor com status calculado
  const setoresComMaquinas = useMemo(() => {
    const grupos = new Map();
    maquinasBaseData.forEach((maquina) => {
      if (!grupos.has(maquina.setor)) grupos.set(maquina.setor, []);
      const nomeNorm = normalizarStr(maquina.nome);
      const info = statusMap.get(nomeNorm);
      grupos.get(maquina.setor).push({
        ...maquina,
        status: info?.status || 'ok',
        os: info?.os || null,
      });
    });

    // Ordena: setores com parada primeiro, depois andamento, depois ok
    return Array.from(grupos.entries()).sort(([, a], [, b]) => {
      const score = (arr) => {
        const p = arr.filter((m) => m.status === 'parada').length;
        const d = arr.filter((m) => m.status === 'andamento').length;
        return p * 1000 + d;
      };
      return score(b) - score(a);
    });
  }, [statusMap]);

  const resumo = useMemo(() => {
    let paradas = 0;
    let andamento = 0;
    let ok = 0;
    setoresComMaquinas.forEach(([, maquinas]) => {
      maquinas.forEach((m) => {
        if (m.status === 'parada') paradas += 1;
        else if (m.status === 'andamento') andamento += 1;
        else ok += 1;
      });
    });
    return { paradas, andamento, ok };
  }, [setoresComMaquinas]);

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden text-white"
      style={{
        fontFamily: "'Inter', ui-sans-serif, system-ui",
        background: '#0a0c10',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&display=swap');
        .global-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .global-col-scroll::-webkit-scrollbar { width: 3px; }
        .global-col-scroll::-webkit-scrollbar-track { background: transparent; }
        .global-col-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .global-row-scroll { overflow-x: auto; }
        .global-row-scroll::-webkit-scrollbar { height: 4px; }
        .global-row-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .global-row-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes global-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .global-blink { animation: global-pulse 1.2s ease-in-out infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-white/[0.06]" style={{ background: 'rgba(15,17,23,0.95)' }}>
        <div className="flex items-center gap-4">
          {logoSrc && <img src={logoSrc} alt="Logo" className="h-7 w-auto object-contain opacity-70" />}
          <div className="h-4 w-px bg-white/10" />
          <div>
            <h1 className="text-sm font-black text-white/90 uppercase tracking-widest leading-none">Visão Global</h1>
            <p className="text-[10px] text-zinc-500 font-medium mt-0.5">Recursos por setor · Tempo real</p>
          </div>
          <div className="h-4 w-px bg-white/10" />
          {/* Legenda */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
              <span className="w-2 h-2 rounded-sm bg-red-500" /> Parada
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400">
              <span className="w-2 h-2 rounded-sm bg-amber-500" /> Op. em aberto
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Operacional
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Contadores */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black">
              {resumo.paradas} paradas
            </div>
            <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black">
              {resumo.andamento} andamento
            </div>
            <div className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
              {resumo.ok} ok
            </div>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <p className="text-base font-black global-font-mono tabular-nums text-white/80">
            {clockNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Online</span>
          </div>
        </div>
      </header>

      {/* ── COLUNAS DE SETORES: 2 FILEIRAS ── */}
      {(() => {
        const metade = Math.ceil(setoresComMaquinas.length / 2);
        const fileira1 = setoresComMaquinas.slice(0, metade);
        const fileira2 = setoresComMaquinas.slice(metade);

        const renderColuna = ([setor, maquinas]) => {
            const nParadas = maquinas.filter((m) => m.status === 'parada').length;
            const nAndamento = maquinas.filter((m) => m.status === 'andamento').length;

            const headerStyle = nParadas > 0
              ? { background: 'rgba(185,28,28,0.85)', borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }
              : nAndamento > 0
                ? { background: 'rgba(120,53,15,0.7)', borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d' }
                : { background: 'rgba(6,78,59,0.5)', borderColor: 'rgba(16,185,129,0.25)', color: '#6ee7b7' };

            return (
              <div key={setor} className="flex flex-col flex-1 min-w-0">
                {/* Cabeçalho do setor */}
                <div
                  className="shrink-0 px-2 py-1.5 rounded-t-xl text-center font-black text-[10px] uppercase tracking-widest border"
                  style={headerStyle}
                >
                  <div className="truncate">{setor}</div>
                  {(nParadas > 0 || nAndamento > 0) && (
                    <div className="text-[8px] font-bold opacity-80 mt-0.5">
                      {nParadas > 0 && `${nParadas} parada${nParadas > 1 ? 's' : ''}`}
                      {nParadas > 0 && nAndamento > 0 && ' · '}
                      {nAndamento > 0 && `${nAndamento} andamento`}
                    </div>
                  )}
                </div>

                {/* Lista de máquinas */}
                <div
                  className="flex-1 overflow-y-auto global-col-scroll flex flex-col gap-0.5 pt-0.5"
                  style={{ background: 'rgba(10,12,16,0.7)' }}
                >
                  {/* Paradas primeiro */}
                  {maquinas
                    .slice()
                    .sort((a, b) => {
                      const ord = { parada: 0, andamento: 1, ok: 2 };
                      return ord[a.status] - ord[b.status];
                    })
                    .map((maquina) => {
                      const isParada = maquina.status === 'parada';
                      const isAndamento = maquina.status === 'andamento';
                      const isOk = maquina.status === 'ok';

                      if (isOk) {
                        return (
                          <div
                            key={maquina.id}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg mx-0.5"
                            style={{ background: 'rgba(16,185,129,0.04)', borderLeft: '2px solid rgba(16,185,129,0.3)' }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <p className="text-[9px] font-semibold text-zinc-400 leading-tight truncate">
                              {maquina.nome}
                            </p>
                          </div>
                        );
                      }

                      const segundos = getSegundosParada(maquina.os, clockNow);
                      const tempo = formatarTempo(segundos);
                      const descricao = maquina.os?.sintoma || maquina.os?.descricao || maquina.os?.acaoImediata || '';
                      const responsavel = maquina.os?.responsavel
                        ? String(maquina.os.responsavel).split('@')[0]
                        : '';

                      const cardStyle = isParada
                        ? {
                            background: 'linear-gradient(135deg, rgba(127,29,29,0.9) 0%, rgba(69,10,10,0.95) 100%)',
                            border: '1px solid rgba(239,68,68,0.4)',
                          }
                        : {
                            background: 'linear-gradient(135deg, rgba(120,53,15,0.75) 0%, rgba(69,26,3,0.9) 100%)',
                            border: '1px solid rgba(245,158,11,0.3)',
                          };

                      const timerColor = isParada ? '#f87171' : '#fbbf24';
                      const dotClass = isParada ? 'bg-red-500 global-blink' : 'bg-amber-400';

                      return (
                        <div
                          key={maquina.id}
                          className="rounded-xl mx-0.5 p-2 flex flex-col gap-0.5"
                          style={cardStyle}
                        >
                          {/* Nome da máquina */}
                          <div className="flex items-start gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${dotClass}`} />
                            <p className="text-[10px] font-bold text-white leading-tight">
                              {maquina.nome}
                            </p>
                          </div>

                          {/* Timer */}
                          <p
                            className="global-font-mono tabular-nums font-black text-xl leading-none mt-0.5"
                            style={{ color: timerColor }}
                          >
                            {tempo}
                          </p>

                          {/* Descrição */}
                          {descricao ? (
                            <p className="text-[9px] text-zinc-300 leading-tight mt-0.5 line-clamp-2">
                              {descricao}
                            </p>
                          ) : (
                            <p className="text-[9px] text-zinc-500 italic">Sem descrição</p>
                          )}

                          {/* Responsável */}
                          {responsavel && (
                            <p className="text-[8px] text-zinc-400 font-semibold mt-0.5 truncate">
                              {responsavel}
                            </p>
                          )}

                          {/* Badge de status */}
                          <span
                            className="self-start text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-0.5"
                            style={
                              isParada
                                ? { background: 'rgba(239,68,68,0.25)', color: '#fca5a5' }
                                : { background: 'rgba(245,158,11,0.2)', color: '#fde68a' }
                            }
                          >
                            {isParada ? 'Parada' : 'Andamento'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
        };

        return (
          <div className="flex-1 min-h-0 flex flex-col gap-1 p-2 overflow-hidden">
            {/* Fileira 1 */}
            <div className="flex flex-1 min-h-0 gap-1">
              {fileira1.map(renderColuna)}
            </div>
            {/* Fileira 2 */}
            <div className="flex flex-1 min-h-0 gap-1">
              {fileira2.map(renderColuna)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DashboardGlobalTV;
