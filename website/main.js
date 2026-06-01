const copyButtons = document.querySelectorAll("[data-copy-target]");

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    const value = target?.textContent?.trim();

    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    button.dataset.copied = "true";
    button.setAttribute("aria-label", "Copied");

    window.setTimeout(() => {
      button.dataset.copied = "false";
      button.setAttribute("aria-label", "Copy command");
    }, 1800);
  });
}

const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector("[data-nav-links]");

navToggle?.addEventListener("click", () => {
  const expanded = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!expanded));
  navLinks?.toggleAttribute("data-open", !expanded);
});
