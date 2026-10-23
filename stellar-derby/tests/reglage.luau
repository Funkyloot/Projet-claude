--!nocheck
-- Réglage — ajuste automatiquement le coefficient de finale de chaque
-- stratégie, catégorie de course par catégorie (Sprint, Mile, Moyenne,
-- Longue), pour qu'aucune ne soit avantagée.
--
--     lune run tests/reglage [itérations] [courses par course du calendrier]
--
-- À chaque itération, on simule les mêmes courses (mêmes graines : le bruit
-- d'une itération à l'autre ne vient que des coefficients) et on mesure, dans
-- chaque catégorie, le rang moyen et l'indice de victoires de chaque
-- stratégie. L'écart à la neutralité est
--     e = (rang moyen − rang neutre) − 1,2 × ln(indice de victoires)
-- (le rang moyen est la mesure la moins bruitée ; un peu de victoires évite
-- qu'une stratégie « tout ou rien » gagne bien plus à rang égal). On pousse
-- le coefficient dans le sens de e, d'un pas qui s'adapte : il grandit tant
-- que le signe de e ne change pas, et il se divise par deux quand il change
-- (on a dépassé le bon réglage). Les corrections d'une catégorie sont
-- recentrées : les stratégies bougent les unes par rapport aux autres, sans
-- que la course accélère ou ralentisse. Le tableau `finale` obtenu est à
-- reporter dans Course/Strategies.

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

local ITERATIONS = tonumber(process.args[1]) or 6
local K = tonumber(process.args[2]) or 30
local PAS_DEPART = 0.0008
local PAS_MIN, PAS_MAX = 0.0002, 0.006
local POIDS_VICTOIRES = 1.2
local TAILLE = Config.TAILLE_PELOTON
local NEUTRE = (TAILLE + 1) / 2

-- Chaque stratégie part de son tableau actuel (ou de son coefficient unique)
local pas, signes = {}, {}
for _, id in Strategies.ordre do
	local s = Strategies.parId[id]
	s.finale = s.finale or {}
	pas[id], signes[id] = {}, {}
	for _, categorie in Courses.CATEGORIES do
		s.finale[categorie] = s.finale[categorie] or s.vitesse[3]
		pas[id][categorie] = PAS_DEPART
		signes[id][categorie] = 0
	end
end

-- Rang moyen et indice de victoires de chaque stratégie dans une catégorie.
local function evaluer(categorie: string)
	local r, p, v = {}, {}, {}
	for _, id in Strategies.ordre do
		r[id], p[id], v[id] = 0, 0, 0
	end
	for _, course in Courses.deCategorie(categorie) do
		for graine = 1, K do
			local defs = Peloton.completer({}, TAILLE, Aleatoire.nouveau(graine * 7919 + course.distance))
			local sim = Simulation.nouvelle(Pistes.geometrie(course.piste), course, defs, graine, 0)
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
	end
	local rangs, indices = {}, {}
	for _, id in Strategies.ordre do
		rangs[id] = r[id] / math.max(1, p[id])
		indices[id] = v[id] / math.max(1, p[id] / TAILLE)
	end
	return rangs, indices
end

for iteration = 1, ITERATIONS do
	print(`[{iteration}]`)
	for _, categorie in Courses.CATEGORIES do
		local rangs, indices = evaluer(categorie)
		local ligne = {}
		for _, id in Strategies.ordre do
			table.insert(
				ligne,
				string.format(
					"%s c=%.4f rang=%.2f vict=%.2f",
					id,
					Strategies.parId[id].finale[categorie],
					rangs[id],
					indices[id]
				)
			)
		end
		print(string.format("  %-8s %s", categorie, table.concat(ligne, " | ")))
		if iteration < ITERATIONS then
			local corrections, moyenne = {}, 0
			for _, id in Strategies.ordre do
				local e = (rangs[id] - NEUTRE) - POIDS_VICTOIRES * math.log(math.max(indices[id], 0.25))
				local signe = if e > 0 then 1 elseif e < 0 then -1 else 0
				local p = pas[id][categorie]
				if signe ~= 0 and signes[id][categorie] ~= 0 then
					p = if signe == signes[id][categorie] then p * 1.4 else p * 0.5
				end
				p = math.clamp(p, PAS_MIN, PAS_MAX)
				pas[id][categorie], signes[id][categorie] = p, signe
				-- Mal classée (e > 0) : un peu plus vite en finale
				corrections[id] = signe * p
				moyenne += corrections[id] / #Strategies.ordre
			end
			for _, id in Strategies.ordre do
				local f = Strategies.parId[id].finale
				f[categorie] += corrections[id] - moyenne
			end
		end
	end
end

print("\nÀ reporter dans Course/Strategies :")
for _, id in Strategies.ordre do
	local f = Strategies.parId[id].finale
	print(
		string.format(
			"  %s : finale = { Sprint = %.4f, Mile = %.4f, Moyenne = %.4f, Longue = %.4f },",
			id,
			f.Sprint,
			f.Mile,
			f.Moyenne,
			f.Longue
		)
	)
end
