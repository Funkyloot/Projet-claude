/* assets.js — chargement optionnel des assets téléchargés.
 *
 * L'app sait se dessiner entièrement toute seule. Ce module vient par-dessus :
 * s'il trouve `assets/manifest.json` et que les fichiers qu'il décrit se
 * chargent, les scènes les utilisent ; sinon tout retombe silencieusement sur
 * le rendu procédural.
 *
 * C'est volontaire, et pas seulement par prudence : le manifeste est rempli
 * par une autre machine (voir ASSETS.md), donc il sera forcément incomplet
 * pendant un moment. Une couche manquante ne doit jamais casser l'écran.
 */

const BASE = 'assets/';

/** Charge une image. Ne rejette jamais : renvoie null en cas d'échec. */
function chargerImage(chemin) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[assets] image introuvable, on garde le rendu dessiné : ${chemin}`);
      resolve(null);
    };
    img.src = BASE + chemin;
  });
}

export class Assets {
  constructor() {
    this.pret = false;
    this.scenes = {};      // { foret: [ {img, parallax, ancre, decalageY} ], ... }
    this.chat = null;      // { img, largeurCase, hauteurCase, animations }
    this.audio = {};       // { foret: 'assets/audio/forest.ogg', ... }
    this.police = null;
  }

  /** Tente de charger le manifeste et tout ce qu'il déclare. */
  async charger() {
    let manifeste;
    try {
      const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      manifeste = await r.json();
    } catch {
      // Pas de manifeste : c'est le cas nominal tant que les assets ne sont
      // pas arrivés. On ne signale rien, l'app est complète sans eux.
      this.pret = true;
      return this;
    }

    const attentes = [];

    // --- Couches de décor ---
    for (const [nom, def] of Object.entries(manifeste.scenes || {})) {
      const couches = def.layers || [];
      attentes.push(
        Promise.all(couches.map((c) => chargerImage(c.file))).then((imgs) => {
          const valides = couches
            .map((c, i) => ({
              img: imgs[i],
              parallax: c.parallax ?? 0.5,
              ancre: c.ancre === 'sol' ? 'sol' : 'haut',
              decalageY: c.decalageY ?? 0,
            }))
            .filter((c) => c.img);
          // Une scène à moitié chargée serait pire que pas d'assets du tout :
          // on n'accepte le décor que si toutes ses couches sont là.
          if (valides.length === couches.length && valides.length > 0) {
            this.scenes[nom] = valides;
          } else if (valides.length) {
            console.warn(`[assets] scène « ${nom} » incomplète, rendu dessiné conservé`);
          }
        })
      );
    }

    // --- Planche du chat ---
    if (manifeste.chat?.planche) {
      attentes.push(
        chargerImage(manifeste.chat.planche).then((img) => {
          if (!img) return;
          const lc = manifeste.chat.largeurCase, hc = manifeste.chat.hauteurCase;
          if (!lc || !hc) {
            console.warn('[assets] planche du chat sans dimensions de case, ignorée');
            return;
          }
          this.chat = {
            img,
            largeurCase: lc,
            hauteurCase: hc,
            animations: manifeste.chat.animations || {},
          };
        })
      );
    }

    // --- Sons et police : de simples chemins, chargés par leurs modules ---
    for (const [nom, f] of Object.entries(manifeste.audio || {})) {
      this.audio[nom] = BASE + f;
    }
    if (manifeste.police?.fichier) {
      this.police = { url: BASE + manifeste.police.fichier, nom: manifeste.police.nom || 'PixelUI' };
    }

    await Promise.all(attentes);
    this.pret = true;

    const trouves = Object.keys(this.scenes);
    if (trouves.length || this.chat || Object.keys(this.audio).length) {
      console.info('[assets] chargés :', {
        decors: trouves,
        chat: !!this.chat,
        sons: Object.keys(this.audio),
      });
    }
    return this;
  }

  /** Renvoie les couches d'une scène, ou null si elle doit rester dessinée. */
  couches(id) {
    return this.scenes[id] || null;
  }
}

/** Dessine des couches en parallaxe, répétées horizontalement.
 *
 *  `ancre` décide du calage vertical : `haut` colle la couche au bord
 *  supérieur (le ciel), `sol` la pose sur la ligne de sol (les arbres, les
 *  façades) — c'est ce qui permet à un même jeu d'images de tenir sur des
 *  écrans de proportions très différentes.
 */
export function dessinerCouches(ctx, couches, W, H, camX, groundY) {
  for (const c of couches) {
    const img = c.img;
    const y = c.ancre === 'sol' ? groundY - img.height + c.decalageY : c.decalageY;
    let x = -((camX * c.parallax) % img.width);
    if (x > 0) x -= img.width;
    for (; x < W; x += img.width) {
      ctx.drawImage(img, Math.round(x), Math.round(y));
    }
  }
}
