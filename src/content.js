// LinkedIn Prefill — finds the field on an application form that is asking for
// your LinkedIn profile and fills it. Reads nothing else on the page, sends
// nothing anywhere. The only stored state is your own URL and one toggle.
(function () {
  'use strict';

  var PREFIX = globalThis.LinkedInUrl.PREFIX;

  var ASKS_FOR_LINKEDIN = /linked\s*[-_]?\s*in/i;

  // Fields that mention LinkedIn but are not "paste your profile URL here".
  // "website" and friends are in here because a field presenting itself as your
  // website is your website, whatever a hidden attribute on it happens to say.
  var NOT_YOURS = /\b(company|organization|organisation|employer|recruiter|password|sign\s?in|log\s?in|search|web\s?site|personal\s?site|home\s?page|portfolio|blog)\b/i;

  var FILLABLE_TYPE = /^(text|url|search|)$/i;

  // How far up to look for label text when the field has no label of its own.
  var ANCESTOR_HOPS = 4;
  var ANCESTOR_TEXT_LIMIT = 240;

  var SCAN_DEBOUNCE_MS = 250;

  var settings = { profileUrl: '', autofill: true };
  var handled = new WeakSet();
  var scanTimer = null;

  // ---------------------------------------------------------------- labels

  function textOf(node) {
    if (!node) return '';
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function labelledByText(el) {
    var ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return ids
      .map(function (id) {
        return textOf(document.getElementById(id));
      })
      .join(' ');
  }

  function forLabelText(el) {
    if (!el.id) return '';
    var escaped = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/["\\]/g, '\\$&');
    var labels = document.querySelectorAll('label[for="' + escaped + '"]');
    return Array.prototype.map.call(labels, textOf).join(' ');
  }

  // Text from an enclosing block, used only when that block holds this one
  // field and nothing else — otherwise a "Connect with LinkedIn" button
  // elsewhere in the form would claim an unrelated input.
  function ancestorText(el) {
    var node = el.parentElement;
    var best = '';
    for (var hop = 0; node && hop < ANCESTOR_HOPS; hop++, node = node.parentElement) {
      if (node.querySelectorAll('input, textarea, select').length !== 1) break;
      var text = textOf(node);
      if (text.length > ANCESTOR_TEXT_LIMIT) break;
      // Keep climbing through bare wrapper divs: the label usually sits above them.
      if (text) best = text;
    }
    return best;
  }

  function labelText(el) {
    return [labelledByText(el), forLabelText(el), textOf(el.closest('label'))].filter(Boolean).join(' ');
  }

  // Markup the person filling the form cannot see.
  function hiddenHints(el) {
    return [
      el.getAttribute('aria-label'),
      el.getAttribute('name'),
      el.id,
      el.getAttribute('data-qa'),
      el.getAttribute('data-automation-id'),
      el.getAttribute('data-testid'),
      el.getAttribute('title')
    ]
      .filter(Boolean)
      .join(' ');
  }

  // The first of these the form actually offers decides, and the rest are never
  // consulted: the label, then the placeholder, then the text of the block it
  // sits in, and only if it shows none of those, the hidden markup.
  //
  // So a visible label is a veto. A field the form calls "Website", "Contact",
  // "Social" or "Profile" is that field, however loudly a name or a data
  // attribute underneath it says linkedin: the label is the promise the form
  // made to the person filling it in. But a field that tells the reader nothing
  // at all has only its markup to go on, and there a name of "urls[LinkedIn]" or
  // a data-automation-id of "linkedinQuestion" is exactly what it looks like.
  function describe(el) {
    return labelText(el) || (el.getAttribute('placeholder') || '').trim() || ancestorText(el) || hiddenHints(el);
  }

  // ----------------------------------------------------------------- fill

  // React and friends track the value on the DOM node, so assigning .value
  // directly is invisible to them and the field reverts on the next render.
  // Going through the prototype setter and then firing the events the
  // framework listens for is what makes the value actually stick.
  function setValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function flash(el) {
    var previous = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 2px rgba(10, 102, 194, 0.55)';
    setTimeout(function () {
      el.style.boxShadow = previous;
    }, 1200);
  }

  // No URL configured: leave the prefix in the field so the slug is all that is
  // left to type. A bare prefix is not a valid profile, so it is cleared again
  // on blur and restored on focus — the field is never submitted half-written.
  function attachPrefixOnly(el) {
    el.addEventListener('focus', function () {
      if (!el.value) setValue(el, PREFIX);
      var end = el.value.length;
      try {
        el.setSelectionRange(end, end);
      } catch (e) {
        /* input types that reject selection ranges */
      }
    });
    el.addEventListener('blur', function () {
      if (el.value === PREFIX) setValue(el, '');
    });
    setValue(el, PREFIX);
  }

  function fill(el) {
    if (settings.profileUrl) {
      setValue(el, settings.profileUrl);
    } else {
      attachPrefixOnly(el);
    }
    flash(el);
  }

  // ----------------------------------------------------------------- scan

  function isCandidate(el) {
    if (handled.has(el)) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.value && el.value.trim()) return false;
    if (el.tagName === 'INPUT' && !FILLABLE_TYPE.test(el.getAttribute('type') || '')) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }

  function scan() {
    if (!settings.autofill) return;
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (!isCandidate(el)) continue;
      var description = describe(el);
      if (!ASKS_FOR_LINKEDIN.test(description)) continue;
      if (NOT_YOURS.test(description)) continue;
      handled.add(el);
      fill(el);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
  }

  // ----------------------------------------------------------------- boot

  function start() {
    scan();
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function load() {
    // Present in Chrome, Edge, Brave and Firefox alike.
    var api = globalThis.chrome && chrome.storage ? chrome : globalThis.browser;
    if (!api || !api.storage) {
      start();
      return;
    }

    api.storage.sync.get({ profileUrl: '', autofill: true }, function (stored) {
      if (stored) settings = stored;
      start();
    });

    if (api.storage.onChanged) {
      api.storage.onChanged.addListener(function (changes) {
        if (changes.profileUrl) settings.profileUrl = changes.profileUrl.newValue;
        if (changes.autofill) settings.autofill = changes.autofill.newValue;
      });
    }
  }

  load();
})();
