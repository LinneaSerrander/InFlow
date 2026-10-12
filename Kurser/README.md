# Kurser

Every course is a folder here with a file called `schedule.yaml` in it, and
shows up on the website's Kursschema page. The `group:` lines also fill the "Grupp" dropdown
on the Intresseanmälan page (groups whose course has an `until` date in the
past are left out).

This folder sits next to the website (`InFlow/Hemsida/`), not inside it:

```
InFlow/
├── Hemsida/                 the website
└── Kurser/                  ← you are here
    ├── _mall.yaml           template (ignored)
    ├── 6-7_ekängen/
    │   └── schedule.yaml
    └── 8-9_ekängen/
        └── schedule.yaml
```

## Add a course
1. Make a new folder, e.g. `Kurser/halloween_2026/`. The folder name is the
   course's name in warnings and in the generated file (`halloween_2026.yaml`).
2. Copy `_mall.yaml` into it and rename the copy to **`schedule.yaml`**.
3. Fill in the fields — `day`, `start`, `end` and `title` are required.
4. Refresh the page (with the dev server running, see below).

Only files named exactly `schedule.yaml` are read — anything else in a
course folder (notes, pictures) is left alone. Folders starting with `_`
(e.g. `_arkiv/` for old courses) are skipped entirely. To remove a course,
delete its folder or move it into `_arkiv/`.

## A course on several days
Use `sessions` instead of `day`/`start`/`end` — the rest is written once:

```yaml
title: Dans 8-9 år
group: 8-9 år, Ekängen
place: Ekängens skola, gympasalen
sessions:
  - day: tue
    start: "19:00"
    end: "20:00"
  - day: thu
    start: "18:00"
    end: "19:00"
    place: Ekängens skola, matsalen   # optional: override for this day only
```

## Which weeks, and cancelled dates

```yaml
weeks: [34, 35, 36, "38-47", 49]   # week numbers; ranges allowed. Omit = every week
cancelled:                         # DD/MM/YYYY — shown with a red cross + "Inställt"
  - 21/09/2026: Sjukdom            # reason (optional) shows on hover
  - 15/10/2026
specific_info:                     # replaces the description on that date only
  - 14/09/2026: Ta med extra skor idag!
```

Put a colon after the date, then the text. (Writing the text on its own
line below the date, like `-Sjukdom`, also works — but the colon form is
the safest.) If the text contains a colon itself, put it in quotes:
`- 14/09/2026: "Obs: ny tid"`.

`weeks` has no year, so it repeats every year — update it each term. A
cancelled date only affects the session that falls on that date. Both can
also be put inside a single session to apply to that day only.

## Colors
Each course gets one of the default matte colors automatically (defined as
`--course-1`, `--course-2`, … in `css/tokens.css`), in alphabetical order of
title. To give a special course its own color:

```yaml
color: orange        # a CSS color name, or
color: "#e07b39"     # a hex code — in quotes!
```

Default colors that look like a custom color (similar hue) are then skipped
for the other courses, so nothing else ends up looking like it. Text is
switched between white and black automatically for readability.

A file may also hold several separate courses as a YAML list
(each starting with `- day: ...` or `- title: ...`).

## How the website gets these files
A website can only load files inside its own folder, so every `schedule.yaml`
is copied into one generated file, `Hemsida/data/kurser.json`, named after
its folder (`6-7_ekängen/schedule.yaml` → `6-7_ekängen.yaml`). The build
also lists any other `.yaml` file it finds, in case one was misnamed.
**Don't edit that file by hand** — edit the `.yaml` files here instead.

- Local development: run `python tools/serve.py` from `Hemsida/` (or the
  "site" preview) — it rebuilds `data/kurser.json` on every page load.
- Before publishing: run `python tools/build_courses.py` from `Hemsida/`, then
  upload `Hemsida/` (including `data/kurser.json`). This `Kurser/` folder
  itself is never uploaded.

## Something doesn't show up?
Open the browser's developer console (F12) on the Kursschema page. A course
with a mistake (e.g. `day: fredag` instead of `fri`, or `end` before `start`)
is skipped and the console says which file and what's wrong.
