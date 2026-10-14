--!nocheck
-- Réglage — ajuste automatiquement le coefficient de finale de chaque
-- stratégie pour qu'aucune ne soit avantagée, toutes distances confondues.
--
--     lune run tests/reglage [itérations] [courses par distance]
--
-- À chaque itération, on simule les mêmes courses (mêmes graines : le bruit
-- d'une itération à l'autre ne vient que des coefficients) et on mesure le
-- rang moyen de chaque stratégie. Le rang moyen est une mesure continue,
-- bien moins bruitée que le nombre de victoires. On corrige ensuite :
--     c3 ← c3 + gain × (rang moyen − rang neutre) − gain' × ln(indice de victoires)
-- puis on recentre les corrections pour que leur somme soit nulle : les
-- stratégies bougent les unes par rapport aux autres, sans que toute la
-- course accélère ou ralentisse. Les coefficients obtenus sont à reporter
-- dans Course/Strategies.

local process = require("@lune/process")
local H = require("./harnais")
local P = H.partage()
local Piste = H.require(P.Course.Piste)
local Courses = H.require(P.Course.Courses)
local Peloton = H.require(P.Course.Peloton)
local Simulation = H.require(P.Course.Simulation)
local Strategies = H.require(P.Course.Strategies)
local Aleatoire = H.require(P.Course.Aleatoire)
local Config = H.require(P.Config)

local ITERATIONS = tonumber(process.args[1]) or 6
local K = tonumber(process.args[2]) or 30
local GAIN = 0.0025
local GAIN_VICTOIRES = 0.0015
local TAILLE = Config.TAILLE_PELOTON
local piste = Piste.stade(Config.LIGNE_DROITE, Config.RAYON_VIRAGE, Config.LARGEUR_PISTE, Config.POSITION_ARRIVEE)

local function evaluer()
	local sommeRangs, partants, victoires = {}, {}, {}
	local parCourse = {}
	for _, id in Strategies.ordre do
		sommeRangs[id], partants[id], victoires[id] = 0, 0, 0
	end
	for _, course in Courses.liste do
		local r, p, v = {}, {}, {}
		for _, id in Strategies.ordre do
			r[id], p[id], v[id] = 0, 0, 0
		end
		for graine = 1, K do
			local defs = Peloton.completer({}, TAILLE, Aleatoire.nouveau(graine * 7919))
			local sim = Simulation.nouvelle(piste, course, defs, graine, 0)
			while not sim.termine do
				sim:pas(1 / 30)
			end
			for _, res in sim:resultats() do
				r[res.strategie] += res.rang
				p[res.strategie] += 1
				if res.rang == 1 then
					v[res.strategie] += 1
				end
			end
		end
		local ligne = {}
		for _, id in Strategies.ordre do
			sommeRangs[id] += r[id]
			partants[id] += p[id]
			victoires[id] += v[id]
			table.insert(ligne, string.format("%s %.1f", id, r[id] / math.max(1, p[id])))
		end
		table.insert(parCourse, `{course.distance} m : {table.concat(ligne, ", ")}`)
	end
	local rangs, indices = {}, {}
	for _, id in Strategies.ordre do
		rangs[id] = sommeRangs[id] / math.max(1, partants[id])
		indices[id] = victoires[id] / math.max(1, partants[id] / TAILLE)
	end
	return rangs, indices, parCourse
end

local NEUTRE = (TAILLE + 1) / 2
for iteration = 1, ITERATIONS do
	local rangs, indices, parCourse = evaluer()
	local ligne = {}
	for _, id in Strategies.ordre do
		local s = Strategies.parId[id]
		table.insert(
			ligne,
			string.format("%s c3=%.4f rang=%.2f victoires=%.2f", id, s.vitesse[3], rangs[id], indices[id])
		)
	end
	print(`[{iteration}] {table.concat(ligne, " | ")}`)
	for _, l in parCourse do
		print(`      {l}`)
	end
	if iteration < ITERATIONS then
		local corrections, moyenne = {}, 0
		for _, id in Strategies.ordre do
			-- Rang moyen, et un peu de victoires : une stratégie « tout ou rien »
			-- peut avoir le même rang moyen qu'une autre et gagner bien plus.
			corrections[id] = GAIN * (rangs[id] - NEUTRE) - GAIN_VICTOIRES * math.log(math.max(indices[id], 0.25))
			moyenne += corrections[id] / #Strategies.ordre
		end
		for _, id in Strategies.ordre do
			local s = Strategies.parId[id]
			s.vitesse[3] += corrections[id] - moyenne
		end
	end
end
