# Musik

Standardmäßig spielt eine **generative Hintergrundmusik** (`public/js/ui/music.js`): ruhige Akkordflächen, Harfen-Arpeggien und eine sanfte Flöte mit Hall.
Sie wird live per Web Audio erzeugt – keine Dateien, keine Lizenzen, jede Partie klingt etwas anders.

Eigene Stücke einbinden: Dateien hier ablegen und in `manifest.json` eintragen; dann laufen sie nacheinander statt der generativen Musik:

```json
{ "tracks": ["stueck1.mp3", "stueck2.ogg"] }
```

Frei nutzbare Quellen (Lizenz und ggf. Namensnennung prüfen):
- [incompetech – Kevin MacLeod](https://incompetech.com/music/royalty-free/) (CC BY 4.0, Namensnennung nötig)
- [OpenGameArt – Musik](https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=12) (nach CC0 filtern)
- [Pixabay Musik](https://pixabay.com/music/) (Pixabay-Lizenz)
- [Free Music Archive](https://freemusicarchive.org) (je Stück verschieden)
