--!strict
-- Concert — le concert de la victoire : les chansons, la partition du jeu de
-- rythme, le jugement des appuis et l'ambiance de la salle.
--
-- Pur. Les trois premières de la course montent sur scène et jouent la
-- partition (4 colonnes, les notes descendent) ; le public, dans la fosse,
-- agite son bâton lumineux et fait monter l'ambiance. L'ambiance dépend de
-- la participation de toute la salle : chaque spectateur ne compte que pour
-- sa part, un seul tapoteur ne peut pas la remplir.

local Partage = script.Parent.Parent
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))

export type Chanson = {
	id: string,
	nom: string,
	son: string, -- rbxassetid, bibliothèque sous licence de Roblox ("" = muet)
	tempo: number, -- battements par minute (la partition suit ce tempo)
	depart: number, -- s : où commencer dans le morceau
}

export type Note = { t: number, colonne: number }

local Concert = {}

-- Musiques de la bibliothèque APM publiée sur Roblox (gratuites pour tous les
-- jeux), vérifiées le 23 octobre 2026 avec l'API de la Toolbox. Le tempo est
-- une estimation : la partition reste jouable même si elle ne tombe pas
-- pile sur le temps ; on peut le régler dans Studio en écoutant.
Concert.CHANSONS = {
	-- « Upbeat Pop » — Kosinus (APM)
	{ id = "etoiles", nom = "Étoiles de la piste", son = "rbxassetid://1839763308", tempo = 120, depart = 0 },
	-- « Cheerful Pop » — Kosinus (APM)
	{ id = "galop", nom = "Cœur au galop", son = "rbxassetid://1839766271", tempo = 124, depart = 0 },
	-- « Tonight All Right E » — Hermann Langschwert (APM)
	{ id = "arrivee", nom = "Lumière d'arrivée", son = "rbxassetid://1847760598", tempo = 128, depart = 0 },
	-- « Dream Within A Dream C » — Hideyuki Asada (APM)
	{ id = "archipel", nom = "Rêve d'archipel", son = "rbxassetid://1845976243", tempo = 116, depart = 0 },
} :: { Chanson }

Concert.COLONNES = 4
Concert.INTRO = 3 -- s : les artistes montent sur scène
Concert.DUREE = 28 -- s : la chanson
Concert.FINALE = 4 -- s : saluts et récapitulatif
Concert.ECART_MIN = 0.25 -- s entre deux notes : jouable au pouce
Concert.CHUTE = 1.6 -- s pendant lesquelles une note descend avant d'arriver

Concert.PARFAIT = 0.06 -- s
Concert.BIEN = 0.13
Concert.FENETRE = 0.18 -- au-delà, l'appui ne vise aucune note

function Concert.chanson(id: unknown): Chanson
	for _, c in Concert.CHANSONS do
		if c.id == id then
			return c
		end
	end
	return Concert.CHANSONS[1]
end

-- ─────────────────────────────── Partition ───────────────────────────────

-- Les notes d'une chanson : de plus en plus serrées (deux temps, puis un
-- temps, puis des demi-temps à la fin), sur 4 colonnes, jamais trois fois
-- de suite la même, jamais plus rapprochées que ECART_MIN.
function Concert.partition(graine: number, tempo: number, duree: number): { Note }
	local rng = Aleatoire.nouveau(graine)
	local temps = 60 / math.clamp(tempo, 60, 200)
	local notes: { Note } = {}
	local t = 1.5
	local precedente, avant = 0, 0
	while t < duree - 0.5 do
		local avance = t / duree
		local colonne = rng:entier(1, Concert.COLONNES)
		if colonne == precedente and colonne == avant then
			colonne = colonne % Concert.COLONNES + 1
		end
		table.insert(notes, { t = t, colonne = colonne })
		avant, precedente = precedente, colonne
		-- L'espacement : 2 temps au début, 1 temps au milieu, parfois ½ à la fin
		local pas = if avance < 0.25 then 2 elseif avance < 0.7 then 1 else (if rng:reel() < 0.45 then 0.5 else 1)
		t += math.max(Concert.ECART_MIN, pas * temps)
	end
	return notes
end

-- ─────────────────────────────── Jugement ───────────────────────────────

-- Valeur et mot d'un appui selon son écart à la note (en s).
function Concert.juger(ecart: number): (number, string)
	local e = math.abs(ecart)
	if e <= Concert.PARFAIT then
		return 1, "Parfait"
	elseif e <= Concert.BIEN then
		return 0.6, "Bien"
	end
	return 0, "Raté"
end

-- Note de 0 à 100 : la somme des valeurs sur le nombre de notes.
function Concert.note(valeurs: { number }, nombreDeNotes: number): number
	if nombreDeNotes <= 0 then
		return 0
	end
	local somme = 0
	for i = 1, math.min(#valeurs, nombreDeNotes) do
		local v = valeurs[i]
		if type(v) == "number" and v == v then
			somme += math.clamp(v, 0, 1)
		end
	end
	return math.clamp(math.floor(100 * somme / nombreDeNotes + 0.5), 0, 100)
end

-- ─────────────────────────────── Ambiance ───────────────────────────────

Concert.OVATIONS_COMPTEES = 3 -- par spectateur et par seconde, au plus
Concert.OVATIONS_MAX = 6 -- au-delà, le serveur ignore (anti-spam)
Concert.REMPLISSAGE = 8 -- s pour remplir la jauge si toute la salle joue
Concert.RETOMBEE = 0.04 -- par seconde, l'ambiance retombe si personne ne bouge

-- Vrai si une ovation compte encore, vu les ovations de la dernière seconde
-- de ce spectateur (`recentes` : leurs heures, en s). Retire les anciennes.
function Concert.compte(recentes: { number }, maintenant: number): boolean
	for i = #recentes, 1, -1 do
		if maintenant - recentes[i] >= 1 then
			table.remove(recentes, i)
		end
	end
	if #recentes >= Concert.OVATIONS_COMPTEES then
		return false
	end
	table.insert(recentes, maintenant)
	return true
end

-- Ce qu'une ovation comptée ajoute, dans une fosse de `public` spectateurs.
function Concert.gainOvation(public: number): number
	return 1 / (math.max(1, public) * Concert.OVATIONS_COMPTEES * Concert.REMPLISSAGE)
end

-- L'ambiance après `dt` secondes et `ovations` ovations comptées.
function Concert.ambiance(actuelle: number, ovations: number, public: number, dt: number): number
	local a = actuelle + math.max(0, ovations) * Concert.gainOvation(public) - Concert.RETOMBEE * math.max(0, dt)
	return math.clamp(a, 0, 1)
end

-- Sans public dans la fosse, la salle (le public de l'hippodrome) réagit au
-- spectacle : l'ambiance suit la qualité des artistes.
function Concert.ambianceSansPublic(qualites: { number }): number
	if #qualites == 0 then
		return 0.3
	end
	local somme = 0
	for _, q in qualites do
		somme += math.clamp(q, 0, 1)
	end
	return math.clamp(0.2 + 0.6 * somme / #qualites, 0, 1)
end

return Concert
