(function () {
'use strict';

/* ---------- الإعدادات والبيانات ---------- */
var KEY = {exp:'moto-expenses-v1', km:'moto-km-v1', hid:'moto-hidden-v1', theme:'moto-theme-v1', bg:'moto-bg-v1', ppl:'moto-fuelprice-v1'};
var CATS = [['بنزين','⛽'],['صيانة','🔧'],['كاوتش','🛞'],['زيت','🛢️'],['قطع غيار','⚙️'],['غسيل','🧼'],['ترخيص / تأمين','📄'],['أخرى','📦']];
var NAMES = CATS.map(function (c) { return c[0]; });
var PERIOD = {w:'هذا الأسبوع', m:'هذا الشهر', a:'كل المصاريف'};

function $(id) { return document.getElementById(id); }
function read(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function readRaw(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function writeRaw(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); return true; } catch (e) { return false; } }

/* المركبات: كل مركبة ليها بياناتها لوحدها. المركبة الأولى بتستخدم المفاتيح القديمة عشان بياناتك ما تضيعش */
var BASE = {exp: KEY.exp, km: KEY.km, hid: KEY.hid, ppl: KEY.ppl};
var VKEY = 'moto-vehicles-v1', VCUR = 'moto-vcur-v1';
var vehicles = read(VKEY, null);
if (!Array.isArray(vehicles) || !vehicles.length) vehicles = [{id: 'v1', name: 'الموتوسيكل', icon: '🏍️'}];
var vid = readRaw(VCUR, vehicles[0].id);
if (!vehicles.some(function (v) { return v.id === vid; })) vid = vehicles[0].id;
var exp = [], km = [], hid = [], ppl = 0, tripsCache = null;
function curV() { return vehicles.filter(function (v) { return v.id === vid; })[0]; }
function loadVehicle() {
  ['exp', 'km', 'hid', 'ppl'].forEach(function (k) { KEY[k] = vid === 'v1' ? BASE[k] : BASE[k] + '-' + vid; });
  exp = read(KEY.exp, []); km = read(KEY.km, []); hid = read(KEY.hid, []);
  if (!Array.isArray(exp)) exp = [];
  if (!Array.isArray(km)) km = [];
  if (!Array.isArray(hid)) hid = [];
  exp.forEach(function (x) { if (NAMES.indexOf(x.cat) < 0) x.cat = 'أخرى'; });
  ppl = parseFloat(readRaw(KEY.ppl, '')) || 0; /* آخر سعر لتر بنزين */
  tripsCache = null;
}

var theme = readRaw(KEY.theme, 'auto'), bg = readRaw(KEY.bg, '');
var per = 'w', cur = null, editing = false;
loadVehicle();

/* ---------- أدوات مساعدة ---------- */
var ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function fmt(n) { return Math.round(n * 100) / 100; }
function ymd(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }
function today() { return ymd(new Date()); }

/* حدود الفترة كنصوص YYYY-MM-DD (مقارنة أسرع من كائنات Date). الأسبوع يبدأ السبت */
function range() {
  if (per === 'a') return null;
  var n = new Date(); n.setHours(0, 0, 0, 0);
  if (per === 'm') return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(new Date(n.getFullYear(), n.getMonth() + 1, 1))];
  var s = new Date(n); s.setDate(n.getDate() - ((n.getDay() + 1) % 7));
  var e = new Date(s); e.setDate(s.getDate() + 7);
  return [ymd(s), ymd(e)];
}
function inR(r, d) { return !r || (d >= r[0] && d < r[1]); }

/* المسافة = الفرق بين كل قراءة عداد والتي قبلها (مخزّنة مؤقتاً لحد ما تتغير البيانات) */
function trips() {
  if (tripsCache) return tripsCache;
  var s = km.map(function (x) { return {id:x.id, odo:x.odo, date:x.date, trip:0}; })
            .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  for (var i = 1; i < s.length; i++) s[i].trip = Math.max(0, s[i].odo - s[i - 1].odo);
  return (tripsCache = s);
}
function kmIn(r) { return trips().reduce(function (t, x) { return inR(r, x.date) ? t + x.trip : t; }, 0); }

/* ---------- العرض ---------- */
function card(id, icon, name, amount, sub, wide) {
  var h = hid.indexOf(id) >= 0, cls = 'card' + (wide ? ' wide' : '');
  if (editing) {
    return '<label class="' + cls + '"' + (h ? ' style="opacity:.5"' : '') + '><span class="e">' + icon + '</span><span class="nm">' + esc(name) +
      '</span><small><input type="checkbox" data-c="tog" data-v="' + esc(id) + '"' + (h ? '' : ' checked') + '> ظاهر في الرئيسية</small></label>';
  }
  if (h) return '';
  return '<button class="' + cls + '" data-a="open" data-v="' + esc(id) + '"><span class="e">' + icon + '</span><span class="nm">' + esc(name) +
    '</span><span class="am">' + amount + '</span><small>' + sub + '</small></button>';
}

function renderHome() {
  var r = range(), tot = 0, sums = {}, cnt = {}, lit = {};
  exp.forEach(function (x) {
    if (!inR(r, x.date)) return;
    tot += x.amt; sums[x.cat] = (sums[x.cat] || 0) + x.amt; cnt[x.cat] = (cnt[x.cat] || 0) + 1;
    if (x.l) lit[x.cat] = (lit[x.cat] || 0) + x.l;
  });
  var k = kmIn(r);
  $('plabel').textContent = 'إجمالي ' + PERIOD[per] + ' • ' + curV().name;
  $('sum').textContent = fmt(tot) + ' جنيه';
  $('cpk').textContent = k > 0 ? 'تكلفة الكيلو: ' + fmt(tot / k) + ' جنيه • المسافة: ' + fmt(k) + ' كم' : '';
  var html = card('km', '🛣️', 'المسافة', fmt(k) + ' كم', 'سجّل قراءة العداد وهنحسب المسافة', true);
  CATS.forEach(function (c) { html += card(c[0], c[1], c[0], fmt(sums[c[0]] || 0) + ' جنيه', (cnt[c[0]] || 0) + ' عملية' + (lit[c[0]] ? ' • ' + fmt(lit[c[0]]) + ' لتر' : '') + (c[0] === 'بنزين' && lit[c[0]] > 0 && k > 0 ? ' • ' + fmt(k / lit[c[0]]) + ' كم/لتر' : '')); });
  if (editing) html += '<small class="note">الإخفاء بيشيل الكارت من الرئيسية بس، والبيانات محفوظة.</small>';
  $('vbar').innerHTML = vehicles.map(function (v) {
    return '<button class="chip' + (v.id === vid ? ' on' : '') + '" data-a="vsel" data-v="' + esc(v.id) + '">' + v.icon + ' ' + esc(v.name) + '</button>';
  }).join('') + '<button class="chip" data-a="vplus">＋ مركبة</button>';
  $('grid').innerHTML = html;
  ['w', 'm', 'a'].forEach(function (p) { $('t' + p).classList.toggle('on', p === per); });
}

function item(act, id, date, sub, amt) {
  return '<div class="item"><div>' + esc(date) + '<small>' + sub + '</small></div><div>' +
    (amt ? '<span class="amt">' + amt + '</span>' : '') +
    '<button data-a="' + act + '" data-id="' + id + '" aria-label="حذف">✕</button></div></div>';
}

function renderDetail() {
  var r = range(), isKm = cur === 'km', html = '', total = 0, litP = 0;
  $('dtitle').textContent = (isKm ? '🛣️ المسافة' : CATS[NAMES.indexOf(cur)][1] + ' ' + cur) + ' • ' + curV().name;
  $('amt').placeholder = isKm ? 'قراءة العداد الحالية (كم)' : 'المبلغ';
  $('note').hidden = isKm;
  var isFuel = cur === 'بنزين';
  $('fuel').hidden = !isFuel;
  if (isFuel) $('ppl').value = ppl || '';
  if (isKm) {
    var t = trips();
    total = kmIn(r);
    for (var i = t.length - 1; i >= 0; i--) {
      html += item('delkm', t[i].id, t[i].date, 'قراءة العداد: ' + fmt(t[i].odo) + ' كم' + (t[i].trip ? ' • مشيت ' + fmt(t[i].trip) + ' كم' : ' • قراءة البداية'), '');
    }
    if (!html) html = '<div class="empty">اكتب أول قراءة للعداد</div>';
  } else {
    var rows = exp.filter(function (x) { return x.cat === cur; })
                  .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; });
    rows.forEach(function (x) {
      if (inR(r, x.date)) { total += x.amt; litP += x.l || 0; }
      var parts = [];
      if (x.l) parts.push(fmt(x.l) + ' لتر × ' + fmt(x.p) + ' جنيه');
      if (x.note) parts.push(esc(x.note));
      html += item('del', x.id, x.date, parts.join(' • '), fmt(x.amt) + ' جنيه');
    });
    if (!html) html = '<div class="empty">لا توجد مصاريف لـ' + esc(cur) + ' لسه</div>';
  }
  var lbl = (isKm ? 'المسافة ' : 'إجمالي ') + PERIOD[per], kk = isFuel ? kmIn(r) : 0;
  if (isFuel && litP > 0 && kk > 0) lbl += ' • ' + fmt(litP) + ' لتر • ' + fmt(kk / litP) + ' كم/لتر (' + fmt(litP / kk * 100) + ' لتر/100كم)';
  $('dlabel').textContent = lbl;
  $('dsum').textContent = fmt(total) + (isKm ? ' كم' : ' جنيه');
  $('list').innerHTML = html;
}

