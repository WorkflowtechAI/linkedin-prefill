(function () {
  'use strict';

  var T = globalThis.LI_TEST;
  var EXPECTED = T.expected;

  var FILLS = [
    ['gh-li', 'label[for] says "LinkedIn Profile URL" (Greenhouse shape)'],
    ['ashby-li', 'aria-labelledby points at a visible "LinkedIn"'],
    ['wd-li', 'label says "LinkedIn" (Workday shape)'],
    ['ph-li', 'no label, and the placeholder says "Your LinkedIn URL"'],
    ['anc-li', 'no label element, and the block around it says "Linked In profile"'],
    ['hid-name', 'nothing visible at all, and name is urls[LinkedIn]'],
    ['hid-aria', 'nothing visible at all, and aria-label is "LinkedIn profile URL"'],
    ['hid-auto', 'nothing visible at all, and data-automation-id is linkedinQuestion'],
    ['late-li', 'field injected 500ms after load (MutationObserver)'],
    ['react-li', 'framework-controlled field']
  ];

  var SKIPS = [
    ['neg-website', 'label says "Website" — a data-automation-id of linkedinQuestion gets no vote'],
    ['neg-contact', 'label says "Contact" — an aria-label of "LinkedIn profile link" gets no vote'],
    ['neg-social', 'label says "Social" — a placeholder of "Your LinkedIn URL" gets no vote'],
    ['neg-profile', 'label says "Profile" — a name of urls[LinkedIn] gets no vote'],
    ['neg-portfolio', 'unrelated field — "Portfolio URL"'],
    ['neg-github', 'unrelated field — GitHub'],
    ['neg-company', 'says LinkedIn, but asks for the company page'],
    ['neg-email', 'type=email — "LinkedIn sign in email"']
  ];

  var results = [];

  function check(name, condition, detail) {
    results.push({ name: name, ok: !!condition, detail: detail || '' });
  }

  function run() {
    FILLS.forEach(function (row) {
      var el = document.getElementById(row[0]);
      var got = el ? el.value : '(field missing)';
      check('fills: ' + row[1], el && got === EXPECTED, got === EXPECTED ? '' : 'got ' + JSON.stringify(got));
    });

    SKIPS.forEach(function (row) {
      var el = document.getElementById(row[0]);
      check('leaves alone: ' + row[1], el && el.value === '', el && el.value ? 'got ' + JSON.stringify(el.value) : '');
    });

    var prefilled = document.getElementById('neg-prefilled');
    check(
      'leaves alone: LinkedIn field the user already answered',
      prefilled && prefilled.value === 'https://www.linkedin.com/in/someone-else',
      prefilled ? 'got ' + JSON.stringify(prefilled.value) : ''
    );

    check(
      'framework: value written through the prototype setter, not el.value',
      T.frameworkIntercepted === false,
      T.frameworkIntercepted ? 'the instance setter ran, so React would revert this' : ''
    );

    var fired = T.events['react-li'] || [];
    check(
      'framework: input and change events dispatched and bubbled',
      fired.indexOf('input') !== -1 && fired.indexOf('change') !== -1,
      'saw [' + fired.join(', ') + ']'
    );

    if (T.mode === 'prefix') {
      var field = document.getElementById('gh-li');
      field.focus();
      field.blur();
      check(
        'prefix mode: a bare prefix is cleared on blur, never submitted',
        field.value === '',
        'got ' + JSON.stringify(field.value)
      );
      field.focus();
      check('prefix mode: the prefix comes back on focus', field.value === EXPECTED, 'got ' + JSON.stringify(field.value));
      field.blur();
    }

    report();
  }

  function report() {
    var failed = results.filter(function (r) {
      return !r.ok;
    });
    var summary = document.getElementById('summary');
    summary.className = failed.length ? 'fail' : 'pass';
    summary.textContent =
      (failed.length ? 'FAIL' : 'PASS') +
      ' — ' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ' checks, mode=' +
      T.mode;

    document.getElementById('results').innerHTML = results
      .map(function (r) {
        var detail = r.detail ? ' <span style="opacity:.8">(' + r.detail.replace(/</g, '&lt;') + ')</span>' : '';
        return '<div class="' + (r.ok ? 'ok' : 'no') + '"><b>' + (r.ok ? 'PASS' : 'FAIL') + '</b>' + r.name + detail + '</div>';
      })
      .join('');

    globalThis.LI_RESULTS = { pass: results.length - failed.length, total: results.length, failed: failed };
  }

  // After the injected field has landed and the observer's debounce has run.
  setTimeout(run, 1100);
})();
