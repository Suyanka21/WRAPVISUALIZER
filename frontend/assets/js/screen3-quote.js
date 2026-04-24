(function(){
  'use strict';
  var vehicleLabel=sessionStorage.getItem('wv_vehicle_label')||'Vehicle';
  var finish=sessionStorage.getItem('wv_finish')||'Matte';
  var color=sessionStorage.getItem('wv_color')||'Black';
  var colorHex=sessionStorage.getItem('wv_color_hex')||'#0a0a0a';
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
  var partners=window.WV_PARTNERS||[];
  var btnContainer=document.getElementById('wv-wa-buttons');
  var fallbackEl=document.getElementById('wv-wa-fallback');
  var fallbackNumberEl=document.getElementById('wv-fallback-number');
  var copyBtn=document.getElementById('wv-copy-number');
  var copyConfirm=document.getElementById('wv-copy-confirm');

  // Track which partner was last tapped so the fallback shows
  // the correct number, and so screen4 can retry the right chat.
  var lastPartner=null;

  // Render one WhatsApp button per partner, driven by WV_PARTNERS.
  partners.forEach(function(p){
    var btn=document.createElement('button');
    btn.className='w-full h-14 bg-secondary-container text-white font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all';
    btn.innerHTML=
      '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1;">chat</span>'+
      'Chat '+p.label+' \u2014 '+p.display.replace('+254 ','0');
    btn.addEventListener('click',function(){
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

      window.open('https://wa.me/'+p.number+'?text='+buildMsg(),'_blank','noopener');

      // Honest "Message Sent" gating: only mark the conversion and
      // navigate to screen4 if the tab actually becomes hidden within
      // 3 s of the click (i.e. WhatsApp / the browser handoff actually
      // happened). If it never hides, the user is still on this screen
      // with the copy-number banner shown — no false-positive screen4.
      var settled=false;
      function markSent(reason){
        if(settled) return;
        settled=true;
        document.removeEventListener('visibilitychange',onVis);
        window.removeEventListener('blur',onBlur);
        clearTimeout(timeoutId);
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
      // as "deep-link didn't actually open" and stay on this screen.
      // The fallback banner is already visible for manual copy.
      var timeoutId=setTimeout(function(){
        if(settled) return;
        settled=true;
        document.removeEventListener('visibilitychange',onVis);
        window.removeEventListener('blur',onBlur);
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
