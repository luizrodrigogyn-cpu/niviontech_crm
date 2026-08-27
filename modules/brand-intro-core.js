// Núcleo (sem framework) da abertura de marca ("intro") exibida uma vez por sessão de aba,
// por cima da tela de acesso/carregamento. Não lê nem grava nenhum dado do CRM, do Clerk ou da
// empresa — só decide, de forma isolada, se/quando desenhar partículas convergindo para o símbolo
// "N" num <canvas> que é passado a ele de fora. Pensado para ser chamado tanto por um wrapper React
// (app/brand-intro-overlay.tsx) quanto por testes automatizados (tests/business-rules.test.mjs),
// sem depender de DOM para as partes que podem ser testadas em Node puro.
export const brandIntroDomain=Object.freeze({name:'brand-intro',label:'Abertura da marca'});

export const INTRO_SESSION_KEY='niviontech_intro_played';

// Duração total alvo ~2s (feedback: "reduza para aproximadamente 2 segundos"), incluindo a
// dissolução final. DRIFT+CONVERGE+SOLIDIFY = 1450ms de animação + ~450ms de fade = ~1,9s.
export const INTRO_TIMINGS=Object.freeze({driftMs:450,convergeMs:650,solidifyMs:350,fadeMs:450});

export function shouldPlayBrandIntro(storage){
  try{return !storage.getItem(INTRO_SESSION_KEY)}catch{return true}
}

export function markBrandIntroPlayed(storage){
  try{storage.setItem(INTRO_SESSION_KEY,'1')}catch{/* modo privado, sem persistência: sem problema */}
}

// Garante que uma função só execute uma única vez, não importa quantas vezes seja chamada —
// usado para que `onDone` nunca dispare duas vezes (ex.: término natural + desmontagem do componente).
export function callOnce(fn){
  let called=false;
  return (...args)=>{if(called)return;called=true;return fn(...args)};
}

export function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}

// Amostra pontos dentro do glifo "N" desenhando-o num canvas auxiliar e lendo os pixels sólidos.
// Evita descrever a fonte manualmente e se adapta a qualquer proporção de tela. Exige um DOM real
// (não roda em Node puro) — por isso não é coberta por teste unitário, só a matemática ao redor dela.
export function sampleGlyphPoints(width,height,count){
  if(typeof document==='undefined')return [];
  const size=Math.round(Math.min(width,height)*.46);
  if(!size||size<2)return [];
  const off=document.createElement('canvas');
  off.width=size;off.height=size;
  const octx=off.getContext('2d');
  if(!octx)return [];
  octx.clearRect(0,0,size,size);
  octx.fillStyle='#fff';
  octx.textAlign='center';octx.textBaseline='middle';
  octx.font=`900 ${Math.round(size*.88)}px "Arial Black",Manrope,sans-serif`;
  octx.fillText('N',size/2,size/2*1.04);
  const data=octx.getImageData(0,0,size,size).data;
  const candidates=[];
  const step=Math.max(1,Math.round(size/140));
  for(let y=0;y<size;y+=step){
    for(let x=0;x<size;x+=step){
      if(data[(y*size+x)*4+3]>120)candidates.push({x,y});
    }
  }
  if(!candidates.length)return [];
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]]}
  const offsetX=width/2-size/2,offsetY=height/2-size/2;
  const points=[];
  for(let i=0;i<count;i++){
    const point=candidates[i%candidates.length];
    points.push({x:offsetX+point.x,y:offsetY+point.y});
  }
  return points;
}

// Densidade de pixels a usar no canvas: nítida em telas retina/4K (até 3x), mas com um teto de
// pixels reais desenhados por quadro para telas muito grandes (4K/5K) não sobrecarregarem a GPU.
export function resolveDpr(width,height,rawDpr){
  const baseDpr=Math.min(rawDpr||1,3);
  const MAX_BACKING_PIXELS=7_000_000;
  if(!width||!height)return baseDpr;
  return (width*height*baseDpr*baseDpr>MAX_BACKING_PIXELS)?Math.max(1,Math.sqrt(MAX_BACKING_PIXELS/(width*height))):baseDpr;
}

// Tamanho do símbolo final em relação à menor dimensão da tela. No celular ele fica proporcionalmente
// maior (feedback: "faça o símbolo ficar maior e mais marcante no celular"). No desktop, ~10% maior
// que a versão anterior (feedback: "aumentaria o símbolo aproximadamente 10% no desktop").
export function resolveLogoScale(width,height){
  return Math.min(width,height)<640?.44:.33;
}

