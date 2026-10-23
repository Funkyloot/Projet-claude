--!nocheck
-- Tests de la carrière et des événements. Depuis stellar-derby/ :  lune run tests/carriere
--
-- La dernière partie fait courir des carrières entières (la coureuse est
-- pilotée par l'IA) pour vérifier la difficulté : une carrière bien menée
-- atteint souvent la finale et peut la gagner, une carrière bâclée moins.

local H = require("./harnais")

local Partage = H.partage()
local Course = Partage.Course
local Pistes = H.require(Course.Pistes)
local Courses = H.require(Course.Courses)
local Peloton = H.require(Course.Peloton)
local Simulation = H.require(Course.Simulation)
local Strategies = H.require(Course.Strategies)
local Aleatoire = H.require(Course.Aleatoire)
local Competences = H.require(Course.Competences)
local Carriere = H.require(Partage.Jeu.Carriere)
local Evenements = H.require(Partage.Jeu.Evenements)
local Schema = H.require(Partage.Jeu.Schema)
local Titres = H.require(Partage.Jeu.Titres)

local function parametres(extra)
	local p = { nom = Carriere.NOMS[1], robe = "bai", strategie = "vague", profil = "equilibree" }
	for k, v in extra or {} do
		p[k] = v
	end
	return p
end

local function neuve(graine, extra)
	local c, erreur = Carriere.nouvelle(parametres(extra), Schema.nouveau(), graine or 1, 1000)
	assert(c, erreur)
	return c
end

local function legende(id, valeur)
	return {
		id = id,
		nom = "L",
		robe = "bai",
		stats = { vitesse = valeur, souffle = valeur, puissance = valeur, coeur = valeur, instinct = valeur },
		strategie = "vague",
		note = valeur * 5,
		titre = "T",
		victoires = 1,
		date = 1,
	}
end

print("Événements")

H.test("au moins 18 cartes, chacune avec 2 ou 3 choix aux effets valides", function()
	assert(#Evenements.liste >= 18, `{#Evenements.liste} cartes`)
	local vus = {}
	for _, carte in Evenements.liste do
		assert(not vus[carte.id], `carte en double : {carte.id}`)
		vus[carte.id] = true
		assert(#carte.titre > 0 and #carte.texte > 0)
		assert(carte.quand == "tous" or carte.quand == "sortie" or carte.quand == "entrainement", carte.id)
		assert(#carte.choix >= 2 and #carte.choix <= 3, carte.id)
		for _, choix in carte.choix do
			assert(#choix.texte > 0)
			local e = choix.effets
			assert(e.stats or e.tous or e.energie or e.humeur or e.competence, `choix sans effet : {carte.id}`)
			for stat in e.stats or {} do
				assert(Evenements.NOMS_STATS[stat], `stat inconnue {stat} dans {carte.id}`)
			end
			if e.competence then
				assert(table.find(Competences.generales, e.competence), `compétence inconnue dans {carte.id}`)
			end
			assert(#Evenements.resume(e) > 0)
		end
	end
	for _, action in { "sortie", "entrainement", "repos" } do
		assert(#Evenements.possibles(action) >= 5, action)
	end
end)

H.test("les textes citent la coureuse et sa rivale", function()
	local carte = Evenements.parId("defi")
	local texte = Evenements.texte(carte, "Aube Claire", "Brise Lunaire")
	assert(string.find(texte, "Brise Lunaire", 1, true) and not string.find(texte, "{rivale}", 1, true))
	assert(Evenements.resume({ stats = { vitesse = 15 }, energie = -10 }) == "Vitesse +15 · Énergie −10")
end)

print("Création")

H.test("une carrière neuve : 2 000 points, pleine d'énergie, humeur normale, une rivale", function()
	for _, p in Peloton.profils do
		local c = neuve(5, { profil = p.id })
		assert(Carriere.total(c.stats) == Carriere.TOTAL_DEPART, `{p.id} : {Carriere.total(c.stats)}`)
		assert(c.energie == 100 and c.humeur == 3 and c.tour == 1 and c.joker)
		assert(#c.rivale.nom > 0 and Strategies.parId[c.rivale.strategie])
	end
	local c = neuve(5, { profil = "sprinteuse" })
	assert(c.stats.vitesse > c.stats.souffle, "le profil ne compte pas")
end)

H.test("tout ce qui vient du client est vérifié", function()
	local d = Schema.nouveau()
	local cas = {
		{ nom = "Pas dans la liste" },
		{ nom = 3 },
		{ robe = "nuit" }, -- pas possédée
		{ strategie = "teleportation" },
		{ profil = "triche" },
		{ inspirations = { "inconnue" } },
		{ inspirations = "texte" },
	}
	for _, extra in cas do
		local c, erreur = Carriere.nouvelle(parametres(extra), d, 1, 0)
		assert(c == nil and type(erreur) == "string", "paramètre absurde accepté")
	end
	assert(Carriere.nouvelle(nil, d, 1, 0) == nil)
	assert(Carriere.nouvelle(42, d, 1, 0) == nil)
end)

H.test("l'héritage : 5 % des stats des inspirations, au plus 250 points", function()
	local d = Schema.nouveau()
	d.legendes = { legende("a", 400), legende("b", 1200), legende("c", 1200) }
	local c = Carriere.nouvelle(parametres({ inspirations = { "a" } }), d, 1, 0)
	assert(Carriere.total(c.stats) == Carriere.TOTAL_DEPART + 100, `{Carriere.total(c.stats)}`)
	local fort = Carriere.nouvelle(parametres({ inspirations = { "b", "c" } }), d, 1, 0)
	local bonus = Carriere.total(fort.stats) - Carriere.TOTAL_DEPART
	assert(bonus <= Carriere.HERITAGE_MAX and bonus >= Carriere.HERITAGE_MAX - 5, `bonus {bonus}`)
	assert(Carriere.nouvelle(parametres({ inspirations = { "a", "b", "c" } }), d, 1, 0) == nil, "3 inspirations")
	assert(Carriere.nouvelle(parametres({ inspirations = { "a", "a" } }), d, 1, 0) == nil, "doublon")
end)

print("Tours")

H.test("s'entraîner : la stat et sa voisine montent, l'énergie baisse, le tour avance", function()
	local c = neuve(11)
	local avant = table.clone(c.stats)
	local bilan = Carriere.entrainer(c, "vitesse", 0.8)
	assert(bilan and not bilan.blessure)
	assert(c.stats.vitesse == avant.vitesse + bilan.gain and bilan.gain >= 25)
	assert(c.stats.puissance == avant.puissance + bilan.gainLie)
	assert(c.energie == 100 - Carriere.COUT_ENERGIE.vitesse and c.tour == 2)
	assert(Carriere.entrainer(c, "vol", 1) == nil or c.evenement, "stat inconnue acceptée")
end)

H.test("se reposer rend de l'énergie, sortir remonte l'humeur", function()
	local c = neuve(12)
	c.energie = 20
	Carriere.reposer(c)
	assert(c.energie == 20 + Carriere.REPOS)
	c.evenement = nil
	c.humeur = 2
	Carriere.sortir(c)
	assert(c.humeur == 3)
end)

H.test("épuisée, on finit par se blesser et perdre le tour", function()
	local blessures = 0
	for g = 1, 60 do
		local c = neuve(g)
		c.energie = 0
		local avant = Carriere.total(c.stats)
		local bilan = Carriere.entrainer(c, "coeur", 1)
		if bilan.blessure then
			blessures += 1
			assert(Carriere.total(c.stats) == avant, "une blessure fait progresser")
			assert(c.tour == 2, "le tour n'est pas perdu")
		end
	end
	assert(blessures >= 15 and blessures <= 45, `{blessures} blessures sur 60`)
	-- En pleine forme, jamais
	for g = 1, 30 do
		local c = neuve(g)
		assert(not Carriere.entrainer(c, "coeur", 1).blessure)
	end
end)

H.test("les tirages dépendent de la graine et du tour, pas du hasard", function()
	local a, b = neuve(77), neuve(77)
	for _ = 1, 3 do
		if not a.evenement then
			Carriere.sortir(a)
			Carriere.sortir(b)
		else
			Carriere.choisir(a, 1)
			Carriere.choisir(b, 1)
		end
	end
	assert(a.evenement == b.evenement and a.humeur == b.humeur and a.tour == b.tour)
end)

H.test("un événement en attente bloque le tour jusqu'au choix", function()
	local c = neuve(3)
	c.evenement = "piquenique"
	local bilan, erreur = Carriere.entrainer(c, "vitesse", 1)
	assert(bilan == nil and erreur)
	assert(Carriere.choisir(c, 9) == nil, "choix hors liste")
	assert(Carriere.choisir(c, 1.5) == nil, "choix non entier")
	local avant = c.energie
	assert(Carriere.choisir(c, 1))
	assert(c.evenement == nil and c.energie >= avant)
	assert(Carriere.choisir(c, 1) == nil, "choix sans événement")
end)

H.test("une compétence s'apprend une fois, trois au plus", function()
	local c = neuve(4)
	local bilan = { messages = {} }
	Carriere.appliquerEffets(c, { competence = "sillage" }, bilan)
	Carriere.appliquerEffets(c, { competence = "sillage" }, bilan)
	assert(#c.competences == 1)
	for _, id in { "teteFroide", "regardAcier", "departCanon" } do
		Carriere.appliquerEffets(c, { competence = id }, bilan)
	end
	assert(#c.competences == Carriere.MAX_COMPETENCES)
	local def = Carriere.definition(c, 42)
	assert(def.competences[1] == Strategies.parId.vague.signature and #def.competences == 4)
	assert(def.controle == "joueur" and def.userId == 42)
end)

print("Courses-objectifs")

H.test("le calendrier : 7 courses réelles, trois hippodromes, toutes les distances", function()
	local pistes, categories = {}, {}
	for i, o in Carriere.OBJECTIFS do
		local course = Courses.parId(o.course)
		assert(course, o.course)
		pistes[course.piste] = true
		categories[course.categorie] = true
		assert(o.place >= 1 and o.totalBots > 1000)
		if i > 1 then
			assert(o.tour > Carriere.OBJECTIFS[i - 1].tour)
		end
	end
	assert(Carriere.OBJECTIFS[#Carriere.OBJECTIFS].tour == Carriere.TOUR_FINALE)
	assert(Carriere.OBJECTIFS[#Carriere.OBJECTIFS].place == 1, "il faut gagner la finale")
	for _, p in Pistes.liste do
		assert(pistes[p.id], `aucun objectif à {p.id}`)
	end
	for _, cat in Courses.CATEGORIES do
		assert(categories[cat], `aucun objectif en {cat}`)
	end
end)

H.test("le jour de la course, on ne peut que courir", function()
	local c = neuve(8)
	c.tour = 4
	assert(Carriere.attente(c) == "course")
	assert(Carriere.entrainer(c, "vitesse", 1) == nil)
	assert(Carriere.reposer(c) == nil and Carriere.sortir(c) == nil)
end)

H.test("objectif atteint : bonus et tour suivant ; raté : repêchage, puis fin", function()
	local c = neuve(9)
	c.tour = 4
	local avant = Carriere.total(c.stats)
	assert(Carriere.appliquerCourse(c, 1))
	assert(Carriere.total(c.stats) == avant + 5 * Carriere.BONUS_VICTOIRE and c.victoires == 1 and c.tour == 5)
	c.tour = 8
	assert(Carriere.appliquerCourse(c, 9))
	assert(not c.finie and not c.joker and c.tour == 9, "pas de repêchage")
	c.tour = 12
	assert(Carriere.appliquerCourse(c, 7))
	assert(c.finie and c.fin == "objectif", "le second échec ne termine pas la carrière")
	assert(Carriere.appliquerCourse(c, 1) == nil, "course après la fin")
	assert(Carriere.appliquerCourse(neuve(1), 1) == nil, "course hors calendrier")
end)

H.test("la finale termine la carrière ; battre la rivale rapporte", function()
	local c = neuve(10)
	c.tour = 25
	Carriere.appliquerCourse(c, 1, 4)
	assert(c.finie and c.fin == "terminee" and c.rivaleBattue and Carriere.finaleGagnee(c))
	local d = neuve(10)
	d.tour = 25
	Carriere.appliquerCourse(d, 2, 1)
	assert(d.finie and not d.rivaleBattue and not Carriere.finaleGagnee(d))
	assert(Carriere.note(c) > Carriere.note(d) + 700)
end)

H.test("la rivale est un peu au-dessus du peloton, et la même à chaque course", function()
	local c = neuve(13)
	local o = Carriere.OBJECTIFS[3]
	local r1, r2 = Carriere.definitionRivale(c, o), Carriere.definitionRivale(c, o)
	assert(r1.nom == c.rivale.nom and r1.controle == "ia")
	local t = 0
	for _, v in r1.stats do
		t += v
	end
	assert(t == o.totalBots + Carriere.BONUS_RIVALE)
	assert(r1.stats.vitesse == r2.stats.vitesse)
end)

print("Fin de carrière et sauvegarde")

H.test("Légende : note, titre, récompense raisonnable", function()
	local c = neuve(20)
	c.tour = 25
	Carriere.appliquerCourse(c, 1, 3)
	local l = Carriere.legende(c, 5000)
	assert(l.titre == "Reine de l'Archipel", l.titre)
	assert(l.note == Carriere.note(c) and l.victoires == 1)
	local r = Carriere.recompense(l.note)
	assert(r.etoiles >= 40 and r.etoiles <= 400 and r.xp > 0)
	assert(Carriere.recompense(0).etoiles == 40 and Carriere.recompense(10 ^ 9).etoiles == 400)
	-- La Légende passe le nettoyage de la sauvegarde
	local d = Schema.nouveau()
	table.insert(d.legendes, l)
	local copie = Schema.migrer(Schema.copier(d))
	assert(#copie.legendes == 1 and copie.legendes[1].titre == l.titre)
	-- Et donne le titre « Légende vivante » si elle est assez bonne
	d.legendes[1].note = 6000
	local ids = {}
	for _, t in Titres.nouveaux(d) do
		ids[t.id] = true
	end
	assert(ids.legende)
end)

H.test("titres variés selon les résultats", function()
	local c = neuve(21)
	assert(Carriere.titre(c) == "Cœur vaillant")
	c.resultats = {
		{ tour = 4, course = "alizes", rang = 1, place = 5, reussi = true },
		{ tour = 8, course = "coquillages", rang = 2, place = 5, reussi = true },
	}
	assert(Carriere.titre(c) == "Étoile du sprint", Carriere.titre(c))
	table.insert(c.resultats, { tour = 12, course = "vent", rang = 1, place = 3, reussi = true })
	table.insert(c.resultats, { tour = 20, course = "cimes", rang = 1, place = 3, reussi = true })
	assert(Carriere.titre(c) == "Reine des Falaises", Carriere.titre(c))
end)

H.test("la liste des Légendes est bornée : la moins bonne cède sa place", function()
	local liste = {}
	for i = 1, 3 do
		assert(Carriere.ajouterLegende(liste, { id = `l{i}`, note = i * 100 }, 3))
	end
	assert(not Carriere.ajouterLegende(liste, { id = "faible", note = 50 }, 3))
	assert(Carriere.ajouterLegende(liste, { id = "forte", note = 1000 }, 3))
	assert(#liste == 3)
	for _, l in liste do
		assert(l.id ~= "l1", "la moins bonne est restée")
	end
end)

H.test("une carrière survit à l'aller-retour par la sauvegarde", function()
	local c = neuve(30, { profil = "endurante" })
	Carriere.entrainer(c, "souffle", 0.7)
	if c.evenement then
		Carriere.choisir(c, 2)
	end
	local d = Schema.nouveau()
	d.carriere = c
	local copie = Schema.migrer(Schema.copier(d))
	local relue = Carriere.nettoyer(copie.carriere)
	assert(relue, "carrière perdue")
	assert(relue.nom == c.nom and relue.tour == c.tour and relue.stats.souffle == c.stats.souffle)
	assert(relue.rivale.nom == c.rivale.nom and relue.joker == c.joker)
end)

H.test("une carrière abîmée est réparée ou rejetée, sans planter", function()
	for _, brut in { nil, 3, "x", {}, { nom = "A" }, { nom = "A", strategie = "vague" } } do
		assert(Carriere.nettoyer(brut) == nil)
	end
	local c = Carriere.nettoyer({
		nom = "A",
		strategie = "vague",
		stats = { vitesse = 99999, souffle = -5, puissance = "beaucoup" },
		energie = 500,
		humeur = 12,
		tour = 300,
		competences = { "sillage", "inventee", 5, "sillage2" },
		evenement = "inexistant",
		resultats = { { course = "alizes", rang = "1" }, 7 },
	})
	assert(c.stats.vitesse == Carriere.STAT_MAX and c.stats.souffle == Carriere.STAT_MIN)
	assert(c.energie == 100 and c.humeur == 5 and c.tour == Carriere.TOUR_FINALE)
	assert(#c.competences == 1 and c.evenement == nil and #c.resultats == 1)
end)

print("Difficulté (carrières entières simulées)")

local ROTATION = { "vitesse", "souffle", "puissance", "coeur", "vitesse", "souffle", "instinct", "puissance" }

-- Fait jouer une carrière entière. `sage` : se reposer quand l'énergie est
-- basse et sortir quand l'humeur l'est (sinon on s'entraîne à chaque tour).
local function jouerCarriere(graine: number, qualite: number, sage: boolean)
	local c = Carriere.nouvelle(
		parametres({
			strategie = Strategies.ordre[graine % 4 + 1],
			profil = Peloton.profils[(graine // 4) % 4 + 1].id,
		}),
		Schema.nouveau(),
		graine * 7717,
		0
	)
	local objectifs, reussis, n = 0, 0, 0
	while not c.finie do
		local attente = Carriere.attente(c)
		if attente == "evenement" then
			Carriere.choisir(c, 1)
		elseif attente == "course" then
			local o = Carriere.objectifDuTour(c.tour)
			local course = Courses.parId(o.course)
			local rng = Aleatoire.nouveau(graine * 131 + c.tour)
			local moi = Carriere.definition(c)
			moi.controle = "ia"
			local defs = Peloton.completer({ moi, Carriere.definitionRivale(c, o) }, 12, rng, o.totalBots)
			local sim = Simulation.nouvelle(Pistes.geometrie(course.piste), course, defs, graine * 977 + c.tour, 0)
			while not sim.termine do
				sim:pas(1 / 30)
			end
			local rang, rangRivale = 12, 12
			for _, r in sim:resultats() do
				if r.id == 1 then
					rang = r.rang
				elseif r.id == 2 then
					rangRivale = r.rang
				end
			end
			if o.tour < Carriere.TOUR_FINALE then
				objectifs += 1
				if rang <= o.place then
					reussis += 1
				end
			end
			Carriere.appliquerCourse(c, rang, rangRivale)
		elseif sage and c.energie < 40 then
			Carriere.reposer(c)
		elseif sage and c.humeur <= 2 then
			Carriere.sortir(c)
		else
			n += 1
			Carriere.entrainer(c, ROTATION[(n - 1) % #ROTATION + 1], qualite)
		end
	end
	return c, objectifs, reussis
end

local function bilan(graines, qualite, sage)
	local finales, gagnees, objectifs, reussis = 0, 0, 0, 0
	for _, g in graines do
		local c, o, r = jouerCarriere(g, qualite, sage)
		objectifs += o
		reussis += r
		if c.fin == "terminee" then
			finales += 1
			if Carriere.finaleGagnee(c) then
				gagnees += 1
			end
		end
	end
	return finales, gagnees, reussis / math.max(1, objectifs)
end

local GRAINES = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 }
local bonnes = { bilan(GRAINES, 0.8, true) }
local baclees = { bilan(GRAINES, 0.35, false) }
print(
	string.format(
		"  bien menées : %d/12 finales, %d gagnées, objectifs %.0f %%  ·  bâclées : %d/12 finales, %d gagnées, objectifs %.0f %%",
		bonnes[1],
		bonnes[2],
		100 * bonnes[3],
		baclees[1],
		baclees[2],
		100 * baclees[3]
	)
)

H.test("une carrière bien menée atteint souvent ses objectifs et peut gagner la finale", function()
	assert(bonnes[3] >= 0.75, `objectifs atteints : {bonnes[3]}`)
	assert(bonnes[1] >= 6, `finales atteintes : {bonnes[1]}/12`)
	assert(bonnes[2] >= 2, `finales gagnées : {bonnes[2]}`)
	assert(bonnes[2] < bonnes[1], "la finale est gagnée à tous les coups")
end)

H.test("une carrière bâclée fait nettement moins bien", function()
	assert(baclees[2] < bonnes[2], "bâclée aussi bien que bien menée")
	assert(baclees[3] <= bonnes[3])
end)

if not H.bilan() then
	error("des tests ont échoué")
end
