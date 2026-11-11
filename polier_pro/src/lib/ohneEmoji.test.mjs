import { test } from "node:test";
import assert from "node:assert/strict";
import { ohneEmoji } from "./utils.js";

test("ohneEmoji entfernt Emojis samt Variationszeichen und lässt Text und Zahlen stehen", () => {
  assert.equal(ohneEmoji("📝 Entwurf"), "Entwurf");
  assert.equal(ohneEmoji("🔒 Digital angenommen — gesperrt"), "Digital angenommen — gesperrt");
  assert.equal(ohneEmoji("🏗️ Betonage: möglich"), "Betonage: möglich");
  assert.equal(ohneEmoji("👷‍♂️ 3 Mitarbeiter"), "3 Mitarbeiter");
  assert.equal(ohneEmoji("Fläche 12 m² · C30/37"), "Fläche 12 m² · C30/37");
});
