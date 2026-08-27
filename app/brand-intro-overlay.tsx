'use client';

// Camada visual isolada: abertura de marca exibida uma vez por sessão de aba, por cima da tela de
// acesso/carregamento (app/crm-gate.tsx). Não lê, escreve ou substitui nada do fluxo de autenticação
// Clerk, da sincronização ou da personalização por empresa — é um componente puramente decorativo que
// se auto-remove (`return null`) assim que termina ou quando já tiver tocado nesta aba. Toda a lógica
// de animação vive em ../modules/brand-intro-core.js, para poder ser testada isoladamente em Node.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  INTRO_SESSION_KEY,
  createIntroController,
  markBrandIntroPlayed,
  shouldPlayBrandIntro,
} from '../modules/brand-intro-core.js';

// `useLayoutEffect` não existe durante a renderização no servidor (React avisa se for usado ali).
// Em qualquer navegador ele roda de forma síncrona, depois que o DOM é atualizado mas ANTES do
// próximo paint — diferente de `useEffect`, que roda depois do paint. É essa diferença de tempo
// que evita o risco de piscar: a decisão de mostrar a abertura acontece antes que o navegador
// chegue a pintar a tela de acesso/carregamento por baixo, mesmo em aparelhos lentos.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Fases do ciclo de vida, todas puramente locais a este componente:
// 'cover'  -> cobertura escura já presente no HTML inicial (servidor + 1ª renderização do cliente),
//             sem canvas nem botão ainda — evita qualquer chance da tela de acesso/carregamento
//             aparecer por baixo antes do JavaScript decidir o que fazer.
// 'intro'  -> a abertura decidiu tocar: canvas e botão "Pular" entram, a animação começa.
// 'hiding' -> a animação terminou (ou foi pulada) e está dissolvendo (transição de opacidade).
// 'done'   -> nada mais é renderizado (ou porque a abertura já tinha tocado nesta aba, ou porque
//             terminou de dissolver).
type IntroPhase = 'cover' | 'intro' | 'hiding' | 'done';

export default function BrandIntroOverlay({ ready }: { ready: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const readyRef = useRef(ready);
  // Começa em 'cover' tanto no servidor quanto na primeira passada do cliente — o HTML inicial já
  // contém a cobertura escura (não `null`), então nunca há uma renderização em que a tela por baixo
  // fique visível "por padrão". Só depois, no navegador, é que decidimos entre tocar a abertura de
  // verdade ou remover a cobertura (quando a abertura já tocou nesta sessão de aba).
  const [phase, setPhase] = useState<IntroPhase>('cover');

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useIsomorphicLayoutEffect(() => {
    if (shouldPlayBrandIntro(window.sessionStorage)) {
      markBrandIntroPlayed(window.sessionStorage);
      setPhase('intro');
    } else {
      // Abertura já tocou nesta aba: some com a cobertura o quanto antes. Como isto roda em
      // `useLayoutEffect` (síncrono, antes do próximo paint), a cobertura normalmente nem chega
      // a ser pintada na tela neste caso — só existiu no HTML por uma fração de instante.
      setPhase('done');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'intro' || !canvasRef.current) return undefined;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controller = createIntroController(canvasRef.current, {
      logoSrc: '/crm/assets/niviontech-symbol.png',
      skipButton: skipRef.current,
      reduceMotion,
      waitFor: () => readyRef.current,
      onDone: () => setPhase('hiding'),
    });
    return () => controller.destroy();
  }, [phase]);

  if (phase === 'done') return null;

  return (
    // aria-hidden fica só no <canvas> (puramente decorativo). O botão "Pular" é o único elemento
    // interativo aqui e precisa continuar alcançável por teclado e leitores de tela — colocar
    // aria-hidden no contêiner inteiro (como antes) escondia esse botão da árvore de acessibilidade
    // mesmo continuando focável, o que confunde navegação por teclado/leitor de tela.
    <div
      className={`brand-intro${phase === 'hiding' ? ' brand-intro-hiding' : ''}`}
      role="dialog"
      aria-label="Abertura"
      onTransitionEnd={() => {
        if (phase === 'hiding') setPhase('done');
      }}
    >
      {/* Canvas e botão só existem a partir da fase 'intro' — na fase 'cover' (HTML inicial,
          antes do JS decidir) só a cobertura escura em si precisa existir. */}
      {phase !== 'cover' && <canvas ref={canvasRef} aria-hidden="true" />}
      {phase !== 'cover' && (
        <button type="button" ref={skipRef} className="brand-intro-skip">
          Pular
        </button>
      )}
    </div>
  );
}

export { INTRO_SESSION_KEY };
