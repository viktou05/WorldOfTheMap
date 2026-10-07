/* =====================================================================
   Mijn reisatlas: app.js
   ---------------------------------------------------------------------
   Alles draait in de browser; er is geen server of database nodig.
   • Wat je invult, wordt automatisch bewaard in deze browser.
   • Met "Exporteer" download je reizen.json. Zet dat bestand op GitHub
     (in plaats van het oude) en Vercel zet je site vanzelf opnieuw
     online. Dan ziet elk toestel, en iedereen met de link, dezelfde kaart.
   ===================================================================== */
(function () {
  'use strict';

  if (!window.d3 || !window.topojson) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="fatal">De kaartbibliotheken konden niet laden. Controleer je internetverbinding en herlaad de pagina.</div>');
    return;
  }

  /* ------------------------------------------------------------------
     1. Instellingen
     ------------------------------------------------------------------ */
  const STORE_KEY = 'reisatlas:data';
  const DIRTY_KEY = 'reisatlas:dirty';
  const DATA_FILE = 'reizen.json';
  const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
  const US_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';
  const AIRPORT_URLS = [
    'https://cdn.jsdelivr.net/gh/jpatokal/openflights@master/data/airports.dat',
    'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat',
  ];

  // Kaartkleuren. Houd ze gelijk met --v1 … --v5 in styles.css (voor de legende).
  const LAND = '#c3c6c8';
  const VISIT_COLORS = [LAND, '#2f9e5f', '#94bf3a', '#f0b929', '#ec7f24', '#d23a2a'];
  const WISH_COLOR = '#6236c9';
  const SEEN_COLOR = '#b7d6c2';
  const NIGHT_SEEN = '#2c5463';

  const SPHERE = { type: 'Sphere' };
  const GRATICULE = d3.geoGraticule10();
  const HOME_ROTATION = [-8, -32, 0]; // wereldbol start boven Europa

  // Niveaus per continent: [vanaf % bezocht, naam]
  const LEVELS = [
    [0, 'Nog te ontdekken'],
    [1e-9, 'Beginner'],
    [10, 'Verkenner'],
    [25, 'Avonturier'],
    [50, 'Kenner'],
    [75, 'Meester'],
  ];

  const TAB_HASH = { countries: '#landen', flights: '#vluchten', wish: '#verlanglijst' };
  const HASH_TAB = { '#landen': 'countries', '#vluchten': 'flights', '#verlanglijst': 'wish' };

  /* ------------------------------------------------------------------
     2. Kleine hulpjes
     ------------------------------------------------------------------ */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const nf = new Intl.NumberFormat('nl-BE');
  const nf1 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
  const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ENT[c]);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const stars = (n) => `<span class="stars" role="img" aria-label="${n} van 5 sterren">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

  function fmtDate(d) {
    if (!d) return 'zonder datum';
    const dt = new Date(d + 'T12:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDuration(h) {
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return mm ? `${hh} u ${mm} min` : `${hh} u`;
  }
  function haversine(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function rating(pct) {
    let i = 0;
    LEVELS.forEach(([min], j) => { if (pct >= min) i = j; });
    return { stars: i, label: LEVELS[i][1] };
  }

  /* ------------------------------------------------------------------
     3. Toestand
     ------------------------------------------------------------------ */
  function emptyData() {
    return {
      version: 1, title: 'Mijn reisatlas', updatedAt: null,
      countries: {},   // landcode -> aantal keer bezocht
      regions: {},     // groot land -> [regiocodes]
      notes: {},       // landcode -> notitie
      wishlist: [],    // [landcodes]
      flights: [],     // [{id, date, from, to, airline, km}]
      airports: {},    // gebruikte luchthavens (zodat de kaart altijd werkt)
    };
  }
  function normalize(d) {
    const e = emptyData();
    if (!d || typeof d !== 'object') return e;
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    return {
      ...e, ...d,
      countries: obj(d.countries), regions: obj(d.regions), notes: obj(d.notes), airports: obj(d.airports),
      wishlist: Array.isArray(d.wishlist) ? d.wishlist : [],
      flights: Array.isArray(d.flights) ? d.flights : [],
    };
  }

  let data = emptyData();

  const S = {
    tab: 'countries',
    ready: false,
    selectedKey: null,
    highlight: null,
    features: [],
    byKey: new Map(),
    area: new Map(),
    usStates: null,
    usArea: null,
    usNames: new Map(BIG_COUNTRIES['840'].regions),
    airports: new Map(),
    airportList: [],
    views: {},
  };

  /* ------------------------------------------------------------------
     4. Landen: namen, continenten, gebieden
     ------------------------------------------------------------------ */
  const DN = (() => { try { return new Intl.DisplayNames(['nl'], { type: 'region' }); } catch (e) { return null; } })();
  const INFO = new Map();

  function dutchName(a2) {
    if (!a2) return null;
    if (NAME_OVERRIDES[a2]) return NAME_OVERRIDES[a2];
    try { const n = DN && DN.of(a2); return n && n !== a2 ? n : null; } catch (e) { return null; }
  }
  function buildInfo() {
    for (const [cont, str] of Object.entries(COUNTRY_CODES)) {
      for (const tok of str.trim().split(/\s+/)) {
        const [a2, key] = tok.split(':');
        INFO.set(key, { key, a2, continent: cont, sovereign: true, nl: dutchName(a2), en: '' });
      }
    }
    for (const tok of TERRITORY_CODES.trim().split(/\s+/)) {
      const [a2, key] = tok.split(':');
      if (!INFO.has(key)) INFO.set(key, { key, a2, continent: null, sovereign: false, nl: dutchName(a2), en: '' });
    }
  }
  function nameOf(key) {
    const i = INFO.get(key);
    if (!i) return String(key).replace(/^n:/, '');
    return i.nl || i.en || i.a2 || String(i.key).replace(/^n:/, '');
  }
  function featureKey(f) {
    const n = f.properties && f.properties.name;
    if (n && NAME_ALIASES[n]) return NAME_ALIASES[n];
    if (f.id != null && f.id !== '' && String(f.id) !== '-99') return String(f.id).padStart(3, '0');
    return 'n:' + n;
  }
  function prepareWorld(world) {
    S.features = topojson.feature(world, world.objects.countries).features;
    for (const f of S.features) {
      const en = (f.properties && f.properties.name) || '';
      f.key = featureKey(f);
      let inf = INFO.get(f.key);
      if (!inf) { inf = { key: f.key, a2: null, continent: null, sovereign: false, nl: null, en }; INFO.set(f.key, inf); }
      if (!inf.en) inf.en = en;
      if (!S.byKey.has(f.key)) S.byKey.set(f.key, []);
      S.byKey.get(f.key).push(f);
      let a = d3.geoArea(f);
      if (a > 2 * Math.PI) a = 4 * Math.PI - a;
      S.area.set(f.key, (S.area.get(f.key) || 0) + a);
    }
  }
  function prepareUS(us) {
    S.usStates = topojson.feature(us, us.objects.states).features.filter((f) => S.usNames.has(String(f.id)));
    S.usStates.forEach((f) => { f.rid = String(f.id); });
    S.usArea = new Map(S.usStates.map((f) => [f.rid, d3.geoArea(f)]));
  }
  // Grootste stuk land van een land (zodat "Frankrijk" niet naar Frans-Guyana uitzoomt)
  function mainShape(key) {
    const feats = S.byKey.get(key);
    if (!feats) return null;
    let best = null, bestA = -1;
    for (const f of feats) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const p of polys) {
        const o = { type: 'Polygon', coordinates: p };
        const a = d3.geoArea(o);
        if (a < 2 * Math.PI && a > bestA) { bestA = a; best = o; }
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------
     5. Opslaan, laden, exporteren
     ------------------------------------------------------------------ */
  async function loadData() {
    let local = null, remote = null;
    try { local = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* niets bewaard */ }
    try {
      const r = await fetch(DATA_FILE, { cache: 'no-store' });
      if (r.ok) remote = await r.json();
    } catch (e) { /* geen bestand op de site */ }
    const dirty = localStorage.getItem(DIRTY_KEY) === '1';
    const stamp = (x) => (x && x.updatedAt) || '';
    if (local && remote && stamp(remote) > stamp(local)) {
      const ok = !dirty || confirm('Op de website staat een nieuwere versie van je reizen (reizen.json).\n\nWil je die laden? Wat je in deze browser veranderde en nog niet exporteerde, gaat dan verloren.');
      if (ok) { data = normalize(remote); persist(false); return; }
    }
    data = normalize(local || remote);
    if (!local && remote) persist(false);
  }
  function persist(markDirty) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      if (markDirty) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY);
    } catch (e) { toast('Bewaren in deze browser lukte niet. Exporteer je gegevens voor de zekerheid.'); }
    updateExportBadge();
  }
  function touch() { data.updatedAt = new Date().toISOString(); persist(true); }
  function commit() { touch(); renderAll(); }

  function updateExportBadge() {
    const dirty = localStorage.getItem(DIRTY_KEY) === '1';
    const b = $('#btn-export .badge');
    if (b) b.hidden = !dirty;
    $('#btn-export').title = dirty
      ? 'Je hebt wijzigingen die nog niet op GitHub staan. Download reizen.json en upload het.'
      : 'Download reizen.json om op GitHub te zetten';
  }
  function pruneAirports() {
    const used = new Set(data.flights.flatMap((f) => [f.from, f.to]));
    for (const c of Object.keys(data.airports)) if (!used.has(c)) delete data.airports[c];
  }
  function exportData() {
    pruneAirports();
    if (!data.updatedAt) data.updatedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = DATA_FILE;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    persist(false);
    toast('reizen.json is gedownload. Upload het op GitHub om je site bij te werken.');
  }
  function importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        data = normalize(JSON.parse(rd.result));
        commit();
        toast('Je gegevens zijn geïmporteerd.');
      } catch (e) { toast('Dit bestand kan niet gelezen worden. Kies een reizen.json-bestand.'); }
    };
    rd.readAsText(file);
  }
  async function reloadFromSite() {
    try {
      const r = await fetch(DATA_FILE, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const remote = await r.json();
      if (!confirm('De versie van de website laden? Wat je in deze browser veranderde en nog niet exporteerde, gaat verloren.')) return;
      data = normalize(remote);
      persist(false);
      renderAll();
      $('#settings').close();
      toast('De versie van de website is geladen.');
    } catch (e) { toast('Er staat nog geen reizen.json op de website.'); }
  }

  /* ------------------------------------------------------------------
     6. Berekeningen
     ------------------------------------------------------------------ */
  function coverage(key) {
    const big = BIG_COUNTRIES[key];
    if (!big) return 1;
    return (data.regions[key] || []).length / big.regions.length;
  }
  // Welk deel van een land telt mee voor "% van het landoppervlak"
  function areaFactor(key) {
    const big = BIG_COUNTRIES[key];
    if (!big) return 1;
    const sel = data.regions[key] || [];
    if (key === '840' && S.usArea) {
      let tot = 0, got = 0;
      for (const [rid, a] of S.usArea) { tot += a; if (sel.includes(rid)) got += a; }
      if (!got) got = tot / big.regions.length;
      return tot ? got / tot : 0;
    }
    return Math.max(sel.length, 1) / big.regions.length;
  }
  function countryStats() {
    const per = {};
    for (const c of Object.keys(CONTINENTS)) per[c] = { total: 0, visited: 0 };
    let total = 0, visited = 0;
    const terr = [];
    for (const inf of INFO.values()) {
      const been = data.countries[inf.key] > 0;
      if (inf.sovereign) {
        total++; per[inf.continent].total++;
        if (been) { visited++; per[inf.continent].visited++; }
      } else if (been) terr.push(inf.key);
    }
    let world = 0, seen = 0;
    for (const [key, a] of S.area) { world += a; if (data.countries[key] > 0) seen += a * areaFactor(key); }
    return { total, visited, per, terr, areaPct: world ? (seen / world) * 100 : 0 };
  }

  function airportOf(code) { return data.airports[code] || S.airports.get(code) || null; }
  function cityOf(a) { return a ? (a.alias || a.city || a.name || '') : ''; }
  function routeKey(f) { return [f.from, f.to].sort().join('-'); }

  function flightStats() {
    const fl = data.flights;
    let km = 0, hours = 0, longest = null;
    const airports = new Map(), years = new Map(), routes = new Set();
    for (const f of fl) {
      km += f.km || 0;
      hours += (f.km || 0) / 800 + 0.5;
      airports.set(f.from, (airports.get(f.from) || 0) + 1);
      airports.set(f.to, (airports.get(f.to) || 0) + 1);
      routes.add(routeKey(f));
      const y = (f.date || '').slice(0, 4) || '?';
      years.set(y, (years.get(y) || 0) + 1);
      if (!longest || f.km > longest.km) longest = f;
    }
    return { n: fl.length, km, hours, airports, years, longest, routes: routes.size };
  }

  /* ------------------------------------------------------------------
     7. Kaartweergave (platte kaart of wereldbol)
     ------------------------------------------------------------------ */
  class MapView {
    constructor(el, cfg) {
      this.el = el;
      this.cfg = cfg;
      this.id = cfg.id;
      this.mode = 'flat';
      this.k = 1;
      this.globeK = 1;
      this.rotation = HOME_ROTATION.slice();
      this.w = 0;
      this.h = 0;

      this.svg = d3.select(el).append('svg').attr('class', 'map-svg');
      const defs = this.svg.append('defs');
      if (cfg.patterns) {
        // Arcering voor grote landen die je maar deels zag
        for (let l = 1; l <= 5; l++) {
          for (const [suffix, size, stripe] of [['l', 7, 2], ['d', 5, 3.2]]) {
            const p = defs.append('pattern')
              .attr('id', `${this.id}-h${l}-${suffix}`)
              .attr('patternUnits', 'userSpaceOnUse')
              .attr('width', size).attr('height', size)
              .attr('patternTransform', 'rotate(45)');
            p.append('rect').attr('width', size).attr('height', size).attr('fill', LAND);
            p.append('rect').attr('width', stripe).attr('height', size).attr('fill', VISIT_COLORS[l]);
          }
        }
      }
      const g = defs.append('radialGradient').attr('id', `${this.id}-shade`)
        .attr('cx', '38%').attr('cy', '30%').attr('r', '70%');
      g.append('stop').attr('offset', '0%').attr('stop-color', '#fff').attr('stop-opacity', 0.2);
      g.append('stop').attr('offset', '55%').attr('stop-color', '#fff').attr('stop-opacity', 0);
      g.append('stop').attr('offset', '100%').attr('stop-color', '#000').attr('stop-opacity', 0.22);

      this.root = this.svg.append('g');
      this.sphere = this.root.append('path').attr('class', 'sphere');
      this.grat = this.root.append('path').attr('class', 'graticule');
      this.gCountries = this.root.append('g');
      this.gRegions = this.root.append('g');
      this.shade = this.root.append('path').attr('class', 'shade').attr('fill', `url(#${this.id}-shade)`);
      this.gOverlay = this.root.append('g');
      this.gPoints = this.root.append('g');

      this.zoom = d3.zoom().scaleExtent([1, 18]).clickDistance(4).on('zoom', (e) => {
        this.k = e.transform.k;
        this.root.attr('transform', e.transform);
        if (cfg.onZoom) cfg.onZoom(this);
      });
      this.drag = d3.drag().clickDistance(4).on('drag', (e) => this.rotateBy(e.dx, e.dy));
      this.svg.call(this.zoom);
      this.svg.on('wheel.globe', (e) => {
        if (this.mode !== 'globe') return;
        e.preventDefault();
        this.setGlobeK(this.globeK * Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });

      this.countries = this.gCountries.selectAll('path').data(S.features).join('path')
        .attr('class', 'country')
        .on('pointermove', (e, d) => showTip(e, cfg.tip ? cfg.tip(d) : null))
        .on('pointerleave', hideTip)
        .on('click', (e, d) => { hideTip(); if (cfg.onClick) cfg.onClick(d, this); });

      if (cfg.regions && S.usStates) {
        this.regions = this.gRegions.selectAll('path').data(S.usStates).join('path')
          .attr('class', 'region')
          .on('pointermove', (e, d) => showTip(e, cfg.regionTip(d)))
          .on('pointerleave', hideTip)
          .on('click', (e, d) => { hideTip(); cfg.onRegionClick(d, this); });
      }

      new ResizeObserver(() => this.resize()).observe(el);
      this.resize(true);
      this.restyle();
    }

    resize(force) {
      const r = this.el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w < 20 || h < 20) return;
      if (!force && w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.svg.attr('viewBox', `0 0 ${w} ${h}`);
      this.setupProjection();
      this.redraw();
    }

    setupProjection() {
      const { w, h } = this;
      if (this.mode === 'flat') {
        const p = d3.geoNaturalEarth1().fitExtent([[10, 10], [w - 10, h - 10]], SPHERE);
        let b = d3.geoPath(p).bounds(SPHERE);
        const mapH = b[1][1] - b[0][1];
        if (mapH < h * 0.62) {
          // Smal scherm (gsm): kaart groter zetten en Europa centreren; zijwaarts slepen kan.
          p.scale(p.scale() * Math.min((h * 0.82) / mapH, 2.6));
          const c = p([12, 18]), t = p.translate();
          p.translate([t[0] + w / 2 - c[0], t[1] + h / 2 - c[1]]);
          b = d3.geoPath(p).bounds(SPHERE);
        }
        this.zoom.extent([[0, 0], [w, h]]).translateExtent([
          [Math.min(0, b[0][0] - 10), Math.min(0, b[0][1] - 10)],
          [Math.max(w, b[1][0] + 10), Math.max(h, b[1][1] + 10)],
        ]);
        this.projection = p;
      } else {
        this.baseR = Math.min(w, h) / 2 - 14;
        this.projection = d3.geoOrthographic()
          .translate([w / 2, h / 2])
          .scale(this.baseR * this.globeK)
          .rotate(this.rotation)
          .clipAngle(90)
          .precision(0.6);
      }
      this.path = d3.geoPath(this.projection);
    }

    redraw() {
      if (!this.path) return;
      this.sphere.attr('d', this.path(SPHERE));
      this.grat.attr('d', this.path(GRATICULE));
      this.shade.attr('d', this.mode === 'globe' ? this.path(SPHERE) : null);
      this.countries.attr('d', this.path);
      if (this.regions) this.regions.attr('d', this.path);
      if (this.cfg.drawOverlay) this.cfg.drawOverlay(this);
    }

    restyle() {
      const cfg = this.cfg;
      const sel = S.tab === cfg.tab ? S.selectedKey : null;
      this.countries
        .style('fill', (d) => cfg.fill(d, this) || null)
        .classed('selected', (d) => d.key === sel);
      if (sel) this.countries.filter('.selected').raise();
      if (this.regions) this.regions.style('fill', (d) => cfg.regionFill(d) || null);
      if (cfg.drawOverlay) cfg.drawOverlay(this);
    }

    scheduleRedraw() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = null; this.redraw(); });
    }

    rotateBy(dx, dy) {
      const s = 75 / (this.baseR * this.globeK);
      this.rotation = [this.rotation[0] + dx * s, Math.max(-88, Math.min(88, this.rotation[1] - dy * s)), 0];
      this.projection.rotate(this.rotation);
      this.scheduleRedraw();
    }

    setGlobeK(k) {
      this.globeK = Math.max(0.6, Math.min(8, k));
      if (this.mode === 'globe' && this.projection) {
        this.projection.scale(this.baseR * this.globeK);
        this.scheduleRedraw();
      }
    }

    setMode(mode) {
      if (mode === this.mode) return;
      if (mode === 'globe') {
        this.svg.call(this.zoom.transform, d3.zoomIdentity);
        this.svg.on('.zoom', null);
        this.svg.call(this.drag);
      } else {
        this.svg.on('.drag', null);
        this.svg.call(this.zoom);
      }
      this.mode = mode;
      this.k = 1;
      this.root.attr('transform', null);
      this.el.closest('.map-card').classList.toggle('is-globe', mode === 'globe');
      this.resize(true);
    }

    zoomBy(f) {
      if (this.mode === 'globe') this.setGlobeK(this.globeK * f);
      else this.svg.transition().duration(280).call(this.zoom.scaleBy, f);
    }

    reset() {
      if (this.mode === 'globe') { this.setGlobeK(1); this.animateTo(HOME_ROTATION); }
      else this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity);
    }

    focus(obj) {
      if (!obj || !this.path) return;
      if (this.mode === 'globe') {
        const c = d3.geoCentroid(obj);
        this.animateTo([-c[0], -c[1], 0]);
        return;
      }
      const [[x0, y0], [x1, y1]] = this.path.bounds(obj);
      const dx = Math.max(x1 - x0, 1), dy = Math.max(y1 - y0, 1);
      const k = Math.max(1, Math.min(14, 0.7 / Math.max(dx / this.w, dy / this.h)));
      const t = d3.zoomIdentity.translate(this.w / 2, this.h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      this.svg.transition().duration(750).call(this.zoom.transform, t);
    }

    animateTo(target) {
      const from = this.rotation.slice();
      const to = target.slice();
      to[0] = from[0] + ((((to[0] - from[0]) % 360) + 540) % 360) - 180; // kortste weg
      const ip = d3.interpolate(from, to);
      this.svg.transition('rotate').duration(900).tween('rotate', () => (t) => {
        if (this.mode !== 'globe') return;
        this.rotation = ip(t).slice();
        this.projection.rotate(this.rotation);
        this.redraw();
      });
    }
  }

  function focusKey(tab, key) {
    const v = S.views[tab];
    const shape = mainShape(key);
    if (v && shape) v.focus(shape);
  }

  /* ------------------------------------------------------------------
     8. De drie kaarten
     ------------------------------------------------------------------ */
  function visitFill(key, prefix) {
    const v = data.countries[key] || 0;
    if (!v) return null;
    const lvl = Math.min(v, 5);
    if (BIG_COUNTRIES[key]) {
      const c = coverage(key);
      if (c < 1 / 3) return `url(#${prefix}-h${lvl}-l)`;
      if (c < 2 / 3) return `url(#${prefix}-h${lvl}-d)`;
    }
    return VISIT_COLORS[lvl];
  }
  function countryTip(key) {
    const inf = INFO.get(key) || {};
    const v = data.countries[key] || 0;
    const big = BIG_COUNTRIES[key];
    let s = `<b>${esc(nameOf(key))}</b><br>${v ? `${v}× bezocht` : 'Nog niet bezocht'}`;
    if (big && v) s += `, ${(data.regions[key] || []).length} van ${big.regions.length} ${esc(big.unit)}`;
    if (!inf.sovereign) s += '<br><span class="muted">Gebied, telt niet mee als land</span>';
    if (data.wishlist.includes(key)) s += '<br><span class="muted">★ Op je verlanglijst</span>';
    return s;
  }
  function wishTip(key) {
    const on = data.wishlist.includes(key);
    const v = data.countries[key] || 0;
    return `<b>${esc(nameOf(key))}</b><br>${on ? '★ Op je verlanglijst' : 'Klik om toe te voegen'}`
      + (v ? `<br><span class="muted">Al ${v}× geweest</span>` : '');
  }

  const VIEW_CFG = {
    countries: {
      id: 'mc', tab: 'countries', patterns: true, regions: true,
      fill: (d, v) => visitFill(d.key, v.id),
      tip: (d) => countryTip(d.key),
      onClick: (d) => openCountry(d.key),
      regionFill: (r) => {
        const n = data.countries['840'] || 0;
        return n && (data.regions['840'] || []).includes(r.rid) ? VISIT_COLORS[Math.min(n, 5)] : null;
      },
      regionTip: (r) => {
        const on = (data.regions['840'] || []).includes(r.rid);
        return `<b>${esc(S.usNames.get(r.rid))}</b><br>${on ? 'Bezocht' : 'Nog niet bezocht'}`
          + (S.selectedKey === '840' ? '<br><span class="muted">Klik om aan of uit te zetten</span>' : '');
      },
      onRegionClick: (r) => {
        if (S.selectedKey === '840') toggleRegion('840', r.rid);
        else openCountry('840');
      },
    },
    flights: {
      id: 'mf', tab: 'flights',
      fill: (d) => (data.countries[d.key] > 0 ? NIGHT_SEEN : null),
      tip: (d) => `<b>${esc(nameOf(d.key))}</b>`,
      drawOverlay: drawFlights,
      onZoom: drawFlights,
    },
    wish: {
      id: 'mw', tab: 'wish',
      fill: (d) => (data.wishlist.includes(d.key) ? WISH_COLOR : data.countries[d.key] > 0 ? SEEN_COLOR : null),
      tip: (d) => wishTip(d.key),
      onClick: (d) => toggleWish(d.key),
    },
  };

  function ensureView(tab) {
    if (!S.ready) return;
    if (!S.views[tab]) {
      const el = $('#map-' + tab);
      S.views[tab] = new MapView(el, VIEW_CFG[tab]);
      el.closest('.map-card').classList.add('loaded');
    } else {
      S.views[tab].resize();
    }
  }
  function restyleViews() { for (const v of Object.values(S.views)) v.restyle(); }

  function showTab(tab) {
    if (!VIEW_CFG[tab]) tab = 'countries';
    S.tab = tab;
    S.selectedKey = null;
    $('#sheet').classList.remove('open');
    $$('.view').forEach((v) => { v.hidden = v.dataset.tab !== tab; });
    $$('.tabs button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    if (location.hash !== TAB_HASH[tab]) history.replaceState(null, '', TAB_HASH[tab]);
    hideTip();
    ensureView(tab);
    restyleViews();
  }

  /* ------------------------------------------------------------------
     9. Landenpaneel (wat je ziet als je op een land klikt)
     ------------------------------------------------------------------ */
  function openCountry(key) {
    if (!INFO.has(key)) return;
    S.selectedKey = key;
    buildSheet();
    restyleViews();
  }
  function closeSheet() {
    S.selectedKey = null;
    $('#sheet').classList.remove('open');
    restyleViews();
  }
  function buildSheet() {
    const key = S.selectedKey, inf = INFO.get(key), big = BIG_COUNTRIES[key];
    const sub = inf.sovereign ? CONTINENTS[inf.continent] : 'Gebied, telt niet mee in je aantal landen';
    let h = `
      <div class="sheet-head">
        <div><h2>${esc(nameOf(key))}</h2><div class="sheet-sub">${esc(sub)}</div></div>
        <button type="button" class="icon-btn" data-act="close" aria-label="Sluiten">✕</button>
      </div>
      <div class="sheet-body">
        <section class="field">
          <div class="field-label">Hoe vaak ben je er geweest?</div>
          <div class="visit-row">
            <div class="stepper">
              <button type="button" data-act="dec" aria-label="Eén keer minder">−</button>
              <output id="sh-count" aria-live="polite">0</output>
              <button type="button" data-act="inc" aria-label="Eén keer meer">+</button>
            </div>
            <div class="visit-badge" id="sh-badge"></div>
          </div>
        </section>`;
    if (big) {
      const extra = key === '840' ? ' Je kunt ook rechtstreeks op de kaart op een staat klikken.' : '';
      h += `
        <section class="field">
          <div class="field-row"><div class="field-label">Welke ${esc(big.unit)} heb je gezien?</div><span class="pill" id="sh-rcount"></span></div>
          <p class="hint">Groot land: hoe meer ${esc(big.unit)} je aanduidt, hoe voller het op de kaart kleurt.${extra}</p>
          ${big.regions.length > 14 ? `<input class="input" id="sh-rfilter" type="search" placeholder="Zoek in de ${esc(big.unit)}" autocomplete="off">` : ''}
          <div class="chips" id="sh-chips">${big.regions.map(([id, n]) => `<button type="button" class="chip" data-rid="${esc(id)}">${esc(n)}</button>`).join('')}</div>
        </section>`;
    }
    h += `
        <section class="field">
          <label class="switch"><input type="checkbox" id="sh-wish"><span class="track"></span><span>Op mijn verlanglijst</span></label>
        </section>
        <section class="field">
          <label class="field-label" for="sh-note">Notitie</label>
          <textarea class="input" id="sh-note" rows="2" placeholder="Bijvoorbeeld: zomer 2019, rondreis met de familie"></textarea>
        </section>
      </div>`;
    const sh = $('#sheet');
    sh.innerHTML = h;
    sh.classList.add('open');
    $('#sh-note').value = data.notes[key] || '';
    updateSheet();
  }
  function updateSheet() {
    const key = S.selectedKey;
    if (!key || !$('#sh-count')) return;
    const v = data.countries[key] || 0, lvl = Math.min(v, 5);
    $('#sh-count').textContent = v;
    $('#sh-badge').innerHTML = `<span class="dot" style="background:${VISIT_COLORS[lvl]}"></span>${v === 0 ? 'Nog nooit' : v === 1 ? '1 keer' : `${v} keer`}`;
    $('#sheet').style.setProperty('--lvl', VISIT_COLORS[Math.max(1, lvl)]);
    const big = BIG_COUNTRIES[key];
    if (big) {
      const set = new Set(data.regions[key] || []);
      $$('#sh-chips .chip').forEach((c) => {
        const on = set.has(c.dataset.rid);
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('#sh-rcount').textContent = `${set.size} / ${big.regions.length}`;
    }
    $('#sh-wish').checked = data.wishlist.includes(key);
  }

  function setVisits(key, v) {
    v = Math.max(0, Math.min(99, v));
    const prevRegions = data.regions[key];
    if (v === 0) { delete data.countries[key]; delete data.regions[key]; }
    else data.countries[key] = v;
    commit();
    if (v === 0 && prevRegions && prevRegions.length) {
      toast(`${nameOf(key)} staat weer op ‘nog nooit’`, {
        label: 'Ongedaan maken',
        fn: () => { data.countries[key] = 1; data.regions[key] = prevRegions; commit(); },
      });
    }
  }
  function toggleRegion(key, rid) {
    const arr = (data.regions[key] || []).slice();
    const i = arr.indexOf(rid);
    if (i >= 0) arr.splice(i, 1); else arr.push(rid);
    if (arr.length) data.regions[key] = arr; else delete data.regions[key];
    if (arr.length && !(data.countries[key] > 0)) data.countries[key] = 1;
    commit();
  }
  function setWish(key, on) {
    const has = data.wishlist.includes(key);
    if (on === has) return;
    data.wishlist = on ? [...data.wishlist, key] : data.wishlist.filter((k) => k !== key);
    commit();
  }
  function toggleWish(key) {
    const on = !data.wishlist.includes(key);
    setWish(key, on);
    if (on) toast(`${nameOf(key)} staat op je verlanglijst`);
    else toast(`${nameOf(key)} is van je verlanglijst gehaald`, { label: 'Ongedaan maken', fn: () => setWish(key, true) });
  }

  /* ------------------------------------------------------------------
     10. Zijbalken
     ------------------------------------------------------------------ */
  function renderCountrySide(st) {
    const pct = st.total ? (st.visited / st.total) * 100 : 0;
    const r = rating(pct);
    let h = `
      <div class="hero">
        <div class="hero-top"><div class="hero-num">${st.visited}</div><div class="hero-of">van de ${st.total}<br>landen</div></div>
        <span class="bar lg"><span style="width:${pct}%"></span></span>
        <div class="hero-grid">
          <div><b>${nf1.format(pct)}%</b><span>van alle landen</span></div>
          <div><b>${S.area.size ? nf1.format(st.areaPct) + '%' : '…'}</b><span>van het landoppervlak</span></div>
        </div>
        <div class="rank">${stars(r.stars)}<span>${r.label}</span></div>
        ${st.terr.length ? `<p class="hero-note">Plus ${st.terr.length} ${st.terr.length === 1 ? 'gebied' : 'gebieden'} dat niet als land meetelt: ${esc(st.terr.slice(0, 4).map(nameOf).join(', '))}${st.terr.length > 4 ? ' en meer' : ''}.</p>` : ''}
        ${st.visited ? '' : '<p class="hero-note">Klik op een land op de kaart, of zoek het op, om te beginnen.</p>'}
      </div>
      <h3 class="side-h">Per continent</h3>
      <div class="conts">`;
    for (const [c, name] of Object.entries(CONTINENTS)) {
      const p = st.per[c];
      const pc = p.total ? (p.visited / p.total) * 100 : 0;
      const rr = rating(pc);
      h += `
        <div class="cont">
          <div class="cont-top"><span class="cont-name">${name}</span><span class="cont-num">${p.visited}<small> / ${p.total}</small></span></div>
          <span class="bar"><span style="width:${pc}%"></span></span>
          <div class="cont-bottom">${stars(rr.stars)}<span>${rr.label}</span><span class="pct">${nf.format(Math.round(pc))}%</span></div>
        </div>`;
    }
    h += '</div><h3 class="side-h">Grote landen</h3>';
    const bigs = Object.keys(BIG_COUNTRIES).filter((k) => data.countries[k] > 0);
    if (!bigs.length) {
      h += '<p class="hint">De VS, Canada, Australië, Brazilië, China, India en Rusland kleur je per regio in. Zo kleurt één weekend New York niet de hele VS. Zolang je weinig regio’s aanduidt, is het land gearceerd.</p>';
    } else {
      h += bigs.map((k) => {
        const b = BIG_COUNTRIES[k], n = (data.regions[k] || []).length, p = (n / b.regions.length) * 100;
        return `<button type="button" class="big-row" data-open="${esc(k)}"><span class="big-name">${esc(nameOf(k))}</span><span class="big-num">${n} van ${b.regions.length} ${esc(b.unit)}</span><span class="bar"><span style="width:${p}%"></span></span></button>`;
      }).join('');
    }
    const top = Object.entries(data.countries)
      .filter(([k, v]) => v > 0 && INFO.has(k))
      .sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl'))
      .slice(0, 8);
    if (top.length) {
      h += `<h3 class="side-h">Vaakst bezocht</h3><div class="top-list">${top.map(([k, v]) =>
        `<button type="button" class="top-row" data-open="${esc(k)}"><span class="dot" style="background:${VISIT_COLORS[Math.min(v, 5)]}"></span>${esc(nameOf(k))}<b>${v}×</b></button>`).join('')}</div>`;
    }
    $('#side-countries').innerHTML = h;
  }

  function renderWishSide(st) {
    const keys = data.wishlist.filter((k) => INFO.has(k));
    const newSov = keys.filter((k) => INFO.get(k).sovereign && !(data.countries[k] > 0)).length;
    const after = st.visited + newSov;
    let h = `
      <div class="hero">
        <div class="hero-top"><div class="hero-num">${keys.length}</div><div class="hero-of">${keys.length === 1 ? 'bestemming' : 'bestemmingen'}<br>op je lijst</div></div>
        ${keys.length
          ? `<p class="hero-note">Als je ze allemaal bezoekt, ga je van <b>${st.visited}</b> naar <b>${after}</b> landen: ${nf.format(Math.round((after / st.total) * 100))}% van de wereld.</p>`
          : '<p class="hero-note">Klik op de kaart op een land om het toe te voegen, of zoek het op. Nog eens klikken haalt het weer weg.</p>'}
      </div>`;
    const groups = {};
    for (const k of keys) { const c = INFO.get(k).continent || 'OT'; (groups[c] = groups[c] || []).push(k); }
    for (const c of [...Object.keys(CONTINENTS), 'OT']) {
      const g = groups[c];
      if (!g) continue;
      g.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'nl'));
      h += `<h3 class="side-h">${c === 'OT' ? 'Andere gebieden' : CONTINENTS[c]}<span>${g.length}</span></h3><div class="wish-list">`
        + g.map((k) => `
          <div class="wish-row" data-focus="${esc(k)}">
            <span class="wish-star" aria-hidden="true">★</span>
            <span class="wish-name">${esc(nameOf(k))}</span>
            ${data.countries[k] > 0 ? '<span class="tag">al geweest</span>' : ''}
            <button type="button" class="icon-btn sm" data-unwish="${esc(k)}" aria-label="${esc(nameOf(k))} verwijderen">✕</button>
          </div>`).join('')
        + '</div>';
    }
    $('#side-wish').innerHTML = h;
  }

  function renderFlightSide() {
    const st = flightStats();
    const kpi = (num, lbl) => `<div class="kpi"><div class="kpi-num">${num}</div><div class="kpi-lbl">${lbl}</div></div>`;
    $('#flight-stats').innerHTML = `<div class="kpis">
      ${kpi(nf.format(st.n), st.n === 1 ? 'vlucht' : 'vluchten')}
      ${kpi(nf.format(Math.round(st.km)), 'kilometer')}
      ${kpi(nf.format(st.airports.size), 'luchthavens')}
      ${kpi(nf.format(Math.round(st.hours)) + ' u', 'in de lucht (schatting)')}
    </div>`;
    $('#flights-banner').innerHTML = st.n
      ? `<b>${nf.format(st.n)}</b> ${st.n === 1 ? 'vlucht' : 'vluchten'}, <b>${nf.format(Math.round(st.km))}</b> km`
      : 'Nog geen vluchten';

    let ex = '';
    if (st.n) {
      const earth = st.km / 40075, moon = st.km / 384400;
      const topAp = [...st.airports].sort((a, b) => b[1] - a[1])[0];
      ex += `<div class="facts">
        <div class="fact"><span class="fact-big">${nf1.format(earth)}×</span><span>rond de aarde</span></div>
        <div class="fact"><span class="fact-big">${moon >= 1 ? nf1.format(moon) + '×' : nf.format(Math.round(moon * 100)) + '%'}</span><span>${moon >= 1 ? 'tot aan de maan' : 'van de weg naar de maan'}</span></div>
        <div class="fact wide"><span>Langste vlucht</span><b>${esc(st.longest.from)} naar ${esc(st.longest.to)}, ${nf.format(st.longest.km)} km</b></div>
        <div class="fact wide"><span>Vaakst gebruikte luchthaven</span><b>${esc(topAp[0])} ${esc(cityOf(airportOf(topAp[0])))}, ${topAp[1]}×</b></div>
        <div class="fact wide"><span>Verschillende routes</span><b>${st.routes}</b></div>
      </div>`;
      const years = [...st.years].sort((a, b) => b[0].localeCompare(a[0]));
      const max = Math.max(...years.map((y) => y[1]));
      ex += `<h3 class="side-h">Per jaar</h3><div class="years">${years.map(([y, n]) =>
        `<div class="yr"><span>${y === '?' ? 'onbekend' : y}</span><span class="yr-bar"><i style="width:${(n / max) * 100}%"></i></span><span class="yr-n">${n}</span></div>`).join('')}</div>`;
      ex += '<p class="footnote">Vliegtijd geschat als afstand ÷ 800 km/u plus een half uur per vlucht. Afstanden zijn in vogelvlucht (grootcirkel).</p>';
    }
    $('#flight-extra').innerHTML = ex;
    renderFlightList();
  }

  function renderFlightList() {
    const el = $('#flight-list');
    const fl = [...data.flights].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!fl.length) {
      el.innerHTML = '<p class="empty">Voeg hierboven je eerste vlucht toe. Typ een stad of luchthavencode en kies uit de lijst.</p>';
      return;
    }
    let h = '<h3 class="side-h">Alle vluchten</h3>', year = null;
    for (const f of fl) {
      const y = (f.date || '').slice(0, 4) || 'Zonder datum';
      if (y !== year) { h += `<div class="list-year">${y}</div>`; year = y; }
      const a = airportOf(f.from), b = airportOf(f.to);
      h += `
        <div class="flight-row${S.highlight === routeKey(f) ? ' hl' : ''}" data-id="${esc(f.id)}">
          <div class="fr-route">${esc(f.from)} <span aria-hidden="true">→</span> ${esc(f.to)}</div>
          <div class="fr-meta">${esc(cityOf(a))} naar ${esc(cityOf(b))}${f.airline ? `, ${esc(f.airline)}` : ''}</div>
          <div class="fr-km">${nf.format(f.km || 0)} km<span>${fmtDate(f.date)}</span></div>
          <button type="button" class="icon-btn sm" data-del="${esc(f.id)}" aria-label="Vlucht verwijderen">✕</button>
        </div>`;
    }
    el.innerHTML = h;
  }

  function renderAll() {
    const cs = countryStats();
    restyleViews();
    renderCountrySide(cs);
    renderWishSide(cs);
    renderFlightSide();
    $('#cnt-countries').textContent = cs.visited;
    $('#cnt-flights').textContent = data.flights.length;
    $('#cnt-wish').textContent = data.wishlist.length;
    const title = data.title || 'Mijn reisatlas';
    $('#brand-title').textContent = title;
    document.title = title;
    updateSheet();
  }

  /* ------------------------------------------------------------------
     11. Vluchten
     ------------------------------------------------------------------ */
  function initFallbackAirports() {
    for (const [code, city, name, country, lat, lon] of FALLBACK_AIRPORTS) {
      S.airports.set(code, { code, city, alias: city, name, country, lat, lon, pop: 1 });
    }
    buildAirportIndex();
  }
  function buildAirportIndex() {
    S.airportList = [...S.airports.values()].map((a) => ({
      ...a,
      _city: norm(a.alias || a.city),
      _s: norm(`${a.code} ${a.city} ${a.alias || ''} ${a.name} ${a.country}`),
    }));
  }
  async function loadAirports() {
    for (const url of AIRPORT_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const rows = d3.csvParseRows(await res.text());
        let added = 0;
        for (const r of rows) {
          const code = r[4];
          if (!code || code.length !== 3 || code === '\\N') continue;
          if (r[12] && r[12] !== 'airport') continue;
          const lat = +r[6], lon = +r[7];
          if (!isFinite(lat) || !isFinite(lon)) continue;
          const prev = S.airports.get(code);
          S.airports.set(code, {
            code, name: r[1], city: r[2], country: prev ? prev.country : r[3], lat, lon,
            alias: prev ? prev.alias : '', pop: prev ? 1 : 0,
          });
          added++;
        }
        if (added > 1000) { buildAirportIndex(); return; }
      } catch (e) { console.warn('Luchthavens laden mislukt via', url, e); }
    }
  }
  function searchAirports(q) {
    const nq = norm(q);
    if (!nq) return [];
    const up = q.trim().toUpperCase();
    const out = [];
    for (const a of S.airportList) {
      let score;
      if (a.code === up) score = 0;
      else if (!a._s.includes(nq)) continue;
      else score = (a._city.startsWith(nq) ? 1 : 3) - (a.pop ? 0.6 : 0);
      out.push([score, a]);
    }
    out.sort((x, y) => x[0] - y[0]);
    return out.slice(0, 8).map(([, a]) => ({
      value: a.code,
      html: `<b>${esc(a.code)}</b> ${esc(a.alias || a.city)} <span class="ac-dim">${esc(a.name)}</span>`,
      sub: a.country,
    }));
  }
  function resolveCode(input, strict) {
    if (input.dataset.code) return input.dataset.code;
    const m = input.value.trim().toUpperCase().match(/^([A-Z]{3})\b/);
    if (m && (S.airports.has(m[1]) || data.airports[m[1]])) return m[1];
    if (strict) return null;
    const res = searchAirports(input.value);
    return res.length === 1 ? res[0].value : null;
  }
  function addFlight(from, to, date, airline) {
    for (const c of [from, to]) {
      if (!data.airports[c]) {
        const a = airportOf(c);
        data.airports[c] = {
          city: a.alias || a.city || '', name: a.name || '', country: a.country || '',
          lat: +(+a.lat).toFixed(4), lon: +(+a.lon).toFixed(4),
        };
      }
    }
    const f = {
      id: uid(), date: date || '', from, to, airline: airline || '',
      km: Math.round(haversine(airportOf(from), airportOf(to))),
    };
    data.flights.push(f);
    return f;
  }
  function deleteFlight(id) {
    const i = data.flights.findIndex((f) => f.id === id);
    if (i < 0) return;
    const [f] = data.flights.splice(i, 1);
    if (S.highlight === routeKey(f) && !data.flights.some((x) => routeKey(x) === routeKey(f))) S.highlight = null;
    commit();
    toast(`Vlucht ${f.from} naar ${f.to} verwijderd`, {
      label: 'Ongedaan maken',
      fn: () => { data.flights.splice(i, 0, f); commit(); },
    });
  }
  function focusRoute(f) {
    const v = S.views.flights, a = airportOf(f.from), b = airportOf(f.to);
    if (v && a && b) v.focus({ type: 'LineString', coordinates: [[+a.lon, +a.lat], [+b.lon, +b.lat]] });
  }

  function drawFlights(view) {
    if (!view.path) return;
    if (!view.gGlow) {
      view.gGlow = view.gOverlay.append('g');
      view.gLines = view.gOverlay.append('g');
    }
    const routes = new Map();
    for (const f of data.flights) {
      const k = routeKey(f);
      let r = routes.get(k);
      if (!r) {
        const [c1, c2] = [f.from, f.to].sort();
        const a = airportOf(c1), b = airportOf(c2);
        if (!a || !b) continue;
        r = { key: k, c1, c2, a, b, n: 0, km: f.km || 0 };
        routes.set(k, r);
      }
      r.n++;
    }
    const list = [...routes.values()].sort((x, y) => x.n - y.n);
    const line = (r) => view.path({ type: 'LineString', coordinates: [[+r.a.lon, +r.a.lat], [+r.b.lon, +r.b.lat]] });

    view.gGlow.selectAll('path').data(list, (d) => d.key).join('path')
      .attr('class', (d) => 'arc-glow' + (S.highlight === d.key ? ' hl' : ''))
      .attr('d', line)
      .style('stroke-width', (d) => `${8 + 1.5 * Math.min(d.n, 8)}px`)
      .on('pointermove', (e, d) => showTip(e, `<b>${esc(d.c1)} ⇄ ${esc(d.c2)}</b><br>${esc(cityOf(d.a))} en ${esc(cityOf(d.b))}<br>${nf.format(d.km)} km, ${d.n}× gevlogen`))
      .on('pointerleave', hideTip)
      .on('click', (e, d) => { hideTip(); S.highlight = S.highlight === d.key ? null : d.key; renderAll(); });

    view.gLines.selectAll('path').data(list, (d) => d.key).join('path')
      .attr('class', (d) => 'arc' + (S.highlight === d.key ? ' hl' : ''))
      .attr('d', line)
      .style('stroke-width', (d) => `${1.2 + 0.5 * Math.min(d.n, 8)}px`);

    const counts = new Map();
    for (const f of data.flights) for (const c of [f.from, f.to]) counts.set(c, (counts.get(c) || 0) + 1);
    const aps = [];
    for (const [code, n] of counts) { const ap = airportOf(code); if (ap) aps.push({ code, n, ap }); }
    const center = view.mode === 'globe' ? [-view.rotation[0], -view.rotation[1]] : null;
    const k = view.mode === 'flat' ? view.k : 1;
    const labels = aps.length <= 16 || (view.mode === 'flat' ? k >= 2.5 : view.globeK >= 1.8);

    const g = view.gPoints.selectAll('g.ap').data(aps, (d) => d.code).join((enter) => {
      const e = enter.append('g').attr('class', 'ap');
      e.append('circle');
      e.append('text').attr('dy', '-0.8em');
      return e;
    });
    g.attr('transform', (d) => { const p = view.projection([+d.ap.lon, +d.ap.lat]); return p ? `translate(${p[0]},${p[1]})` : null; })
      .style('display', (d) => (center && d3.geoDistance([+d.ap.lon, +d.ap.lat], center) > Math.PI / 2 - 0.03 ? 'none' : null))
      .on('pointermove', (e, d) => showTip(e, `<b>${esc(d.code)}</b> ${esc(cityOf(d.ap))}<br><span class="muted">${esc(d.ap.name || '')}</span><br>${d.n}× vertrek of aankomst`))
      .on('pointerleave', hideTip);
    g.select('circle').attr('r', (d) => (2.4 + Math.min(Math.sqrt(d.n), 3.5)) / k);
    g.select('text')
      .text((d) => d.code)
      .style('font-size', `${11 / k}px`)
      .style('stroke-width', `${3 / k}px`)
      .style('display', labels ? null : 'none');
  }

  function setupFlightForm() {
    const from = $('#f-from'), to = $('#f-to');
    for (const input of [from, to]) {
      attachAutocomplete(input, {
        source: searchAirports,
        onPick: (it, inp) => {
          inp.value = `${it.value}, ${cityOf(airportOf(it.value))}`;
          inp.dataset.code = it.value;
          updatePreview();
          (inp === from ? to : $('#f-date')).focus();
        },
      });
      input.addEventListener('input', () => { delete input.dataset.code; updatePreview(); });
    }
    $('#f-swap').addEventListener('click', () => {
      [from.value, to.value] = [to.value, from.value];
      const a = from.dataset.code, b = to.dataset.code;
      if (b) from.dataset.code = b; else delete from.dataset.code;
      if (a) to.dataset.code = a; else delete to.dataset.code;
      updatePreview();
    });
    $('#f-return').addEventListener('change', (e) => { $('#f-return-row').hidden = !e.target.checked; });
    $('#flight-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const a = resolveCode(from), b = resolveCode(to);
      if (!a || !b) { toast('Kies vertrek en bestemming uit de lijst die verschijnt als je typt.'); return; }
      if (a === b) { toast('Vertrek en bestemming zijn dezelfde luchthaven.'); return; }
      const airline = $('#f-airline').value.trim();
      const f = addFlight(a, b, $('#f-date').value, airline);
      const withReturn = $('#f-return').checked;
      if (withReturn) addFlight(b, a, $('#f-rdate').value, airline);
      S.highlight = routeKey(f);
      commit();
      toast(withReturn
        ? `Heen en terug toegevoegd: ${a} en ${b}, ${nf.format(f.km * 2)} km`
        : `Vlucht toegevoegd: ${a} naar ${b}, ${nf.format(f.km)} km`);
      from.value = ''; to.value = '';
      delete from.dataset.code; delete to.dataset.code;
      $('#f-airline').value = ''; $('#f-rdate').value = '';
      $('#f-return').checked = false; $('#f-return-row').hidden = true;
      updatePreview();
      from.focus();
    });
  }
  function updatePreview() {
    const a = resolveCode($('#f-from'), true), b = resolveCode($('#f-to'), true);
    const el = $('#f-preview');
    if (!a || !b || a === b || !airportOf(a) || !airportOf(b)) { el.innerHTML = ''; return; }
    const km = Math.round(haversine(airportOf(a), airportOf(b)));
    el.innerHTML = `<b>${nf.format(km)} km</b> <span>ongeveer ${fmtDuration(km / 800 + 0.5)} vliegen</span>`;
  }

  /* ------------------------------------------------------------------
     12. Zoekveld met suggesties
     ------------------------------------------------------------------ */
  function searchCountries(q) {
    const nq = norm(q);
    if (!nq) return [];
    const out = [];
    for (const inf of INFO.values()) {
      const name = nameOf(inf.key), n = norm(name);
      let score;
      if (n.startsWith(nq)) score = 0;
      else if (n.includes(nq)) score = 1;
      else if (norm(inf.en).includes(nq)) score = 2;
      else continue;
      if (!inf.sovereign) score += 0.5;
      out.push({ score, name, inf });
    }
    out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'nl'));
    return out.slice(0, 8).map(({ name, inf }) => ({
      value: inf.key, html: esc(name), sub: inf.sovereign ? CONTINENTS[inf.continent] : 'gebied',
    }));
  }
  function attachAutocomplete(input, { source, onPick }) {
    const list = document.createElement('ul');
    list.className = 'ac-list';
    list.hidden = true;
    list.setAttribute('role', 'listbox');
    input.parentElement.appendChild(list);
    let items = [], idx = -1;
    const close = () => { list.hidden = true; idx = -1; };
    const mark = () => {
      Array.from(list.children).forEach((li, i) => li.classList.toggle('active', i === idx));
      if (list.children[idx]) list.children[idx].scrollIntoView({ block: 'nearest' });
    };
    const open = () => {
      items = source(input.value);
      idx = items.length ? 0 : -1;
      list.innerHTML = items.map((it, i) =>
        `<li role="option" data-i="${i}"><span class="ac-main">${it.html}</span>${it.sub ? `<span class="ac-sub">${esc(it.sub)}</span>` : ''}</li>`).join('');
      list.hidden = !items.length;
      mark();
    };
    const pick = (i) => { const it = items[i]; close(); if (it) onPick(it, input); };
    input.addEventListener('input', open);
    input.addEventListener('focus', () => { if (input.value && !input.dataset.code) open(); });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (idx >= 0) { e.preventDefault(); pick(idx); } }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (li) { e.preventDefault(); pick(+li.dataset.i); }
    });
  }

  /* ------------------------------------------------------------------
     13. Tooltip en meldingen
     ------------------------------------------------------------------ */
  const tipEl = $('#tooltip');
  function showTip(e, html) {
    if (!html || e.pointerType === 'touch') { hideTip(); return; }
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    const pad = 14, r = tipEl.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    tipEl.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }
  function hideTip() { tipEl.hidden = true; }

  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.fn(); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6500 : 3500);
  }

  /* ------------------------------------------------------------------
     14. Knoppen en events
     ------------------------------------------------------------------ */
  function bindUI() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    window.addEventListener('hashchange', () => showTab(HASH_TAB[location.hash] || 'countries'));
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-settings').addEventListener('click', () => { $('#set-title').value = data.title || ''; $('#settings').showModal(); });

    // Kaartknoppen: in-/uitzoomen, kaart of wereldbol
    $$('.map-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const v = S.views[card.dataset.tab];
        if (!v) return;
        const z = e.target.closest('[data-zoom]');
        const m = e.target.closest('[data-mode]');
        if (z) {
          if (z.dataset.zoom === 'in') v.zoomBy(1.6);
          else if (z.dataset.zoom === 'out') v.zoomBy(1 / 1.6);
          else v.reset();
        }
        if (m) {
          v.setMode(m.dataset.mode);
          $$('[data-mode]', card).forEach((b) => {
            b.classList.toggle('active', b === m);
            b.setAttribute('aria-pressed', b === m ? 'true' : 'false');
          });
        }
      });
    });

    // Landenpaneel
    const sh = $('#sheet');
    sh.addEventListener('click', (e) => {
      const key = S.selectedKey;
      if (!key) return;
      const t = e.target.closest('[data-act],[data-rid]');
      if (!t) return;
      if (t.dataset.act === 'close') closeSheet();
      else if (t.dataset.act === 'inc') setVisits(key, (data.countries[key] || 0) + 1);
      else if (t.dataset.act === 'dec') setVisits(key, (data.countries[key] || 0) - 1);
      else if (t.dataset.rid) toggleRegion(key, t.dataset.rid);
    });
    sh.addEventListener('change', (e) => {
      if (e.target.id === 'sh-wish' && S.selectedKey) setWish(S.selectedKey, e.target.checked);
    });
    const saveNote = debounce((key, val) => {
      if (val.trim()) data.notes[key] = val; else delete data.notes[key];
      touch();
    }, 400);
    sh.addEventListener('input', (e) => {
      if (e.target.id === 'sh-note' && S.selectedKey) saveNote(S.selectedKey, e.target.value);
      if (e.target.id === 'sh-rfilter') {
        const q = norm(e.target.value);
        $$('#sh-chips .chip').forEach((c) => { c.hidden = !!q && !norm(c.textContent).includes(q); });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.selectedKey && !$('#settings').open) closeSheet();
    });

    // Zoeken
    attachAutocomplete($('#search-countries'), {
      source: searchCountries,
      onPick: (it, input) => { input.value = ''; input.blur(); openCountry(it.value); focusKey('countries', it.value); },
    });
    attachAutocomplete($('#search-wish'), {
      source: searchCountries,
      onPick: (it, input) => {
        input.value = '';
        input.blur();
        if (data.wishlist.includes(it.value)) toast(`${nameOf(it.value)} staat al op je verlanglijst`);
        else toggleWish(it.value);
        focusKey('wish', it.value);
      },
    });

    // Zijbalken
    $('#side-countries').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) { openCountry(b.dataset.open); focusKey('countries', b.dataset.open); }
    });
    $('#side-wish').addEventListener('click', (e) => {
      const x = e.target.closest('[data-unwish]');
      if (x) {
        const k = x.dataset.unwish;
        setWish(k, false);
        toast(`${nameOf(k)} is van je verlanglijst gehaald`, { label: 'Ongedaan maken', fn: () => setWish(k, true) });
        return;
      }
      const r = e.target.closest('[data-focus]');
      if (r) focusKey('wish', r.dataset.focus);
    });
    $('#flight-list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { deleteFlight(del.dataset.del); return; }
      const row = e.target.closest('.flight-row');
      if (!row) return;
      const f = data.flights.find((x) => x.id === row.dataset.id);
      if (!f) return;
      const k = routeKey(f);
      S.highlight = S.highlight === k ? null : k;
      renderAll();
      if (S.highlight) focusRoute(f);
    });
    setupFlightForm();

    // Instellingen
    const dlg = $('#settings');
    $('#set-title').addEventListener('input', debounce(() => {
      data.title = $('#set-title').value.trim() || 'Mijn reisatlas';
      commit();
    }, 350));
    $('#set-export').addEventListener('click', exportData);
    $('#set-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importFile(file);
      e.target.value = '';
      dlg.close();
    });
    $('#set-reload').addEventListener('click', reloadFromSite);
    $('#set-reset').addEventListener('click', () => {
      if (!confirm('Alles wissen in deze browser? Je reizen.json op GitHub blijft gewoon bestaan.')) return;
      data = emptyData();
      commit();
      dlg.close();
      toast('Alles is gewist in deze browser.');
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  /* ------------------------------------------------------------------
     15. Opstarten
     ------------------------------------------------------------------ */
  async function init() {
    buildInfo();
    initFallbackAirports();
    bindUI();
    showTab(HASH_TAB[location.hash] || 'countries');
    await loadData();
    renderAll();
    loadAirports();
    try {
      const [world, us] = await Promise.all([d3.json(WORLD_URL), d3.json(US_URL).catch(() => null)]);
      prepareWorld(world);
      if (us) prepareUS(us);
      S.ready = true;
      ensureView(S.tab);
      renderAll();
    } catch (err) {
      console.error(err);
      $$('.map-status').forEach((el) => {
        el.textContent = 'De wereldkaart kon niet laden. Controleer je internetverbinding en herlaad de pagina.';
      });
    }
  }

  init();
})();
