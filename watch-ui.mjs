import {createDemoWatch} from './src/engine/demo-watch.mjs';

/** Page-local simulation only. No API/model call, subscription or live eBay request. */
export function createWatchUi(panel) {
  const start=panel.querySelector('#watch-start');
  const stop=panel.querySelector('#watch-stop');
  const status=panel.querySelector('#watch-status');
  const notice=panel.querySelector('#watch-notification');
  const arrivals=panel.querySelector('#watch-arrivals');
  const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  let savedRule=null, instance=null, loading=null, generation=0;

  function dispose() {
    generation++;
    loading?.abort();loading=null;
    const previous=instance;instance=null;
    previous?.stop();
  }
  function clear() {
    dispose();savedRule=null;
    panel.hidden=true;
    start.disabled=false;start.textContent='Watch this search';
    stop.hidden=true;notice.hidden=true;notice.textContent='';arrivals.replaceChildren();
    status.textContent='';
  }
  function offer(payload) {
    clear();panel.hidden=false;
    if(!payload.watchRule){
      start.disabled=true;
      status.textContent=payload.watchUnavailableReason||'A simulation is unavailable for these search conditions.';
      return;
    }
    savedRule=structuredClone(payload.watchRule);
    status.textContent='Your effective search conditions are saved for this page. Start a 10-second simulation of one new listing; it may or may not match.';
  }
  function renderSynthetic(listing) {
    const article=document.createElement('article');
    article.className='listing synthetic-listing';
    article.dataset.simulation='true';
    const info=document.createElement('div');
    const label=document.createElement('p');label.className='simulation-label';
    label.textContent='Simulation · Synthetic listing · Not for sale';
    const title=document.createElement('h3');title.textContent=listing.title;
    const location=document.createElement('p');location.className='variant';
    location.textContent=[listing.model_year,listing.item_location_text||'Simulated location unknown'].filter(Boolean).join(' · ');
    const price=document.createElement('strong');price.className='price';price.textContent=usd.format(listing.price_cents/100);
    const explanation=document.createElement('p');explanation.className='simulation-note';
    explanation.textContent='Matches your saved conditions. Fixed demonstration price; shipping and taxes are unknown. This is not a real eBay offer or a price-comparison benchmark.';
    info.append(label,title,location,price,explanation);article.append(info);
    arrivals.replaceChildren(article);
  }
  async function begin() {
    if(!savedRule||loading||instance?.getSnapshot().status==='watching')return;
    dispose();const current=generation;
    notice.hidden=true;notice.textContent='';arrivals.replaceChildren();
    start.disabled=true;stop.hidden=false;
    status.textContent='Preparing the fixed simulation scenario…';
    const controller=new AbortController();loading=controller;
    try {
      const response=await fetch('./data/demo/watch-scenarios.json',{signal:controller.signal});
      if(!response.ok)throw new Error('Simulation data unavailable');
      const data=await response.json();
      if(generation!==current)return;
      const scenario=data.scenarios?.find(entry=>entry.listing?.product_id===savedRule.product_id);
      if(!scenario)throw new Error('Simulation scenario unavailable');
      const watch=createDemoWatch({effectiveRule:savedRule,initialListings:[],incomingListings:[scenario.listing],
        onEvent(event){
          if(generation!==current)return;
          if(event.type==='watching'){
            status.textContent='Simulation running. One synthetic listing will arrive in 10 seconds. Your saved conditions stay unchanged.';
          }else if(event.type==='match_found'){
            renderSynthetic(event.listing);
            notice.textContent=`Demo notification: ${event.listing.title} matches your saved search at ${usd.format(event.listing.price_cents/100)}. Synthetic listing, not a live eBay alert.`;
            notice.hidden=false;
          }else if(event.type==='completed'){
            start.disabled=false;start.textContent='Replay simulation';stop.hidden=true;
            status.textContent=event.new_match_count
              ? 'Simulation complete. A matching synthetic listing and demo notification are shown below.'
              : 'Simulation complete. The synthetic listing did not match your saved conditions. No notification was sent.';
          }
        }});
      instance=watch;loading=null;
      watch.start();
    }catch{
      if(generation!==current)return;
      status.textContent='The simulation could not start. Try again; your search results are unchanged.';
      start.disabled=false;start.textContent='Try simulation again';stop.hidden=true;
    }finally{if(generation===current)loading=null;}
  }
  start.addEventListener('click',()=>{void begin();});
  stop.addEventListener('click',()=>{
    dispose();start.disabled=!savedRule;start.textContent='Restart simulation';stop.hidden=true;
    status.textContent='Simulation stopped. Your saved conditions remain; restarting begins a new 10-second wait.';
  });
  window.addEventListener('pagehide',clear);
  clear();
  return Object.freeze({offer,clear});
}
