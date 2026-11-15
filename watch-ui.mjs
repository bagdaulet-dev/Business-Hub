import {createDemoWatch} from './src/engine/demo-watch.mjs';

/** FIFO presenter with one active notice. Timers are injectable; no DOM dependency. */
export function createNotificationQueue({show,hide,onPhase=()=>{},scheduler=globalThis,reducedMotion=false}={}) {
  if(typeof show!=='function'||typeof hide!=='function'||typeof onPhase!=='function'||
    typeof scheduler.setTimeout!=='function'||typeof scheduler.clearTimeout!=='function')throw new TypeError('Invalid notification queue');
  const pending=[],seen=new Set();
  let active=null,phase='idle',timer=null,generation=0,ticket=0;
  const setPhase=value=>{phase=value;onPhase(value,active?structuredClone(active):null);};
  function cancelTimer(){if(timer!==null)scheduler.clearTimeout(timer);timer=null;ticket++;}
  function later(callback,ms){
    cancelTimer();const run=generation,scheduled=ticket;
    timer=scheduler.setTimeout(()=>{if(run!==generation||scheduled!==ticket)return;timer=null;callback();},ms);
  }
  function showNext(){
    if(active||!pending.length||phase!=='idle')return;
    active=pending.shift();setPhase('entering');show(structuredClone(active));
    later(()=>{setPhase('holding');later(exit,5000);},reducedMotion?0:250);
  }
  function exit(){
    if(!active||phase==='exiting')return false;
    cancelTimer();setPhase('exiting');
    later(()=>{
      hide();active=null;setPhase('gap');
      later(()=>{setPhase('idle');showNext();},200);
    },reducedMotion?0:250);
    return true;
  }
  function enqueue(item){
    if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id))return false;
    seen.add(item.id);pending.push(structuredClone(item));showNext();return true;
  }
  function clear(){generation++;cancelTimer();pending.length=0;seen.clear();active=null;setPhase('idle');hide();}
  return Object.freeze({enqueue,clear,dismiss:exit,
    getSnapshot:()=>({phase,activeId:active?.id??null,pendingIds:pending.map(item=>item.id)})});
}

function conciseName(listing) {
  const attrs=listing.attributes??{};
  if(listing.product_id==='charizard-ex-199-165-psa9'){
    const card=[attrs.card_name??listing.card_name??'Charizard ex',attrs.card_number??listing.card_number].filter(Boolean).join(' ');
    const grade=[attrs.grader??listing.grader,attrs.grade??listing.grade].filter(value=>value!=null).join(' ');
    return [card,grade].filter(Boolean).join(' · ');
  }
  return {'sony-wh1000xm5':'Sony WH-1000XM5','canon-eos-r50':'Canon EOS R50'}[listing.product_id]??listing.title;
}

