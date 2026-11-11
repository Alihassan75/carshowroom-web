* The Lot: Supabase adapter
 *
 * The dashboard was written against a small runtime (window.claude.use(...)) with five parts:
 * user, db, downloads, assets and sample. This file provides the same five parts on top of
 * Supabase, so the dashboard code does not change:
 *   user       -> Supabase Auth + the profiles table (roles)
 *   db         -> the showroom_docs and activity tables, with realtime updates
 *   downloads  -> a normal browser file download
 *   assets     -> Supabase Storage bucket "car-photos"
 *   sample     -> the "ask-ai" Edge Function (Claude, with your key kept on the server)
 */
(function () {
  var cfg = window.LOT_CONFIG || {};
  var ADMIN = ['owner', 'admin'];

  function fatal(msg) {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:24px;font:16px/1.5 system-ui;max-width:560px;margin:40px auto;border:2px solid #B3261E;border-radius:10px">' + msg + '</div>');
    });
  }
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR-/.test(cfg.SUPABASE_URL)) {
    fatal('Open <b>web/config.js</b> and paste your Supabase project URL and anon key, then reload.');
    window.claude = { use: function () { return new Promise(function () {}); } };
    return;
  }
  if (!window.supabase) { fatal('The Supabase library did not load. Check your internet connection.'); return; }

  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  window.lotSupabase = sb;
  var profile = null;

  /* ---------- login screen ---------- */
  var LANG_UR = false;
  try { LANG_UR = localStorage.getItem('lot-lang') === 'ur'; } catch (e) {}
  var LT = {
    'Welcome back': 'خوش آمدید', 'Sign in to your showroom': 'اپنے شوروم میں لاگ اِن کریں',
    'Email': 'ای میل', 'Password': 'پاس ورڈ', 'Sign in': 'لاگ اِن', 'Signing in…': 'لاگ اِن ہو رہا ہے…',
    'Wrong email or password.': 'ای میل یا پاس ورڈ غلط ہے۔',
    'Could not sign in. Check your connection and try again.': 'لاگ اِن نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    'Show': 'دکھائیں', 'Hide': 'چھپائیں',
    'Forgot your password? Ask the owner to reset it.': 'پاس ورڈ بھول گئے؟ مالک سے ری سیٹ کروائیں۔',
    'Your whole showroom, in one place.': 'آپ کا پورا شوروم، ایک جگہ۔',
    'Cars bought, sold and rented': 'گاڑیوں کی خرید، فروخت اور کرایہ',
    'Invoices, installments and customers': 'انوائسز، اقساط اور گاہک',
    'Staff, attendance and payroll': 'عملہ، حاضری اور تنخواہیں',
    'Profit you can trust': 'قابلِ بھروسا منافع'
  };
  function t(s) { return LANG_UR && LT[s] ? LT[s] : s; }
  if (LANG_UR) { document.documentElement.dir = 'rtl'; document.documentElement.lang = 'ur'; }

  var LOGIN_CSS =
    '.lt-wrap{position:fixed;inset:0;z-index:99;display:grid;grid-template-columns:1.05fr 1fr;background:#14181C;font:15px/1.5 "Hanken Grotesk","Noto Naskh Arabic",system-ui,sans-serif;color:#1D2227;overflow:auto;transition:opacity .35s}' +
    '.lt-wrap.lt-out{opacity:0}.lt-wrap *,.lt-wrap *:before,.lt-wrap *:after{box-sizing:border-box}' +
    '.lt-brand{position:relative;overflow:hidden;color:#fff;display:flex;align-items:center;padding:56px;background:radial-gradient(900px 520px at 12% 8%,rgba(14,107,107,.6),transparent 60%),radial-gradient(700px 440px at 92% 96%,rgba(233,184,23,.22),transparent 60%),linear-gradient(160deg,#1D2227,#101316)}' +
    '.lt-road{position:absolute;left:-15%;width:130%;height:110px;bottom:14%;background:rgba(255,255,255,.05);transform:rotate(-8deg)}' +
    '.lt-lane{position:absolute;left:-15%;width:130%;height:5px;transform:rotate(-8deg);background:repeating-linear-gradient(90deg,#E9B817 0 46px,transparent 46px 92px);opacity:.85;animation:lt-slide 4s linear infinite}' +
    '.lt-lane.a{bottom:calc(14% + 54px)}.lt-lane.b{bottom:14%;opacity:.35;animation-duration:7s}.lt-lane.c{bottom:calc(14% + 110px);opacity:.35;animation-duration:7s}' +
    '@keyframes lt-slide{to{background-position:92px 0}}' +
    '.lt-in{position:relative;max-width:460px}' +
    '.lt-plate{display:inline-block;background:#fff;color:#1D2227;border:3px solid #1D2227;border-radius:8px;padding:2px 14px;font:800 17px "Big Shoulders Display","Arial Narrow",sans-serif;letter-spacing:.14em;box-shadow:0 0 0 3px #fff,0 8px 20px rgba(0,0,0,.35)}' +
    '.lt-logo{margin:22px 0 10px;font:800 84px/.9 "Big Shoulders Display","Noto Naskh Arabic","Arial Narrow",sans-serif}' +
    '.lt-logo:after{content:"";display:block;width:84px;height:6px;border-radius:3px;background:#E9B817;margin-top:16px}' +
    '.lt-tag{font-size:19px;color:#D7DCDF;margin:18px 0 22px}' +
    '.lt-feats{list-style:none;margin:0;padding:0;display:grid;gap:12px}' +
    '.lt-feats li{display:flex;align-items:center;gap:12px;color:#E9ECEE}' +
    '.lt-feats li:before{content:"";flex:none;width:22px;height:22px;border-radius:50%;background:#E9B817 url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M6 12.5l4 4 8-9%27 fill=%27none%27 stroke=%27%231D2227%27 stroke-width=%273.2%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") center/16px no-repeat}' +
    '.lt-form{position:relative;display:flex;align-items:center;justify-content:center;padding:32px;background:#F4F5F2}' +
    '.lt-lang{position:absolute;top:18px;right:18px;border:1.5px solid #C5C9C3;background:transparent;color:#1D2227;border-radius:99px;padding:5px 14px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer}' +
    '.lt-lang:hover{background:#1D2227;color:#fff}' +
    '.lt-card{width:min(400px,100%);animation:lt-rise .6s cubic-bezier(.2,.8,.2,1) both}' +
    '@keyframes lt-rise{from{opacity:0;transform:translateY(14px)}}' +
    '.lt-card h2{margin:0;font:800 46px/1 "Big Shoulders Display","Noto Naskh Arabic","Arial Narrow",sans-serif}' +
    '.lt-sub{margin:6px 0 26px;color:#667078}' +
    '.lt-field{display:block;margin-bottom:16px}' +
    '.lt-field>span{display:block;font-size:13px;font-weight:600;color:#4B535A;margin-bottom:6px}' +
    '.lt-box{position:relative}' +
    '.lt-box svg{position:absolute;top:50%;left:14px;width:19px;height:19px;transform:translateY(-50%);color:#8A939A;pointer-events:none}' +
    '.lt-box input{width:100%;padding:13px 14px 13px 44px;font:inherit;color:#1D2227;background:#fff;border:1.5px solid #C5C9C3;border-radius:10px;transition:border-color .15s,box-shadow .15s}' +
    '.lt-box input:focus{outline:none;border-color:#E9B817;box-shadow:0 0 0 4px rgba(233,184,23,.28)}' +
    '.lt-box input.pw{padding-right:74px}' +
    '.lt-eye{position:absolute;top:50%;right:8px;transform:translateY(-50%);border:0;background:transparent;color:#4B535A;font-weight:600;font-size:13px;font-family:inherit;padding:6px 10px;border-radius:6px;cursor:pointer}' +
    '.lt-eye:hover{background:#ECEEEA}' +
    '.lt-err{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#FBE9E7;color:#8C1D18;font-size:14px;border:1px solid #F1B9B4}' +
    '.lt-err.shake{animation:lt-shake .35s}' +
    '@keyframes lt-shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}' +
    '.lt-btn{width:100%;display:flex;justify-content:center;align-items:center;gap:10px;padding:14px;border:0;border-radius:10px;background:#1D2227;color:#fff;font-weight:700;font-size:16px;font-family:inherit;cursor:pointer;transition:background .15s,color .15s,transform .1s}' +
    '.lt-btn:hover{background:#E9B817;color:#1D2227}.lt-btn:active{transform:scale(.99)}' +
    '.lt-btn:disabled{opacity:.75;cursor:default;background:#1D2227;color:#fff}' +
    '.lt-btn.busy:before{content:"";width:16px;height:16px;border:2.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:lt-spin .7s linear infinite}' +
    '@keyframes lt-spin{to{transform:rotate(360deg)}}' +
    '.lt-note{margin:20px 0 0;text-align:center;font-size:13px;color:#667078}' +
    '.lt-btn:focus-visible,.lt-eye:focus-visible,.lt-lang:focus-visible{outline:3px solid #E9B817;outline-offset:2px}' +
    'html[dir=rtl] .lt-wrap,html[dir=rtl] .lt-wrap *{letter-spacing:0!important}' +
    'html[dir=rtl] .lt-box input[type=email]{direction:ltr;text-align:right}' +
    'html[dir=rtl] .lt-lang{right:auto;left:18px}html[dir=rtl] .lt-box svg{left:auto;right:14px}html[dir=rtl] .lt-box input{padding:13px 44px 13px 14px}html[dir=rtl] .lt-box input.pw{padding-left:74px}html[dir=rtl] .lt-eye{right:auto;left:8px}' +
    '@media (prefers-color-scheme:dark){.lt-form{background:#1B2025}.lt-card h2{color:#ECEEEA}.lt-sub,.lt-note{color:#98A1A8}.lt-field>span{color:#B7BEC4}.lt-box input{background:#242A30;color:#ECEEEA;border-color:#3A424A}.lt-box svg{color:#7E8890}.lt-eye{color:#B7BEC4}.lt-eye:hover{background:#2D343B}.lt-lang{color:#ECEEEA;border-color:#3A424A}.lt-lang:hover{background:#ECEEEA;color:#1D2227}.lt-btn{background:#E9B817;color:#1D2227}.lt-btn:hover{background:#fff}.lt-btn:disabled{background:#E9B817;color:#1D2227}.lt-err{background:#3A1F1D;color:#F6B3AD;border-color:#6A2F2B}}' +
    '@media (max-width:820px){.lt-wrap{grid-template-columns:1fr;grid-template-rows:auto 1fr}.lt-brand{padding:28px 24px 34px}.lt-logo{font-size:56px;margin:14px 0 6px}.lt-logo:after{margin-top:10px;width:56px}.lt-tag{font-size:16px;margin:12px 0 0}.lt-feats{display:none}.lt-road,.lt-lane.c{display:none}.lt-form{align-items:flex-start;padding:28px 22px 40px}}' +
    '@media (prefers-reduced-motion:reduce){.lt-lane,.lt-card,.lt-btn.busy:before,.lt-err.shake{animation:none}.lt-wrap{transition:none}}';

  var ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></svg>';

  function showLogin() {
    return new Promise(function (resolve) {
      if (!document.getElementById('lt-css')) {
        var st = document.createElement('style'); st.id = 'lt-css'; st.textContent = LOGIN_CSS; document.head.appendChild(st);
      }
      var box = document.createElement('div');
      box.className = 'lt-wrap';
      box.innerHTML =
        '<section class="lt-brand"><div class="lt-road"></div><div class="lt-lane a"></div><div class="lt-lane b"></div><div class="lt-lane c"></div>' +
        '<div class="lt-in"><span class="lt-plate">THE LOT</span><div class="lt-logo">The Lot</div>' +
        '<p class="lt-tag">' + t('Your whole showroom, in one place.') + '</p>' +
        '<ul class="lt-feats"><li>' + t('Cars bought, sold and rented') + '</li><li>' + t('Invoices, installments and customers') + '</li><li>' + t('Staff, attendance and payroll') + '</li><li>' + t('Profit you can trust') + '</li></ul></div></section>' +
        '<section class="lt-form"><button type="button" class="lt-lang" id="lt-lang">' + (LANG_UR ? 'English' : 'اردو') + '</button>' +
        '<form class="lt-card" novalidate><h2>' + t('Welcome back') + '</h2><p class="lt-sub">' + t('Sign in to your showroom') + '</p>' +
        '<label class="lt-field"><span>' + t('Email') + '</span><div class="lt-box">' + ICON_MAIL + '<input id="lot-email" type="email" autocomplete="username" inputmode="email" required></div></label>' +
        '<label class="lt-field"><span>' + t('Password') + '</span><div class="lt-box">' + ICON_LOCK + '<input id="lot-pass" class="pw" type="password" autocomplete="current-password" required><button type="button" class="lt-eye" id="lt-eye">' + t('Show') + '</button></div></label>' +
        '<p class="lt-err" id="lot-err" role="alert" hidden></p>' +
        '<button class="lt-btn" id="lt-go" type="submit"><span>' + t('Sign in') + '</span></button>' +
        '<p class="lt-note">' + t('Forgot your password? Ask the owner to reset it.') + '</p></form></section>';
      document.body.appendChild(box);

      var form = box.querySelector('form'), err = box.querySelector('#lot-err'), go = box.querySelector('#lt-go'),
          pw = box.querySelector('#lot-pass'), eye = box.querySelector('#lt-eye'), em = box.querySelector('#lot-email');
      eye.onclick = function () {
        var show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.textContent = t(show ? 'Hide' : 'Show'); pw.focus();
      };
      box.querySelector('#lt-lang').onclick = function () {
        try { localStorage.setItem('lot-lang', LANG_UR ? 'en' : 'ur'); } catch (e) {}
        location.reload();
      };
      function busy(on) { go.disabled = on; go.classList.toggle('busy', on); go.querySelector('span').textContent = t(on ? 'Signing in…' : 'Sign in'); }
      function fail(msg) {
        busy(false); err.textContent = msg; err.hidden = false;
        err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake'); pw.focus(); pw.select();
      }
      form.onsubmit = function (e) {
        e.preventDefault(); err.hidden = true;
        var email = em.value.trim(), password = pw.value;
        if (!email || !password) { fail(t('Wrong email or password.')); return; }
        busy(true);
        sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
          if (r.error) {
            var bad = (r.error.status >= 400 && r.error.status < 500) || /invalid|credential/i.test(r.error.message || '');
            fail(t(bad ? 'Wrong email or password.' : 'Could not sign in. Check your connection and try again.')); return;
          }
          box.classList.add('lt-out'); setTimeout(function () { box.remove(); }, 380); resolve(r.data.session);
        }, function () { fail(t('Could not sign in. Check your connection and try again.')); });
      };
      em.focus();
    });
  }

  // Remove every saved Supabase login from this browser. Supabase keeps it when its own
  // sign-out request fails (for example on a weak connection), so we always do this ourselves.
  function clearSession() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sb-') === 0) keys.push(k); }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
  }

  function addSignOut() {
    var b = document.createElement('button');
    b.id = 'lot-signout'; b.type = 'button'; b.textContent = 'Sign out (' + profile.name + ')';
    var host = document.querySelector('.clock');
    if (host) {
      b.style.cssText = 'margin:6px 0 0 6px;padding:3px 12px;font-size:13px';
      host.appendChild(b);
    } else {
      b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:15;padding:4px 10px;font:12px system-ui;border:1px solid #98A1A8;border-radius:6px;background:rgba(255,255,255,.9);color:#1D2227;cursor:pointer';
      document.body.appendChild(b);
    }
    b.onclick = function () {
      b.disabled = true;
      var done = false;
      function finish() { if (done) return; done = true; clearSession(); location.replace(location.pathname + location.search); }
      try { sb.auth.signOut({ scope: 'local' }).then(finish, finish); } catch (e) { finish(); }
      setTimeout(finish, 2500);
    };
  }

  var gate = new Promise(function (resolve) {
    function go() {
      sb.auth.getSession().then(function (r) {
        return r.data.session || showLogin();
      }).then(function (session) {
        return sb.from('profiles').select('name,role').eq('id', session.user.id).maybeSingle().then(function (p) {
          if (!p.data) { fatal('Your account has no showroom profile yet. Ask the owner to add you.'); return; }
          profile = { id: session.user.id, email: session.user.email, name: p.data.name || session.user.email, role: p.data.role };
          addSignOut();
          // if another tab signs out, this one follows
          sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') { clearSession(); location.reload(); } });
          resolve();
        });
      });
    }
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  });

  /* ---------- user ---------- */
  var user = {
    canEdit: function () { return Promise.resolve(ADMIN.indexOf(profile.role) >= 0); },
    isOwner: function () { return Promise.resolve(profile.role === 'owner'); },
    me: function () { return Promise.resolve({ id: profile.id, name: profile.name, email: profile.email, isOwner: profile.role === 'owner', canEdit: ADMIN.indexOf(profile.role) >= 0 }); }
  };

  /* ---------- db: one row per kind of record, with live updates ---------- */
  function docRef(path) {
    var id = path.split('/')[1];
    return {
      id: id, path: path,
      set: function (data) {
        return sb.from('showroom_docs').upsert({ id: id, items: data.items }, { onConflict: 'id' }).then(function (r) { if (r.error) throw r.error; });
      },
      onSnapshot: function (next, err) {
        var dead = false;
        function emit(items, exists) { next({ exists: exists, id: id, data: function () { return { items: items }; } }); }
        function load() {
          sb.from('showroom_docs').select('items').eq('id', id).maybeSingle().then(function (r) {
            if (dead) return;
            if (r.error) { if (err) err(r.error); return; }
            emit(r.data ? r.data.items : [], !!r.data);
          });
        }
        load();
        var ch = sb.channel('doc-' + id + '-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'showroom_docs', filter: 'id=eq.' + id }, function (p) {
            if (p.eventType === 'DELETE') { emit([], false); return; }
            if (!p.new || p.new.items === undefined) { load(); return; }
            emit(p.new.items, true);
          }).subscribe();
        var onFocus = function () { load(); };
        window.addEventListener('focus', onFocus);
        return function () { dead = true; window.removeEventListener('focus', onFocus); sb.removeChannel(ch); };
      }
    };
  }

  function activityQuery() {
    var ord = { f: 't', asc: false }, lim = 200;
    var q = {
      orderBy: function (f, d) { ord = { f: f, asc: d === 'asc' }; return q; },
      limit: function (n) { lim = n; return q; },
      onSnapshot: function (next, err) {
        var dead = false;
        function load() {
          sb.from('activity').select('*').order(ord.f, { ascending: ord.asc }).limit(lim).then(function (r) {
            if (dead) return;
            if (r.error) { if (err) err(r.error); return; }
            next({ docs: r.data.map(function (row) { return { id: row.id, data: function () { return row; } }; }) });
          });
        }
        load();
        var ch = sb.channel('act-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, load).subscribe();
        return function () { dead = true; sb.removeChannel(ch); };
      },
      add: function (o) {
        var row = { who: o.who, part: o.part, kind: o.kind, label: o.label, detail: o.detail || '', pid: o.pid || null, before: o.before || null };
        return sb.from('activity').insert(row).then(function (r) { if (r.error) throw r.error; });
      },
      doc: function (id) {
        return { update: function (patch) { return sb.from('activity').update(patch).eq('id', id).then(function (r) { if (r.error) throw r.error; }); } };
      }
    };
    return q;
  }

  var db = {
    doc: docRef,
    collection: function (name) {
      if (name !== 'activity') throw new Error('Unknown collection ' + name);
      return activityQuery();
    }
  };

  /* ---------- downloads ---------- */
  var downloads = {
    save: function (o) {
      var type = /\.pdf$/i.test(o.filename) ? 'application/pdf' : /\.json$/i.test(o.filename) ? 'application/json' : 'text/csv';
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: type });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = o.filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return Promise.resolve({ ok: true });
    }
  };

  /* ---------- assets: car photos in Supabase Storage ---------- */
  var BUCKET = 'car-photos';
  var assets = {
    upload: function (blob, o) {
      var id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + '.jpg';
      return sb.storage.from(BUCKET).upload(id, blob, { contentType: (o && o.type) || blob.type || 'image/jpeg', upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        var u = sb.storage.from(BUCKET).getPublicUrl(id);
        return { id: id, url: u.data.publicUrl, sizeBytes: blob.size, contentType: blob.type };
      });
    },
    delete: function (id) { return sb.storage.from(BUCKET).remove([id]).then(function () { return { deleted: true }; }); }
  };

  /* ---------- sample: Claude through your Edge Function ---------- */
  function b64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function ask(prompt, files) {
    return Promise.all((files || []).map(function (f) { return b64(f).then(function (d) { return { media_type: f.type || 'image/jpeg', data: d }; }); }))
      .then(function (images) { return sb.functions.invoke('ask-ai', { body: { prompt: prompt, images: images } }); })
      .then(function (r) {
        if (r.error || !r.data || r.data.error) {
          var e = new Error((r.data && r.data.error) || (r.error && r.error.message) || 'AI request failed');
          e.code = (r.data && r.data.code) || 'upstream_error'; throw e;
        }
        return r.data.text;
      });
  }
  var sample = function (prompt, o) {
    return ask(prompt, o && o.images).then(function (text) { if (o && o.onText) o.onText({ text: text }); return { text: text }; });
  };
  sample.json = function (prompt, o) {
    return ask(prompt + '\n\nReturn only valid JSON and nothing else.', o && o.images).then(function (t) {
      var m = t.match(/[\[{][\s\S]*[\]}]/);
      return JSON.parse(m ? m[0] : t);
    });
  };
  sample.limits = function () { return Promise.resolve({ images: true }); };

  var parts = { user: user, db: db, downloads: downloads, assets: assets, sample: sample };
  window.claude = {
    use: function (name) { return gate.then(function () { return parts[name] || null; }); }
  };
})();