function render() { if (cur) renderDetail(); else renderHome(); }

function show(c, pop) {
  if (c && !pop) { try { history.pushState({c: c}, ''); } catch (e) {} }
  cur = c;
  $('home').hidden = !!c;
  $('detail').hidden = !c;
  if (c) $('dt').value = today();
  render();
  window.scrollTo(0, 0);
}

function toggleEdit() {
  editing = !editing;
  $('opts').hidden = !editing;
  if (editing) $('vname').value = curV().name;
  $('editbtn').textContent = editing ? 'تم ✓' : '⚙️ تعديل';
  renderHome();
}

/* ---------- إدارة المركبات ---------- */
function saveVehicles() { write(VKEY, vehicles); writeRaw(VCUR, vid); }
function switchV(id) {
  vid = id; loadVehicle(); saveVehicles();
  $('vname').value = curV().name;
  render();
}
function addV() {
  var t = $('vtype'), name = $('vnew').value.trim() || t.options[t.selectedIndex].text.replace(/^\S+\s*/, '');
  vehicles.push({id: 'v' + Date.now().toString(36), name: name, icon: t.value});
  $('vnew').value = '';
  switchV(vehicles[vehicles.length - 1].id);
}
function renameV() {
  var n = $('vname').value.trim();
  if (!n) return;
  curV().name = n; saveVehicles(); render();
}
function delV() {
  if (vehicles.length < 2) { alert('لازم تفضل مركبة واحدة على الأقل'); return; }
  if (!confirm('هتتحذف "' + curV().name + '" وكل بياناتها. متأكد؟')) return;
  ['exp', 'km', 'hid', 'ppl'].forEach(function (k) { writeRaw(KEY[k], ''); });
  vehicles = vehicles.filter(function (v) { return v.id !== vid; });
  switchV(vehicles[0].id);
}

