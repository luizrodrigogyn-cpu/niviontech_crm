'use client';

import { useAuth, useClerk, useSignIn, useUser } from '@clerk/nextjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import BrandIntroOverlay from './brand-intro-overlay';

type BootstrapIdentity = {
  userId: string;
  orgId: string;
  role: string;
  profile: string;
  name: string;
  email: string;
};

function friendlyError(error: unknown) {
  const item = error as { errors?: Array<{ code?: string; longMessage?: string; message?: string }>; message?: string };
  const detail = item?.errors?.[0];
  if (detail?.code === 'form_identifier_not_found') return 'Este e-mail ainda não possui acesso. Fale com crm@niviontech.com.br.';
  if (detail?.code === 'form_code_incorrect') return 'O código informado não confere. Tente novamente.';
  return detail?.longMessage || detail?.message || item?.message || 'Não foi possível concluir agora. Tente novamente.';
}

export default function CrmGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [identity, setIdentity] = useState<BootstrapIdentity | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setIdentity(null);
      return;
    }
    const controller = new AbortController();
    fetch('/api/auth/bootstrap', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'bootstrap_failed');
        setIdentity(data);
      })
      .catch(error => {
        if (error.name !== 'AbortError') setMessage('Seu acesso foi confirmado, mas a empresa ainda não carregou. Atualize a página.');
      });
    return () => controller.abort();
  }, [isSignedIn, user?.id, bootstrapAttempt]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'niviontech:sign-out') signOut({ redirectUrl: '/' });
      if (event.data?.type === 'niviontech:iframe-ready') setIframeReady(true);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [signOut]);

  useEffect(() => {
    if (!identity || !iframeReady) return;
    const message = {
      type: 'niviontech:auth',
      clerkIdentity: {
        userId: identity.userId,
        orgId: identity.orgId,
        role: identity.role,
        profile: identity.profile,
        name: identity.name,
        email: identity.email,
      },
    };
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [identity, iframeReady]);

  const iframeUrl = useMemo(() => {
    if (!identity) return '';
    return '/crm/index.html';
  }, [identity]);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const result = await signIn.create({ identifier: email.trim().toLowerCase() });
      if (result.error) throw result.error;
      await signIn.emailCode.sendCode({ emailAddress: email.trim().toLowerCase() });
      setStep('code');
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const result = await signIn.emailCode.verifyCode({ code: code.replace(/\D/g, '') });
      if (result.error) throw result.error;
      if (signIn.status !== 'complete') throw new Error('A verificação não foi concluída. Solicite um novo código.');
      await signIn.finalize({ navigate: ({ decorateUrl }) => window.location.assign(decorateUrl('/')) });
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  // A abertura (BrandIntroOverlay) é sempre incluída como um elemento irmão, por cima de qualquer um
  // dos três estados abaixo — ela decide sozinha (uma vez por sessão de aba) se tem algo para
  // mostrar; nenhuma das três ramificações de carregamento/acesso/aplicativo foi alterada.
  let body: React.ReactNode;

  if (!isLoaded || (isSignedIn && !identity)) {
    body = <main className="secure-loading"><span className="secure-orbit">O</span><strong>{message || 'Preparando seu CRM...'}</strong><small>{message ? 'Sua sessão continua protegida.' : 'Seus dados permanecem protegidos.'}</small>{message && <button type="button" onClick={() => { setMessage(''); setBootstrapAttempt(value => value + 1); }}>Tentar novamente</button>}</main>;
  } else if (isSignedIn && identity) {
    body = (
      <main className="crm-shell">
        <iframe ref={iframeRef} title="NivionTech CRM" src={iframeUrl} onLoad={() => setIframeReady(true)} />
      </main>
    );
  } else {
    body = (
    <main className="marketing-site">
      <nav className="marketing-nav" aria-label="Navegação principal">
        <a className="marketing-logo" href="#inicio"><img src="/crm/assets/niviontech-symbol.png" alt="" /><strong>NivionTech</strong></a>
        <div><a href="#produto">Produto</a><a href="#orbit-ia">Orbit IA</a><a href="#funcionalidades">Funcionalidades</a><a href="#seguranca">Segurança</a><a href="#publico">Para quem é</a><a href="#contato">Contato</a></div>
        <a className="marketing-login" href="#acesso">Entrar no CRM</a>
      </nav>

      <section className="marketing-hero" id="inicio">
        <div className="marketing-hero-copy"><span className="marketing-pill">◈ GESTÃO COMERCIAL BRASILEIRA</span><h1>Seu processo<br />comercial,<br />finalmente sob<br /><em>controle.</em></h1><p>O NivionTech CRM reúne clientes, oportunidades, tarefas e inteligência comercial em uma experiência simples, visual e segura.</p><div className="marketing-actions"><a href="#acesso">Experimentar o NivionTech CRM →</a><a className="secondary" href="#produto">◉ Ver como funciona</a></div><div className="marketing-facts"><span><b>1 ambiente</b>Clientes, negócios e tarefas</span><span><b>Orbit</b>Inteligência que sugere ações</span><span><b>Multiempresa</b>Dados separados e protegidos</span></div></div>
        <div className="marketing-demo" aria-label="Demonstração do pipeline"><div className="demo-head"><span>PAINEL COMERCIAL<strong>Pipeline · Agosto</strong></span><b>↗ +18,4%</b></div><div className="demo-metrics"><span>EM ABERTO<b>R$ 443k</b></span><span>GANHOS NO MÊS<b>R$ 128k</b></span><span>CONVERSÃO<b>34%</b></span></div><div className="demo-board"><span>Qualificação<i>Atlas Log · R$ 32.000</i></span><span>Proposta<i>Nortek · R$ 76.500</i></span><span>Negociação<i>Grupo Meridian · R$ 128.000</i></span></div><aside><b>✦ Orbit</b><p>3 oportunidades sem próximo passo definido.</p><strong>Revisar agora ↗</strong></aside></div>
      </section>

      <section className="marketing-section" id="produto"><small>POR QUE NIVIONTECH</small><h2>Um ambiente único para<br />conduzir o comercial com clareza.</h2><div className="marketing-card-grid four"><article><i>▣</i><h3>Pipeline visual</h3><p>Acompanhe oportunidades e mova negócios entre as etapas com um gesto.</p></article><article><i>◎</i><h3>Clientes organizados</h3><p>Histórico, contatos e próximos passos reunidos em um só lugar.</p></article><article><i>✦</i><h3>Inteligência comercial</h3><p>Identifique atrasos, riscos e prioridades antes que virem problema.</p></article><article><i>▱</i><h3>Operação segura</h3><p>Dados protegidos e separados por empresa, do primeiro acesso ao relatório.</p></article></div></section>

      <section className="orbit-launch" id="orbit-ia">
        <div className="orbit-launch-copy"><span className="orbit-launch-badge"><i>O</i> LANÇAMENTO · ORBIT IA</span><h2>Seu vendedor não precisa<br />vender <em>sozinho.</em></h2><p>O Orbit IA transforma o conhecimento da sua empresa e as conversas reais em preparação, orientação e evolução contínua para cada vendedor.</p><div className="orbit-launch-modules"><article><span>01</span><div><strong>Treinar</strong><small>Simule clientes e objeções com base no ICP da empresa.</small></div></article><article><span>02</span><div><strong>Preparar</strong><small>Entre na reunião com contexto, perguntas e próximo passo.</small></div></article><article><span>03</span><div><strong>Analisar</strong><small>Transforme conversas em memória e ações dentro do CRM.</small></div></article></div><a className="orbit-launch-cta" href="#acesso">Conhecer o Orbit IA →</a></div>
        <div className="orbit-launch-demo" aria-label="Demonstração do Orbit IA"><header><span className="orbit-launch-mark">O</span><div><small>ORBIT IA</small><strong>Inteligência comercial</strong></div><b>Em lançamento</b></header><div className="orbit-launch-context"><small>OPORTUNIDADE ANALISADA</small><strong>Implantação CRM · Grupo Meridian</strong><p>O cliente demonstrou interesse, mas ainda não confirmou quem participa da decisão final.</p></div><div className="orbit-launch-insights"><article><span>↗</span><div><small>PRÓXIMO PASSO</small><strong>Validar decisor e agendar retorno</strong></div></article><article><span>!</span><div><small>OBJEÇÃO</small><strong>Adesão da equipe na implantação</strong></div></article><article><span>✓</span><div><small>MEMÓRIA ATUALIZADA</small><strong>Cliente e oportunidade organizados</strong></div></article></div><aside><span>✦</span><div><strong>Treino recomendado</strong><p>Como conduzir a decisão com múltiplos envolvidos.</p></div><b>Praticar ↗</b></aside></div>
      </section>

      <section className="marketing-section" id="funcionalidades"><small>FUNCIONALIDADES</small><h2>Tudo que o comercial precisa,<br />sem excesso.</h2><div className="feature-table">{['Funil de vendas','Cadastro de clientes','Gestão de oportunidades','Tarefas e agenda','Dashboard comercial','Relatórios e estatísticas','Gestão de usuários','Controle de acessos','Módulos ativáveis','Notificações inteligentes','Saúde da carteira'].map((item,index)=><article key={item}><i>{['▽','♙','◇','▣','⊞','⌁','♧','⌘','◉','♢','◷'][index]}</i><div><h3>{item}</h3><p>{['Etapas configuráveis para o seu processo real.','Ficha completa, contatos e histórico.','Valores, prazos e responsáveis sempre visíveis.','Compromissos e follow-ups no ritmo do time.','Indicadores do mês em uma única tela.','Resultados por período, etapa e vendedor.','Cadastre a equipe e organize por função.','Cada pessoa vê apenas o que precisa.','Ligue recursos conforme a empresa cresce.','Avisos no momento em que fazem diferença.','Concentração de receita e clientes em risco.'][index]}</p></div></article>)}</div></section>

      <section className="marketing-section" id="seguranca"><small>SEGURANÇA</small><h2>Segurança não é um detalhe.<br /><em>É parte do produto.</em></h2><div className="marketing-card-grid three">{[['◉','Autenticação segura','Só entra quem realmente tem acesso à conta.'],['▦','Dados separados por empresa','As informações de cada cliente ficam isoladas.'],['◇','Usuários e permissões','Você define quem pode ver, editar e excluir.'],['▱','Proteção de informações sensíveis','Dados comerciais guardados com cuidado.'],['◉','Conexão HTTPS','Todo o tráfego é criptografado de ponta a ponta.'],['▤','Monitoramento e auditoria','Registro das ações importantes do sistema.']].map(item=><article key={item[1]}><i>{item[0]}</i><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section>

      <section className="marketing-section" id="publico"><small>PARA QUEM É</small><h2>Feito para quem vende com processo.</h2><div className="audience-grid">{['Pequenas empresas','Equipes comerciais','Prestadores de serviços','Consultorias','Negócios B2B','Empresas em estruturação'].map((item,index)=><article key={item}><i>{['▣','▥','⌕','◉','♙','▤'][index]}</i><div><h3>{item}</h3><p>{['Organize as vendas sem contratar um time de sistemas.','Metas, funil e responsabilidades claras para todos.','Propostas, contatos e recorrência sob controle.','Ciclos longos acompanhados etapa por etapa.','Múltiplos contatos e decisores em cada oportunidade.','Crie um processo de vendas de verdade.'][index]}</p></div></article>)}</div></section>

      <section className="marketing-access" id="acesso"><div><small>COMECE AGORA</small><h2>Venda com mais clareza.<br />Cresça com mais controle.</h2><p>Entre com seu e-mail corporativo. Seu acesso é protegido e validado por código temporário.</p></div><form className="secure-card" onSubmit={step === 'email' ? sendCode : verifyCode}>
          <div className="secure-label">ACESSO SEGURO</div>
          <h2>{step === 'email' ? 'Acesse sua empresa' : 'Confira seu e-mail'}</h2>
          <p>{step === 'email' ? 'Receba um código para continuar seu dia comercial.' : `Enviamos um código de 6 dígitos para ${email}.`}</p>
          {step === 'email' ? <label>E-mail<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="voce@empresa.com" required autoFocus /></label> : <label>Código de acesso<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus /></label>}
          <button type="submit" disabled={fetchStatus === 'fetching'}>{fetchStatus === 'fetching' ? 'Aguarde...' : step === 'email' ? 'Receber código por e-mail' : 'Entrar no CRM'}</button>
          {message && <div className="secure-message" role="alert">{message}</div>}
          {step === 'code' && <button className="secure-link" type="button" onClick={() => { signIn.reset(); setStep('email'); setCode(''); setMessage(''); }}>Usar outro e-mail</button>}
          <div className="secure-note"><span>✓</span><small>Sem senha local. Seu acesso é validado com código temporário.</small></div>
      </form></section>
      <footer className="marketing-footer" id="contato"><div className="marketing-logo"><img src="/crm/assets/niviontech-symbol.png" alt="" /><strong>NivionTech</strong></div><p>NivionTech CRM: gestão comercial simples, visual e segura para empresas que querem crescer com processo.</p><span>© 2026 NivionTech · contato@niviontech.com.br</span></footer>
    </main>
    );
  }

  return (
    <>
      <BrandIntroOverlay ready={isLoaded} />
      {body}
    </>
  );
}
