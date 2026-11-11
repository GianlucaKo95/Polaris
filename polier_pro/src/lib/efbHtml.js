// HTML-Escaping für die EFB-Preisblätter — eigenständig statt aus utils.js,
// damit efb.js ohne Browser-Abhängigkeiten im Node-Testlauf (`npm test`)
// geladen werden kann.
export function escapeHtmlText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
