# Drittanbieter-Bibliotheken (eingebunden, kein Build-Schritt)

| Datei | Paket | Version | Lizenz |
| --- | --- | --- | --- |
| `gsap.min.js`, `MotionPathPlugin.min.js` | [GSAP](https://gsap.com) (GreenSock Animation Platform) | 3.15.0 | GSAP „Standard ‚no charge‘ license“ – kostenlos auch für kommerzielle Projekte, Details: https://gsap.com/standard-license |
| `confetti.browser.js` | [canvas-confetti](https://github.com/catdad-experiments/canvas-confetti) | 1.9.4 | ISC (`LICENSE-canvas-confetti.txt`) |

Genutzt für die Würfel-Animation (Wurf, Aufprall, Nachhüpfen), die fliegenden Rohstoffkarten, Zoom-Übergänge und Konfetti bei Siegpunkten.
Beide Dateien stammen unverändert aus den npm-Paketen `gsap` und `canvas-confetti`.
| `three-dice.min.js` | [three.js](https://threejs.org) 0.186.1 (nur die für die Würfel benötigten Teile, mit esbuild gebündelt, inkl. `RoundedBoxGeometry`) | 0.186.1 | MIT |

Die 3D-Würfel (`js/ui/dice3d.js`) laden three.js erst beim ersten Spiel; ohne WebGL fällt die Anzeige auf CSS-Würfel zurück.
