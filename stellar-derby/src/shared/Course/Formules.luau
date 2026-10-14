--!strict
-- Formules — la physique de la course, en fonctions pures.
--
-- Unités : mètres, secondes, m/s. Les stats vont d'environ 100 à 1 200 ;
-- une coureuse moyenne est autour de 600 partout.
--
-- Le modèle :
--   * Chaque course a une vitesse de base V0 qui baisse avec la distance.
--   * La vitesse visée dépend de la phase, de la stratégie et du rythme
--     choisi. La stat Vitesse ne compte qu'en finale : c'est la pointe.
--   * L'endurance se consomme selon le carré de l'écart à V0 : aller un peu
--     plus vite coûte nettement plus cher. En finale, la stat Cœur adoucit
--     la note.
--   * Endurance à zéro : la coureuse est « à bout » et retombe à ~85 % de V0.
--
-- Ce modèle s'inspire de la mécanique documentée par la communauté
-- d'Uma Musume (vitesse de base, consommation quadratique, coefficients par
-- stratégie), recalibrée pour un jeu où le joueur décide du rythme, du
-- couloir et du moment du sprint.

local Strategies = require(script.Parent:WaitForChild("Strategies"))

type Strategie = Strategies.Strategie

export type Stats = {
	vitesse: number,
	souffle: number,
	puissance: number,
	coeur: number,
	instinct: number,
}

local Formules = {}

-- Phases de course, par fraction de la distance
Formules.DEBUT, Formules.MILIEU, Formules.FINALE = 1, 2, 3
Formules.NOMS_PHASES = { "Début de course", "Milieu de course", "Finale" }

Formules.RYTHMES = {
	{ id = "eco", nom = "Économie", vitesse = 0.975 },
	{ id = "normal", nom = "Normal", vitesse = 1.0 },
	{ id = "pousser", nom = "Pousser", vitesse = 1.025 },
}
Formules.RYTHME_NORMAL = 2

-- Constantes de course
Formules.VITESSE_DEPART = 3 -- m/s à la sortie des stalles
Formules.ACCELERATION_DEPART = 24 -- m/s², jusqu'à 85 % de V0
Formules.DECELERATION = { 1.2, 0.8, 1.0 } -- m/s², par phase
Formules.DECELERATION_EPUISEE = 1.2
Formules.ASPIRATION_ENDURANCE = 0.85 -- consommation dans le sillage
Formules.ASPIRATION_VITESSE = 0.1 -- m/s gagnés dans le sillage
Formules.ETAT_PISTE = { bon = 1.0, lourd = 1.04 } -- coût d'endurance
Formules.ETAT_PISTE_VITESSE = { bon = 0, lourd = -0.25 } -- m/s sur V0

-- Corps (mètres) : sert aux blocages, au sillage et aux écarts à l'arrivée
Formules.LONGUEUR_CORPS = 2.5 -- une « longueur », unité des écarts
Formules.ESPACE_CORPS = 1.1 -- distance minimale entre deux coureuses alignées
Formules.LARGEUR_CORPS = 0.9 -- en dessous, deux coureuses sont dans le même couloir
Formules.DISTANCE_BLOCAGE = 1.6
Formules.SILLAGE_MIN, Formules.SILLAGE_MAX = 0.6, 6
Formules.PAS_COULOIR = 1.2 -- déplacement latéral demandé par un appui
Formules.COULOIR_MIN = 0.6 -- ne pas frotter la lice

-- Part de la réserve qui vient de la stat Souffle (le reste vient de la
-- distance). C'est le réglage le plus sensible du jeu : il décide si l'on
-- peut sprinter toute la finale ou s'il faut choisir son moment.
Formules.FACTEUR_SOUFFLE = 0.7

-- En virage, un couloir extérieur parcourt plus de terrain. La géométrie
-- exacte (facteur 1) rendait le numéro de stalle trop décisif : on n'en
-- garde qu'une part, comme si les coureuses coupaient un peu la courbe.
Formules.PENALITE_VIRAGE = 0.5

function Formules.phase(d: number, distance: number): number
	local f = d / distance
	if f < 1 / 6 then
		return Formules.DEBUT
	elseif f < 2 / 3 then
		return Formules.MILIEU
	end
	return Formules.FINALE
end

function Formules.vitesseBase(distance: number, etat: string?): number
	local ajustement = Formules.ETAT_PISTE_VITESSE[etat or "bon"] or 0
	return 20 - (distance - 2000) / 1000 + ajustement
end

-- La pointe : ce que la stat Vitesse ajoute en finale.
function Formules.bonusPointe(vitesse: number): number
	return math.sqrt(500 * vitesse) * 0.002
end

function Formules.bonusCoeurSprint(coeur: number): number
	return (450 * coeur) ^ 0.597 * 0.0001
end

function Formules.vitesseCroisiere(
	v0: number,
	strategie: Strategie,
	phase: number,
	rythme: number,
	stats: Stats
): number
	local v = v0 * strategie.vitesse[phase] * Formules.RYTHMES[rythme].vitesse
	if phase == Formules.FINALE then
		v += Formules.bonusPointe(stats.vitesse)
	end
	return v
