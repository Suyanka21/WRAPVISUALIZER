(function () {
  'use strict';

  // Scroll-jacked hero animation. The outer `.hero-morph` section is tall
  // (300vh), and the inner `.hero-morph__stage` is `position: sticky` so
  // the car stays pinned to the viewport while the user scrolls. Scroll
  // progress through the outer section is mapped 1:1 to the frame index
  // of the LC300 morph sequence (all 240 ezgif JPGs in /lc30-morph/).
  // Once the outer section ends, the stage unpins and the next section
  // (trust bar / upload) scrolls in naturally.

  var section = document.querySelector('.hero-morph');
  var canvas = document.getElementById('hero-canvas');
  var overlay = document.getElementById('hero-overlay');
  var progressLine = document.getElementById('wv-hero-progress');
  if (!section || !canvas) return;

  var ctx = canvas.getContext('2d', { alpha: false });

  // The source sequence in /lc30-morph/ has 240 JPGs named
  // ezgif-frame-001.jpg … ezgif-frame-240.jpg. All 240 are used so the
  // morph plays smoothly under scrub.
  var TOTAL_FRAMES = 240;
  var frames = new Array(TOTAL_FRAMES);
  var firstFrameReady = false;
  var lastPaintedIndex = -1;
  var rafPending = false;
  var fullPreloadStarted = false;
  var scrollListenerAttached = false;

  // Captured once at init, but kept live via the matchMedia `change`
  // listener below so OS-level preference toggles take effect without a
  // page reload.
  var motionQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);

  // Build the path for a given zero-based frame index. Maps index 0 →
  // ezgif-frame-001.jpg and index 239 → ezgif-frame-240.jpg, padding
  // the number to 3 digits so filenames sort correctly.
  function framePath(index) {
    var num = index + 1;
    var padded = num < 10 ? '00' + num : num < 100 ? '0' + num : String(num);
    return '/lc30-morph/ezgif-frame-' + padded + '.jpg';
  }

  // Resize the canvas backing store to match its CSS box so drawings
  // stay crisp. Caps devicePixelRatio at 2 to avoid blowing memory on
  // Retina/4K displays given we repaint across 240 frames.
  function sizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    if (dpr > 2) dpr = 2;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  // Cover-fit draw — scale the image to fill the canvas and center-crop
  // any overflow on the cross axis. Fills black first so letterboxing
  // is never visible while images are still decoding.
  function drawFrame(img) {
    if (!img || !img.naturalWidth) return;
    var cw = canvas.width;
    var ch = canvas.height;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var scale = Math.max(cw / iw, ch / ih);
    var sw = cw / scale;
    var sh = ch / scale;
    var sx = (iw - sw) / 2;
    var sy = (ih - sh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  // Return scroll progress through the outer section clamped to [0, 1]:
  // 0 at the moment the hero first touches the top of the viewport,
  // 1 at the moment the hero's bottom edge leaves the top of the viewport.
  function computeProgress() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var scrolled = -rect.top;
    var p = scrolled / total;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    return p;
  }

  // Pick the nearest frame already loaded to `idx` so scrubbing stays
  // visually continuous while batches are still streaming in. Returns
  // null only if literally nothing has loaded yet.
  function pickFrame(idx) {
    if (frames[idx] && frames[idx].naturalWidth) return frames[idx];
    for (var d = 1; d < TOTAL_FRAMES; d++) {
      var lo = idx - d;
      var hi = idx + d;
      if (lo >= 0 && frames[lo] && frames[lo].naturalWidth) return frames[lo];
      if (hi < TOTAL_FRAMES && frames[hi] && frames[hi].naturalWidth)
        return frames[hi];
    }
    return null;
  }

  // rAF callback: reads current scroll progress, repaints the nearest
  // loaded frame when the target index changes, and drives the text
  // overlay's fade + parallax lift. Safe to call directly on resize /
  // pageshow as a one-shot repaint.
  function syncFrameToScroll() {
    rafPending = false;
    if (!firstFrameReady) return;

    var p = computeProgress();
    var idx = Math.round(p * (TOTAL_FRAMES - 1));
    if (idx !== lastPaintedIndex) {
      var img = pickFrame(idx);
      if (img) {
        drawFrame(img);
        lastPaintedIndex = idx;
      }
    }

    if (overlay) {
      // Text is fully visible while the car is still plain black, fades
      // out through the middle of the morph (peaks of the transformation),
      // and stays hidden through the glossy-red reveal.
      var fadeStart = 0.35;
      var fadeEnd = 0.65;
      var t;
      if (p <= fadeStart) t = 1;
      else if (p >= fadeEnd) t = 0;
      else t = 1 - (p - fadeStart) / (fadeEnd - fadeStart);
      overlay.style.opacity = String(t);
      // Subtle parallax lift so the text feels like it's being pushed
      // off the stage rather than just flatly fading.
      overlay.style.transform = 'translateY(' + (-24 * (1 - t)).toFixed(1) + 'px)';
    }

    // Drive the brand-orange progress line at the bottom of the hero
    // stage. Width tracks scroll progress 0→100% so the user sees a
    // clear "how far am I through the morph" cue. UI Phase A — replaces
    // the bouncing chevron's role as primary scroll affordance.
    if (progressLine) {
      progressLine.style.width = (p * 100).toFixed(2) + '%';
    }
  }

  // Scroll listener (rAF-throttled). No-op in reduced-motion mode —
  // the stage stays on frame 0 and the overlay stays fully visible.
  function onScroll() {
    if (rafPending || reduceMotion) return;
    rafPending = true;
    window.requestAnimationFrame(syncFrameToScroll);
  }

  // Re-measure the canvas backing store on viewport changes and force
  // a repaint at the current scroll position so the cover-fit math
  // matches the new size.
  function onResize() {
    sizeCanvas();
    lastPaintedIndex = -1;
    syncFrameToScroll();
  }

  // Load a single frame by index. `onDone` fires on both success and
  // error so batch scheduling never stalls on a missing image.
  // Frame 0 is fetched with fetchPriority='high' so it paints ASAP;
  // the rest are marked 'low' to stay off the critical path.
  function loadOne(j, onDone) {
    var img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    if ('fetchPriority' in img) {
      img.fetchPriority = j === 0 ? 'high' : 'low';
    }
    img.onload = function () {
      frames[j] = img;
      if (j === 0 && !firstFrameReady) {
        firstFrameReady = true;
        sizeCanvas();
        drawFrame(img);
        lastPaintedIndex = 0;
      }
      if (onDone) onDone();
    };
    img.onerror = function () {
      if (onDone) onDone();
    };
    img.src = framePath(j);
  }

  // Preload the remaining frames in batches of BATCH so we don't
  // saturate the connection or starve the main thread. Each batch is
  // scheduled off the critical rendering path via setTimeout; once all
  // frames are in we repaint at the current scroll position.
  function preloadFrames() {
    if (fullPreloadStarted) return;
    fullPreloadStarted = true;
    var BATCH = 12;
    var idx = 0;

    function loadBatch() {
      var end = Math.min(idx + BATCH, TOTAL_FRAMES);
      for (var i = idx; i < end; i++) {
        loadOne(i);
      }
      idx = end;
      if (idx < TOTAL_FRAMES) {
        setTimeout(loadBatch, 80);
      } else {
        syncFrameToScroll();
      }
    }

    // Load frame 0 first so the stage is never blank, then kick off
    // the rest in batches.
    loadOne(0, loadBatch);
  }

  // Attach the scroll listener exactly once. Called from init when
  // reduced-motion is off, or later from the motionQuery change handler
  // if the user disables reduced-motion mid-session.
  function attachScrollListener() {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Initial setup. In reduced-motion mode, only frame 0 is fetched and
  // the scroll-driven animation is skipped entirely — the stage shows
  // a static first frame. Resize/orientation/pageshow handling is kept
  // in both modes so the static frame stays correctly sized.
  sizeCanvas();
  if (reduceMotion) {
    loadOne(0);
  } else {
    preloadFrames();
    attachScrollListener();
  }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('pageshow', syncFrameToScroll);

  // Live-update reduceMotion when the OS preference toggles. Turning
  // reduced-motion off mid-session upgrades the hero to the full
  // scrub experience; turning it on just silences onScroll.
  if (motionQuery && typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', function (e) {
      reduceMotion = e.matches;
      if (!reduceMotion) {
        preloadFrames();
        attachScrollListener();
        syncFrameToScroll();
      }
    });
  }
})();
