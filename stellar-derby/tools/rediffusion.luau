--!nocheck
-- Rediffusion — enregistre des courses simulées par le vrai moteur et les
-- exporte en JSON, pour l'aperçu de course dans le navigateur.
--
--     lune run tools/rediffusion [sortie.json]
--
-- Une course par distance du calendrier. Dans chaque peloton, une coureuse
-- « Toi » (profil Équilibrée, stratégie Ombre) est pilotée par l'IA : c'est
-- ce que donne une course bien jouée. Les phrases du commentateur sont
-- produites par le vrai module Commentaire.

local fs = require("@lune/fs")
local serde = require("@lune/serde")
local process = require("@lune/process")
local H = require("../tests/harnais")

local Partage = H.partage()
local C = Partage.Course
local Config = H.require(Partage.Config)
local Pistes = H.require(C.Pistes)
local Courses = H.require(C.Courses)
local Peloton = H.require(C.Peloton)
local Simulation = H.require(C.Simulation)
local Aleatoire = H.require(C.Aleatoire)
local Commentaire = H.require(C.Commentaire)
local Competences = H.require(C.Competences)
local Formules = H.require(C.Formules)

local sortie = process.args[1] or "build/rediffusion.json"
local PAS = 1 / Config.FREQUENCE_SIMULATION
local IMAGES_PAR_SECONDE = 6
local GRAINES = { alizes = 11, aube = 7, archipel = 3, marees = 21 }
-- L'aperçu dessine une seule piste : celle de l'Archipel et ses quatre courses
local piste = Pistes.geometrie("archipel")

local function arrondi(x: number, decimales: number): number
	local f = 10 ^ decimales
	return math.floor(x * f + 0.5) / f
end

-- Géométrie de la piste, échantillonnée pour le dessin
local trace = {}
for _, p in piste:echantillons(3) do
	table.insert(
		trace,
		{ arrondi(p.x, 2), arrondi(p.z, 2), arrondi(p.nx, 4), arrondi(p.nz, 4), arrondi(p.courbure, 5) }
	)
end

local function enregistrer(course)
	local graine = GRAINES[course.id] or 1
	local rng = Aleatoire.nouveau(graine * 97)
	local toi = {
		nom = "Toi",
		strategie = "ombre",
		stats = table.clone(Peloton.profil("equilibree").stats),
		competences = Peloton.competencesPour("ombre", rng),
		controle = "ia",
	}
	local defs = Peloton.completer({ toi }, Config.TAILLE_PELOTON, rng)
	local sim = Simulation.nouvelle(piste, course, defs, graine, 2)

	local noms = {}
	local peloton = {}
	for _, c in sim.coureuses do
		noms[c.id] = c.nom
		local competences = {}
		for _, ec in c.competences do
			table.insert(competences, ec.def.nom)
		end
		table.insert(peloton, {
			id = c.id,
			nom = c.nom,
			numero = c.numero,
			cadre = c.cadre,
			strategie = c.strategie.id,
			stats = c.stats,
			competences = competences,
		})
	end
	local contexte = {
		nom = function(id)
			return noms[id] or "?"
		end,
		course = course.nom,
	}

	local images = {}
	local commentaires = {}
	local evenements = {}
	local prochaineImage = sim.t
	local choix = 0
	while not sim.termine do
		local lot = sim:pas(PAS)
		for _, e in lot do
			-- Le nom de la tête pour les phrases de mi-course
			for _, c in sim.ordre do
				if not c.arrivee then
					contexte.tete = c.nom
					break
				end
			end
			choix += 7
			local ligne = Commentaire.ligne(e, contexte, choix)
			local petitFait = e.genre == "sprint" or e.genre == "competence" or e.genre == "reaction"
			local pertinent = not petitFait or e.id == 1 or (sim.coureuses[e.id] and sim.coureuses[e.id].rang <= 4)
			if ligne and pertinent then
				table.insert(commentaires, { t = arrondi(sim.t, 2), texte = ligne.texte, priorite = ligne.priorite })
			end
			if
				e.id == 1
				and (e.genre == "competence" or e.genre == "sprint" or e.genre == "epuisee" or e.genre == "duel")
			then
				local def = e.competence and Competences.parId[e.competence]
				table.insert(evenements, { t = arrondi(sim.t, 2), genre = e.genre, nom = def and def.nom or nil })
			end
		end
		if sim.t >= prochaineImage then
			prochaineImage += 1 / IMAGES_PAR_SECONDE
			local etats = {}
			for _, c in sim.coureuses do
				local drapeaux = (c.sprint and 1 or 0)
					+ (c.epuisee and 2 or 0)
					+ (c.aspiration and 4 or 0)
					+ (c.bloquee and 8 or 0)
					+ (c.duel and 16 or 0)
					+ (c.arrivee and 32 or 0)
				table.insert(etats, {
					arrondi(c.d, 2),
					arrondi(c.couloir, 2),
					arrondi(c.v, 2),
					arrondi(c.endurance / c.enduranceMax, 3),
					c.rang,
					drapeaux,
					c.aura,
					c.rythme,
				})
			end
			table.insert(images, { t = arrondi(sim.t, 3), r = sim.ralenti and 1 or 0, c = etats })
		end
	end

	local resultats = {}
	for _, r in sim:resultats() do
		table.insert(resultats, { id = r.id, rang = r.rang, temps = arrondi(r.temps, 2), ecart = r.ecart })
	end
	return {
		id = course.id,
		nom = course.nom,
		distance = course.distance,
		categorie = course.categorie,
		etat = course.etat,
		meteo = course.meteo,
		depart = -course.distance,
		peloton = peloton,
		images = images,
		commentaires = commentaires,
		evenements = evenements,
		resultats = resultats,
		photoFinish = sim.photoFinish,
	}
end

local courses = {}
for _, course in Courses.dePiste("archipel") do
	table.insert(courses, enregistrer(course))
	print(`{course.nom} : {#courses[#courses].images} images, {#courses[#courses].commentaires} commentaires`)
end

local donnees = {
	piste = {
		longueur = piste.longueur,
		largeur = piste.largeur,
		ligneDroiteFinale = piste.ligneDroiteFinale,
		dernierVirage = piste.dernierVirage,
		trace = trace,
		pasTrace = piste.longueur / #trace,
	},
	phases = Formules.NOMS_PHASES,
	courses = courses,
}
fs.writeFile(sortie, serde.encode("json", donnees))
print(`→ {sortie}`)
