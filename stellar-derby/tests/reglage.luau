--!nocheck
-- Réglage — ajuste automatiquement le coefficient de finale de chaque
-- stratégie pour que chacune gagne sa juste part, toutes distances confondues.
--
--     lune run tests/reglage [itérations] [courses par distance]
--
-- À chaque itération, on simule les mêmes courses (mêmes graines : le bruit
-- d'une itération à l'autre ne vient que des coefficients), on mesure
-- l'indice de victoire de chaque stratégie, puis on corrige :
--     c3 ← c3 − gain × ln(indice)
-- Les coefficients obtenus sont à reporter dans Course/Strategies.

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
local GAIN = 0.008
local TAILLE = Config.TAILLE_PELOTON
local piste = Piste.stade(Config.LIGNE_DROITE, Config.RAYON_VIRAGE, Config.LARGEUR_PISTE, Config.POSITION_ARRIVEE)

local function evaluer()
	local victoires, partants = {}, {}
	local parCourse = {}
	for _, id in Strategies.ordre do
		victoires[id], partants[id] = 0, 0
	end
	for _, course in Courses.liste do
		local v, p = {}, {}
		for _, id in Strategies.ordre do
			v[id], p[id] = 0, 0
		end
		for graine = 1, K do
			local defs = Peloton.completer({}, TAILLE, Aleatoire.nouveau(graine * 7919))
			local sim = Simulation.nouvelle(piste, course, defs, graine, 0)
			while not sim.termine do
				sim:pas(1 / 30)
			end
			for _, r in sim:resultats() do
				p[r.strategie] += 1
				if r.rang == 1 then
					v[r.strategie] += 1
				end
			end
		end
		local ligne = {}
		for _, id in Strategies.ordre do
			victoires[id] += v[id]
			partants[id] += p[id]
			table.insert(ligne, string.format("%s %.2f", id, v[id] / math.max(1, p[id] / TAILLE)))
		end
		table.insert(parCourse, `{course.distance} m : {table.concat(ligne, ", ")}`)
	end
	local indices = {}
	for _, id in Strategies.ordre do
		indices[id] = victoires[id] / math.max(1, partants[id] / TAILLE)
	end
	return indices, parCourse
end

for iteration = 1, ITERATIONS do
	local indices, parCourse = evaluer()
	local ligne = {}
	for _, id in Strategies.ordre do
		local s = Strategies.parId[id]
		table.insert(ligne, string.format("%s c3=%.4f indice=%.2f", id, s.vitesse[3], indices[id]))
	end
	print(`[{iteration}] {table.concat(ligne, " | ")}`)
	for _, l in parCourse do
		print(`      {l}`)
	end
	if iteration < ITERATIONS then
		for _, id in Strategies.ordre do
			local s = Strategies.parId[id]
			s.vitesse[3] -= GAIN * math.log(math.max(indices[id], 0.25))
		end
	end
end
