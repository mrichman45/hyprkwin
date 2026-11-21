"""Tests for the shortcut tools, the on/off switch and Setup, using stand-ins for KDE's tools (tests/stubs).
Run: python3 -m unittest discover tests
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUBS = os.path.join(ROOT, "tests", "stubs")
sys.dont_write_bytecode = True


def load_checker():
    spec = importlib.util.spec_from_file_location("check_keybinds", os.path.join(ROOT, "check-keybinds.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


K = load_checker()

KWINRC = "[Plugins]\nblurEnabled=true\n\n[Windows]\nFocusPolicy=ClickToFocus\n\n[Desktops]\nNumber=4\n"
SHORTCUTS = (
    "[kwin]\n_k_friendly_name=KWin\n"
    "Window Quick Tile Left=Meta+Left,Meta+Left,Quick Tile Window to the Left\n"
    "Edit Tiles=Meta+T,Meta+T,Toggle Tiles Editor\n"
    "Switch Window Left=Meta+Alt+Left,Meta+Alt+Left,Switch to Window to the Left\n\n"
    "[plasmashell]\nactivate task manager entry 1=Meta+1,Meta+1,Activate Task Manager Entry 1\n"
    "next activity=Meta+Alt+P,Meta+Alt+P,Move keyboard focus between panels\n\n"
    "[plasmashell.icontasks-2]\n_k_friendly_name=Icons-Only Task Manager 2\n"
    "activate task manager entry 1=Meta+1\\tAlt+1,Meta+1,Activate Dock Entry 1\n\n"
    "[services][gpu-mode-cycle.desktop]\n_launch=Meta+Alt+G\n\n"
    "[services][org.kde.spectacle.desktop]\nRectangularRegionScreenShot=Meta+Shift+S\\tMeta+Shift+Print\n"
)


class Home:
    """A throwaway home folder with KDE config files and the stand-in tools on PATH."""

    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="hyprkwin-test-")
        self.cfg = os.path.join(self.dir, ".config")
        os.makedirs(self.cfg)
        with open(os.path.join(self.cfg, "kwinrc"), "w") as f:
            f.write(KWINRC)
        with open(os.path.join(self.cfg, "kglobalshortcutsrc"), "w") as f:
            f.write(SHORTCUTS)
        self.env = dict(os.environ, HOME=self.dir, XDG_CONFIG_HOME=self.cfg,
                        XDG_DATA_HOME=os.path.join(self.dir, ".local", "share"),
                        XDG_CACHE_HOME=os.path.join(self.dir, ".cache"),
                        PATH=STUBS + os.pathsep + "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE="1")
        self.env.pop("WAYLAND_DISPLAY", None)
        self.env.pop("DISPLAY", None)

    def run(self, *cmd, stdin=""):
        return subprocess.run(list(cmd), env=self.env, input=stdin, capture_output=True, text=True, timeout=120)

    def read(self, name):
        return K.read_kconfig(os.path.join(self.cfg, name))

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def diff(a, b):
    return [(g, k) for g in set(a) | set(b) for k in set(a.get(g, {})) | set(b.get(g, {}))
            if a.get(g, {}).get(k) != b.get(g, {}).get(k)]


class ShortcutFile(unittest.TestCase):
    def test_escaped_comma_key(self):
        f = K.split_fields("Meta+Alt+\\,,none,HyprKWin: scrolling: move -col")
        self.assertEqual(f[0], "Meta+Alt+,")
        self.assertEqual(f[2], "HyprKWin: scrolling: move -col")

    def test_shifted_symbols_match_shift_digits(self):
        self.assertEqual(K.canon("Meta+!"), K.canon("Meta+Shift+1"))
        self.assertEqual(K.canon("shift+meta+s"), K.canon("Meta+Shift+S"))

    def test_fix_favours_hyprland_and_keeps_protected_keys(self):
        binds = K.collect(K.read_kconfig_text(SHORTCUTS)) if hasattr(K, "read_kconfig_text") else None
        if binds is None:
            with tempfile.NamedTemporaryFile("w", suffix="rc", delete=False) as f:
                f.write(SHORTCUTS + "\n[kwin]\nHyprKWin: toggle-tiling=Meta+T,Meta+Alt+T,HyprKWin: toggle\n"
                                    "HyprKWin: glossary=Meta+Alt+G,Meta+Shift+G,HyprKWin: keybinding glossary\n")
            binds = K.collect(K.read_kconfig(f.name))
            os.unlink(f.name)
        plan = {(g, a): v for g, a, v, _, _ in K.plan_fix(binds, {}, {K.canon("Meta+Alt+G")})}
        self.assertTrue(plan[(("kwin",), "Edit Tiles")].startswith("none,"), "KDE's tile editor gives Meta+T up")
        self.assertTrue(plan[(("kwin",), "HyprKWin: glossary")].startswith("none,"), "Meta+Alt+G stays with KDE")
        self.assertNotIn((("services", "gpu-mode-cycle.desktop"), "_launch"), plan)


class Switch(unittest.TestCase):
    def setUp(self):
        self.h = Home()
        self.cli = os.path.join(ROOT, "hyprkwin")
        # the switch reads the script's shortcut list from the installed copy
        dest = os.path.join(self.h.env["XDG_DATA_HOME"], "kwin", "scripts", "hyprkwin")
        shutil.copytree(os.path.join(ROOT, "script"), dest)

    def tearDown(self):
        self.h.close()

    def test_on_then_off_restores_kde_exactly(self):
        before_rc, before_sc = self.h.read("kwinrc"), self.h.read("kglobalshortcutsrc")
        r = self.h.run(sys.executable, self.cli, "on")
        self.assertEqual(r.returncode, 0, r.stderr)
        sc = self.h.read("kglobalshortcutsrc")
        self.assertTrue(sc[("kwin",)]["HyprKWin: focus-left"].startswith("Meta+Left,"))
        self.assertTrue(sc[("kwin",)]["Window Quick Tile Left"].startswith("none,"))
        self.assertEqual(sc[("services", "gpu-mode-cycle.desktop")]["_launch"], "Meta+Alt+G")
        self.assertEqual(self.h.read("kwinrc")[("Windows",)]["FocusPolicy"], "FocusFollowsMouse")
        clash = self.h.run(sys.executable, self.cli, "check", "--no-color")
        self.assertIn("No HyprKWin key is shared", clash.stdout)

        r = self.h.run(sys.executable, self.cli, "off")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(diff(before_sc, self.h.read("kglobalshortcutsrc")), [])
        self.assertEqual(sorted(diff(before_rc, self.h.read("kwinrc"))),
                         [(("Plugins",), "hyprkwinEnabled"), (("Plugins",), "hyprkwin_animationsEnabled")],
                         "only the two on/off flags differ")
        # the two on/off flags are switched off, everything else is as before
        rc = self.h.read("kwinrc")
        self.assertEqual(rc[("Plugins",)].get("hyprkwinEnabled"), "false")

    def test_gaming_desktop_setting(self):
        self.h.run(sys.executable, self.cli, "gaming-desktop", "4")
        g = self.h.read("kwinrc")[("Script-hyprkwin",)]
        self.assertEqual(g["TilingDefault"], "2")
        self.assertEqual(g["TiledDesktops"], "1, 2, 3, 5, 6, 7, 8, 9, 10")
        self.assertEqual(self.h.run(sys.executable, self.cli, "gaming-desktop", "--show").stdout.strip(), "desktop 4")
        self.h.run(sys.executable, self.cli, "gaming-desktop", "none")
        self.assertEqual(self.h.read("kwinrc")[("Script-hyprkwin",)]["TilingDefault"], "0")


class Setup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["sh", os.path.join(ROOT, "tools", "build-setup.sh")], check=True, capture_output=True)
        cls.setup = os.path.join(ROOT, "dist", "HyprKWin-Setup.sh")

    def test_install_and_uninstall_leave_kde_as_it_was(self):
        h = Home()
        try:
            before_rc, before_sc = h.read("kwinrc"), h.read("kglobalshortcutsrc")
            r = h.run("sh", self.setup, "--install", "--on", "--gaming-desktop=3")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            data = os.path.join(h.env["XDG_DATA_HOME"])
            for p in ("kwin/scripts/hyprkwin/metadata.json", "kwin/effects/hyprkwin_animations/metadata.json",
                      "hyprkwin/cheatsheet.html", "hyprkwin/uninstall.sh", "applications/hyprkwin.desktop"):
                self.assertTrue(os.path.exists(os.path.join(data, p)), p)
            self.assertIn("mode: on", h.run(os.path.join(h.dir, ".local", "bin", "hyprkwin"), "status").stdout)
            self.assertEqual(h.run(os.path.join(h.dir, ".local", "bin", "hyprkwin"), "gaming-desktop", "--show").stdout.strip(),
                             "desktop 3")

            r = h.run("sh", self.setup, "--uninstall")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertFalse(os.path.exists(os.path.join(h.dir, ".local", "bin", "hyprkwin")))
            self.assertFalse(os.path.exists(os.path.join(data, "hyprkwin")))
            self.assertFalse(os.path.exists(os.path.join(data, "kwin", "scripts", "hyprkwin")))
            self.assertEqual(diff(before_sc, h.read("kglobalshortcutsrc")), [])
            self.assertEqual(diff(before_rc, h.read("kwinrc")), [])
        finally:
            h.close()


if __name__ == "__main__":
    unittest.main()
