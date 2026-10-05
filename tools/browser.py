"""A headless Edge/Chrome driven over the DevTools protocol.

One browser stays open for a whole run, so a hundred screenshots or a video's worth of
frames cost one start-up. Used by the creative pipeline, the README pictures and the tests.

    with Browser() as browser:
        page = browser.open("duel.html?seed=3&clock=manual", 360, 640, scale=2)
        page.evaluate("__playable.seek(4.2)")
        png = page.screenshot()

Needs the `websocket-client` package. `CHROME` can point at any Chromium.
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent.parent


# How the browser draws WebGL. The graphics card is many times faster; PLAYABLE_GL=software
# is for machines without one (a CI runner, say).
GRAPHICS = {
    "gpu": ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
    "software": ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
}


def find_browser() -> str | None:
    named = os.environ.get("CHROME")
    if named:
        return named
    for candidate in (r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
                      r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
                      r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"):
        path = os.path.expandvars(candidate)
        if os.path.exists(path):
            return path
    for name in ("msedge", "chrome", "chromium", "chromium-browser", "google-chrome"):
        if shutil.which(name):
            return shutil.which(name)
    return None


def dist_url(page: str) -> str:
    """`duel.html?seed=3` -> the file:// address of that page in dist/."""
    name, _, query = page.partition("?")
    return (ROOT / "dist" / name).resolve().as_uri() + ("?" + query if query else "")


class Page:
    def __init__(self, socket_url: str):
        # Checking UTF-8 in pure Python costs 200 ms on a frame-sized message; the browser's JSON is trusted.
        self.ws = websocket.create_connection(socket_url, suppress_origin=True, timeout=120, skip_utf8_validation=True)
        self.next_id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method: str, params: dict | None = None) -> dict:
        self.next_id += 1
        try:
            self.ws.send(json.dumps({"id": self.next_id, "method": method, "params": params or {}}))
            while True:
                message = self._answer()
                if message is not None:
                    return message
        except websocket.WebSocketException as error:
            raise ConnectionError(f"the browser went away during {method}") from error

    def _answer(self) -> dict | None:
        """The answer to the last command, or None for a message that is not it."""
        message = json.loads(self.ws.recv())
        if True:
            if message.get("id") != self.next_id:
                return None                     # an event, or an answer nobody is waiting for
            if "error" in message:
                raise RuntimeError(message["error"].get("message"))
            return message["result"]

    def evaluate(self, expression: str):
        """The value of a JavaScript expression; a promise is awaited."""
        result = self.send("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in result:
            detail = result["exceptionDetails"]
            raise RuntimeError(detail.get("exception", {}).get("description") or detail.get("text"))
        return result["result"].get("value")

    def wait_for(self, expression: str, seconds: float = 60) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self.evaluate(expression):
                return
            time.sleep(0.05)
        raise TimeoutError(f"still false after {seconds}s: {expression}")

    def goto(self, url: str, width: int, height: int, scale: float = 1.0) -> None:
        self.send("Emulation.setDeviceMetricsOverride",
                  {"width": width, "height": height, "deviceScaleFactor": scale, "mobile": False})
        self.send("Page.navigate", {"url": url})
        self.wait_for("!!document.documentElement && document.documentElement.getAttribute('data-ready') === '1'")

    def screenshot(self, kind: str = "png", quality: int = 90) -> bytes:
        params = {"format": kind, "fromSurface": True}
        if kind == "jpeg":
            params["quality"] = quality
        return base64.b64decode(self.send("Page.captureScreenshot", params)["data"])

    def data(self) -> dict[str, str]:
        """The data-* attributes the ad left on <html> (events, phase, simulation...)."""
        return self.evaluate("Object.assign({}, document.documentElement.dataset)")

    def close(self) -> None:
        try:
            self.send("Page.close")
        except Exception:
            pass
        self.ws.close()


class Browser:
    def __init__(self):
        exe = find_browser()
        if not exe:
            sys.exit("no Chromium found; set CHROME to one")
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.profile = tempfile.mkdtemp(prefix="playable-")
        self.process = subprocess.Popen(
            [exe, "--headless=new", f"--remote-debugging-port={self.port}", "--remote-allow-origins=*",
             f"--user-data-dir={self.profile}", "--no-first-run", "--hide-scrollbars", "--mute-audio",
             *GRAPHICS[os.environ.get("PLAYABLE_GL", "gpu")], "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 30
        while True:
            try:
                self._http("/json/version")
                break
            except OSError:
                if time.time() > deadline:
                    self.close()
                    raise TimeoutError("the browser did not open its debugging port")
                time.sleep(0.1)

    def _http(self, path: str, method: str = "GET") -> dict:
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())

    def open(self, page: str, width: int, height: int, scale: float = 1.0) -> Page:
        """Opens a page of dist/ in a new tab at exactly that viewport."""
        tab = Page(self._http("/json/new?about:blank", "PUT")["webSocketDebuggerUrl"])
        tab.goto(dist_url(page), width, height, scale)
        return tab

    def close(self) -> None:
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
        shutil.rmtree(self.profile, ignore_errors=True)

    def __enter__(self) -> Browser:
        return self

    def __exit__(self, *_) -> None:
        self.close()
