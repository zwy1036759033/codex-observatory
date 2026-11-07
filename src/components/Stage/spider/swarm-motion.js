// Adapted from prompt-spider-ui's launch/hold/retract and cubic word flights.
// Pure bounded geometry, replaying fragments of observed activity labels only.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unit=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^h>>>16,0x85ebca6b);h=Math.imul(h^h>>>13,0xc2b2ae35);return((h^h>>>16)>>>0)/4294967296};
export const GRASP_PERIOD=3.8;
export function launchAt(index){return .4+index*.36;}
export function graspTarget(node,body,width,height,amplitude){
  const dx=node.x-body.x,dy=node.y-body.y,d=Math.max(1,Math.hypot(dx,dy));
  const distance=clamp(d,95,Math.min(width*.4,height*.5))*amplitude;
  return {x:clamp(body.x+dx/d*distance,18,width*.65),y:clamp(body.y+dy/d*distance,65,height-60)};
}
export function wordFlights(events,body,time,width,height,radius,density=1.8,reduced=false){
  if(reduced||!events.length)return [];
  const result=[],count=clamp(Math.round(4*density),2,12);
  events.slice(-8).forEach((event,i)=>{
    const words=String(event.label||'').match(/[A-Za-z0-9_./:-]+|[\u3400-\u9fff]{1,5}/g)||[];
    if(!words.length)return;
    for(let j=0;j<count;j++){
      const key=event.id+':'+j,seed=unit(key),start=launchAt(i)+.22+j*.038;
      if(time<start)continue;
      const age=(time-start)%GRASP_PERIOD,duration=1.35+seed*.8;
      if(age>duration)continue;
      const p=age/duration,u=1-(1-p)**3,s=1-u;
      const endX=clamp(body.x+radius*(.65+seed*.9),body.x+60,width-20);
      const endY=clamp(body.y+(unit(key+'y')-.5)*height*.95,65,height-50);
      const a={x:body.x+radius*.2,y:body.y+(seed-.5)*radius*.8};
      const b={x:endX-radius*.23,y:endY+(seed-.5)*radius*.25};
      const point=t=>{const q=1-t;return {x:q*q*q*body.x+3*q*q*t*a.x+3*q*t*t*b.x+t*t*t*endX,y:q*q*q*body.y+3*q*q*t*a.y+3*q*t*t*b.y+t*t*t*endY}};
      result.push({text:words[j%words.length].slice(0,22),...point(u),tail:point(Math.max(0,u-.055)),alpha:Math.min(1,p*9)*Math.min(1,(1-p)*4),scale:.72+seed*.45,route:event.route});
    }
  });
  return result;
}
