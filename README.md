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
- Eine minimalistische Startseite (Logo, „Neues Spiel“, „Fortsetzen“, „Wie zuletzt“) und ein Einrichten-Bildschirm in einer Spalte: Name und Gesicht, Insel (Klein/Groß/Riesig, Nebel-Schalter), Gegner (antippen zum Wählen, Punkte = Stärke pro Gegner), Siegpunkte per Schieber (5–50) und – eingeklappt – weitere Regeln. Alles mit dem Daumen bedienbar, „Spiel starten“ bleibt unten sichtbar
- Spielfeldgröße: Klein (19 Felder, klassisch), Groß (37), Riesig (61)
- Siegpunkte: 5–50 (Standard 10, Schnellwahl 10/15/20/30/50) – Spielfiguren und Siegpunktkarten wachsen automatisch mit. Die Bauplätze sind aber begrenzt: Die Lobby zeigt, bis wie viele Punkte es auf der gewählten Insel realistisch ist (klein ca. 16, riesig mit 4 Spielern ca. 39+). Sind alle Plätze vergeben und ändert sich 30 Runden lang kein Punktestand, endet die Partie als Patt und der Führende gewinnt. Die Anzahl der Spielfiguren wächst automatisch mit
- Spielvariante: Klassisch oder **Nebel** (wie *Seefahrer*)
- 1–5 Gegner (4 oder 6 Spieler als Schnellauswahl), Bot-Stärke Leicht / Normal / Schwer
- Die vier neuen Regeln lassen sich einzeln ausschalten

**Nebel-Variante:** Rund 30 % der Landfelder liegen verdeckt (🌫️). Sobald eine Straße an ein Nebelfeld grenzt,
wird es aufgedeckt und der Entdecker bekommt 1 Rohstoff dieses Feldes. Startsiedlungen dürfen nicht an Nebel liegen. Auf der **riesigen Karte** setzt jeder (auch die Gegner) **3 Startsiedlungen** mit je einer Straße – Reihenfolge vor, zurück, vor –, und jede Siedlung nach der ersten bringt Startrohstoffe.

**🌾 Ernte (neue Entwicklungskarte):** Du wählst eines deiner Felder, an dem du eine Siedlung (1 Karte) oder Stadt (2 Karten)
hast, und erhältst sofort dessen Ertrag. Spielbare Felder werden auf dem Brett markiert.

**🤝 Handel:** „Handeln“ dunkelt das Spiel ab; deine Rohstoffe stehen als Kreise in einer Zeile (*Ich gebe*), darunter nach einem Trenner die gewünschten (*Ich möchte*).
Kreis antippen = auswählen, dann mit − / + die Menge ändern. Nach „An alle senden“ siehst du die Gegner über dem abgedunkelten Spiel: jeder überlegt unterschiedlich lange
(nach Charakter) und antwortet mit Häkchen, Kreuz (mit Grund) oder Gegenangebot. Du tippst einen zustimmenden Spieler an und **bestätigst** erst dann den Handel.
Bietet ein Bot dir etwas an, wird ebenfalls abgedunkelt und ein Pop-up fragt: Annehmen, Gegenangebot (gleiche Kreis-Auswahl) oder Ablehnen. Tab *Bank* für 4:1 / 3:1 / 2:1.

**🟣 Wahlfeld:** Ein violettes Feld mit freier Rohstoffwahl (wie in Erweiterungen); erkennbar am Kreis aus allen fünf Rohstoffen und der Aufschrift „WAHL“. Wird seine Zahl gewürfelt, suchst du dir
pro angrenzender Siedlung (Stadt = 2) einen beliebigen Rohstoff aus. Abschaltbar im Regeln-Schritt.

**🎲 Würfeln & Ertrag:** Ein Glas legt sich über das Spiel, zwei echte weiße Würfel (three.js, mit Licht und weichem Schatten) werden von außen geworfen,
rollen, hüpfen nach und bleiben liegen – dann werden sie zusammengezogen und das Glas verschwindet (keine Zahlen, keine Texte). Über den Feldern mit der
gewürfelten Zahl wirbelt ein Sturm aus Partikeln in der Farbe des Rohstoffs; danach werden die Rohstoffkarten im Bogen mit Bewegungsspur zu den Spielern
gezogen – zu deinem Kartenfächer unten (am Handy zu den Chips oben) oder zum Portrait des Gegners. Zähler erscheinen erst bei der Ankunft.
Bots lassen sich dabei mehr Zeit (Tempo im Menü: Langsam / Normal / Schnell). Ohne WebGL gibt es einen CSS-Würfel als Ersatz.

