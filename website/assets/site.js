// Small, progressive-enhancement client script. No dependencies.
(function () {
  // Mobile nav toggle
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  // Copy buttons (install line + any [data-copy])
  document.querySelectorAll("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function () {
      var text = el.getAttribute("data-copy");
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        var prev = el.textContent;
        el.textContent = "copied";
        setTimeout(function () {
          el.textContent = prev;
        }, 1300);
      });
    });
  });

  // Tabbed code windows
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    var btns = group.querySelectorAll(".tabs button");
    var panels = group.querySelectorAll(".tab-panel");
    btns.forEach(function (btn, idx) {
      btn.addEventListener("click", function () {
        btns.forEach(function (b) {
          b.classList.remove("active");
        });
        panels.forEach(function (p) {
          p.classList.remove("active");
        });
        btn.classList.add("active");
        if (panels[idx]) panels[idx].classList.add("active");
      });
    });
  });

  // Docs sidebar: highlight the section currently in view
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".docs-side a[href^='#']"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    tocLinks.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var target = document.getElementById(id);
      if (target) map[id] = a;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            tocLinks.forEach(function (a) {
              a.classList.remove("active");
            });
            var a = map[entry.target.id];
            if (a) a.classList.add("active");
          }
        });
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    Object.keys(map).forEach(function (id) {
      var t = document.getElementById(id);
      if (t) observer.observe(t);
    });
  }
})();
