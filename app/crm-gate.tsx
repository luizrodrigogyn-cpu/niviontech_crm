'use client';

import { useAuth, useClerk, useSignIn, useUser } from '@clerk/nextjs';
import { useEffect, useMemo, useState } from 'react';

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
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'niviontech:sign-out') signOut({ redirectUrl: '/' });
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [signOut]);

  const iframeUrl = useMemo(() => {
    if (!identity) return '';
    const params = new URLSearchParams({
      clerk: '1',
      userId: identity.userId,
      orgId: identity.orgId,
      role: identity.role,
      profile: identity.profile,
      name: identity.name,
      email: identity.email,
    });
    return `/crm/index.html?${params}`;
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

  if (!isLoaded || (isSignedIn && !identity)) {
    return <main className="secure-loading"><span className="secure-orbit">O</span><strong>Preparando seu CRM...</strong><small>Seus dados permanecem protegidos.</small></main>;
  }

  if (isSignedIn && identity) {
    return <main className="crm-shell"><iframe title="NivionTech CRM" src={iframeUrl} /></main>;
  }

  return (
    <main className="secure-auth">
      <section className="secure-brand">
        <div className="secure-grid" />
        <div className="secure-logo"><img src="/crm/assets/niviontech-symbol.png" alt="" /><strong>NivionTech</strong><span>CRM</span></div>
        <div className="secure-copy"><small>SEU COMERCIAL EM MOVIMENTO</small><h1>Comece o dia<br />sabendo<br />exatamente o que<br />fazer.</h1><p>Organize clientes, acompanhe oportunidades e avance cada venda com clareza.</p></div>
        <article className="secure-float float-one"><i>O</i><span><small>ORBIT RECOMENDA</small><strong>Comece pela proposta</strong><em>Maior chance de avançar hoje</em></span></article>
        <article className="secure-float float-two"><i>◇</i><span><small>FUNIL EM MOVIMENTO</small><strong>R$ 27.400</strong><em>4 oportunidades abertas</em></span></article>
        <article className="secure-float float-three"><i>↗</i><span><small>PRÓXIMA ATIVIDADE</small><strong>Apresentar proposta</strong><em>Hoje · 10:00</em></span></article>
        <div className="secure-signature"><i>O</i><span><strong>Orbit</strong><small>Seu assistente comercial.</small></span></div>
      </section>
      <section className="secure-access">
        <form className="secure-card" onSubmit={step === 'email' ? sendCode : verifyCode}>
          <div className="secure-label">ACESSO SEGURO</div>
          <h2>{step === 'email' ? 'Acesse sua empresa' : 'Confira seu e-mail'}</h2>
          <p>{step === 'email' ? 'Receba um código para continuar seu dia comercial.' : `Enviamos um código de 6 dígitos para ${email}.`}</p>
          {step === 'email' ? <label>E-mail<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="voce@empresa.com" required autoFocus /></label> : <label>Código de acesso<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus /></label>}
          <button type="submit" disabled={fetchStatus === 'fetching'}>{fetchStatus === 'fetching' ? 'Aguarde...' : step === 'email' ? 'Receber código por e-mail' : 'Entrar no CRM'}</button>
          {message && <div className="secure-message" role="alert">{message}</div>}
          {step === 'code' && <button className="secure-link" type="button" onClick={() => { signIn.reset(); setStep('email'); setCode(''); setMessage(''); }}>Usar outro e-mail</button>}
          <div className="secure-note"><span>✓</span><small>Sem senha local. Seu acesso é validado com código temporário.</small></div>
        </form>
      </section>
    </main>
  );
}
