# 🎲 Catan gegen Bots

Eine moderne, im Browser spielbare Version von *Die Siedler von Catan* – du spielst gegen 1–5 computergesteuerte Gegner.
Keine Abhängigkeiten, kein Build-Schritt: Node.js genügt.

## Schnellstart (localhost)

```bash
git clone <dieses-repo>
cd catan-bots
npm start            # → http://localhost:3000
```

Alternativ (anderer Port): `PORT=8080 npm start`. Tests: `npm test`.
Voraussetzung: Node.js ≥ 18. Es muss nichts installiert werden (`npm install` ist nicht nötig).

## Auf Vercel hosten

Das Spiel ist eine rein statische Seite (Ordner `public/`), es wird kein Build und kein Server benötigt.
1. Auf [vercel.com/new](https://vercel.com/new) das Repo importieren.
2. Alles andere übernimmt `vercel.json` (kein Framework, kein Build, Output `public`) – **Deploy** klicken.

Alternativ per CLI: `npx vercel --prod` im Projektordner.

## Funktionsumfang

**Grundregeln:** Gründungsphase (Schlangenreihenfolge, Startrohstoffe), Würfeln & Erträge (Bankvorrat),
Siedlungen, Städte, Straßen, Räuber (Abwerfen bei 7, Versetzen, Stehlen), Handel mit der Bank (4:1),
Häfen (3:1 / 2:1), Handel mit Bots (frei verhandelbar, Bots machen auch selbst Angebote),
Entwicklungskarten (Ritter, Straßenbau, Erfindung, Monopol, Siegpunkte), Längste Handelsstraße,
Größte Rittermacht, Sieg bei Erreichen der Siegpunktzahl in deinem Zug.

**Einstellungen vor der Partie**
- Spielfeldgröße: Klein (19 Felder, klassisch), Groß (37), Riesig (61)
- Siegpunkte: 5–20 (Standard 10) – die Anzahl der Spielfiguren wächst automatisch mit
- Spielvariante: Klassisch oder **Nebel** (wie *Seefahrer*)
- 1–5 Gegner, Bot-Stärke Leicht / Normal / Schwer
- Die drei neuen Regeln lassen sich einzeln ausschalten

**Nebel-Variante:** Rund 30 % der Landfelder liegen verdeckt (🌫️). Sobald eine Straße an ein Nebelfeld grenzt,
wird es aufgedeckt und der Entdecker bekommt 1 Rohstoff dieses Feldes. Startsiedlungen dürfen nicht an Nebel liegen.

**🌍 Weltenwandel (neue Entwicklungskarte):** Alle Landfelder (Rohstoff + Zahlenchip) werden komplett zufällig neu
verteilt. Siedlungen und Straßen bleiben an ihren Positionen, der Räuber bleibt auf seiner Position, Nebelfelder bleiben verdeckt.

**🍀 Anti-Pech-Marker:** Wird eine Zahl gewürfelt (nicht 7) und du erhältst *keinen* Rohstoff, bekommst du 1 Marker.
Für so viele Marker, wie du aktuell Siegpunkte hast (mindestens 1), tauschst du sie gegen 1 beliebigen Rohstoff.

**🎖️ Öffentliche Missionen:** Zu Beginn werden 3 zufällige Missionen aus 9 aufgedeckt (z. B. *Hafenmeister*,
*Entdecker*, *Städtebauer*). Wer eine Mission als Erster erfüllt, erhält +1 Siegpunkt. Der Fortschritt ist im
linken Panel sichtbar.

## Bedienung

- Leuchtende Punkte / Linien / Felder auf dem Spielbrett zeigen, wohin du klicken kannst. `Esc` bricht ab, `R` würfelt.
- Mausrad zoomt, Ziehen verschiebt das Spielfeld, ⌖ zentriert es wieder.
- Unten: deine Rohstoffe und die Aktionsleiste (Bauen, Handeln, Karten, Anti-Pech-Marker, Zug beenden).
- Die Partie wird automatisch im Browser gespeichert und kann im Menü fortgesetzt werden.
- Bot-Tempo (🐢 / 🚶 / ⚡) oben rechts einstellbar.

## Projektstruktur

```
server.js                    Statischer Server (ohne Abhängigkeiten)
public/index.html            Einstieg
public/css/style.css         Gesamtes Design (dunkles, modernes Theme, responsiv)
public/js/engine/            Regel-Engine (reines JS, auch in Node lauffähig)
  constants.js  rng.js  board.js  game.js  missions.js  bot.js
public/js/ui/                SVG-Spielfeld, Panels, Dialoge, Menü
public/js/main.js            App-Controller (verbindet Engine, Bots, UI)
test/                        Unit-Tests + Bot-gegen-Bot-Simulationen (node:test)
```

Die Engine ist vollständig von der Oberfläche getrennt (`Game`-Klasse mit serialisierbarem Zustand).
Die Tests spielen komplette Partien (alle Feldgrößen, mit/ohne Nebel) nur mit Bots durch und prüfen Invarianten
(z. B. Rohstofferhaltung) sowie die neuen Mechaniken einzeln.

*Fan-Projekt für den privaten Gebrauch; „Catan“ ist eine Marke der jeweiligen Rechteinhaber.*
