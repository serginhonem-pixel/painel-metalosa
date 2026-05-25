---
description: "Gera um manual de usuário completo em PDF para o módulo de Rastreabilidade INMETRO"
name: "Manual Rastreabilidade PDF"
agent: "agent"
---

# Prompt: Gerar Manual de Usuário — Rastreabilidade INMETRO

Use este prompt com uma IA (Claude, ChatGPT, etc.) para gerar o conteúdo do manual. Depois converta o markdown gerado para PDF usando Pandoc, Typora, VS Code + extensão Markdown PDF, ou qualquer outra ferramenta.

---

## Prompt a enviar para a IA

```
Gere um manual de usuário completo em português para o módulo de Rastreabilidade INMETRO de um sistema industrial de fabricação de escadas domésticas. O manual deve ser formatado em Markdown, pronto para converter para PDF.

## Contexto do sistema

O módulo controla toda a cadeia de rastreabilidade exigida pelo INMETRO (norma ABNT NBR 6158) para escadas domésticas articuladas, do recebimento da matéria-prima até a entrega ao cliente. O acesso é protegido por senha.

Modelos de escada controlados: 00185 (3 degraus), 00186 (4 degraus), 00187 (5 degraus), 00188 (6 degraus), 00189 (7 degraus).

Materiais controlados:
- Matéria-Prima: TUBO RED 1"x1,20, CHAPA 1,20, CHAPA 1,40, ARAME GALV 5,15MM, BARRA CHATA 3/8"x1/8"
- Componentes Comprados: ARRUELA LISA 3/16", REBITE R-512A, REBITE R-519A, REBITE R-612, FITA POLIPROPILENO 25MM, ETIQUETA INMETRO, ETIQUETA IDENTIFICAÇÃO, PONTEIRA DE PLÁSTICO

## Abas do módulo (fluxo de uso na ordem correta)

### 1. Estoque Atual
- Mostra o saldo disponível de todos os lotes agrupados por material
- Três seções: Produtos Intermediários (PI), Matéria-Prima (MP) e Componentes Comprados
- Cores de status: verde = OK, âmbar = baixo, vermelho = zerado
- Clicar na linha expande os lotes individuais com DANFE, fornecedor e saldo

### 2. Entrada de Lotes
**Recebimento de Matéria-Prima:**
- Campos obrigatórios: Material, DANFE/NF, Número do Lote do Fornecedor, Fornecedor, Data de Entrada, Qtd Recebida
- Campos opcionais: Certificado de Qualidade, Qtd Aprovada, Qtd Reprovada, Peso Bruto (kg), Peso Líquido (kg)
- O sistema calcula automaticamente o % de Perda
- Opção "Origem": Comprado (por NF) ou Produzido aqui (para MP transformada internamente — informa OP interna e dados da MP mãe)

**Recebimento de Componentes Comprados:**
- Mesmos campos principais: Componente (seleção por código), DANFE, Lote, Fornecedor, Data, Quantidades

### 3. Produção de PI (Produto Intermediário)
- Registra a transformação de matéria-prima em peças intermediárias (montantes, degraus, patamar, articulador, etc.)
- Seleciona o PI a produzir — o sistema mostra automaticamente qual MP é necessária
- Informa Número da OP, Data de Produção, Qtd Produzida, Qtd Aprovada, Qtd Reprovada
- Vincula um ou mais lotes de MP consumidos (com quantidade consumida por lote)
- Ao salvar: cria o lote de PI e desconta automaticamente o saldo da MP

### 4. Ordem de Produção
- Registra a montagem de uma escada completa
- Seleciona o modelo (00185–00189) — o BOM é carregado automaticamente com todos os componentes
- Informa Número da OP, Número de Série da Escada e Data de Produção
- Para cada componente fabricado (PI): seleciona o lote — o sistema pré-seleciona o lote mais antigo disponível (critério FIFO)
- Para cada componente comprado: seleciona o lote disponível
- Ao salvar: registra a ordem com rastreabilidade completa e desconta o saldo de todos os lotes consumidos
- Se o saldo de algum lote for insuficiente, o sistema bloqueia com mensagem de erro

### 5. Produto Acabado
- Registra o produto após inspeção final
- Campos: Número de Série, Número da OP, Modelo, Data de Produção, Data de Inspeção, Inspetor/Responsável, Status QC (Aprovado / Reprovado / Pendente), Número do Lacre/Etiqueta INMETRO
- Fecha o vínculo entre o número de série e todos os componentes utilizados

### 6. Ajuste de Estoque
- Corrige saldos por inventário físico, erro de lançamento, perda ou devolução
- Seleciona o lote (agrupado por tipo: MP, PI, Comprado)
- Mostra o saldo atual e calcula a diferença após o ajuste
- Obrigatório informar o tipo de ajuste e motivo
- Todo ajuste fica registrado com data e delta (positivo ou negativo)

### 7. Rastreabilidade (Consulta)
Três modos de busca:

**Por Número de Série:** digita o número de série da escada e obtém a ficha completa com:
- Todos os componentes fabricados com DANFE e certificado de qualidade da MP de origem
- Todos os componentes comprados com DANFE e fornecedor
- Status de entrega (em estoque ou entregue com NF, cliente e data)
- Botão "Estornar Ordem": reverte todos os decrementos de saldo e cancela a ordem (com confirmação)

**Por Número de OP:** mesma ficha, buscando pela OP

**Por Lote (Recall):** busca inversa — seleciona um lote de material e o sistema lista TODAS as escadas fabricadas com aquele lote. Usado em situações de recall de produto para identificar rapidamente todas as unidades afetadas.

### 8. Saída / Venda
- Registra a entrega ao cliente
- Campos: NF de Saída, Cliente, Data de Entrega, Observação
- Seleciona os números de série das escadas incluídas na entrega (somente escadas em estoque aparecem)
- Após registro, as escadas aparecem como "Entregue" na consulta de rastreabilidade

### 9. Exportar INMETRO
- Filtro por período (data inicial e data final)
- Seleção individual ou em massa das ordens a exportar
- Gera arquivo Excel com colunas: OP, Nr Série Escada, Data Produção, Tipo, Componente, MP, Cod MP, DANFE, Cert Qualidade, Lote Fornecedor, Fornecedor, Data Entrada, Qtd Consumida
- Usado para apresentar o dossiê de rastreabilidade em auditorias INMETRO

### 10. Ficha Técnica
- Exibe o BOM completo de cada modelo de escada
- Cotas dimensionais (mm): tamanho, inclinação, largura, profundidade do degrau, distância entre degraus, etc.
- Lista de componentes com código, tipo (PI/MP), quantidade por escada e fluxo de processo de fabricação

## Fluxo correto de uso (passo a passo resumido)

1. Registrar recebimento de MP e Comprados → aba **Entrada de Lotes**
2. Transformar MP em peças → aba **Produção de PI**
3. Montar a escada → aba **Ordem de Produção**
4. Inspecionar e lacrar → aba **Produto Acabado**
5. Entregar ao cliente → aba **Saída / Venda**
6. Consultar rastreabilidade ou emitir relatório → abas **Rastreabilidade** ou **Exportar INMETRO**

## Regras importantes

- Saldo nunca vai negativo: o sistema valida antes de salvar e bloqueia se insuficiente
- FIFO: lotes mais antigos são pré-selecionados automaticamente na Ordem de Produção
- Ordens estornadas NÃO são apagadas: ficam como inativas com rastreio preservado
- Todos os dados ficam no Firestore (nuvem) com acesso em tempo real
- O botão "Resetar e reimportar" no topo apaga todos os lotes e reimporta o inventário inicial — usar com cautela

## Formato solicitado para o manual

IMPORTANTE: Não use emojis, ícones Unicode, setas especiais (→ ► ▼) nem caixas Unicode (█ ■ ▪) em nenhuma parte do documento. Use apenas texto, marcadores Markdown padrão (-, *, #) e blocos de código ASCII para diagramas. O documento precisa converter para PDF sem caracteres corrompidos.

- Capa com título, versão e data
- Sumário com links para seções
- Introdução explicando o propósito do módulo e a exigência INMETRO
- Uma seção por aba com: objetivo, quando usar, passo a passo, campos explicados, erros comuns
- Seção de fluxo completo usando APENAS um diagrama em bloco de código com caracteres ASCII básicos (hífens, pipes, sinais de maior/menor, letras e números). Proibido usar emojis, setas Unicode (→ ▼ ►), caixas Unicode (█ ▪ ■) ou qualquer caractere fora do ASCII básico. O diagrama deve ficar dentro de um bloco de código delimitado por três backticks para garantir fonte monoespaçada no PDF.
- Seção sobre busca de recall (Por Lote) com exemplo prático
- Glossário: DANFE, Lote, PI, PA, BOM, FIFO, OCP, NF
- Apêndice: tabela de materiais controlados com códigos
```
