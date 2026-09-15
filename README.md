# LinkedIn Prefill

Every job application asks for your LinkedIn profile. None of them prefill the
half that is identical for every person on earth. This does that, and nothing
else.

Set your profile once and the field arrives filled in. Skip that and the field
arrives holding `https://www.linkedin.com/in/`, so the only thing left to type
is your slug.

No account, no server, no network calls, no tracking. Around three hundred
lines of dependency-free JavaScript, and no build step.

## Install

Not in the extension stores yet. Load it from source, which takes about a
minute.

**Chrome, Edge, Brave, Opera, Arc**

1. Download this repo (green **Code** button, then **Download ZIP**) and unzip it
2. Open `chrome://extensions` and switch on **Developer mode**
3. Click **Load unpacked** and pick the unzipped folder

**Firefox**

1. Download and unzip as above
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick `manifest.json` inside the folder

Firefox drops temporary add-ons when it restarts. A signed build is on the list.

**Safari** needs Xcode's `safari-web-extension-converter` to wrap the same
folder. Untested, so it is not documented here yet.

## Set your profile

Click the toolbar icon. Paste your profile URL, or just your slug. All of these
land on the same answer:

```
david-george-braun
linkedin.com/in/david-george-braun
https://www.linkedin.com/in/david-george-braun/?originalSubdomain=mx
```

Anything that is not a personal profile is refused rather than saved, so a
company page or a stray paste never ends up in an application.

Leave it blank on purpose if you would rather type your own slug each time. You
still skip the prefix.

## How it finds the field

One rule: **what the form calls the field has to say LinkedIn.** That is its
`<label>`, or its placeholder when it has no label, or the text of the block
around it when it has neither. Nothing else gets a vote.

So a field labelled *Website*, *Contact*, *Social* or *Profile* is left alone,
however loudly a `name="urls[LinkedIn]"`, an `aria-label` or a Workday
`data-automation-id="linkedinQuestion"` underneath it says otherwise. If the
person filling the form cannot see it, it does not count as asking. The
block-text fallback only applies when that block holds this one field and
nothing else, which is what keeps a *Connect with LinkedIn* button at the top of
the form from claiming an unrelated input.

That is stricter than it could be, and deliberately. The cost of a miss is that
you paste one URL yourself. The cost of a false positive is your LinkedIn sitting
in the box where your portfolio was supposed to go, on a form you already sent.

It writes the value through the native `HTMLInputElement` setter and then fires
`input` and `change`. That detail is the whole ballgame on a React form:
assigning `.value` directly looks like nothing happened to React's value
tracker, and the field reverts on the next render.

It also leaves a field alone when it already has an answer, when it is disabled
or read-only, when the label points at a company page or a login rather than
your own profile, and on `linkedin.com` itself. Forms that add their fields late are
covered by a `MutationObserver`, so an application that renders one section at a
time still gets filled.

Known gaps: fields inside a closed shadow root are invisible to it, and so are
cross-origin frames the browser will not inject into.

## Why it wants access to every site

Applications live on every company's own careers page as well as the ATS
domains, so a useful match list is "the web". The content script has no host
permissions of its own, makes no network requests, and reads nothing off the
page beyond the labels next to text inputs. The only thing it stores is the URL
you typed and one checkbox, in your browser's own sync storage.

## Tests

Three, in order of how much they prove.

**Is it loadable?** Checks the manifest against what MV3 requires, that every
path it names exists, that each icon really is the pixel size it is declared at,
that the pages' scripts resolve, and that all of it parses.

```bash
python tools/check.py
```

**Does the matching work?** `test/fixture.html` runs the real `src/content.js`
against every field shape above with a stubbed storage API, including a
React-style value tracker that fails the run if the value is written the naive
way. Serve the folder, because `file://` blocks the script loads:

```bash
python -m http.server 8777
```

Then open <http://127.0.0.1:8777/test/fixture.html?mode=full> for the
saved-profile run, and `?mode=prefix` for the prefix-only run. The page reports
PASS or FAIL per check.

**Does the extension actually work?** The two above prove the parts. This one
launches a real browser, loads this folder as an unpacked extension, points it at
a page with no scripts of its own, and reads back what got filled. Anything in
those fields was put there by the extension.

```bash
node tools/live-check.mjs
```

It needs Node 22 or newer, and it will pick up a Chromium that Playwright has
already downloaded. Note that branded Google Chrome has ignored the
`--load-extension` *command-line flag* since version 137, so pointing this at one
reports empty fields and a note saying so. Loading the folder by hand from
`chrome://extensions` is unaffected and works fine.

## Icons

`python tools/make-icons.py` regenerates `icons/` from one master. The mark is a
form field with its left half already filled, deliberately not the LinkedIn logo.

## License

MIT. Part of [job-hunt](https://github.com/WorkflowtechAI/job-hunt), and useful
on its own.
