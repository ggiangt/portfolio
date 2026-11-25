// Shared behaviour for every page. Each block checks for its own elements,
// so pages only pay for what they use.

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// How light is the page at a point? Looks through whatever sits there (images
// by their pixels, solid backgrounds by colour) and returns 0 (black) to 1
// (white). Used by the menu and the cursor to pick light or dark.
const backdropLuminance = (() => {
  const luminance = (r, g, b) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const thumbs = new WeakMap();
  const imageLum = (img, x, y) => {
    if (!img.complete || !img.naturalWidth) return null;
    try {
      let data = thumbs.get(img);
      if (!data) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        data = ctx.getImageData(0, 0, 24, 24).data;
        thumbs.set(img, data);
      }
      const r = img.getBoundingClientRect();
      const px = Math.min(23, Math.max(0, Math.floor(((x - r.left) / r.width) * 24)));
      const py = Math.min(23, Math.max(0, Math.floor(((y - r.top) / r.height) * 24)));
      const i = (py * 24 + px) * 4;
      return luminance(data[i], data[i + 1], data[i + 2]);
    } catch (err) { return null; }
  };
  const contains = (el, x, y) => {
    const r = el.getBoundingClientRect();
    return r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  return (x, y, skip = () => false) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (skip(el)) continue;
      if (el.tagName === 'IMG') { const v = imageLum(el, x, y); if (v != null) return v; continue; }
      if (el.tagName === 'VIDEO' || el.tagName === 'CANVAS') return 0.05;
      const bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (bg && (bg[3] === undefined ? 1 : +bg[3]) > 0.5) return luminance(+bg[0], +bg[1], +bg[2]);
      // Background art that ignores the pointer (e.g. the home hero) is not
      // hit-tested, so look for media inside this element under the point.
      const media = [...el.querySelectorAll(':scope img, :scope video')].filter((m) => !skip(m) && contains(m, x, y)).pop();
      if (media) {
        const v = media.tagName === 'IMG' ? imageLum(media, x, y) : 0.05;
        if (v != null) return v;
      }
    }
    return 1;
  };
})();

// Mobile navigation
(function () {
  const nav = document.querySelector('.nav');
  const toggle = nav && nav.querySelector('.nav__toggle');
  if (!toggle) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });
})();

// Pinned menu: the logo stays on the left and the links on the right. Once the
// page scrolls, a full-width frosted bar fades in behind them; the menu hides
// while scrolling down and returns on scroll up. The text colour flips between
// light and dark to suit whatever is behind the menu.
(function () {
  const nav = document.querySelector('.nav');
  const logo = nav && nav.querySelector('.nav__logo');
  const links = nav && nav.querySelector('.nav__links');
  if (!logo || !links) return;

  const wide = window.matchMedia('(min-width: 861px)');
  let scrolled = window.scrollY > 40;

  const layout = () => nav.classList.toggle('is-scrolled', scrolled);

  // Slide the menu away while scrolling down; bring it back on any scroll up.
  let lastY = window.scrollY;
  const direction = () => {
    const yNow = window.scrollY;
    const dy = yNow - lastY;
    if (Math.abs(dy) < 4) return;
    const keep = yNow < 120 || nav.classList.contains('is-open') || nav.contains(document.activeElement);
    nav.classList.toggle('is-hidden', dy > 0 && !keep);
    lastY = yNow;
  };

  // --- What colour is behind the menu? ---
  const skip = (el) => nav.contains(el) || el.closest('.toc');
  const lumAt = (x, y) => backdropLuminance(x, y, skip);
  const theme = () => {
    const r = links.getBoundingClientRect();
    const target = wide.matches && r.width ? r : nav.querySelector('.nav__toggle').getBoundingClientRect();
    const y = target.top + target.height / 2;
    const xs = [0.15, 0.5, 0.85].map((f) => target.left + target.width * f);
    const lum = xs.reduce((sum, x) => sum + lumAt(x, y), 0) / xs.length;
    const dark = lum < 0.35;
    nav.classList.toggle('is-on-dark', dark);
    nav.classList.toggle('is-on-light', !dark);
  };

  let queued = false;
  const update = () => {
    queued = false;
    const s = window.scrollY > 40;
    if (s !== scrolled) { scrolled = s; layout(); }
    direction();
    theme();
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  layout();
  theme();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('load', theme);
})();

// Hero headline: wrap each word so CSS can bring them into focus one by one.
(function () {
  const el = document.querySelector('[data-words]');
  if (!el || !root.classList.contains('js-motion')) return;

  let i = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const span = document.createElement('span');
          span.className = 'w';
          span.style.setProperty('--i', i++);
          span.textContent = part;
          frag.append(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        wrap(child);
      }
    });
  };
  el.setAttribute('aria-label', el.textContent.trim());
  wrap(el);
})();