/* ---------- الشكل: وضع نهاري/ليلي وخلفية ---------- */
function applyLook() {
  var r = document.documentElement;
  if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
  $('bg').style.backgroundImage = bg ? 'url("' + bg + '")' : 'none';
  document.body.classList.toggle('hasbg', !!bg);
  ['auto', 'light', 'dark'].forEach(function (k) { $('th-' + k).classList.toggle('on', k === theme); });
}
function setTheme(t) { theme = t; writeRaw(KEY.theme, t); applyLook(); }
function setBg(d) {
  bg = d;
  if (!writeRaw(KEY.bg, d) && d) alert('تعذّر حفظ الصورة، جرّب صورة تانية');
  applyLook();
}
function pickBg(inp) {
  var f = inp.files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var im = new Image();
    im.onload = function () {
      var s = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      setBg(c.toDataURL('image/jpeg', 0.75));
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
  inp.value = '';
}

/* ---------- الأحداث (مستمع واحد لكل نوع بدل onclick في كل عنصر) ---------- */
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-a]');
  if (!t) return;
  var a = t.dataset.a, v = t.dataset.v, id = +t.dataset.id;
  if (a === 'per') { per = v; render(); }
  else if (a === 'open') show(v);
  else if (a === 'back') { if (history.state && history.state.c) history.back(); else show(null, true); }
  else if (a === 'edit') toggleEdit();
  else if (a === 'reload') location.reload();
  else if (a === 'vsel') switchV(v);
  else if (a === 'vplus') { if (!editing) toggleEdit(); $('opts').scrollIntoView(); $('vnew').focus(); }
  else if (a === 'vadd') addV();
  else if (a === 'vrename') renameV();
  else if (a === 'vdel') delV();
  else if (a === 'theme') setTheme(v);
  else if (a === 'clearbg') setBg('');
  else if (a === 'del') { exp = exp.filter(function (x) { return x.id !== id; }); write(KEY.exp, exp); render(); }
  else if (a === 'delkm') { km = km.filter(function (x) { return x.id !== id; }); tripsCache = null; write(KEY.km, km); render(); }
});

