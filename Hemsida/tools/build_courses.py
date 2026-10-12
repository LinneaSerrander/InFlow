"""Bundle the course files into Hemsida/data/kurser.json for the website.

The course files live OUTSIDE the website folder, in InFlow/Kurser/:
one folder per course, each with a file called schedule.yaml, e.g.

    Kurser/6-7_ekängen/schedule.yaml

A browser can only load files inside the site, so this script copies every
schedule.yaml into one generated file inside it, naming each one after its
folder ("6-7_ekängen.yaml"):

    python tools/build_courses.py

Run it before publishing the site. (The dev server in tools/serve.py runs it
automatically on every page load.)

Folders whose name starts with "_" (e.g. an _arkiv folder) are skipped.
The YAML itself is parsed in the browser (js/courses.js), so this script only
needs Python's standard library.
"""

import json
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent  # InFlow/Hemsida
COURSES_DIR = SITE_ROOT.parent / "Kurser"           # InFlow/Kurser
BUNDLE_FILE = SITE_ROOT / "data" / "kurser.json"
COURSE_FILE_NAME = "schedule.yaml"


def course_files():
    """The schedule.yaml of every course folder, sorted by folder name."""
    if not COURSES_DIR.is_dir():
        raise SystemExit(f"Course folder not found: {COURSES_DIR}")
    folders = sorted(
        (d for d in COURSES_DIR.iterdir() if d.is_dir() and not d.name.startswith("_")),
        key=lambda d: d.name.lower(),
    )
    return [d / COURSE_FILE_NAME for d in folders if (d / COURSE_FILE_NAME).is_file()]


def ignored_yaml_files():
    """YAML files that won't be used — most likely a misnamed schedule.yaml."""
    used = set(course_files())
    return sorted(
        path for path in COURSES_DIR.rglob("*")
        if path.suffix.lower() in (".yaml", ".yml")
        and path not in used
        and not any(part.startswith("_") for part in path.relative_to(COURSES_DIR).parts)
    )


def build_bundle():
    files = [
        {
            # Named after the folder: Kurser/6-7_ekängen/schedule.yaml -> "6-7_ekängen.yaml"
            "path": f"{path.parent.name}.yaml",
            "yaml": path.read_text(encoding="utf-8-sig"),
        }
        for path in course_files()
    ]
    content = json.dumps({"files": files}, ensure_ascii=False, indent=2) + "\n"

    # Only touch the file when something actually changed
    BUNDLE_FILE.parent.mkdir(exist_ok=True)
    if not BUNDLE_FILE.exists() or BUNDLE_FILE.read_text(encoding="utf-8") != content:
        BUNDLE_FILE.write_text(content, encoding="utf-8")
    return [f["path"] for f in files]


if __name__ == "__main__":
    found = build_bundle()
    print(f"Wrote {BUNDLE_FILE.relative_to(SITE_ROOT)} with {len(found)} course file(s) from {COURSES_DIR}:")
    for name in found:
        print(f"  - {name}")
    for path in ignored_yaml_files():
        print(f"  ! ignored {path.relative_to(COURSES_DIR).as_posix()} — only files named {COURSE_FILE_NAME} are used")