// Hero constellations: draw a line from star to star, revealing each star as
// the line reaches it, then light up the whole sky once everything is joined.
(function () {
  const sky = document.querySelector('.hero__stars');
  if (!sky || !root.classList.contains('js-motion')) return;

  const NS = 'http://www.w3.org/2000/svg';
  const START = 0.8;   // seconds before the first line starts
  const DRAW = 12;     // seconds to draw every line, shared out by length
  const segments = [];
  const starTimes = new Map();
  const key = (x, y) => `${x},${y}`;

  sky.querySelectorAll('polyline').forEach((poly) => {
    const pts = poly.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      poly.before(line);
      segments.push({ line, from: key(x1, y1), to: key(x2, y2), len: Math.hypot(x2 - x1, y2 - y1) });
    }
    poly.remove();
  });

  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  let t = START;
  segments.forEach((seg, i) => {
    const dur = (seg.len / total) * DRAW;
    // A branch starts from a star that's already lit, so it never waits on a gap.
    if (!starTimes.has(seg.from)) starTimes.set(seg.from, t);
    seg.line.style.setProperty('--len', seg.len.toFixed(1));
    seg.line.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    seg.line.style.setProperty('--delay', `${t.toFixed(2)}s`);
    t += dur;
    if (!starTimes.has(seg.to)) starTimes.set(seg.to, t - 0.08);
  });

  sky.querySelectorAll('.star').forEach((star) => {
    const at = starTimes.get(star.dataset.at);
    star.style.setProperty('--delay', `${(at ?? START).toFixed(2)}s`);
    // Each sparkle pulses at its own pace so they never blink in unison.
    star.style.setProperty('--tw-dur', `${(2.2 + Math.random() * 2.4).toFixed(2)}s`);
    star.style.setProperty('--tw-delay', `${(Math.random() * 2).toFixed(2)}s`);
  });

  setTimeout(() => sky.classList.add('is-lit'), (t + 0.35) * 1000);
})();

// Hero sky: click (or tap) anywhere on the blue to stamp a sparkling star there.
(function () {
  const hero = document.querySelector('.hero');
  const sky = hero && hero.querySelector('.hero__stars');
  if (!sky || !sky.getScreenCTM) return;

  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(NS, 'g');
  layer.setAttribute('class', 'hero__stamps');
  sky.append(layer);
  const MAX = 40;

  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    // Only on the sky, not the white part of the cover.
    if (backdropLuminance(e.clientX, e.clientY) >= 0.3) return;
    const ctm = sky.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const r = 4 + Math.random() * 3;
    const q = r * 0.15;
    const { x, y } = pt;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'stamp');
    g.style.setProperty('--tw-dur', `${(2.4 + Math.random() * 2.4).toFixed(2)}s`);
    g.style.setProperty('--tw-delay', `${(Math.random() * 1.5).toFixed(2)}s`);
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'star__halo');
    halo.setAttribute('cx', x);
    halo.setAttribute('cy', y);
    halo.setAttribute('r', (r * 1.5).toFixed(2));
    const star = document.createElementNS(NS, 'path');
    star.setAttribute('d', `M${x},${y - r} Q${x + q},${y - q} ${x + r},${y} Q${x + q},${y + q} ${x},${y + r} Q${x - q},${y + q} ${x - r},${y} Q${x - q},${y - q} ${x},${y - r}Z`);
    g.append(halo, star);

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'stamp__ring');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', (r * 1.2).toFixed(2));
    ring.addEventListener('animationend', () => ring.remove());

    layer.append(g, ring);
    const stamps = layer.querySelectorAll('.stamp');
    if (stamps.length > MAX) stamps[0].remove();
  });
})();

