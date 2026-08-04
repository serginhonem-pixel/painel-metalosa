# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Painel interno da Metalosa (indústria), usado por três públicos no dia a dia:
- Gestores/diretoria: visão executiva de faturamento, KPIs e relatórios para decisão.
- Operação de chão de fábrica: supervisores e operadores acompanhando produção e manutenção em tempo real, com telas dedicadas para TV (`DashboardGlobalTV`, `DashboardManutencaoTV`).
- Equipe administrativa/financeira: uso mais próximo de planilha — faturamento, custos, CFOP, ordens de serviço (OS).

## Product Purpose

Centralizar o acompanhamento operacional e financeiro da fábrica: faturamento, manutenção, MRP de aço, rastreabilidade e operação diária, substituindo controles dispersos (planilhas, relatórios avulsos) por painéis únicos, inclusive telas de TV para acompanhamento em tempo real no chão de fábrica.

## Positioning

Ferramenta interna proprietária da Metalosa — não é um produto vendido a terceiros. Seu valor está em unificar dados de diferentes áreas da fábrica (financeiro, manutenção, produção, rastreabilidade) em uma única superfície visual, incluindo modos otimizados para exibição em TV.

## Operating Context

- Uso em desktop (equipe administrativa/gestão) e em telas de TV fixadas no chão de fábrica (painéis `*TV.jsx`) para visualização à distância, sem interação direta.
- Módulos principais identificados no código: Faturamento (receita, CFOP, clientes), Manutenção (ordens de serviço, relatórios), MRP de Aço, Rastreabilidade, Operação Diária, Absenteísmo/Faltas.
- Gera documentos de saída: PDF (jsPDF) e apresentações PPTX (pptxgenjs) para relatórios formais (ex.: relatório executivo anual de faturamento, relatório de manutenção).
- Usa mapas (Leaflet) — sugere geolocalização de unidades/rotas em algum módulo.
- Autenticação/dados via Firebase.

## Capabilities and Constraints

- Stack existente: React 19 + Vite, Tailwind CSS, Recharts (gráficos), Leaflet/react-leaflet (mapas), jsPDF/pptxgenjs (exportação de relatórios), Firebase (dados/hospedagem).
- Vários módulos são telas de TV (`DashboardGlobalTV`, `DashboardManutencaoTV`) — precisam permanecer legíveis à distância, sem depender de hover/interação fina.
- Idioma da interface: português (pt-BR).
- Nome da empresa confirmado nos relatórios gerados: Metalosa.

## Brand Commitments

Nenhuma identidade visual formal (logo, cores institucionais, manual de marca) precisa ser preservada — liberdade total para propor uma nova direção visual mais profissional. Nome da empresa (Metalosa) deve continuar aparecendo onde já aparece hoje (relatórios, títulos de documentos gerados).

## Evidence on Hand

Nenhuma pesquisa de usuário, benchmark ou material de marca formal disponível além do próprio código-fonte existente. Qualquer prova social, depoimento ou dado de benchmark não deve ser inventado.

## Product Principles

1. Legibilidade à distância nas telas de TV é inegociável — hierarquia visual clara, contraste forte, sem depender de texto miúdo ou interação.
2. Consistência entre módulos: cada painel (faturamento, manutenção, MRP, rastreabilidade, operação diária) deve parecer parte do mesmo produto, não apps separados.
3. Decisão rápida para gestores: dados financeiros e operacionais devem ser escaneáveis em segundos, não exigir leitura detalhada.
4. Seriedade "de chão de fábrica": o visual precisa comunicar precisão e confiabilidade industrial, evitando aparência de template genérico.
5. Documentos gerados (PDF/PPTX) fazem parte da experiência de marca tanto quanto a interface web.

## Accessibility & Inclusion

Nenhum requisito de acessibilidade específico foi estabelecido até o momento; padrões de contraste e legibilidade a distância (telas de TV) são um requisito funcional do produto, não apenas de acessibilidade formal.
