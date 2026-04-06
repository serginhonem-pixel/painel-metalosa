import ativosData from './ativosResumido.json';
import veiculosData from './relacao_veiculos.json';

const normalizarId = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const maquinasAtivos = (ativosData || [])
  .map((item) => ({
    id: normalizarId(item?.nome || ''),
    nome: item?.nome || 'Sem nome',
    setor: item?.setor || 'Industria',
    processo: item?.setor || '',
  }))
  .filter((item) => item.id);

const maquinasTransporte = (veiculosData || [])
  .map((item) => {
    const placa = item?.PLACAS || item?.placas || '';
    const modelo = item?.MODELO || item?.modelo || '';
    const nome = placa && modelo ? `${placa} - ${modelo}` : placa || modelo;

    return {
      id: normalizarId(placa || modelo || ''),
      nome: nome || 'Sem nome',
      setor: 'Transporte',
      processo: '',
    };
  })
  .filter((item) => item.id);

const mergedMap = new Map();
[...maquinasAtivos, ...maquinasTransporte].forEach((item) => {
  if (!mergedMap.has(item.id)) {
    mergedMap.set(item.id, item);
  }
});

export const maquinasBaseData = Array.from(mergedMap.values()).sort((a, b) =>
  String(a.nome || '').localeCompare(String(b.nome || ''))
);

export const setoresBaseData = Array.from(
  new Set([
    ...maquinasAtivos.map((item) => item.setor).filter(Boolean),
    'Transporte',
  ])
).sort((a, b) => String(a).localeCompare(String(b)));