// Hero parallax: feed the scroll position to CSS while the hero is visible.
(function () {
  const hero = document.querySelector('.hero');
  if (!hero || !root.classList.contains('js-motion')) return;
  let queued = false;
  const update = () => {
    queued = false;
    const y = Math.min(window.scrollY, hero.offsetHeight);
    hero.style.setProperty('--scroll', y.toFixed(1));
  };
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

// Reveal on scroll: fade blocks up as they enter the viewport.
(function () {
  const isHome = root.classList.contains('js-motion');
  const isCase = root.classList.contains('js-reveal');
  if (!isHome && !isCase) return;

  // Mirrors the selector lists in styles.css (home) and case.css (case studies).
  const groups = '.duo, .cards, .flaws, .pairs, .iterations, .trio, .outcomes, .learned, .grid, .stats, .tiles, .bento';
  const selector = isHome
    ? '.work, .beyond__head > *'
    : [
        '.masthead > *',
        '.hero__frame',
        '.before-after',
        '.rule',
        '.footnote > *',
        `.section > :not(${groups})`,
        `:is(${groups}) > *`,
      ].join(', ');

  try {
    // Items that sit side by side come in one after another.
    document.querySelectorAll(isHome ? '.works__row' : groups).forEach((group) => {
      [...group.children].forEach((child, i) => {
        child.style.setProperty('--reveal-delay', `${Math.min(i, 3) * 90}ms`);
      });
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // Also show anything already scrolled past (e.g. a reload halfway down the page).
        const scrolledPast = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !scrolledPast) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });

    document.querySelectorAll(selector).forEach((item) => observer.observe(item));
  } catch (err) {
    // If anything goes wrong, show everything rather than leave it hidden.
    root.classList.remove('js-motion', 'js-reveal');
  }
})();

// Videos: play muted on a loop while on screen, pause when scrolled away.
(function () {
  const videos = document.querySelectorAll('video[data-autoplay]');
  if (!videos.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    // Respect the visitor's setting: no autoplay, but let them press play.
    videos.forEach((video) => { video.controls = true; });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        // A missing or blocked file just leaves the poster frame showing.
        target.play().catch(() => {});
      } else {
        target.pause();
      }
    });
  }, { threshold: 0.2 });

  videos.forEach((video) => observer.observe(video));
})();

// Carousel: click-and-drag to scroll with a mouse (touch and trackpad scroll natively).
(function () {
  document.querySelectorAll('.carousel').forEach((el) => {
    let startX = 0;
    let startScroll = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) el.classList.add('is-dragging');
      el.scrollLeft = startScroll - dx;
    });
    const stop = () => {
      dragging = false;
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);

    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const step = el.clientWidth * 0.7 * (e.key === 'ArrowRight' ? 1 : -1);
      el.scrollBy({ left: step, behavior: 'smooth' });
    });
  });
})();

// "Beyond designing" canvas: drag the tilted wall of work around.
(function () {
  const stage = document.querySelector('[data-drag-stage]');
  const canvas = stage && stage.querySelector('[data-drag-canvas]');
  if (!canvas) return;

  let x = 0, y = 0;
  let vx = 0, vy = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let dragging = false;
  let touch = false;
  let frame = 0;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const apply = () => {
    const slack = 60;
    const maxX = Math.max(0, (canvas.offsetWidth - stage.clientWidth) / 2) + slack;
    const top = canvas.offsetTop;
    const maxY = -top + slack;
    const minY = Math.min(0, stage.clientHeight - (top + canvas.offsetHeight)) - slack;
    x = clamp(x, -maxX, maxX);
    y = clamp(y, minY, maxY);
    canvas.style.setProperty('--x', `${x}px`);
    canvas.style.setProperty('--y', `${y}px`);
  };

  const glide = () => {
    vx *= 0.94;
    vy *= 0.94;
    x += vx * 16;
    y += vy * 16;
    apply();
    if (Math.abs(vx) + Math.abs(vy) > 0.02) frame = requestAnimationFrame(glide);
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(frame);
    dragging = true;
    touch = e.pointerType !== 'mouse';
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    vx = vy = 0;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const rect = stage.getBoundingClientRect();
      stage.classList.add('has-cursor');
      stage.style.setProperty('--px', `${e.clientX - rect.left}px`);
      stage.style.setProperty('--py', `${e.clientY - rect.top}px`);
      // Over a piece of work (and not mid-drag), the cursor offers "See more".
      stage.classList.toggle('is-over-work', !dragging && !!e.target.closest('figure'));
    }
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    const dx = e.clientX - lastX;
    // On touch, vertical swipes keep scrolling the page; only sideways drags move the wall.
    const dy = touch ? 0 : e.clientY - lastY;
    x += dx;
    y += dy;
    vx = dx / dt;
    vy = dy / dt;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    apply();
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (!reduceMotion) frame = requestAnimationFrame(glide);
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', () => stage.classList.remove('has-cursor', 'is-over-work'));
  window.addEventListener('resize', apply);
})();