/** Page-local staged arrival using server-supplied historical source records. No API/model calls. */
export function createWatchUi(panel, {onNewMatch = () => {}, renderPriceDetails = null} = {}) {
  const start=panel.querySelector('#watch-start');
  const stop=panel.querySelector('#watch-stop');
  const status=panel.querySelector('#watch-status');
  const notice=document.querySelector('#watch-notification');
  const toastName=notice.querySelector('.toast-name');
  const toastPrice=notice.querySelector('.toast-price');
  const arrivals=panel.querySelector('#watch-arrivals');
  const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  const percentFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
  let savedRule=null, incoming=[], instance=null, generation=0;
  const rendered=new Set();
  const toastQueue=createNotificationQueue({
    reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onPhase(phase,item){notice.dataset.phase=phase;if(item)notice.dataset.itemId=item.id;else delete notice.dataset.itemId;},
    show(item){toastName.textContent=item.name;toastPrice.textContent=usd.format(item.price_cents/100);notice.hidden=false;},
    hide(){notice.hidden=true;toastName.textContent='';toastPrice.textContent='';},
  });
  notice.querySelector('#watch-toast-close').addEventListener('click',()=>toastQueue.dismiss());

  function dispose() {
    generation++;
    const previous=instance;instance=null;
    previous?.stop();
  }
  function clear() {
    dispose();savedRule=null;incoming=[];rendered.clear();
    panel.hidden=true;
    start.hidden=false;start.disabled=false;start.textContent='Watch this search';
    stop.hidden=true;toastQueue.clear();arrivals.replaceChildren();
    status.textContent='';
  }
  function offer(payload) {
    clear();panel.hidden=false;
    if(!payload.watchRule||!Array.isArray(payload.watchArrivals)||!payload.watchArrivals.length){
      start.hidden=true;
      status.textContent='Watching is unavailable for these conditions.';
      return;
    }
    savedRule=structuredClone(payload.watchRule);
    incoming=structuredClone(payload.watchArrivals);
    status.textContent='Use these search conditions for your watchlist.';
  }
  function originalLink(listing) {
    try {
      const url=new URL(listing.url);
      if(url.protocol!=='https:'||!['www.ebay.com','ebay.com'].includes(url.hostname)||url.port||url.username||url.password||
        !/^\/(?:itm|p)\/\d+\/?$/.test(url.pathname))return null;
      const link=document.createElement('a');link.className='external';link.href=url.href;
      link.textContent='View on eBay ↗';link.target='_blank';link.rel='noopener noreferrer';return link;
    }catch{return null;}
  }
  function renderArrival(listing) {
    if(rendered.has(listing.id))return false;
    rendered.add(listing.id);
    const article=document.createElement('article');article.className='listing arrived-listing';
    article.dataset.priceCents=String(listing.price_cents);article.dataset.itemId=listing.id;
    const info=document.createElement('div');
    const label=document.createElement('p');label.className='arrival-label';label.textContent='eBay listing';
    const title=document.createElement('h3');title.textContent=listing.title;
    const location=document.createElement('p');location.className='variant';
    location.textContent=[listing.model_year,listing.item_location_text||'Location unknown'].filter(Boolean).join(' · ');
    const price=document.createElement('strong');price.className='price';price.textContent=usd.format(listing.price_cents/100);
    const comparison=listing.comparison??{};
    const percent=comparison.benchmark!=null&&Number.isFinite(comparison.percent)?comparison.percent:null;
    const badge=document.createElement('span');badge.className=percent>0?'comparison favorable':'comparison';
    badge.textContent=percent==null?'Not enough comparable listings':percent===0?'At the comparison median'
      :`${percentFormat.format(Math.abs(percent))}% ${percent>0?'below':'above'} the comparison median`;
    const basis=document.createElement('p');basis.className='arrival-note';basis.textContent='Item price only. Shipping, taxes, and duties are excluded.';
    info.append(label,title,location,price,badge,basis);article.append(info);
    const link=originalLink(listing);if(link)article.append(link);
    if(typeof renderPriceDetails==='function'){
      article.append(renderPriceDetails({...comparison,listing,
        peers:Array.isArray(comparison.peers)?comparison.peers:[],benchmark:comparison.benchmark??null,
        delta:comparison.delta??null,percent},savedRule.item_location_countries));
    }
    const next=[...arrivals.children].find(row=>Number(row.dataset.priceCents)>listing.price_cents || Number(row.dataset.priceCents)===listing.price_cents && row.dataset.itemId.localeCompare(listing.id)>0);
    arrivals.insertBefore(article,next??null);
    return true;
  }
  function begin() {
    if(!savedRule||instance?.getSnapshot().status==='watching'||instance?.getSnapshot().status==='completed')return;
    const current=generation;
    try {
      if(!instance){
        instance=createDemoWatch({effectiveRule:savedRule,initialListings:[],incomingListings:incoming,
          onEvent(event){
            if(generation!==current)return;
            if(event.type==='watching'){
              start.hidden=true;stop.hidden=false;status.textContent='Watching this search.';
            }else if(event.type==='match_found'){
              if(renderArrival(event.listing)){
                onNewMatch(event.listing);
                toastQueue.enqueue({id:event.listing.id,name:conciseName(event.listing),price_cents:event.listing.price_cents});
              }
            }else if(event.type==='completed'){
              start.hidden=true;stop.hidden=true;
              status.textContent=event.new_match_count===1?'1 new match.':event.new_match_count?`${event.new_match_count} new matches.`:'No new matches.';
            }
          }});
      }
      instance.start();
    }catch{
      status.textContent='Watching could not start. Your search results are unchanged.';
      start.hidden=false;start.disabled=false;stop.hidden=true;
    }
  }
  start.addEventListener('click',begin);
  stop.addEventListener('click',()=>{
    if(!instance||!instance.stop())return;
    start.hidden=false;start.textContent='Resume watching';stop.hidden=true;
    status.textContent='Watching paused.';
  });
  window.addEventListener('pagehide',clear);
  clear();
  return Object.freeze({offer,clear});
}
