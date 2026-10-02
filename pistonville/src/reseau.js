/* reseau.js — la géométrie de la carte : routes, carrefours et parcelles.
 *
 * La carte est une grille de N × N pâtés séparés par N + 1 « lignes » de
 * route. Chaque ligne a sa largeur :
 *   - 0 : pas de route du tout (les pâtés voisins se touchent) ;
 *   - 6 cases : une rue ou une route de campagne, une voie par sens ;
 *   - 10 cases : un boulevard, deux voies par sens et un terre-plein central.
 * Sur une ligne, chaque tronçon (d'un carrefour au suivant) existe ou non :
 * en ville il y a une rue à chaque pâté, à la campagne seulement quelques
 * routes, et les pâtés que rien ne sépare forment une grande parcelle
 * (un champ, un bois, un parc avec son lac…).
 *
 * Chaque pâté occupe une « cellule » de 24 cases : un bord d'une case
 * (trottoir en ville, bas-côté à la campagne, ou terrain s'il n'y a pas de
 * route de ce côté), puis 22 cases d'intérieur, puis encore un bord. En
 * ville, l'intérieur se partage en quatre lots de 10 cases autour d'une cour.
 *
 * Circulation à droite : sur une route est-ouest, on va vers l'ouest sur la
 * moitié nord et vers l'est sur la moitié sud ; sur une route nord-sud, vers
 * le sud sur la moitié ouest et vers le nord sur la moitié est. La voie 0 est
 * celle de droite (près du trottoir), la voie 1 celle de gauche.
 */

export const T = 16;
export const CASES_CELLULE = 24;
export const CELLULE = CASES_CELLULE * T;   // 384 px
export const INTERIEUR = (CASES_CELLULE - 2) * T;   // 352 px
export const LOT = 160;                      // un lot de ville (10 cases)
export const COUR = INTERIEUR - 2 * LOT;     // 32 px entre les lots
export const BOULEVARD = 10;                // cases : à partir de là, deux voies par sens
export const TERRE_PLEIN = 16;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 0 est, 1 sud, 2 ouest, 3 nord

export class Reseau {
  /**
   * largeurs : N + 1 largeurs de ligne (en cases) ;
   * horizontal(kx, ky) : existe-t-il un tronçon sur la ligne est-ouest ky, du carrefour kx au kx + 1 ?
   * vertical(kx, ky) : même chose sur la ligne nord-sud kx, du carrefour ky au ky + 1.
   */
  constructor(largeurs, horizontal, vertical) {
    this.N = largeurs.length - 1;
    const N = this.N;
    this.L = largeurs.map((c) => c * T);
    this.X = [];
    let x = 0;
    for (let k = 0; k <= N; k++) { this.X.push(x); x += this.L[k] + (k < N ? CELLULE : 0); }
    this.taille = x;
    this.cases = x / T;
    this.H = [];
    this.V = [];
    for (let k = 0; k <= N; k++) {
      this.H.push([]); this.V.push([]);
      for (let s = 0; s < N; s++) {
        this.H[k].push(this.L[k] > 0 && !!horizontal(s, k));
        this.V[k].push(this.L[k] > 0 && !!vertical(k, s));
      }
    }
    // Pour chaque case le long d'un axe : dans quelle ligne, ou quel pâté (et où dans sa cellule).
    this.bande = [];
    for (let k = 0; k <= N; k++) {
      for (let i = 0; i < this.L[k] / T; i++) this.bande.push({ ligne: k, pos: i });
      if (k < N) for (let i = 0; i < CASES_CELLULE; i++) this.bande.push({ bloc: k, pos: i });
    }
    this.parcelles = this.calculerParcelles();
  }

  // --- Tronçons et carrefours -----------------------------------------------------------

  h(kx, ky) { return kx >= 0 && kx < this.N && ky >= 0 && ky <= this.N && this.H[ky][kx]; }
  v(kx, ky) { return ky >= 0 && ky < this.N && kx >= 0 && kx <= this.N && this.V[kx][ky]; }