// About page: reshuffle the pile of photos.
(function () {
  const pile = document.querySelector('[data-pile]');
  const button = pile && pile.querySelector('.pile__shuffle');
  if (!button) return;

  const photos = [...pile.querySelectorAll('img')];
  button.addEventListener('click', () => {
    const order = photos.map((_, i) => i + 1).sort(() => Math.random() - 0.5);
    photos.forEach((photo, i) => {
      photo.style.setProperty('--x', Math.round(Math.random() * 64));
      photo.style.setProperty('--y', Math.round(Math.random() * 60));
      photo.style.setProperty('--r', Math.round(Math.random() * 28 - 14));
      photo.style.zIndex = order[i];
    });
  });
})();

// Case studies: a side menu for jumping between the parts of the page.
// Built from every element with a data-toc label, in page order.
(function () {
  const sections = [...document.querySelectorAll('[data-toc][id]')];
  const main = document.querySelector('main');
  if (sections.length < 2 || !main) return;

  const nav = document.createElement('nav');
  nav.className = 'toc';
  nav.setAttribute('aria-label', 'On this page');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toc__toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h7"/></svg>' +
    '<span class="visually-hidden">On this page: </span><span class="toc__current"></span>';
  const current = toggle.querySelector('.toc__current');

  const list = document.createElement('ol');
  list.className = 'toc__list';
  const links = sections.map((section) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.textContent = section.dataset.toc;
    item.append(link);
    list.append(item);
    return link;
  });

  nav.append(toggle, list);
  main.before(nav);
  root.classList.add('has-toc');

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });

  links.forEach((link, i) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(false);
      sections[i].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', link.hash);
    });
  });

  const footer = document.querySelector('.site-footer');
  const hero = document.querySelector('.hero');
  const wide = window.matchMedia('(min-width: 960px)');
  let active = -1;
  let queued = false;

  const update = () => {
    queued = false;
    const h = window.innerHeight;

    // The current part is the last one whose top has passed the upper third of the screen.
    let index = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= h * 0.35) index = i;
    });
    if (index !== active) {
      active = index;
      links.forEach((link, i) => {
        if (i === index) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      current.textContent = sections[index].dataset.toc;
    }

    // On wide screens the menu sits still, level with where the cover image
    // starts on the page (pulled up only if the window is too short to fit it).
    if (wide.matches && hero) {
      const start = hero.getBoundingClientRect().top + window.scrollY - 5;
      const fit = window.innerHeight - nav.offsetHeight - 24;
      nav.style.setProperty('--toc-top', `${Math.max(24, Math.min(start, fit))}px`);
    }

    // Always there, except over the footer.
    const shown = !(footer && footer.getBoundingClientRect().top < h * 0.85);
    nav.classList.toggle('is-shown', shown);
    if (!shown) setOpen(false);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();

// Cursor trail: little sparkles in shades of blue follow a mouse pointer.
(function () {
  if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const blues = ['#022161', '#1b4a96', '#3373bd', '#5b9be0', '#8ec0f5', '#b9d8fb'];
  const layer = document.createElement('div');
  layer.className = 'sparkle-trail';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  let lastX = -100;
  let lastY = -100;
  let live = 0;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    // One sparkle every ~16px of travel keeps the trail even at any speed.
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < 16 || live > 40) return;
    lastX = e.clientX;
    lastY = e.clientY;

    const spark = document.createElement('span');
    const size = 6 + Math.random() * 9;
    const color = blues[Math.floor(Math.random() * blues.length)];
    spark.className = 'sparkle-trail__spark';
    spark.style.cssText =
      `left:${e.clientX}px;top:${e.clientY}px;width:${size}px;height:${size}px;` +
      `background:${color};color:${color}`;
    layer.append(spark);
    live++;

    const dx = (Math.random() - 0.5) * 30;
    const dy = 14 + Math.random() * 26;
    const spin = (Math.random() - 0.5) * 180;
    spark.animate(
      [
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
        { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.2) rotate(${spin}deg)` },
      ],
      { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2, .6, .3, 1)' },
    ).onfinish = () => { spark.remove(); live--; };
  }, { passive: true });
})();
