--!strict
-- Entrainement — les cinq mini-jeux de l'entraînement, un par stat.
--
-- Pur (aucune API Roblox), pour trois utilisateurs :
--   - le client y prend le déroulé de chaque jeu (zones, bandes, battements,
--     situations) et calcule la note ;
--   - le serveur y prend les durées plausibles, pour refuser une partie
--     finie trop vite ou trop tard ;
--   - la carrière y prend le gain de stats d'un tour d'entraînement.
--
-- Tout part d'une graine donnée par le serveur : même graine, même partie.
-- Une note va de 0 à 100 ; la qualité, c'est la note ramenée entre 0 et 1.

local Aleatoire = require(script.Parent.Parent:WaitForChild("Course"):WaitForChild("Aleatoire"))

local Entrainement = {}

export type Jeu = {
	id: string, -- le nom de la stat travaillée
	nom: string,
	icone: string,
	consigne: string,
	stat: string, -- nom de la stat, pour l'affichage
}

Entrainement.ORDRE = { "vitesse", "souffle", "puissance", "coeur", "instinct" }

Entrainement.JEUX = {
	vitesse = {
		id = "vitesse",
		nom = "Piste de sprint",
		icone = "⚡",
		consigne = "Touche quand le curseur passe dans la zone dorée !",
		stat = "Vitesse",
	},
	souffle = {
		id = "souffle",
		nom = "Bassin de souffle",
		icone = "🌬️",
		consigne = "Maintiens appuyé pour monter, relâche pour descendre. Reste dans la bande !",
		stat = "Souffle",
	},
	puissance = {
		id = "puissance",
		nom = "Côte des départs",
		icone = "💥",
		consigne = "Attends le feu vert, puis tape le plus vite possible !",
		stat = "Puissance",
	},
	coeur = {
		id = "coeur",
		nom = "Colline du courage",
		icone = "❤️",
		consigne = "Touche quand l'anneau se pose sur le cœur, en rythme.",
		stat = "Cœur",
	},
	instinct = {
		id = "instinct",
		nom = "Salle de lecture",
		icone = "👁️",
		consigne = "Choisis vite le couloir libre pour te glisser devant !",
		stat = "Instinct",
	},
} :: { [string]: Jeu }

function Entrainement.existe(jeu: unknown): boolean
	return type(jeu) == "string" and Entrainement.JEUX[jeu] ~= nil
end

-- Le mot qui accompagne une note.
function Entrainement.mot(note: number): string
	if note >= 95 then
		return "Parfait !"
	elseif note >= 80 then
		return "Très bien !"
	elseif note >= 60 then
		return "Bien joué"
	elseif note >= 40 then
		return "Pas mal"
	elseif note >= 20 then
		return "Courage !"
	end
	return "On recommence ?"
end

local function arrondir(x: number): number
	return math.floor(x + 0.5)
end

local function borner(note: number): number
	if note ~= note then -- NaN
		return 0
	end
	return math.clamp(arrondir(note), 0, 100)
end

-- ─────────────────────── 1. Vitesse : Piste de sprint ───────────────────────
-- Un curseur fait des allers-retours sur une barre (positions 0 à 1) ; on
-- touche quand il est dans la zone dorée. 8 essais, de plus en plus durs.

export type EssaiVitesse = {
	centre: number, -- centre de la zone, entre 0 et 1
	largeur: number, -- largeur totale de la zone
	vitesse: number, -- en longueurs de barre par seconde
}

Entrainement.VITESSE = {
	ESSAIS = 8,
	DELAI_MAX = 3, -- s pour toucher, ensuite l'essai est raté
	PAUSE = 0.7, -- s entre deux essais
}

