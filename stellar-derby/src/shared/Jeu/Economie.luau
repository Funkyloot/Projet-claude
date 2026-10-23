--!strict
-- Economie — ce que rapporte chaque activité, et la courbe des niveaux.
--
-- Pur : testé hors de Roblox. Toutes les récompenses passent par ici, pour
-- qu'on puisse régler l'équilibre du jeu en un seul endroit.
--
-- Deux monnaies d'effort :
--   étoiles  dépensées à la boutique (cosmétiques seulement : jamais de stats)
--   xp       fait monter le niveau d'entraîneuse, qui débloque des titres
--
-- Rien ne s'achète qui fasse courir plus vite : une course libre reste égale
-- pour toutes, quel que soit le niveau ou ce qu'on a dépensé.

local Economie = {}

export type Gain = { etoiles: number, xp: number }

Economie.ETOILES_DEPART = 300

-- ───────────────────────────── Courses ─────────────────────────────

export type ContexteCourse = {
	rang: number,
	partantes: number,
	genre: string, -- "publique" | "carriere" | "tutoriel" | "live"
	grandPrix: boolean?, -- le Grand Prix du week-end rapporte double
	photoFinish: boolean?, -- une victoire au photo-finish vaut un petit bonus
}

-- Gains d'une course pour une joueuse classée `rang` sur `partantes`.
function Economie.recompenseCourse(c: ContexteCourse): Gain
	local n = math.max(2, c.partantes)
	local rang = math.clamp(c.rang, 1, n)
	-- Part du peloton battue : 1 pour la gagnante, 0 pour la dernière
	local battues = (n - rang) / (n - 1)
	local etoiles = 20 + math.floor(60 * battues + 0.5)
	if rang == 1 then
		etoiles += 50
	elseif rang <= 3 then
		etoiles += 20
	end
	local xp = 25 + math.floor(45 * battues + 0.5)
	if rang == 1 and c.photoFinish then
		etoiles += 15
	end
	local facteur = 1
	if c.genre == "tutoriel" then
		facteur = 0.5
	elseif c.genre == "carriere" then
		-- La carrière a ses propres récompenses (Légende, titres) : la course
		-- elle-même rapporte un peu moins.
		facteur = 0.6
	elseif c.genre == "live" then
		facteur = 0.5
	end
	if c.grandPrix then
		facteur *= 2
	end
	return { etoiles = math.floor(etoiles * facteur + 0.5), xp = math.floor(xp * facteur + 0.5) }
end

-- ─────────────────────────── Entraînement ───────────────────────────

-- `qualite` ∈ [0, 1] : la note du mini-jeu ramenée entre 0 et 1.
function Economie.recompenseEntrainement(qualite: number): Gain
	local q = math.clamp(qualite, 0, 1)
	return { etoiles = 8 + math.floor(32 * q + 0.5), xp = 10 + math.floor(30 * q + 0.5) }
end

-- ───────────────────────────── Concert ─────────────────────────────

-- `qualite` ∈ [0, 1] : la note du jeu de rythme (sur scène) ou la part de
-- la jauge d'ambiance remplie (dans la fosse). Toute la salle profite de
-- l'ambiance : c'est un bonus commun.
function Economie.recompenseConcert(qualite: number, surScene: boolean, ambiance: number): Gain
	local q = math.clamp(qualite, 0, 1)
	local a = math.clamp(ambiance, 0, 1)
	local base = if surScene then 25 + 45 * q else 10 + 20 * q
	local etoiles = math.floor(base * (1 + a) + 0.5)
	return { etoiles = etoiles, xp = math.floor(etoiles * 0.8 + 0.5) }
end

-- ───────────────────────────── Niveaux ─────────────────────────────

Economie.NIVEAU_MAX = 99

-- XP nécessaire pour passer du niveau n au niveau n + 1.
function Economie.xpPourNiveau(n: number): number
	return 100 + 60 * (n - 1)
end

-- Niveau atteint avec `xp` points, XP déjà faite dans ce niveau, et XP
-- nécessaire pour le suivant.
function Economie.niveau(xp: number): (number, number, number)
	local niveau = 1
	local reste = math.max(0, xp)
	while niveau < Economie.NIVEAU_MAX do
		local besoin = Economie.xpPourNiveau(niveau)
		if reste < besoin then
			return niveau, reste, besoin
		end
		reste -= besoin
		niveau += 1
	end
	return niveau, 0, 0
end

return Economie