// Lógica pura por trás do reposicionamento de partículas após um resize/rotação (extraída para poder
// ser testada em Node puro, sem canvas/DOM): reescala a posição atual de cada partícula proporcionalmente
// à mudança de tamanho da tela e, quando novos pontos de destino do glifo "N" estão disponíveis (`newTargets`),
// substitui os alvos antigos por eles; caso contrário (ex.: `sampleGlyphPoints` indisponível em Node),
// reescala os alvos antigos na mesma proporção, como aproximação segura. Muta e retorna o mesmo array.
export function rescaleParticles(particles,scaleX,scaleY,newTargets){
  particles.forEach((particle,index)=>{
    particle.x*=scaleX;particle.y*=scaleY;
    particle.startX*=scaleX;particle.startY*=scaleY;
    if(newTargets&&newTargets.length){
      particle.tx=newTargets[index%newTargets.length].x;
      particle.ty=newTargets[index%newTargets.length].y;
    }else{
      particle.tx*=scaleX;particle.ty*=scaleY;
    }
  });
  return particles;
}

// Cria e já inicia o controlador da animação num <canvas> existente. Retorna `destroy()`, que cancela
// timers/listeners/requestAnimationFrame pendentes — chamável a qualquer momento, inclusive mais de
// uma vez, sem efeito colateral. `onDone` (via callOnce internamente) dispara exatamente uma vez,
// tanto no término natural quanto se `destroy()` for chamado antes (ex.: componente desmontado).
/**
 * @param {HTMLCanvasElement|null} canvas
 * @param {{
 *   logoSrc?: string,
 *   skipButton?: HTMLButtonElement|null,
 *   onDone?: () => void,
 *   waitFor?: () => boolean,
 *   maxExtraWaitMs?: number,
 *   reduceMotion?: boolean
 * }} [options]
 * @returns {{destroy: () => void}}
 */
