# NivionTech Titanium Intelligence

Design system extraído do protótipo Lovable “Sales Clarity” e aplicado ao CRM funcional.

## Princípios

1. Clareza comercial antes de ornamentação.
2. Superfícies sólidas para dados e vidro apenas para navegação e camadas flutuantes.
3. Azul-marinho como estrutura, titânio como apoio e cores semânticas somente para estados.
4. Métricas, riscos e próximos passos devem ser identificáveis sem depender apenas de cor.
5. Movimento curto e funcional, com alternativa para movimento reduzido.

## Tokens principais

| Token | Valor | Uso |
|---|---|---|
| `--ds-bg` | `#f5f4f0` | Fundo geral off-white |
| `--ds-surface` | `#fbfcfd` | Cards e campos |
| `--ds-navy` | `#08162e` | Navegação, títulos e CTAs |
| `--ds-navy-soft` | `#102441` | Gradientes escuros |
| `--ds-black` | `#080a0d` | Profundidade e Orbit |
| `--ds-titanium` | `#6f7884` | Texto secundário |
| `--ds-titanium-light` | `#c6ccd3` | Texto inverso e bordas escuras |
| `--ds-line` | `#d9dee5` | Bordas e divisórias |
| `--ds-blue` | `#255fa8` | Foco e ações informativas |
| `--ds-green` | `#16835f` | Sucesso e saúde positiva |
| `--ds-gold` | `#b98018` | Atenção e previsão |
| `--ds-danger` | `#c94b54` | Risco, atraso e erro |

## Tipografia

- Display e títulos: Manrope, pesos 600–800.
- Interface e conteúdo: Inter, pesos 400–700.
- Título de página: 30px, linha 1.15.
- Título de seção: 22px, linha 1.25.
- Título de card: 18px, linha 1.35.
- Corpo: 16px, linha 1.6.
- Apoio: 14px, linha 1.5.
- Label: 13px, linha 1.4.

## Forma e profundidade

- Raio base: 14px.
- Cards principais: 16px.
- Controles: 10–12px.
- Pills: 999px.
- Sombra normal: baixa, combinada com borda de 1px.
- Sombra elevada: reservada para hover, modal e Orbit.
- Glassmorphism: navegação, topbar e painéis flutuantes; nunca em todas as superfícies.

## Componentes

- `AppShell`: sidebar escura, topbar translúcida e workspace off-white.
- `PageHeader`: contexto, título, descrição e ações.
- `MetricCard`: label, valor, variação, nota e progresso opcional.
- `PipelineColumn`: etapa, quantidade, valor e cards.
- `OpportunityCard`: empresa, valor, responsável, saúde e próximo passo.
- `Module`: seção sólida ou glass com cabeçalho consistente.
- `StatusBadge`: neutral, green, blue, gold e danger.
- `OrbitPanel`: superfície cinematográfica e recomendações priorizadas.
- `FilterBar`: busca e filtros rápidos.
- `Modal`: formulário focado, com ações primária e secundária.

## Navegação

Grupos adotados:

1. Visão geral: Dashboard.
2. Comercial: Pipeline, Atividades, Propostas e Recebimentos.
3. Relacionamento: Clientes.
4. Inteligência: Relatórios, Cole e organize e Ranking.
5. Administração: Equipe e acessos e Modelos de funil.
6. Rodapé: Configurações, perfil e saída.

## Integração funcional

O design system não substitui a camada de dados. Clerk continua responsável pela autenticação; D1 e a sincronização existente permanecem responsáveis pelos dados por empresa. IDs, formulários e regras de negócio do CRM foram preservados para que a nova camada visual não altere o comportamento comercial.
