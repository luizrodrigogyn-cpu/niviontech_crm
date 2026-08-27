# Pendencias do NivionTech CRM

## Prioridade alta - Autenticacao profissional com Clerk

**Status:** Planejado  
**Objetivo:** Substituir gradualmente o login local por autenticacao segura via codigo enviado por e-mail, sem perder usuarios ou dados existentes.

### Escopo

- Corrigir estados demorados ou indefinidos em "Validando...".
- Criar o projeto NivionTech CRM no Clerk.
- Implementar primeiro acesso e login por codigo enviado ao e-mail.
- Manter a identidade visual personalizada da tela atual.
- Eliminar a dependencia de senha armazenada no navegador.
- Vincular cada usuario autenticado a uma empresa, papel e permissoes.
- Criar fluxo de convite para colaboradores.
- Proteger as rotas de sincronizacao no servidor com a sessao autenticada.
- Manter dados comerciais no Cloudflare D1, separados por empresa.
- Criar snapshots automaticos e manter exportacao manual de backup.

### Migracao do acesso atual

1. Gerar backup completo antes da mudanca.
2. Manter temporariamente o login local durante a migracao.
3. Confirmar o e-mail do proprietario por codigo.
4. Vincular os dados existentes ao identificador do Clerk.
5. Enviar e validar o primeiro snapshot na nuvem.
6. Testar o mesmo acesso em outro navegador ou dispositivo.
7. Remover o login local somente depois da validacao.

### Criterios de conclusao

- Usuario novo cria acesso por codigo de e-mail.
- Usuario existente entra sem repetir a implantacao.
- Colaborador convidado acessa somente a empresa correta.
- Nao existe estado "Validando..." sem limite de tempo ou retorno.
- Sessao e validada no cliente e no servidor.
- Dados permanecem disponiveis em outro navegador.
- Backup anterior a migracao pode ser restaurado.
- Nenhuma senha de usuario fica armazenada localmente.

### Decisao tecnica

- **Clerk:** identidade, verificacao de e-mail e sessao.
- **NivionTech CRM:** empresa, cargos, permissoes e plano.
- **Cloudflare D1:** clientes, funil, atividades, propostas, recebimentos e configuracoes.
- **Backup:** snapshots versionados na nuvem e exportacao manual.

