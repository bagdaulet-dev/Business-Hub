import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationQueue} from '../../watch-ui.mjs';
function fixture(reducedMotion=false){
 let now=0,next=0;const timers=new Map(),events=[];
 const scheduler={setTimeout(fn,ms){const id=++next;timers.set(id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);}};
 const advance=ms=>{const end=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}now=end;};
 const queue=createNotificationQueue({scheduler,reducedMotion,show:item=>events.push({at:now,type:'show',id:item.id}),hide:()=>events.push({at:now,type:'hide'}),onPhase:phase=>events.push({at:now,type:'phase',phase})});
 return {queue,events,advance};
}
const first={id:'first',name:'Charizard ex 199/165 · PSA 9',price:'$375.00'},second={id:'second',name:'Charizard ex 199/165 · PSA 9',price:'$360.00'};
test('second toast waits for complete exit and gap even if its listing arrives earlier',()=>{
 const {queue,events,advance}=fixture();queue.enqueue(first);advance(5000);queue.enqueue(second);
 assert.deepEqual(events.filter(e=>e.type==='show').map(e=>e.id),['first']);
 advance(499);assert.equal(events.filter(e=>e.type==='hide').length,0);
 advance(1);assert.equal(events.find(e=>e.type==='hide').at,5500);
 advance(199);assert.equal(events.filter(e=>e.type==='show').length,1);
 advance(1);assert.deepEqual(events.filter(e=>e.type==='show').map(e=>[e.id,e.at]),[['first',0],['second',5700]]);
 advance(5700);assert.equal(events.filter(e=>e.type==='hide').length,2);
});
test('clearing active toast cancels queued notifications and stale timers',()=>{
 const {queue,events,advance}=fixture();queue.enqueue(first);queue.enqueue(second);advance(1000);queue.clear();const count=events.length;advance(30000);assert.equal(events.length,count);assert.equal(events.filter(e=>e.type==='show').length,1);
});
test('reduced motion preserves reading time and a gap without overlap',()=>{
 const {queue,events,advance}=fixture(true);queue.enqueue(first);queue.enqueue(second);advance(4999);assert.equal(events.filter(e=>e.type==='show').length,1);advance(201);assert.equal(events.filter(e=>e.type==='show').length,2);assert.ok(events.filter(e=>e.type==='hide')[0].at<=events.filter(e=>e.type==='show')[1].at);
});
test('dismissal still waits for exit and gap, while duplicate events stay deduplicated',()=>{
 const {queue,events,advance}=fixture();queue.enqueue(first);assert.equal(queue.enqueue(first),false);queue.enqueue(second);advance(300);queue.dismiss();advance(449);assert.equal(events.filter(e=>e.type==='show').length,1);advance(1);assert.equal(events.filter(e=>e.type==='show').length,2);assert.equal(queue.enqueue(first),false);
});
