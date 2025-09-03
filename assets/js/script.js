// assets/js/script.js
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const submenuItems = Array.from(
    nav.querySelectorAll(".menu > li")
  ).filter(li => li.querySelector(".submenu"));

  // Helper functions
  const getToggle = (li) => li.querySelector(":scope > a");
  const getSubmenu = (li) => li.querySelector(":scope .submenu");

  function openMenu(li) {
    closeAll(li);
    const toggle = getToggle(li);
    const submenu = getSubmenu(li);
    if (!submenu || !toggle) return;

    li.dataset.open = "true";
    toggle.setAttribute("aria-expanded", "true");
    submenu.style.display = "block";
  }

  function closeMenu(li) {
    const toggle = getToggle(li);
    const submenu = getSubmenu(li);
    if (!submenu || !toggle) return;

    delete li.dataset.open;
    toggle.setAttribute("aria-expanded", "false");
    submenu.style.display = "none";
  }

  function closeAll(exceptLi = null) {
    submenuItems.forEach(li => {
      if (li !== exceptLi) closeMenu(li);
    });
  }

  // Initialize ARIA and events
  submenuItems.forEach(li => {
    const toggle = getToggle(li);
    const submenu = getSubmenu(li);
    if (!toggle || !submenu) return;

    // ARIA for accessibility
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("role", "button");
    submenu.setAttribute("role", "menu");

    // Start hidden (in case CSS hover revealed it)
    submenu.style.display = "none";

    // Click / Tap to toggle
    toggle.addEventListener("click", (e) => {
      // Prevent jumping to #hash link and allow toggle behavior
      e.preventDefault();
      const isOpen = li.dataset.open === "true";
      isOpen ? closeMenu(li) : openMenu(li);
    });

    // Keyboard support on the toggle
    toggle.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "Enter":
        case " ":
        case "ArrowDown":
          e.preventDefault();
          if (li.dataset.open === "true") {
            // Focus first item
            const firstItem = submenu.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
            if (firstItem) firstItem.focus();
          } else {
            openMenu(li);
            const firstItem = submenu.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
            if (firstItem) firstItem.focus();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          openMenu(li);
          // Focus last item
          const items = submenu.querySelectorAll("button, a, [tabindex]:not([tabindex='-1'])");
          if (items.length) items[items.length - 1].focus();
          break;
        case "Escape":
          closeMenu(li);
          toggle.focus();
          break;
      }
    });

    // Keyboard support inside submenu
    submenu.addEventListener("keydown", (e) => {
      const items = Array.from(submenu.querySelectorAll("button, a, [tabindex]:not([tabindex='-1'])"));
      const currentIndex = items.indexOf(document.activeElement);

      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(li);
        toggle.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(currentIndex + 1) % items.length];
        if (next) next.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(currentIndex - 1 + items.length) % items.length];
        if (prev) prev.focus();
      } else if (e.key === "Tab") {
        // If tabbing out of submenu, close it unless focus stays inside
        // (This keeps UX tidy on mobile keyboards too)
        setTimeout(() => {
          if (!submenu.contains(document.activeElement)) {
            closeMenu(li);
          }
        }, 0);
      }
    });
  });

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) closeAll();
  });

  // Optional: close menus on resize (prevents weird states between mobile/desktop)
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => closeAll(), 150);
  });
});
