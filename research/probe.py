import re, json, sys, urllib.request, time
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
def get(d, *path):
    try:
        for p in path: d = d[p]
        return d
    except Exception as e:
        return f"<{type(e).__name__}>"
PATHS = {
 "title": [0,0], "installsText": [13,0], "minInstalls": [13,1], "realInstalls": [13,2],
 "score": [51,0,1], "ratings": [51,2,1], "reviews": [51,3,1], "hist5": [51,1,5,1], "hist1": [51,1,1,1],
 "price": [57,0,0,0,0,1,0], "iapRange": [19,0], "ads": [48],
 "minAndroid": [140,1,1,0,0,1], "version": [140,0,0,0],
 "released": [10,0], "releasedTs": [10,1,0], "updatedTs": [145,0,1,0],
 "genre": [79,0,0,0], "genreId": [79,0,0,2], "dev": [68,0], "devUrl": [68,1,4,2],
 "devEmail": [69,1,0], "devSite": [69,0,5,2], "privacy": [99,0,5,2], "contentRating": [9,0],
}
for app in sys.argv[1:]:
    t0=time.time()
    req = urllib.request.Request(f"https://play.google.com/store/apps/details?id={app}&hl=en&gl=US", headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    blocks = dict(re.findall(r"AF_initDataCallback\(\{key: '([^']+)', hash: '[^']+', data:(.*?), sideChannel: \{\}\}\);", html, re.S))
    print("=== ", app, len(html), "bytes", "blocks:", sorted(blocks.keys()), f"{time.time()-t0:.1f}s")
    found = None
    for k, v in blocks.items():
        try: d = json.loads(v)
        except Exception: continue
        base = get(d, 1, 2)
        if isinstance(base, list) and len(base) > 100 and isinstance(get(base, 13, 2), int):
            found = (k, base); break
    if not found: print("  NO detail block"); continue
    k, base = found
    print("  block:", k, "len", len(base))
    for name, p in PATHS.items():
        v = get(base, *p)
        s = json.dumps(v, ensure_ascii=False)
        print(f"  {name:14s} {s[:90]}")
