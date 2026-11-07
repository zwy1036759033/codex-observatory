import assert from 'node:assert/strict';
import {createSnapshotGate, subscribeRuntime} from '../src/utils/activity-bridge.js';

const accept=createSnapshotGate();
assert.equal(accept(null),false);
assert.equal(accept({timestamp:1,feed:[{n:1}]}),true);
assert.equal(accept({timestamp:2,feed:[{n:1}]}),false);
assert.equal(accept({timestamp:2,feed:[{n:2}]}),true);
// Repeated mount/unmount cannot accumulate duplicate native subscriptions.
const listeners=new Set();
const runtime={EventsOn:(_,handler)=>{listeners.add(handler);return()=>listeners.delete(handler)}};
for(let i=0;i<1000;i++){
 const stop=subscribeRuntime(runtime,'event',()=>{});
 assert.equal(listeners.size,1);stop();stop();assert.equal(listeners.size,0);
}
assert.doesNotThrow(()=>subscribeRuntime(undefined,'event',()=>{})());
console.log('PASS: timestamp-only duplicates dropped, changed data retained, 1000 subscription lifecycles cleaned up. No GUI or graphics launched.');
