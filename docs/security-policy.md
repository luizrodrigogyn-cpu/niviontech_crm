# Política de segurança do NivionTech CRM

## Autenticação e sessões

- Todas as rotas `/api/auth/*` e `/api/sync/*` validam a sessão no servidor com Clerk.
- Todo o pacote privado `/crm/*`, incluindo HTML, JavaScript, CSS e módulos, é bloqueado pelo Clerk antes de ser entregue.
- A landing page `/` continua pública para apresentar o produto e iniciar o login.
- O navegador nunca escolhe o `org_id`: ele é resolvido a partir do usuário Clerk autenticado.
- Cada usuário pode manter no máximo três sessões ativas por padrão. Ao ultrapassar o limite, as sessões mais antigas são revogadas.
- O CRM usa acesso sem senha por código de e-mail. Nenhuma senha é criada ou armazenada pelo aplicativo.

## Isolamento por empresa (RLS de aplicação)

O Cloudflare D1/SQLite não oferece políticas RLS nativas. O equivalente obrigatório é aplicado no servidor:

1. A identidade vem exclusivamente de `auth()` do Clerk.
2. O servidor consulta `crm_org_members` para obter a empresa autorizada.
3. Toda leitura e escrita de dados comerciais inclui o `org_id` obtido nessa consulta.
4. `org_id`, papel ou usuário enviados pelo cliente nunca são aceitos como fonte de autorização.
5. Códigos de convite só associam um usuário autenticado e nunca movem silenciosamente alguém de outra empresa.

## Criptografia

- Snapshots comerciais e históricos são criptografados com AES-256-GCM antes de serem gravados no D1.
- E-mail e nome dos perfis são criptografados individualmente.
- A chave fica somente no ambiente hospedado (`CRM_DATA_ENCRYPTION_KEY`) e não é enviada ao navegador nem salva no repositório.
- Registros antigos em texto legível são sanitizados e migrados para o formato criptografado no próximo acesso autenticado.
- Campos legados `password`, `passwordHash` e `salt` são removidos no servidor antes de qualquer leitura ou gravação.

## Auditoria

- Cada acesso autenticado registra usuário, empresa, quantidade de sessões e uma impressão irreversível da sessão.
- Respostas privadas usam `no-store`, `nosniff` e política de referência restrita.
