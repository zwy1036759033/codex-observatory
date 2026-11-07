import assert from 'node:assert/strict';
import {wordFlights,graspTarget} from '../src/components/Stage/spider/swarm-motion.js';
import {legPose} from '../src/components/Stage/spider/spider-body.js';
const events=Array.from({length:12},(_,i)=>({id:String(i),label:'Codex read source.ts build test',route:'code'}));
const body={x:240,y:300};
let peak=0;
for(let t=0;t<20;t+=.03){const words=wordFlights(events,body,t,1280,650,430,3);peak=Math.max(peak,words.length);assert.ok(words.length<=96);for(const p of words){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(events[0].label.includes(p.text));assert.ok(p.alpha>=0&&p.alpha<=1)}}
assert.ok(peak>=40,'Word burst should be visibly denser');
assert.equal(wordFlights([],body,3,1280,650,430).length,0);
assert.equal(wordFlights(events,body,3,1280,650,430,3,true).length,0);
const a=graspTarget({x:500,y:300},body,1280,650,.6),b=graspTarget({x:500,y:300},body,1280,650,2.2);
assert.ok(b.x-a.x>150);
const small=legPose({time:.3,side:1,index:3,amplitude:.6}),large=legPose({time:.3,side:1,index:3,amplitude:2.2});
assert.ok(Math.hypot(large.foot.x,large.foot.y)>Math.hypot(small.foot.x,small.foot.y));
console.log('PASS: bounded real-label word bursts, reduced motion, adjustable reach and leg expansion; peak',peak);
