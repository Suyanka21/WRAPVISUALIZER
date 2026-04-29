/**
 * Shared partner validation + phone normalization.
 *
 * Loaded BEFORE partners.js on every screen. Exposes three helpers on
 * window.WV_PARTNER_VALIDATE so every screen-specific script can
 * sanitize partner data through the same normalizer. Also re-runs the
 * normalizer against window.WV_PARTNERS itself once partners.js has
 * loaded, so the source of truth self-sanitizes and the menu-overlay
 * rendering in partners.js can never emit a dead wa.me link.
 *
 * GEMINI.md rule 4 — Kenyan phone formats accepted:
 *   07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX, 7XXXXXXXX (with/without +)
 * GEMINI.md rule 5 — wa.me URLs must use wa.me/2547XXXXXXXX.
 *
 * This script is classic-script-only (no ES modules) so it works on
 * the same Android Chrome 375 px viewport enforced by the rest of the
 * frontend. Uses `var` and function declarations to match the rest of
 * the screen scripts (no pre-ES6 polyfills needed).
 */
(function(){
  'use strict';

  /**
   * Coerce a raw phone value into the canonical wa.me/2547XXXXXXXX
   * digit string. Returns null if the input cannot be confidently
   * normalized — callers MUST fall back to a known-good number when
   * this returns null.
   */
  function normalizePartnerNumber(raw){
    if(raw==null) return null;
    var digits=String(raw).replace(/\D/g,'');
    if(/^07\d{8}$/.test(digits)) return '254'+digits.slice(1);
    if(/^7\d{8}$/.test(digits))  return '254'+digits;
    if(/^2547\d{8}$/.test(digits)) return digits;
    return null;
  }

  /**
   * Validate one entry from an arbitrary partner list. Drops entries
   * that aren't plain objects or don't carry a normalizable phone
   * number. Returns a sanitized partner with safe-to-render display
   * and label strings.
   */
  function validatePartner(p){
    if(!p||typeof p!=='object'||Array.isArray(p)) return null;
    var number=normalizePartnerNumber(p.number);
    if(!number) return null;
    return {
      id: typeof p.id==='string'&&p.id?p.id:'wa-'+number,
      number: number,
      display: typeof p.display==='string'&&p.display?p.display:'+'+number,
      label: typeof p.label==='string'&&p.label?p.label:'WhatsApp'
    };
  }

  /**
   * Validate and normalize a whole partner list. Returns a new array
   * containing only the entries that passed validation.
   */
  function validatePartners(list){
    if(!Array.isArray(list)) return [];
    var out=[];
    for(var i=0;i<list.length;i++){
      var v=validatePartner(list[i]);
      if(v) out.push(v);
    }
    return out;
  }

  window.WV_PARTNER_VALIDATE={
    normalizePartnerNumber: normalizePartnerNumber,
    validatePartner: validatePartner,
    validatePartners: validatePartners
  };
})();
