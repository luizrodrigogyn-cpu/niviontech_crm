# NivionTech CRM

Primeira construção local do NivionTech CRM.

## O que existe nesta etapa

- Criação do primeiro Proprietário/Admin.
- Senha derivada localmente com PBKDF2 e salt aleatório.
- Login e validação de senha.
- Sessão válida enquanto a aba estiver aberta.
- Saída do sistema.
- Primeira tela protegida do CRM.

## Como abrir

No terminal, dentro desta pasta, execute:

```bash
python3 -m http.server 8080
```

Depois abra no navegador:

```text
http://localhost:8080
```

## Limite desta versão

Os dados ficam no navegador e servem apenas para construção e validação local. Esta autenticação ainda não deve ser utilizada em produção nem com dados reais de clientes.
