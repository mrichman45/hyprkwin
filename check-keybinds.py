#!/usr/bin/env python3
"""
check-keybinds.py — find keybinding conflicts between HyprKWin and KDE.

Reads KDE's global shortcuts file (~/.config/kglobalshortcutsrc), finds every key that is
bound to more than one action, and points out HyprKWin keys that KDE refused to register
(KDE gives a key to whoever claimed it first and silently drops the second).

    ./check-keybinds.py            conflicts that involve HyprKWin
    ./check-keybinds.py --all      every conflict, KDE vs KDE included
    ./check-keybinds.py --list     every HyprKWin binding and what it does
    ./check-keybinds.py --file F   check another shortcuts file

Exit code: 0 = no HyprKWin conflicts, 1 = conflicts found, 2 = file not found.
Standard library only.
"""
import argparse
import os
import re
import sys
from collections import defaultdict

MODIFIERS = ["Meta", "Ctrl", "Alt", "Shift"]
MOD_ALIASES = {"meta": "Meta", "super": "Meta", "win": "Meta", "ctrl": "Ctrl", "control": "Ctrl",
               "alt": "Alt", "shift": "Shift"}
# US layout: KDE sometimes stores Meta+Shift+1 as Meta+!  — treat them as the same key
SHIFTED = {"!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
           "_": "-", "+": "=", "{": "[", "}": "]", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/", "~": "`", "|": "\\"}
KEY_ALIASES = {"return": "Return", "enter": "Return", "esc": "Escape", "escape": "Escape", "space": "Space",
               "left": "Left", "right": "Right", "up": "Up", "down": "Down", "tab": "Tab", "del": "Delete",
               "delete": "Delete", "backspace": "Backspace", "print": "Print", "pgup": "PgUp", "pgdown": "PgDown",
               "home": "Home", "end": "End", "ins": "Ins", "insert": "Ins"}

HYPR_PREFIX = "HyprKWin: "


# ---------------------------------------------------------------- KConfig parsing
def unescape(v):
    out, i = [], 0
    while i < len(v):
        c = v[i]
        if c == "\\" and i + 1 < len(v):
            n = v[i + 1]
            out.append({"t": "\t", "n": "\n", "s": " ", "\\": "\\", "r": "\r"}.get(n, "\\" + n))
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def read_kconfig(path):
    groups = defaultdict(dict)
    group = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line.startswith("["):
                group = tuple(re.findall(r"\[([^\]]*)\]", line))
                continue
            if group is None or "=" not in line:
                continue
            k, v = line.split("=", 1)
            groups[group][k.strip()] = unescape(v)
    return groups


def split_fields(value):
    """'active,default,friendly' — but a key can itself be ',' (Meta+Alt+,), so a comma that
    directly follows '+' (or starts a field) belongs to the key."""
    fields, cur, i = [], [], 0
    while i < len(value):
        c = value[i]
        if c == "\\" and i + 1 < len(value) and value[i + 1] == ",":
            cur.append(",")          # KDE writes the comma key as "\,"
            i += 2
            continue
        if c == "," and len(fields) < 2:
            prev = cur[-1] if cur else ""
            if prev in ("+", "\t") or (not cur and i + 1 < len(value) and value[i + 1] in ",\t"):
                cur.append(c)
            else:
                fields.append("".join(cur))
                cur = []
        else:
            cur.append(c)
        i += 1
    fields.append("".join(cur))
    return fields


def split_keys(field):
    return [k for k in (x.strip() for x in field.split("\t")) if k and k.lower() != "none"]


# ---------------------------------------------------------------- key normalisation
def canon(key):
    """'Meta+Shift+!' -> ('Meta+Shift+1'); modifier order and case don't matter."""
    s = key.strip()
    if not s:
        return None
    parts = s.split("+")
    # 'Meta++' means the '+' key
    if s.endswith("++"):
        parts = s[:-2].split("+") + ["+"]
    elif s == "+":
        parts = ["+"]
    *mods, base = parts
    mods = {MOD_ALIASES.get(m.strip().lower(), m.strip()) for m in mods if m.strip()}
    base = base.strip()
    if base in SHIFTED:
        mods.add("Shift")
        base = SHIFTED[base]
    if len(base) == 1:
        base = base.upper()
    else:
        base = KEY_ALIASES.get(base.lower(), base[:1].upper() + base[1:])
    ordered = [m for m in MODIFIERS if m in mods] + sorted(m for m in mods if m not in MODIFIERS)
    return "+".join(ordered + [base])


# ---------------------------------------------------------------- collect bindings
def collect(groups):
    """-> list of dicts: component, action, label, active[], default[]"""
    out = []
    for group, entries in groups.items():
        if not group:
            continue
        services = group[0] == "services"           # Plasma 6: [services][app.desktop] key=shortcuts
        component = group[-1]
        friendly_component = entries.get("_k_friendly_name", pretty_component(component))
        for action, value in entries.items():
            if action.startswith("_k_"):
                continue
            if services:
                active, default, label = split_keys(value), [], action
                raw_default, raw_label = "", ""
            else:
                f = split_fields(value)
                active = split_keys(f[0]) if f else []
                default = split_keys(f[1]) if len(f) > 1 else []
                label = f[2] if len(f) > 2 and f[2] else action
                raw_default = f[1] if len(f) > 1 else ""
                raw_label = f[2] if len(f) > 2 else ""
            out.append({"component": component, "component_name": friendly_component, "action": action,
                        "label": label, "active": active, "default": default, "services": services,
                        "group": group, "raw_default": raw_default, "raw_label": raw_label})
    # a [services] entry overrides the same app's old-style entry
    seen = {(b["component"], b["action"]) for b in out if b["services"]}
    return [b for b in out if b["services"] or (b["component"], b["action"]) not in seen]


def pretty_component(c):
    name = c[:-8] if c.endswith(".desktop") else c
    return name.split(".")[-1] if "." in name else name


def is_hypr(b):
    return b["component"] == "kwin" and b["action"].startswith(HYPR_PREFIX)


def describe(b):
    if is_hypr(b):
        return "HyprKWin  " + b["label"][len(HYPR_PREFIX):] if b["label"].startswith(HYPR_PREFIX) else b["label"]
    label = "launch" if b["label"] == "_launch" else b["label"]
    return f"{b['component_name']:<14} {label}"


# ---------------------------------------------------------------- report
def color(enabled):
    if not enabled:
        return lambda code, s: s
    return lambda code, s: f"\033[{code}m{s}\033[0m"


def main():
    ap = argparse.ArgumentParser(description="Find HyprKWin / KDE keybinding conflicts.")
    ap.add_argument("--all", action="store_true", help="also show KDE-vs-KDE conflicts")
    ap.add_argument("--list", action="store_true", help="list every HyprKWin binding")
    ap.add_argument("--file", default=os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")),
                                                   "kglobalshortcutsrc"))
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--fix", action="store_true",
                    help="clear one side of every HyprKWin conflict (backs the file up first)")
    ap.add_argument("--quiet", action="store_true", help="with --fix: only print what changed")
    ap.add_argument("--keep", action="append", default=[], metavar="KEY",
                    help="with --fix: a key KDE keeps no matter what (Meta+Alt+G is always kept)")
    args = ap.parse_args()
    c = color(sys.stdout.isatty() and not args.no_color)

    if not os.path.exists(args.file):
        print(f"Can't find {args.file}. Is this a KDE Plasma session?")
        return 2

    binds = collect(read_kconfig(args.file))
    hypr = [b for b in binds if is_hypr(b)]

    if not hypr:
        print(c("33", "No HyprKWin shortcuts in the file yet.") +
              " Turn HyprKWin on (and log out and in once) so KDE registers them, then run this again.")

    if args.list:
        print(c("1", f"HyprKWin bindings ({len(hypr)})"))
        for b in sorted(hypr, key=lambda b: b["action"]):
            keys = ", ".join(b["active"]) or c("2", "unbound")
            print(f"  {keys:<26} {describe(b)}")
        print()

    by_key = defaultdict(list)
    for b in binds:
        for k in b["active"]:
            ck = canon(k)
            if ck:
                by_key[ck].append((k, b))

    conflicts = {k: v for k, v in by_key.items() if len({(b["component"], b["action"]) for _, b in v}) > 1}
    hypr_conflicts = {k: v for k, v in conflicts.items() if any(is_hypr(b) for _, b in v)}
    other_conflicts = {k: v for k, v in conflicts.items() if k not in hypr_conflicts}

    # HyprKWin actions that have a default key but no active one: KDE refused it (taken) or it was cleared
    refused = []
    for b in hypr:
        if b["default"] and not b["active"]:
            holders = [x for _, x in by_key.get(canon(b["default"][0]), []) if not is_hypr(x)]
            refused.append((b, holders))

    if args.fix and args.quiet:
        return fix(args, binds, hypr_conflicts, c)

    def show(title, items, code):
        print(c(code, c("1", title)))
        for key in sorted(items):
            print(f"  {c('1', key)}")
            for raw, b in items[key]:
                tag = c("36", "  ◆ ") if is_hypr(b) else "    "
                print(f"  {tag}{describe(b)}")
        print()

    if hypr_conflicts:
        show(f"Conflicts with HyprKWin ({len(hypr_conflicts)} keys)", hypr_conflicts, "31")
    elif hypr:
        print(c("32", "No HyprKWin key is shared with a KDE shortcut.") + "\n")

    if refused:
        print(c("33", c("1", f"HyprKWin keys KDE didn't register ({len(refused)})")))
        for b, holders in refused:
            who = f" — taken by {' '.join(describe(holders[0]).split())}" if holders else " — cleared, or taken when it registered"
            print(f"  {b['default'][0]:<26} {describe(b)}{who}")
        print()

    if args.all and other_conflicts:
        show(f"KDE vs KDE conflicts ({len(other_conflicts)} keys)", other_conflicts, "33")
    elif other_conflicts:
        print(c("2", f"{len(other_conflicts)} more conflicts between KDE's own shortcuts (see --all)."))
        print()

    if args.fix:
        return fix(args, binds, hypr_conflicts, c)

    if hypr_conflicts or refused:
        print("To fix: System Settings → Keyboard → Shortcuts, search the key or action, clear it on the one you")
        print("don't need, then assign it to the other. Or rerun ./hyprland-feel.sh, which frees the usual clashes.")
        return 1
    return 0


# ---------------------------------------------------------------- --fix
def preset_keys():
    """Keys set by hyprland-feel.sh (stored as KeyOverrides in kwinrc)."""
    path = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "kwinrc")
    if not os.path.exists(path):
        return {}
    ov = read_kconfig(path).get(("Script-hyprkwin",), {}).get("KeyOverrides", "")
    out = {}
    for part in ov.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def is_preset_kde_action(b, preset):
    """KWin's 'Switch to Desktop N' / 'Window to Desktop N' belong to the preset when it set them."""
    return b["component"] == "kwin" and "kde-workspace" in preset and \
        re.fullmatch(r"(Switch to|Window to) Desktop ([1-9]|10)", b["action"]) is not None


# Keys that are never taken from KDE (your own shortcuts). Add more with --keep, or one per line
# in ~/.config/hyprkwin/keep.conf
PROTECTED = ["Meta+Alt+G"]


def protected_keys(extra=()):
    keys = list(PROTECTED) + list(extra)
    path = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "hyprkwin", "keep.conf")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            keys += [l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")]
    return {canon(k) for k in keys}


def plan_fix(binds, preset, protected):
    """Hyprland's keys win: in every clash HyprKWin (and the preset's workspace keys) keep the key and
       KDE's other use is cleared. Protected keys go the other way: KDE keeps them.
       -> [(group, action, new_value, dropped_keys, binding)]"""
    by_key = defaultdict(list)
    for b in binds:
        for k in b["active"]:
            by_key[canon(k)].append(b)

    def ours(b):
        return is_hypr(b) or is_preset_kde_action(b, preset)

    changes = []   # (binding, key to drop)
    for key, holders in by_key.items():
        if len({(b["component"], b["action"]) for b in holders}) < 2:
            continue
        if not any(ours(b) for b in holders):
            continue                       # KDE vs KDE: not ours to touch
        if key in protected:
            drop = [b for b in holders if ours(b)]
        else:
            drop = [b for b in holders if not ours(b)]
        for b in drop:
            changes.append((b, key))

    out, done = [], set()
    for b, key in changes:
        ident = (b["group"], b["action"])
        if ident in done:
            continue
        done.add(ident)
        drop = {canon(k) for bb, k in changes if (bb["group"], bb["action"]) == ident}
        remaining = [k for k in b["active"] if canon(k) not in drop]
        active = "\t".join(remaining) if remaining else "none"
        value = active if b["services"] else f"{active},{b['raw_default']},{b['raw_label']}"
        out.append((b["group"], b["action"], value, sorted(drop), b))
    return out


def kwrite(path, group, key, value=None):
    """kwriteconfig6 on a file in the config dir (by name) or anywhere else (by path). value None = delete."""
    import subprocess
    cfg = os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    target = os.path.basename(path) if os.path.dirname(os.path.abspath(path)) == os.path.abspath(cfg) else os.path.abspath(path)
    cmd = ["kwriteconfig6", "--file", target]
    for g in group:
        cmd += ["--group", g]
    cmd += ["--key", key]
    cmd += ["--delete"] if value is None else [value]
    subprocess.run(cmd, check=True)


def fix(args, binds, hypr_conflicts, c):
    import shutil

    if not shutil.which("kwriteconfig6"):
        print("kwriteconfig6 not found; can't change shortcuts.")
        return 2

    plan = plan_fix(binds, preset_keys(), protected_keys(args.keep))
    if not plan:
        if not args.quiet:
            print(c("32", "Nothing to fix: no HyprKWin conflicts."))
        return 0

    backup = args.file + ".hyprkwin-bak"
    if not os.path.exists(backup):
        shutil.copy2(args.file, backup)

    for group, action, value, drop, b in plan:
        kwrite(args.file, group, action, value)
        print(f"  cleared {', '.join(drop):<22} from {' '.join(describe(b).split())}")

    print(c("32", f"Fixed {len(plan)} shortcut(s).") + f" Backup: {backup}")
    print("Log out and back in once so KDE picks up the change.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