function Entrainement.sequenceVitesse(graine: number): { EssaiVitesse }
	local rng = Aleatoire.nouveau(graine)
	local essais: { EssaiVitesse } = {}
	local n = Entrainement.VITESSE.ESSAIS
	for i = 1, n do
		local avance = (i - 1) / (n - 1)
		local largeur = 0.24 - 0.15 * avance
		table.insert(essais, {
			centre = rng:entre(0.2 + largeur / 2, 0.85 - largeur / 2),
			largeur = largeur,
			vitesse = 0.7 + 0.9 * avance,
		})
	end
	return essais
end

-- Position du curseur `t` secondes après le début de l'essai (aller-retour).
function Entrainement.curseurVitesse(essai: EssaiVitesse, t: number): number
	local parcours = (math.max(0, t) * essai.vitesse) % 2
	return if parcours <= 1 then parcours else 2 - parcours
end

-- Écart au centre de la zone, en demi-largeurs : 0 = plein centre, 1 = bord.
function Entrainement.ecartVitesse(essai: EssaiVitesse, position: number): number
	return math.abs(position - essai.centre) / (essai.largeur / 2)
end

-- `ecarts` : un par essai (nil = pas touché à temps).
function Entrainement.noteVitesse(ecarts: { number? }): number
	local total = 0
	for i = 1, Entrainement.VITESSE.ESSAIS do
		local e = ecarts[i]
		if type(e) == "number" and e == e and e <= 1 then
			-- Dans la zone : 60 à 100 % selon la précision
			total += 1 - 0.4 * math.max(0, e)
		end
	end
	return borner(100 * total / Entrainement.VITESSE.ESSAIS)
end

-- ─────────────────────── 2. Souffle : Bassin de souffle ───────────────────────
-- Une jauge (0 à 1) monte quand on appuie et descend quand on relâche ; une
-- bande se déplace, il faut y rester pendant 20 s.

export type PointBande = { t: number, centre: number }

Entrainement.SOUFFLE = {
	DUREE = 20,
	MONTEE = 0.5, -- par seconde, en appuyant
	DESCENTE = 0.42, -- par seconde, en relâchant
	LARGEUR_DEBUT = 0.26,
	LARGEUR_FIN = 0.16,
}

function Entrainement.sequenceSouffle(graine: number): { PointBande }
	local rng = Aleatoire.nouveau(graine)
	local points: { PointBande } = { { t = 0, centre = 0.5 } }
	local t = 0
	while t < Entrainement.SOUFFLE.DUREE do
		t += rng:entre(1.6, 3)
		table.insert(points, { t = t, centre = rng:entre(0.22, 0.78) })
	end
	return points
end