end

function Formules.vitesseSprint(v0: number, strategie: Strategie, stats: Stats): number
	return (v0 * strategie.vitesse[Formules.FINALE] + 0.01 * v0) * 1.05
		+ Formules.bonusPointe(stats.vitesse)
		+ Formules.bonusCoeurSprint(stats.coeur)
end

function Formules.vitesseEpuisee(v0: number, coeur: number): number
	return v0 * 0.85 + math.sqrt(200 * coeur) * 0.001
end

function Formules.enduranceMax(strategie: Strategie, souffle: number, distance: number): number
	return Formules.FACTEUR_SOUFFLE * strategie.endurance * souffle + distance
end

-- Facteur de progression le long de la corde pour un couloir donné.
function Formules.progressionEnVirage(courbure: number, couloir: number): number
	return 1 / (1 + courbure * couloir * Formules.PENALITE_VIRAGE)
end

-- Endurance consommée par seconde à la vitesse v.
function Formules.consommation(v: number, v0: number, finale: boolean, coeur: number, etat: string?): number
	local c = 20 * (v - v0 + 12) ^ 2 / 144 * (Formules.ETAT_PISTE[etat or "bon"] or 1)
	if finale then
		c *= 1 + 200 / math.sqrt(600 * coeur)
	end
	return c
end

function Formules.acceleration(puissance: number, strategie: Strategie, phase: number): number
	return 0.0009 * math.sqrt(500 * puissance) * strategie.acceleration[phase]
end

function Formules.vitesseLaterale(puissance: number): number
	return 1.0 + puissance / 1000
end

-- Le duel : deux coureuses côte à côte dans la dernière ligne droite se
-- poussent mutuellement. Le Cœur décide de qui en profite le plus.
function Formules.bonusDuelVitesse(coeur: number): number
	return (200 * coeur) ^ 0.708 * 0.0001
end

function Formules.bonusDuelAcceleration(coeur: number): number
	return (160 * coeur) ^ 0.59 * 0.0001
end

-- Variation de rythme d'une section à l'autre, en fraction de V0. L'Instinct
-- la décale vers le positif : une coureuse fine se place mieux.
function Formules.bornesAlea(instinct: number): (number, number)
	local max = (instinct / 5500) * math.log10(math.max(instinct, 10) * 0.1) / 100
	return max - 0.0065, max
end

-- Combien de mètres de sprint l'endurance restante permet-elle de tenir,
-- en courant à vNormale jusqu'au déclenchement puis à vSprint jusqu'au bout ?
-- C'est à la fois l'indice affiché au joueur et le calcul de l'IA.
function Formules.sprintTenable(
	endurance: number,
	restant: number,
	vNormale: number,
	vSprint: number,
	v0: number,
	coeur: number,
	etat: string?
): number
	if restant <= 0 then
		return 0
	end
	local parMetreNormal = Formules.consommation(vNormale, v0, true, coeur, etat) / vNormale
	local parMetreSprint = Formules.consommation(vSprint, v0, true, coeur, etat) / vSprint
	if parMetreSprint <= parMetreNormal then
		return restant
	end
	local x = (endurance - parMetreNormal * restant) / (parMetreSprint - parMetreNormal)
	return math.clamp(x, 0, restant)
end

-- Intitulé de l'écart entre deux arrivantes, à la japonaise.
function Formules.intituleEcart(metres: number): string
	local l = metres / Formules.LONGUEUR_CORPS
	if metres < 0.01 then
		return "Ex æquo"
	elseif l < 0.1 then
		return "Nez"
	elseif l < 0.25 then
		return "Tête"
	elseif l < 0.5 then
		return "Encolure"
	elseif l > 10 then
		return "Large"
	end
	-- Au quart de longueur jusqu'à 2 ½, puis à la demi-longueur, puis entier
	local pasArrondi = if l < 2.5 then 0.25 elseif l < 5 then 0.5 else 1
	local arrondi = math.max(0.5, math.floor(l / pasArrondi + 0.5) * pasArrondi)
	local entier = math.floor(arrondi)
	local fraction = arrondi - entier
	local fractions = { [0.25] = "¼", [0.5] = "½", [0.75] = "¾" }
	if entier == 0 then
		return fractions[fraction] .. " longueur"
	end
	local texte = tostring(entier)
	if fraction > 0 then
		texte ..= " " .. fractions[fraction]
	end
	return texte .. (if arrondi >= 2 then " longueurs" else " longueur")
end

-- Cadre de couleur (1 à 8) d'un numéro, selon la règle japonaise : au-delà
-- de 8 partantes, les derniers cadres accueillent deux numéros chacun.
function Formules.cadre(numero: number, partantes: number): number
	if partantes <= 8 then
		return numero
	end
	local doubles = math.min(8, partantes - 8)
	local simples = 8 - doubles
	if numero <= simples then
		return numero
	end
	return math.min(8, simples + math.ceil((numero - simples) / 2))
end

return Formules
