/* Shopwise – boodschappenplanner en winkelvergelijker. */
(function () {
  'use strict';

  var cloud = window.ShopwiseCloud || null;
  var PRODUCTS = window.SHOPWISE_PRODUCTS || [];
  var STORES = window.SHOPWISE_STORES || [];
  var CATEGORIES = window.SHOPWISE_CATEGORIES || [];
  var MAX_AANTAL = 30;
  var GAST_MAND = 'shopwise_mand_gast';
  var WINKEL_KEUZE = 'shopwise_winkel_keuze';
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var zoekveld = document.getElementById('zoekveld');
  var zoekformulier = document.getElementById('zoekformulier');

  var state = {
    query: '',
    categorie: 'alle',
    sortering: 'aanbevolen',
    winkel: readStore(WINKEL_KEUZE, 'lidl')
  };

  var gebruiker = null;
  var accountMand = {};
  var mandGeladen = true;
  var cloudOk = true;
  var authKlaar = !cloud;
  var opslagTimer = null;
  var syncTeller = 0;
  var productMap = {};
  var basisMap = {};
  var winkelMap = {};
  var categorieMap = {};

  PRODUCTS.forEach(function (p) { productMap[p.id] = p; if (!basisMap[p.basisId]) basisMap[p.basisId] = []; basisMap[p.basisId].push(p); });
  STORES.forEach(function (w) { winkelMap[w.id] = w; });
  CATEGORIES.forEach(function (c) { categorieMap[c.id] = c; });
  if (state.winkel !== 'alle' && !winkelMap[state.winkel]) state.winkel = 'lidl';

  function readStore(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* lokale opslag kan uitstaan */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normaliseer(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  var euroFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  function eur(cents) { return euroFormatter.format(cents / 100); }
  function toast(message, duration) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, duration || 2300);
  }
  var toastTimer = null;

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var parts = h.split('?');
    var params = {};
    if (parts[1]) parts[1].split('&').forEach(function (pair) {
      var p = pair.split('=');
      try { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* negeren */ }
    });
    return { pad: parts[0] || '/', params: params };
  }
  function pad() { return parseHash().pad; }
  function gaNaar(path) { if (location.hash === '#' + path) route(); else location.hash = '#' + path; }

  /* Winkelmand: iedere product-winkelcombinatie is een eigen regel. */
  function schoonMand(raw) {
    var clean = {};
    if (!raw || typeof raw !== 'object') return clean;
    Object.keys(raw).forEach(function (id) {
      var n = parseInt(typeof raw[id] === 'object' ? raw[id].aantal : raw[id], 10);
      if (productMap[id] && n > 0) clean[id] = Math.min(n, MAX_AANTAL);
      else if (basisMap[id] && n > 0) {
        var target = basisMap[id].filter(function (p) { return p.winkelId === state.winkel; })[0] || basisMap[id][0];
        if (target) clean[target.id] = Math.min(n, MAX_AANTAL);
      }
    });
    return clean;
  }
  function getMand() {
    return gebruiker ? schoonMand(accountMand) : schoonMand(readStore(GAST_MAND, {}));
  }
  function cacheSleutel(uid) { return 'shopwise_mand_' + uid; }
  function setMand(mand) {
    if (gebruiker) {
      accountMand = mand;
      writeStore(cacheSleutel(gebruiker.uid), mand);
      plannenOpslag();
    } else writeStore(GAST_MAND, mand);
  }
  function plannenOpslag() {
    if (!cloud || !gebruiker || !cloudOk) return;
    clearTimeout(opslagTimer);
    opslagTimer = setTimeout(function () {
      cloud.bewaarMand(gebruiker.uid, schoonMand(accountMand)).catch(function () {
        cloudOk = false;
        toast('Opslaan in je account lukte niet. Je mandje staat nog op dit apparaat.', 4000);
      });
    }, 500);
  }
  function wijzigAantal(id, delta) {
    if (!productMap[id]) return;
    if (gebruiker && !mandGeladen) { toast('Je mandje wordt nog geladen…'); return; }
    var mand = getMand();
    var next = (mand[id] || 0) + delta;
    if (next > MAX_AANTAL) { toast('Maximaal ' + MAX_AANTAL + ' per product'); next = MAX_AANTAL; }
    if (next <= 0) delete mand[id]; else mand[id] = next;
    setMand(mand);
  }
  function verwijderProduct(id) { var mand = getMand(); delete mand[id]; setMand(mand); }
  function regelsMand() {
    var mand = getMand();
    return Object.keys(mand).map(function (id) {
      var product = productMap[id];
      return { product: product, aantal: mand[id], subtotaal: product.prijs * mand[id] };
    });
  }
  function totaalAantal() { return regelsMand().reduce(function (sum, r) { return sum + r.aantal; }, 0); }
  function totaalBedrag(regels) { return regels.reduce(function (sum, r) { return sum + r.subtotaal; }, 0); }

  /* Firebase synchronisatie */
  function opAuth(user) {
    var currentSync = ++syncTeller;
    clearTimeout(opslagTimer);
    if (!user) {
      gebruiker = null; accountMand = {}; mandGeladen = true; cloudOk = true; authKlaar = true;
      route(); return;
    }
    gebruiker = user; accountMand = {}; mandGeladen = false; cloudOk = true;
    Promise.all([cloud.laadMand(user.uid)]).then(function (result) {
      if (currentSync !== syncTeller) return;
      var cloudMand = schoonMand(result[0] || {});
      var guest = schoonMand(readStore(GAST_MAND, {}));
      Object.keys(guest).forEach(function (id) { cloudMand[id] = Math.min((cloudMand[id] || 0) + guest[id], MAX_AANTAL); });
      accountMand = cloudMand;
      writeStore(cacheSleutel(user.uid), cloudMand);
      if (Object.keys(guest).length) {
        try { localStorage.removeItem(GAST_MAND); } catch (e) { /* negeren */ }
        cloud.bewaarMand(user.uid, cloudMand).catch(function () { cloudOk = false; });
      }
      mandGeladen = true; authKlaar = true;
      cloud.bewaarProfiel(user.uid, { naam: user.naam, email: user.email }).catch(function () {});
      route();
    }).catch(function () {
      if (currentSync !== syncTeller) return;
      cloudOk = false; accountMand = schoonMand(readStore(cacheSleutel(user.uid), {}));
      mandGeladen = true; authKlaar = true;
      toast('Accountgegevens niet bereikbaar. Je mandje wordt lokaal bewaard.', 4500);
      route();
    });
  }

  function logoHtml(store, extraClass) {
    return '<span class="store-logo-fallback" aria-hidden="true">' + (store.id === 'ah' ? '🔵' : store.id === 'lidl' ? '🔵' : store.id === 'jumbo' ? '🟡' : store.id === 'vomar' ? '🟠' : store.id === 'deka' ? '🟢' : '🏬') + '</span>' +
      '<img class="store-logo ' + (extraClass || '') + '" src="' + esc(store.logo) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.previousElementSibling.style.display=\'grid\'">';
  }
  function updateHeader() {
    var count = totaalAantal();
    var counter = document.getElementById('mandteller');
    if (counter) { counter.textContent = count; counter.classList.toggle('is-empty', count === 0); }
    var link = document.querySelector('.basket-link');
    if (link) link.setAttribute('aria-label', 'Winkelmand, ' + count + (count === 1 ? ' product' : ' producten'));
    var account = document.getElementById('nav-account');
    if (account) { account.textContent = gebruiker ? 'Mijn account' : 'Inloggen'; account.setAttribute('href', gebruiker ? '#/account' : '#/inloggen'); }
    document.querySelectorAll('.header-nav a').forEach(function (a) {
      var n = a.getAttribute('data-nav');
      var active = (n === '/' && pad() === '/') || (n === '/winkelmand' && pad() === '/winkelmand') || (n === 'account' && ['/inloggen', '/registreren', '/account'].indexOf(pad()) !== -1);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function route() {
    if (!authKlaar) { app.innerHTML = '<div class="empty"><span class="big">🛒</span><p class="muted">Shopwise wordt geladen…</p></div>'; return; }
    var r = parseHash();
    if (r.pad === '/account' && !gebruiker) { gaNaar('/inloggen'); return; }
    if ((r.pad === '/inloggen' || r.pad === '/registreren') && gebruiker) { gaNaar('/account'); return; }
    switch (r.pad) {
      case '/': renderCatalogus(); document.title = 'Shopwise – Vergelijk je boodschappen'; break;
      case '/winkelmand': renderMandPagina(); document.title = 'Mijn winkelmand – Shopwise'; break;
      case '/inloggen': renderInloggen(); document.title = 'Inloggen – Shopwise'; break;
      case '/registreren': renderRegistreren(); document.title = 'Account aanmaken – Shopwise'; break;
      case '/account': renderAccount(); document.title = 'Mijn account – Shopwise'; break;
      default: app.innerHTML = '<div class="empty"><h1>Pagina niet gevonden</h1><a class="btn btn-primary" href="#/">Naar Shopwise</a></div>';
    }
    if (zoekveld && r.pad === '/' && zoekveld.value !== state.query) zoekveld.value = state.query;
    updateHeader();
    if (r.pad === '/') setTimeout(function () { renderGrid(); }, 0);
  }

  function huidigeWinkel() { return winkelMap[state.winkel] || null; }
  function goedkoopstePerBasis(lijst) {
    var byId = {};
    lijst.forEach(function (p) {
      if (!byId[p.basisId] || p.prijs < byId[p.basisId].prijs) byId[p.basisId] = p;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }
  function gefilterdeProducten() {
    var q = normaliseer(state.query);
    var list = PRODUCTS.filter(function (p) {
      if (state.winkel !== 'alle' && p.winkelId !== state.winkel) return false;
      if (state.categorie !== 'alle' && p.categorie !== state.categorie) return false;
      var category = categorieMap[p.categorie] ? categorieMap[p.categorie].naam : '';
      return !q || normaliseer(p.naam + ' ' + category + ' ' + p.omschrijving + ' ' + winkelMap[p.winkelId].naam).indexOf(q) !== -1;
    });
    if (state.winkel === 'alle') list = goedkoopstePerBasis(list);
    if (state.sortering === 'prijs-oplopend') list.sort(function (a, b) { return a.prijs - b.prijs; });
    else if (state.sortering === 'prijs-aflopend') list.sort(function (a, b) { return b.prijs - a.prijs; });
    else if (state.sortering === 'naam') list.sort(function (a, b) { return a.naam.localeCompare(b.naam, 'nl'); });
    return list;
  }
  function productKaart(p, mand) {
    var store = winkelMap[p.winkelId];
    var count = mand[p.id] || 0;
    var action = count ? stepperHtml(p, count) : '<button class="btn btn-primary btn-block" type="button" data-action="add" data-id="' + esc(p.id) + '">Toevoegen</button>';
    var priceText = state.winkel === 'alle' ? 'Laagste voorbeeldprijs bij ' + esc(store.naam) : 'Voorbeeldprijs bij ' + esc(store.naam);
    return '<article class="card product-card">' +
      '<div class="card-img cat-' + esc(p.categorie) + '"><span>' + p.emoji + '</span></div>' +
      '<div class="card-body"><p class="cat">' + esc(categorieMap[p.categorie] ? categorieMap[p.categorie].naam : '') + '</p>' +
      '<h3>' + esc(p.naam) + '</h3><p class="unit">' + esc(p.eenheid) + '</p>' +
      '<p class="price">' + eur(p.prijs) + '</p>' +
      '<div class="product-store">' + logoHtml(store, 'tiny') + '<span>' + priceText + '</span></div>' +
      '<div class="card-actions">' + action + '</div></div></article>';
  }
  function stepperHtml(product, count) {
    return '<div class="stepper" role="group" aria-label="Aantal ' + esc(product.naam) + '">' +
      '<button type="button" data-action="dec" data-id="' + esc(product.id) + '" aria-label="Minder">−</button>' +
      '<span aria-live="polite">' + count + '</span>' +
      '<button type="button" data-action="inc" data-id="' + esc(product.id) + '" aria-label="Meer">+</button></div>';
  }
  function renderStoreFilters() {
    return '<div class="store-picker" aria-label="Kies een winkel">' +
      '<button type="button" class="store-choice' + (state.winkel === 'alle' ? ' active' : '') + '" data-action="store" data-store="alle"><span class="store-choice-icon">🛍️</span><span>Alle winkels</span></button>' +
      STORES.map(function (w) {
        return '<button type="button" class="store-choice' + (state.winkel === w.id ? ' active' : '') + '" data-action="store" data-store="' + w.id + '">' +
          logoHtml(w) + '<span>' + esc(w.naam) + '</span></button>';
      }).join('') + '</div>';
  }
  function renderCatalogus() {
    var chips = '<button type="button" class="chip' + (state.categorie === 'alle' ? ' active' : '') + '" data-action="cat" data-cat="alle">Alles</button>' +
      CATEGORIES.map(function (c) { return '<button type="button" class="chip' + (state.categorie === c.id ? ' active' : '') + '" data-action="cat" data-cat="' + c.id + '">' + esc(c.naam) + '</button>'; }).join('');
    var options = [['aanbevolen', 'Aanbevolen'], ['prijs-oplopend', 'Prijs: laag naar hoog'], ['prijs-aflopend', 'Prijs: hoog naar laag'], ['naam', 'Naam: A tot Z']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.sortering === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    app.innerHTML = '<section class="hero"><p class="hero-kicker">SLIMMER BOODSCHAPPEN DOEN</p><h1>Vergelijk je boodschappen bij jouw winkels</h1>' +
      '<p>Kies je winkel, maak je boodschappenlijst en houd je uitgaven bij. Shopwise bezorgt niets en verkoopt zelf geen producten.</p></section>' +
      '<section class="stores-section"><div class="section-heading"><div><h2>Kies een winkel</h2><p class="muted">Begin met Lidl, Albert Heijn, Jumbo, Vomar of DekaMarkt.</p></div></div>' + renderStoreFilters() + '</section>' +
      '<div class="demo-price-note"><strong>Let op:</strong> dit zijn voorbeeldprijzen om de site te testen. Er zijn nog geen actuele prijzen of aanbiedingen van winkels gekoppeld.</div>' +
      '<div class="toolbar"><div class="chips" role="group" aria-label="Categorieën">' + chips + '</div>' +
      '<div class="sort"><label for="sortering">Sorteren</label><select id="sortering" data-sort>' + options + '</select></div></div>' +
      '<p id="resultaattekst" class="muted" aria-live="polite"></p><div id="productgrid" class="grid"></div>';
    renderGrid();
  }
  function renderGrid() {
    var grid = document.getElementById('productgrid');
    var text = document.getElementById('resultaattekst');
    if (!grid) return;
    var list = gefilterdeProducten();
    var mand = getMand();
    if (!list.length) {
      text.textContent = 'Geen producten gevonden.';
      grid.className = '';
      grid.innerHTML = '<div class="empty"><span class="big">🔎</span><h2>Niets gevonden</h2><p class="muted">Probeer een andere zoekterm of winkel.</p><button type="button" class="btn btn-secondary" data-action="reset-filters">Filters wissen</button></div>';
      return;
    }
    text.textContent = list.length + (list.length === 1 ? ' product gevonden' : ' producten gevonden');
    grid.className = 'grid';
    grid.innerHTML = list.map(function (p) { return productKaart(p, mand); }).join('');
  }

  function renderMandPagina() {
    var regels = regelsMand();
    if (!regels.length) {
      app.innerHTML = '<h1 class="page-title">Mijn boodschappenlijst</h1><div class="empty"><span class="big">🧺</span><h2>Je lijst is nog leeg</h2><p class="muted">Voeg producten toe vanuit een van de winkels.</p><a class="btn btn-primary" href="#/">Bekijk producten</a></div>';
      return;
    }
    var byStore = {};
    regels.forEach(function (r) { var id = r.product.winkelId; if (!byStore[id]) byStore[id] = []; byStore[id].push(r); });
    var sections = Object.keys(byStore).map(function (storeId) {
      var store = winkelMap[storeId];
      var items = byStore[storeId];
      var total = totaalBedrag(items);
      var htmlItems = items.map(function (r) {
        var p = r.product;
        return '<div class="line"><div class="line-img cat-' + esc(p.categorie) + '">' + p.emoji + '</div><div class="line-info"><h3>' + esc(p.naam) + '</h3>' +
          '<p class="unit">' + esc(p.eenheid) + ' · ' + eur(p.prijs) + ' per stuk · ' + eur(r.subtotaal) + '</p><div class="line-controls">' +
          stepperHtml(p, r.aantal) + '<button type="button" class="btn-link" data-action="remove" data-id="' + esc(p.id) + '">Verwijderen</button></div></div></div>';
      }).join('');
      return '<section class="panel store-basket-panel"><div class="basket-store-heading">' + logoHtml(store) + '<div><h2>' + esc(store.naam) + '</h2><a href="' + esc(store.url) + '" target="_blank" rel="noopener noreferrer">Website van ' + esc(store.naam) + ' ↗</a></div>' +
        '<strong class="store-total">' + eur(total) + '</strong></div>' + htmlItems + '</section>';
    }).join('');
    var totalAll = totaalBedrag(regels);
    var countAll = regels.reduce(function (sum, r) { return sum + r.aantal; }, 0);
    var perBasis = {};
    regels.forEach(function (r) {
      var baseId = r.product.basisId;
      if (!perBasis[baseId]) perBasis[baseId] = { aantal: 0, naam: r.product.naam };
      perBasis[baseId].aantal += r.aantal;
    });
    var basisIds = Object.keys(perBasis);
    var supermarkten = STORES.filter(function (w) { return w.type === 'supermarkt'; });
    var vergelijkHtml = supermarkten.map(function (store) {
      var som = 0;
      var beschikbaar = 0;
      basisIds.forEach(function (baseId) {
        var p = (basisMap[baseId] || []).filter(function (item) { return item.winkelId === store.id; })[0];
        if (p) { som += p.prijs * perBasis[baseId].aantal; beschikbaar += 1; }
      });
      return { winkel: store, som: som, beschikbaar: beschikbaar };
    }).sort(function (a, b) { return a.som - b.som; });
    var vergelijking = '<section class="panel basket-compare"><div class="section-heading"><div><h2>Vergelijk je hele lijst</h2><p class="muted">Geschatte totaalprijs per supermarkt op basis van dezelfde producten.</p></div></div>' +
      '<div class="compare-store-grid">' + vergelijkHtml.map(function (v, index) {
        return '<div class="compare-store"><div class="compare-store-brand">' + logoHtml(v.winkel) + '<strong>' + esc(v.winkel.naam) + '</strong></div>' +
          '<strong class="compare-price">' + eur(v.som) + '</strong><span class="hint">' + v.beschikbaar + ' van ' + basisIds.length + ' producten' + (index === 0 ? ' · laagste voorbeeldtotaal' : '') + '</span></div>';
      }).join('') + '</div><p class="hint">Let op: dit zijn voorbeeldprijzen. Producten, verpakkingen en actuele winkelprijzen kunnen afwijken.</p></section>';
    var storageMessage = gebruiker && cloudOk ? 'Je boodschappenlijst wordt automatisch bewaard in je account.' : gebruiker ? 'Je account is niet bereikbaar. De lijst staat voorlopig op dit apparaat.' : 'Je lijst wordt op dit apparaat bewaard. <a href="#/inloggen?next=/winkelmand">Log in</a> om hem op te slaan in je account.';
    app.innerHTML = '<h1 class="page-title">Mijn boodschappenlijst</h1><div class="notice">' + storageMessage + '</div>' + vergelijking +
      '<div class="basket-layout"><section class="basket-lines">' + sections + '</section><aside class="panel basket-summary sticky"><h2>Overzicht</h2>' +
      '<div class="summary-row"><span>Producten</span><span>' + countAll + '</span></div><div class="summary-row"><span>Winkels in je lijst</span><span>' + Object.keys(byStore).length + '</span></div>' +
      '<div class="summary-row total"><span>Geselecteerde lijst</span><span>' + eur(totalAll) + '</span></div>' +
      '<p class="hint">Dit is de som van de winkels die je zelf hebt gekozen. Shopwise plaatst geen bestelling en verwerkt geen betaling.</p>' +
      '<a class="btn btn-primary btn-block" href="#/">Verder winkelen</a><button type="button" class="btn btn-secondary btn-block" data-action="clear">Lijst leegmaken</button></aside></div>';
  }

  function renderAccount() {
    app.innerHTML = '<div class="auth-wrap"><section class="panel"><h1>Mijn account</h1><p>Je bent ingelogd als <strong>' + esc(gebruiker.email) + '</strong>.</p>' +
      '<p class="muted">Je boodschappenlijst wordt automatisch aan je account gekoppeld.</p><p><a href="#/winkelmand" class="btn btn-primary btn-block">Mijn boodschappenlijst</a></p>' +
      '<button type="button" class="btn btn-secondary btn-block" data-action="logout">Uitloggen</button></section></div>';
  }
  function authFout(err) {
    var code = err && err.code ? err.code : '';
    var messages = {
      'auth/email-already-in-use': 'Er bestaat al een account met dit e-mailadres.',
      'auth/invalid-email': 'Vul een geldig e-mailadres in.',
      'auth/weak-password': 'Kies een sterker wachtwoord (minimaal 6 tekens).',
      'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
      'auth/user-not-found': 'Er is geen account gevonden met dit e-mailadres.',
      'auth/wrong-password': 'E-mailadres of wachtwoord klopt niet.',
      'auth/popup-closed-by-user': 'Het Google-inlogvenster is gesloten.',
      'auth/popup-blocked': 'Je browser blokkeerde het Google-inlogvenster.',
      'auth/unauthorized-domain': 'Voeg dit domein toe bij Firebase Authentication → Instellingen → Geautoriseerde domeinen.',
      'auth/operation-not-allowed': 'Deze inlogmethode is nog niet ingeschakeld in Firebase.',
      'auth/network-request-failed': 'Geen verbinding. Controleer je internetverbinding.'
    };
    return messages[code] || 'Inloggen is niet gelukt. Probeer het opnieuw.';
  }
  function googleButton() {
    return '<button type="button" class="btn btn-google btn-block" data-action="google"><strong>G</strong> Doorgaan met Google</button>';
  }
  function renderInloggen() {
    app.innerHTML = '<div class="auth-wrap"><section class="panel"><h1>Welkom terug</h1><p class="muted">Log in om je boodschappenlijst op verschillende apparaten te bewaren.</p>' + googleButton() +
      '<div class="divider">of met e-mail</div><form id="form-inloggen"><div class="field"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="wachtwoord">Wachtwoord</label><input id="wachtwoord" name="wachtwoord" type="password" autocomplete="current-password" required></div><p id="formfout" class="form-error" role="alert"></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Inloggen</button></form><p class="alt">Nog geen account? <a href="#/registreren">Account aanmaken</a></p></section></div>';
  }
  function renderRegistreren() {
    app.innerHTML = '<div class="auth-wrap"><section class="panel"><h1>Account aanmaken</h1><p class="muted">Bewaar je boodschappenlijst veilig in je eigen account.</p>' + googleButton() +
      '<div class="divider">of met e-mail</div><form id="form-registreren"><div class="field"><label for="naam">Naam</label><input id="naam" name="naam" autocomplete="name" required maxlength="80"></div>' +
      '<div class="field"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="wachtwoord">Wachtwoord</label><input id="wachtwoord" name="wachtwoord" type="password" autocomplete="new-password" minlength="6" required></div>' +
      '<p id="formfout" class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">Account aanmaken</button></form>' +
      '<p class="alt">Heb je al een account? <a href="#/inloggen">Inloggen</a></p></section></div>';
  }
  function formFout(message) { var el = document.getElementById('formfout'); if (el) el.textContent = message || ''; }
  function formData(form) { var data = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) data[el.name] = el.value; }); return data; }
  function verwerkInloggen(form) {
    if (!cloud) { formFout('Firebase is nog niet beschikbaar. Controleer js/firebase.js.'); return; }
    var data = formData(form); var button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Bezig…';
    cloud.inloggen(data.email.trim(), data.wachtwoord).then(function () { gaNaar('/account'); }).catch(function (e) { formFout(authFout(e)); button.disabled = false; button.textContent = 'Inloggen'; });
  }
  function verwerkRegistreren(form) {
    if (!cloud) { formFout('Firebase is nog niet beschikbaar. Controleer js/firebase.js.'); return; }
    var data = formData(form); var button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Bezig…';
    cloud.registreer(data.naam.trim(), data.email.trim(), data.wachtwoord).then(function () { gaNaar('/account'); }).catch(function (e) { formFout(authFout(e)); button.disabled = false; button.textContent = 'Account aanmaken'; });
  }
  function verwerkGoogle() {
    if (!cloud) { toast('Firebase is nog niet beschikbaar.'); return; }
    cloud.inloggenGoogle().then(function () { gaNaar('/account'); }).catch(function (e) { toast(authFout(e), 4000); });
  }
  function uitloggen() { if (cloud) cloud.uitloggen().then(function () { gaNaar('/'); }).catch(function () { toast('Uitloggen lukte niet.'); }); }

  function naMandWijziging() { updateHeader(); if (pad() === '/') renderGrid(); else if (pad() === '/winkelmand') renderMandPagina(); }
  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-action]'); if (!el) return;
    var action = el.getAttribute('data-action'); var id = el.getAttribute('data-id');
    if (action === 'add') { wijzigAantal(id, 1); toast(productMap[id].naam + ' toegevoegd'); naMandWijziging(); }
    else if (action === 'inc') { wijzigAantal(id, 1); naMandWijziging(); }
    else if (action === 'dec') { wijzigAantal(id, -1); naMandWijziging(); }
    else if (action === 'remove') { verwijderProduct(id); toast('Product verwijderd'); naMandWijziging(); }
    else if (action === 'clear') { if (confirm('Weet je zeker dat je je boodschappenlijst wilt leegmaken?')) { setMand({}); naMandWijziging(); } }
    else if (action === 'cat') { state.categorie = el.getAttribute('data-cat'); document.querySelectorAll('.chip').forEach(function (chip) { chip.classList.toggle('active', chip.getAttribute('data-cat') === state.categorie); }); renderGrid(); }
    else if (action === 'store') { state.winkel = el.getAttribute('data-store'); writeStore(WINKEL_KEUZE, state.winkel); renderCatalogus(); }
    else if (action === 'reset-filters') { state.query = ''; state.categorie = 'alle'; state.winkel = 'lidl'; writeStore(WINKEL_KEUZE, state.winkel); if (zoekveld) zoekveld.value = ''; renderCatalogus(); }
    else if (action === 'google') verwerkGoogle();
    else if (action === 'logout') uitloggen();
  });
  document.addEventListener('change', function (event) {
    if (event.target && event.target.hasAttribute('data-sort')) { state.sortering = event.target.value; renderGrid(); }
  });
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (form.id === 'form-inloggen') { event.preventDefault(); verwerkInloggen(form); }
    else if (form.id === 'form-registreren') { event.preventDefault(); verwerkRegistreren(form); }
    else if (form.id === 'zoekformulier') { event.preventDefault(); state.query = zoekveld.value; if (pad() === '/') renderGrid(); else gaNaar('/'); }
  });
  if (zoekveld) zoekveld.addEventListener('input', function () { state.query = zoekveld.value; if (pad() === '/') renderGrid(); else gaNaar('/'); });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && gebruiker && cloud && cloudOk) cloud.bewaarMand(gebruiker.uid, getMand()).catch(function () {}); });
  window.addEventListener('pagehide', function () { if (gebruiker && cloud && cloudOk) cloud.bewaarMand(gebruiker.uid, getMand()).catch(function () {}); });

  if (cloud) cloud.onAuth(opAuth);
  else { authKlaar = true; route(); }
})();
