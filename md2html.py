#!/usr/bin/env python3
"""Turns cheatsheet.md into cheatsheet.html: one self-contained page, works offline. Standard library only.
    python3 md2html.py cheatsheet.md cheatsheet.html
"""
import html
import re
import sys

KEY_RE = re.compile(r"^(Super|Meta|Ctrl|Alt|Shift|SUPER)\+")


def inline(text):
    out, i = [], 0
    for m in re.finditer(r"`([^`]+)`|\*\*([^*]+)\*\*", text):
        out.append(html.escape(text[i:m.start()]))
        if m.group(1) is not None:
            out.append(f"<code>{html.escape(m.group(1))}</code>")
        else:
            out.append(f"<strong>{html.escape(m.group(2))}</strong>")
        i = m.end()
    out.append(html.escape(text[i:]))
    return "".join(out)


def cell(text):
    t = text.strip()
    if t == "same":
        return '<span class="same">same</span>'
    # key combinations: "Super+C", "Meta+Alt+N / Meta+Alt+Shift+N", "Super+1–9, 0"
    if KEY_RE.match(t):
        parts = re.split(r"(\s+/\s+)", t)
        return "".join(f'<span class="sep"> / </span>' if re.fullmatch(r"\s+/\s+", p) else f"<kbd>{html.escape(p)}</kbd>"
                       for p in parts)
    return inline(t)


def convert(md):
    lines = md.splitlines()
    body, i, toc = [], 0, []
    while i < len(lines):
        line = lines[i]
        if line.startswith("# "):
            body.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.startswith("## "):
            title = line[3:]
            anchor = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            toc.append((anchor, title))
            body.append(f'<h2 id="{anchor}">{inline(title)}</h2>')
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, data = rows[0], [r for r in rows[1:] if not re.fullmatch(r"\s*-+\s*", r[0])]
            body.append("<table><thead><tr>" + "".join(f"<th>{inline(h.strip())}</th>" for h in head) + "</tr></thead><tbody>")
            for r in data:
                body.append("<tr>" + "".join(f"<td>{cell(c)}</td>" for c in r) + "</tr>")
            body.append("</tbody></table>")
            continue
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline(lines[i][2:])}</li>")
                i += 1
            body.append("<ul>" + "".join(items) + "</ul>")
            continue
        elif line.strip():
            body.append(f"<p>{inline(line)}</p>")
        i += 1
    nav = "".join(f'<a href="#{a}">{html.escape(t)}</a>' for a, t in toc)
    return PAGE.replace("@NAV@", nav).replace("@BODY@", "\n".join(body))


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HyprKWin Keybindings</title>
<style>
  :root { --bg:#1e1e2e; --panel:#313244; --line:#45475a; --fg:#cdd6f4; --dim:#9399b2; --a:#33ccff; --b:#00ff99; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 "Noto Sans", "Segoe UI", system-ui, sans-serif; }
  header { position:sticky; top:0; z-index:2; background:rgba(30,30,46,.96); border-bottom:1px solid var(--line); }
  header .bar { height:3px; background:linear-gradient(90deg, var(--a), var(--b)); }
  header .in { max-width:1100px; margin:0 auto; padding:12px 24px; display:flex; flex-wrap:wrap; align-items:center; gap:6px 18px; }
  header .t { font-weight:700; margin-right:8px; }
  header input { margin-left:auto; flex:0 0 auto; background:var(--panel); border:1px solid var(--line); color:var(--fg); border-radius:8px;
                 padding:7px 12px; font:inherit; width:240px; }
  header input:focus { outline:none; border-color:var(--a); }
  nav { display:flex; flex-wrap:wrap; gap:4px 16px; flex:1 1 520px; }
  nav a { color:var(--dim); text-decoration:none; font-size:13.5px; white-space:nowrap; }
  nav a:hover { color:var(--a); }
  main { max-width:1100px; margin:0 auto; padding:8px 24px 64px; }
  h1 { display:none; }
  h2 { margin:36px 0 10px; font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--a); scroll-margin-top:90px; }
  p, ul { max-width:820px; } li { margin:3px 0; }
  table { width:100%; border-collapse:collapse; margin:12px 0 6px; background:var(--panel); border-radius:10px; overflow:hidden; }
  th { text-align:left; font-size:12px; color:var(--dim); font-weight:600; padding:10px 14px; border-bottom:1px solid var(--line); }
  td { padding:9px 14px; border-top:1px solid rgba(69,71,90,.6); vertical-align:top; }
  tr:hover td { background:rgba(51,204,255,.05); }
  td:last-child { color:var(--dim); font-size:13.5px; }
  kbd { display:inline-block; font:12.5px ui-monospace, "JetBrains Mono", monospace; background:#45475a; border:1px solid #585b70;
        border-bottom-width:2px; border-radius:5px; padding:1px 7px; white-space:nowrap; }
  .sep { color:var(--dim); }
  .same { color:var(--dim); font-style:italic; }
  code { font:13px ui-monospace, "JetBrains Mono", monospace; background:var(--panel); border-radius:4px; padding:1px 5px; }
  strong { color:#fff; }
  .hidden { display:none; }
  footer { color:var(--dim); font-size:13px; margin-top:40px; }
  @media print {
    body { background:#fff; color:#000; } header { position:static; } header input, nav { display:none; }
    table { background:#fff; } td, th { border-color:#ccc; } kbd { background:#eee; border-color:#bbb; } h2 { color:#000; }
    strong { color:#000; } td:last-child, .same, footer { color:#555; }
  }
</style>
</head>
<body>
<header><div class="bar"></div><div class="in">
  <span class="t">HyprKWin Keybindings</span>
  <nav>@NAV@</nav>
  <input id="q" type="search" placeholder="Filter keys or actions…" autofocus>
</div></header>
<main>
@BODY@
<footer>Also on screen any time: Super+Shift+G. Change keys in System Settings → Keyboard → Shortcuts (search "HyprKWin").</footer>
</main>
<script>
  // filter table rows as you type
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const f = q.value.trim().toLowerCase();
    document.querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('hidden', f && !tr.textContent.toLowerCase().includes(f)));
    document.querySelectorAll('table').forEach(t => t.classList.toggle('hidden', f && !t.querySelector('tbody tr:not(.hidden)')));
  });
</script>
</body>
</html>
"""

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        out = convert(f.read())
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
