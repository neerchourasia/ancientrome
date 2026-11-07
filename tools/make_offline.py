#!/usr/bin/env python3
"""Builds offline/time-machine-offline.zip: the game as a folder a teacher can put on a USB stick or a shared drive and open with no internet at all.

The zip holds index.html and every file it uses (they are read from index.html itself, so the list cannot go out of date), the same files as the website but with:
  * config.js emptied (no game server and no account service to call: nothing can be sent anywhere),
  * the Content-Security-Policy tag taken out of index.html (browsers do not always match 'self' for files opened from the computer),
  * start.html (opens the game with the options a teacher picks) and README.txt (how to use it) added at the top.
Opened from the files themselves, index.html is always in class mode (classmode.js: no login, nothing saved, no other players), and everything is kept in the browser tab only.
Run it again after every release, so the copy is the same version as the website:   python3 tools/make_offline.py
"""
import pathlib
import re
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
version = (re.search(r'classmode\.js\?v=(\d+)', html) or [None, "0"])[1]

files = []
for m in re.finditer(r'(?:src|href)="([^"#?]+)', html):
    p = m.group(1)
    if p.startswith(("http", "//", "mailto")) or p.endswith("/") or p.endswith(".html"):
        continue
    if (root / p).is_file() and p not in files:
        files.append(p)

index = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', "", html)
index = re.sub(r'\s*<link rel="canonical"[^>]*>', "", index)
# the guide and the teacher pages are on the website only
index = re.sub(r'\s*<a href="(?:guide/|class\.html|privacy\.html|terms\.html)">[^<]*</a>', "", index)

out = root / "offline" / "time-machine-offline.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr("Time Machine offline/index.html", index)
    for p in files:
        if p == "config.js":
            z.writestr("Time Machine offline/config.js", '"use strict";\n// The offline copy talks to nobody: no account service and no game server.\nwindow.ROME_CONFIG = { supabaseUrl: "", supabaseAnonKey: "", serverUrl: "" };\n')
        else:
            z.write(root / p, "Time Machine offline/" + p)
    for name in ("start.html", "start.js"):
        z.write(root / "offline" / name, "Time Machine offline/" + name)
    z.write(root / "offline" / "README.txt", "Time Machine offline/README.txt")
    z.writestr("Time Machine offline/VERSION.txt", "Time Machine, version %s\n" % version)
print("wrote %s: %d files, %.1f MB, version %s" % (out.relative_to(root), len(files) + 5, out.stat().st_size / 1048576, version))
