/*!
 * instant-search-index - instant client-side search from a prebuilt index
 * Zero dependencies. Vanilla JS. No server round-trips: the index ships as
 * JSON in the page, the engine scores it in the browser.
 * https://github.com/bryanhamiltondev/instant-search-index
 * MIT licensed.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    minLength: 2,      /* queries shorter than this open nothing */
    maxResults: 8,     /* cap the list; the top of the list is the product */
    debounce: 80,      /* ms of typing silence before a re-score */
    emptyMessage: "No matches.",
    placeholder: "Search..."
  };

  /* ------------------------------------------------------------------ *
   * Tokenizer. Lowercase, split on anything that is not a letter, digit
   * or apostrophe, drop empties. Predictable, dependency-free, and good
   * enough for names - which is what most search boxes are asked about.
   * ------------------------------------------------------------------ */

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   * Index builder. Precomputes per-record token lists once at load, so
   * every keystroke scores against prepared arrays instead of re-splitting
   * strings. Build once, score cheaply forever.
   * ------------------------------------------------------------------ */

  function buildIndex(records) {
    return (records || []).map(function (r, i) {
      var title = r.title || "";
      var subtitle = r.subtitle || "";
      var keywords = r.keywords || "";
      return {
        record: r,
        index: i,
        titleTokens: tokenize(title),
        subtitleTokens: tokenize(subtitle),
        keywordTokens: tokenize(keywords),
        haystack: (title + " " + subtitle + " " + keywords).toLowerCase()
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * Scoring. One query token at a time; a record must match every token
   * somewhere (AND semantics) or it scores zero. Weighted by where the
   * match lands: title beats keywords beats subtitle, exact beats prefix,
   * and a full-phrase hit gets a bonus. The top of the list is the product.
   * ------------------------------------------------------------------ */

  var W = {
    titleExact: 60,
    titlePrefix: 40,
    keywordExact: 30,
    keywordPrefix: 18,
    subtitleExact: 12,
    subtitlePrefix: 8,
    substring: 4,
    phraseBonus: 25
  };

  function tokenScore(tokens, q) {
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === q) { return 2; }        /* exact token */
      if (t.indexOf(q) === 0) { return 1; } /* prefix of a token */
    }
    return 0;
  }

  function scoreEntry(entry, queryTokens, rawQuery) {
    var total = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      var q = queryTokens[i];
      var best = 0;

      var s = tokenScore(entry.titleTokens, q);
      if (s === 2) { best = W.titleExact; }
      else if (s === 1) { best = W.titlePrefix; }

      if (!best) {
        s = tokenScore(entry.keywordTokens, q);
        if (s === 2) { best = W.keywordExact; }
        else if (s === 1) { best = W.keywordPrefix; }
      }

      if (!best) {
        s = tokenScore(entry.subtitleTokens, q);
        if (s === 2) { best = W.subtitleExact; }
        else if (s === 1) { best = W.subtitlePrefix; }
      }

      if (!best && entry.haystack.indexOf(q) !== -1) { best = W.substring; }
      if (!best) { return 0; } /* one miss kills the record */

      total += best;
    }
    if (entry.haystack.indexOf(rawQuery) !== -1) { total += W.phraseBonus; }
    /* Shorter titles win ties - "Carl Cox" outranks "The Carl Cox Experience" */
    return total * 1000 - entry.record.title.length;
  }

  function search(index, query, options) {
    var raw = String(query || "").trim().toLowerCase();
    if (raw.length < options.minLength) { return []; }
    var tokens = tokenize(raw);
    if (!tokens.length) { return []; }
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = scoreEntry(index[i], tokens, raw);
      if (s > 0) { hits.push({ s: s, e: index[i] }); }
    }
    hits.sort(function (a, b) {
      if (b.s !== a.s) { return b.s - a.s; }
      return a.e.index - b.e.index; /* stable for equal scores */
    });
    return hits.slice(0, options.maxResults).map(function (h) { return h.e; });
  }

  /* ------------------------------------------------------------------ *
   * Output: escaping first, always.
   * ------------------------------------------------------------------ */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Wrap matched title tokens in <mark>: simple, safe, good enough. */
  function highlight(title, queryTokens) {
    var safe = esc(title);
    for (var i = 0; i < queryTokens.length; i++) {
      var q = esc(queryTokens[i]);
      if (!q) { continue; }
      var re = new RegExp("(^|[^a-z0-9'>])(" + q + "[a-z0-9']*)", "gi");
      safe = safe.replace(re, function (m, pre, hit) { return pre + "<mark>" + hit + "</mark>"; });
    }
    return safe;
  }

  /* ------------------------------------------------------------------ *
   * Combobox. One input, one listbox, ARIA fully wired: the input is a
   * combobox, results are options, and arrow keys move an
   * aria-activedescendant. Keyboard is first-class, not an afterthought.
   * ------------------------------------------------------------------ */

  var uid = 0;

  function attach(input, records, options) {
    var o = {};
    var k;
    for (k in DEFAULTS) { o[k] = DEFAULTS[k]; }
    if (options) { for (k in DEFAULTS) { if (options[k] !== undefined) { o[k] = options[k]; } } }

    var index = buildIndex(records);
    var listId = "isi-list-" + (++uid);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("autocomplete", "off");
    if (o.placeholder) { input.setAttribute("placeholder", o.placeholder); }

    var list = document.createElement("ul");
    list.id = listId;
    list.className = "isi-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.insertAdjacentElement("afterend", list);

    var activeIdx = -1;
    var timer = null;

    function items() { return list.querySelectorAll("li[role='option']"); }

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIdx = -1;
    }

    function setActive(i) {
      var els = items();
      if (!els.length) { return; }
      if (activeIdx >= 0 && els[activeIdx]) { els[activeIdx].classList.remove("isi-active"); }
      activeIdx = i;
      els[activeIdx].classList.add("isi-active");
      input.setAttribute("aria-activedescendant", els[activeIdx].id);
      if (els[activeIdx].scrollIntoView) { els[activeIdx].scrollIntoView({ block: "nearest" }); }
    }

    function render(query) {
      var queryTokens = tokenize(query);
      var hits = search(index, query, o);
      list.innerHTML = "";
      activeIdx = -1;

      if (!hits.length) {
        if (String(query).trim().length >= o.minLength) {
          var none = document.createElement("li");
          none.className = "isi-empty";
          none.textContent = o.emptyMessage;
          list.appendChild(none);
          list.hidden = false;
          input.setAttribute("aria-expanded", "true");
        } else {
          close();
        }
        return;
      }

      for (var i = 0; i < hits.length; i++) {
        var e = hits[i];
        var li = document.createElement("li");
        li.id = listId + "-opt-" + i;
        li.setAttribute("role", "option");
        var a = document.createElement("a");
        a.href = e.record.url || "#";
        a.innerHTML = highlight(e.record.title, queryTokens) +
          (e.record.subtitle ? '<span class="isi-sub">' + esc(e.record.subtitle) + "</span>" : "") +
          (e.record.badge ? '<span class="isi-badge">' + esc(e.record.badge) + "</span>" : "");
        li.appendChild(a);
        list.appendChild(li);
      }
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(input.value); }, o.debounce);
    });

    input.addEventListener("keydown", function (ev) {
      var els = items();
      if (ev.key === "ArrowDown") {
        if (list.hidden) { render(input.value); }
        else if (els.length) { setActive(Math.min(activeIdx + 1, els.length - 1)); }
        ev.preventDefault();
      } else if (ev.key === "ArrowUp") {
        if (!list.hidden && els.length) { setActive(Math.max(activeIdx - 1, 0)); }
        ev.preventDefault();
      } else if (ev.key === "Enter") {
        if (activeIdx >= 0 && els[activeIdx]) {
          var link = els[activeIdx].querySelector("a");
          if (link) { window.location.href = link.href; }
        } else if (els.length === 1) {
          var only = els[0].querySelector("a");
          if (only) { window.location.href = only.href; }
        }
      } else if (ev.key === "Escape") {
        close();
      }
    });

    /* Close when focus or clicks move outside the widget. */
    document.addEventListener("click", function (ev) {
      if (!list.hidden && ev.target !== input && !list.contains(ev.target)) { close(); }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () {
        var el = document.activeElement;
        if (el !== input && !(el && list.contains(el))) { close(); }
      }, 120);
    });

    return {
      input: input,
      list: list,
      reindex: function (newRecords) { index = buildIndex(newRecords); },
      destroy: function () { list.remove(); close(); }
    };
  }

  /* ------------------------------------------------------------------ *
   * Auto-init: any element marked data-instant-search whose value is a
   * JSON array of records gets a combobox. Manual mode for dynamic pages:
 *   InstantSearch.attach(inputEl, records, options)
   * ------------------------------------------------------------------ */

  function init(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-instant-search]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-instant-ready")) { continue; }
      el.setAttribute("data-instant-ready", "1");
      var raw = el.getAttribute("data-instant-search");
      var records = [];
      try { records = JSON.parse(raw); } catch (e) { records = []; }
      if (!Array.isArray(records) || !records.length) { continue; }
      var wrap = document.createElement("div");
      wrap.className = "isi-wrap";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      attach(el, records);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }

  window.InstantSearch = { attach: attach, buildIndex: buildIndex, search: search, init: init };
})();
