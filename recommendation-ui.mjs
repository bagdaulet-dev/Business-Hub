/** Explicit user-triggered comparison of visible IDs. No automatic model request. */
export function createRecommendationUi(panel) {
  const button=panel.querySelector('#recommend-button');
  const status=panel.querySelector('#recommend-status');
  const content=panel.querySelector('#recommendation-content');
  const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  let effectiveRule=null,ids=new Set(),active=null,generation=0,requested=false;

  function abort(){generation++;active?.abort();active=null;button.disabled=false;panel.removeAttribute('aria-busy');}
  function clear(){
    abort();effectiveRule=null;ids.clear();requested=false;
    panel.hidden=true;panel.dataset.state='idle';button.textContent='Help me choose';
    status.textContent='';content.replaceChildren();
  }
  function setSearch(payload){
    clear();
    if(!payload.effectiveRule)return;
    effectiveRule=structuredClone(payload.effectiveRule);
    ids=new Set(payload.results.map(({listing})=>listing.item_id??listing.id).filter(id=>typeof id==='string'&&id));
    panel.hidden=ids.size===0;button.disabled=ids.size===0;
  }
  function addListing(listing){
    const id=listing.item_id??listing.id;
    if(!effectiveRule||typeof id!=='string'||!id||ids.has(id))return;
    ids.add(id);abort();panel.hidden=false;panel.dataset.state='stale';
    status.textContent='New listings available — update recommendation';
    button.textContent=requested?'Update recommendation':'Help me choose';
  }
  function linkFor(candidate){
    try{
      const url=new URL(candidate.url);
      if(url.protocol!=='https:'||!['www.ebay.com','ebay.com'].includes(url.hostname)||url.port||url.username||url.password||
        !(/^\d+$/.test(candidate.item_id))||
        !(url.pathname===`/itm/${candidate.item_id}`||url.pathname===`/itm/${candidate.item_id}/`||
          /^\/p\/\d+\/?$/.test(url.pathname)&&url.searchParams.get('iid')===candidate.item_id))return null;
      const link=document.createElement('a');link.className='external';link.href=url.href;
      link.textContent='View listing ↗';link.target='_blank';link.rel='noopener noreferrer';return link;
    }catch{return null;}
  }
  function factsFor(candidate){
    const facts=candidate.facts&&typeof candidate.facts==='object'?candidate.facts:{};
    const attrs=candidate.attributes??{};
    const fields=[['Condition','condition'],['Color','color'],['Configuration','configuration'],['Model year','model_year'],['Item location','item_location_text']];
    return fields.flatMap(([label,key])=>{
      const value=candidate[key]??attrs[key]??facts[key];
      return typeof value==='string'&&value.trim()||typeof value==='number'&&Number.isFinite(value)
        ? [`${label}: ${String(value).replaceAll('_',' ')}`] : [];
    }).join(' · ');
  }
  function choice(label,candidate,reason){
    const card=document.createElement('article');card.className='recommendation-choice';
    const heading=document.createElement('h4');heading.textContent=label;
    const title=document.createElement('p');title.className='recommendation-title';title.textContent=candidate.title;
    const price=document.createElement('strong');price.className='recommendation-price';price.textContent=usd.format(candidate.price_cents/100);
    const facts=document.createElement('p');facts.className='recommendation-facts';facts.textContent=factsFor(candidate);
    card.append(heading,title,price);if(facts.textContent)card.append(facts);
    if(reason){const why=document.createElement('p');why.className='recommendation-reason';why.textContent=reason;card.append(why);}
    const link=linkFor(candidate);if(link)card.append(link);
    return card;
  }
  function render(payload,requestedIds){
    const rec=payload.recommendation;
    if(!rec||typeof rec.reason!=='string'||!rec.reason.trim()||
      ![rec.recommended_item_id,rec.alternative_item_id].every(id=>id===null||typeof id==='string')||
      !(rec.alternative_reason===null||typeof rec.alternative_reason==='string')||
      !Array.isArray(rec.checks)||!rec.checks.every(item=>typeof item==='string')||!Array.isArray(payload.candidates))throw new Error('Invalid recommendation');
    const candidates=new Map();
    for(const item of payload.candidates){
      if(!item||typeof item.item_id!=='string'||!requestedIds.has(item.item_id)||candidates.has(item.item_id)||
        typeof item.title!=='string'||!item.title.trim()||!Number.isSafeInteger(item.price_cents)||item.price_cents<0||
        item.currency!=null&&item.currency!=='USD')throw new Error('Invalid candidate');
      candidates.set(item.item_id,item);
    }
    if(rec.recommended_item_id!==null&&!candidates.has(rec.recommended_item_id)||
      rec.alternative_item_id!==null&&(!candidates.has(rec.alternative_item_id)||rec.alternative_item_id===rec.recommended_item_id))throw new Error('Unknown candidate');
    const nodes=[];
    if(rec.recommended_item_id!==null)nodes.push(choice('Best fit',candidates.get(rec.recommended_item_id),rec.reason));
    else{
      const block=document.createElement('div');block.className='recommendation-choice';
      const heading=document.createElement('h4');heading.textContent='No clear winner';
      const reason=document.createElement('p');reason.textContent=rec.reason;block.append(heading,reason);nodes.push(block);
    }
    if(rec.alternative_item_id!==null)nodes.push(choice('Nearest alternative',candidates.get(rec.alternative_item_id),rec.alternative_reason));
    if(rec.checks.length){
      const block=document.createElement('div');block.className='recommendation-checks';
      const heading=document.createElement('h4');heading.textContent='Before you decide';
      const list=document.createElement('ul');for(const text of rec.checks){const item=document.createElement('li');item.textContent=text;list.append(item);}
      block.append(heading,list);nodes.push(block);
    }
    content.replaceChildren(...nodes);
  }
  async function recommend(){
    if(active||!effectiveRule||!ids.size)return;
    const controller=new AbortController(),current=generation,requestedIds=new Set(ids);
    const rule=structuredClone(effectiveRule);
    active=controller;requested=true;button.disabled=true;panel.dataset.state='loading';panel.setAttribute('aria-busy','true');
    status.textContent='Comparing the current listings…';
    const timer=setTimeout(()=>controller.abort(),40000);
    try{
      const response=await fetch('./api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({effectiveRule:rule,listingIds:[...requestedIds]}),signal:controller.signal});
      const payload=await response.json();
      if(generation!==current||active!==controller)return;
      if(!response.ok)throw Object.assign(new Error('Recommendation unavailable'),{code:payload?.error?.code});
      render(payload,requestedIds);panel.dataset.state='ready';status.textContent=`Compared ${requestedIds.size} current listings.`;
      button.textContent='Update recommendation';
    }catch(error){
      if(generation!==current||active!==controller)return;
      panel.dataset.state='error';status.textContent=({PROVIDER_TIMEOUT:'The AI took too long. Try again.',INVALID_MODEL_OUTPUT:'The AI response could not be verified. Try again.',TOO_MANY_REQUESTS:'Please wait a minute before trying again.'})[error?.code]||'The recommendation could not finish. Try again.';button.textContent='Retry recommendation';
    }finally{
      clearTimeout(timer);
      if(generation===current&&active===controller){active=null;button.disabled=false;panel.removeAttribute('aria-busy');}
    }
  }
  button.addEventListener('click',()=>{void recommend();});
  window.addEventListener('pagehide',clear);
  clear();
  return Object.freeze({setSearch,addListing,clear});
}
