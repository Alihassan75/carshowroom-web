/* The Lot: Supabase adapter
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
  function showLogin() {
    return new Promise(function (resolve) {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:#1D2227;padding:16px';
      box.innerHTML =
        '<form id="lot-login" style="background:#F4F5F2;color:#1D2227;border-radius:12px;padding:24px;width:min(360px,100%);border-top:6px solid #E9B817;font:15px system-ui">' +
        '<h1 style="margin:0 0 4px;font:800 40px/1 \'Big Shoulders Display\',\'Arial Narrow\',sans-serif">The Lot</h1>' +
        '<p style="margin:0 0 14px;color:#667078">Sign in to your showroom</p>' +
        '<label style="display:block;font-size:13px;color:#667078">Email</label>' +
        '<input id="lot-email" type="email" autocomplete="username" required style="width:100%;padding:9px;margin:3px 0 10px;border:1.5px solid #C5C9C3;border-radius:6px;font:inherit">' +
        '<label style="display:block;font-size:13px;color:#667078">Password</label>' +
        '<input id="lot-pass" type="password" autocomplete="current-password" required style="width:100%;padding:9px;margin:3px 0 12px;border:1.5px solid #C5C9C3;border-radius:6px;font:inherit">' +
        '<div id="lot-err" style="color:#B3261E;min-height:20px;font-size:13px"></div>' +
        '<button style="width:100%;padding:10px;border:0;border-radius:6px;background:#1D2227;color:#fff;font:600 15px system-ui;cursor:pointer">Sign in</button>' +
        '</form>';
      document.body.appendChild(box);
      box.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var err = box.querySelector('#lot-err'); err.textContent = '';
        sb.auth.signInWithPassword({
          email: box.querySelector('#lot-email').value.trim(),
          password: box.querySelector('#lot-pass').value
        }).then(function (r) {
          if (r.error) { err.textContent = 'Wrong email or password.'; return; }
          box.remove(); resolve(r.data.session);
        });
      };
    });
  }

  function addSignOut() {
    var b = document.createElement('button');
    b.textContent = 'Sign out (' + profile.name + ')';
    b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:15;padding:4px 10px;font:12px system-ui;border:1px solid #98A1A8;border-radius:6px;background:rgba(255,255,255,.85);color:#1D2227;cursor:pointer';
    b.onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
    document.body.appendChild(b);
  }

  var gate = new Promise(function (resolve) {
    function go() {
      sb.auth.getSession().then(function (r) {
        return r.data.session || showLogin();
      }).then(function (session) {
        return sb.from('profiles').select('name,role').eq('id', session.user.id).maybeSingle().then(function (p) {
          if (!p.data) { fatal('Your account has no showroom profile yet. Ask the owner to add you.'); return; }
          profile = { id: session.user.id, email: session.user.email, name: p.data.name || session.user.email, role: p.data.role };
          addSignOut(); resolve();
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
