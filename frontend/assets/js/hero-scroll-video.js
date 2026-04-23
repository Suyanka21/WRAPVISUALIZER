(function () {
  'use strict';

  // Scroll-controlled scrubbing of the landing hero video. Playback position
  // is driven by how far the user has scrolled through the page, not by real
  // time — the <video> element is never `.play()`ed. Kept in a dedicated
  // external file so CSP `script-src 'self'` (Stage F) stays intact.

  var video = document.getElementById('hero-video');
  if (!video) return;

  // Respect reduced-motion: leave the video on its first frame and skip the
  // scroll listener entirely. The poster / first frame remains visible as a
  // static hero image.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rafPending = false;

  // Clamp the scroll fraction into [0, duration] and write it to the video.
  // Progress is measured against the hero's own height, not the full document:
  // at scrollY 0 the video is on its first frame, and by the time the user
  // has scrolled past the bottom of the hero section the video is on its
  // last frame. The original `scrollY / (scrollHeight - innerHeight)` mapping
  // squashed the whole 4-second animation into the first ~25% of the page
  // scroll, so it looked static to the user. We also skip writes while
  // `duration` is NaN so mobile Safari doesn't stall on the first scroll.
  function syncVideoToScroll() {
    rafPending = false;
    var duration = video.duration;
    if (!duration || isNaN(duration)) return;

    var rect = video.getBoundingClientRect();
    var heroHeight = rect.height;
    if (heroHeight <= 0) return;

    var scrollY = window.scrollY || window.pageYOffset || 0;
    // Absolute Y of the hero's top edge within the document. Progress is 0
    // while the hero's top is still below the viewport top, and reaches 1
    // once the hero has scrolled its full height past the viewport top.
    // Deriving from the hero's own top (rather than document scroll or its
    // bottom) keeps the mapping correct if anything is ever added above
    // the hero in `screen1-upload.html`.
    var heroTop = rect.top + scrollY;
    var fraction = (scrollY - heroTop) / heroHeight;
    if (fraction < 0) fraction = 0;
    else if (fraction > 1) fraction = 1;

    video.currentTime = duration * fraction;
  }

  // Scroll / resize handler. Coalesces bursts of events into a single
  // `syncVideoToScroll` call per animation frame via `rafPending`, and
  // short-circuits entirely when the user prefers reduced motion.
  function onScroll() {
    if (rafPending || reduceMotion) return;
    rafPending = true;
    window.requestAnimationFrame(syncVideoToScroll);
  }

  // `loadedmetadata` fires once `video.duration` is known. Run one initial
  // sync so the first paint matches the user's current scroll position
  // (important for deep-links and back/forward cache restores).
  video.addEventListener('loadedmetadata', syncVideoToScroll);
  // If metadata is already available (bfcache or a cached response beat
  // our listener), `loadedmetadata` will not fire again — sync immediately.
  if (video.readyState >= 1 /* HAVE_METADATA */) {
    syncVideoToScroll();
  }

  // Passive listeners — scroll should never block paint.
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // `pageshow` covers the bfcache restore case where `loadedmetadata` has
  // already fired in a previous life of the page.
  window.addEventListener('pageshow', syncVideoToScroll);
})();
