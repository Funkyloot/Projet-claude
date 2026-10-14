--!strict
-- IA — les décisions d'une coureuse bot, prises quatre fois par seconde.
--
-- Un bot dispose exactement des mêmes leviers qu'un joueur : rythme,
-- couloir, sprint et compétences. Il n'a aucun avantage caché ; il est
-- seulement plus ou moins fin selon son Instinct.
--
-- Ce module ne requiert pas Simulation (qui le requiert, lui) : il reçoit la
-- simulation et la coureuse sans les typer plus précisément.

local Formules = require(script.Parent:WaitForChild("Formules"))

local F = Formules

local IA = {}

-- Fraction de place dans le peloton : 0 en tête, 1 en queue.
local function placeRelative(sim: any, c: any): number
	if sim.partantes <= 1 then
		return 0
	end
	return (c.rang - 1) / (sim.partantes - 1)
end

local function choisirRythme(sim: any, c: any, phase: number)
	if phase == F.DEBUT then
		-- La stratégie fait déjà partir la Fusée plus vite que les autres ;
		-- pousser en plus la ferait se battre pour la tête et s'user pour rien.
		c.rythme = 2
		return
	end
	-- Prudence d'abord : si la réserve ne couvre pas la fin de course à rythme
	-- normal, on économise, quelle que soit la place.
	if c.endurance < sim:besoinEndurance(c) * 1.08 then
		c.rythme = 1
		return
	end
	if phase == F.MILIEU then
		local place = placeRelative(sim, c)
		local zone = c.strategie.zone
		if place > zone[2] + 0.1 then
			c.rythme = 3
		elseif place < zone[1] - 0.1 then
			c.rythme = 1
		else
			c.rythme = 2
		end
		return
	end
	c.rythme = 2
end

-- Un côté au hasard, puis l'autre : aucune préférence pour l'intérieur ou
-- l'extérieur, sinon les numéros de stalle ne se vaudraient plus.
local function cotes(sim: any): (number, number)
	if sim.rng:reel() < 0.5 then
		return 1, -1
	end
	return -1, 1
end

local function dansLaPiste(sim: any, couloir: number): boolean
	return couloir >= F.COULOIR_MIN and couloir <= sim.piste.largeur - F.COULOIR_MIN
end

local function choisirCouloir(sim: any, c: any, phase: number)
	local pas = F.PAS_COULOIR
	local devant = c.devant

	-- Les finisseuses n'attendent pas d'être enfermées : à l'approche de la
	-- ligne droite, elles cherchent une trajectoire dégagée.
	local strategie = c.strategie.id
	if
		(strategie == "vague" or strategie == "tempete")
		and sim:restant(c) < sim.piste.ligneDroiteFinale + sim.piste.dernierVirage * 0.5
		and not sim:couloirLibre(c, c.couloir, 10, 0)
	then
		local a, b = cotes(sim)
		for _, decalage in { a, b, 2 * a, 2 * b } do
			local couloir = c.couloir + decalage * pas
			if dansLaPiste(sim, couloir) and sim:couloirLibre(c, couloir, 10, 1.5) then
				c.couloirCible = couloir
				return
			end
		end
	end

	-- Doubler la coureuse de devant, si elle freine notre course
	if devant and c.ecartDevant < 4 and (c.bloquee or devant.v < c.v - 0.05) then
		local veutDoubler = phase == F.FINALE or c.sprint or placeRelative(sim, c) > c.strategie.zone[2]
		if veutDoubler then
			local a, b = cotes(sim)
			for _, decalage in { a, b } do
				local couloir = c.couloir + decalage * pas
				if dansLaPiste(sim, couloir) and sim:couloirLibre(c, couloir, 6, 1.5) then
					c.couloirCible = couloir
					return
				end
			end
			return
		end
	end

	if not IA.seDegager(sim, c) then
		IA.seMettreAbri(sim, c, phase)
	end
end

-- Enfermée depuis plus d'une seconde et demie : on se décale d'un couloir
-- là où il y a de la place. Les joueuses en profitent aussi quand elles ne
-- dirigent pas elles-mêmes.
function IA.seDegager(sim: any, c: any): boolean
	if not c.bloquee or c.bloqueeDepuis < 1.5 then
		return false
	end
	local a, b = cotes(sim)
	for _, decalage in { a, b } do
		local couloir = c.couloir + decalage * F.PAS_COULOIR
		if dansLaPiste(sim, couloir) and sim:couloirLibre(c, couloir, 4, 1.5) then
			c.couloirCible = couloir
			return true
		end
	end
	return false
end

-- Se glisser derrière une concurrente proche pour profiter de son sillage
-- (−15 % d'endurance). C'est ce qui regroupe le peloton en files, sans
-- avantager l'intérieur ni l'extérieur : la corde ne raccourcit pas la course.
-- La Fusée, elle, veut la tête et pas l'abri.
function IA.seMettreAbri(sim: any, c: any, phase: number)
	if phase == F.FINALE or c.aspiration or c.strategie.id == "fusee" then
		return
	end
	local cible: any = nil
	local meilleurEcart = math.huge
	for _, o in sim.coureuses do
		if o ~= c and o.partie and not o.arrivee then
			local ecart = o.d - c.d
			local decalage = math.abs(o.couloir - c.couloir)
			if
				ecart >= 2
				and ecart <= 10
				and decalage >= F.LARGEUR_CORPS
				and decalage <= 2 * F.PAS_COULOIR + 0.1
				and ecart < meilleurEcart
			then
				cible, meilleurEcart = o, ecart
			end
		end
	end
	if cible and dansLaPiste(sim, cible.couloir) and sim:couloirLibre(c, cible.couloir, meilleurEcart - 1, 1.5) then
		c.couloirCible = cible.couloir
	end
end

local function choisirSprint(sim: any, c: any, phase: number, evenements: { any })
	if phase ~= F.FINALE or c.sprint then
		return
	end
	local restant = sim:restant(c)
	-- Un bot estime sa réserve avec une erreur d'autant plus faible qu'il a
	-- de l'Instinct : les meilleurs sprintent au bon moment, les autres
	-- partent un peu tôt (et craquent) ou un peu tard (et regrettent).
	local precision = math.max(0.01, 0.1 - c.stats.instinct / 12000)
	local estimation = sim:sprintTenable(c) * (1 + sim.rng:entre(-precision, precision))
	if estimation >= restant - 1 then
		sim:lancerSprint(c, false, evenements)
	end
end

function IA.decider(sim: any, c: any, evenements: { any })
	local phase = sim:phaseDe(c)
	choisirRythme(sim, c, phase)
	choisirCouloir(sim, c, phase)
	choisirSprint(sim, c, phase, evenements)
end

return IA
