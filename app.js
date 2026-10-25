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
      settings: {},    // bv. { bigCountriesByRegion: false }
    };
  }
  function normalize(d) {
    const e = emptyData();
    if (!d || typeof d !== 'object') return e;
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    return {
      ...e, ...d,
      countries: obj(d.countries), regions: obj(d.regions), notes: obj(d.notes), airports: obj(d.airports),
      settings: obj(d.settings),
      wishlist: Array.isArray(d.wishlist) ? d.wishlist : [],
      flights: Array.isArray(d.flights) ? d.flights : [],
    };
  }

  let data = emptyData();

  // Grote landen per regio inkleuren (standaard aan). Uit = het hele land kleurt in.
  // De keuze zit in reizen.json, dus wie je site bekijkt, ziet hetzelfde.
  const byRegion = () => !(data.settings && data.settings.bigCountriesByRegion === false);
  function setByRegion(on) {
    if (on === byRegion()) return;
    data.settings = { ...data.settings, bigCountriesByRegion: !!on };
    commit();
    toast(on ? 'Grote landen kleuren weer alleen in waar je was.' : 'Grote landen kleuren nu volledig in.');
  }

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
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), DATA_FILE);
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
    if (!big || !byRegion()) return 1;
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
      if (this.regions) {
        this.gRegions.style('display', cfg.showRegions && !cfg.showRegions() ? 'none' : null);
        this.regions.style('fill', (d) => cfg.regionFill(d) || null);
      }
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
    if (BIG_COUNTRIES[key] && byRegion()) {
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
      showRegions: () => byRegion(),
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
      h += `
        <section class="field">
          <div class="field-row"><div class="field-label">Welke ${esc(big.unit)} heb je gezien?</div><span class="pill" id="sh-rcount"></span></div>
          <p class="hint" id="sh-bighint"></p>
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
      $('#sh-bighint').textContent = byRegion()
        ? `Groot land: hoe meer ${big.unit} je aanduidt, hoe voller het op de kaart kleurt.${key === '840' ? ' Je kunt ook rechtstreeks op de kaart op een staat klikken.' : ''}`
        : `Het hele land kleurt in, want ‘alleen bezochte regio’s inkleuren’ staat uit. Je kunt hier toch bijhouden welke ${big.unit} je zag.`;
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
    h += `</div><h3 class="side-h">Grote landen</h3>
      <label class="switch side-switch"><input type="checkbox" data-setting="byRegion"${byRegion() ? ' checked' : ''}><span class="track"></span><span>Alleen bezochte regio’s inkleuren</span></label>
      <p class="hint">${byRegion()
        ? 'De VS, Canada, Australië, Brazilië, China, India en Rusland kleur je per regio in. Zo kleurt één weekend New York niet de hele VS. Zolang je weinig regio’s aanduidt, is het land gearceerd.'
        : 'Staat uit: de VS, Canada, Australië, Brazilië, China, India en Rusland kleuren volledig in zodra je er geweest bent, net als elk ander land.'}</p>`;
    const bigs = Object.keys(BIG_COUNTRIES).filter((k) => data.countries[k] > 0);
    if (bigs.length) {
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
    $('#legend-hatch').hidden = !byRegion();
    updateSheet();
    if ($('#stats').open) renderStats();
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
    $('#btn-settings').addEventListener('click', () => {
      $('#set-title').value = data.title || '';
      $('#set-byregion').checked = byRegion();
      $('#settings').showModal();
    });
    $('#btn-stats').addEventListener('click', openStats);
    $('#btn-share').addEventListener('click', openShare);

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
      if (e.key === 'Escape' && S.selectedKey && !$('dialog[open]')) closeSheet();
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
    $('#side-countries').addEventListener('change', (e) => {
      if (e.target.dataset.setting === 'byRegion') setByRegion(e.target.checked);
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
    $('#set-byregion').addEventListener('change', (e) => setByRegion(e.target.checked));
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
    // Klik naast een venster sluit het
    for (const d of $$('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

    // Statistieken en delen
    $('#stats').addEventListener('click', (e) => {
      if (e.target.closest('[data-open-share]')) { $('#stats').close(); openShare(); }
    });
    bindShare();
  }

  /* ------------------------------------------------------------------
     15. Leuke statistieken
     ------------------------------------------------------------------ */
  const EARTH_KM = 40075;          // omtrek van de aarde langs de evenaar
  const MOON_KM = 384400;          // gemiddelde afstand tot de maan
  const SUN_KM = 149600000;        // gemiddelde afstand tot de zon
  const LIGHT_KMS = 299792.458;    // lichtsnelheid, km per seconde
  const ISS_KMH = 27600;           // snelheid van het ruimtestation ISS
  const KM2_PER_SR = 6371 * 6371;  // d3.geoArea (steradialen) naar km²
  const BELGIUM_KM2 = 30689;
  const CO2_KG_PER_KM = 0.15;      // ruwe schatting per passagier in economy, inclusief effecten op grote hoogte
  const TREE_KG_PER_YEAR = 22;     // wat een volwassen boom ongeveer per jaar opneemt
  const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const nf2s = new Intl.NumberFormat('nl-BE', { maximumSignificantDigits: 2 });

  function pickBy(arr, fn, dir) {
    let best, bv;
    for (const x of arr) { const v = fn(x); if (best === undefined || (dir > 0 ? v > bv : v < bv)) { best = x; bv = v; } }
    return best;
  }
  const maxBy = (a, f) => pickBy(a, f, 1);
  const minBy = (a, f) => pickBy(a, f, -1);
  const topOf = (map) => [...map].sort((a, b) => b[1] - a[1])[0] || null;
  const times = (x) => (x >= 10 ? nf.format(Math.round(x)) : nf1.format(x)) + '×';
  const pctTxt = (x) => (x >= 10 ? nf.format(Math.round(x)) : x >= 1 ? nf1.format(x) : nf2s.format(x)) + '%';
  function km2Txt(x) {
    if (x >= 1e6) return `${nf1.format(x / 1e6)} miljoen km²`;
    return `${nf.format(Math.round(x / (x >= 1e4 ? 1000 : 1)) * (x >= 1e4 ? 1000 : 1))} km²`;
  }
  function humanTime(h) {
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
    if (h < 48) return `${nf1.format(h)} uur`;
    const d = h / 24;
    if (d < 60) return `${nf.format(Math.round(d))} dagen`;
    if (d < 365) return `${nf1.format(d / 30.44)} maanden`;
    return `${nf1.format(d / 365.25)} jaar`;
  }
  function humanSec(s) {
    if (s < 60) return `${s < 10 ? nf1.format(s) : nf.format(Math.round(s))} sec`;
    return `${nf1.format(s / 60)} min`;
  }
  const latTxt = (v) => `${nf.format(Math.round(Math.abs(v)))}° ${v >= 0 ? 'NB' : 'ZB'}`;
  const lonTxt = (v) => `${nf.format(Math.round(Math.abs(v)))}° ${v >= 0 ? 'OL' : 'WL'}`;

  const centroidCache = new Map();
  function centroidOf(key) {
    if (centroidCache.has(key)) return centroidCache.get(key);
    const s = mainShape(key);
    const c = s ? d3.geoCentroid(s) : null;
    if (S.byKey.size) centroidCache.set(key, c);
    return c;
  }
  function firstLetter(key) {
    const c = norm(nameOf(key)).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : null;
  }

  function funStats() {
    const cs = countryStats();
    const fs = flightStats();
    const visited = Object.keys(data.countries)
      .filter((k) => data.countries[k] > 0 && INFO.has(k))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'nl'));
    const sov = visited.filter((k) => INFO.get(k).sovereign);
    const st = { cs, fs, visited, sov };

    st.continents = Object.keys(CONTINENTS).filter((c) => cs.per[c].visited > 0);
    st.totalVisits = visited.reduce((s, k) => s + data.countries[k], 0);
    st.fav = maxBy(visited, (k) => data.countries[k]);

    // Landen-alfabet: met welke beginletters heb je al een land?
    const all = [...INFO.values()].filter((i) => i.sovereign).map((i) => firstLetter(i.key)).filter(Boolean);
    st.possibleLetters = [...new Set(all)].sort();
    st.letters = new Set(sov.map(firstLetter).filter(Boolean));

    // Verlanglijst
    const newSov = data.wishlist.filter((k) => INFO.has(k) && INFO.get(k).sovereign && !(data.countries[k] > 0)).length;
    st.afterWish = cs.visited + newSov;

    // Oppervlakte en uitersten (pas als de wereldkaart geladen is)
    const cents = S.area.size ? visited.map((k) => [k, centroidOf(k)]).filter((x) => x[1]) : [];
    if (S.area.size) {
      let km2 = 0;
      const sized = [];
      for (const k of visited) {
        const a = S.area.get(k);
        if (!a) continue;
        km2 += a * KM2_PER_SR * areaFactor(k);
        if (INFO.get(k).sovereign) sized.push([k, a * KM2_PER_SR]);
      }
      st.km2 = km2;
      if (sized.length >= 2) { st.biggest = maxBy(sized, (x) => x[1]); st.smallest = minBy(sized, (x) => x[1]); }
      if (cents.length >= 2) {
        st.ext = {
          n: maxBy(cents, (x) => x[1][1]), s: minBy(cents, (x) => x[1][1]),
          e: maxBy(cents, (x) => x[1][0]), w: minBy(cents, (x) => x[1][0]),
          eq: minBy(cents, (x) => Math.abs(x[1][1])),
        };
      }
    }

    if (!fs.n) return st;

    // Vluchten
    const fl = data.flights;
    st.avg = fs.km / fs.n;
    st.shortest = minBy(fl.filter((f) => f.km > 0), (f) => f.km);
    const routes = new Map();
    for (const f of fl) routes.set(routeKey(f), (routes.get(routeKey(f)) || 0) + 1);
    st.topRoute = topOf(routes);
    const airlines = new Map(), airlineName = new Map();
    for (const f of fl) {
      const a = (f.airline || '').trim();
      if (!a) continue;
      const k = norm(a);
      airlines.set(k, (airlines.get(k) || 0) + 1);
      if (!airlineName.has(k)) airlineName.set(k, a);
    }
    const ta = topOf(airlines);
    st.topAirline = ta ? [airlineName.get(ta[0]), ta[1]] : null;
    st.airlineCount = airlines.size;
    st.home = topOf(fs.airports);
    st.topYear = topOf(new Map([...fs.years].filter(([y]) => y !== '?')));
    const months = new Map();
    for (const f of fl) { const m = +(f.date || '').slice(5, 7); if (m) months.set(m, (months.get(m) || 0) + 1); }
    st.topMonth = topOf(months);
    const dates = fl.map((f) => f.date).filter(Boolean).sort();
    st.first = dates[0] || null;

    const aps = [...fs.airports.keys()].map((c) => [c, airportOf(c)]).filter((x) => x[1]);
    st.apCountries = new Set(aps.map((x) => x[1].country).filter(Boolean)).size;
    if (aps.length >= 2) {
      st.apExt = {
        n: maxBy(aps, (x) => +x[1].lat), s: minBy(aps, (x) => +x[1].lat),
        e: maxBy(aps, (x) => +x[1].lon), w: minBy(aps, (x) => +x[1].lon),
      };
    }
    let eq = 0, dl = 0;
    for (const f of fl) {
      const a = airportOf(f.from), b = airportOf(f.to);
      if (!a || !b) continue;
      if ((+a.lat >= 0) !== (+b.lat >= 0)) eq++;
      if (Math.abs(+a.lon - +b.lon) > 180) dl++;
    }
    st.equator = eq;
    st.dateline = dl;
    st.co2 = fs.km * CO2_KG_PER_KM;

    const homeAp = st.home && airportOf(st.home[0]);
    if (homeAp && cents.length) {
      const far = maxBy(cents, (x) => haversine(homeAp, { lat: x[1][1], lon: x[1][0] }));
      st.farthest = { key: far[0], km: haversine(homeAp, { lat: far[1][1], lon: far[1][0] }), from: homeAp };
    }
    return st;
  }

  function renderStats() {
    const st = funStats();
    const { cs, fs } = st;
    const tile = (big, lbl, sub, cls) => `<div class="ft${cls ? ' ' + cls : ''}"><div class="ft-big">${big}</div><div class="ft-lbl">${lbl}</div>${sub ? `<div class="ft-sub">${sub}</div>` : ''}</div>`;
    const grid = (tiles) => `<div class="ft-grid">${tiles.filter(Boolean).join('')}</div>`;
    const sect = (title, inner) => `<section class="fs-sect"><h3>${title}</h3>${inner}</section>`;
    const row = (lbl, val) => (val ? `<div class="fs-row"><span>${lbl}</span><b>${val}</b></div>` : '');
    const apTxt = (code) => `${esc(code)} ${esc(cityOf(airportOf(code)))}`;
    let h = '';

    if (!st.visited.length && !fs.n) {
      $('#stats-body').innerHTML = '<p class="empty">Nog niets om te tellen. Duid landen aan op de kaart en voeg je vluchten toe, dan verschijnen hier je weetjes.</p>';
      return;
    }

    // Jouw wereld
    if (st.visited.length) {
      const pct = cs.total ? (cs.visited / cs.total) * 100 : 0;
      const missing = Object.keys(CONTINENTS).filter((c) => !st.continents.includes(c)).map((c) => CONTINENTS[c]);
      const favN = st.fav ? data.countries[st.fav] : 0;
      h += sect('Jouw wereld', grid([
        tile(nf.format(cs.visited), cs.visited === 1 ? 'land bezocht' : 'landen bezocht', `${pctTxt(pct)} van alle ${cs.total} landen`),
        tile(`${st.continents.length}<small> / 6</small>`, 'continenten', missing.length ? `Nog te gaan: ${esc(missing.join(', '))}` : 'Allemaal! Antarctica misschien?'),
        st.km2 != null ? tile(pctTxt(cs.areaPct), 'van het landoppervlak', `${km2Txt(st.km2)}, dat is ${times(st.km2 / BELGIUM_KM2)} België`) : '',
        tile(nf.format(st.totalVisits), 'bezoeken in totaal', favN > 1 ? `Vaakst: ${esc(nameOf(st.fav))} (${favN}×)` : ''),
      ]) + (st.afterWish > cs.visited
        ? `<p class="hint fs-note">Werk je je verlanglijst af, dan kom je op <b>${nf.format(st.afterWish)}</b> landen: ${pctTxt((st.afterWish / cs.total) * 100)} van de wereld.</p>`
        : ''));

      if (st.ext || st.biggest) {
        const e = st.ext;
        const far = st.farthest;
        h += sect('Uitersten op je kaart', grid([
          e && tile(esc(nameOf(e.n[0])), 'noordelijkst', latTxt(e.n[1][1]), 'name'),
          e && tile(esc(nameOf(e.s[0])), 'zuidelijkst', latTxt(e.s[1][1]), 'name'),
          e && tile(esc(nameOf(e.w[0])), 'westelijkst', lonTxt(e.w[1][0]), 'name'),
          e && tile(esc(nameOf(e.e[0])), 'oostelijkst', lonTxt(e.e[1][0]), 'name'),
          e && tile(esc(nameOf(e.eq[0])), 'dichtst bij de evenaar', latTxt(e.eq[1][1]), 'name'),
          st.biggest && tile(esc(nameOf(st.biggest[0])), 'grootste land', km2Txt(st.biggest[1]), 'name'),
          st.smallest && tile(esc(nameOf(st.smallest[0])), 'kleinste land', km2Txt(st.smallest[1]), 'name'),
          far && tile(esc(nameOf(far.key)), `verst van ${esc(cityOf(far.from))}`, `± ${nf.format(Math.round(far.km / 100) * 100)} km in vogelvlucht`, 'name'),
        ]));
      }

      const nPos = st.possibleLetters.length;
      const nHave = st.possibleLetters.filter((l) => st.letters.has(l)).length;
      h += sect('Landen-alfabet', `
        <p class="hint">Met hoeveel beginletters heb je al een land? ${nHave} van de ${nPos} letters waarmee een land begint.</p>
        <div class="abc">${st.possibleLetters.map((l) => `<span class="${st.letters.has(l) ? 'on' : ''}">${l}</span>`).join('')}</div>`);
    }

    // Vluchten
    if (fs.n) {
      const moon = fs.km / MOON_KM;
      h += sect('Zo ver vloog je', grid([
        tile(nf.format(Math.round(fs.km)), 'kilometer gevlogen', `${nf.format(fs.n)} ${fs.n === 1 ? 'vlucht' : 'vluchten'}, gemiddeld ${nf.format(Math.round(st.avg))} km`),
        tile(times(fs.km / EARTH_KM), 'rond de aarde', 'langs de evenaar, 40.075 km'),
        tile(moon >= 1 ? times(moon) : pctTxt(moon * 100), moon >= 1 ? 'tot aan de maan' : 'van de weg naar de maan',
          moon >= 1 ? `${times(moon / 2)} heen en terug` : `nog ${nf.format(Math.round(MOON_KM - fs.km))} km te gaan`),
        tile(pctTxt((fs.km / SUN_KM) * 100), 'van de weg naar de zon', '149,6 miljoen km ver'),
      ]));
      h += sect('Hoe lang zou dat duren?', grid([
        tile(humanTime(fs.km / 5), 'te voet', 'non-stop wandelen aan 5 km/u'),
        tile(humanTime(fs.km / 20), 'met de fiets', 'zonder pauze, aan 20 km/u'),
        tile(humanTime(fs.km / ISS_KMH), 'voor het ISS', 'het ruimtestation haalt 27.600 km/u'),
        tile(humanSec(fs.km / LIGHT_KMS), 'voor het licht', '300.000 km per seconde'),
      ]));
      h += sect('Tijd in de lucht', grid([
        tile(humanTime(fs.hours), 'in de lucht', 'schatting'),
        tile(nf.format(Math.round(fs.hours / 2)), 'films van 2 uur', 'had je kunnen kijken'),
        tile(nf.format(Math.round(fs.hours / 8)), 'nachten slaap', 'van 8 uur'),
        tile(nf1.format(fs.hours / 38), 'werkweken', 'van 38 uur'),
      ]));

      const L = fs.longest, Sh = st.shortest;
      h += sect('Vliegrecords', `<div class="fs-rows">
        ${row('Langste vlucht', L && `${esc(cityOf(airportOf(L.from)))} → ${esc(cityOf(airportOf(L.to)))}, ${nf.format(L.km)} km`)}
        ${row('Kortste vlucht', Sh && fs.n > 1 && `${esc(cityOf(airportOf(Sh.from)))} → ${esc(cityOf(airportOf(Sh.to)))}, ${nf.format(Sh.km)} km`)}
        ${row('Favoriete route', st.topRoute && st.topRoute[1] > 1 && `${esc(st.topRoute[0].replace('-', ' ⇄ '))}, ${st.topRoute[1]}×`)}
        ${row('Thuisluchthaven', st.home && `${apTxt(st.home[0])}, ${st.home[1]}× vertrek of aankomst`)}
        ${row('Favoriete maatschappij', st.topAirline && `${esc(st.topAirline[0])}, ${st.topAirline[1]}×${st.airlineCount > 1 ? `, van de ${st.airlineCount} waarmee je vloog` : ''}`)}
        ${row('Drukste jaar', st.topYear && `${st.topYear[0]}, ${st.topYear[1]} ${st.topYear[1] === 1 ? 'vlucht' : 'vluchten'}`)}
        ${row('Favoriete maand', st.topMonth && `${MONTHS[st.topMonth[0] - 1]}, ${st.topMonth[1]}×`)}
        ${row('Eerste vlucht in je lijst', st.first && fmtDate(st.first))}
      </div>`);

      const a = st.apExt;
      h += sect('Kriskras over de wereld', grid([
        tile(nf.format(st.equator), 'keer over de evenaar', st.equator ? 'van noord naar zuid of terug' : 'nog nooit naar het zuiden'),
        tile(nf.format(st.dateline), 'keer over de datumgrens', 'over de Grote Oceaan'),
        tile(nf.format(fs.airports.size), fs.airports.size === 1 ? 'luchthaven' : 'luchthavens', st.apCountries ? `in ${st.apCountries} ${st.apCountries === 1 ? 'land' : 'landen'}` : ''),
        tile(nf.format(fs.routes), fs.routes === 1 ? 'route' : 'verschillende routes'),
      ]) + (a ? `<div class="fs-rows">
        ${row('Noordelijkste luchthaven', `${apTxt(a.n[0])}, ${latTxt(+a.n[1].lat)}`)}
        ${row('Zuidelijkste luchthaven', `${apTxt(a.s[0])}, ${latTxt(+a.s[1].lat)}`)}
        ${row('Westelijkste luchthaven', `${apTxt(a.w[0])}, ${lonTxt(+a.w[1].lon)}`)}
        ${row('Oostelijkste luchthaven', `${apTxt(a.e[0])}, ${lonTxt(+a.e[1].lon)}`)}
      </div>` : ''));

      h += sect('Voetafdruk', grid([
        tile(st.co2 >= 1000 ? `${nf1.format(st.co2 / 1000)} ton` : `${nf.format(Math.round(st.co2))} kg`, 'CO₂ (ruwe schatting)', 'ongeveer 0,15 kg per km per passagier'),
        tile(nf.format(Math.max(1, Math.round(st.co2 / TREE_KG_PER_YEAR))), 'bomen', 'nemen dat samen in één jaar op'),
      ]));
    } else {
      h += sect('Vluchten', '<p class="hint">Voeg vluchten toe op het tabblad Vluchten. Dan zie je hier hoe vaak je rond de aarde vloog, hoe lang je dat te voet zou doen, je vliegrecords en meer.</p>');
    }

    h += '<p class="footnote">Afstanden zijn in vogelvlucht. Tijden, oppervlaktes en CO₂ zijn schattingen.</p>';
    $('#stats-body').innerHTML = h;
  }
  function openStats() {
    renderStats();
    $('#stats').showModal();
    $('#stats-body').scrollTop = 0;
  }

  /* ------------------------------------------------------------------
     16. Delen: een leesbaar overzicht als afbeelding of tekst
     ------------------------------------------------------------------ */
  const flagOf = (a2) => (a2 && /^[A-Z]{2}$/.test(a2) && a2 !== 'XK'
    ? String.fromCodePoint(...[...a2].map((c) => 0x1F1A5 + c.charCodeAt(0))) + ' ' : '');
  const siteUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/index\.html$/, '') : '');

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* oude browser */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function visitedByContinent() {
    const groups = {};
    for (const [k, v] of Object.entries(data.countries)) {
      if (!(v > 0) || !INFO.has(k)) continue;
      const c = INFO.get(k).sovereign ? INFO.get(k).continent : 'OT';
      (groups[c] = groups[c] || []).push(k);
    }
    for (const g of Object.values(groups)) g.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'nl'));
    return groups;
  }
  const moonTxt = (km) => (km >= MOON_KM ? `${times(km / MOON_KM)} tot aan de maan` : `${pctTxt((km / MOON_KM) * 100)} van de weg naar de maan`);

  function shareText(o) {
    const cs = countryStats(), fs = flightStats();
    const pct = cs.total ? (cs.visited / cs.total) * 100 : 0;
    const conts = Object.keys(CONTINENTS).filter((c) => cs.per[c].visited > 0).length;
    const L = [`🌍 ${data.title || 'Mijn reisatlas'}`, ''];
    L.push(`${cs.visited} van de ${cs.total} landen bezocht (${pctTxt(pct)}), op ${conts} van de 6 continenten.`);
    if (o.list) {
      const groups = visitedByContinent();
      for (const [c, name] of Object.entries(CONTINENTS)) {
        const g = (groups[c] || []);
        if (!g.length) continue;
        L.push('', `${name} (${g.length})`);
        L.push(g.map((k) => `${flagOf(INFO.get(k).a2)}${nameOf(k)}${data.countries[k] > 1 ? ` ${data.countries[k]}×` : ''}`).join(', '));
      }
      if (groups.OT) L.push('', `Ook nog: ${groups.OT.map((k) => nameOf(k)).join(', ')}`);
    }
    if (fs.n) {
      L.push('', `✈️ ${nf.format(fs.n)} ${fs.n === 1 ? 'vlucht' : 'vluchten'}, ${nf.format(Math.round(fs.km))} km`);
      L.push(`Dat is ${times(fs.km / EARTH_KM)} rond de aarde, of ${moonTxt(fs.km)}.`);
      const f = fs.longest;
      if (f) L.push(`Langste vlucht: ${cityOf(airportOf(f.from)) || f.from} → ${cityOf(airportOf(f.to)) || f.to} (${nf.format(f.km)} km)`);
    }
    if (o.wish && data.wishlist.length) {
      const w = data.wishlist.filter((k) => INFO.has(k)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'nl'));
      L.push('', `⭐ Op mijn verlanglijst: ${w.map((k) => `${flagOf(INFO.get(k).a2)}${nameOf(k)}`).join(', ')}`);
    }
    const url = siteUrl();
    if (url) L.push('', `Bekijk mijn kaart: ${url}`);
    return L.join('\n');
  }

  function loadCardFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const fonts = ['600 80px "Barlow Condensed"', '500 30px "Barlow Condensed"', '400 26px Barlow', '500 26px Barlow', '600 26px Barlow'];
    return Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => {});
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function drawShareCard(o) {
    await loadCardFonts();
    const W = 1080, P = 72, IW = W - 2 * P;
    const INK = '#13213a', INK2 = '#46546a', MUTED = '#7a8596', LINE = '#d5dce2';
    const cond = (w, s) => `${w} ${s}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const sans = (w, s) => `${w} ${s}px Barlow, system-ui, sans-serif`;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 6000;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#e9edf0';
    ctx.fillRect(0, 0, W, cv.height);
    ctx.textBaseline = 'alphabetic';
    const cs = countryStats(), fs = flightStats();
    let y = P;

    const text = (s, x, yy, font, color, align) => {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(s, x, yy); ctx.textAlign = 'left';
    };
    const heading = (s) => {
      y += 30;
      text(s, P, y + 34, cond(600, 40), INK);
      y += 52;
      ctx.fillStyle = LINE; ctx.fillRect(P, y, IW, 2);
      y += 22;
    };
    const wrap = (items, font, color, lineH) => {
      ctx.font = font;
      ctx.fillStyle = color;
      let line = '';
      const lines = [];
      items.forEach((it, i) => {
        const piece = it + (i < items.length - 1 ? ',' : '');
        const test = line ? line + ' ' + piece : piece;
        if (line && ctx.measureText(test).width > IW) { lines.push(line); line = piece; } else line = test;
      });
      if (line) lines.push(line);
      for (const l of lines) { ctx.fillText(l, P, y + lineH * 0.75); y += lineH; }
    };
    const tiles = (items) => {
      const cols = 4, cw = IW / cols, rh = 118;
      items.forEach(([big, lbl], i) => {
        const x = P + (i % cols) * cw, yy = y + Math.floor(i / cols) * rh;
        let size = 70;
        ctx.font = cond(600, size);
        while (size > 36 && ctx.measureText(big).width > cw - 18) { size -= 4; ctx.font = cond(600, size); }
        text(big, x, yy + 62, cond(600, size), INK);
        let ls = 22;
        ctx.font = sans(500, ls);
        while (ls > 15 && ctx.measureText(lbl).width > cw - 14) { ls -= 1; ctx.font = sans(500, ls); }
        text(lbl, x, yy + 96, sans(500, ls), INK2);
      });
      y += Math.ceil(items.length / cols) * rh;
    };

    // Kop
    let title = data.title || 'Mijn reisatlas';
    let tsize = 88;
    ctx.font = cond(600, tsize);
    while (tsize > 48 && ctx.measureText(title).width > IW) { tsize -= 4; ctx.font = cond(600, tsize); }
    text(title, P, y + tsize * 0.8, cond(600, tsize), INK);
    y += tsize * 0.8 + 18;
    const when = data.updatedAt ? new Date(data.updatedAt) : new Date();
    text(`Mijn reizen tot ${when.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`, P, y + 26, sans(400, 26), MUTED);
    y += 58;

    // Kaart
    const pts = [];
    for (let lon = -179.5; lon <= 179.5; lon += 4.5) pts.push([lon, 0], [lon, 83], [lon, -56]);
    const mapH = Math.round(IW * 0.47);
    const pad = 18;
    const proj = d3.geoNaturalEarth1().fitExtent([[P + pad, y + pad], [P + IW - pad, y + mapH - pad]], { type: 'MultiPoint', coordinates: pts });
    const path = d3.geoPath(proj, ctx);
    roundRect(ctx, P, y, IW, mapH, 22);
    ctx.fillStyle = '#d3e1e8';
    ctx.fill();
    ctx.save();
    roundRect(ctx, P, y, IW, mapH, 22);
    ctx.clip();
    ctx.beginPath(); path(GRATICULE); ctx.strokeStyle = 'rgba(19,33,58,.07)'; ctx.lineWidth = 1; ctx.stroke();

    const patterns = {};
    const hatch = (lvl, kind) => {
      const id = lvl + kind;
      if (patterns[id]) return patterns[id];
      const s = kind === 'l' ? 10 : 8;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.fillStyle = LAND; g.fillRect(0, 0, s, s);
      g.strokeStyle = VISIT_COLORS[lvl]; g.lineWidth = kind === 'l' ? 2.8 : 4.4;
      g.beginPath();
      for (const off of [-s, 0, s]) { g.moveTo(off, s); g.lineTo(off + s, 0); }
      g.stroke();
      return (patterns[id] = ctx.createPattern(c, 'repeat'));
    };
    const fillOf = (key) => {
      const v = data.countries[key] || 0;
      if (!v) return LAND;
      const lvl = Math.min(v, 5);
      if (BIG_COUNTRIES[key] && byRegion()) {
        const c = coverage(key);
        if (c < 1 / 3) return hatch(lvl, 'l');
        if (c < 2 / 3) return hatch(lvl, 'd');
      }
      return VISIT_COLORS[lvl];
    };
    ctx.lineJoin = 'round';
    for (const f of S.features) {
      ctx.beginPath(); path(f);
      ctx.fillStyle = fillOf(f.key); ctx.fill();
      ctx.strokeStyle = '#eef1f3'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    if (byRegion() && data.countries['840'] > 0 && S.usStates) {
      const sel = new Set(data.regions['840'] || []);
      ctx.fillStyle = VISIT_COLORS[Math.min(data.countries['840'], 5)];
      for (const s of S.usStates) {
        if (!sel.has(s.rid)) continue;
        ctx.beginPath(); path(s); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.6; ctx.stroke();
      }
    }
    const showFlights = o.flights && fs.n > 0;
    if (showFlights) {
      const routes = new Map();
      for (const f of data.flights) {
        const k = routeKey(f);
        const r = routes.get(k) || { a: airportOf(f.from), b: airportOf(f.to), n: 0 };
        r.n++;
        routes.set(k, r);
      }
      ctx.lineCap = 'round';
      for (const r of routes.values()) {
        if (!r.a || !r.b) continue;
        ctx.beginPath();
        path({ type: 'LineString', coordinates: [[+r.a.lon, +r.a.lat], [+r.b.lon, +r.b.lat]] });
        ctx.strokeStyle = 'rgba(19,33,58,.62)';
        ctx.lineWidth = 1.6 + 0.45 * Math.min(r.n, 6);
        ctx.stroke();
      }
      for (const code of fs.airports.keys()) {
        const ap = airportOf(code);
        const p = ap && proj([+ap.lon, +ap.lat]);
        if (!p) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    ctx.restore();
    y += mapH + 18;

    // Legende
    let lx = P;
    const swatch = (fill, label) => {
      ctx.fillStyle = fill;
      roundRect(ctx, lx, y + 4, 20, 20, 5); ctx.fill();
      text(label, lx + 28, y + 21, sans(400, 20), INK2);
      ctx.font = sans(400, 20);
      lx += 28 + ctx.measureText(label).width + 24;
    };
    swatch(VISIT_COLORS[1], '1×');
    swatch(VISIT_COLORS[2], '2×');
    swatch(VISIT_COLORS[3], '3×');
    swatch(VISIT_COLORS[4], '4×');
    swatch(VISIT_COLORS[5], '5× of meer');
    if (byRegion() && Object.keys(BIG_COUNTRIES).some((k) => data.countries[k] > 0 && coverage(k) < 2 / 3)) {
      swatch(hatch(1, 'd'), 'groot land, deels gezien');
    }
    if (showFlights) {
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx, y + 14); ctx.lineTo(lx + 26, y + 14); ctx.stroke();
      text('vluchtroute', lx + 36, y + 21, sans(400, 20), INK2);
    }
    y += 36;

    // Cijfers
    const pct = cs.total ? (cs.visited / cs.total) * 100 : 0;
    const conts = Object.keys(CONTINENTS).filter((c) => cs.per[c].visited > 0).length;
    heading('Landen');
    tiles([
      [nf.format(cs.visited), cs.visited === 1 ? 'land bezocht' : 'landen bezocht'],
      [pctTxt(pct), 'van alle landen'],
      [`${conts}/6`, 'continenten'],
      [pctTxt(cs.areaPct), 'van het landoppervlak'],
    ]);

    // Per continent
    y += 8;
    const colW = (IW - 48) / 2;
    Object.entries(CONTINENTS).forEach(([c, name], i) => {
      const p = cs.per[c];
      const x = P + (i % 2) * (colW + 48);
      const yy = y + Math.floor(i / 2) * 64;
      text(name, x, yy + 24, sans(600, 24), INK);
      text(`${p.visited} / ${p.total}`, x + colW, yy + 24, cond(600, 28), INK2, 'right');
      roundRect(ctx, x, yy + 36, colW, 10, 5); ctx.fillStyle = '#d9dfe4'; ctx.fill();
      const bw = p.total ? (p.visited / p.total) * colW : 0;
      if (bw > 0) { roundRect(ctx, x, yy + 36, Math.max(bw, 10), 10, 5); ctx.fillStyle = VISIT_COLORS[1]; ctx.fill(); }
    });
    y += Math.ceil(Object.keys(CONTINENTS).length / 2) * 64;

    if (fs.n) {
      heading('Vluchten');
      const moon = fs.km / MOON_KM;
      tiles([
        [nf.format(fs.n), fs.n === 1 ? 'vlucht' : 'vluchten'],
        [nf.format(Math.round(fs.km)), 'kilometer'],
        [times(fs.km / EARTH_KM), 'rond de aarde'],
        [moon >= 1 ? times(moon) : pctTxt(moon * 100), moon >= 1 ? 'tot aan de maan' : 'van de weg naar de maan'],
      ]);
      const f = fs.longest;
      if (f) {
        text(`Langste vlucht: ${cityOf(airportOf(f.from)) || f.from} → ${cityOf(airportOf(f.to)) || f.to}, ${nf.format(f.km)} km`, P, y + 24, sans(500, 24), INK2);
        y += 40;
      }
    }

    if (o.list && cs.visited + cs.terr.length > 0) {
      heading('Waar ik al was');
      const groups = visitedByContinent();
      for (const [c, name] of [...Object.entries(CONTINENTS), ['OT', 'Andere gebieden']]) {
        const g = groups[c];
        if (!g) continue;
        text(`${name}  ·  ${g.length}`, P, y + 26, cond(600, 30), INK);
        y += 38;
        wrap(g.map((k) => nameOf(k) + (data.countries[k] > 1 ? ` (${data.countries[k]}×)` : '')), sans(400, 24), INK2, 34);
        y += 14;
      }
    }

    if (o.wish && data.wishlist.length) {
      heading('Op mijn verlanglijst');
      const w = data.wishlist.filter((k) => INFO.has(k)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'nl'));
      wrap(w.map(nameOf), sans(400, 24), INK2, 34);
    }

    // Voet
    y += 30;
    ctx.fillStyle = LINE; ctx.fillRect(P, y, IW, 2);
    y += 18;
    const host = siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
    text(host ? `Bekijk de hele kaart op ${host}` : 'Gemaakt met mijn reisatlas', P, y + 24, sans(500, 22), MUTED);
    y += 24 + P - 20;

    const out = document.createElement('canvas');
    out.width = W;
    out.height = Math.ceil(y);
    out.getContext('2d').drawImage(cv, 0, 0);
    return out;
  }

  let shareBlob = null, shareRun = 0;
  const shareOpts = () => ({
    flights: $('#shr-opt-flights').checked, list: $('#shr-opt-list').checked, wish: $('#shr-opt-wish').checked,
  });
  const shareFile = () => new File([shareBlob], 'mijn-reizen.png', { type: 'image/png' });
  async function refreshShare() {
    const run = ++shareRun;
    const o = shareOpts();
    $('#shr-text').value = shareText(o);
    $('.share-preview').classList.add('busy');
    const cv = await drawShareCard(o);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (run !== shareRun) return;
    shareBlob = blob;
    const img = $('#shr-img');
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    $('.share-preview').classList.remove('busy');
    let canFiles = false;
    try { canFiles = !!(navigator.canShare && navigator.canShare({ files: [shareFile()] })); } catch (e) { canFiles = false; }
    $('#shr-native').hidden = !canFiles;
  }
  function openShare() {
    if (!S.ready) { toast('De wereldkaart laadt nog even. Probeer het zo opnieuw.'); return; }
    const noFl = !data.flights.length, noWish = !data.wishlist.length;
    $('#shr-opt-flights').disabled = noFl;
    $('#shr-opt-flights').closest('label').classList.toggle('off', noFl);
    $('#shr-opt-wish').disabled = noWish;
    $('#shr-opt-wish').closest('label').classList.toggle('off', noWish);
    $('#shr-copyimg').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    $('#shr-copylink').hidden = !siteUrl();
    $('#share').showModal();
    refreshShare();
  }
  function bindShare() {
    for (const id of ['#shr-opt-flights', '#shr-opt-list', '#shr-opt-wish']) $(id).addEventListener('change', refreshShare);
    $('#shr-download').addEventListener('click', () => {
      if (!shareBlob) return;
      downloadBlob(shareBlob, 'mijn-reizen.png');
      toast('De afbeelding is gedownload.');
    });
    $('#shr-native').addEventListener('click', async () => {
      if (!shareBlob) return;
      try { await navigator.share({ files: [shareFile()], title: data.title || 'Mijn reisatlas' }); } catch (e) {
        if (e.name !== 'AbortError') toast('Delen lukte niet. Download de afbeelding en stuur ze zelf door.');
      }
    });
    $('#shr-copyimg').addEventListener('click', async () => {
      if (!shareBlob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': shareBlob })]);
        toast('Afbeelding gekopieerd. Plak ze in een chat of mail.');
      } catch (e) { toast('Kopiëren lukte niet in deze browser. Download de afbeelding.'); }
    });
    $('#shr-copytext').addEventListener('click', async () => {
      toast(await copyText($('#shr-text').value) ? 'Tekst gekopieerd. Plak hem in een chat of mail.' : 'Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.');
    });
    $('#shr-copylink').addEventListener('click', async () => {
      toast(await copyText(siteUrl()) ? 'Link naar je kaart gekopieerd.' : 'Kopiëren lukte niet.');
    });
  }

  /* ------------------------------------------------------------------
     17. Opstarten
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
