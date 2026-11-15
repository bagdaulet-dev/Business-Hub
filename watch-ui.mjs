import {createDemoWatch} from './src/engine/demo-watch.mjs';

/** Page-local staged arrival using server-supplied historical source records. No API/model calls. */
export function createWatchUi(panel, {onNewMatch = () => {}} = {}) {
  const start=panel.querySelector('#watch-start');
  const stop=panel.querySelector('#watch-stop');
  const status=panel.querySelector('#watch-status');
  const notice=panel.querySelector('#watch-notification');
  const arrivals=panel.querySelector('#watch-arrivals');
  const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  let savedRule=null, incoming=[], instance=null, generation=0;
  const rendered=new Set();

  function dispose() {
    generation++;
    const previous=instance;instance=null;
    previous?.stop();
  }
  function clear() {
    dispose();savedRule=null;incoming=[];rendered.clear();
    panel.hidden=true;
    start.hidden=false;start.disabled=false;start.textContent='Watch this search';
    stop.hidden=true;notice.hidden=true;notice.textContent='';arrivals.replaceChildren();
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
    const info=document.createElement('div');
    const label=document.createElement('p');label.className='arrival-label';label.textContent='eBay listing';
    const title=document.createElement('h3');title.textContent=listing.title;
    const location=document.createElement('p');location.className='variant';
    location.textContent=[listing.model_year,listing.item_location_text||'Location unknown'].filter(Boolean).join(' · ');
    const price=document.createElement('strong');price.className='price';price.textContent=usd.format(listing.price_cents/100);
    const basis=document.createElement('p');basis.className='arrival-note';basis.textContent='Item price only. Shipping, taxes, and duties are excluded.';
    info.append(label,title,location,price,basis);article.append(info);
    const link=originalLink(listing);if(link)article.append(link);
    arrivals.append(article);
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
              if(renderArrival(event.listing))onNewMatch();
              notice.textContent=`New match: ${event.listing.title} — ${usd.format(event.listing.price_cents/100)}`;
              notice.hidden=false;
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
