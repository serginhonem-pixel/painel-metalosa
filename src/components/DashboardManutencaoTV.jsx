import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, LayoutDashboard, Wrench, XCircle } from 'lucide-react';

const formatarTempoMin = (minutos) => {
  const total = Math.max(Math.round(minutos || 0), 0);
  const horas = Math.floor(total / 60);
  const mins = total % 60;
  if (horas > 0) {
    return `${horas.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  }
  return `${mins.toString().padStart(2, '0')}m`;
};

const parseTempoMin = (valor) => {
  if (!valor && valor !== 0) return 0;
  if (typeof valor === 'number') return valor;
  const texto = String(valor).toLowerCase().trim();
  const horasMatch = texto.match(/(\d+)\s*h/);
  const minsMatch = texto.match(/(\d+)\s*m/);
  if (horasMatch || minsMatch) {
    const horas = horasMatch ? parseInt(horasMatch[1], 10) : 0;
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    return horas * 60 + mins;
  }
  const numero = parseFloat(texto.replace(',', '.'));
  return Number.isFinite(numero) ? Math.round(numero) : 0;
};

const getParadaAtivaMin = (os, agora) => {
  const tempoParada = parseTempoMin(os?.tempoParada);
  if (tempoParada > 0) return tempoParada;
  const inicio = os?.dataFalha || os?.createdAt;
  if (!inicio) return 0;
  const inicioDate = new Date(inicio);
  if (Number.isNaN(inicioDate.getTime())) return 0;
  const diff = (agora.getTime() - inicioDate.getTime()) / 60000;
  return diff > 0 ? diff : 0;
};

const getFinalizadaMin = (os, agora) => {
  const tempo = parseTempoMin(os?.tempoParada);
  if (tempo > 0) return tempo;
  const inicio = os?.dataFalha || os?.createdAt;
  const fim = os?.fechadaEm || os?.updatedAt || agora;
  if (!inicio) return 0;
  const inicioDate = new Date(inicio);
  const fimDate = new Date(fim);
  if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(fimDate.getTime())) return 0;
  const diff = (fimDate.getTime() - inicioDate.getTime()) / 60000;
  return diff > 0 ? diff : 0;
};

const normalizarDiaSemana = (date) =>
  date
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '')
    .slice(0, 3)
    .replace(/^\w/, (char) => char.toUpperCase());

const DashboardManutencaoTV = ({ agora, manutencaoParadas, manutencaoOrdens, logoSrc }) => {
  const [systemStarted, setSystemStarted] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [clockNow, setClockNow] = useState(() => new Date());
  const prevIdsRef = useRef(new Set());
  const prevStateRef = useRef(new Map());
  const readyRef = useRef(false);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (manutencaoParadas.length <= 4) return undefined;
    const timer = setInterval(() => {
      setRotationIndex((prev) => (prev + 4) % manutencaoParadas.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [manutencaoParadas.length]);

  const paradasOrdenadas = useMemo(() => {
    return [...manutencaoParadas].sort((a, b) => getParadaAtivaMin(b, agora) - getParadaAtivaMin(a, agora));
  }, [manutencaoParadas, agora]);

  const paradasVisiveis = useMemo(() => {
    if (paradasOrdenadas.length <= 4) return paradasOrdenadas;
    const slice = paradasOrdenadas.slice(rotationIndex, rotationIndex + 4);
    if (slice.length === 4) return slice;
    return slice.concat(paradasOrdenadas.slice(0, 4 - slice.length));
  }, [paradasOrdenadas, rotationIndex]);

  const paradasCriticas = useMemo(() => {
    return manutencaoParadas.filter((os) => {
      const prioridade = (os?.prioridade || '').toLowerCase();
      const impacto = (os?.impacto || '').toLowerCase();
      return prioridade.includes('crit') || prioridade.includes('alta') || impacto.includes('alto');
    }).length;
  }, [manutencaoParadas]);

  const pendentes = useMemo(() => {
    return manutencaoOrdens.filter(
      (os) => os.status === 'Aberta' || os.status === 'Pendente' || os.status === 'Em andamento'
    ).length;
  }, [manutencaoOrdens]);

  const mediaReparo = useMemo(() => {
    const finalizadas = manutencaoOrdens.filter((os) => os.status === 'Finalizada');
    if (!finalizadas.length) return 0;
    const total = finalizadas.reduce((acc, os) => acc + getFinalizadaMin(os, agora), 0);
    return total / finalizadas.length;
  }, [manutencaoOrdens, agora]);

  const historico7Dias = useMemo(() => {
    const dias = Array.from({ length: 7 }).map((_, idx) => {
      const dia = new Date(agora);
      dia.setDate(agora.getDate() - (6 - idx));
      dia.setHours(0, 0, 0, 0);
      return dia;
    });

    const porDia = dias.map((dia) => ({
      label: normalizarDiaSemana(dia),
      key: dia.toISOString().slice(0, 10),
      abertas: 0,
      finalizadas: 0,
    }));

    const mapIndex = new Map(porDia.map((item, idx) => [item.key, idx]));

    manutencaoOrdens.forEach((os) => {
      const abertura = os.createdAt ? new Date(os.createdAt) : null;
      if (abertura && !Number.isNaN(abertura.getTime())) {
        const key = new Date(abertura.getFullYear(), abertura.getMonth(), abertura.getDate())
          .toISOString()
          .slice(0, 10);
        const idx = mapIndex.get(key);
        if (idx !== undefined) porDia[idx].abertas += 1;
      }
      const fechamento = os.fechadaEm ? new Date(os.fechadaEm) : null;
      if (fechamento && !Number.isNaN(fechamento.getTime())) {
        const key = new Date(fechamento.getFullYear(), fechamento.getMonth(), fechamento.getDate())
          .toISOString()
          .slice(0, 10);
        const idx = mapIndex.get(key);
        if (idx !== undefined) porDia[idx].finalizadas += 1;
      }
    });

    return porDia;
  }, [manutencaoOrdens, agora]);

  const playAlertSound = () => {
    if (!audioCtxRef.current) return;
    const audioCtx = audioCtxRef.current;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.05);

    // Sirene: varre entre 520Hz e 980Hz por ~2.2s
    const start = audioCtx.currentTime;
    const sweepUp = 0.35;
    const sweepDown = 0.35;
    let t = start;
    for (let i = 0; i < 3; i += 1) {
      oscillator.frequency.setValueAtTime(520, t);
      oscillator.frequency.exponentialRampToValueAtTime(980, t + sweepUp);
      oscillator.frequency.exponentialRampToValueAtTime(520, t + sweepUp + sweepDown);
      t += sweepUp + sweepDown;
    }

    gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start(start);
    oscillator.stop(t + 0.3);
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance();
    msg.text = text;
    msg.lang = 'pt-BR';
    msg.rate = 0.95;
    msg.pitch = 0.8;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((voice) => voice.lang.includes('pt-BR') && (voice.name.includes('Google') || voice.name.includes('Daniel'))) ||
      voices.find((voice) => voice.lang.includes('pt-BR'));
    if (preferred) msg.voice = preferred;
    window.speechSynthesis.speak(msg);
  };

  const closeNotification = (id) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, closing: true } : item))
    );
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, 500);
  };

  const triggerNotification = (os, override = {}) => {
    const id = `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const prioridade = (os?.prioridade || '').toLowerCase();
    const tipo = (os?.tipo || '').toLowerCase();
    let severity = 'red';
    if (tipo.includes('preventiva')) severity = 'amber';
    if (prioridade.includes('baixa')) severity = 'blue';

    const notif = {
      id,
      severity: override.severity || severity,
      machine: os?.ativo || os?.setor || 'Equipamento',
      tech: os?.responsavel || os?.solicitante || 'Equipe',
      reason: override.reason || os?.sintoma || os?.descricao || 'Nova ocorrência registrada.',
    };
    setNotifications((prev) => [notif, ...prev].slice(0, 4));
    playAlertSound();
    speakText(`Alerta na ${notif.machine}. ${notif.reason}.`);
    setTimeout(() => closeNotification(id), 8000);
  };

  useEffect(() => {
    const ids = new Set(manutencaoOrdens.map((os) => os.id));
    const nextMap = new Map(
      manutencaoOrdens.map((os) => [
        os.id,
        {
          status: os.status,
          statusMaquina: os.statusMaquina,
          responsavel: os.responsavel,
          fechado: os.fechadaEm,
        },
      ])
    );

    if (!readyRef.current) {
      prevIdsRef.current = ids;
      prevStateRef.current = nextMap;
      readyRef.current = true;
      return;
    }
    if (!systemStarted) {
      prevIdsRef.current = ids;
      prevStateRef.current = nextMap;
      return;
    }

    const novos = manutencaoOrdens.filter((os) => !prevIdsRef.current.has(os.id));
    novos.forEach((os) => triggerNotification(os));

    manutencaoOrdens.forEach((os) => {
      const prev = prevStateRef.current.get(os.id);
      if (!prev) return;
      const statusMudou = prev.status !== os.status;
      const maquinaMudou = prev.statusMaquina !== os.statusMaquina;
      const respMudou = (prev.responsavel || '').toLowerCase() !== (os.responsavel || '').toLowerCase();

      if (respMudou && os.responsavel) {
        triggerNotification(os, {
          severity: 'blue',
          reason: `OS assumida por ${os.responsavel}.`,
        });
      }

      if (statusMudou && os.status) {
        if (os.status.toLowerCase().includes('andamento')) {
          triggerNotification(os, {
            severity: 'amber',
            reason: 'Serviço em andamento.',
          });
        }
        if (os.status.toLowerCase().includes('finalizada')) {
          triggerNotification(os, {
            severity: 'blue',
            reason: 'Serviço finalizado.',
          });
        }
      }

      if (maquinaMudou && os.statusMaquina) {
        if (os.statusMaquina.toLowerCase().includes('rodando')) {
          triggerNotification(os, {
            severity: 'blue',
            reason: 'Máquina liberada.',
          });
        }
        if (os.statusMaquina.toLowerCase().includes('parada')) {
          triggerNotification(os, {
            severity: 'red',
            reason: 'Máquina parada novamente.',
          });
        }
      }
    });

    prevIdsRef.current = ids;
    prevStateRef.current = nextMap;
  }, [manutencaoOrdens, systemStarted]);

  const startSystem = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    setSystemStarted(true);
    window.speechSynthesis?.getVoices?.();
    speakText('Sistema de monitoramento Metalosa ativo. Monitorização de rede iniciada.');
  };

  const cards = paradasVisiveis.length ? paradasVisiveis : [];
  const placeholders = Math.max(0, 4 - cards.length);

  return (
    <div className="relative h-full w-full overflow-hidden text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&display=swap');

        .font-mono {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .card-shadow {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        @keyframes slideIn {
          0% { transform: translateX(120%) scale(0.8); opacity: 0; }
          70% { transform: translateX(-10px) scale(1.05); opacity: 1; }
          100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(120%) scale(0.9); opacity: 0; }
        }
        @keyframes progress {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes glowPulse {
          0% { box-shadow: 0 0 5px rgba(239, 68, 68, 0); }
          50% { box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); }
          100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0); }
        }
        .notification-in {
          animation: slideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards,
                     shake 0.4s ease-in-out 0.5s,
                     glowPulse 2s infinite ease-in-out;
        }
        .notification-out {
          animation: slideOut 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .progress-bar-fill {
          animation: progress 8s linear forwards;
        }
        .glass {
          background: rgba(24, 24, 27, 0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
      `}</style>

      {!systemStarted && (
        <button
          type="button"
          onClick={startSystem}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f1117]/95"
        >
          <div className="mb-6 rounded-2xl bg-white/5 px-6 py-4 border border-white/10 shadow-2xl">
            {logoSrc ? (
              <img src={logoSrc} alt="Metalosa" className="h-12 w-auto object-contain" />
            ) : (
              <LayoutDashboard size={48} className="text-white" />
            )}
          </div>
          <h2 className="text-2xl font-black tracking-tight mb-2">METALOSA</h2>
          <p className="text-zinc-400 font-bold uppercase tracking-widest animate-bounce">
            Clique para iniciar monitorização
          </p>
        </button>
      )}

      <div className={`h-full w-full p-6 lg:p-8 flex flex-col gap-6 transition-opacity duration-700 ${systemStarted ? 'opacity-100' : 'opacity-20'}`}>
        <main className="flex flex-1 gap-6 min-h-0 overflow-hidden">
          <div className="flex-[1.8] flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">Ocorrências ativas</h2>
              <div className="px-3 py-1 bg-zinc-800 rounded text-xs font-bold text-zinc-400 border border-white/5">
                DISPOSITIVOS: <span className="text-white">{manutencaoParadas.length}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              {cards.map((os) => {
                const prioridade = (os?.prioridade || '').toLowerCase();
                const tipo = (os?.tipo || '').toLowerCase();
                const isCritico = prioridade.includes('crit') || prioridade.includes('alta');
                const isPreventiva = tipo.includes('preventiva');
                const badge = isPreventiva ? 'PREVENTIVA' : isCritico ? 'CRITICO' : 'CORRETIVA';
                const badgeClass = isPreventiva ? 'bg-amber-500' : 'bg-red-500';
                const borderClass = isPreventiva
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-red-500/40 bg-red-500/5';
                const tempo = formatarTempoMin(getParadaAtivaMin(os, agora));
                return (
                  <div key={os.id} className={`flex flex-col border rounded-2xl p-5 card-shadow ${borderClass} h-full justify-between`}>
                    <div className="flex justify-between items-start">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded text-white uppercase ${badgeClass}`}>{badge}</span>
                      <span className={`text-3xl font-bold font-mono tabular-nums leading-none ${isPreventiva ? 'text-amber-500' : 'text-red-500'}`}>
                        {tempo}
                      </span>
                    </div>
                    <div className="mt-2">
                      <h3 className="text-xl font-extrabold text-white leading-tight mb-1 truncate">
                        {os?.ativo || os?.processo || os?.setor || 'Equipamento'}
                      </h3>
                      <p className="text-zinc-400 text-xs italic flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isPreventiva ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`}></span>
                        {os?.sintoma || os?.descricao || os?.acaoImediata || 'Sem detalhes'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: placeholders }).map((_, idx) => (
                <div key={`placeholder-${idx}`} className="flex flex-col border border-white/5 rounded-2xl p-5 bg-zinc-900/40 h-full justify-center text-zinc-500 text-xs">
                  Nenhum equipamento nesta posicao.
                </div>
              ))}
            </div>
          </div>

          <div className="flex-[1.2] flex flex-col gap-6 shrink-0">
            <div className="bg-zinc-900/80 border border-white/10 rounded-3xl p-6 card-shadow relative overflow-hidden flex flex-col justify-center shrink-0 h-[160px]">
              <div className="absolute top-0 left-0 w-2 h-full bg-red-600"></div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-zinc-500 font-bold uppercase text-xs tracking-widest">Paradas críticas</span>
                <AlertTriangle size={28} className="text-red-600" />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-7xl font-black leading-none tracking-tighter">
                  {paradasCriticas.toString().padStart(2, '0')}
                </span>
                <span className="text-zinc-400 font-bold text-lg uppercase leading-none">
                  Equipamentos<br />
                  <span className="text-red-500">Parados agora</span>
                </span>
              </div>
            </div>

            <div className="flex-1 bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Histórico de OS (7 dias)</h3>
                <div className="flex gap-4 text-[10px] font-bold uppercase">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Abertas</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Finalizadas</span>
                </div>
              </div>
              <div className="flex-1 flex items-end gap-3">
                {historico7Dias.map((dia) => {
                  const maxValor = Math.max(
                    1,
                    ...historico7Dias.map((item) => Math.max(item.abertas, item.finalizadas))
                  );
                  const abertoH = (dia.abertas / maxValor) * 100;
                  const finalH = (dia.finalizadas / maxValor) * 100;
                  return (
                    <div key={dia.key} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex items-end gap-2 h-32">
                        <div className="flex-1 bg-blue-500/80 rounded-md" style={{ height: `${abertoH}%` }}></div>
                        <div className="flex-1 bg-emerald-500/80 rounded-md" style={{ height: `${finalH}%` }}></div>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">{dia.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 shrink-0">
              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest mb-1">Pendente</p>
                  <span className="text-3xl font-bold italic">{pendentes}</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center shrink-0">
                  <LayoutDashboard size={20} className="text-blue-600" />
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest mb-1">TMR médio</p>
                  <span className="text-3xl font-bold italic text-amber-500">{formatarTempoMin(mediaReparo)}</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-600/10 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-amber-500" />
                </div>
              </div>
            </div>
          </div>
        </main>

        <div className="fixed top-8 right-8 z-50 flex flex-col gap-4 pointer-events-none">
          {notifications.map((notif) => {
            const colors = {
              red: { bg: 'bg-red-600', text: 'text-red-400', border: 'border-red-600/50', label: 'URGENTE' },
              amber: { bg: 'bg-amber-600', text: 'text-amber-400', border: 'border-amber-600/50', label: 'AVISO' },
              blue: { bg: 'bg-blue-600', text: 'text-blue-400', border: 'border-blue-600/50', label: 'INFO' },
            };
            const c = colors[notif.severity] || colors.red;
            return (
              <div
                key={notif.id}
                className={`${notif.closing ? 'notification-out' : 'notification-in'} glass border-2 ${c.border} p-6 rounded-2xl shadow-2xl w-[420px] pointer-events-auto relative overflow-hidden`}
              >
                <div className="absolute bottom-0 left-0 h-1.5 bg-white/10 w-full">
                  <div className={`progress-bar-fill h-full ${c.bg}`}></div>
                </div>
                <div className="flex gap-5">
                  <div className="shrink-0">
                    <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center border border-white/20`}>
                      <Wrench size={30} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[11px] font-black ${c.text} uppercase tracking-[0.2em]`}>{c.label}</span>
                      <button
                        type="button"
                        onClick={() => closeNotification(notif.id)}
                        className="text-zinc-500 hover:text-white"
                      >
                        <XCircle size={20} />
                      </button>
                    </div>
                    <h4 className="text-white font-black text-xl mb-1 truncate">{notif.machine}</h4>
                    <p className="text-zinc-300 text-sm font-semibold italic mb-4">{notif.reason}</p>
                    <div className="flex items-center justify-between bg-zinc-800/50 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-black text-white uppercase">
                          {notif.tech.substring(0, 2)}
                        </div>
                        <div>
                          <p className="text-[9px] text-zinc-500 font-bold leading-none mb-0.5 uppercase">Técnico</p>
                          <span className="text-white text-xs font-bold uppercase">{notif.tech}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardManutencaoTV;