  /** Les branches d'un carrefour : est, sud, ouest, nord (dans l'ordre des directions). */
  branches(kx, ky) { return [this.h(kx, ky), this.v(kx, ky), this.h(kx - 1, ky), this.v(kx, ky - 1)]; }
  carrefour(kx, ky) { return this.branches(kx, ky).some(Boolean); }
  /** Un vrai croisement (trois branches ou plus) : feux en ville, STOP à la campagne. */
  croisement(kx, ky) { return this.branches(kx, ky).filter(Boolean).length >= 3; }

  centre(kx, ky) { return { x: this.X[kx] + this.L[kx] / 2, y: this.X[ky] + this.L[ky] / 2 }; }
  carre(kx, ky) { return { x: this.X[kx], y: this.X[ky], w: this.L[kx], h: this.L[ky] }; }

  /** Cellule d'un pâté (bord compris) et son intérieur. */
  cellule(bx, by) { return { x: this.X[bx] + this.L[bx], y: this.X[by] + this.L[by], w: CELLULE, h: CELLULE }; }
  origine(bx, by) { const c = this.cellule(bx, by); return { x: c.x + T, y: c.y + T }; }

  /** Les routes qui bordent un pâté. */
  bords(bx, by) {
    return { haut: this.h(bx, by), bas: this.h(bx, by + 1), gauche: this.v(bx, by), droite: this.v(bx + 1, by) };
  }

  // --- Voies -----------------------------------------------------------------------------

  voies(k) { return this.L[k] >= BOULEVARD * T ? 2 : 1; }

  /** Largeur d'une voie : la moitié d'une rue, le quart d'un boulevard (terre-plein à part). */
  largeurVoie(k) { return this.voies(k) === 2 ? (this.L[k] - TERRE_PLEIN) / 4 : this.L[k] / 2; }

  /** Coordonnée transversale de la voie n, pour la direction dir, sur la ligne k. */
  voie(dir, k, n = 0) {
    const a = this.X[k], l = this.L[k], lv = this.largeurVoie(k);
    n = Math.min(n, this.voies(k) - 1);
    const pres = lv / 2 + n * lv;
    // Ouest (2) et sud (1) : côté « bas » des coordonnées ; est (0) et nord (3) : côté « haut ».
    return dir === 2 || dir === 1 ? a + pres : a + l - pres;
  }

  /** La ligne dont la bande contient cette coordonnée (ou -1). */
  ligneA(c) {
    const b = this.bande[Math.floor(c / T)];
    return b && b.ligne !== undefined ? b.ligne : -1;
  }

  /** Le pâté dont la cellule contient cette coordonnée (ou -1). */
  blocA(c) {
    const b = this.bande[Math.floor(c / T)];
    return b && b.bloc !== undefined ? b.bloc : -1;
  }

  dansCarrefour(x, y) {
    const kx = this.ligneA(x), ky = this.ligneA(y);
    return kx >= 0 && ky >= 0 && this.carrefour(kx, ky) ? { kx, ky } : null;
  }

  /** Prochain carrefour devant une voiture qui roule sur la ligne k dans la direction dir. */
  prochain(dir, k, x, y) {
    const [dx, dy] = DIRS[dir];
    const pos = dx ? x : y;
    const sens = dx || dy;
    let j = this.blocA(pos);
    if (j < 0) { const l = this.ligneA(pos); j = sens > 0 ? l : l - 1; }
    let kn = sens > 0 ? j + 1 : j;
    // Les carrefours sans croisement ni virage (ligne de largeur nulle) se traversent tout droit.
    while (kn > 0 && kn < this.N && this.L[kn] === 0) kn += sens;
    const bord = sens > 0 ? this.X[kn] : this.X[kn] + this.L[kn];
    return dx ? { kx: kn, ky: k, bord } : { kx: k, ky: kn, bord };
  }

  // --- Cases et parcelles -----------------------------------------------------------------

