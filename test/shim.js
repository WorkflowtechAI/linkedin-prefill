// Test harness. Stands in for the extension runtime so src/content.js can be
// exercised as a plain page script, with no install and no build step.
(function () {
  'use strict';

  var mode = new URLSearchParams(location.search).get('mode') || 'full';
  var PROFILE = 'https://www.linkedin.com/in/david-george-braun';
  var PREFIX = 'https://www.linkedin.com/in/';

  var stored = mode === 'prefix' ? { profileUrl: '', autofill: true } : { profileUrl: PROFILE, autofill: true };

  globalThis.chrome = Object.assign({}, globalThis.chrome, {
    storage: {
      sync: {
        get: function (defaults, cb) {
          cb(Object.assign({}, defaults, stored));
        },
        set: function (values, cb) {
          Object.assign(stored, values);
          if (cb) cb();
        }
      },
      onChanged: { addListener: function () {} }
    }
  });

  // What the run should produce in each mode.
  globalThis.LI_TEST = {
    mode: mode,
    expected: mode === 'prefix' ? PREFIX : PROFILE,
    events: {},
    frameworkIntercepted: false
  };

  // Emulate React's input value tracking: React defines an own `value`
  // accessor on the node, and a write that goes through it is swallowed
  // because the tracker concludes nothing changed. A content script that
  // assigns el.value directly trips this; one that goes through the
  // prototype setter does not. The flag records which path was taken.
  var reactField = document.getElementById('react-li');
  if (reactField) {
    var protoDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(reactField, 'value', {
      configurable: true,
      enumerable: false,
      get: function () {
        return protoDesc.get.call(this);
      },
      set: function (v) {
        globalThis.LI_TEST.frameworkIntercepted = true;
        protoDesc.set.call(this, v);
      }
    });
  }

  // Record the events a framework would be listening for.
  ['input', 'change'].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        if (!e.target || !e.target.id) return;
        var seen = globalThis.LI_TEST.events[e.target.id] || (globalThis.LI_TEST.events[e.target.id] = []);
        seen.push(type);
      },
      true
    );
  });

  // A field the form injects after the page settles, to exercise the observer.
  setTimeout(function () {
    var host = document.getElementById('late');
    if (!host) return;
    host.innerHTML =
      '<label for="late-li">LinkedIn profile</label><input id="late-li" type="text" />';
  }, 500);
})();
