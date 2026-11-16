// Mobile navigation toggle
const toggle = document.querySelector(".nav__toggle");
const navList = document.querySelector(".nav__list");

if (toggle && navList) {
  toggle.addEventListener("click", () => {
    const isOpen = navList.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Phone menu: tapping "Kurser" opens and closes its sub-pages instead of
  // going to kurser.html (the sub-pages include "Våra kurser")
  const phoneMenu = window.matchMedia("(max-width: 48rem)");
  navList.querySelectorAll(".nav__item--sub > a").forEach((parent) => {
    parent.setAttribute("aria-haspopup", "true");
    parent.addEventListener("click", (event) => {
      if (!phoneMenu.matches) return;
      event.preventDefault();
      event.stopPropagation(); // keep the main menu open
      const item = parent.parentElement;
      const isExpanded = item.classList.toggle("is-expanded");
      parent.setAttribute("aria-expanded", String(isExpanded));
    });
  });

  // Close the menu after picking a link
  navList.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      navList.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  // Close the menu when tapping the dimmed page outside it
  document.addEventListener("click", (event) => {
    if (navList.classList.contains("is-open") && !event.target.closest(".nav")) {
      navList.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Highlight the menu link for the current page
const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav__list a").forEach((link) => {
  if (link.getAttribute("href") === currentPage) {
    link.setAttribute("aria-current", "page");
  }
});

// Keep the footer year current
const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();