  /**
   * Ce qu'il y a sur une case : 'route', 'bord' (trottoir ou bas-côté, le long
   * d'une route) ou 'terre' (l'intérieur d'une parcelle). bx, by : le pâté
   * auquel la case se rattache.
   */
  classer(gx, gy) {
    const ax = this.bande[gx], ay = this.bande[gy];
    if (!ax || !ay) return null;
    if (ax.ligne !== undefined && ay.ligne !== undefined) {
      if (this.carrefour(ax.ligne, ay.ligne)) return { type: 'route', kx: ax.ligne, ky: ay.ligne };
      return { type: 'terre', bx: Math.min(ax.ligne, this.N - 1), by: Math.min(ay.ligne, this.N - 1) };
    }
    if (ax.ligne !== undefined) {
      if (this.v(ax.ligne, ay.bloc)) return { type: 'route', kx: ax.ligne };
      return { type: 'terre', bx: Math.min(ax.ligne, this.N - 1), by: ay.bloc };
    }
    if (ay.ligne !== undefined) {
      if (this.h(ax.bloc, ay.ligne)) return { type: 'route', ky: ay.ligne };
      return { type: 'terre', bx: ax.bloc, by: Math.min(ay.ligne, this.N - 1) };
    }
    const bx = ax.bloc, by = ay.bloc, px = ax.pos, py = ay.pos, d = CASES_CELLULE - 1;
    const b = this.bords(bx, by);
    const gauche = px === 0 && b.gauche, droite = px === d && b.droite, haut = py === 0 && b.haut, bas = py === d && b.bas;
    if (gauche || droite || haut || bas) return { type: 'bord', bx, by, gauche, droite, haut, bas };
    return { type: 'terre', bx, by };
  }

  /** Les pâtés que rien ne sépare forment une parcelle : { id, blocs, x0, y0, x1, y1 (indices) }. */
  calculerParcelles() {
    const N = this.N;
    const id = [];
    for (let by = 0; by < N; by++) { id.push([]); for (let bx = 0; bx < N; bx++) id[by].push(by * N + bx); }
    const racine = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const parent = [...Array(N * N).keys()];
    const unir = (a, b) => { parent[racine(a)] = racine(b); };
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      if (bx + 1 < N && !this.v(bx + 1, by)) unir(id[by][bx], id[by][bx + 1]);
      if (by + 1 < N && !this.h(bx, by + 1)) unir(id[by][bx], id[by + 1][bx]);
    }
    const parcelles = new Map();
    this.parcelleDe = [];
    for (let by = 0; by < N; by++) {
      this.parcelleDe.push([]);
      for (let bx = 0; bx < N; bx++) {
        const r = racine(id[by][bx]);
        if (!parcelles.has(r)) parcelles.set(r, { id: r, blocs: [], x0: bx, y0: by, x1: bx, y1: by });
        const p = parcelles.get(r);
        p.blocs.push([bx, by]);
        p.x0 = Math.min(p.x0, bx); p.y0 = Math.min(p.y0, by); p.x1 = Math.max(p.x1, bx); p.y1 = Math.max(p.y1, by);
        this.parcelleDe[by].push(p);
      }
    }
    return [...parcelles.values()];
  }

  /** Rectangle (en px) d'une parcelle rectangulaire, bords compris. */
  rectParcelle(p) {
    const a = this.cellule(p.x0, p.y0), b = this.cellule(p.x1, p.y1);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  }

  /** La parcelle est-elle bordée par une route de ce côté (au moins sur un tronçon) ? */
  coteParcelle(p, cote) {
    for (let i = p.x0; i <= p.x1; i++) {
      if (cote === 'haut' && this.h(i, p.y0)) return true;
      if (cote === 'bas' && this.h(i, p.y1 + 1)) return true;
    }
    for (let j = p.y0; j <= p.y1; j++) {
      if (cote === 'gauche' && this.v(p.x0, j)) return true;
      if (cote === 'droite' && this.v(p.x1 + 1, j)) return true;
    }
    return false;
  }
}
