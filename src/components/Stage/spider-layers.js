// Visual composition adapted from Kirito14IT/prompt-spider-ui (MIT).
// Shares the host canvas, mouse camera and animation clock. No extra process,
// event subscription, timer, physics engine, model call or simulation metrics.
import { drawSpider } from './spider/spider-body.js';
import { nebulaNodes } from './spider/nebula-projection.js';
import { probePose } from './spider/probe-geometry.js';
import { GRASP_PERIOD, launchAt, graspTarget, wordFlights } from './spider/swarm-motion.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hash = text => { let n = 2166136261; for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0) / 4294967296; };
const color = { code: '160,232,211', model: '239,168,204', you: '217,208,169' };
// Stars are explicitly decorative geometry, not invented tasks or memories.
const stars = Array.from({ length: 64 }, (_, i) => ({ id: `star-${i}`, route: ['code', 'model', 'you'][i % 3], label: '' }));
const cubic = (pose, t) => { const [a, b] = pose.joints, s = 1-t; return { x:s*s*s*pose.root.x+3*s*s*t*a.x+3*s*t*t*b.x+t*t*t*pose.tip.x, y:s*s*s*pose.root.y+3*s*s*t*a.y+3*s*t*t*b.y+t*t*t*pose.tip.y }; };

export function createSpiderLayers() {
  const canvasMetrics={flying:0};
  let spider = true, nebula = true, events = [], yaw = 0, pitch = 0;
  let sprite = null, spriteTime = -1, amplitude = 1.5, density = 1.8;
  function update(state) {
    const nextAmplitude = clamp(Number(state.reach)||1.5,.6,2.2);
    if(nextAmplitude!==amplitude)spriteTime=-1;amplitude=nextAmplitude;density=clamp(Number(state.flow)||1.8,.5,3);
    spider = Boolean(state.spider);
    nebula = Boolean(state.nebula);
    if (Array.isArray(state.packets)) {
      events = state.packets.slice(-12).map((p, i) => ({ id:String(p.n ?? i), label:String(p.text || '').replace(/\s+/g, ' ').slice(0, 44), route:p.verb === 'STATUS' ? 'model' : 'code' })).filter(p => p.label);
    }
  }
  function draw(ctx, f) {
    if (!spider && !nebula) return;
    const { cx, cy, radius:r, width:w, height:h, time:t, dt, reducedMotion } = f;
    const ease = 1-Math.exp(-Math.max(0, dt)*4.5);
    yaw += ((f.mouseX || 0)*.6-yaw)*ease;
    pitch += ((f.mouseY || 0)*.35-pitch)*ease;
    const field = { x:cx-r*.67, y:cy-r*.72, w:r*1.8, h:r*1.44 };
    const nodes = nebulaNodes(events, field, { angle:yaw, pitch, zoom:1 });
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.globalCompositeOperation = f.light ? 'multiply' : 'lighter'; ctx.shadowBlur = 0;
    if (nebula) {
      const dust = nebulaNodes(stars, field, { angle:yaw, pitch, zoom:1 });
      for (const n of dust) {
        const front = (n.depth+1)/2;
        ctx.fillStyle = `rgba(${color[n.event.route]},${.13+front*.38})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, .55+front*1.65, 0, TAU); ctx.fill();
        if (front>.78) { ctx.strokeStyle = `rgba(${color[n.event.route]},.14)`; ctx.beginPath(); ctx.arc(n.x,n.y,4+front*2,0,TAU); ctx.stroke(); }
      }
      for (const n of nodes) {
        const tint = color[n.event.route], near = (n.depth+1)/2;
        ctx.strokeStyle = `rgba(${tint},${.08+near*.12})`; ctx.lineWidth=.65;
        ctx.beginPath(); ctx.moveTo(n.hub.x,n.hub.y); ctx.lineTo(n.x,n.y); ctx.stroke();
        const phase = reducedMotion ? .5 : (t*.16+hash(n.id))%1;
        ctx.fillStyle=`rgba(${tint},.65)`; ctx.beginPath(); ctx.arc(n.hub.x+(n.x-n.hub.x)*phase,n.hub.y+(n.y-n.hub.y)*phase,1+near,0,TAU); ctx.fill();
        ctx.fillStyle=`rgba(${tint},${.55+near*.4})`; ctx.beginPath(); ctx.arc(n.x,n.y,1.6+near*2,0,TAU); ctx.fill();
      }
    }
    if (spider) {
      const clock = reducedMotion ? 0 : t;
      const body = { x:clamp(cx+r*.34+Math.sin(clock*.24)*r*.065,w*.12,w*.36), y:clamp(cy-r*.08+Math.cos(clock*.18)*r*.07,h*.22,h*.72) };
      const scale = clamp(h/700, .58, .95);
      const cycle = clock%GRASP_PERIOD;
      const targets = nodes.slice(-8);
      ctx.font='10px Consolas,monospace';ctx.textBaseline='middle';ctx.textAlign='left';
      targets.forEach((node,i) => {
        const label=node.event.label.slice(0,26), width=Math.min(170,ctx.measureText(label).width);
        const target=graspTarget(node,body,w,h,amplitude);
        const pose=probePose({index:i,word:label,target,launchTime:launchAt(i),width},cycle,body,reducedMotion);
        if (!pose.visible || pose.distance<45) return;
        const [a,b]=pose.joints;
        ctx.strokeStyle=`rgba(195,241,225,${pose.opacity*.55})`;ctx.lineWidth=.85;
        ctx.beginPath();ctx.moveTo(pose.root.x,pose.root.y);ctx.bezierCurveTo(a.x,a.y,b.x,b.y,pose.tip.x,pose.tip.y);ctx.stroke();
        for(let j=0;j<20;j++){const p=cubic(pose,j/19);ctx.fillStyle=`rgba(214,255,236,${pose.opacity*(.35+.5*((j+clock*9)%7)/7)})`;ctx.fillRect(p.x-.8,p.y-.8,1.6,1.6)}
        if(pose.contact){ctx.strokeStyle='rgba(237,178,208,.8)';ctx.strokeRect(target.x-width/2-4,target.y-9,width+8,18);ctx.fillStyle='#ebcadb';ctx.fillText(label,target.x-width/2,target.y)}
      });
      if(!sprite){sprite=document.createElement('canvas');sprite.width=360;sprite.height=360;}
      const frameTime=Math.floor(clock*30)/30;
      if(spriteTime!==frameTime){const sx=sprite.getContext('2d');sx.setTransform(1,0,0,1,0,0);sx.clearRect(0,0,360,360);sx.scale(1.5,1.5);drawSpider(sx,{x:120,y:120,motionAmplitude:amplitude,time:frameTime,reducedMotion,vx:Math.cos(clock*1.4)*65*amplitude,vy:-Math.sin(clock*1.1)*38*amplitude,activeProbes:targets.length});spriteTime=frameTime;}
      const recoil=reducedMotion?0:Math.sin(cycle*12)*.045*amplitude;
      ctx.save();ctx.translate(body.x,body.y);ctx.rotate(recoil*.45);ctx.scale(1+recoil,1-recoil*.6);ctx.drawImage(sprite,-120*scale,-120*scale,240*scale,240*scale);ctx.restore();
      const flights=wordFlights(events,body,clock,w,h,r,density,reducedMotion);
      canvasMetrics.flying=flights.length;
      for(const word of flights){const rgb=color[word.route]||color.code;ctx.strokeStyle=`rgba(${rgb},${word.alpha*.32})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(word.tail.x,word.tail.y);ctx.lineTo(word.x,word.y);ctx.stroke();ctx.font=`${Math.round(10*word.scale)}px Consolas,monospace`;ctx.fillStyle=`rgba(${rgb},${word.alpha*.95})`;ctx.fillText(word.text,word.x,word.y);}

    }
    ctx.restore();
  }
  return { update, draw, metrics:canvasMetrics, destroy(){ events=[];if(sprite){sprite.width=0;sprite.height=0;sprite=null;} } };
}