**🃏 Karten im Fuß:** Am Desktop liegt deine Hand als Kartenfächer im Fuß: links die Rohstoffkarten (nach Rohstoff gruppiert), rechts deine Entwicklungskarten.
Gold umrandete Karten sind spielbar – Anklicken spielt sie (bei Monopol/Erfindung folgt die Rohstoffwahl). Am Handy erreichst du sie über „Karten“ in der Aktionsleiste.

**🙂 Charaktere:** Die Bots haben illustrierte Portraits (du ein generiertes Avatar-Gesicht). Sie haben Namen, Eigenschaft und Spielstil
(Fritz expandiert, Greta handelt fair, Otto baut Straßen, Mira spart auf Städte, Lea liebt Ritter, Amir zieht Karten).

**🧠 Bot-Pläne:** Jeder Bot verfolgt einen Plan (Expansion, Städtebau, Hafenhandel oder Rittermacht), der aus seiner Eigenschaft und der Lage auf dem Brett entsteht
und sich ändern kann (z. B. wenn kein Platz mehr zum Siedeln da ist). Der aktuelle Plan steht im Tooltip der Spielerkarte, Wechsel erscheinen im Verlauf.
Häfen zählen bei der Platzwahl nach der eigenen Produktion; Hafen-Bots tauschen Überschuss 2:1 / 3:1 in fehlende Rohstoffe. Tauschangebote bewerten Bots nach der Nähe
zu ihren Zielen (auch zweit- und drittwichtigen), machen Gegenvorschläge und helfen nur dem Spieler kurz vor dem Sieg nicht beim Bauen. Die Stärke lässt sich pro Gegner einstellen.

**🌍 Weltenwandel (neue Entwicklungskarte):** Alle Landfelder (Rohstoff + Zahlenchip) werden komplett zufällig neu
verteilt. Siedlungen und Straßen bleiben an ihren Positionen, der Räuber bleibt auf seiner Position, Nebelfelder bleiben verdeckt.

**🍀 Anti-Pech-Marker:** Wird eine Zahl gewürfelt (nicht 7) und du erhältst *keinen* Rohstoff, bekommst du 1 Marker.
Für so viele Marker, wie du aktuell Siegpunkte hast (mindestens 1), tauschst du sie gegen 1 beliebigen Rohstoff.

**🎖️ Öffentliche Missionen:** Zu Beginn werden 3 zufällige Missionen aus 9 aufgedeckt (z. B. *Hafenmeister*,
*Entdecker*, *Städtebauer*). Wer eine Mission als Erster erfüllt, erhält +1 Siegpunkt. Der Fortschritt ist im
linken Panel sichtbar.

## Startseite

Titelbildschirm im Spiele-Look: goldenes CATAN-Logo mit Banner, schwebende Insel mit den neuen Feldern, Menü mit „Neues Spiel“, „Fortsetzen“, „Schnellstart“ (letzte Einstellungen) und „Regeln & Neuheiten“, darunter die sechs Gegner mit Charakter. Oben rechts schaltest du die Musik.

## Bedienung

- Leuchtende Punkte / Linien / Felder auf dem Spielbrett zeigen, wohin du klicken kannst. **Zwei Schritte:** erst anklicken (Vorschau),
  dann dasselbe nochmal anklicken – oder unten „Bestätigen“ – zum Bauen. `Esc` bricht ab, `R` würfelt.
- Mausrad zoomt, Ziehen verschiebt das Spielfeld, ⌖ zentriert es wieder.
- Oben rechts stehen alle Spieler als Karten in Zugreihenfolge (auch du) mit Siegpunkten, Handkarten und Entwicklungskarten; wer dran ist, leuchtet in seiner Farbe. Daneben Musik und Einstellungen (⚙).
- Unten links: runder **Bau-Knopf** – klappt Straße, Siedlung, Stadt und Entwicklungskarte übereinander auf (gold, wenn du die Rohstoffe hast, fehlende Rohstoffe rot) – und daneben **Handeln**. Unten rechts: **Zug beenden**.
- Die Partie wird automatisch im Browser gespeichert und kann im Menü fortgesetzt werden.
- Bot-Tempo (🐢 / 🚶 / ⚡) oben rechts einstellbar.

