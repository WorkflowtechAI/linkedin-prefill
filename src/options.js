(function () {
  'use strict';

  var normalize = globalThis.LinkedInUrl.normalize;
  var PREFIX = globalThis.LinkedInUrl.PREFIX;

  // Outside an extension (opened as a plain file, or in the test fixture) there
  // is no storage API. Fall back to localStorage so the page still works.
  var api =
    globalThis.chrome && chrome.storage
      ? chrome
      : globalThis.browser && globalThis.browser.storage
        ? globalThis.browser
        : {
            storage: {
              sync: {
                get: function (defaults, cb) {
                  var raw = localStorage.getItem('linkedin-prefill');
                  cb(Object.assign({}, defaults, raw ? JSON.parse(raw) : null));
                },
                set: function (values, cb) {
                  localStorage.setItem('linkedin-prefill', JSON.stringify(values));
                  if (cb) cb();
                }
              }
            }
          };

  var url = document.getElementById('url');
  var autofill = document.getElementById('autofill');
  var preview = document.getElementById('preview');
  var status = document.getElementById('status');
  var statusTimer = null;

  function render() {
    var raw = url.value.trim();
    if (!raw) {
      preview.className = 'preview';
      preview.innerHTML = 'Blank fills just <code>' + PREFIX + '</code>';
      return;
    }
    var normalized = normalize(raw);
    if (!normalized) {
      preview.className = 'preview bad';
      preview.textContent = 'That is not a profile. Paste your profile URL, or just the slug.';
      return;
    }
    preview.className = 'preview';
    preview.innerHTML = 'Fills <code>' + normalized + '</code>';
  }

  function save() {
    var raw = url.value.trim();
    var normalized = normalize(raw);
    if (raw && !normalized) {
      url.focus();
      return;
    }
    url.value = normalized;
    render();
    api.storage.sync.set({ profileUrl: normalized, autofill: autofill.checked }, function () {
      status.classList.add('show');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(function () {
        status.classList.remove('show');
      }, 1600);
    });
  }

  api.storage.sync.get({ profileUrl: '', autofill: true }, function (stored) {
    url.value = stored.profileUrl || '';
    autofill.checked = stored.autofill !== false;
    render();
  });

  url.addEventListener('input', render);
  url.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') save();
  });
  document.getElementById('save').addEventListener('click', save);
})();
