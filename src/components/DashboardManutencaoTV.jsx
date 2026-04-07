import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, LayoutDashboard, Pause, Play, Settings, Shield, Users, Wrench, XCircle, Zap } from 'lucide-react';

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
      { nome: 'Timoteo Vaz', area: 'Ferramenteiro' },
      { nome: 'Jose Ricardo', area: 'Ferramenteiro' },
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

  const tabs = [
    { idx: 0, label: 'Paradas', icon: Pause, count: totalPorTipo.paradas, color: 'red' },
    { idx: 1, label: 'Andamento', icon: Play, count: totalPorTipo.andamento, color: 'blue' },
    { idx: 2, label: 'Liberadas', icon: CheckCircle2, count: totalPorTipo.liberadas, color: 'emerald' },
  ];

  const disponiveis = equipeStatus.filter((c) => c.tone === 'emerald').length;
  const ocupados = equipeStatus.length - disponiveis;

  return (
    <div className="relative h-full w-full overflow-hidden text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700;800&display=swap');

        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .card-shadow { box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04); }
        .card-glow-red { box-shadow: 0 0 40px rgba(239,68,68,0.12), 0 4px 24px rgba(0,0,0,0.35); }
        .card-glow-blue { box-shadow: 0 0 40px rgba(59,130,246,0.12), 0 4px 24px rgba(0,0,0,0.35); }
        .card-glow-emerald { box-shadow: 0 0 40px rgba(16,185,129,0.12), 0 4px 24px rgba(0,0,0,0.35); }

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
          0% { box-shadow: 0 0 5px rgba(239,68,68,0); }
          50% { box-shadow: 0 0 30px rgba(239,68,68,0.4); }
          100% { box-shadow: 0 0 5px rgba(239,68,68,0); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .notification-in {
          animation: slideIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards,
                     shake 0.4s ease-in-out 0.5s,
                     glowPulse 2s infinite ease-in-out;
        }
        .notification-out { animation: slideOut 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
        .progress-bar-fill { animation: progress 8s linear forwards; }
        .glass {
          background: rgba(15,17,23,0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .glass-card {
          background: linear-gradient(135deg, rgba(30,32,44,0.7) 0%, rgba(20,22,30,0.9) 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .animate-breathe { animation: breathe 3s ease-in-out infinite; }
        .animate-fade-up { animation: fadeSlideUp 0.5s ease-out both; }
        .tab-active { background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%); }
        .gradient-bg {
          background: linear-gradient(-45deg, #0f1117, #151822, #111827, #0c0f15);
          background-size: 400% 400%;
          animation: gradientShift 15s ease infinite;
        }
      `}</style>

      {/* ──── TELA DE INÍCIO ──── */}
      {!systemStarted && (
        <button
          type="button"
          onClick={startSystem}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gradient-bg"
        >
          {/* Scanline decorativo */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
            <div className="w-full h-px bg-white" style={{ animation: 'scanline 4s linear infinite' }} />
          </div>
          {/* Grade decorativa sutil */}
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

          <div className="relative mb-8">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-blue-500/20 via-transparent to-emerald-500/20 blur-xl opacity-60" />
            <div className="relative rounded-2xl bg-white/[0.06] px-8 py-5 border border-white/10 shadow-2xl backdrop-blur-sm">
              {logoSrc ? (
                <img src={logoSrc} alt="Metalosa" className="h-14 w-auto object-contain" />
              ) : (
                <Shield size={52} className="text-white/80" />
              )}
            </div>
          </div>
          <h2 className="text-3xl font-black tracking-[-0.02em] mb-1 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            GESTÃO DE MANUTENÇÃO
          </h2>
          <p className="text-zinc-500 text-sm font-medium mb-8">Monitoramento industrial em tempo real</p>
          <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-all duration-300 group">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-zinc-300 uppercase tracking-widest group-hover:text-white transition-colors">
              Iniciar monitorização
            </span>
          </div>
          <div className="mt-10 flex gap-6 text-[10px] text-zinc-600 font-medium uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Wrench size={12} /> Manutenção</span>
            <span className="flex items-center gap-1.5"><Zap size={12} /> Tempo real</span>
            <span className="flex items-center gap-1.5"><Users size={12} /> Equipe</span>
          </div>
        </button>
      )}

      {/* ──── PAINEL PRINCIPAL ──── */}
      <div className={`h-full w-full flex flex-col transition-opacity duration-700 ${systemStarted ? 'opacity-100' : 'opacity-20'}`}>

        {/* ── HEADER ── */}
        <header className="shrink-0 flex items-center justify-between px-7 py-3 border-b border-white/[0.06] bg-[#0f1117]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className="h-8 w-auto object-contain opacity-80" />
            ) : (
              <Shield size={24} className="text-zinc-400" />
            )}
            <div className="h-5 w-px bg-white/10" />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white/90">Gestão de Manutenção</h1>
              <p className="text-[10px] text-zinc-500 font-medium">Painel de monitoramento industrial</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Status badges */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                <Pause size={11} className="text-red-400" />
                <span className="text-[11px] font-bold text-red-400">{totalPorTipo.paradas}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Play size={11} className="text-blue-400" />
                <span className="text-[11px] font-bold text-blue-400">{totalPorTipo.andamento}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span className="text-[11px] font-bold text-emerald-400">{totalPorTipo.liberadas}</span>
              </div>
            </div>

            <div className="h-5 w-px bg-white/10" />

            {/* Relógio */}
            <div className="text-right">
              <p className="text-lg font-bold font-mono tabular-nums text-white/90 leading-none">
                {clockNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <p className="text-[10px] text-zinc-500 font-medium mt-0.5">
                {clockNow.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
              </p>
            </div>

            {/* Status do sistema */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Online</span>
            </div>
          </div>
        </header>

        {/* ── CONTEÚDO ── */}
        <main className="flex flex-1 gap-5 min-h-0 overflow-hidden p-5">

          {/* ─── COLUNA ESQUERDA ─── */}
          <div className="flex-[1.8] flex flex-col min-h-0 gap-4">

            {/* Tabs de navegação */}
            <div className="flex items-center gap-2 shrink-0">
              {tabs.map((tab) => {
                const isActive = listaAtivaIndex === tab.idx;
                const Icon = tab.icon;
                const colorClasses = {
                  red: isActive ? 'border-red-500/50 text-red-400 tab-active' : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  blue: isActive ? 'border-blue-500/50 text-blue-400 tab-active' : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  emerald: isActive ? 'border-emerald-500/50 text-emerald-400 tab-active' : 'border-transparent text-zinc-500 hover:text-zinc-300',
                };
                return (
                  <button
                    key={tab.idx}
                    type="button"
                    onClick={() => setListaAtivaIndex(tab.idx)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${colorClasses[tab.color]}`}
                  >
                    <Icon size={13} />
                    {tab.label}
                    <span className={`ml-1 min-w-[20px] text-center px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                      isActive
                        ? tab.color === 'red' ? 'bg-red-500/20' : tab.color === 'blue' ? 'bg-blue-500/20' : 'bg-emerald-500/20'
                        : 'bg-white/5'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
              <div className="flex-1" />
              <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                exibindo {listaRotativa.itens.length} de {tabs[listaAtivaIndex].count}
              </div>
            </div>

            {/* Grid de equipamentos */}
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0" style={{ gridAutoRows: 'minmax(200px, 1fr)' }}>
              {cards.map((os, cardIdx) => {
                const prioridade = (os?.prioridade || '').toLowerCase();
                const tipo = (os?.tipo || '').toLowerCase();
                const isCritico = prioridade.includes('crit') || prioridade.includes('alta');
                const isPreventiva = tipo.includes('preventiva');
                const badge = isPreventiva ? 'PREVENTIVA' : isCritico ? 'CRÍTICO' : 'CORRETIVA';
                const isLiberada = listaRotativa.tipo === 'liberadas';
                const isAndamento = listaRotativa.tipo === 'andamento';

                const palette = isLiberada
                  ? { accent: 'emerald', badge: 'bg-emerald-500', glow: 'card-glow-emerald', border: 'border-emerald-500/30', timerColor: 'text-emerald-400', bg: 'from-emerald-500/[0.06] to-transparent', dot: 'bg-emerald-400', stripBg: 'bg-emerald-500' }
                  : isAndamento
                    ? { accent: 'blue', badge: 'bg-blue-500', glow: 'card-glow-blue', border: 'border-blue-500/30', timerColor: 'text-blue-400', bg: 'from-blue-500/[0.06] to-transparent', dot: 'bg-blue-400', stripBg: 'bg-blue-500' }
                    : isPreventiva
                      ? { accent: 'amber', badge: 'bg-amber-500', glow: '', border: 'border-amber-500/30', timerColor: 'text-amber-400', bg: 'from-amber-500/[0.06] to-transparent', dot: 'bg-amber-500', stripBg: 'bg-amber-500' }
                      : { accent: 'red', badge: 'bg-red-500', glow: isCritico ? 'card-glow-red' : '', border: 'border-red-500/30', timerColor: 'text-red-400', bg: 'from-red-500/[0.06] to-transparent', dot: 'bg-red-500', stripBg: 'bg-red-500' };

                const tempo = isLiberada
                  ? formatarTempoCronometro(getFinalizadaMin(os, agora) * 60)
                  : formatarTempoCronometro(getParadaAtivaSeconds(os, clockNow));

                return (
                  <div
                    key={os.id}
                    className={`glass-card relative flex flex-col border rounded-2xl overflow-hidden ${palette.border} ${palette.glow} animate-fade-up`}
                    style={{ animationDelay: `${cardIdx * 80}ms` }}
                  >
                    {/* Faixa lateral colorida */}
                    <div className={`absolute top-0 left-0 w-1 h-full ${palette.stripBg} rounded-l-2xl`} />
                    {/* Gradiente sutil de fundo */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${palette.bg} pointer-events-none`} />

                    <div className="relative flex flex-col justify-between p-5 h-full">
                      {/* Topo: badge + timer */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md text-white uppercase tracking-wider ${palette.badge}`}>
                            {badge}
                          </span>
                          {isCritico && !isLiberada && (
                            <AlertTriangle size={14} className="text-red-400 animate-breathe" />
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`text-3xl font-bold font-mono tabular-nums leading-none ${palette.timerColor}`}>
                            {tempo}
                          </span>
                          <p className="text-[9px] text-zinc-500 font-bold uppercase mt-0.5 tracking-wider">
                            {isLiberada ? 'Tempo total' : 'Tempo parado'}
                          </p>
                        </div>
                      </div>

                      {/* Corpo: máquina + info */}
                      <div className="mt-3 flex-1 flex flex-col justify-end">
                        <h3 className="text-2xl font-extrabold text-white leading-tight mb-1.5 truncate tracking-tight">
                          {os?.ativo || os?.processo || os?.setor || 'Equipamento'}
                        </h3>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center">
                              <Users size={10} className="text-zinc-400" />
                            </div>
                            <span className="text-sm text-zinc-200 font-semibold truncate">
                              {formatarResponsavel(os?.responsavel || os?.solicitante)}
                            </span>
                          </div>
                        </div>
                        <p className="text-zinc-400 text-xs flex items-center gap-2 leading-relaxed truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${palette.dot} ${isLiberada ? '' : 'animate-pulse'}`} />
                          {os?.sintoma || os?.descricao || os?.acaoImediata || 'Sem detalhes'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: placeholders }).map((_, idx) => (
                <div key={`placeholder-${idx}`} className="glass-card flex flex-col border border-white/[0.04] rounded-2xl justify-center items-center text-zinc-600 text-xs">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.02] flex items-center justify-center mb-2">
                    <Wrench size={18} className="text-zinc-700" />
                  </div>
                  Sem ocorrência
                </div>
              ))}
            </div>

            {/* Rodapé esquerdo: KPIs do dia + gráfico */}
            <div className="shrink-0 flex gap-4">
              {/* KPIs de hoje */}
              <div className="flex flex-col gap-4 w-[260px] shrink-0">
                <div className="glass-card border border-blue-500/15 rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-2xl" />
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle size={22} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Abertas hoje</p>
                    <span className="text-4xl font-black text-blue-300 leading-none">
                      {historico7Dias[historico7Dias.length - 1]?.abertas || 0}
                    </span>
                  </div>
                </div>
                <div className="glass-card border border-emerald-500/15 rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l-2xl" />
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={22} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Finalizadas hoje</p>
                    <span className="text-4xl font-black text-emerald-300 leading-none">
                      {historico7Dias[historico7Dias.length - 1]?.finalizadas || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Gráfico 7 dias */}
              <div className="glass-card border border-white/[0.04] rounded-2xl p-5 flex flex-col flex-1 min-w-0">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Histórico 7 dias</h3>
                  <div className="flex gap-4 text-[9px] font-bold uppercase text-zinc-500">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Abertas</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Finalizadas</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 flex-1 min-h-[100px]">
                  {historico7Dias.map((dia) => {
                    const maxValor = Math.max(1, ...historico7Dias.map((item) => Math.max(item.abertas, item.finalizadas)));
                    const abertoH = Math.max((dia.abertas / maxValor) * 100, 4);
                    const finalH = Math.max((dia.finalizadas / maxValor) * 100, 4);
                    return (
                      <div key={dia.key} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex items-end gap-1.5 flex-1">
                          <div className="flex-1 flex flex-col items-center">
                            {dia.abertas > 0 && (
                              <span className="text-[9px] font-bold text-blue-400 mb-0.5">{dia.abertas}</span>
                            )}
                            <div
                              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-sm transition-all duration-500"
                              style={{ height: `${abertoH}%`, minHeight: '4px' }}
                            />
                          </div>
                          <div className="flex-1 flex flex-col items-center">
                            {dia.finalizadas > 0 && (
                              <span className="text-[9px] font-bold text-emerald-400 mb-0.5">{dia.finalizadas}</span>
                            )}
                            <div
                              className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-sm transition-all duration-500"
                              style={{ height: `${finalH}%`, minHeight: '4px' }}
                            />
                          </div>
                        </div>
                        <span className="text-[9px] text-zinc-600 font-bold uppercase">{dia.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ─── COLUNA DIREITA ─── */}
          <div className="flex-[1.1] flex flex-col gap-4 shrink-0">

            {/* KPI Principal */}
            <div className={`relative overflow-hidden rounded-2xl p-6 card-shadow shrink-0 ${
              kpiConfig.cor === 'emerald' ? 'card-glow-emerald' : kpiConfig.cor === 'blue' ? 'card-glow-blue' : 'card-glow-red'
            }`} style={{ background: 'linear-gradient(135deg, rgba(30,32,44,0.8) 0%, rgba(15,17,23,0.95) 100%)' }}>
              {/* Gradiente decorativo */}
              <div className={`absolute -top-20 -right-20 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
                kpiConfig.cor === 'emerald' ? 'bg-emerald-500/10' : kpiConfig.cor === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10'
              }`} />
              <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl ${
                kpiConfig.cor === 'emerald' ? 'bg-emerald-500' : kpiConfig.cor === 'blue' ? 'bg-blue-500' : 'bg-red-500'
              }`} />
              <div className="relative">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">{kpiConfig.titulo}</span>
                  {kpiConfig.cor === 'emerald'
                    ? <CheckCircle2 size={22} className="text-emerald-500" />
                    : kpiConfig.cor === 'blue'
                      ? <Play size={22} className="text-blue-500" />
                      : <AlertTriangle size={22} className="text-red-500 animate-breathe" />
                  }
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-6xl font-black leading-none tracking-tighter">
                    {kpiConfig.total.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <span className="text-zinc-400 font-bold text-base uppercase leading-tight block">Equipamentos</span>
                    <span className={`font-bold text-sm uppercase ${
                      kpiConfig.cor === 'emerald' ? 'text-emerald-400' : kpiConfig.cor === 'blue' ? 'text-blue-400' : 'text-red-400'
                    }`}>
                      {kpiConfig.destaque}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* KPIs secundários */}
            <div className="grid grid-cols-3 gap-3 shrink-0">
              <div className="glass-card border border-white/[0.04] rounded-xl p-3.5 text-center">
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Pendentes</p>
                <span className="text-2xl font-black text-white">{pendentes}</span>
              </div>
              <div className="glass-card border border-amber-500/15 rounded-xl p-3.5 text-center">
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">TMR médio</p>
                <span className="text-lg font-bold font-mono text-amber-400">{formatarTempoCronometro(mediaReparo * 60)}</span>
              </div>
              <div className="glass-card border border-white/[0.04] rounded-xl p-3.5 text-center">
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Críticas</p>
                <span className="text-2xl font-black text-red-400">{paradasCriticas}</span>
              </div>
            </div>

            {/* Equipe de manutenção */}
            <div className="glass-card border border-white/[0.04] rounded-2xl p-5 flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-zinc-400" />
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Equipe de manutenção</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{disponiveis} livres
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-bold text-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />{ocupados} alocados
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {equipeStatus.map((colab) => {
                  const toneColors = {
                    emerald: { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-300', avatar: 'bg-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
                    blue: { bg: 'bg-blue-500/[0.06]', border: 'border-blue-500/20', badge: 'bg-blue-500/15 text-blue-300', avatar: 'bg-blue-500/20 text-blue-300', dot: 'bg-blue-400' },
                    amber: { bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', badge: 'bg-amber-500/15 text-amber-300', avatar: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
                    red: { bg: 'bg-red-500/[0.06]', border: 'border-red-500/20', badge: 'bg-red-500/15 text-red-300', avatar: 'bg-red-500/20 text-red-300', dot: 'bg-red-400' },
                  };
                  const tc = toneColors[colab.tone] || toneColors.emerald;
                  return (
                    <div key={colab.nome} className={`rounded-xl border ${tc.border} ${tc.bg} p-3 transition-all duration-300 hover:scale-[1.02]`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg ${tc.avatar} flex items-center justify-center text-[10px] font-black uppercase shrink-0`}>
                          {colab.nome.substring(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-white truncate">{colab.nome}</p>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${tc.dot} ${colab.tone !== 'emerald' ? 'animate-pulse' : ''}`} />
                          </div>
                          <p className="text-[10px] text-zinc-500 font-semibold">{colab.area}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${tc.badge}`}>
                          {colab.status}
                        </span>
                        <span className="text-[10px] text-zinc-400 truncate max-w-[100px]" title={colab.maquina}>
                          {colab.maquina}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ──── NOTIFICAÇÕES ──── */}
      <div className="fixed top-16 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {notifications.map((notif) => {
          const colors = {
            red: { bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/40', label: 'URGENTE', iconBg: 'bg-red-500/20' },
            amber: { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/40', label: 'AVISO', iconBg: 'bg-amber-500/20' },
            blue: { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/40', label: 'INFO', iconBg: 'bg-blue-500/20' },
          };
          const c = colors[notif.severity] || colors.red;
          return (
            <div
              key={notif.id}
              className={`${notif.closing ? 'notification-out' : 'notification-in'} glass border ${c.border} p-5 rounded-2xl shadow-2xl w-[380px] pointer-events-auto relative overflow-hidden`}
            >
              <div className="absolute bottom-0 left-0 h-1 bg-white/5 w-full">
                <div className={`progress-bar-fill h-full ${c.bg}`} />
              </div>
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center border border-white/10`}>
                    <Wrench size={20} className={c.text} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[10px] font-black ${c.text} uppercase tracking-[0.15em]`}>{c.label}</span>
                    <button type="button" onClick={() => closeNotification(notif.id)} className="text-zinc-500 hover:text-white transition-colors">
                      <XCircle size={16} />
                    </button>
                  </div>
                  <h4 className="text-white font-bold text-base mb-0.5 truncate">{notif.machine}</h4>
                  <p className="text-zinc-400 text-xs font-medium mb-3">{notif.reason}</p>
                  <div className="flex items-center gap-2.5 bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center text-[8px] font-black text-white uppercase">
                      {notif.tech.substring(0, 2)}
                    </div>
                    <div>
                      <p className="text-[8px] text-zinc-500 font-bold leading-none mb-0.5 uppercase">Técnico</p>
                      <span className="text-white text-[11px] font-bold">{notif.tech}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardManutencaoTV;
