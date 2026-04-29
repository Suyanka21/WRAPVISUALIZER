(function(){
  'use strict';

  // Funnel-state guard. Screen 3 only makes sense as a step inside the
  // upload → customize → review flow. A direct URL visit, a refresh
  // after sessionStorage was cleared (iOS Safari Private), or a stale
  // bookmark would otherwise render the page with placeholder values
  // ("Vehicle: Vehicle / Finish: Matte / Color: Black") and let the
  // user fire a useless WhatsApp lead. wv_vehicle_label is set on
  // every legitimate entry path through screen 1, so its absence is a
  // reliable "you skipped the funnel" signal.
  if (!sessionStorage.getItem('wv_vehicle_label')) {
    window.location.replace('screen1-upload.html');
    return;
  }

  // Audit V1: whitelist sessionStorage values rendered into the
  // quote summary AND into the WhatsApp message body. Without this,
  // a tampered sessionStorage (or a stale value from a prior build's
  // finish/color naming) would let arbitrary text reach the customer-
  // facing summary card. The lists are kept in sync with the data-
  // finish / data-color attributes in screen2-studio.html.
  var ALLOWED_FINISHES=[
    'Matte','Gloss','Satin','Chrome','Carbon Fibre',
    'Brushed Metal','Colour Shift','PPF Clear'
  ];
  var ALLOWED_COLORS=[
    'Black','White','Racing Red','Midnight Blue','British Racing Green',
    'Sunset Orange','Gold','Tiffany Blue','Nardo Gray','Gunmetal',
    'Espresso Brown','Purple Reign'
  ];
  function pickAllowed(value, allowed, fallback){
    return allowed.indexOf(value)>=0 ? value : fallback;
  }
  // CSS color values destined for an inline style.background must be
  // a strict #RRGGBB or #RGB form — anything else is dropped to a safe
  // fallback. This blocks `'red; background:url(...)'` style escapes
  // even though the modern style API generally rejects them.
  function safeHex(value){
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)
      ? value
      : '#0a0a0a';
  }

  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=pickAllowed(sessionStorage.getItem('wv_finish'),ALLOWED_FINISHES,'Matte');
  var color=pickAllowed(sessionStorage.getItem('wv_color'),ALLOWED_COLORS,'Black');
  var colorHex=safeHex(sessionStorage.getItem('wv_color_hex')||'#0a0a0a');
  var vision=(sessionStorage.getItem('wv_vision')||'').trim();

  document.getElementById('wv-q-vehicle').textContent=vehicleLabel;
  document.getElementById('wv-q-finish').textContent=finish;
  document.getElementById('wv-q-color').textContent=color;
  document.getElementById('wv-q-color-dot').style.background=colorHex;

  if(vision){
    document.getElementById('wv-q-notes').textContent=vision;
    document.getElementById('wv-notes-section').style.display='block';
  }

  var track=window.wvTrack||function(){};

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  // Build the WhatsApp pre-filled message. No prices — the shop replies
  // with the tailored quote over chat. Keep notes short so the wa.me URL
  // stays under the ~2 KB limit some Android builds enforce.
  function buildMsg(){
    var lines=[
      'Hi, I would like a wrap quote for my vehicle.',
      'Vehicle: '+vehicleLabel,
      'Finish: '+finish,
      'Color: '+color
    ];
    if(vision){
      var trimmed=vision.length>400?vision.slice(0,400)+'…':vision;
      lines.push('Notes: '+trimmed);
    }
    lines.push('');
    lines.push('Could you share a tailored quote and next steps?');
    return encodeURIComponent(lines.join('\n'));
  }

  // Read partner numbers from the centralized config (partners.js).
  // If partners.js failed to load OR every entry was malformed, fall
  // back to a hardcoded copy so screen 3 is never rendered with zero
  // WhatsApp buttons — that would silently kill the conversion funnel
  // with no operator-visible alert. partners.js remains the source of
  // truth; this is a safety net.
  var WV_PARTNERS_FALLBACK=[
    {id:'wa1',number:'254705040033',display:'+254 705 040 033',label:'Line 1'},
    {id:'wa2',number:'254700419444',display:'+254 700 419 444',label:'Line 2'}
  ];
  // Re-validate window.WV_PARTNERS through the shared validator. partners.js
  // already self-sanitizes, but defense-in-depth: a future build path that
  // injects WV_PARTNERS from a different source still has its bad entries
  // dropped here, so screen3 (the lead-firing screen) can never build a
  // wa.me/undefined link.
  // CodeRabbit (PR #24): if partners-validate.js fails to load while
  // partners.js still exposes data, the previous fallback would treat
  // raw WV_PARTNERS as already-sanitized and could rebuild the
  // wa.me/undefined link path. Treat a missing validator as "no valid
  // partners" so WV_PARTNERS_FALLBACK takes over — screen3 fires the
  // actual lead, so a dead link here is the worst place to regress.
  var validator=window.WV_PARTNER_VALIDATE;
  var sanitized=(validator&&typeof validator.validatePartners==='function')
    ? validator.validatePartners(window.WV_PARTNERS)
    : [];
  var partners=sanitized.length?sanitized:WV_PARTNERS_FALLBACK;
  if(!sanitized.length){
    console.warn('[WV] partners.js missing, empty, or all entries invalid; using inline fallback on screen 3');
  }
  var btnContainer=document.getElementById('wv-wa-buttons');
  var fallbackEl=document.getElementById('wv-wa-fallback');
  var fallbackNumberEl=document.getElementById('wv-fallback-number');
  var copyBtn=document.getElementById('wv-copy-number');
  var copyConfirm=document.getElementById('wv-copy-confirm');

  // Track which partner was last tapped so the fallback shows
  // the correct number, and so screen4 can retry the right chat.
  var lastPartner=null;

  // Shared across every partner button: true while a previous click's
  // visibilitychange gate is still waiting to settle. Rapid taps
  // (partner A, then partner B within 3 s on mobile) would otherwise
  // stack listeners and emit duplicate `wa_opened` events; this flag
  // collapses them to the first click.
  var waInFlight=false;

  // Render one WhatsApp button per partner, driven by WV_PARTNERS.
  partners.forEach(function(p){
    var btn=document.createElement('button');
    btn.className='w-full h-14 bg-secondary-container text-white font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all';
    btn.innerHTML=
      '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1;">chat</span>'+
      'Chat '+p.label+' \u2014 '+p.display.replace('+254 ','0');
    btn.addEventListener('click',function(){
      if(waInFlight) return;
      waInFlight=true;
      lastPartner=p;
      track('wa_click',{screen:'screen3',partner:p.id,has_vision:Boolean(vision)});

      // Record the moment we triggered `window.open` so we can check,
      // on the next `visibilitychange`, whether the tab actually
      // backgrounded (i.e. WhatsApp or the WhatsApp Web tab opened).
      var openedAt=Date.now();
      sessionStorage.setItem('wv_wa_partner',p.number);

      // Show the copy-number fallback immediately so users on desktop
      // without WhatsApp (or in-app browsers) can copy the number by
      // hand even if the deep-link never actually opens.
      if(fallbackEl&&fallbackNumberEl){
        fallbackNumberEl.textContent=p.display;
        fallbackEl.style.display='block';
      }

      // p.number is guaranteed /^2547\d{8}$/ by the validator above;
      // encodeURIComponent is a no-op on success but blocks any future
      // regression that allows non-digit content to reach the URL.
      window.open('https://wa.me/'+encodeURIComponent(p.number)+'?text='+buildMsg(),'_blank','noopener');

      // Honest "Message Sent" gating: only mark the conversion and
      // navigate to screen4 if the tab actually becomes hidden within
      // 3 s of the click (i.e. WhatsApp / the browser handoff actually
      // happened). If it never hides, the user is still on this screen
      // with the copy-number banner shown — no false-positive screen4.
      var settled=false;
      var timeoutId;
      function cleanup(){
        document.removeEventListener('visibilitychange',onVis);
        window.removeEventListener('blur',onBlur);
        clearTimeout(timeoutId);
      }
      function markSent(reason){
        if(settled) return;
        settled=true;
        cleanup();
        waInFlight=false;
        sessionStorage.setItem('wv_wa_sent','true');
        track('wa_opened',{screen:'screen3',partner:p.id,reason:reason,latency_ms:Date.now()-openedAt});
        // Brief delay so the native WhatsApp transition can finish
        // before we swap the page under the user.
        setTimeout(function(){
          window.location.href='screen4-confirmation.html';
        },400);
      }
      function onVis(){ if(document.hidden) markSent('visibilitychange'); }
      function onBlur(){ markSent('blur'); }
      document.addEventListener('visibilitychange',onVis);
      window.addEventListener('blur',onBlur);

      // Hard cap: if neither event fires within 3 s, treat the click
      // as "deep-link didn't actually open" and release the in-flight
      // lock so the user can try a different partner. The fallback
      // banner is already visible for manual copy.
      timeoutId=setTimeout(function(){
        if(settled) return;
        settled=true;
        cleanup();
        waInFlight=false;
        track('wa_open_unverified',{screen:'screen3',partner:p.id,elapsed_ms:Date.now()-openedAt});
      },3000);
    });
    if(btnContainer) btnContainer.appendChild(btn);
  });

  // Copy-to-clipboard handler for the fallback banner.
  if(copyBtn){
    copyBtn.addEventListener('click',function(){
      if(!lastPartner) return;
      var num=lastPartner.display;
      track('wa_copy_number',{screen:'screen3',partner:lastPartner.id});
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(num).then(function(){
          if(copyConfirm) copyConfirm.style.display='block';
        });
      }else{
        // Fallback for older browsers / insecure contexts
        var ta=document.createElement('textarea');
        ta.value=num; ta.style.position='fixed'; ta.style.left='-9999px';
        document.body.appendChild(ta); ta.select();
        try{ document.execCommand('copy'); if(copyConfirm) copyConfirm.style.display='block'; }catch(_e){}
        document.body.removeChild(ta);
      }
    });
  }
})();