export function createIntroController(canvas,{
  logoSrc='assets/niviontech-symbol.png',
  skipButton=/** @type {HTMLButtonElement|null} */(null),
  onDone=()=>{},
  waitFor=/** @type {() => boolean} */(()=>true),
  maxExtraWaitMs=800,
  reduceMotion=false
}={}){
  const done=callOnce(onDone);
  const ctx=canvas?.getContext?.('2d');
  if(!canvas||!ctx){done();return {destroy(){}}}

  let destroyed=false,frame=null;
  const timers=new Set();
  function setTimer(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn()},ms);timers.add(id);return id}
  function clearTimers(){timers.forEach(id=>clearTimeout(id));timers.clear()}

  let width=0,height=0,dpr=1;
  // Preenchido depois que o canvas é medido pela 1ª vez (mais abaixo). `resize()` referencia a
  // mesma lista (por closure) em qualquer chamada futura — inclusive as disparadas por uma
  // rotação de celular no meio da animação — e por isso consegue recalcular tudo nela.
  let particles=[];
  let redrawStatic=null;

  // Gira o celular (ou redimensiona a janela) no meio da abertura: sem isto, os pontos de destino
  // do "N" e a posição atual de cada partícula continuariam calculados para o tamanho antigo da
  // tela, e o símbolo terminaria desalinhado ou cortado na nova orientação.
  function retargetParticles(prevWidth,prevHeight){
    if(!particles.length)return;
    const scaleX=prevWidth?width/prevWidth:1;
    const scaleY=prevHeight?height/prevHeight:1;
    let newTargets=[];
    try{newTargets=sampleGlyphPoints(width,height,particles.length)}catch{newTargets=[]}
    rescaleParticles(particles,scaleX,scaleY,newTargets);
  }

  function resize(){
    const prevWidth=width,prevHeight=height;
    const rect=canvas.parentElement?.getBoundingClientRect()||canvas.getBoundingClientRect();
    width=rect.width;height=rect.height;
    dpr=resolveDpr(width,height,typeof window!=='undefined'?window.devicePixelRatio:1);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!prevWidth||!prevHeight||(prevWidth===width&&prevHeight===height))return;
    retargetParticles(prevWidth,prevHeight);
    if(redrawStatic)redrawStatic();
  }
  resize();
  const onResize=()=>resize();
  if(typeof window!=='undefined')window.addEventListener('resize',onResize);

  function finish(){
    if(destroyed)return;
    destroyed=true;
    clearTimers();
    if(frame&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);
    if(typeof window!=='undefined')window.removeEventListener('resize',onResize);
    if(typeof document!=='undefined')document.removeEventListener('keydown',onKey);
    done();
  }

  function onKey(event){
    if(event.key==='Escape'||event.key==='Enter'||event.key===' ')finish();
  }
  if(typeof document!=='undefined')document.addEventListener('keydown',onKey);
  if(skipButton)skipButton.onclick=finish;

  if(reduceMotion){
    redrawStatic=function drawReducedFrame(){
      ctx.clearRect(0,0,width,height);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='rgba(230,236,250,.95)';
      ctx.font=`900 ${Math.round(Math.min(width,height)*resolveLogoScale(width,height)*.7)}px "Arial Black",Manrope,sans-serif`;
      ctx.fillText('N',width/2,height/2);
    };
    redrawStatic();
    setTimer(finish,INTRO_TIMINGS.fadeMs+250);
    return {destroy:finish};
  }

  const {driftMs,convergeMs,solidifyMs}=INTRO_TIMINGS;
  const PARTICLES=Math.round(Math.min(360,Math.max(160,(width*height)/6500)));
  particles.push(...Array.from({length:PARTICLES},()=>({
    x:Math.random()*width,y:Math.random()*height,
    startX:0,startY:0,tx:0,ty:0,
    vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6,
    r:Math.random()*1.6+.6
  })));
  let targets=[];
  try{targets=sampleGlyphPoints(width,height,PARTICLES)}catch{targets=[]}
  if(targets.length)particles.forEach((particle,index)=>{particle.tx=targets[index%targets.length].x;particle.ty=targets[index%targets.length].y});

  const start=typeof performance!=='undefined'?performance.now():Date.now();
  let logoImage=null;
  try{logoImage=new Image();logoImage.src=logoSrc}catch{logoImage=null}

  function drawParticles(alpha,linkAlpha){
    ctx.clearRect(0,0,width,height);
    if(linkAlpha>0){
      for(let i=0;i<particles.length;i++){
        for(let j=i+1;j<particles.length;j+=3){
          const a=particles[i],b=particles[j],dx=a.x-b.x,dy=a.y-b.y,dist=Math.hypot(dx,dy);
          if(dist<90){
            ctx.strokeStyle=`rgba(160,190,255,${(1-dist/90)*.42*linkAlpha})`;
            ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
          }
        }
      }
    }
    ctx.fillStyle=`rgba(225,233,255,${alpha})`;
    for(const particle of particles){
      ctx.beginPath();ctx.arc(particle.x,particle.y,particle.r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawLogo(alpha,glow){
    if(!logoImage||!logoImage.complete||!logoImage.naturalWidth)return;
    const size=Math.min(width,height)*resolveLogoScale(width,height);
    ctx.save();
    ctx.globalAlpha=alpha;
    if(glow>0){ctx.shadowColor='rgba(140,175,255,1)';ctx.shadowBlur=glow*1.4}
    ctx.drawImage(logoImage,width/2-size/2,height/2-size/2,size,size);
    ctx.restore();
  }

  function finishWhenReady(){
    const deadline=(typeof performance!=='undefined'?performance.now():Date.now())+maxExtraWaitMs;
    (function poll(){
      if(destroyed)return;
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(waitFor()||now>=deadline){finish();return}
      frame=requestAnimationFrame(poll);
    })();
  }

  function step(now){
    if(destroyed)return;
    const elapsed=now-start;
    if(elapsed<driftMs){
      for(const particle of particles){
        particle.x+=particle.vx;particle.y+=particle.vy;
        if(particle.x<0||particle.x>width)particle.vx*=-1;
        if(particle.y<0||particle.y>height)particle.vy*=-1;
      }
      drawParticles(.85,1);
      frame=requestAnimationFrame(step);
    }else if(elapsed<driftMs+convergeMs){
      const t=easeInOutCubic((elapsed-driftMs)/convergeMs);
      for(const particle of particles){
        if(!particle.startX){particle.startX=particle.x;particle.startY=particle.y}
        particle.x=particle.startX+(particle.tx-particle.startX)*t;
        particle.y=particle.startY+(particle.ty-particle.startY)*t;
      }
      drawParticles(.85+t*.15,1-t);
      frame=requestAnimationFrame(step);
    }else if(elapsed<driftMs+convergeMs+solidifyMs){
      const t=(elapsed-driftMs-convergeMs)/solidifyMs;
      drawParticles(Math.max(0,1-t*1.4),0);
      drawLogo(Math.min(1,t*1.3),20+t*26);
      frame=requestAnimationFrame(step);
    }else{
      ctx.clearRect(0,0,width,height);
      drawLogo(1,32);
      finishWhenReady();
    }
  }

  frame=requestAnimationFrame(step);
  return {destroy:finish};
}
