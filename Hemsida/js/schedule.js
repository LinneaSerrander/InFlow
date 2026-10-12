/*
 * Kursschema — the courses are NOT edited here.
 *
 * Courses are loaded from InFlow/Kurser/ by js/courses.js (loaded before
 * this script in kursschema.html, after js-yaml).
 */
let COURSES = [];

// The grid runs from the earliest start to the latest end of the courses
// currently shown (this week + group filter), plus this many empty hours around them.
const PADDING_HOURS = 1;

// Hours shown when no courses are visible
const DEFAULT_FIRST_HOUR = 16;
const DEFAULT_LAST_HOUR = 21;

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const formatDay = (date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

function formatRange(monday) {
  const sunday = addDays(monday, 6);
  const start = monday.getMonth() === sunday.getMonth() ? monday.getDate() : formatDay(monday);
  return `${start} – ${formatDay(sunday)} ${sunday.getFullYear()}`;
}

const runsOn = (course, date) =>
  (!course.from || date >= parseDate(course.from)) &&
  (!course.until || date <= parseDate(course.until)) &&
  (!course.weeks || course.weeks.has(weekNumber(date)));

const isCancelled = (course, date) => course.cancelled.has(dateKey(date));

// Notes for one date (a cancel reason, or specific_info). Empty list if none.
const notesOn = (notes, date) => notes.get(dateKey(date)) || [];

/* ---------- Course colors ---------- */

// A default color counts as "taken" by a course's own color if their hues are
// within this many degrees (so a custom orange also blocks the default mustard).
const SIMILAR_HUE_DEGREES = 25;

const colorCanvas = document.createElement("canvas").getContext("2d");

// Any CSS color ("orange", "#e07b39", "rgb(...)") -> { r, g, b }, or null if invalid
function parseColor(value) {
  if (!value || !CSS.supports("color", value)) return null;
  colorCanvas.fillStyle = "#000";
  colorCanvas.fillStyle = value;
  const normalized = colorCanvas.fillStyle; // "#rrggbb" or "rgba(r, g, b, a)"
  if (normalized.startsWith("#")) {
    const n = parseInt(normalized.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const [r, g, b] = normalized.match(/[\d.]+/g).map(Number);
  return { r, g, b };
}

function toHsl({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((v) => v / 255);
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function similarColors(a, b) {
  const A = toHsl(a);
  const B = toHsl(b);
  const greyish = (c) => c.s < 0.15;
  if (greyish(A) || greyish(B)) return greyish(A) && greyish(B) && Math.abs(A.l - B.l) < 0.15;
  const diff = Math.abs(A.h - B.h);
  return Math.min(diff, 360 - diff) < SIMILAR_HUE_DEGREES;
}

// White or near-black text, whichever reads better on the background
function textColorFor({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

// The default palette: --course-1, --course-2, ... from css/tokens.css
function defaultPalette() {
  const styles = getComputedStyle(document.documentElement);
  const palette = [];
  for (let i = 1; ; i++) {
    const value = styles.getPropertyValue(`--course-${i}`).trim();
    if (!value) break;
    const rgb = parseColor(value);
    if (rgb) palette.push({ value, rgb });
  }
  return palette;
}

// Sessions of the same course share a color
const courseKey = (course) => `${course.title}|${course.group || ""}`;

// Sets course.bg / course.fg. Courses with their own "color:" keep it; the
// rest get default colors in alphabetical order, skipping any default that's
// too close to a custom color.
function assignColors(courses) {
  const custom = [];
  for (const course of courses) {
    if (!course.color) continue;
    course.rgb = parseColor(course.color);
    if (course.rgb) custom.push(course.rgb);
    else {
      console.warn(`Kursschema: ${course.source} — color "${course.color}" isn't a color (ignored)`);
      course.color = "";
    }
  }

  const palette = defaultPalette();
  const free = palette.filter((p) => !custom.some((rgb) => similarColors(rgb, p.rgb)));
  const pool = free.length ? free : palette; // every default taken: reuse them rather than none

  const keys = [...new Set(courses.filter((c) => !c.color).map(courseKey))]
    .sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
  const byKey = new Map(keys.map((key, i) => [key, pool[i % pool.length]]));

  for (const course of courses) {
    const color = course.color ? { value: course.color, rgb: course.rgb } : byKey.get(courseKey(course));
    if (!color) continue; // no palette defined: CSS fallback color is used
    course.bg = color.value;
    course.fg = textColorFor(color.rgb);
  }
  return courses;
}

/* ---------- Rendering ---------- */

// The hours to show for a set of courses: earliest start to latest end, plus padding
function hourRange(courses) {
  if (!courses.length) return { firstHour: DEFAULT_FIRST_HOUR, lastHour: DEFAULT_LAST_HOUR };
  return {
    firstHour: Math.max(0, Math.floor(Math.min(...courses.map((c) => toHours(c.start)))) - PADDING_HOURS),
    lastHour: Math.min(24, Math.ceil(Math.max(...courses.map((c) => toHours(c.end)))) + PADDING_HOURS),
  };
}

function renderSlot(course, dayName, date, id, { firstHour, lastHour }) {
  const time = `${course.start}–${course.end}`;
  const cancelled = isCancelled(course, date);
  const cancelReasons = notesOn(course.cancelled, date);
  const dayInfo = notesOn(course.specificInfo, date);

  // specific_info for this date replaces the usual description
  const infoHtml = dayInfo.length
    ? dayInfo.map((text) => `<p class="slot__day-info">${escapeHtml(text)}</p>`).join("")
    : course.description ? `<p>${escapeHtml(course.description)}</p>` : "";

  const cancelHtml = cancelled
    ? `<div class="slot__cancelled-note">
        <strong>Inställt ${dayName.toLowerCase()} ${formatDay(date)}</strong>
        ${cancelReasons.map((text) => `<span>${escapeHtml(text)}</span>`).join("")}
      </div>`
    : "";
  const rows = [
    ["Tid", `${dayName} ${formatDay(date)}, ${time}`],
    ["Grupp", course.group],
    ["Plats", course.place],
    ["Ledare", course.leader],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");

  // Late courses open their popup upwards so it stays inside the schedule
  const opensUp = toHours(course.start) - firstHour > (lastHour - firstHour) / 2;

  return `
    <div class="slot${opensUp ? " slot--up" : ""}${cancelled ? " slot--cancelled" : ""}" style="--start: ${toHours(course.start) - firstHour}; --length: ${toHours(course.end) - toHours(course.start)};${course.bg ? ` --slot-bg: ${escapeHtml(course.bg)}; --slot-fg: ${course.fg};` : ""}">
      <button class="slot__button" type="button" aria-describedby="${id}">
        ${cancelled ? '<span class="slot__cancelled">Inställt</span>' : ""}
        <span class="slot__time">${time}</span>
        <span class="slot__title">${escapeHtml(course.title)}</span>
        ${course.group ? `<span class="slot__group">${escapeHtml(course.group)}</span>` : ""}
      </button>
      <div class="slot__details" id="${id}" role="tooltip">
        ${cancelHtml}
        <h3>${escapeHtml(course.title)}</h3>
        <dl>${rows}</dl>
        ${infoHtml}
      </div>
    </div>`;
}

// isShown(course) decides which courses the group filter lets through
function renderWeek(grid, monday, isShown) {
  const today = new Date();

  // The courses visible on each day of this week
  const week = DAYS.map((day, i) => {
    const date = addDays(monday, i);
    const courses = COURSES
      .filter((c) => c.day === day.key && runsOn(c, date) && isShown(c))
      .sort((a, b) => toHours(a.start) - toHours(b.start));
    return { day, date, courses };
  });

  // Size the grid to just the visible courses
  const range = hourRange(week.flatMap((d) => d.courses));
  const { firstHour, lastHour } = range;
  grid.style.setProperty("--hours", lastHour - firstHour);

  let times = "";
  for (let h = firstHour; h < lastHour; h++) {
    times += `<span class="schedule__time" style="--at: ${h - firstHour}">${String(h).padStart(2, "0")}:00</span>`;
  }

  let weekHasCourses = false;

  const days = week.map(({ day, date, courses }, i) => {
    if (courses.length) weekHasCourses = true;

    const slots = courses.map((c, j) => renderSlot(c, day.name, date, `course-${day.key}-${j}`, range)).join("");

    const classes = ["schedule__day"];
    if (sameDay(date, today)) classes.push("is-today");
    if (i >= 5) classes.push("is-end-of-week");
    if (!courses.length) classes.push("is-empty");

    return `
      <div class="${classes.join(" ")}">
        <h3 class="schedule__day-name">
          <span>${day.name}</span>
          <span class="schedule__date">${formatDay(date)}</span>
        </h3>
        <div class="schedule__slots">${slots || '<p class="schedule__none">Inga pass</p>'}</div>
      </div>`;
  }).join("");

  grid.classList.toggle("is-empty-week", !weekHasCourses);
  grid.innerHTML = `
    <div class="schedule__times" aria-hidden="true">${times}</div>
    ${days}
    <p class="schedule__empty-week">Inga pass den här veckan.</p>`;
}

let GROUPS = [];

function initSchedule(root) {
  GROUPS = courseGroups(COURSES);

  let monday = startOfWeek(new Date());
  const selected = new Set(); // empty = show all courses

  const groupOptions = GROUPS.map((group) => `
    <label class="group-filter__option">
      <input type="checkbox" value="${escapeHtml(group)}">
      <span>${escapeHtml(group)}</span>
    </label>`).join("");

  root.innerHTML = `
    <div class="schedule-layout">
      <div class="schedule-layout__main">
        <div class="schedule-toolbar">
          <h2 class="schedule-toolbar__title" aria-live="polite" data-schedule-title></h2>
          <div class="schedule-toolbar__nav">
            <button class="icon-btn" type="button" data-week-step="-1" aria-label="Föregående vecka">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span class="schedule-toolbar__week" aria-live="polite" data-week-label></span>
            <button class="icon-btn" type="button" data-week-step="1" aria-label="Nästa vecka">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
        <div class="schedule"></div>
      </div>

      <fieldset class="group-filter">
        <legend class="group-filter__title">Välj grupper</legend>
        <p class="group-filter__hint">Inga valda = alla kurser visas.</p>
        <div class="group-filter__options">${groupOptions}</div>
        <button class="group-filter__clear" type="button" data-filter-clear hidden>Visa hela schemat</button>
      </fieldset>
    </div>`;

  const grid = root.querySelector(".schedule");
  const weekLabel = root.querySelector("[data-week-label]");
  const title = root.querySelector("[data-schedule-title]");
  const checkboxes = root.querySelectorAll(".group-filter input");
  const clearButton = root.querySelector("[data-filter-clear]");

  const isShown = (course) => selected.size === 0 || selected.has(course.group);

  function render() {
    // Selected groups in list order (not click order)
    const names = GROUPS.filter((group) => selected.has(group));
    // None or every group ticked both mean the whole schedule is shown
    if (names.length === 0 || names.length === GROUPS.length) title.textContent = "Alla kurser";
    else if (names.length === 1) title.textContent = names[0];
    else if (names.length === 2) title.innerHTML = `${escapeHtml(names[0])},<br>${escapeHtml(names[1])}`;
    else title.textContent = "Flera grupper";
    clearButton.hidden = selected.size === 0;
    renderWeek(grid, monday, isShown);
  }

  function show(newMonday) {
    monday = newMonday;
    weekLabel.textContent = `Vecka ${weekNumber(monday)}`;
    weekLabel.title = formatRange(monday); // full dates on hover
    render();
  }

  root.querySelectorAll("[data-week-step]").forEach((button) => {
    button.addEventListener("click", () => show(addDays(monday, 7 * Number(button.dataset.weekStep))));
  });

  checkboxes.forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) selected.add(box.value);
      else selected.delete(box.value);
      render();
    });
  });

  clearButton.addEventListener("click", () => {
    selected.clear();
    checkboxes.forEach((box) => (box.checked = false));
    render();
  });

  // Let Escape close an open details popup
  grid.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && grid.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  });

  show(monday);
}

const scheduleRoot = document.querySelector("[data-schedule]");
if (scheduleRoot) {
  scheduleRoot.innerHTML = '<p class="schedule-message">Laddar kursschema…</p>';
  loadCourses()
    .then((courses) => {
      COURSES = assignColors(courses);
      initSchedule(scheduleRoot);
    })
    .catch((error) => {
      console.error("Kursschema: could not load the course list.", error);
      scheduleRoot.innerHTML = '<p class="schedule-message">Kursschemat kunde inte laddas just nu. Försök igen senare.</p>';
    });
}
