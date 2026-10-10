# Sound

Alle Klänge werden standardmäßig **live synthetisiert** (`public/js/ui/sfx.js`, Web Audio API) – keine Dateien, keine Lizenzen, offline nutzbar.

Wer echte Aufnahmen bevorzugt, legt sie hier ab und trägt sie in `manifest.json` ein; vorhandene Dateien ersetzen den jeweiligen Klang:

```json
{ "road": "road.ogg", "settlement": "settlement.ogg", "dice": "dice.ogg" }
```

Namen: `road settlement city dice gain token trade offer card cardplay harvest monopoly remap robber steal turn vp vpOther win lose tick select error`.

Kostenlose Quellen (CC0 / frei nutzbar, Lizenz jeweils prüfen):
- [Kenney – Audio-Packs](https://kenney.nl/assets/category:Audio) (CC0): *Casino Audio* (Würfel, Karten, Münzen), *Interface Sounds*, *Impact Sounds* (Holzklopfen)
- [OpenGameArt](https://opengameart.org) (nach „CC0“ filtern)
- [Freesound](https://freesound.org) (CC0-Filter)
- [Pixabay Sound Effects](https://pixabay.com/sound-effects/) (Pixabay-Lizenz, frei nutzbar)
