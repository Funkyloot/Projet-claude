/* musique.js — les trois airs du jeu, façon arcade (puces sonores 8 bits).
 *
 * Chaque air tourne en boucle sur huit mesures de huit croches :
 *   - melodie : une note par croche ('E5'), '-' prolonge la note d'avant,
 *     '.' est un silence ;
 *   - accords : la fondamentale de chaque mesure (octave grave) ;
 *   - basse : le motif d'une mesure, en multiples de la fondamentale
 *     (1 la fondamentale, 1.5 la quinte, 2 l'octave, 0 silence) ;
 *   - batterie : k grosse caisse, s caisse claire, h charleston, K les deux
 *     (grosse caisse et charleston).
 * Le séquenceur est dans son.js.
 */

const NOTES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** Fréquence d'une note ('A4' = 440 Hz). */
export function frequence(nom) {
  const m = /^([A-G][#b]?)(\d)$/.exec(nom);
  if (!m) return 440;
  const demi = NOTES[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * 2 ** ((demi - 69) / 12);
}

const air = (texte) => texte.trim().split(/\s+/);

export const MORCEAUX = {
  // Au garage : un air enjoué en do majeur, tranquille.
  garage: {
    tempo: 112,
    timbre: 'square',
    melodie: air(`
      E5 . G5 . C6 - G5 .     A5 - G5 E5 C5 - . .
      F5 . A5 . C6 - A5 G5    G5 - D5 . G5 - - .
      C6 B5 C6 G5 E5 - G5 .   A5 G5 A5 E5 C5 - . E5
      F5 E5 F5 A5 G5 - F5 .   D5 - G5 - B5 - . .`),
    accords: ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2'],
    basse: [1, 0, 1.5, 0, 1, 0, 1.5, 2],
    batterie: ['k', 'h', 's', 'h', 'k', 'h', 's', 'h'],
  },
  // En course : la mineur, rapide, arpèges qui poussent.
  course: {
    tempo: 152,
    timbre: 'square',
    melodie: air(`
      A4 C5 E5 A5 E5 C5 A4 C5   F4 A4 C5 F5 C5 A4 F4 A4
      C5 E5 G5 C6 G5 E5 C5 E5   B4 D5 G5 B5 D6 - B5 .
      E6 - D6 C6 B5 - A5 .      C6 - A5 F5 A5 - C6 .
      G5 - E5 G5 C6 - E6 .      D6 - B5 G5 D6 - - .`),
    accords: ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'C3', 'G2'],
    basse: [1, 1, 2, 1, 1, 1, 2, 1],
    batterie: ['K', 'h', 's', 'h', 'K', 'k', 's', 'h'],
  },
  // En ville : fa majeur, un peu funky, décalé.
  ville: {
    tempo: 124,
    timbre: 'square',
    melodie: air(`
      . A5 . C6 A5 . F5 .       . F5 . A5 D6 - C6 .
      . D6 . F6 D6 . Bb5 .      C6 - Bb5 A5 G5 - . .
      A5 C6 A5 F5 . F5 G5 A5    F5 - D5 F5 A5 - . .
      Bb5 - D6 - F6 - D6 .      E6 - D6 C6 G5 - E5 .`),
    accords: ['F2', 'D2', 'Bb2', 'C3', 'F2', 'D2', 'Bb2', 'C3'],
    basse: [1, 0, 2, 1, 0, 1, 2, 0],
    batterie: ['k', 'h', 's', 'k', 'h', 'k', 's', 'h'],
  },
};
