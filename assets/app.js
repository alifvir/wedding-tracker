/* Tabungan Wedding: data harian, target, dan sub dompet dalam satu tempat. */
(function () {
  'use strict';

  var STORE_KEY = 'tabungan-wedding-v1';
  var APP_VERSION = '1.2';
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var KIND_LABEL = { ojek: 'Dompet ojek', tabungan: 'Tabungan', tunai: 'Tunai', lain: 'Lainnya' };
  var KIND_ORDER = ['ojek', 'tabungan', 'tunai', 'lain'];
  var CATEGORIES = ['Gym', 'Service Mobil', 'Bensin', 'Makan', 'Kesehatan', 'Tagihan', 'Transportasi', 'Wedding / Vendor', 'Lainnya'];
  var SOURCES = ['Ojek', 'Freelance', 'Konser bunga', 'Tips', 'Lainnya'];
  var SEGMENT_COLORS = ['#F3D6A5', '#EFB3BE', '#B9D4C1', '#E9CDBA', '#C7D6DD', '#F0E2CE'];
  var VIEWS = ['ringkasan', 'harian', 'pengeluaran', 'target', 'dompet', 'setelan'];
  var VIEW_TITLE = {
    ringkasan: 'Ringkasan', harian: 'Catatan harian', pengeluaran: 'Pengeluaran',
    target: 'Target', dompet: 'Dompet', setelan: 'Setelan'
  };

  var modal = document.getElementById('modal');
  var toastEl = document.getElementById('toast');
  var bannerEl = document.getElementById('banner');
  var importFile = document.getElementById('importFile');
  var viewEls = {};
  var state = null;
  var ui = { view: 'ringkasan', incomeMonth: null, expenseMonth: null };
  var toastTimer = null;
  var storageBroken = false;
  var confirmResolver = null;

  VIEWS.forEach(function (v) {
    var el = document.getElementById('view-' + v);
    if (el) viewEls[v] = el;
  });

  /* ---------- helpers ---------- */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function digits(value) {
    return String(value == null ? '' : value).replace(/[^\d]/g, '');
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function fmtRp(value) {
    return 'Rp ' + Math.round(num(value)).toLocaleString('id-ID');
  }

  function fmtRpCompact(value) {
    var n = Math.abs(num(value));
    if (n >= 1000000000) return 'Rp ' + (n / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1000000) return 'Rp ' + (n / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (n >= 1000) return 'Rp ' + (n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
    return fmtRp(n);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function isoFromDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayISO() { return isoFromDate(new Date()); }

  function dateFromISO(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function isValidISO(iso) {
    var d = dateFromISO(iso);
    return !!d && isoFromDate(d) === iso;
  }

  function fmtDate(iso) {
    var d = dateFromISO(iso);
    if (!d) return '-';
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateFull(iso) {
    var d = dateFromISO(iso);
    if (!d) return '-';
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateTime(isoString) {
    if (!isoString) return '-';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return fmtDate(isoFromDate(d)) + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes());
  }

  function monthKeyOf(iso) { return String(iso || '').slice(0, 7); }

  function monthLabel(key) {
    var parts = String(key || '').split('-');
    var m = Number(parts[1]) - 1;
    return (MONTHS[m] || key) + ' ' + parts[0];
  }

  function monthShortLabel(key) {
    var parts = String(key || '').split('-');
    var m = Number(parts[1]) - 1;
    return (MONTHS_SHORT[m] || key) + ' ' + parts[0];
  }

  function daysInclusive(fromISO, toISO) {
    var a = dateFromISO(fromISO), b = dateFromISO(toISO);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return prefix + '-' + window.crypto.randomUUID().slice(0, 8);
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function sortByDateDesc(a, b) {
    if (a.date === b.date) return String(b.id).localeCompare(String(a.id));
    return a.date < b.date ? 1 : -1;
  }

  /* ---------- state ---------- */

  function fallbackSeed() {
    return {
      version: 1,
      meta: { seededAt: todayISO(), source: 'Awal baru', legacyWalletFixed: true },
      wallets: [
        { id: 'jago', name: 'Jago', kind: 'tabungan', initial: 0 },
        { id: 'wondr', name: 'Wondr', kind: 'tabungan', initial: 0 },
        { id: 'cash', name: 'Cash', kind: 'tunai', initial: 0 }
      ],
      targets: [],
      incomes: [],
      expenses: [],
      transfers: [],
      settings: { theme: 'system', lastWallet: 'cash' }
    };
  }

  function migrateLegacyWallets() {
    if (!state || state.meta.legacyWalletFixed) return false;
    var hasGopay = state.wallets.some(function (w) { return w.id === 'gopay'; });
    var moved = 0;
    if (hasGopay) {
      state.incomes.forEach(function (x) {
        if (!x.walletId) {
          x.walletId = 'gopay';
          moved += 1;
        }
      });
      if (moved) state.settings.lastWallet = 'gopay';
    }
    state.meta.legacyWalletFixed = true;
    return moved > 0;
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Isi file tidak dikenali.');
    if (!Array.isArray(raw.wallets)) throw new Error('Daftar dompet tidak ditemukan di file ini.');

    var seen = {};
    var wallets = raw.wallets.map(function (w) {
      if (!w || !w.id || !w.name) throw new Error('Ada dompet tanpa nama di file ini.');
      var id = String(w.id);
      if (seen[id]) throw new Error('Ada id dompet yang dobel di file ini.');
      seen[id] = true;
      return {
        id: id,
        name: String(w.name).slice(0, 60),
        kind: KIND_ORDER.indexOf(w.kind) >= 0 ? w.kind : 'lain',
        initial: Math.max(0, num(w.initial))
      };
    });
    if (!wallets.length) throw new Error('File ini belum punya dompet.');

    var walletIds = wallets.map(function (w) { return w.id; });

    var incomes = (Array.isArray(raw.incomes) ? raw.incomes : []).filter(function (x) {
      return x && isValidISO(x.date) && num(x.amount) > 0;
    }).map(function (x) {
      return {
        id: x.id ? String(x.id) : uid('in'),
        date: x.date,
        amount: Math.round(num(x.amount)),
        walletId: walletIds.indexOf(x.walletId) >= 0 ? x.walletId : null,
        source: x.source ? String(x.source).slice(0, 40) : '',
        note: x.note ? String(x.note).slice(0, 240) : ''
      };
    });

    var expenses = (Array.isArray(raw.expenses) ? raw.expenses : []).filter(function (x) {
      return x && isValidISO(x.date) && num(x.amount) > 0;
    }).map(function (x) {
      return {
        id: x.id ? String(x.id) : uid('ex'),
        date: x.date,
        amount: Math.round(num(x.amount)),
        category: x.category ? String(x.category).slice(0, 40) : 'Lainnya',
        type: x.type === 'Wedding' ? 'Wedding' : 'Non-Wedding',
        walletId: walletIds.indexOf(x.walletId) >= 0 ? x.walletId : null,
        deduct: x.deduct !== false,
        note: x.note ? String(x.note).slice(0, 240) : ''
      };
    });

    var transfers = (Array.isArray(raw.transfers) ? raw.transfers : []).filter(function (x) {
      return x && isValidISO(x.date) && num(x.amount) > 0 &&
        walletIds.indexOf(x.fromWalletId) >= 0 && walletIds.indexOf(x.toWalletId) >= 0 &&
        x.fromWalletId !== x.toWalletId;
    }).map(function (x) {
      return {
        id: x.id ? String(x.id) : uid('tf'),
        date: x.date,
        amount: Math.round(num(x.amount)),
        fromWalletId: x.fromWalletId,
        toWalletId: x.toWalletId,
        note: x.note ? String(x.note).slice(0, 240) : ''
      };
    });

    var targets = (Array.isArray(raw.targets) ? raw.targets : []).filter(function (t) {
      return t && t.name && isValidISO(t.deadline) && num(t.amount) > 0;
    }).map(function (t) {
      return {
        id: t.id ? String(t.id) : uid('t'),
        name: String(t.name).slice(0, 60),
        amount: Math.round(num(t.amount)),
        deadline: t.deadline,
        rounding: Math.round(num(t.rounding)) > 0 ? Math.round(num(t.rounding)) : 5000
      };
    });

    var settings = raw.settings || {};
    return {
      version: 1,
      meta: {
        seededAt: raw.meta && raw.meta.seededAt ? String(raw.meta.seededAt) : todayISO(),
        source: raw.meta && raw.meta.source ? String(raw.meta.source) : 'Data lokal',
        updatedAt: raw.meta && raw.meta.updatedAt ? String(raw.meta.updatedAt) : null,
        legacyWalletFixed: !!(raw.meta && raw.meta.legacyWalletFixed === true)
      },
      wallets: wallets,
      targets: targets,
      incomes: incomes,
      expenses: expenses,
      transfers: transfers,
      settings: {
        theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'system',
        lastWallet: walletIds.indexOf(settings.lastWallet) >= 0 ? settings.lastWallet : walletIds[0]
      }
    };
  }

  function freshSeed() {
    if (window.SEED_DATA) return normalizeState(clone(window.SEED_DATA));
    return normalizeState(fallbackSeed());
  }

  function loadState() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (err) {
      storageBroken = true;
      return freshSeed();
    }
    if (!raw) return freshSeed();
    try {
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      storageBroken = true;
      try { window.localStorage.setItem(STORE_KEY + '-cadangan-rusak', raw); } catch (ignore) {}
      showBanner('Data tersimpan tidak bisa dibaca', 'Aplikasi berjalan dengan data awal. Salinan data lama sudah disimpan di kunci ' + STORE_KEY + '-cadangan-rusak. Buka Setelan untuk ekspor, impor cadangan, atau mulai dari data Excel.');
      return freshSeed();
    }
  }

  function saveState() {
    state.meta.updatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
      storageBroken = false;
    } catch (err) {
      storageBroken = true;
      showBanner('Perubahan belum tersimpan', 'Penyimpanan browser menolak data ini (mungkin penuh atau mode privat). Ekspor data supaya tidak hilang, lalu coba lagi.');
    }
  }

  function showBanner(title, text) {
    if (!bannerEl) return;
    bannerEl.innerHTML = '<strong>' + esc(title) + '</strong>' + esc(text);
    bannerEl.hidden = false;
  }

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  /* ---------- calculations ---------- */

  function compute() {
    var today = todayISO();
    var initialTotal = 0;
    var byWallet = {};
    state.wallets.forEach(function (w) {
      initialTotal += w.initial;
      byWallet[w.id] = { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
    });

    var incomeTotal = 0;
    var incomeDates = {};
    var todayIncome = 0;
    var unassignedIncome = 0;

    state.incomes.forEach(function (x) {
      incomeTotal += x.amount;
      incomeDates[x.date] = true;
      if (x.date === today) todayIncome += x.amount;
      if (x.walletId && byWallet[x.walletId]) byWallet[x.walletId].income += x.amount;
      else unassignedIncome += x.amount;
    });

    var expenseTotal = 0;
    var expenseDeductTotal = 0;
    state.expenses.forEach(function (x) {
      expenseTotal += x.amount;
      if (x.deduct) {
        expenseDeductTotal += x.amount;
        if (x.walletId && byWallet[x.walletId]) byWallet[x.walletId].expense += x.amount;
      }
    });

    var saldo = initialTotal + incomeTotal - expenseDeductTotal;
    var incomeDays = Object.keys(incomeDates).length;
    var avg = incomeDays ? incomeTotal / incomeDays : 0;

    (state.transfers || []).forEach(function (x) {
      if (byWallet[x.fromWalletId]) byWallet[x.fromWalletId].transferOut += x.amount;
      if (byWallet[x.toWalletId]) byWallet[x.toWalletId].transferIn += x.amount;
    });

    var wallets = state.wallets.map(function (w) {
      return {
        id: w.id, name: w.name, kind: w.kind, initial: w.initial,
        income: byWallet[w.id].income,
        expense: byWallet[w.id].expense,
        transferIn: byWallet[w.id].transferIn,
        transferOut: byWallet[w.id].transferOut,
        balance: w.initial + byWallet[w.id].income - byWallet[w.id].expense + byWallet[w.id].transferIn - byWallet[w.id].transferOut
      };
    });

    var monthMap = {};
    function ensureMonth(key) {
      if (!monthMap[key]) monthMap[key] = { key: key, label: monthLabel(key), income: 0, expense: 0, incomeDays: 0, dates: {} };
      return monthMap[key];
    }
    state.incomes.forEach(function (x) {
      var m = ensureMonth(monthKeyOf(x.date));
      m.income += x.amount;
      m.dates[x.date] = true;
    });
    state.expenses.forEach(function (x) {
      var m = ensureMonth(monthKeyOf(x.date));
      m.expense += x.amount;
    });
    ensureMonth(monthKeyOf(today));
    var months = Object.keys(monthMap).sort().reverse().map(function (key) {
      var m = monthMap[key];
      m.incomeDays = Object.keys(m.dates).length;
      delete m.dates;
      return m;
    });

    var todayHasIncome = todayIncome > 0;
    var targets = state.targets.map(function (t) {
      var kurang = Math.max(t.amount - saldo, 0);
      var rawDays = daysInclusive(today, t.deadline);
      var daysLeft = Math.max(rawDays - (todayHasIncome ? 1 : 0), 0);
      var deadlinePassed = dateFromISO(today) > dateFromISO(t.deadline);
      var minPerDay = kurang === 0 ? 0 : (daysLeft === 0 ? kurang : kurang / daysLeft);
      var saran = minPerDay === 0 ? 0 : Math.ceil(minPerDay / t.rounding) * t.rounding;
      var achieved = saldo >= t.amount;
      var status = achieved ? 'TERCAPAI' : (deadlinePassed ? 'DEADLINE LEWAT' : 'MASIH BISA');
      var pace = achieved ? 'TERCAPAI' : (avg === 0 ? 'BELUM ADA INPUT' : (avg >= minPerDay ? 'ON TRACK' : 'PERLU DITINGKATKAN'));
      return {
        id: t.id, name: t.name, amount: t.amount, deadline: t.deadline, rounding: t.rounding,
        kurang: kurang, daysLeft: daysLeft, minPerDay: minPerDay, saran: saran,
        status: status, pace: pace, achieved: achieved,
        progress: t.amount ? Math.min(Math.max(saldo, 0) / t.amount, 1) : 0,
        projection: saldo + avg * daysLeft
      };
    });

    var currentMonth = monthKeyOf(today);
    var thisMonth = monthMap[currentMonth] || { income: 0, expense: 0, incomeDays: 0 };
    var walletName = {};
    state.wallets.forEach(function (w) { walletName[w.id] = w.name; });

    return {
      today: today,
      initialTotal: initialTotal,
      incomeTotal: incomeTotal,
      expenseTotal: expenseTotal,
      expenseDeductTotal: expenseDeductTotal,
      unassignedIncome: unassignedIncome,
      saldo: saldo,
      wallets: wallets,
      walletName: walletName,
      incomeDays: incomeDays,
      avg: avg,
      todayIncome: todayIncome,
      todayHasIncome: todayHasIncome,
      monthIncome: thisMonth.income,
      monthExpense: thisMonth.expense,
      monthIncomeDays: thisMonth.incomeDays,
      months: months,
      targets: targets
    };
  }

  function monthsForFilter() {
    var keys = {};
    var current = monthKeyOf(todayISO());
    keys[current] = true;
    state.incomes.forEach(function (x) { keys[monthKeyOf(x.date)] = true; });
    state.expenses.forEach(function (x) { keys[monthKeyOf(x.date)] = true; });
    return Object.keys(keys).sort().reverse();
  }

  function focusTarget(c) {
    if (!c.targets.length) return null;
    var open = c.targets.filter(function (t) { return !t.achieved; });
    var pool = open.length ? open : c.targets;
    return pool.slice().sort(function (a, b) {
      if (a.deadline === b.deadline) return a.amount - b.amount;
      return a.deadline < b.deadline ? -1 : 1;
    })[0];
  }

  /* ---------- theme ---------- */

  var prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function isDarkNow() {
    var theme = state && state.settings ? state.settings.theme : 'system';
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return !!(prefersDark && prefersDark.matches);
  }

  function applyTheme() {
    var dark = isDarkNow();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#161210' : '#FBF6EE');
    var icon = document.getElementById('themeIcon');
    if (icon) icon.setAttribute('href', dark ? '#i-sun' : '#i-moon');
    var toggle = document.getElementById('themeToggle');
    if (toggle) toggle.setAttribute('aria-label', dark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap');
  }

  if (prefersDark && typeof prefersDark.addEventListener === 'function') {
    prefersDark.addEventListener('change', function () {
      if (!state || state.settings.theme === 'system') applyTheme();
    });
  }

  /* ---------- render helpers ---------- */

  function tag(text, variant) {
    return '<span class="tag tag--' + variant + '">' + esc(text) + '</span>';
  }

  function statusTag(status) {
    var variant = status === 'TERCAPAI' ? 'sage' : (status === 'DEADLINE LEWAT' ? 'muted' : 'brass');
    return tag(status, variant);
  }

  function paceTag(pace) {
    var variant = pace === 'ON TRACK' || pace === 'TERCAPAI' ? 'sage' : (pace === 'BELUM ADA INPUT' ? 'muted' : 'wine');
    return tag(pace, variant);
  }

  function statTile(label, value, sub) {
    return '<div class="stat"><span class="stat__label">' + esc(label) + '</span><strong class="stat__value tnum">' + esc(value) + '</strong>' +
      (sub ? '<span class="stat__sub">' + esc(sub) + '</span>' : '') + '</div>';
  }

  function walletOptions(selected, includeBlank) {
    var html = includeBlank ? '<option value=""' + (selected ? '' : ' selected') + '>Belum dirinci</option>' : '';
    state.wallets.forEach(function (w) {
      html += '<option value="' + esc(w.id) + '"' + (selected === w.id ? ' selected' : '') + '>' + esc(w.name) + ' (' + esc(KIND_LABEL[w.kind]) + ')</option>';
    });
    return html;
  }

  function monthSelect(id, selected) {
    return '<select class="input input--select" id="' + id + '">' + monthsForFilter().map(function (key) {
      return '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + esc(monthLabel(key)) + '</option>';
    }).join('') + '</select>';
  }

  function incomeRow(x, c) {
    var wallet = x.walletId ? c.walletName[x.walletId] : '';
    var title = x.note || x.source || 'Pendapatan';
    var sub = (wallet ? tag(wallet, 'muted') : tag('Belum dirinci', 'brass')) +
      (x.source && x.note ? '<span>' + esc(x.source) + '</span>' : '');
    return '<li class="row">' +
      '<div class="row__main"><p class="row__title">' + esc(title) + '</p><p class="row__sub">' + sub + '</p></div>' +
      '<p class="row__amt row__amt--in tnum">+' + fmtRp(x.amount) + '</p>' +
      '<button class="row__action" type="button" data-action="edit-income" data-id="' + esc(x.id) + '" aria-label="Ubah pendapatan ' + esc(fmtDate(x.date)) + '">Ubah</button>' +
      '</li>';
  }

  function expenseRow(x, c) {
    var wallet = x.walletId ? c.walletName[x.walletId] : '';
    var sub = tag(x.type, x.type === 'Wedding' ? 'wine' : 'muted') +
      (wallet ? '<span>' + esc(wallet) + '</span>' : tag('Tanpa dompet', 'brass')) +
      (!x.deduct ? tag('Tidak memotong saldo', 'brass') : '') +
      (x.note ? '<span>' + esc(x.note) + '</span>' : '');
    return '<li class="row">' +
      '<div class="row__main"><p class="row__title">' + esc(x.category) + '</p><p class="row__sub">' + sub + '</p></div>' +
      '<p class="row__amt row__amt--out tnum">-' + fmtRp(x.amount) + '</p>' +
      '<button class="row__action" type="button" data-action="edit-expense" data-id="' + esc(x.id) + '" aria-label="Ubah pengeluaran ' + esc(x.category) + ' tanggal ' + esc(fmtDate(x.date)) + '">Ubah</button>' +
      '</li>';
  }

  function emptyState(title, text, action) {
    return '<div class="empty empty--center"><strong>' + esc(title) + '</strong><span>' + esc(text) + '</span>' +
      (action || '') + '</div>';
  }

  /* ---------- views ---------- */

  function renderRingkasan() {
    var c = compute();
    var focus = focusTarget(c);
    var todayLabel = c.todayHasIncome ? 'Hari ini sudah tercatat ' + fmtRp(c.todayIncome) + '.' : 'Belum ada pendapatan tercatat hari ini.';
    var html = '';

    html += '<div class="page-head"><h1>Ringkasan tabungan</h1>' +
      '<p>Posisi per ' + esc(fmtDateFull(c.today)) + '. Saldo dihitung dari saldo awal tiap dompet, pendapatan yang dicatat, dan pengeluaran yang memotong saldo.</p></div>';

    var segments = c.wallets.filter(function (w) { return w.balance > 0; });
    var barTotal = segments.reduce(function (sum, w) { return sum + w.balance; }, 0) + Math.max(c.unassignedIncome, 0);
    var barHtml = '';
    var legendHtml = '';
    if (barTotal > 0) {
      var idx = 0;
      segments.forEach(function (w) {
        var width = (w.balance / barTotal) * 100;
        barHtml += '<span class="splitbar__seg" style="width:' + width.toFixed(3) + '%;background:' + SEGMENT_COLORS[idx % SEGMENT_COLORS.length] + '"></span>';
        legendHtml += '<span class="splitlegend__item"><span class="splitlegend__dot" style="background:' + SEGMENT_COLORS[idx % SEGMENT_COLORS.length] + '"></span>' + esc(w.name) + ' ' + fmtRp(w.balance) + '</span>';
        idx += 1;
      });
      if (c.unassignedIncome > 0) {
        var uWidth = (c.unassignedIncome / barTotal) * 100;
        barHtml += '<span class="splitbar__seg" style="width:' + uWidth.toFixed(3) + '%;background:#D8B98E"></span>';
        legendHtml += '<span class="splitlegend__item"><span class="splitlegend__dot" style="background:#D8B98E"></span>Belum dirinci ' + fmtRp(c.unassignedIncome) + '</span>';
      }
    }

    html += '<section class="balance" aria-labelledby="saldoLabel">' +
      '<p class="balance__label" id="saldoLabel">Saldo tabungan sekarang</p>' +
      '<p class="balance__value tnum">' + fmtRp(c.saldo) + '</p>' +
      '<p class="balance__meta">Saldo awal ' + fmtRp(c.initialTotal) + ' + pendapatan ' + fmtRp(c.incomeTotal) +
      ' - pengeluaran ' + fmtRp(c.expenseDeductTotal) + '</p>' +
      (barHtml ? '<div class="splitbar" role="img" aria-label="Posisi saldo per dompet">' + barHtml + '</div>' : '') +
      (legendHtml ? '<div class="splitlegend">' + legendHtml + '</div>' : '') +
      '<div class="balance__foot"><a class="balance__link" href="#harian" data-action="go-income">Catat pendapatan</a><span class="tiny">' + esc(todayLabel) + '</span></div>' +
      '</section>';

    html += '<div class="dash"><div class="stack">';

    if (focus) {
      var pct = Math.round(focus.progress * 100);
      html += '<section class="card card--focus target-focus" aria-labelledby="focusTitle">' +
        '<div class="target-focus__top"><div>' +
        '<p class="eyebrow">Target terdekat</p>' +
        '<h2 class="target-focus__name" id="focusTitle">' + esc(focus.name) + '</h2>' +
        '<p class="target-focus__amount">Target ' + fmtRp(focus.amount) + ' sampai ' + esc(fmtDate(focus.deadline)) + '</p>' +
        '</div>' + statusTag(focus.status) + '</div>' +
        '<div class="progress">' +
        '<div class="progress__meta"><span>' + fmtRp(c.saldo) + ' terkumpul</span><span>' + pct + '%</span></div>' +
        '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progres ' + esc(focus.name) + '">' +
        '<div class="bar__fill' + (focus.achieved ? ' bar__fill--ok' : '') + '" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<dl class="facts">' +
        '<div class="fact"><dt>Kekurangan</dt><dd class="is-strong tnum">' + fmtRp(focus.kurang) + '</dd></div>' +
        '<div class="fact"><dt>Hari tersisa</dt><dd class="tnum">' + (focus.daysLeft > 0 ? focus.daysLeft + ' hari' : (focus.achieved ? '-' : '0 hari')) + '</dd></div>' +
        '<div class="fact"><dt>Perlu per hari</dt><dd class="tnum">' + fmtRp(focus.minPerDay) + '</dd></div>' +
        '<div class="fact"><dt>Saran harian</dt><dd class="tnum">' + (focus.saran ? fmtRp(focus.saran) : '-') + '</dd></div>' +
        '</dl>' +
        '<div class="pace">' + paceTag(focus.pace) +
        '<p>Rata-rata pendapatanmu ' + fmtRp(c.avg) + ' per hari dari ' + c.incomeDays + ' hari tercatat. Proyeksi saldo pada ' + esc(fmtDate(focus.deadline)) + ': ' + fmtRp(focus.projection) + '.</p></div>' +
        '</section>';
    } else {
      html += '<section class="card">' +
        '<div class="card__head"><div><h2>Belum ada target</h2><p>Tambahkan target supaya kekurangan dan saran harian bisa dihitung.</p></div></div>' +
        emptyState('Target belum diisi', 'Isi nominal target dan deadline, misalnya 40 juta sampai 31 Januari 2027.', '<a class="btn btn--primary" href="#target">Tambah target</a>') +
        '</section>';
    }

    html += '<section class="stats" aria-label="Angka bulan ini">' +
      statTile('Pendapatan hari ini', c.todayIncome ? fmtRp(c.todayIncome) : 'Belum ada', c.todayHasIncome ? 'Sudah masuk catatan' : 'Catat lewat tab Harian') +
      statTile('Pendapatan bulan ini', fmtRp(c.monthIncome), c.monthIncomeDays + ' hari tercatat') +
      statTile('Pengeluaran bulan ini', fmtRp(c.monthExpense), 'Termasuk yang tidak memotong saldo') +
      statTile('Rata-rata per hari', fmtRp(c.avg), 'Dari ' + c.incomeDays + ' hari tercatat') +
      '</section>';

    html += chartCard(c);
    html += '</div><div class="dash__side">';

    var others = c.targets.filter(function (t) { return !focus || t.id !== focus.id; });
    html += '<section class="card"><div class="card__head"><div><h2>Target lain</h2><p>Skenario lain yang kamu pantau.</p></div></div>';
    if (others.length) {
      html += '<ul class="rows">' + others.map(function (t) {
        return '<li class="row"><div class="row__main"><p class="row__title">' + esc(t.name) + '</p>' +
          '<p class="row__sub">' + statusTag(t.status) + '<span>' + esc(fmtDate(t.deadline)) + '</span></p></div>' +
          '<p class="row__amt tnum">' + (t.achieved ? 'Tercapai' : 'Kurang ' + fmtRp(t.kurang)) + '</p></li>';
      }).join('') + '</ul>' +
        '<div class="actions" style="margin-top:12px"><a class="textlink" href="#target">Kelola target</a></div>';
    } else {
      html += '<p class="small muted">' + (focus ? 'Baru ada satu target. Tambah skenario lain di tab Target.' : 'Belum ada target yang bisa dibandingkan.') + '</p>' +
        '<div class="actions" style="margin-top:12px"><a class="textlink" href="#target">Tambah target</a></div>';
    }
    html += '</section>';

    var recent = state.incomes.concat(state.expenses).sort(sortByDateDesc).slice(0, 5);
    html += '<section class="card"><div class="card__head"><div><h2>Catatan terakhir</h2><p>Lima catatan terbaru dari pendapatan dan pengeluaran.</p></div></div>';
    if (recent.length) {
      html += '<ul class="rows">' + recent.map(function (x) {
        var isIncome = state.incomes.indexOf(x) >= 0;
        var title = isIncome ? (x.note || x.source || 'Pendapatan') : x.category;
        var sub = (isIncome ? (x.walletId ? c.walletName[x.walletId] : 'Belum dirinci') : (x.type + (x.walletId ? ' di ' + c.walletName[x.walletId] : '')));
        return '<li class="row"><div class="row__main"><p class="row__title">' + esc(title) + '</p>' +
          '<p class="row__sub"><span>' + esc(fmtDate(x.date)) + '</span><span>' + esc(sub) + '</span></p></div>' +
          '<p class="row__amt ' + (isIncome ? 'row__amt--in' : 'row__amt--out') + ' tnum">' + (isIncome ? '+' : '-') + fmtRp(x.amount) + '</p></li>';
      }).join('') + '</ul>' +
        '<div class="actions" style="margin-top:12px"><a class="textlink" href="#harian">Lihat catatan harian</a><a class="textlink" href="#pengeluaran">Lihat pengeluaran</a></div>';
    } else {
      html += emptyState('Belum ada catatan', 'Mulai dari pendapatan hari ini, lalu tambahkan pengeluaran kalau ada.', '<a class="btn btn--primary" href="#harian">Catat pendapatan</a>');
    }
    html += '</section>';

    html += '</div></div>';
    viewEls.ringkasan.innerHTML = html;
  }

  function chartCard(c) {
    var today = new Date();
    var keys = [];
    for (var i = 5; i >= 0; i -= 1) {
      var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      keys.push(isoFromDate(d).slice(0, 7));
    }
    var firstData = c.months.filter(function (m) { return m.income > 0 || m.expense > 0; }).map(function (m) { return m.key; }).sort()[0];
    if (firstData) keys = keys.filter(function (key) { return key >= firstData; });
    var rows = keys.map(function (key) {
      var found = c.months.filter(function (m) { return m.key === key; })[0];
      return { key: key, income: found ? found.income : 0, expense: found ? found.expense : 0 };
    });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.income, r.expense); }).concat([1]));
    var hasData = rows.some(function (r) { return r.income > 0 || r.expense > 0; });

    var html = '<section class="card"><div class="card__head"><div><h2>Pendapatan dan pengeluaran per bulan</h2>' +
      '<p>Garis wine: pendapatan. Garis brass: pengeluaran tercatat (termasuk yang tidak memotong saldo).</p></div></div>';
    if (!hasData) {
      html += emptyState('Belum ada data untuk grafik', 'Grafik muncul setelah ada catatan pendapatan atau pengeluaran.');
      return html + '</section>';
    }
    html += '<div class="chart">' + rows.map(function (r) {
      var iw = r.income > 0 ? Math.max((r.income / max) * 100, 2) : 0;
      var ew = r.expense > 0 ? Math.max((r.expense / max) * 100, 2) : 0;
      return '<div class="chart__row">' +
        '<span class="chart__label">' + esc(monthShortLabel(r.key)) + '</span>' +
        '<div class="chart__track" role="img" aria-label="' + esc(monthLabel(r.key)) + ': pendapatan ' + fmtRp(r.income) + ', pengeluaran ' + fmtRp(r.expense) + '">' +
        (r.income > 0 ? '<span class="chart__bar" style="width:' + iw.toFixed(2) + '%"></span>' : '') +
        (r.expense > 0 ? '<span class="chart__bar chart__bar--exp" style="width:' + ew.toFixed(2) + '%"></span>' : '') +
        '</div>' +
        '<span class="chart__value tnum">' + fmtRpCompact(r.income) +
        (r.expense > 0 ? '<br><span class="muted tiny">' + fmtRpCompact(r.expense) + ' keluar</span>' : '') + '</span>' +
        '</div>';
    }).join('') + '</div></section>';
    return html;
  }

  function renderHarian() {
    var c = compute();
    var options = monthsForFilter();
    var selected = ui.incomeMonth && options.indexOf(ui.incomeMonth) >= 0 ? ui.incomeMonth : (options.indexOf(monthKeyOf(c.today)) >= 0 ? monthKeyOf(c.today) : options[0]);
    ui.incomeMonth = selected;
    var monthIncomes = state.incomes.filter(function (x) { return monthKeyOf(x.date) === selected; });
    var total = monthIncomes.reduce(function (sum, x) { return sum + x.amount; }, 0);
    var byDate = {};
    monthIncomes.forEach(function (x) { (byDate[x.date] = byDate[x.date] || []).push(x); });
    var dates = Object.keys(byDate).sort().reverse();

    var html = '<div class="page-head"><h1>Catatan harian</h1>' +
      '<p>Isi nominal yang masuk pada hari itu. Pilih dompetnya supaya saldo tiap dompet ikut bergerak. Cukup satu catatan per hari kalau uangnya digabung.</p></div>';

    html += '<form class="card form" id="incomeForm" novalidate>' +
      '<div class="card__head"><div><h2>Catat pendapatan</h2><p>Tanggal otomatis hari ini. Nominal diketik tanpa titik.</p></div></div>' +
      '<div class="form__row">' +
      '<div class="field"><label for="inDate">Tanggal</label><input class="input" id="inDate" name="date" type="date" max="' + esc(c.today) + '" value="' + esc(c.today) + '" required></div>' +
      '<div class="field"><label for="inWallet">Dompet</label><select class="input input--select" id="inWallet" name="walletId">' + walletOptions(state.settings.lastWallet, false) + '</select>' +
      '<span class="field__hint">Saldo awal dompet bisa diubah di tab Dompet.</span></div>' +
      '</div>' +
      '<div class="field"><label for="inAmount">Nominal</label>' +
      '<div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span><input class="input input--amount tnum" id="inAmount" name="amount" inputmode="numeric" autocomplete="off" placeholder="0" data-money required></div>' +
      '<div class="chips" role="group" aria-label="Isi cepat nominal"><button type="button" class="chip" data-action="quick-amount" data-target="inAmount" data-amount="50000">50 rb</button>' +
      '<button type="button" class="chip" data-action="quick-amount" data-target="inAmount" data-amount="100000">100 rb</button>' +
      '<button type="button" class="chip" data-action="quick-amount" data-target="inAmount" data-amount="150000">150 rb</button>' +
      '<button type="button" class="chip" data-action="quick-amount" data-target="inAmount" data-amount="200000">200 rb</button></div></div>' +
      '<div class="form__row">' +
      '<div class="field"><label for="inSource">Sumber (opsional)</label><input class="input" id="inSource" name="source" list="sourceList" placeholder="Ojek, Freelance, Konser bunga"><datalist id="sourceList">' +
      SOURCES.map(function (s) { return '<option value="' + esc(s) + '"></option>'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="inNote">Catatan (opsional)</label><input class="input" id="inNote" name="note" placeholder="Misal: 8 trip pagi, ada tips"></div>' +
      '</div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">Simpan pendapatan</button>' +
      '<span class="field__error" id="inError" role="alert" hidden></span></div>' +
      '</form>';

    html += '<section class="card"><div class="card__head"><div><h2>Riwayat pendapatan</h2>' +
      '<p>' + fmtRp(total) + ' dari ' + dates.length + ' hari pada ' + esc(monthLabel(selected)) + '.</p></div>' +
      '<div class="field" style="min-width:170px"><label class="label" for="monthFilter">Bulan</label>' + monthSelect('monthFilter', selected) + '</div></div>';

    if (!dates.length) {
      html += emptyState('Belum ada pendapatan bulan ini', 'Isi formulir di atas untuk mencatat pendapatan pertama pada ' + monthLabel(selected) + '.', '<button class="btn btn--ghost" type="button" data-action="focus-income">Isi nominal sekarang</button>');
    } else {
      html += '<div>' + dates.map(function (date) {
        var items = byDate[date].slice().sort(sortByDateDesc);
        var dayTotal = items.reduce(function (sum, x) { return sum + x.amount; }, 0);
        return '<section class="daygroup"><div class="daygroup__head"><h3>' + esc(fmtDateFull(date)) + '</h3><span class="tnum">' + fmtRp(dayTotal) + '</span></div>' +
          '<ul class="rows">' + items.map(function (x) { return incomeRow(x, c); }).join('') + '</ul></section>';
      }).join('') + '</div>';
    }
    html += '</section>';
    viewEls.harian.innerHTML = html;

    var form = document.getElementById('incomeForm');
    if (form) form.addEventListener('submit', onIncomeSubmit);
    var filter = document.getElementById('monthFilter');
    if (filter) filter.addEventListener('change', function () { ui.incomeMonth = filter.value; render(); });
  }

  function renderPengeluaran() {
    var c = compute();
    var options = monthsForFilter();
    var selected = ui.expenseMonth && options.indexOf(ui.expenseMonth) >= 0 ? ui.expenseMonth : (options.indexOf(monthKeyOf(c.today)) >= 0 ? monthKeyOf(c.today) : options[0]);
    ui.expenseMonth = selected;
    var monthExpenses = state.expenses.filter(function (x) { return monthKeyOf(x.date) === selected; }).sort(sortByDateDesc);
    var monthTotal = monthExpenses.reduce(function (sum, x) { return sum + x.amount; }, 0);
    var deductTotal = monthExpenses.reduce(function (sum, x) { return sum + (x.deduct ? x.amount : 0); }, 0);
    var weddingTotal = monthExpenses.reduce(function (sum, x) { return sum + (x.type === 'Wedding' ? x.amount : 0); }, 0);

    var html = '<div class="page-head"><h1>Pengeluaran</h1>' +
      '<p>Catat biaya seperti gym, servis mobil, bensin, atau vendor wedding. Saldo hanya berkurang kalau centang "Potong saldo" aktif.</p></div>';

    html += '<form class="card form" id="expenseForm" novalidate>' +
      '<div class="card__head"><div><h2>Tambah pengeluaran</h2><p>Biaya yang dibayar dari uang di luar catatan tetap bisa dicatat tanpa memotong saldo.</p></div></div>' +
      '<div class="form__row">' +
      '<div class="field"><label for="exDate">Tanggal</label><input class="input" id="exDate" name="date" type="date" max="' + esc(c.today) + '" value="' + esc(c.today) + '" required></div>' +
      '<div class="field"><label for="exAmount">Nominal</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="exAmount" name="amount" inputmode="numeric" autocomplete="off" placeholder="0" data-money required></div></div>' +
      '</div>' +
      '<div class="form__row form__row--3">' +
      '<div class="field"><label for="exCategory">Kategori</label><select class="input input--select" id="exCategory" name="category">' +
      CATEGORIES.map(function (cat) { return '<option value="' + esc(cat) + '">' + esc(cat) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="exType">Jenis</label><select class="input input--select" id="exType" name="type">' +
      '<option value="Non-Wedding">Non-Wedding</option><option value="Wedding">Wedding</option></select></div>' +
      '<div class="field"><label for="exWallet">Sumber dana</label><select class="input input--select" id="exWallet" name="walletId">' +
      walletOptions(state.settings.lastWallet, true) + '</select></div>' +
      '</div>' +
      '<label class="checkbox"><input type="checkbox" id="exDeduct" name="deduct" checked> Potong saldo tabungan</label>' +
      '<div class="field"><label for="exNote">Catatan (opsional)</label><input class="input" id="exNote" name="note" placeholder="Misal: servis rutin 10.000 km"></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">Simpan pengeluaran</button>' +
      '<span class="field__error" id="exError" role="alert" hidden></span></div>' +
      '</form>';

    html += '<section class="card"><div class="card__head"><div><h2>Riwayat pengeluaran</h2>' +
      '<p>' + fmtRp(monthTotal) + ' tercatat pada ' + esc(monthLabel(selected)) + ', ' + fmtRp(deductTotal) + ' memotong saldo.</p></div>' +
      '<div class="field" style="min-width:170px"><label class="label" for="monthFilter">Bulan</label>' + monthSelect('monthFilter', selected) + '</div></div>';
    if (!monthExpenses.length) {
      html += emptyState('Belum ada pengeluaran bulan ini', 'Pengeluaran yang tidak dicatat membuat saldo terlihat lebih besar dari kenyataan.', '<button class="btn btn--ghost" type="button" data-action="focus-expense">Isi pengeluaran</button>');
    } else {
      html += '<ul class="rows">' + monthExpenses.map(function (x) { return expenseRow(x, c); }).join('') + '</ul>';
    }
    html += '</section>';

    html += '<section class="stats" aria-label="Ringkasan pengeluaran bulan ini">' +
      statTile('Potong saldo', fmtRp(deductTotal), 'Mengurangi saldo tabungan') +
      statTile('Wedding', fmtRp(weddingTotal), 'Termasuk yang tidak memotong saldo') +
      statTile('Non-Wedding', fmtRp(monthTotal - weddingTotal), 'Kebutuhan harian') +
      statTile('Total bulan ini', fmtRp(monthTotal), monthExpenses.length + ' catatan') +
      '</section>';

    viewEls.pengeluaran.innerHTML = html;
    var form = document.getElementById('expenseForm');
    if (form) form.addEventListener('submit', onExpenseSubmit);
    var filter = document.getElementById('monthFilter');
    if (filter) filter.addEventListener('change', function () { ui.expenseMonth = filter.value; render(); });
  }

  function renderTarget() {
    var c = compute();
    var html = '<div class="page-head"><div class="page-head__row"><div><h1>Target</h1>' +
      '<p>Setiap target dihitung dari saldo tabungan yang sama, seperti scenario di Excel. Kekurangan, hari tersisa, dan saran harian ikut menyesuaikan.</p></div>' +
      '<button class="btn btn--primary" type="button" data-action="add-target">Tambah target</button></div></div>';

    if (!c.targets.length) {
      html += '<section class="card">' + emptyState('Target belum ada', 'Isi target dan deadline. Contoh: Rp 40.000.000 sampai 31 Januari 2027.', '<button class="btn btn--primary" type="button" data-action="add-target">Buat target pertama</button>') + '</section>';
      viewEls.target.innerHTML = html;
      return;
    }

    html += '<div class="target-list">' + c.targets.slice().sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; }).map(function (t) {
      var pct = Math.round(t.progress * 100);
      return '<section class="card target-card">' +
        '<div class="target-card__head"><div><h2 class="target-card__name">' + esc(t.name) + '</h2>' +
        '<p class="target-card__deadline">Target ' + fmtRp(t.amount) + ' sampai ' + esc(fmtDate(t.deadline)) + '</p></div>' + statusTag(t.status) + '</div>' +
        '<div class="progress"><div class="progress__meta"><span>' + fmtRp(c.saldo) + ' dari ' + fmtRp(t.amount) + '</span><span>' + pct + '%</span></div>' +
        '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progres ' + esc(t.name) + '">' +
        '<div class="bar__fill' + (t.achieved ? ' bar__fill--ok' : '') + '" style="width:' + pct + '%"></div></div></div>' +
        '<dl class="target-card__facts">' +
        '<div class="fact"><dt>Kekurangan</dt><dd class="is-strong tnum">' + fmtRp(t.kurang) + '</dd></div>' +
        '<div class="fact"><dt>Hari tersisa</dt><dd class="tnum">' + (t.daysLeft > 0 ? t.daysLeft + ' hari' : (t.achieved ? '-' : '0 hari')) + '</dd></div>' +
        '<div class="fact"><dt>Perlu per hari</dt><dd class="tnum">' + fmtRp(t.minPerDay) + '</dd></div>' +
        '<div class="fact"><dt>Saran harian</dt><dd class="tnum">' + (t.saran ? fmtRp(t.saran) : '-') + '</dd></div>' +
        '</dl>' +
        '<div class="target-card__foot"><div class="pace">' + paceTag(t.pace) + '<span class="tiny muted">Proyeksi ' + fmtRp(t.projection) + '</span></div>' +
        '<div class="actions"><button class="row__action" type="button" data-action="edit-target" data-id="' + esc(t.id) + '" aria-label="Ubah target ' + esc(t.name) + '">Ubah</button>' +
        '<button class="row__action" type="button" data-action="delete-target" data-id="' + esc(t.id) + '" aria-label="Hapus target ' + esc(t.name) + '">Hapus</button></div></div>' +
        '</section>';
    }).join('') + '</div>';

    html += '<section class="card card--flat"><div class="card__head"><div><h2>Cara hitungnya</h2></div></div>' +
      '<ul class="rows small muted">' +
      '<li class="row"><span>Kekurangan = target dikurangi saldo tabungan sekarang, minimal nol.</span></li>' +
      '<li class="row"><span>Hari tersisa = deadline dikurangi hari ini, ditambah satu. Kalau hari ini sudah ada pendapatan, hari ini dihitung sudah terpakai.</span></li>' +
      '<li class="row"><span>Perlu per hari = kekurangan dibagi hari tersisa. Saran harian dibulatkan ke atas sesuai pembulatan target, biasanya Rp 5.000.</span></li>' +
      '<li class="row"><span>Proyeksi = saldo sekarang ditambah rata-rata pendapatan harian dikali hari tersisa.</span></li>' +
      '</ul></section>';

    viewEls.target.innerHTML = html;
  }

  function renderDompet() {
    var c = compute();
    var html = '<div class="page-head"><div class="page-head__row"><div><h1>Dompet</h1>' +
      '<p>Saldo tiap dompet = saldo awal + pendapatan yang masuk ke dompet itu - pengeluaran dari dompet itu + pindah dana masuk - pindah dana keluar.</p></div>' +
      '<div class="actions"><button class="btn btn--ghost" type="button" data-action="add-transfer">Pindah dana</button>' +
      '<button class="btn btn--primary" type="button" data-action="add-wallet">Tambah dompet</button></div></div></div>';

    var ojekTotal = c.wallets.reduce(function (sum, w) { return sum + (w.kind === 'ojek' ? w.balance : 0); }, 0);
    html += '<section class="stats" aria-label="Ringkasan dompet">' +
      statTile('Total saldo', fmtRp(c.saldo), 'Semua dompet digabung') +
      statTile('Saldo awal', fmtRp(c.initialTotal), state.wallets.length + ' dompet') +
      statTile('Pendapatan masuk', fmtRp(c.incomeTotal), c.incomeDays + ' hari tercatat') +
      statTile('Dompet ojek', fmtRp(ojekTotal), 'GoPay, Grab, Flazz') +
      '</section>';

    html += '<section class="card"><div class="card__head"><div><h2>Posisi tiap dompet</h2><p>Total baris di bawah sama dengan saldo tabungan di Ringkasan. Pindah dana tidak mengubah total.</p></div></div>';

    html += '<div>' + c.wallets.map(function (w) {
      var net = w.transferIn - w.transferOut;
      return '<div class="wallet-row">' +
        '<div class="wallet-row__head"><span class="wallet-row__name">' + esc(w.name) + '</span>' + tag(KIND_LABEL[w.kind], 'muted') +
        '<span class="wallet-row__balance tnum">' + fmtRp(w.balance) + '</span>' +
        '<div class="actions actions--end"><button class="row__action" type="button" data-action="edit-wallet" data-id="' + esc(w.id) + '" aria-label="Ubah dompet ' + esc(w.name) + '">Ubah</button>' +
        '<button class="row__action" type="button" data-action="delete-wallet" data-id="' + esc(w.id) + '" aria-label="Hapus dompet ' + esc(w.name) + '">Hapus</button></div></div>' +
        '<div class="wallet-row__grid">' +
        '<div class="wallet-row__cell"><span>Saldo awal</span><strong class="tnum">' + fmtRp(w.initial) + '</strong></div>' +
        '<div class="wallet-row__cell"><span>Pendapatan masuk</span><strong class="tnum">' + (w.income > 0 ? '+' + fmtRp(w.income) : fmtRp(0)) + '</strong></div>' +
        '<div class="wallet-row__cell"><span>Pengeluaran</span><strong class="tnum">' + (w.expense > 0 ? '-' + fmtRp(w.expense) : fmtRp(0)) + '</strong></div>' +
        '<div class="wallet-row__cell"><span>Pindah dana</span><strong class="tnum">' + (net > 0 ? '+' + fmtRp(net) : (net < 0 ? '-' + fmtRp(Math.abs(net)) : fmtRp(0))) + '</strong></div>' +
        '</div>' +
        '</div>';
    }).join('');

    if (c.unassignedIncome > 0) {
      html += '<div class="wallet-row row--unassigned">' +
        '<div class="wallet-row__head"><span class="wallet-row__name">Belum dirinci</span>' + tag('Riwayat Excel', 'brass') +
        '<span class="wallet-row__balance tnum">' + fmtRp(c.unassignedIncome) + '</span>' +
        '<div class="actions actions--end"><a class="textlink" href="#harian">Buka catatan harian</a></div></div>' +
        '<p class="tiny muted">Pendapatan yang dicatat sebelum dompet dipisah. Buka catatannya di tab Harian untuk memilih dompet.</p>' +
        '<div class="wallet-row__grid">' +
        '<div class="wallet-row__cell"><span>Saldo awal</span><strong class="tnum">Rp 0</strong></div>' +
        '<div class="wallet-row__cell"><span>Pendapatan masuk</span><strong class="tnum">+' + fmtRp(c.unassignedIncome) + '</strong></div>' +
        '<div class="wallet-row__cell"><span>Pengeluaran</span><strong class="tnum">Rp 0</strong></div>' +
        '<div class="wallet-row__cell"><span>Pindah dana</span><strong class="tnum">Rp 0</strong></div>' +
        '</div>' +
        '</div>';
    }

    html += '</div></section>';

    var transfers = (state.transfers || []).slice().sort(sortByDateDesc);
    html += '<section class="card"><div class="card__head"><div><h2>Pindah dana antar dompet</h2>' +
      '<p>Memindahkan uang tidak mengubah total saldo. Saldo dompet asal berkurang, dompet tujuan bertambah.</p></div>' +
      '<button class="btn btn--ghost btn--small" type="button" data-action="add-transfer">Pindah dana</button></div>';

    if (!transfers.length) {
      html += emptyState('Belum ada pindah dana', 'Contoh: pindahkan Rp 6.000.000 dari GoPay ke Wondr untuk proteksi. Total saldo tetap Rp ' + Math.round(c.saldo).toLocaleString('id-ID') + '.', '<button class="btn btn--primary" type="button" data-action="add-transfer">Catat pindah dana</button>');
    } else {
      html += '<ul class="rows">' + transfers.map(function (t) {
        var from = c.walletName[t.fromWalletId] || 'Dompet dihapus';
        var to = c.walletName[t.toWalletId] || 'Dompet dihapus';
        return '<li class="row"><div class="row__main"><p class="row__title">' + esc(from) + ' ke ' + esc(to) + '</p>' +
          '<p class="row__sub">' + tag('Pindah dana', 'muted') + '<span>' + esc(fmtDate(t.date)) + '</span>' +
          (t.note ? '<span>' + esc(t.note) + '</span>' : '') + '</p></div>' +
          '<p class="row__amt tnum">' + fmtRp(t.amount) + '</p>' +
          '<button class="row__action" type="button" data-action="edit-transfer" data-id="' + esc(t.id) + '" aria-label="Ubah pindah dana ' + esc(fmtDate(t.date)) + '">Ubah</button></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';

    html += '<section class="card card--flat"><div class="card__head"><div><h2>Membedakan dua hal</h2></div></div>' +
      '<ul class="rows small muted">' +
      '<li class="row"><span><strong>Pindah dana</strong> dipakai kalau uang benar-benar berpindah dompet, misalnya GoPay ke Wondr untuk proteksi. Total saldo tidak berubah, dan perpindahannya tercatat dengan tanggal.</span></li>' +
      '<li class="row"><span><strong>Koreksi catatan</strong> dipakai kalau catatan lama salah dompet. Buka catatannya di tab Harian atau Pengeluaran, klik Ubah, lalu pilih dompet yang benar. Tidak ada uang yang berpindah, hanya label dompetnya yang dibetulkan.</span></li>' +
      '</ul>' +
      '<div class="actions" style="margin-top:12px"><a class="textlink" href="#harian">Buka catatan pendapatan</a></div></section>';

    viewEls.dompet.innerHTML = html;
  }

  function renderSetelan() {
    var c = compute();
    var theme = state.settings.theme;
    var jsonSize = 0;
    try { jsonSize = new Blob([JSON.stringify(state)]).size; } catch (err) { jsonSize = JSON.stringify(state).length; }
    var html = '<div class="page-head"><h1>Setelan</h1><p>Cadangkan data, atur tampilan, dan lihat dari mana angka dihitung.</p></div>';

    html += '<div class="settings-grid">';

    html += '<section class="card"><div class="card__head"><div><h2>Tampilan</h2><p>Tema gelap dipakai saat malam atau di dalam ruangan.</p></div></div>' +
      '<div class="theme-choice" role="group" aria-label="Pilih tema">' +
      ['light', 'dark', 'system'].map(function (value) {
        var labels = { light: 'Terang', dark: 'Gelap', system: 'Ikuti sistem' };
        var pressed = theme === value;
        return '<button class="chip" type="button" data-action="set-theme" data-value="' + value + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">' + labels[value] + '</button>';
      }).join('') + '</div></section>';

    html += '<section class="card"><div class="card__head"><div><h2>Data tersimpan</h2><p>Data hanya ada di browser ini, tidak dikirim ke mana pun.</p></div></div>' +
      '<dl class="kv">' +
      '<dt>Catatan pendapatan</dt><dd class="tnum">' + state.incomes.length + '</dd>' +
      '<dt>Catatan pengeluaran</dt><dd class="tnum">' + state.expenses.length + '</dd>' +
      '<dt>Pindah dana</dt><dd class="tnum">' + (state.transfers || []).length + '</dd>' +
      '<dt>Dompet</dt><dd class="tnum">' + state.wallets.length + '</dd>' +
      '<dt>Target</dt><dd class="tnum">' + state.targets.length + '</dd>' +
      '<dt>Ukuran data</dt><dd class="tnum">' + (jsonSize / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' KB</dd>' +
      '<dt>Terakhir disimpan</dt><dd>' + esc(fmtDateTime(state.meta.updatedAt)) + '</dd>' +
      '<dt>Sumber data awal</dt><dd>' + esc(state.meta.source) + '</dd>' +
      '</dl></section>';

    html += '<section class="card"><div class="card__head"><div><h2>Cadangan</h2><p>Ekspor file JSON untuk pindah perangkat atau menyimpan salinan. Impor akan mengganti seluruh data yang ada.</p></div></div>' +
      '<div class="actions"><button class="btn btn--primary" type="button" data-action="export">Ekspor data JSON</button>' +
      '<button class="btn btn--ghost" type="button" data-action="import-select">Impor dari file</button></div>' +
      '<p class="tiny muted" style="margin-top:10px">Cara pindah ke ponsel: ekspor di sini, kirim file JSON ke ponsel, buka aplikasi ini di ponsel, lalu impor file tersebut.</p></section>';

    html += '<section class="card"><div class="card__head"><div><h2>Mulai ulang</h2><p>Dua tombol ini menghapus data. Ekspor dulu kalau masih dibutuhkan.</p></div></div>' +
      '<div class="settings-grid">' +
      '<div class="setting"><div class="setting__head"><div><p class="setting__title">Kosongkan catatan</p><p class="setting__desc">Hapus semua pendapatan, pengeluaran, dan pindah dana. Dompet, saldo awal, dan target tetap ada.</p></div>' +
      '<button class="btn btn--danger btn--small" type="button" data-action="clear-entries">Kosongkan catatan</button></div></div>' +
      '<div class="setting"><div class="setting__head"><div><p class="setting__title">Muat ulang data Excel</p><p class="setting__desc">Kembali ke 48 catatan pendapatan September sampai November 2026, 7 dompet, dan 4 target dari file Excel.</p></div>' +
      '<button class="btn btn--danger btn--small" type="button" data-action="reset-seed">Muat data Excel</button></div></div>' +
      '</div></section>';

    html += '<section class="card card--flat"><div class="card__head"><div><h2>Dari mana angkanya</h2></div></div>' +
      '<ul class="rows small muted">' +
      '<li class="row"><span>Saldo = saldo awal semua dompet + seluruh pendapatan - pengeluaran yang memotong saldo.</span></li>' +
      '<li class="row"><span>Rata-rata per hari = total pendapatan dibagi jumlah hari yang punya catatan, bukan jumlah hari kalender.</span></li>' +
      '<li class="row"><span>Riwayat dari Excel semuanya pendapatan ojek yang masuk ke GoPay, jadi sudah tercatat di dompet GoPay.</span></li>' +
      '<li class="row"><span>Baris "Belum dirinci" hanya muncul kalau ada catatan yang dompetnya sengaja belum dipilih.</span></li>' +
      '<li class="row"><span>Pengeluaran dengan "Potong saldo" mati tetap muncul di riwayat dan grafik, tapi tidak mengurangi saldo tabungan.</span></li>' +
      '<li class="row"><span>Pindah dana hanya memindahkan saldo antar dompet. Total saldo tidak berubah, dan angka target tidak terpengaruh.</span></li>' +
      '</ul>' +
      '<p class="tiny muted" style="margin-top:12px">Versi ' + APP_VERSION + '. Aplikasi statis tanpa server. Data bisa hilang kalau penyimpanan browser dibersihkan.</p></section>';

    html += '</div>';
    viewEls.setelan.innerHTML = html;
  }

  /* ---------- render ---------- */

  function currentView() {
    var hash = String(window.location.hash || '').replace('#', '');
    return VIEWS.indexOf(hash) >= 0 ? hash : 'ringkasan';
  }

  function render() {
    var view = currentView();
    ui.view = view;
    VIEWS.forEach(function (name) {
      var el = viewEls[name];
      if (!el) return;
      if (name === view) {
        el.hidden = false;
        if (name === 'ringkasan') renderRingkasan();
        else if (name === 'harian') renderHarian();
        else if (name === 'pengeluaran') renderPengeluaran();
        else if (name === 'target') renderTarget();
        else if (name === 'dompet') renderDompet();
        else if (name === 'setelan') renderSetelan();
      } else {
        el.hidden = true;
        el.innerHTML = '';
      }
    });

    document.querySelectorAll('[data-tab]').forEach(function (link) {
      if (link.getAttribute('data-tab') === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = VIEW_TITLE[view] + ' · Tabungan Wedding';
    applyTheme();
  }

  /* ---------- forms ---------- */

  function setFormError(input, el, message) {
    if (!el) return false;
    if (message) {
      el.textContent = message;
      el.hidden = false;
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      }
      return true;
    }
    el.textContent = '';
    el.hidden = true;
    if (input) input.removeAttribute('aria-invalid');
    return false;
  }

  function onIncomeSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var dateEl = document.getElementById('inDate');
    var amountEl = document.getElementById('inAmount');
    var walletEl = document.getElementById('inWallet');
    var errEl = document.getElementById('inError');
    var date = dateEl.value;
    var amount = Number(digits(amountEl.value) || 0);

    if (!isValidISO(date)) return setFormError(dateEl, errEl, 'Isi tanggal dengan benar.');
    if (amount <= 0) return setFormError(amountEl, errEl, 'Nominal harus lebih dari Rp 0.');
    if (!walletEl.value) return setFormError(walletEl, errEl, 'Pilih dompet untuk pendapatan ini.');

    var entry = {
      id: uid('in'),
      date: date,
      amount: amount,
      walletId: walletEl.value,
      source: document.getElementById('inSource').value.trim().slice(0, 40),
      note: document.getElementById('inNote').value.trim().slice(0, 240)
    };
    state.incomes.push(entry);
    state.settings.lastWallet = entry.walletId;
    saveState();
    ui.incomeMonth = monthKeyOf(date);
    render();
    toast('Pendapatan ' + fmtRp(amount) + ' tersimpan.');
    var newAmount = document.getElementById('inAmount');
    if (newAmount) newAmount.focus();
  }

  function onExpenseSubmit(event) {
    event.preventDefault();
    var dateEl = document.getElementById('exDate');
    var amountEl = document.getElementById('exAmount');
    var walletEl = document.getElementById('exWallet');
    var deductEl = document.getElementById('exDeduct');
    var errEl = document.getElementById('exError');
    var date = dateEl.value;
    var amount = Number(digits(amountEl.value) || 0);
    var deduct = deductEl.checked;

    if (!isValidISO(date)) return setFormError(dateEl, errEl, 'Isi tanggal dengan benar.');
    if (amount <= 0) return setFormError(amountEl, errEl, 'Nominal harus lebih dari Rp 0.');
    if (deduct && !walletEl.value) return setFormError(walletEl, errEl, 'Pilih dompet sumber dana, atau matikan potong saldo.');

    state.expenses.push({
      id: uid('ex'),
      date: date,
      amount: amount,
      category: document.getElementById('exCategory').value,
      type: document.getElementById('exType').value,
      walletId: walletEl.value || null,
      deduct: deduct,
      note: document.getElementById('exNote').value.trim().slice(0, 240)
    });
    if (walletEl.value) state.settings.lastWallet = walletEl.value;
    saveState();
    ui.expenseMonth = monthKeyOf(date);
    render();
    toast('Pengeluaran ' + fmtRp(amount) + ' tersimpan.');
  }

  /* ---------- modal ---------- */

  function closeModal() {
    if (modal.open) modal.close();
    modal.innerHTML = '';
  }

  function openModal(html) {
    modal.innerHTML = html;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    var first = modal.querySelector('input:not([type="checkbox"]), select, textarea');
    if (first) first.focus();
  }

  function askConfirm(options) {
    return new Promise(function (resolve) {
      var resolved = false;
      function finish(value) {
        if (resolved) return;
        resolved = true;
        confirmResolver = null;
        closeModal();
        resolve(value);
      }
      confirmResolver = finish;
      openModal('<div class="modal__panel">' +
        '<div class="modal__head"><h2 id="modalTitle">' + esc(options.title) + '</h2>' +
        '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
        '<div class="modal__body">' + options.body + '</div>' +
        '<div class="form__actions actions--end"><button class="btn btn--ghost" type="button" data-close>Batal</button>' +
        '<button class="btn ' + (options.danger === false ? 'btn--primary' : 'btn--solid-danger') + '" type="button" data-confirm>' + esc(options.confirmLabel || 'Hapus') + '</button></div>' +
        '</div>');
      modal.querySelector('[data-confirm]').addEventListener('click', function () { finish(true); });
      modal.querySelector('[data-confirm]').focus();
    });
  }

  function openIncomeDialog(id) {
    var entry = state.incomes.filter(function (x) { return x.id === id; })[0];
    if (!entry) return;
    var isEdit = true;
    openModal('<form class="modal__panel" id="dialogForm" novalidate>' +
      '<div class="modal__head"><h2 id="modalTitle">Ubah pendapatan</h2>' +
      '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
      '<div class="field"><label for="dDate">Tanggal</label><input class="input" id="dDate" name="date" type="date" max="' + esc(todayISO()) + '" value="' + esc(entry.date) + '"></div>' +
      '<div class="field"><label for="dAmount">Nominal</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="dAmount" name="amount" inputmode="numeric" data-money value="' + esc(Number(entry.amount).toLocaleString('id-ID')) + '"></div></div>' +
      '<div class="field"><label for="dWallet">Dompet</label><select class="input input--select" id="dWallet" name="walletId">' + walletOptions(entry.walletId, true) + '</select>' +
      '<span class="field__hint">Pilih "Belum dirinci" hanya kalau dompetnya memang tidak diketahui.</span></div>' +
      '<div class="field"><label for="dSource">Sumber (opsional)</label><input class="input" id="dSource" name="source" list="dialogSources" value="' + esc(entry.source) + '">' +
      '<datalist id="dialogSources">' + SOURCES.map(function (s) { return '<option value="' + esc(s) + '"></option>'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="dNote">Catatan (opsional)</label><input class="input" id="dNote" name="note" value="' + esc(entry.note) + '"></div>' +
      '<div class="field__error" id="dialogError" role="alert" hidden></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">Simpan perubahan</button>' +
      '<button class="btn btn--danger" type="button" data-delete>Hapus catatan</button>' +
      '<button class="btn btn--ghost" type="button" data-close>Batal</button></div>' +
      '</form>');

    var form = document.getElementById('dialogForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var date = document.getElementById('dDate').value;
      var amount = Number(digits(document.getElementById('dAmount').value) || 0);
      var errEl = document.getElementById('dialogError');
      if (!isValidISO(date)) return setFormError(document.getElementById('dDate'), errEl, 'Isi tanggal dengan benar.');
      if (amount <= 0) return setFormError(document.getElementById('dAmount'), errEl, 'Nominal harus lebih dari Rp 0.');

      entry.date = date;
      entry.amount = amount;
      entry.walletId = document.getElementById('dWallet').value || null;
      entry.source = document.getElementById('dSource').value.trim().slice(0, 40);
      entry.note = document.getElementById('dNote').value.trim().slice(0, 240);
      if (entry.walletId) state.settings.lastWallet = entry.walletId;
      saveState();
      ui.incomeMonth = monthKeyOf(date);
      closeModal();
      render();
      toast('Catatan pendapatan diperbarui.');
    });

    form.querySelector('[data-delete]').addEventListener('click', function () {
      closeModal();
      askConfirm({
        title: 'Hapus catatan pendapatan?',
        body: '<p>' + esc(entry.note || entry.source || 'Pendapatan') + ' sebesar <strong>' + fmtRp(entry.amount) + '</strong> pada ' + esc(fmtDate(entry.date)) + ' akan dihapus. Saldo ikut berkurang.</p>',
        confirmLabel: 'Hapus pendapatan'
      }).then(function (ok) {
        if (!ok) return;
        state.incomes = state.incomes.filter(function (x) { return x.id !== entry.id; });
        saveState();
        render();
        toast('Catatan pendapatan dihapus.');
      });
    });
  }

  function openExpenseDialog(id) {
    var entry = state.expenses.filter(function (x) { return x.id === id; })[0];
    if (!entry) return;
    openModal('<form class="modal__panel" id="dialogForm" novalidate>' +
      '<div class="modal__head"><h2 id="modalTitle">Ubah pengeluaran</h2>' +
      '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
      '<div class="field"><label for="dDate">Tanggal</label><input class="input" id="dDate" type="date" max="' + esc(todayISO()) + '" value="' + esc(entry.date) + '"></div>' +
      '<div class="field"><label for="dAmount">Nominal</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="dAmount" inputmode="numeric" data-money value="' + esc(Number(entry.amount).toLocaleString('id-ID')) + '"></div></div>' +
      '<div class="form__row"><div class="field"><label for="dCategory">Kategori</label><select class="input input--select" id="dCategory">' +
      CATEGORIES.map(function (cat) { return '<option value="' + esc(cat) + '"' + (cat === entry.category ? ' selected' : '') + '>' + esc(cat) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label for="dType">Jenis</label><select class="input input--select" id="dType">' +
      '<option value="Non-Wedding"' + (entry.type === 'Non-Wedding' ? ' selected' : '') + '>Non-Wedding</option>' +
      '<option value="Wedding"' + (entry.type === 'Wedding' ? ' selected' : '') + '>Wedding</option></select></div></div>' +
      '<div class="field"><label for="dWallet">Sumber dana</label><select class="input input--select" id="dWallet">' + walletOptions(entry.walletId, true) + '</select></div>' +
      '<label class="checkbox"><input type="checkbox" id="dDeduct"' + (entry.deduct ? ' checked' : '') + '> Potong saldo tabungan</label>' +
      '<div class="field"><label for="dNote">Catatan (opsional)</label><input class="input" id="dNote" value="' + esc(entry.note) + '"></div>' +
      '<div class="field__error" id="dialogError" role="alert" hidden></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">Simpan perubahan</button>' +
      '<button class="btn btn--danger" type="button" data-delete>Hapus pengeluaran</button>' +
      '<button class="btn btn--ghost" type="button" data-close>Batal</button></div>' +
      '</form>');

    var form = document.getElementById('dialogForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var date = document.getElementById('dDate').value;
      var amount = Number(digits(document.getElementById('dAmount').value) || 0);
      var deduct = document.getElementById('dDeduct').checked;
      var walletId = document.getElementById('dWallet').value || null;
      var errEl = document.getElementById('dialogError');
      if (!isValidISO(date)) return setFormError(document.getElementById('dDate'), errEl, 'Isi tanggal dengan benar.');
      if (amount <= 0) return setFormError(document.getElementById('dAmount'), errEl, 'Nominal harus lebih dari Rp 0.');
      if (deduct && !walletId) return setFormError(document.getElementById('dWallet'), errEl, 'Pilih dompet sumber dana, atau matikan potong saldo.');

      entry.date = date;
      entry.amount = amount;
      entry.category = document.getElementById('dCategory').value;
      entry.type = document.getElementById('dType').value;
      entry.walletId = walletId;
      entry.deduct = deduct;
      entry.note = document.getElementById('dNote').value.trim().slice(0, 240);
      saveState();
      ui.expenseMonth = monthKeyOf(date);
      closeModal();
      render();
      toast('Pengeluaran diperbarui.');
    });

    form.querySelector('[data-delete]').addEventListener('click', function () {
      closeModal();
      askConfirm({
        title: 'Hapus pengeluaran?',
        body: '<p>' + esc(entry.category) + ' sebesar <strong>' + fmtRp(entry.amount) + '</strong> pada ' + esc(fmtDate(entry.date)) + ' akan dihapus. Kalau tadinya memotong saldo, saldo akan kembali.</p>',
        confirmLabel: 'Hapus pengeluaran'
      }).then(function (ok) {
        if (!ok) return;
        state.expenses = state.expenses.filter(function (x) { return x.id !== entry.id; });
        saveState();
        render();
        toast('Pengeluaran dihapus.');
      });
    });
  }

  function openTargetDialog(id) {
    var entry = id ? state.targets.filter(function (t) { return t.id === id; })[0] : null;
    openModal('<form class="modal__panel" id="dialogForm" novalidate>' +
      '<div class="modal__head"><h2 id="modalTitle">' + (entry ? 'Ubah target' : 'Tambah target') + '</h2>' +
      '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
      '<div class="field"><label for="dName">Nama target</label><input class="input" id="dName" value="' + esc(entry ? entry.name : '') + '" placeholder="Target Januari"></div>' +
      '<div class="field"><label for="dAmount">Nominal target</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="dAmount" inputmode="numeric" data-money value="' + esc(entry ? Number(entry.amount).toLocaleString('id-ID') : '') + '" placeholder="0"></div></div>' +
      '<div class="form__row"><div class="field"><label for="dDeadline">Deadline</label><input class="input" id="dDeadline" type="date" value="' + esc(entry ? entry.deadline : '') + '"></div>' +
      '<div class="field"><label for="dRounding">Pembulatan saran</label><select class="input input--select" id="dRounding">' +
      [1000, 5000, 10000, 50000].map(function (value) {
        return '<option value="' + value + '"' + ((entry ? entry.rounding : 5000) === value ? ' selected' : '') + '>Rp ' + value.toLocaleString('id-ID') + '</option>';
      }).join('') + '</select><span class="field__hint">Saran harian dibulatkan ke atas.</span></div></div>' +
      '<div class="field__error" id="dialogError" role="alert" hidden></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">' + (entry ? 'Simpan perubahan' : 'Simpan target') + '</button>' +
      '<button class="btn btn--ghost" type="button" data-close>Batal</button></div>' +
      '</form>');

    var form = document.getElementById('dialogForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = document.getElementById('dName').value.trim();
      var amount = Number(digits(document.getElementById('dAmount').value) || 0);
      var deadline = document.getElementById('dDeadline').value;
      var rounding = Number(document.getElementById('dRounding').value);
      var errEl = document.getElementById('dialogError');
      if (!name) return setFormError(document.getElementById('dName'), errEl, 'Beri nama target supaya mudah dibedakan.');
      if (amount <= 0) return setFormError(document.getElementById('dAmount'), errEl, 'Nominal target harus lebih dari Rp 0.');
      if (!isValidISO(deadline)) return setFormError(document.getElementById('dDeadline'), errEl, 'Isi deadline dengan benar.');

      if (entry) {
        entry.name = name.slice(0, 60);
        entry.amount = amount;
        entry.deadline = deadline;
        entry.rounding = rounding;
        toast('Target diperbarui.');
      } else {
        state.targets.push({ id: uid('t'), name: name.slice(0, 60), amount: amount, deadline: deadline, rounding: rounding });
        toast('Target baru disimpan.');
      }
      saveState();
      closeModal();
      render();
    });
  }

  function openWalletDialog(id) {
    var entry = id ? state.wallets.filter(function (w) { return w.id === id; })[0] : null;
    openModal('<form class="modal__panel" id="dialogForm" novalidate>' +
      '<div class="modal__head"><h2 id="modalTitle">' + (entry ? 'Ubah dompet' : 'Tambah dompet') + '</h2>' +
      '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
      '<div class="field"><label for="dName">Nama dompet</label><input class="input" id="dName" value="' + esc(entry ? entry.name : '') + '" placeholder="GoPay, Jago, uang tunai"></div>' +
      '<div class="field"><label for="dKind">Jenis dompet</label><select class="input input--select" id="dKind">' +
      KIND_ORDER.map(function (kind) {
        return '<option value="' + kind + '"' + ((entry ? entry.kind : 'tabungan') === kind ? ' selected' : '') + '>' + KIND_LABEL[kind] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="dInitial">Saldo awal di dompet ini</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="dInitial" inputmode="numeric" data-money value="' + esc(entry ? Number(entry.initial).toLocaleString('id-ID') : '0') + '"></div>' +
      '<span class="field__hint">Isi saldo saat mulai memakai aplikasi. Pendapatan sesudahnya menambah saldo ini.</span></div>' +
      '<div class="field__error" id="dialogError" role="alert" hidden></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">' + (entry ? 'Simpan perubahan' : 'Simpan dompet') + '</button>' +
      '<button class="btn btn--ghost" type="button" data-close>Batal</button></div>' +
      '</form>');

    var form = document.getElementById('dialogForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = document.getElementById('dName').value.trim();
      var kind = document.getElementById('dKind').value;
      var initial = Number(digits(document.getElementById('dInitial').value) || 0);
      var errEl = document.getElementById('dialogError');
      if (!name) return setFormError(document.getElementById('dName'), errEl, 'Beri nama dompet.');

      if (entry) {
        entry.name = name.slice(0, 60);
        entry.kind = kind;
        entry.initial = initial;
        toast('Dompet diperbarui. Saldo ikut menyesuaikan.');
      } else {
        var newId = uid('w');
        state.wallets.push({ id: newId, name: name.slice(0, 60), kind: kind, initial: initial });
        toast('Dompet baru ditambahkan.');
      }
      saveState();
      closeModal();
      render();
    });
  }

  function openTransferDialog(id) {
    var entry = id ? (state.transfers || []).filter(function (t) { return t.id === id; })[0] : null;
    var defaultFrom = entry ? entry.fromWalletId : (state.settings.lastWallet || (state.wallets[0] && state.wallets[0].id));
    var otherWallet = state.wallets.filter(function (w) { return w.id !== defaultFrom; })[0] || state.wallets[0];
    var defaultTo = entry ? entry.toWalletId : (otherWallet ? otherWallet.id : '');

    openModal('<form class="modal__panel" id="dialogForm" novalidate>' +
      '<div class="modal__head"><h2 id="modalTitle">' + (entry ? 'Ubah pindah dana' : 'Pindah dana antar dompet') + '</h2>' +
      '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
      '<div class="field"><label for="tDate">Tanggal</label><input class="input" id="tDate" type="date" max="' + esc(todayISO()) + '" value="' + esc(entry ? entry.date : todayISO()) + '"></div>' +
      '<div class="field"><label for="tAmount">Nominal yang dipindahkan</label><div class="amount-wrap"><span class="amount-wrap__prefix">Rp</span>' +
      '<input class="input input--amount tnum" id="tAmount" inputmode="numeric" data-money value="' + esc(entry ? Number(entry.amount).toLocaleString('id-ID') : '') + '" placeholder="0"></div></div>' +
      '<div class="form__row"><div class="field"><label for="tFrom">Dari dompet</label><select class="input input--select" id="tFrom">' + walletOptions(defaultFrom, false) + '</select></div>' +
      '<div class="field"><label for="tTo">Ke dompet</label><select class="input input--select" id="tTo">' + walletOptions(defaultTo, false) + '</select></div></div>' +
      '<div class="field"><label for="tNote">Catatan (opsional)</label><input class="input" id="tNote" placeholder="Misal: proteksi di Wondr" value="' + esc(entry ? entry.note : '') + '"></div>' +
      '<p class="tiny muted">Pindah dana tidak mengubah total saldo. Saldo dompet asal berkurang, dompet tujuan bertambah.</p>' +
      '<div class="field__error" id="dialogError" role="alert" hidden></div>' +
      '<div class="form__actions"><button class="btn btn--primary" type="submit">' + (entry ? 'Simpan perubahan' : 'Simpan pindah dana') + '</button>' +
      (entry ? '<button class="btn btn--danger" type="button" data-delete>Hapus pindah dana</button>' : '') +
      '<button class="btn btn--ghost" type="button" data-close>Batal</button></div>' +
      '</form>');

    var form = document.getElementById('dialogForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var dateEl = document.getElementById('tDate');
      var amountEl = document.getElementById('tAmount');
      var fromEl = document.getElementById('tFrom');
      var toEl = document.getElementById('tTo');
      var errEl = document.getElementById('dialogError');
      var date = dateEl.value;
      var amount = Number(digits(amountEl.value) || 0);
      var from = fromEl.value;
      var to = toEl.value;

      if (!isValidISO(date)) return setFormError(dateEl, errEl, 'Isi tanggal dengan benar.');
      if (amount <= 0) return setFormError(amountEl, errEl, 'Nominal harus lebih dari Rp 0.');
      if (!from || !to) return setFormError(toEl, errEl, 'Pilih dompet asal dan dompet tujuan.');
      if (from === to) return setFormError(toEl, errEl, 'Dompet asal dan tujuan harus berbeda.');

      var c = compute();
      var source = c.wallets.filter(function (w) { return w.id === from; })[0];
      var available = (source ? source.balance : 0) + (entry && entry.fromWalletId === from ? entry.amount : 0);
      if (amount > available) {
        return setFormError(amountEl, errEl, 'Saldo ' + (source ? source.name : 'dompet ini') + ' sekarang ' + fmtRp(available) + '. Pindahkan jumlah yang lebih kecil, atau catat pendapatannya dulu.');
      }

      var fromName = c.walletName[from] || 'dompet asal';
      var toName = c.walletName[to] || 'dompet tujuan';
      if (entry) {
        entry.date = date;
        entry.amount = amount;
        entry.fromWalletId = from;
        entry.toWalletId = to;
        entry.note = document.getElementById('tNote').value.trim().slice(0, 240);
        toast('Pindah dana diperbarui.');
      } else {
        state.transfers.push({
          id: uid('tf'),
          date: date,
          amount: amount,
          fromWalletId: from,
          toWalletId: to,
          note: document.getElementById('tNote').value.trim().slice(0, 240)
        });
        toast('Pindah dana ' + fmtRp(amount) + ' dari ' + fromName + ' ke ' + toName + ' tersimpan.');
      }
      saveState();
      closeModal();
      render();
    });

    if (entry) {
      form.querySelector('[data-delete]').addEventListener('click', function () {
        var fromName = state.wallets.filter(function (w) { return w.id === entry.fromWalletId; }).map(function (w) { return w.name; })[0] || 'dompet asal';
        var toName = state.wallets.filter(function (w) { return w.id === entry.toWalletId; }).map(function (w) { return w.name; })[0] || 'dompet tujuan';
        closeModal();
        askConfirm({
          title: 'Hapus pindah dana?',
          body: '<p>Pindah dana <strong>' + fmtRp(entry.amount) + '</strong> dari ' + esc(fromName) + ' ke ' + esc(toName) + ' pada ' + esc(fmtDate(entry.date)) + ' akan dihapus. Saldo dompet kembali seperti sebelum perpindahan.</p>',
          confirmLabel: 'Hapus pindah dana'
        }).then(function (ok) {
          if (!ok) return;
          state.transfers = state.transfers.filter(function (t) { return t.id !== entry.id; });
          saveState();
          render();
          toast('Pindah dana dihapus.');
        });
      });
    }
  }

  function deleteWallet(id) {
    var wallet = state.wallets.filter(function (w) { return w.id === id; })[0];
    if (!wallet) return;
    var usedIncomes = state.incomes.filter(function (x) { return x.walletId === id; }).length;
    var usedExpenses = state.expenses.filter(function (x) { return x.walletId === id; }).length;
    var usedTransfers = (state.transfers || []).filter(function (x) { return x.fromWalletId === id || x.toWalletId === id; }).length;

    if (state.wallets.length <= 1) {
      openModal('<div class="modal__panel">' +
        '<div class="modal__head"><h2 id="modalTitle">Dompet terakhir tidak bisa dihapus</h2>' +
        '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
        '<div class="modal__body"><p>Aplikasi butuh minimal satu dompet untuk mencatat pendapatan. Tambah dompet lain dulu, lalu hapus yang ini.</p></div>' +
        '<div class="form__actions actions--end"><button class="btn btn--ghost" type="button" data-close>Tutup</button></div></div>');
      return;
    }

    if (usedIncomes > 0 || usedExpenses > 0 || usedTransfers > 0) {
      openModal('<div class="modal__panel">' +
        '<div class="modal__head"><h2 id="modalTitle">Dompet ' + esc(wallet.name) + ' masih dipakai</h2>' +
        '<button class="modal__close" type="button" data-close aria-label="Tutup">×</button></div>' +
        '<div class="modal__body"><p>Ada <strong>' + usedIncomes + ' catatan pendapatan</strong>, <strong>' + usedExpenses + ' catatan pengeluaran</strong>, dan <strong>' + usedTransfers + ' pindah dana</strong> yang memakai dompet ini.</p>' +
        '<p>Pindahkan catatan itu ke dompet lain lewat tombol Ubah, lalu hapus dompet ini. Cara ini menjaga saldo tiap dompet tetap cocok dengan total.</p></div>' +
        '<div class="form__actions actions--end"><button class="btn btn--ghost" type="button" data-close>Tutup</button></div></div>');
      return;
    }

    askConfirm({
      title: 'Hapus dompet ' + wallet.name + '?',
      body: '<p>Dompet ini tidak punya catatan. Saldo awalnya sebesar <strong>' + fmtRp(wallet.initial) + '</strong> akan keluar dari total saldo karena dompetnya dihapus.</p>',
      confirmLabel: 'Hapus dompet'
    }).then(function (ok) {
      if (!ok) return;
      state.wallets = state.wallets.filter(function (w) { return w.id !== id; });
      if (state.settings.lastWallet === id) state.settings.lastWallet = state.wallets.length ? state.wallets[0].id : null;
      saveState();
      render();
      toast('Dompet dihapus.');
    });
  }

  /* ---------- export / import ---------- */

  function exportData() {
    var data = JSON.stringify(state, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'tabungan-wedding-' + todayISO() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('File cadangan diunduh.');
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(String(reader.result));
        var next = normalizeState(raw);
        askConfirm({
          title: 'Ganti seluruh data?',
          body: '<p>File berisi <strong>' + next.incomes.length + '</strong> pendapatan, <strong>' + next.expenses.length + '</strong> pengeluaran, <strong>' + next.transfers.length + '</strong> pindah dana, <strong>' + next.wallets.length + '</strong> dompet, dan <strong>' + next.targets.length + '</strong> target.</p>' +
            '<p>Data yang sekarang akan diganti. Ekspor dulu kalau belum yakin.</p>',
          confirmLabel: 'Impor dan ganti',
          danger: false
        }).then(function (ok) {
          if (!ok) return;
          var theme = state.settings.theme;
          state = next;
          if (next.settings.theme === 'system' && theme) state.settings.theme = theme;
          migrateLegacyWallets();
          saveState();
          ui.incomeMonth = null;
          ui.expenseMonth = null;
          render();
          toast('Data dari file berhasil dimuat.');
        });
      } catch (err) {
        var reason = err && err.message ? err.message : 'format tidak dikenal';
        if (!/[.!?]$/.test(reason)) reason += '.';
        toast('File tidak bisa dibaca: ' + reason);
      }
    };
    reader.onerror = function () { toast('File gagal dibaca. Coba pilih ulang.'); };
    reader.readAsText(file);
  }

  /* ---------- events ---------- */

  document.addEventListener('click', function (event) {
    var actionEl = event.target.closest('[data-action]');
    var closeEl = event.target.closest('[data-close]');

    if (closeEl) {
      if (confirmResolver) confirmResolver(false);
      else closeModal();
      return;
    }

    if (!actionEl) return;
    var action = actionEl.getAttribute('data-action');

    if (action === 'quick-amount') {
      var target = document.getElementById(actionEl.getAttribute('data-target'));
      if (!target) return;
      var add = Number(actionEl.getAttribute('data-amount')) || 0;
      var current = Number(digits(target.value) || 0);
      target.value = (current + add).toLocaleString('id-ID');
      target.removeAttribute('aria-invalid');
      target.focus();
      return;
    }

    if (action === 'focus-income') {
      var amountInput = document.getElementById('inAmount');
      if (amountInput) amountInput.focus();
      return;
    }
    if (action === 'go-income') {
      if (window.location.hash !== '#harian') window.location.hash = '#harian';
      window.setTimeout(function () {
        var target = document.getElementById('inAmount');
        if (target) target.focus();
      }, 90);
      return;
    }
    if (action === 'focus-expense') {
      var exAmount = document.getElementById('exAmount');
      if (exAmount) exAmount.focus();
      return;
    }

    if (action === 'edit-income') openIncomeDialog(actionEl.getAttribute('data-id'));
    else if (action === 'edit-expense') openExpenseDialog(actionEl.getAttribute('data-id'));
    else if (action === 'add-target') openTargetDialog(null);
    else if (action === 'edit-target') openTargetDialog(actionEl.getAttribute('data-id'));
    else if (action === 'delete-target') {
      var targetId = actionEl.getAttribute('data-id');
      var target = state.targets.filter(function (t) { return t.id === targetId; })[0];
      if (!target) return;
      askConfirm({
        title: 'Hapus target ' + target.name + '?',
        body: '<p>Target <strong>' + fmtRp(target.amount) + '</strong> sampai ' + esc(fmtDate(target.deadline)) + ' akan dihapus. Catatan pendapatan tidak terpengaruh.</p>',
        confirmLabel: 'Hapus target'
      }).then(function (ok) {
        if (!ok) return;
        state.targets = state.targets.filter(function (t) { return t.id !== targetId; });
        saveState();
        render();
        toast('Target dihapus.');
      });
    }
    else if (action === 'add-wallet') openWalletDialog(null);
    else if (action === 'edit-wallet') openWalletDialog(actionEl.getAttribute('data-id'));
    else if (action === 'delete-wallet') deleteWallet(actionEl.getAttribute('data-id'));
    else if (action === 'add-transfer') openTransferDialog(null);
    else if (action === 'edit-transfer') openTransferDialog(actionEl.getAttribute('data-id'));
    else if (action === 'export') exportData();
    else if (action === 'import-select') importFile.click();
    else if (action === 'set-theme') {
      var value = actionEl.getAttribute('data-value');
      state.settings.theme = value;
      saveState();
      applyTheme();
      render();
      toast(value === 'system' ? 'Tema mengikuti pengaturan sistem.' : ('Tema ' + (value === 'dark' ? 'gelap' : 'terang') + ' aktif.'));
    }
    else if (action === 'clear-entries') {
      askConfirm({
        title: 'Kosongkan semua catatan?',
        body: '<p><strong>' + state.incomes.length + ' pendapatan</strong>, <strong>' + state.expenses.length + ' pengeluaran</strong>, dan <strong>' + (state.transfers || []).length + ' pindah dana</strong> akan dihapus. Saldo kembali ke total saldo awal dompet.</p><p>Dompet dan target tetap tersimpan.</p>',
        confirmLabel: 'Kosongkan catatan'
      }).then(function (ok) {
        if (!ok) return;
        state.incomes = [];
        state.expenses = [];
        state.transfers = [];
        saveState();
        render();
        toast('Semua catatan dikosongkan.');
      });
    }
    else if (action === 'reset-seed') {
      askConfirm({
        title: 'Muat ulang data Excel?',
        body: '<p>Data sekarang diganti dengan 48 catatan pendapatan, 7 dompet, dan 4 target dari file Excel. Saldo akhir kembali <strong>Rp 25.397.000</strong>.</p>',
        confirmLabel: 'Muat data Excel'
      }).then(function (ok) {
        if (!ok) return;
        state = freshSeed();
        saveState();
        ui.incomeMonth = null;
        ui.expenseMonth = null;
        render();
        toast('Data Excel dimuat ulang.');
      });
    }
  });

  document.addEventListener('input', function (event) {
    var input = event.target;
    if (!input || !input.matches || !input.matches('[data-money]')) return;
    var raw = digits(input.value);
    input.value = raw ? Number(raw).toLocaleString('id-ID') : '';
  });

  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = isDarkNow() ? 'light' : 'dark';
      state.settings.theme = next;
      saveState();
      applyTheme();
      if (ui.view === 'setelan') render();
    });
  }

  if (importFile) {
    importFile.addEventListener('change', function () {
      if (importFile.files && importFile.files[0]) importData(importFile.files[0]);
      importFile.value = '';
    });
  }

  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        if (confirmResolver) confirmResolver(false);
        else closeModal();
      }
    });
    modal.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !modal.open) return;
      var focusables = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
    modal.addEventListener('cancel', function (event) {
      if (confirmResolver) {
        event.preventDefault();
        confirmResolver(false);
      }
    });
  }

  window.addEventListener('hashchange', function () {
    render();
    window.scrollTo(0, 0);
  });

  /* ---------- boot ---------- */

  state = loadState();
  var movedLegacy = migrateLegacyWallets();
  saveState();
  render();
  if (movedLegacy) toast('Pendapatan lama dipindahkan ke dompet GoPay.');
})();
