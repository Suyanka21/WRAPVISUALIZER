/**
 * WrapVisualizer — Shared accessibility & UX enhancements
 * Loaded on all screens for consistent behavior.
 */
(function(){
  'use strict';

  // ─── ARIA Labels ───────────────────────────────────────────
  // Add aria-labels to interactive elements missing them
  document.querySelectorAll('button').forEach(function(btn){
    if(btn.getAttribute('aria-label')) return;
    var icon=btn.querySelector('.material-symbols-outlined');
    if(icon){
      var map={
        'menu':'Open navigation menu',
        'arrow_back':'Go back',
        'close':'Close',
        'light_mode':'Light mode',
        'dark_mode':'Dark mode',
        'send':'Send'
      };
      var label=map[icon.textContent.trim()];
      if(label) btn.setAttribute('aria-label',label);
    }
  });

  // Add role=navigation to bottom nav
  document.querySelectorAll('nav').forEach(function(nav){
    if(!nav.getAttribute('aria-label')){
      if(nav.classList.contains('fixed')) nav.setAttribute('aria-label','Main navigation');
    }
  });

  // ─── Keyboard Navigation ──────────────────────────────────
  // Make all cursor-pointer divs keyboard-accessible
  document.querySelectorAll('div[class*="cursor-pointer"]').forEach(function(div){
    if(!div.getAttribute('tabindex')) div.setAttribute('tabindex','0');
    if(!div.getAttribute('role')) div.setAttribute('role','button');
    div.addEventListener('keydown',function(e){
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        div.click();
      }
    });
  });

  // ─── Focus Visible Styles ─────────────────────────────────
  var style=document.createElement('style');
  style.textContent=
    'button:focus-visible,a:focus-visible,[tabindex]:focus-visible{'+
    'outline:2px solid #FF6B00;outline-offset:2px;'+
    '}'+
    'button:focus:not(:focus-visible),a:focus:not(:focus-visible){outline:none;}';
  document.head.appendChild(style);

  // ─── Lazy Load Images ─────────────────────────────────────
  // Add loading=lazy to any image missing it
  document.querySelectorAll('img:not([loading])').forEach(function(img){
    img.setAttribute('loading','lazy');
  });

  // ─── Skip to Content ──────────────────────────────────────
  var main=document.querySelector('main');
  if(main&&!document.getElementById('skip-nav')){
    main.setAttribute('id','main-content');
    var skip=document.createElement('a');
    skip.id='skip-nav';
    skip.href='#main-content';
    skip.textContent='Skip to content';
    skip.style.cssText='position:fixed;top:-100px;left:16px;z-index:9999;background:#FF6B00;color:#fff;padding:8px 16px;font-weight:700;font-size:14px;text-decoration:none;border-radius:0 0 4px 4px;transition:top 0.2s;';
    skip.addEventListener('focus',function(){skip.style.top='0';});
    skip.addEventListener('blur',function(){skip.style.top='-100px';});
    document.body.insertBefore(skip,document.body.firstChild);
  }
})();