## Musik

Eine epische, generative Hintergrundmusik (Orgelpunkt, Streicher-Ostinato, Hörner mit Heldenmotiv, Chor, Pauken, Becken-Crescendo) steigert sich über 16 Takte vom ruhigen Intro bis zum Finale und beginnt dann neu.
Ein/Aus über das Musiksymbol im Kopf (oder ⋯ → Musik). Eigene frei lizenzierte Stücke lassen sich über `public/assets/music/manifest.json` einbinden.

## Animationen & Bibliotheken

Würfel (echte 3D-Würfel mit Wurf, Aufprall und natürlichem Nachhüpfen), fliegende Rohstoffkarten, Zoom-Übergänge und Kartenauftritte laufen mit
[GSAP](https://gsap.com) (inkl. MotionPath); Siegpunkte und der Sieg bekommen Konfetti ([canvas-confetti](https://github.com/catdad-experiments/canvas-confetti)).
Beide liegen unverändert in `public/vendor/` (Lizenzen siehe `public/vendor/README.md`) – es ist weiterhin kein Build-Schritt nötig.
Zoomen per Mausrad, Pinch oder +/− ist weich animiert; ⌖ zentriert das Brett.

## Sound

Straße, Siedlung und Stadt klopfen unterschiedlich auf Holz, Würfel rasseln, Handel klimpert, ein Siegpunkt gibt ein kleines Glockenspiel,
dazu Karten, Räuber, Weltenwandel, Angebote, eigener Zug und Sieg. Alles wird live per Web Audio erzeugt (keine Dateien, keine Lizenzen).
Ein/Aus im Menü (⋯ → Sound). Echte Aufnahmen lassen sich optional einhängen, siehe `public/assets/sfx/README.md`.

## Am Handy spielen

- **Im WLAN:** `npm run start:lan` startet den Server für alle Geräte im Netz und zeigt die Adressen (z. B. `http://192.168.0.12:3000`) an.
- **Von überall:** auf Vercel deployen (s. o.) und die URL am Handy öffnen.
- Die Oberfläche ist für Hoch- und Querformat ausgelegt (Hand, Gegner und Aktionsleiste ohne Scrollen, Dialoge als Bottom-Sheet).
  „Zum Home-Bildschirm“ installiert das Spiel als Vollbild-App (PWA).

## Grafiken

Im Stil *Illustriert* sind die Felder komplette Hintergrundbilder mit mittig liegendem Zahlenchip. Drei umschaltbare **Grafikstile** (Menü ⋯ → Grafik): *Illustriert* (neu, Standard), *Vektor* (reine SVG-Pfade) und *Klassisch*.

Siedlungen und Städte, Rohstoffe, Räuber-Dieb, Pokal und die Entwicklungskarten sind illustriert (siehe `public/assets/README.md`). **Straßen** sind keine Bilder, sondern flache Vektor-Holzmarker
(`public/js/ui/road.js`, `drawRoad({x, y, orientation, color, length, width})`) in sechs Spielerfarben.
Fehlen die Bilder, nutzt das Spiel automatisch flache Vektor-Icons.

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

## 📱 Handy-Bedienung

- **Brett:** Mit einem Finger wischen (gleitet nach, wie bei Karten-Apps), mit zwei Fingern zoomen und gleichzeitig verschieben, Doppeltipp auf freie Fläche zoomt hinein und wieder heraus. Das Brett lässt sich nicht aus dem Bild schieben.
- **Layout hochkant:** Oben nur die Spieler als runde Bilder (Punkte-Marke, Kartenzahl; ein Tipp zeigt Details und Plan), unten die Rohstoffleiste und darunter Bauen, Handeln, Entwicklungskarten und der große Weiter-Knopf. Auszeichnungen und Missionen sind kompakte Symbole oben links, die Einstellungen (inkl. Musik) liegen hinter dem Zahnrad.
- **Flüssig:** Auf Touch-Geräten sind Unschärfe-Effekte und Dauer-Animationen aus; Listen und Fenster scrollen weich ohne Gummiband. Der Desktop sieht weiter aus wie bisher.