document.addEventListener('change', function (e) {
  var t = e.target, c = t.dataset.c;
  if (c === 'tog') {
    var i = hid.indexOf(t.dataset.v);
    if (i < 0) hid.push(t.dataset.v); else hid.splice(i, 1);
    write(KEY.hid, hid);
    renderHome();
  } else if (c === 'bg') pickBg(t);
});

$('form').addEventListener('submit', function (e) {
  e.preventDefault();
  var a = parseFloat($('amt').value);
  if (!(a > 0)) return;
  var d = $('dt').value || today();
  if (cur === 'km') {
    km.push({id: Date.now(), odo: a, date: d}); tripsCache = null; write(KEY.km, km);
  } else {
    var en = {id: Date.now(), cat: cur, amt: a, date: d, note: $('note').value.trim()};
    if (cur === 'بنزين') {
      var l = parseFloat($('ltr').value), p = parseFloat($('ppl').value);
      if (l > 0) en.l = l;
      if (p > 0) en.p = p;
    }
    exp.push(en); write(KEY.exp, exp);
    $('note').value = '';
  }
  $('amt').value = ''; $('ltr').value = '';
  render();
});

/* البنزين: المبلغ = السعر × اللترات، وتقدر تكتب المبلغ فيتحسب اللترات. وتغيير السعر بيتحفظ للمرة الجاية */
$('form').addEventListener('input', function (e) {
  if (cur !== 'بنزين') return;
  var id = e.target.id, p = parseFloat($('ppl').value), l = parseFloat($('ltr').value), a = parseFloat($('amt').value);
  if (id === 'ppl') {
    ppl = p > 0 ? p : 0; writeRaw(KEY.ppl, ppl ? String(ppl) : '');
    if (l > 0 && p > 0) $('amt').value = fmt(l * p);
  } else if (id === 'ltr') {
    if (l > 0 && p > 0) $('amt').value = fmt(l * p);
  } else if (id === 'amt') {
    if (a > 0 && p > 0) $('ltr').value = fmt(a / p);
  }
});

/* زرار الرجوع في الموبايل بيرجّع للرئيسية */
window.addEventListener('popstate', function (e) { show(e.state && e.state.c ? e.state.c : null, true); });

/* ---------- تشغيل ---------- */
applyLook();
render();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  var hadSW = !!navigator.serviceWorker.controller;
  /* لما تتنزل نسخة جديدة وتتفعّل، نظهر شريط التحديث */
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadSW) $('upd').hidden = false; });
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
})();
