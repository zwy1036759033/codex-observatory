// Graphics-free lifecycle check: no browser, GPU, window or real raster buffers.
import assert from 'node:assert/strict';
const canvases=[], frames=new Map(),timers=new Map();let id=0;
function makeCanvas(){
 const context=new Proxy({measureText:s=>({width:String(s).length*5}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(t,k)=>k in t?t[k]:(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 const canvas={width:0,height:0,clientWidth:1280,clientHeight:600,dataset:{},getBoundingClientRect:()=>({left:0,top:0,width:1280,height:600}),getContext:()=>context,addEventListener(){},removeEventListener(){}};
 canvases.push(canvas);return canvas;
}
globalThis.document={hidden:false,createElement:makeCanvas};
globalThis.window={devicePixelRatio:1,setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:key=>timers.delete(key)};
globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};
globalThis.cancelAnimationFrame=key=>frames.delete(key);
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.Path2D=class{moveTo(){}lineTo(){}arc(){}rect(){}closePath(){}quadraticCurveTo(){}bezierCurveTo(){}};
const {createHaloFluxRenderer}=await import('../src/components/Stage/haloflux-renderer.js');
const canvas=makeCanvas(),renderer=createHaloFluxRenderer(canvas);
renderer.update({events:1,velocity:10,speed:1,camera:true,labels:['READ source']});
renderer.update({events:2,velocity:10,speed:1,camera:true,labels:['RUN_CMD test']});
assert.ok(frames.size>0);renderer.destroy();
assert.equal(frames.size,0);assert.equal(timers.size,0);
assert.ok(canvases.every(c=>c.width===0&&c.height===0));
console.log('PASS: renderer lifecycle releases all mocked canvas surfaces, frames and scheduled effects. No graphics were rendered.');
