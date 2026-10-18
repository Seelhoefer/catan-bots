// Aus wessen Sicht die Oberfläche gezeichnet wird. Allein oder am Handy: immer Spieler 0 bzw. der eigene Platz;
// mehrere Menschen an einem Gerät: der Spieler, der gerade am Zug ist (siehe App.syncViewer); -1 = nur zuschauen (Brett ohne Handkarten).
export let HUMAN = 0;

export function setViewer(i) { HUMAN = i; }
