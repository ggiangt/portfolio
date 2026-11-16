// Shared behaviour for every page. Each block checks for its own elements,
// so pages only pay for what they use.

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// Reveal on scroll: fade blocks up as they enter the viewport.
(function () {
  const isHome = root.classList.contains('js-motion');
  const isCase = root.classList.contains('js-reveal');
  if (!isHome && !isCase) return;

  // Mirrors the selector lists in styles.css (home) and case.css (case studies).
  const groups = '.duo, .cards, .flaws, .pairs, .iterations, .trio, .outcomes, .learned, .grid, .stats, .tiles';
  const selector = isHome
    ? '.work, .beyond__head > *'
    : [
        '.masthead > *',
        '.hero__frame',
        '.before-after',
        '.rule',
        '.footnote > *',
        '.next',
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
  stage.addEventListener('pointerleave', () => stage.classList.remove('has-cursor'));
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
