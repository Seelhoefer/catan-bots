# Grafiken

Illustrierte Grafiken aus dem **Community Asset Pack** und dem **Devcards Pack** (für dieses Projekt erstellt, MIT wie das Repo).

| Ordner | Inhalt | Verwendung |
| --- | --- | --- |
| `illustrated/pieces/` | Siedlung, Stadt, Straße in 6 Spielerfarben (WebP, 192 px) | Spielfiguren auf dem Brett, Vorschau beim Bauen |
| `illustrated/resources/` | Holz, Lehm, Wolle, Getreide, Erz (WebP) | Felder, Rohstoff-Chips, Häfen, Handel |
| `illustrated/special/harbor.svg` | Hafen | 3:1-Hafen-Marker |
| `illustrated/special/resource-choice.svg` | Rohstoff nach Wahl | Anti-Pech-Marker |
| `illustrated/special/wild-terrain.svg` | Unbekanntes Gelände | Nebelfelder |
| `illustrated/special/ship.svg` | Schiff | noch nicht verwendet (kein Seeweg im Spiel) |
| `illustrated/thief.webp` | Dieb | Räuber-Figur, Abwerfen/Stehlen-Dialoge |
| `illustrated/trophy.webp` | Pokal | Siegpunkte, Siegerehrung |
| `cards/*.webp` | Entwicklungskarten (480×720) | Karten-Galerie, Karten-Einblendung |

Die Karten-Originale (PNG, ~3 MB je Karte) wurden für das Web auf 480×720 WebP verkleinert.
Die Karte **Ernte** hat noch keine Illustration: sie wird als Ersatzkarte im gleichen Stil per CSS gezeichnet (`js/ui/cards.js`).
Sind die Bilder nicht ladbar, fällt die Oberfläche automatisch auf die flachen Vektor-Icons zurück.
