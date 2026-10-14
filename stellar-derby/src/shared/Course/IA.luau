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

local function choisirCouloir(sim: any, c: any, phase: number)
	local min, max = F.COULOIR_MIN, sim.piste.largeur - F.COULOIR_MIN
	local pas = F.PAS_COULOIR
	local devant = c.devant

	-- Veut-on doubler la coureuse de devant ?
	local veutDoubler = false
	if devant and c.ecartDevant < 4 and (c.bloquee or devant.v < c.v - 0.05) then
		veutDoubler = phase == F.FINALE or c.sprint or placeRelative(sim, c) > c.strategie.zone[2]
	end

	-- Les finisseuses n'attendent pas d'être enfermées : à l'approche de la
	-- ligne droite, elles cherchent une trajectoire dégagée, quitte à
	-- s'écarter un peu.
	local strategie = c.strategie.id
	if
		(strategie == "vague" or strategie == "tempete")
		and sim:restant(c) < sim.piste.ligneDroiteFinale + sim.piste.dernierVirage * 0.5
		and not sim:couloirLibre(c, c.couloir, 10, 0)
	then
		for _, decalage in { 1, 2, -1, 3 } do
			local couloir = c.couloir + decalage * pas
			if couloir >= min and couloir <= max and sim:couloirLibre(c, couloir, 10, 1.5) then
				c.couloirCible = couloir
				return
			end
		end
	end

	if veutDoubler then
		-- Par l'extérieur de préférence (plus de place), sinon par l'intérieur
		local dehors = c.couloir + pas
		if dehors <= max and sim:couloirLibre(c, dehors, 6, 1.5) then
			c.couloirCible = dehors
			return
		end
		local dedans = c.couloir - pas
		if dedans >= min and sim:couloirLibre(c, dedans, 6, 1.5) then
			c.couloirCible = dedans
		end
		return
	end

	IA.regagnerCorde(sim, c)
end

-- Regagner la corde quand la place est libre : c'est le chemin le plus
-- court. Dans la ligne droite finale, on garde sa trajectoire. Les joueuses
-- en profitent aussi quand elles ne dirigent pas elles-mêmes : une coureuse a
-- son propre sens de la course.
function IA.regagnerCorde(sim: any, c: any)
	local min = F.COULOIR_MIN
	if sim:restant(c) > sim.piste.ligneDroiteFinale and c.couloirCible > min + 0.05 then
		local dedans = math.max(min, c.couloir - F.PAS_COULOIR)
		if sim:couloirLibre(c, dedans, 3, 2) then
			c.couloirCible = dedans
		end
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
