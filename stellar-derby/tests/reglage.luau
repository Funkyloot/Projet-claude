--!nocheck
-- Réglage — ajuste automatiquement le coefficient de finale de chaque
-- stratégie, course par course, pour qu'aucune ne soit avantagée.
--
--     lune run tests/reglage [itérations] [courses simulées par course] [id de course…]
--
-- Sans id de course, toutes les courses du calendrier sont réglées. Avec
-- des ids, seulement celles-là : on peut lancer plusieurs réglages en même
-- temps, un par groupe de courses.
--
-- À chaque itération, on simule les mêmes courses (mêmes graines : le bruit
-- d'une itération à l'autre ne vient que des coefficients) et on mesure, pour
-- chaque course, le rang moyen et l'indice de victoires de chaque stratégie.
-- L'écart à la neutralité est
--     e = (rang moyen − rang neutre) − 1,2 × ln(indice de victoires)
-- (le rang moyen est la mesure la moins bruitée ; un peu de victoires évite
-- qu'une stratégie « tout ou rien » gagne bien plus à rang égal). On pousse
-- le coefficient dans le sens de e, d'un pas qui s'adapte : il grandit tant
-- que le signe de e ne change pas, et il se divise par deux quand il change
-- (on a dépassé le bon réglage). Les corrections d'une course sont
-- recentrées : les stratégies bougent les unes par rapport aux autres, sans
-- que la course accélère ou ralentisse.
--
-- Les graines diffèrent de celles de tests/equilibrage : le rapport mesure
-- le réglage sur des courses qu'il n'a jamais vues. Les coefficients obtenus
-- (moyenne des dernières itérations, pour lisser les oscillations) sont à
-- reporter dans `Strategies.FINALES`.

local process = require("@lune/process")
local H = require("./harnais")
local P = H.partage()
local Pistes = H.require(P.Course.Pistes)
local Courses = H.require(P.Course.Courses)
local Peloton = H.require(P.Course.Peloton)
local Simulation = H.require(P.Course.Simulation)
local Strategies = H.require(P.Course.Strategies)
local Aleatoire = H.require(P.Course.Aleatoire)
local Config = H.require(P.Config)

local ITERATIONS = tonumber(process.args[1]) or 8
local K = tonumber(process.args[2]) or 90
local PAS_DEPART = 0.0015
local PAS_MIN, PAS_MAX = 0.0002, 0.006
local POIDS_VICTOIRES = 1.2
local MOYENNE_DES_DERNIERES = 4 -- itérations moyennées pour le résultat
local TAILLE = Config.TAILLE_PELOTON
local NEUTRE = (TAILLE + 1) / 2

-- Les courses à régler, avec leur place dans le calendrier (pour les graines)
local aRegler = {}
for indice, course in Courses.liste do
	local voulue = #process.args < 3
	for a = 3, #process.args do
		if process.args[a] == course.id then
			voulue = true
		end
	end
	if voulue then
		table.insert(aRegler, { course = course, indice = indice })
	end
end

-- Chaque course part de son coefficient actuel (ou de celui de sa catégorie)
local coefficients, pas, signes, historique = {}, {}, {}, {}
for _, r in aRegler do
	local id = r.course.id
	coefficients[id], pas[id], signes[id], historique[id] = {}, {}, {}, {}
	for _, s in Strategies.ordre do
		coefficients[id][s] = Strategies.pour(s, r.course).vitesse[3]
		pas[id][s] = PAS_DEPART
		signes[id][s] = 0
		historique[id][s] = {}
	end
end

-- Rang moyen et indice de victoires de chaque stratégie dans une course.
local function evaluer(r)
	local course = r.course
	Strategies.FINALES[course.id] = table.clone(coefficients[course.id])
	local rangs, partantes, victoires = {}, {}, {}
	for _, s in Strategies.ordre do
		rangs[s], partantes[s], victoires[s] = 0, 0, 0
	end
	for graine = 1, K do
		local defs = Peloton.completer({}, TAILLE, Aleatoire.nouveau(graine * 15485867 + r.indice * 7919 + 3))
		local sim = Simulation.nouvelle(
			Pistes.geometrie(course.piste),
			course,
			defs,
			graine * 32452843 + r.indice * 104723 + 5,
			0
		)
		while not sim.termine do
			sim:pas(1 / 30)
		end
		for _, res in sim:resultats() do
			rangs[res.strategie] += res.rang
			partantes[res.strategie] += 1
			if res.rang == 1 then
				victoires[res.strategie] += 1
			end
		end
	end
	local rangMoyen, indice = {}, {}
	for _, s in Strategies.ordre do
		rangMoyen[s] = rangs[s] / math.max(1, partantes[s])
		indice[s] = victoires[s] / math.max(1, partantes[s] / TAILLE)
	end
	return rangMoyen, indice
end

for iteration = 1, ITERATIONS do
	print(`[{iteration}]`)
	for _, r in aRegler do
		local id = r.course.id
		local rangs, indices = evaluer(r)
		local ligne = {}
		for _, s in Strategies.ordre do
			table.insert(historique[id][s], coefficients[id][s])
			table.insert(
				ligne,
				string.format("%s c=%.4f rang=%.2f vict=%.2f", s, coefficients[id][s], rangs[s], indices[s])
			)
		end
		print(string.format("  %-11s %s", id, table.concat(ligne, " | ")))
		if iteration < ITERATIONS then
			local corrections, moyenne = {}, 0
			for _, s in Strategies.ordre do
				local e = (rangs[s] - NEUTRE) - POIDS_VICTOIRES * math.log(math.max(indices[s], 0.25))
				local signe = if e > 0 then 1 elseif e < 0 then -1 else 0
				local p = pas[id][s]
				if signe ~= 0 and signes[id][s] ~= 0 then
					p = if signe == signes[id][s] then p * 1.4 else p * 0.5
				end
				p = math.clamp(p, PAS_MIN, PAS_MAX)
				pas[id][s], signes[id][s] = p, signe
				-- Mal classée (e > 0) : un peu plus vite en finale
				corrections[s] = signe * p
				moyenne += corrections[s] / #Strategies.ordre
			end
			for _, s in Strategies.ordre do
				coefficients[id][s] += corrections[s] - moyenne
			end
		end
	end
end

print("\nÀ reporter dans Strategies.FINALES :")
for _, r in aRegler do
	local id = r.course.id
	local parties = {}
	for _, s in Strategies.ordre do
		local h = historique[id][s]
		local debut = math.max(1, #h - MOYENNE_DES_DERNIERES + 1)
		local somme = 0
		for i = debut, #h do
			somme += h[i]
		end
		table.insert(parties, string.format("%s = %.4f", s, somme / (#h - debut + 1)))
	end
	print(string.format("\t%s = { %s },", id, table.concat(parties, ", ")))
end
