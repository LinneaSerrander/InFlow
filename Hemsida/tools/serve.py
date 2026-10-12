"""Local dev server for the website.

    python tools/serve.py        (then open http://localhost:5500)

Same as `python -m http.server`, plus:
- data/kurser.json is rebuilt from InFlow/Kurser/*/schedule.yaml on every request for it,
  so new or edited course files show up just by refreshing the page.
- Caching is turned off, so edited CSS/JS is always picked up.
"""

import functools
import http.server
import sys

from build_courses import SITE_ROOT, build_bundle

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] == "/data/kurser.json":
            try:
                build_bundle()
            except SystemExit as error:  # e.g. the Kurser folder is missing
                self.send_error(500, str(error))
                return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(DevHandler, directory=str(SITE_ROOT))
    with http.server.ThreadingHTTPServer(("", PORT), handler) as server:
        print(f"Serving {SITE_ROOT} at http://localhost:{PORT}")
        server.serve_forever()
