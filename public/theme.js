// Appearance: follow the system, or force light / dark. Loaded in <head> (not deferred) so the stored
// choice is applied before first paint. Any `.theme-switch button[data-mode]` on the page controls it.
(function () {
  var KEY = "aideas-theme";
  function stored() {
    try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; }
  }
  function apply(mode) {
    var root = document.documentElement;
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    var buttons = document.querySelectorAll(".theme-switch button[data-mode]");
    for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-mode") === mode));
  }
  apply(stored());
  document.addEventListener("DOMContentLoaded", function () {
    apply(stored());
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".theme-switch button[data-mode]");
      if (!b) return;
      var mode = b.getAttribute("data-mode");
      try { localStorage.setItem(KEY, mode); } catch (err) { /* private mode: still applies for this visit */ }
      apply(mode);
    });
  });
})();
