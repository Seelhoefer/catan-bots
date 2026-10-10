# Grafiken

Illustrierte Grafiken aus dem **Community Asset Pack** und dem **Devcards Pack** (für dieses Projekt erstellt, MIT wie das Repo).

**Grafikstile** (Menü ⋯ → Grafik, wird gespeichert):
- **Illustriert** (Standard): `art-v2/` – Rohstoffe, alle 2:1-/3:1-Hafenmedaillons und die Nebelkachel aus dem *Catan SVG Asset Pack* (die eingebetteten WebP-Bilder wurden extrahiert, auf 256–384 px verkleinert und bei den Rohstoffen zugeschnitten).
- **Vektor**: `vector-svg/` – dieselben 12 Motive als reine, frei editierbare Pfad-SVGs (Rohstoffe, Häfen, Nebelkachel).
- **Klassisch**: der frühere Illustrationssatz (`illustrated/resources`, 3:1-Hafen) – 2:1-Häfen werden hier aus Rohstoffbild und Schrift zusammengesetzt.

| Ordner | Inhalt | Verwendung |
| --- | --- | --- |
| `illustrated/pieces/` | Siedlung und Stadt (192 px) in 6 Spielerfarben (Straßen werden als SVG gezeichnet, siehe `js/ui/road.js`) | Spielfiguren auf dem Brett, Vorschau beim Bauen |
| `art-v2/resources/`, `art-v2/harbors/`, `art-v2/fog/` | Neue Rohstoffe, Hafenmedaillons (3:1 und 5× 2:1), Nebelkachel | Felder, Rohstoffkarten, Chips, Häfen, Nebel |
| `hexbg/` | Komplette Feld-Hintergründe (Wald, Weide, Lehm, Getreide, Erz, Wüste, Wahlfeld) aus *Catan Hex Backgrounds v1*, auf 440 px zugeschnitten (die Dateinamen im Paket waren vertauscht; nach Inhalt zugeordnet) | Felder im Stil „Illustriert“, Zahl liegt mittig, keine Feld-Icons |
| `vector-svg/` | Pfad-basierte SVG-Variante derselben Motive | Grafikstil „Vektor“ |
| `illustrated/resources/` | Früherer Satz: Holz, Lehm, Wolle, Getreide, Erz (WebP) | Grafikstil „Klassisch“ |
| `illustrated/special/harbor-3to1.webp` | Runder 3:1-Hafen-Marker (v2) | 3:1-Häfen auf dem Brett, Häfen |
| `illustrated/special/resource-choice.svg` | Rohstoff nach Wahl | Anti-Pech-Marker |
| `illustrated/special/wild-terrain.svg` | Unbekanntes Gelände | Nebelfelder |
| `illustrated/special/ship.webp` | Schiff (v2) | noch nicht verwendet (kein Seeweg im Spiel) |
| `illustrated/desert.webp` | Wüste (v2) | Wüstenfeld |
| `illustrated/thief.webp` | Dieb | Räuber-Figur, Abwerfen/Stehlen-Dialoge |
| `illustrated/trophy.webp` | Pokal | Siegpunkte, Siegerehrung |
| `portraits/*.webp` | 6 Bot-Portraits (360 px, transparent) | Gegner-Karten, Markt, Charakterauswahl; Gesicht wird rund ausgeschnitten, Hintergrund = Spielerfarbe |
| `illustrated/ocean-minimal.webp` | Ruhiger Meer-Hintergrund | Spielbrett |
| `illustrated/ocean.webp` | Meer-Hintergrund (1600×900) | Startseite |
| `cards/*.webp` | Entwicklungskarten (480×720) | Karten-Galerie, Karten-Einblendung |

Die Karten-Originale (PNG, ~3 MB je Karte) wurden für das Web auf 480×720 WebP verkleinert.
Die Ernte-Karte (v2) ist ebenfalls illustriert (`cards/harvest.webp`).
Sind die Bilder nicht ladbar, fällt die Oberfläche automatisch auf die flachen Vektor-Icons zurück.
