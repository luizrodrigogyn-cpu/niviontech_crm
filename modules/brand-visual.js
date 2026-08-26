// Camada visual decorativa da tela de acesso. Nao armazena nem processa dados do CRM.
export const brandVisualDomain=Object.freeze({name:'brand-visual',label:'Camada visual da marca'});

export function initBrandVisual(canvas){
  if(!canvas||typeof canvas.getContext!=='function')return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const reduceMotion=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NODE_COUNT=42,LINK_DISTANCE=140;
  let width=0,height=0,dpr=Math.min(window.devicePixelRatio||1,2),nodes=[],running=false,frame=null;

  function resize(){
    const rect=canvas.parentElement?.getBoundingClientRect();
    if(!rect||!rect.width||!rect.height)return;
    width=rect.width;height=rect.height;
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function seed(){
    nodes=Array.from({length:NODE_COUNT},()=>({
      x:Math.random()*width,y:Math.random()*height,
      vx:(Math.random()-.5)*.22,vy:(Math.random()-.5)*.22,
      r:Math.random()*1.6+.6
    }));
  }
  function step(){
    ctx.clearRect(0,0,width,height);
    for(const node of nodes){
      node.x+=node.vx;node.y+=node.vy;
      if(node.x<0||node.x>width)node.vx*=-1;
      if(node.y<0||node.y>height)node.vy*=-1;
    }
    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,dist=Math.hypot(dx,dy);
        if(dist<LINK_DISTANCE){
          ctx.strokeStyle=`rgba(150,170,220,${(1-dist/LINK_DISTANCE)*.35})`;
          ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        }
      }
    }
    for(const node of nodes){
      ctx.beginPath();ctx.arc(node.x,node.y,node.r,0,Math.PI*2);
      ctx.fillStyle='rgba(205,216,242,.8)';ctx.fill();
    }
  }
  function loop(){if(!running)return;step();frame=requestAnimationFrame(loop)}
  function start(){if(running||!width||!height)return;running=true;loop()}
  function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=null}

  resize();seed();
  if(reduceMotion||!width||!height)step();else start();
  window.addEventListener('resize',()=>{const wasRunning=running;stop();resize();seed();if(reduceMotion||!wasRunning)step();else start()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(!reduceMotion)start()});
  return{start,stop};
}
