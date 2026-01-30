import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, LayoutDashboard, Wrench, XCircle } from 'lucide-react';

const formatarTempoCronometro = (segundos) => {
  const total = Math.max(Math.round(segundos || 0), 0);
  const horas = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${horas.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
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

const getParadaAtivaSeconds = (os, agora) => {
  const tempoParada = parseTempoMin(os?.tempoParada);
  if (tempoParada > 0) return tempoParada * 60;
  const inicio = os?.dataFalha || os?.createdAt;
  if (!inicio) return 0;
  const inicioDate = new Date(inicio);
  if (Number.isNaN(inicioDate.getTime())) return 0;
  const diff = (agora.getTime() - inicioDate.getTime()) / 1000;
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
  const [listaAtivaIndex, setListaAtivaIndex] = useState(0);
  const [ultimoAlertPendentes, setUltimoAlertPendentes] = useState(null);
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

  useEffect(() => {
    const timer = setInterval(() => {
      setListaAtivaIndex((prev) => (prev + 1) % 3);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!systemStarted) return undefined;

    const checkPendentes = () => {
      const pendentes = manutencaoParadas.filter(
        (os) => !String(os?.responsavel || '').trim()
      );
      if (!pendentes.length) return;
      const agoraMs = Date.now();
      if (ultimoAlertPendentes && agoraMs - ultimoAlertPendentes < 120000) {
        return;
      }
      const os = pendentes[0];
      triggerNotification(os, {
        severity: 'red',
        sound: 'alert',
        reason: 'Máquina parada sem responsável.',
      });
      setUltimoAlertPendentes(agoraMs);
    };

    checkPendentes();
    const timer = setInterval(checkPendentes, 30000);
    return () => clearInterval(timer);
  }, [manutencaoParadas, systemStarted, ultimoAlertPendentes]);

  const paradasOrdenadas = useMemo(() => {
    const lista = manutencaoParadas.filter(
      (os) => !String(os.status || '').toLowerCase().includes('andamento')
    );
    return [...lista].sort((a, b) => getParadaAtivaMin(b, agora) - getParadaAtivaMin(a, agora));
  }, [manutencaoParadas, agora]);

  const emAndamentoOrdenadas = useMemo(() => {
    const lista = manutencaoOrdens.filter((os) =>
      String(os.status || '').toLowerCase().includes('andamento')
    );
    return [...lista].sort((a, b) => getParadaAtivaMin(b, agora) - getParadaAtivaMin(a, agora));
  }, [manutencaoOrdens, agora]);

  const liberadasOrdenadas = useMemo(() => {
    const hoje = new Date(agora);
    hoje.setHours(0, 0, 0, 0);
    const inicioHoje = hoje.getTime();
    const fimHoje = inicioHoje + 24 * 60 * 60 * 1000;
    const lista = manutencaoOrdens.filter((os) => {
      const status = String(os.status || '').toLowerCase();
      const statusMaquina = String(os.statusMaquina || '').toLowerCase();
      if (!(status.includes('finalizada') || statusMaquina.includes('rodando'))) {
        return false;
      }
      const baseDate = new Date(os.fechadaEm || os.updatedAt || os.createdAt || 0);
      if (Number.isNaN(baseDate.getTime())) return false;
      const t = baseDate.getTime();
      return t >= inicioHoje && t < fimHoje;
    });
    return [...lista].sort((a, b) => {
      const aTime = new Date(a.fechadaEm || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.fechadaEm || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [manutencaoOrdens, agora]);

  const getVisiveis = (lista) => {
    if (lista.length <= 4) return lista;
    const slice = lista.slice(rotationIndex, rotationIndex + 4);
    if (slice.length === 4) return slice;
    return slice.concat(lista.slice(0, 4 - slice.length));
  };

  const listaRotativa = useMemo(() => {
    if (listaAtivaIndex === 0) {
      return { titulo: 'Ocorrencias ativas', tipo: 'paradas', itens: getVisiveis(paradasOrdenadas) };
    }
    if (listaAtivaIndex === 1) {
      return { titulo: 'Em andamento', tipo: 'andamento', itens: getVisiveis(emAndamentoOrdenadas) };
    }
    return { titulo: 'Ultimas liberadas', tipo: 'liberadas', itens: getVisiveis(liberadasOrdenadas) };
  }, [listaAtivaIndex, paradasOrdenadas, emAndamentoOrdenadas, liberadasOrdenadas, rotationIndex]);

  const totalPorTipo = useMemo(
    () => ({
      paradas: paradasOrdenadas.length,
      andamento: emAndamentoOrdenadas.length,
      liberadas: liberadasOrdenadas.length,
    }),
    [paradasOrdenadas.length, emAndamentoOrdenadas.length, liberadasOrdenadas.length]
  );

  const kpiConfig = useMemo(() => {
    if (listaRotativa.tipo === 'andamento') {
      return {
        titulo: 'Servicos em andamento',
        destaque: 'EM ANDAMENTO AGORA',
        cor: 'blue',
        total: totalPorTipo.andamento,
      };
    }
    if (listaRotativa.tipo === 'liberadas') {
      return {
        titulo: 'Ultimas liberadas',
        destaque: 'LIBERADAS HOJE',
        cor: 'emerald',
        total: totalPorTipo.liberadas,
      };
    }
    return {
      titulo: 'Paradas criticas',
      destaque: 'PARADOS AGORA',
      cor: 'red',
      total: totalPorTipo.paradas,
    };
  }, [listaRotativa.tipo, totalPorTipo]);

  const formatarResponsavel = (valor) => {
    const raw = String(valor || '').trim();
    if (!raw) return 'Nao definido';
    const email = raw.toLowerCase();
    if (email === 'pcp@metalosa.com.br') return 'Sergio Betini';
    if (email === 'wilson@metalosa.com.br') return 'Wilson';
    if (email === 'industria@metalosa.com.br') return 'Leandro Freitas';
    if (email === 'manutencao@metalosa.com.br') return 'Manutencao';
    return raw;
  };

  const equipeManutencao = useMemo(
    () => [
      { nome: 'Judismar', area: 'Mecanico' },
      { nome: 'Marlon', area: 'Mecanico' },
      { nome: 'Alex', area: 'Mecanico' },
      { nome: 'Guilherme', area: 'Mecanico' },
      { nome: 'Jose Fernando', area: 'Mecanico' },
      { nome: 'Luizma', area: 'Caldeiraria' },
      { nome: 'Cristiano', area: 'Caldeiraria' },
      { nome: 'Juliano', area: 'Eletricista' },
      { nome: 'Rogerio', area: 'Eletricista' },
      { nome: 'Matheus', area: 'Eletricista' },
    ],
    []
  );

  const equipeStatus = useMemo(() => {
    const normalizar = (valor) =>
      String(valor || '')
        .trim()
        .toLowerCase();
    return equipeManutencao.map((colab) => {
      const nomeNorm = normalizar(colab.nome);
      const osAtivas = manutencaoOrdens.filter((os) => {
        const resp = normalizar(os.responsavel);
        const status = String(os.status || '').toLowerCase();
        return resp === nomeNorm && !status.includes('finalizada') && !status.includes('cancelada');
      });
      if (!osAtivas.length) {
        return {
          ...colab,
          status: 'Disponivel',
          maquina: 'Sem alocacao',
          tone: 'emerald',
        };
      }
      const os = [...osAtivas].sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      })[0];
      const status = String(os.status || '').toLowerCase();
      const statusMaquina = String(os.statusMaquina || '').toLowerCase();
      let label = 'Em atendimento';
      let tone = 'blue';
      if (status.includes('andamento')) {
        label = 'Em atendimento';
        tone = 'blue';
      } else if (statusMaquina.includes('parada')) {
        label = 'Parada';
        tone = 'red';
      } else if (status.includes('aberta')) {
        label = 'Pendente';
        tone = 'amber';
      }
      return {
        ...colab,
        status: label,
        maquina: os.ativo || os.setor || 'Equipamento',
        tone,
      };
    });
  }, [equipeManutencao, manutencaoOrdens]);

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

  const playAlertSound = (mode = 'alert') => {
    if (!audioCtxRef.current) return;
    const audioCtx = audioCtxRef.current;
    const start = audioCtx.currentTime;

    if (mode === 'alert') {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sawtooth';
      gainNode.gain.setValueAtTime(0.0, start);
      gainNode.gain.linearRampToValueAtTime(0.06, start + 0.05);

      // Sirene: varre entre 520Hz e 980Hz por ~2.2s
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
      return;
    }

    // Sons positivos (andamento / liberada)
    const gainNode = audioCtx.createGain();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.0, start);
    gainNode.gain.linearRampToValueAtTime(0.05, start + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

    if (mode === 'in_progress') {
      oscillator.frequency.setValueAtTime(523, start); // C5
      oscillator.frequency.exponentialRampToValueAtTime(659, start + 0.18); // E5
      oscillator.frequency.exponentialRampToValueAtTime(784, start + 0.36); // G5
    } else if (mode === 'released') {
      oscillator.frequency.setValueAtTime(784, start); // G5
      oscillator.frequency.exponentialRampToValueAtTime(988, start + 0.2); // B5
      oscillator.frequency.exponentialRampToValueAtTime(1175, start + 0.4); // D6
      oscillator.frequency.exponentialRampToValueAtTime(1568, start + 0.6); // G6
    } else {
      oscillator.frequency.setValueAtTime(659, start); // E5
      oscillator.frequency.exponentialRampToValueAtTime(784, start + 0.2); // G5
      oscillator.frequency.exponentialRampToValueAtTime(1047, start + 0.4); // C6
    }

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.65);
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
    const soundMode = override.sound || (notif.severity === 'red' ? 'alert' : 'success');
    playAlertSound(soundMode);
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
          sound: 'success',
          reason: `OS assumida por ${os.responsavel}.`,
        });
      }

      if (statusMudou && os.status) {
        if (os.status.toLowerCase().includes('andamento')) {
          triggerNotification(os, {
            severity: 'amber',
            sound: 'in_progress',
            reason: 'Serviço em andamento.',
          });
        }
        if (os.status.toLowerCase().includes('finalizada')) {
          triggerNotification(os, {
            severity: 'blue',
            sound: 'success',
            reason: 'Serviço finalizado.',
          });
        }
      }

      if (maquinaMudou && os.statusMaquina) {
        if (os.statusMaquina.toLowerCase().includes('rodando')) {
          triggerNotification(os, {
            severity: 'blue',
            sound: 'released',
            reason: 'Máquina liberada.',
          });
        }
        if (os.statusMaquina.toLowerCase().includes('parada')) {
          triggerNotification(os, {
            severity: 'red',
            sound: 'alert',
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
    speakText('Sistema ativo.');
  };

  const cards = listaRotativa.itens.length ? listaRotativa.itens : [];
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

      <div className={`h-full w-full p-6 lg:p-7 flex flex-col gap-6 transition-opacity duration-700 ${systemStarted ? 'opacity-100' : 'opacity-20'}`}>
        <main className="flex flex-1 gap-6 min-h-0 overflow-hidden">
          <div className="flex-[1.8] flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">
                {listaRotativa.titulo}
              </h2>
              <div className="px-3 py-1 bg-zinc-800 rounded text-xs font-bold text-zinc-400 border border-white/5">
                DISPOSITIVOS: <span className="text-white">{listaRotativa.itens.length}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 auto-rows-[220px] flex-1 min-h-0">
              {cards.map((os) => {
                const prioridade = (os?.prioridade || '').toLowerCase();
                const tipo = (os?.tipo || '').toLowerCase();
                const isCritico = prioridade.includes('crit') || prioridade.includes('alta');
                const isPreventiva = tipo.includes('preventiva');
                const badge = isPreventiva ? 'PREVENTIVA' : isCritico ? 'CRITICO' : 'CORRETIVA';
                const isLiberada = listaRotativa.tipo === 'liberadas';
                const isAndamento = listaRotativa.tipo === 'andamento';
                const badgeClass = isLiberada
                  ? 'bg-emerald-500'
                  : isAndamento
                    ? 'bg-blue-500'
                    : isPreventiva
                      ? 'bg-amber-500'
                      : 'bg-red-500';
                const borderClass = isLiberada
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : isAndamento
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : isPreventiva
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-red-500/40 bg-red-500/5';
                const tempo = isLiberada
                  ? formatarTempoCronometro(getFinalizadaMin(os, agora) * 60)
                  : formatarTempoCronometro(getParadaAtivaSeconds(os, clockNow));
                return (
                  <div
                    key={os.id}
                    className={`flex flex-col border rounded-2xl p-5 card-shadow ${borderClass} h-[220px] justify-between`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded text-white uppercase ${badgeClass}`}>{badge}</span>
                      <span className={`text-4xl font-bold font-mono tabular-nums leading-none ${isLiberada ? 'text-emerald-400' : isAndamento ? 'text-blue-400' : isPreventiva ? 'text-amber-500' : 'text-red-500'}`}>
                        {tempo}
                      </span>
                    </div>
                    <div className="mt-2">
                      <p className="text-[13px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Maquina</p>
                      <h3 className="text-3xl font-extrabold text-white leading-tight mb-1 truncate">
                        {os?.ativo || os?.processo || os?.setor || 'Equipamento'}
                      </h3>
                      <p className="text-[13px] uppercase tracking-widest text-zinc-500 font-bold mt-2">Responsavel</p>
                      <p className="text-base text-zinc-100 font-semibold truncate">
                        {formatarResponsavel(os?.responsavel || os?.solicitante)}
                      </p>
                      <p className="text-zinc-300 text-base italic flex items-center gap-2 mt-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isLiberada ? 'bg-emerald-400' : isAndamento ? 'bg-blue-400' : isPreventiva ? 'bg-amber-500' : 'bg-red-500'} ${isLiberada ? '' : 'animate-pulse'}`}></span>
                        {os?.sintoma || os?.descricao || os?.acaoImediata || 'Sem detalhes'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: placeholders }).map((_, idx) => (
                <div key={`placeholder-${idx}`} className="flex flex-col border border-white/5 rounded-2xl p-5 bg-zinc-900/40 h-[220px] justify-center text-zinc-500 text-xs">
                  Nenhum equipamento nesta posicao.
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 shrink-0 mt-4">
              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-7 flex items-center justify-between h-60">
                <div>
                  <p className="text-zinc-400 font-bold uppercase text-[14px] tracking-widest mb-1">OS abertas hoje</p>
                  <span className="text-7xl font-black italic text-blue-300">
                    {historico7Dias[historico7Dias.length - 1]?.abertas || 0}
                  </span>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center shrink-0">
                  <LayoutDashboard size={32} className="text-blue-400" />
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-7 flex items-center justify-between h-60">
                <div>
                  <p className="text-zinc-400 font-bold uppercase text-[14px] tracking-widest mb-1">OS finalizadas hoje</p>
                  <span className="text-7xl font-black italic text-emerald-300">
                    {historico7Dias[historico7Dias.length - 1]?.finalizadas || 0}
                  </span>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center shrink-0">
                  <LayoutDashboard size={32} className="text-emerald-300" />
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex flex-col shrink-0 mt-4">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Histórico de OS (7 dias)</h3>
                <div className="flex gap-4 text-[10px] font-bold uppercase">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Abertas</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Finalizadas</span>
                </div>
              </div>
              <div className="flex items-end gap-3 h-32">
                {historico7Dias.map((dia) => {
                  const maxValor = Math.max(
                    1,
                    ...historico7Dias.map((item) => Math.max(item.abertas, item.finalizadas))
                  );
                  const abertoH = (dia.abertas / maxValor) * 100;
                  const finalH = (dia.finalizadas / maxValor) * 100;
                  return (
                    <div key={dia.key} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end gap-2 h-32">
                        <div className="flex-1 bg-blue-500/80 rounded-md" style={{ height: `${abertoH}%` }}></div>
                        <div className="flex-1 bg-emerald-500/80 rounded-md" style={{ height: `${finalH}%` }}></div>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase -mt-1">{dia.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-[1.2] flex flex-col gap-6 shrink-0">
            <div className="bg-zinc-900/80 border border-white/10 rounded-3xl p-6 card-shadow relative overflow-hidden flex flex-col justify-center shrink-0 h-[160px]">
              <div
                className={`absolute top-0 left-0 w-2 h-full ${
                  kpiConfig.cor === 'emerald'
                    ? 'bg-emerald-500'
                    : kpiConfig.cor === 'blue'
                      ? 'bg-blue-500'
                      : 'bg-red-600'
                }`}
              ></div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-zinc-500 font-bold uppercase text-xs tracking-widest">{kpiConfig.titulo}</span>
                <AlertTriangle
                  size={28}
                  className={
                    kpiConfig.cor === 'emerald'
                      ? 'text-emerald-500'
                      : kpiConfig.cor === 'blue'
                        ? 'text-blue-500'
                        : 'text-red-600'
                  }
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-7xl font-black leading-none tracking-tighter">
                  {kpiConfig.total.toString().padStart(2, '0')}
                </span>
                <span className="text-zinc-400 font-bold text-lg uppercase leading-none">
                  Equipamentos<br />
                  <span
                    className={
                      kpiConfig.cor === 'emerald'
                        ? 'text-emerald-400'
                        : kpiConfig.cor === 'blue'
                          ? 'text-blue-400'
                          : 'text-red-500'
                    }
                  >
                    {kpiConfig.destaque}
                  </span>
                </span>
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
                  <span className="text-3xl font-bold italic text-amber-500">
                    {formatarTempoCronometro(mediaReparo * 60)}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-600/10 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-amber-500" />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-zinc-900/40 p-5 flex flex-col gap-4 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Equipe de manutencao</h3>
                <span className="text-[10px] font-bold text-zinc-400">{equipeStatus.length} pessoas</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {equipeStatus.map((colab) => (
                  <div key={colab.nome} className="rounded-xl border border-white/5 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-white truncate">{colab.nome}</p>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          colab.tone === 'emerald'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : colab.tone === 'blue'
                              ? 'bg-blue-500/20 text-blue-200'
                              : colab.tone === 'amber'
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-red-500/20 text-red-200'
                        }`}
                      >
                        {colab.status}
                      </span>
                    </div>
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mt-2">{colab.area}</p>
                    <p className="text-base text-zinc-300 mt-1 truncate">{colab.maquina}</p>
                  </div>
                ))}
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
