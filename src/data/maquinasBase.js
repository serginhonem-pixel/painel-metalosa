import bensData from './bens.json';
import veiculosData from './relacao_veiculos.json';

const normalizarId = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const maquinasIndustria = (bensData || [])
  .map((item) => ({
    id: normalizarId(item?.bem || item?.nome || ''),
    nome: item?.nome || item?.bem || 'Sem nome',
    setor: 'Industria',
    processo: item?.familia || '',
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

const maquinasManuais = [
  {
    id: normalizarId('Calandra do Tubo 01'),
    nome: 'Calandra do Tubo 01',
    setor: 'Industria',
    processo: 'Caldeiraria',
  },
];

const mergedMap = new Map();
[...maquinasIndustria, ...maquinasTransporte, ...maquinasManuais].forEach((item) => {
  if (!mergedMap.has(item.id)) {
    mergedMap.set(item.id, item);
  }
});

export const maquinasBaseData = Array.from(mergedMap.values()).sort((a, b) =>
  String(a.nome || '').localeCompare(String(b.nome || ''))
);

export const setoresBaseData = Array.from(
  new Set([
    'Industria',
    'Transporte',
    ...maquinasManuais.map((item) => item.processo).filter(Boolean),
    ...maquinasIndustria.map((item) => item.processo).filter(Boolean),
  ])
).sort((a, b) => String(a).localeCompare(String(b)));