-- Centre et largeur de la bande au temps `t` (glissement adouci entre deux points).
function Entrainement.bandeSouffle(points: { PointBande }, t: number): (number, number)
	local s = Entrainement.SOUFFLE
	local largeur = s.LARGEUR_DEBUT + (s.LARGEUR_FIN - s.LARGEUR_DEBUT) * math.clamp(t / s.DUREE, 0, 1)
	for i = 2, #points do
		local a, b = points[i - 1], points[i]
		if t <= b.t then
			local u = math.clamp((t - a.t) / (b.t - a.t), 0, 1)
			u = u * u * (3 - 2 * u)
			return a.centre + (b.centre - a.centre) * u, largeur
		end
	end
	return points[#points].centre, largeur
end

-- Nouveau niveau de la jauge après `dt` secondes.
function Entrainement.jaugeSouffle(niveau: number, appuye: boolean, dt: number): number
	local s = Entrainement.SOUFFLE
	return math.clamp(niveau + (if appuye then s.MONTEE else -s.DESCENTE) * dt, 0, 1)
end

-- 90 % du temps dans la bande suffit pour un sans-faute.
function Entrainement.noteSouffle(tempsDansBande: number, duree: number): number
	if duree <= 0 then
		return 0
	end
	return borner(100 * math.clamp(tempsDansBande / duree / 0.9, 0, 1))
end

-- ─────────────────────── 3. Puissance : Côte des départs ───────────────────────
-- Trois départs : attendre le feu vert, puis taper le plus vite possible
-- pendant 5 s. Toucher avant le feu, c'est un faux départ.

export type Depart = {
	reaction: number?, -- s entre le feu vert et le premier appui (nil = faux départ)
	appuis: number, -- appuis pendant les 5 s
}

Entrainement.PUISSANCE = {
	DEPARTS = 3,
	DUREE_ELAN = 5,
	PAUSE = 1.5,
	REACTION_HUMAINE = 0.1, -- plus rapide, c'est qu'on a anticipé
	CADENCE_MAX = 12, -- appuis par seconde : au-delà, ce n'est plus un doigt
	CADENCE_PLEINE = 9, -- cadence qui vaut tous les points
}

-- Attente avant chaque feu vert (imprévisible, pour qu'on ne puisse pas l'anticiper).
function Entrainement.sequencePuissance(graine: number): { number }
	local rng = Aleatoire.nouveau(graine)
	local attentes: { number } = {}
	for _ = 1, Entrainement.PUISSANCE.DEPARTS do
		table.insert(attentes, rng:entre(1.5, 4))
	end
	return attentes
end

function Entrainement.notePuissance(departs: { Depart }): number
	local p = Entrainement.PUISSANCE
	local total = 0
	for i = 1, p.DEPARTS do
		local d = departs[i]
		if type(d) == "table" then
			local reaction = d.reaction
			local score = 0
			if type(reaction) == "number" and reaction >= p.REACTION_HUMAINE then
				-- 0,15 s = tous les points, 0,6 s = aucun
				score += 0.4 * math.clamp((0.6 - reaction) / 0.45, 0, 1)
			end
			local appuis = if type(d.appuis) == "number" then d.appuis else 0
			appuis = math.min(appuis, p.CADENCE_MAX * p.DUREE_ELAN)
			score += 0.6 * math.clamp(appuis / (p.CADENCE_PLEINE * p.DUREE_ELAN), 0, 1)
			total += score
		end
	end
	return borner(100 * total / p.DEPARTS)
end

-- ─────────────────────── 4. Cœur : Colline du courage ───────────────────────
-- Des battements de plus en plus rapprochés : toucher au moment où l'anneau
-- se pose sur le cœur. Les ratés vident la jauge de courage.

Entrainement.COEUR = {
	DUREE = 20,
	APPROCHE = 1, -- s pendant lesquelles l'anneau se resserre
	FENETRE = 0.25, -- au-delà de cet écart, ce n'est plus ce battement
}

function Entrainement.sequenceCoeur(graine: number): { number }
	local rng = Aleatoire.nouveau(graine)
	local battements: { number } = {}
	local t = 1.2
	while t < Entrainement.COEUR.DUREE - 0.3 do
		table.insert(battements, t)
		local avance = t / Entrainement.COEUR.DUREE
		-- De 0,9 s à 0,45 s entre deux battements, avec un peu de swing
		t += (0.9 - 0.45 * avance) * rng:entre(0.9, 1.15)
	end
	return battements
end

-- Valeur d'un appui selon son écart au battement (en s), et le mot affiché.
function Entrainement.jugerBattement(ecart: number): (number, string)
	local e = math.abs(ecart)
	if e <= 0.08 then
		return 1, "Parfait"
	elseif e <= 0.16 then
		return 0.6, "Bien"
	elseif e <= Entrainement.COEUR.FENETRE then
		return 0.3, "Juste"
	end
	return 0, "Raté"
end

-- Le courage après un battement : un raté coûte cher, un parfait remonte un peu.
function Entrainement.courage(courage: number, valeur: number): number
	local delta = if valeur >= 1 then 0.04 elseif valeur > 0 then 0 else -0.15
	return math.clamp(courage + delta, 0, 1)
end

-- `valeurs` : une par battement (0 si raté) ; `erreurs` : appuis tombés
-- entre deux battements ; `courage` : la jauge à la fin.
function Entrainement.noteCoeur(valeurs: { number }, battements: number, erreurs: number, courage: number): number
	if battements <= 0 then
		return 0
	end
	local somme = 0
	for i = 1, math.min(#valeurs, battements) do
		local v = valeurs[i]
		if type(v) == "number" and v == v then
			somme += math.clamp(v, 0, 1)
		end
	end
	local justesse = math.clamp((somme - 0.5 * math.max(0, erreurs)) / battements, 0, 1)
	return borner(100 * justesse * (0.85 + 0.15 * math.clamp(courage, 0, 1)))
end

-- ─────────────────────── 5. Instinct : Salle de lecture ───────────────────────
-- Vue de dessus, 3 couloirs, 4 rangs devant soi. Un seul couloir est libre
-- sur les deux rangs les plus proches : c'est là qu'il faut se glisser. Des
-- coureuses plus loin (rangs 3 et 4) brouillent la lecture.

export type Coureuse = { couloir: number, rang: number }
export type Situation = {
	libre: number, -- le bon couloir (1 à 3)
	coureuses: { Coureuse },
	limite: number, -- s pour répondre
}
export type Reponse = { juste: boolean, temps: number }

Entrainement.INSTINCT = {
	QUESTIONS = 10,
	COULOIRS = 3,
	RANGS = 4,
	PROCHES = 2, -- rangs qui comptent pour dire si un couloir est libre
	PAUSE = 0.6,
}

function Entrainement.sequenceInstinct(graine: number): { Situation }
	local rng = Aleatoire.nouveau(graine)
	local ins = Entrainement.INSTINCT
	local situations: { Situation } = {}
	for q = 1, ins.QUESTIONS do
		local libre = rng:entier(1, ins.COULOIRS)
		local coureuses: { Coureuse } = {}
		for couloir = 1, ins.COULOIRS do
			if couloir ~= libre then
				-- Un couloir bouché : une coureuse sur un rang proche
				table.insert(coureuses, { couloir = couloir, rang = rng:entier(1, ins.PROCHES) })
			end
			-- Des leurres plus loin, même dans le couloir libre
			if rng:reel() < 0.55 then
				table.insert(coureuses, { couloir = couloir, rang = rng:entier(ins.PROCHES + 1, ins.RANGS) })
			end
		end
		local avance = (q - 1) / (ins.QUESTIONS - 1)
		table.insert(situations, { libre = libre, coureuses = coureuses, limite = 3 - 1.2 * avance })
	end
	return situations
end

-- Vrai si le couloir est libre sur les rangs proches.
function Entrainement.couloirLibre(s: Situation, couloir: number): boolean
	for _, c in s.coureuses do
		if c.couloir == couloir and c.rang <= Entrainement.INSTINCT.PROCHES then
			return false
		end
	end
	return true
end

-- Juste et vite : jusqu'à 1 point ; juste mais au dernier moment : 0,5.
function Entrainement.noteInstinct(reponses: { Reponse }, situations: { Situation }): number
	local ins = Entrainement.INSTINCT
	local total = 0
	for i = 1, ins.QUESTIONS do
		local r, s = reponses[i], situations[i]
		if type(r) == "table" and s and r.juste == true and type(r.temps) == "number" then
			local fraction = math.clamp(r.temps / s.limite, 0, 1)
			if r.temps <= s.limite then
				total += 1 - 0.5 * fraction
			end
		end
	end
	return borner(100 * total / ins.QUESTIONS)
end

-- ─────────────────────────── Durées plausibles ───────────────────────────
-- Le serveur mesure le temps entre « commencer » et « terminer ». Une partie
-- honnête ne peut pas durer moins que le jeu lui-même ; ni bien plus que
-- son maximum (on ajoute de la marge pour la consigne, le 3-2-1 et le réseau).

Entrainement.MARGE = 20 -- s : consigne, compte à rebours, latence

-- Durée minimale du jeu seul, pour cette graine.
function Entrainement.dureeMinimale(jeu: string, graine: number): number
	if jeu == "vitesse" then
		-- Chaque essai : attendre que le curseur atteigne la zone, puis la pause
		local total = 0
		for _, e in Entrainement.sequenceVitesse(graine) do
			total += (e.centre - e.largeur / 2) / e.vitesse + Entrainement.VITESSE.PAUSE
		end
		return total
	elseif jeu == "souffle" then
		return Entrainement.SOUFFLE.DUREE
	elseif jeu == "puissance" then
		local p = Entrainement.PUISSANCE
		local total = 0
		for _, attente in Entrainement.sequencePuissance(graine) do
			total += attente + p.DUREE_ELAN
		end
		return total + p.PAUSE * (p.DEPARTS - 1)
	elseif jeu == "coeur" then
		local battements = Entrainement.sequenceCoeur(graine)
		return battements[#battements] or Entrainement.COEUR.DUREE
	elseif jeu == "instinct" then
		local ins = Entrainement.INSTINCT
		return ins.QUESTIONS * (Entrainement.PUISSANCE.REACTION_HUMAINE + ins.PAUSE) - ins.PAUSE
	end
	return 0
end

-- Durée maximale du jeu seul, pour cette graine.
function Entrainement.dureeMaximale(jeu: string, graine: number): number
	if jeu == "vitesse" then
		local v = Entrainement.VITESSE
		return v.ESSAIS * (v.DELAI_MAX + v.PAUSE)
	elseif jeu == "souffle" then
		return Entrainement.SOUFFLE.DUREE
	elseif jeu == "puissance" then
		local p = Entrainement.PUISSANCE
		return Entrainement.dureeMinimale(jeu, graine) + p.PAUSE
	elseif jeu == "coeur" then
		return Entrainement.COEUR.DUREE + Entrainement.COEUR.FENETRE
	elseif jeu == "instinct" then
		local total = 0
		for _, s in Entrainement.sequenceInstinct(graine) do
			total += s.limite + Entrainement.INSTINCT.PAUSE
		end
		return total
	end
	return 0
end

-- ─────────────────────────── Récompenses ───────────────────────────

-- Hors carrière, les étoiles des premiers entraînements du jour sont au plein
-- tarif, puis le gain baisse : on s'entraîne pour progresser, pas pour farmer.
Entrainement.PLEIN_TARIF_PAR_JOUR = 10
Entrainement.TARIF_REDUIT = 0.25

function Entrainement.tarif(dejaFaitsAujourdhui: number): number
	return if dejaFaitsAujourdhui < Entrainement.PLEIN_TARIF_PAR_JOUR then 1 else Entrainement.TARIF_REDUIT
end

-- Le jour (UTC) d'une heure os.time(), pour compter les entraînements du jour.
function Entrainement.jour(heure: number): number
	return math.floor(heure / 86400)
end

-- Multiplicateur des gains selon l'humeur (1 = au plus bas … 5 = au top).
Entrainement.HUMEUR = { 0.8, 0.9, 1, 1.1, 1.2 }

-- Gain de stat d'un tour d'entraînement en carrière. `qualite` ∈ [0, 1],
-- `humeur` de 1 à 5, `energie` de 0 à 100 : épuisée, on progresse moitié moins.
function Entrainement.gain(_stat: string, qualite: number, humeur: number, energie: number): number
	local q = math.clamp(if qualite == qualite then qualite else 0, 0, 1)
	local h = Entrainement.HUMEUR[math.clamp(math.floor(humeur), 1, 5)] or 1
	local e = math.clamp(if energie == energie then energie else 0, 0, 100)
	local forme = if e >= 50 then 1 else 0.5 + e / 100
	return math.max(1, arrondir((8 + 27 * q) * h * forme))
end

return Entrainement
