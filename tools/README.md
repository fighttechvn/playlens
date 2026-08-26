# tools/

Asset generators — not part of the shipped extension (`build.sh` excludes them).

Both scripts need Playwright; they point at an existing install path at the top
of the file — adjust it if you move things around.

- `icon.svg` + `render-icon.js` → regenerate `icons/icon{16,32,48,128}.png`
- `capture-store.js` → capture `store/screenshot-*.png` (1280×800, the size the
  Chrome Web Store expects) from a live Google Play search page with the
  extension injected

```bash
node tools/render-icon.js
node tools/capture-store.js
```

Note: `page.addScriptTag` does not work on play.google.com — its Trusted Types
policy rejects the injection. `page.evaluate(<source string>)` goes through CDP
instead and is what these scripts use.
