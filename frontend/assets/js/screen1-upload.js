(function(){
  'use strict';
  // API base is the same origin that served this page — the backend
  // hosts the frontend as static assets, so relative '/api/*' URLs
  // work in every environment (local dev, Railway, Fly, etc.).
  var API='';
  var track=window.wvTrack||function(){};
  var VMAP={
    'Toyota Land Cruiser V8/LC300':'land_cruiser_v8',
    'Range Rover Vogue':'range_rover_vogue',
    'Lexus LX600':'lexus_lx600',
    'Toyota Land Cruiser Prado':'prado',
    'Mercedes-Benz GLE':'mercedes_gle',
    'BMW 7 Series':'bmw_7_series',
    'Subaru Outback':'subaru_outback'
  };
  var fileInput=document.getElementById('wv-file-input');
  var uploadPrompt=document.getElementById('wv-upload-prompt');
  var initBtn=document.getElementById('wv-init-btn');
  var selectedFile=null,selVehicleId=null,selVehicleLabel=null,selVehicleImg=null;
  // Default vehicle image for the "Initialize Customizer" fallback path.
  var DEFAULT_VEHICLE_IMG='assets/vehicles/land_cruiser_v8.jpg';

  // Read an uploaded file as a data URL so the chosen photo can persist
  // across screens via sessionStorage. Resolves to null on quota or IO
  // errors so the flow continues with the default/template image.
  // Enforces the same 4 MB cap as the backend multer config so the
  // frontend can't accept a photo the backend would silently reject
  // with a generic "Invalid upload." error.
  var MAX_UPLOAD_BYTES=4*1024*1024;
  function readFileAsDataUrl(file){
    return new Promise(function(resolve){
      if(!file||file.size>MAX_UPLOAD_BYTES){ resolve(null); return; }
      try{
        var r=new FileReader();
        r.onload=function(){resolve(r.result);};
        r.onerror=function(){resolve(null);};
        r.readAsDataURL(file);
      }catch(_e){ resolve(null); }
    });
  }

  var menuBtn=document.getElementById('wv-menu-btn');
  var overlay=document.getElementById('wv-menu-overlay');
  var closeBtn=document.getElementById('wv-menu-close');
  if(menuBtn&&overlay){
    menuBtn.addEventListener('click',function(){overlay.style.display='flex';});
    if(closeBtn) closeBtn.addEventListener('click',function(){overlay.style.display='none';});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }

  var OVERSIZE_HINT_TEXT='Photo must be under 4 MB';

  fileInput.addEventListener('change',function(e){
    var f=e.target.files[0]; if(!f) return;
    var iconEl=uploadPrompt.querySelector('.material-symbols-outlined');
    var textEl=uploadPrompt.querySelector('.font-headline');
    var hintEl=uploadPrompt.querySelectorAll('.text-xs');
    var lastHint=hintEl.length?hintEl[hintEl.length-1]:null;

    // Reject oversized files up-front so we never waste a base64 round-trip
    // to /api/segment only to have multer reject it with a generic 400. The
    // 4 MB ceiling matches the backend multer config in routes/segment.js.
    if(f.size>MAX_UPLOAD_BYTES){
      selectedFile=null;
      fileInput.value='';
      if(iconEl) iconEl.textContent='error';
      if(textEl) textEl.textContent='File too large';
      if(lastHint){
        lastHint.textContent=OVERSIZE_HINT_TEXT;
        lastHint.classList.remove('text-on-surface-variant');
        lastHint.classList.add('text-primary-container');
      }
      return;
    }

    selectedFile=f;
    if(iconEl) iconEl.textContent='check_circle';
    if(textEl) textEl.textContent=f.name;
    if(lastHint){
      lastHint.textContent='Ready to customize';
      lastHint.classList.remove('text-primary-container');
      lastHint.classList.add('text-on-surface-variant');
    }
  });

  var templateCards=document.querySelectorAll('.template-card');
  templateCards.forEach(function(card){
    card.addEventListener('click',function(){
      var label=card.getAttribute('data-vehicle');
      var vid=VMAP[label]; if(!vid) return;
      var img=card.getAttribute('data-vehicle-img')||DEFAULT_VEHICLE_IMG;
      selVehicleId=vid; selVehicleLabel=label; selVehicleImg=img;
      templateCards.forEach(function(c){c.classList.remove('selected');});
      card.classList.add('selected');
      sessionStorage.setItem('wv_vehicle_id',vid);
      sessionStorage.setItem('wv_vehicle_label',label);
      sessionStorage.setItem('wv_vehicle_image',img);
      // Template cards carry a known asset, not a user upload — clear any
      // stale uploaded photo from a previous session so screen2 doesn't mix them.
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
      setTimeout(function(){window.location.href='screen2-studio.html';},400);
    });
  });

  initBtn.addEventListener('click',async function(){
    if(!selVehicleId&&!selectedFile){
      // No selection and no upload: show a brief visual prompt.
      initBtn.style.outline='2px solid #FF6B00';
      initBtn.querySelector('span:first-child').textContent='Select a vehicle or upload a photo';
      setTimeout(function(){
        initBtn.style.outline='';
        initBtn.querySelector('span:first-child').textContent='Initialize Customizer';
      },2500);
      return;
    }
    if(selVehicleId){
      sessionStorage.setItem('wv_vehicle_id',selVehicleId);
      sessionStorage.setItem('wv_vehicle_label',selVehicleLabel);
      if(selVehicleImg) sessionStorage.setItem('wv_vehicle_image',selVehicleImg);
      // Template/default path: this is a known asset, not a user upload.
      // Clear any stale uploaded flag from a previous session.
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
    }
    if(selectedFile){
      // Upload path: user-supplied photo takes precedence over any template
      // id that may have been selected earlier in the same session.
      sessionStorage.removeItem('wv_vehicle_id');
      sessionStorage.removeItem('wv_vehicle_image_uploaded');
      sessionStorage.setItem('wv_vehicle_label',selVehicleLabel||'Your vehicle');
      initBtn.querySelector('span:first-child').textContent='Processing...';
      initBtn.style.pointerEvents='none'; initBtn.style.opacity='0.6';
      initBtn.setAttribute('aria-busy','true');
      initBtn.disabled=true;
      // UI Phase A skeleton: light up the shimmer line + pulse the prompt
      // so the user sees that the system is doing work. Cleared in the
      // finally block (or implicitly when we navigate away).
      var dropzone=document.getElementById('wv-dropzone');
      var dropzoneShimmer=document.getElementById('wv-dropzone-shimmer');
      var uploadPromptEl=document.getElementById('wv-upload-prompt');
      if(dropzoneShimmer){ dropzoneShimmer.classList.remove('hidden'); }
      if(dropzone){ dropzone.setAttribute('data-busy','true'); }
      if(uploadPromptEl){ uploadPromptEl.classList.add('wv-skeleton-pulse'); }
      // Block re-entry through the file picker or a template card while the
      // segmentation call is in flight.
      if(fileInput) fileInput.disabled=true;
      templateCards.forEach(function(c){ c.style.pointerEvents='none'; c.setAttribute('aria-disabled','true'); });
      // Persist the user-uploaded photo so screen2 can preview it. sessionStorage
      // is capped (~5 MB in most browsers); wrap in try/catch so an over-size
      // upload doesn't block navigation.
      var uploadDataUrl=await readFileAsDataUrl(selectedFile);
      if(uploadDataUrl){
        try{
          sessionStorage.setItem('wv_vehicle_image',uploadDataUrl);
          sessionStorage.setItem('wv_vehicle_image_uploaded','true');
        }catch(_quota){ console.warn('[WV] Upload preview too large to persist'); }
      }
      // Clear any stale mask from a previous upload so screen2 never
      // renders a segmentation result that belongs to a different photo.
      // Also clear any stale error flag from an earlier attempt.
      sessionStorage.removeItem('wv_segmented_image');
      sessionStorage.removeItem('wv_segment_error');
      // Audit W3: abort the in-flight segment call if the user closes
      // the tab or hits back. Without this, a 30s SAM-2 inference keeps
      // running on Replicate's side (we already paid for it) and the
      // browser awaits a fetch that will never resolve, blocking other
      // pagehide handlers. AbortController is supported on every
      // browser ≥ Chrome 66 / Safari 12.1 / Firefox 57.
      var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
      var onPageHide=function(){ if(ctrl) ctrl.abort(); };
      if(ctrl) window.addEventListener('pagehide',onPageHide,{once:true});
      try{
        var fd=new FormData(); fd.append('image',selectedFile);
        var res=await fetch(API+'/api/segment',{
          method:'POST',
          body:fd,
          signal: ctrl ? ctrl.signal : undefined,
        });
        var data=null; try{ data=await res.json(); }catch(_parse){ data=null; }
        if(data&&data.success&&data.segmented_image){
          sessionStorage.setItem('wv_segmented_image',data.segmented_image);
          track('segment_success',{status:res.status});
        }else{
          // Non-blocking failure: keep the user moving through the flow
          // with their raw upload, but surface a dismissible banner on
          // screen2 so they know the AI step didn't run.
          var errMsg=(data&&data.message)||'Image processing failed. You can still continue.';
          console.warn('[WV] Segmentation failed:',errMsg);
          sessionStorage.setItem('wv_segment_error',errMsg);
          track('segment_failed',{status:res.status,code:data&&data.code});
        }
      }catch(err){
        // AbortError is the user closing the tab — not actionable, no banner.
        if(err&&err.name==='AbortError'){
          track('segment_aborted',{reason:'pagehide'});
        }else{
          var networkMsg=(err&&err.message)||'Network error';
          console.warn('[WV] Segmentation skipped:',networkMsg);
          sessionStorage.setItem('wv_segment_error','Image processing failed. You can still continue.');
          track('segment_failed',{reason:'network'});
        }
      }finally{
        if(ctrl) window.removeEventListener('pagehide',onPageHide);
      }
    }
    window.location.href='screen2-studio.html';
  });

  // Same fallback rationale as screens 3 and 4: if partners.js failed
  // to load OR every entry was malformed, the hero teaser must still
  // render so the user has a way to start a chat. partners.js remains
  // the source of truth; the fallback is the safety net.
  var WV_PARTNERS_FALLBACK=[
    {id:'wa1',number:'254705040033',display:'+254 705 040 033',label:'Line 1'},
    {id:'wa2',number:'254700419444',display:'+254 700 419 444',label:'Line 2'}
  ];
  // Re-validate window.WV_PARTNERS through the shared validator. partners.js
  // already self-sanitizes, but defense-in-depth: if a future build path
  // injects WV_PARTNERS from a different source, we still drop bad entries.
  //
  // CodeRabbit (PR #24): if partners-validate.js fails to load while
  // partners.js still exposes data, the previous fallback would treat
  // raw WV_PARTNERS as already-sanitized — exactly the failure mode
  // CRITICAL-1 was supposed to eliminate. Treat a missing validator as
  // "no valid partners" so the inline WV_PARTNERS_FALLBACK takes over.
  var validator=window.WV_PARTNER_VALIDATE;
  var sanitized=(validator&&typeof validator.validatePartners==='function')
    ? validator.validatePartners(window.WV_PARTNERS)
    : [];
  var partners=sanitized.length?sanitized:WV_PARTNERS_FALLBACK;
  if(!sanitized.length){
    console.warn('[WV] partners.js missing, empty, or all entries invalid; using inline fallback on screen 1');
  }
  var teaserContainer=document.getElementById('wv-teaser-buttons');
  partners.forEach(function(p){
    if(!teaserContainer) return;
    var btn=document.createElement('button');
    btn.setAttribute('aria-label','Chat on WhatsApp '+p.label);
    btn.className='h-12 px-6 bg-secondary-container text-white font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all';
    btn.innerHTML='<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1;">chat</span>'+p.label+' \u2014 <span class="font-mono">'+p.display.replace('+254 ','0')+'</span>';
    btn.addEventListener('click',function(){
      var v=selVehicleLabel||'General Inquiry';
      var msg=encodeURIComponent('Hi, I am interested in a vehicle wrap.\nVehicle: '+v+'\n\nCould you share options and next steps?');
      track('wa_click',{screen:'screen1',partner:p.id,has_vehicle:Boolean(selVehicleLabel)});
      // p.number is guaranteed /^2547\d{8}$/ by the validator. encodeURIComponent
      // is a no-op on success but blocks any future regression.
      window.open('https://wa.me/'+encodeURIComponent(p.number)+'?text='+msg,'_blank','noopener');
    });
    teaserContainer.appendChild(btn);
  });
})();
