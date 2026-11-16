/*
 * Intresseanmälan — fills the "Grupp" dropdown with the groups from the
 * course files in InFlow/Kurser/ (the "group:" line). Uses js/courses.js.
 * Courses whose "until" date has passed are left out, and so are courses
 * with a "signup_opens" time (e.g. "2026-11-22 17:00") that hasn't come yet.
 */
const groupSelect = document.querySelector("[data-course-groups]");

// signup_opens: "2026-11-22 17:00" (Swedish time on the visitor's computer)
function signupIsOpen(course, now) {
  const text = String(course.signup_opens || "").trim();
  if (!text) return true;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!match) {
    console.warn(`Intresseanmälan: signup_opens "${text}" in ${course.source} should look like "2026-11-22 17:00"`);
    return true;
  }
  const [, y, m, d, hh = "0", mm = "0"] = match;
  return now >= new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
}

if (groupSelect) {
  const placeholder = groupSelect.querySelector("option[value='']");

  loadCourses()
    .then((courses) => {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const current = courses.filter(
        (c) => (!c.until || parseDate(c.until) >= today) && signupIsOpen(c, now)
      );
      const groups = courseGroups(current);

      if (!groups.length) {
        placeholder.textContent = "Inga grupper att anmäla sig till just nu";
        return;
      }

      placeholder.textContent = "Välj grupp";
      for (const group of groups) {
        groupSelect.add(new Option(group, group));
      }
    })
    .catch((error) => {
      console.error("Intresseanmälan: could not load the course groups.", error);
      placeholder.textContent = "Grupperna kunde inte laddas – kontakta oss";
    });
}
