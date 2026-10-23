--!nocheck
-- Tests du moteur de course. Depuis stellar-derby/ :  lune run tests/tests

local H = require("./harnais")

local Partage = H.partage()
local Course = Partage.Course
local Piste = H.require(Course.Piste)
local Formules = H.require(Course.Formules)
local Courses = H.require(Course.Courses)
local Pistes = H.require(Course.Pistes)
local Peloton = H.require(Course.Peloton)
local Simulation = H.require(Course.Simulation)
local Aleatoire = H.require(Course.Aleatoire)
local Paquet = H.require(Course.Paquet)
local Commentaire = H.require(Course.Commentaire)
local Config = H.require(Partage.Config)

local F = Formules
local PAS = 1 / Config.FREQUENCE_SIMULATION

local function pisteStandard()
	return Piste.stade(Config.LIGNE_DROITE, Config.RAYON_VIRAGE, Config.LARGEUR_PISTE, Config.POSITION_ARRIVEE)
end

local function pelotonDeBots(graine: number, taille: number?)
	return Peloton.completer({}, taille or Config.TAILLE_PELOTON, Aleatoire.nouveau(graine))
end

local function courir(sim, surPas: ((any) -> ())?)
	local garde = 0
	while not sim.termine do
		sim:pas(PAS)
		if surPas then
			surPas(sim)
		end
		garde += 1
		assert(garde < 30 * 600, "la course ne se termine pas")
	end
end

print("Piste")

H.test("le stade se referme et mesure 2L + 2πR", function()
	local piste = pisteStandard()
	H.proche(piste.longueur, 2 * Config.LIGNE_DROITE + 2 * math.pi * Config.RAYON_VIRAGE, 1e-9)
end)

H.test("la ligne d'arrivée est sur la ligne droite des tribunes, tournée vers +x", function()
	local piste = pisteStandard()
	local p = piste:pose(0)
	H.proche(p.x, Config.LIGNE_DROITE * Config.POSITION_ARRIVEE, 1e-9, "x")
	H.proche(p.z, 0, 1e-9, "z")
	H.proche(p.tx, 1, 1e-9, "tx")
	-- La boucle est du côté +z : l'extérieur de cette ligne droite est vers -z
	H.proche(p.nz, -1, 1e-9, "nz")
	H.proche(piste.ligneDroiteFinale, Config.LIGNE_DROITE * Config.POSITION_ARRIVEE, 1e-9)
	H.proche(piste.dernierVirage, math.pi * Config.RAYON_VIRAGE, 1e-9)
end)

H.test("la piste est continue et paramétrée à vitesse unité", function()
	local piste = pisteStandard()
	for i = 0, 400 do
		local s = i * piste.longueur / 400 - 37.3
		local a, b = piste:pose(s), piste:pose(s + 0.01)
		local l = math.sqrt((b.x - a.x) ^ 2 + (b.z - a.z) ^ 2)
		H.proche(l, 0.01, 1e-6, `pas à s = {s}`)
	end
end)

H.test("la courbure vaut 1/R dans les virages et 0 ailleurs", function()
	local piste = pisteStandard()
	H.proche(piste:courbure(0), 0, 1e-12)
	local milieuDernierVirage = -piste.ligneDroiteFinale - piste.dernierVirage / 2
	H.proche(piste:courbure(milieuDernierVirage), 1 / Config.RAYON_VIRAGE, 1e-12)
	H.proche(piste:courbure(-piste.ligneDroiteFinale + 1), 0, 1e-12)
end)

H.test("les stalles de chaque course du calendrier sont sur une ligne droite, loin des virages", function()
	for _, course in Courses.liste do
		local piste = Pistes.geometrie(course.piste)
		local u = piste:versU(-course.distance)
		local t = piste:troncon(-course.distance)
		assert(t.genre == "droite", `{course.nom} part dans un virage`)
		local avantVirage = t.debut + t.longueur - u
		assert(avantVirage >= 70, `{course.nom} part à {avantVirage} m d'un virage`)
	end
end)

H.test("chaque hippodrome a une course par catégorie, et chaque course un hippodrome", function()
	for _, def in Pistes.liste do
		local vues = {}
		for _, course in Courses.dePiste(def.id) do
			assert(not vues[course.categorie], `{def.nom} : deux courses {course.categorie}`)
			vues[course.categorie] = true
		end
		for _, categorie in Courses.CATEGORIES do
			assert(vues[categorie], `{def.nom} : pas de course {categorie}`)
		end
	end
	local ids = {}
	for _, course in Courses.liste do
		assert(Pistes.existe(course.piste), `{course.nom} : hippodrome inconnu`)
		assert(not ids[course.id], `identifiant en double : {course.id}`)
		ids[course.id] = true
	end
end)

H.test("la piste par défaut est celle de l'Archipel", function()
	local a, b = Pistes.geometrie("archipel"), pisteStandard()
	H.proche(a.longueur, b.longueur, 1e-9)
	H.proche(a.origine, b.origine, 1e-9)
end)

print("Formules")

H.test("intitulés d'écart à la japonaise", function()
	local L = F.LONGUEUR_CORPS
	local cas = {
		{ 0.001, "Ex æquo" },
		{ 0.1, "Nez" },
		{ 0.5, "Tête" },
		{ 1.0, "Encolure" },
		{ 0.5 * L, "½ longueur" },
		{ 0.75 * L, "¾ longueur" },
		{ L, "1 longueur" },
		{ 1.25 * L, "1 ¼ longueur" },
		{ 2 * L, "2 longueurs" },
		{ 3.5 * L, "3 ½ longueurs" },
		{ 7 * L, "7 longueurs" },
		{ 30 * L, "Large" },
	}
	for _, c in cas do
		local obtenu = F.intituleEcart(c[1])
		assert(obtenu == c[2], `{c[1]} m → « {obtenu} » au lieu de « {c[2]} »`)
	end
end)

H.test("cadres de couleur selon la règle japonaise", function()
	local attendu12 = { 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8 }
	for numero, cadre in attendu12 do
		assert(F.cadre(numero, 12) == cadre, `12 partantes, n°{numero}`)
	end
	for numero = 1, 8 do
		assert(F.cadre(numero, 8) == numero)
	end
	assert(F.cadre(16, 16) == 8 and F.cadre(1, 16) == 1 and F.cadre(2, 16) == 1)
end)

H.test("sprint tenable : borné par la distance restante et par la réserve", function()
	local v0 = 20
	H.proche(F.sprintTenable(1e9, 500, 20.5, 22.5, v0, 600), 500, 1e-9, "réserve infinie")
	H.proche(F.sprintTenable(0, 500, 20.5, 22.5, v0, 600), 0, 1e-9, "réserve vide")
	local x = F.sprintTenable(800, 500, 20.5, 22.5, v0, 600)
	assert(x > 0 and x < 500, `sprint partiel attendu, obtenu {x}`)
end)

H.test("aller plus vite coûte plus que proportionnellement", function()
	local lent = F.consommation(19.5, 20, false, 600) / 19.5
	local vite = F.consommation(20.5, 20, false, 600) / 20.5
	assert(vite > lent * 1.05, "la consommation par mètre doit croître avec la vitesse")
end)

print("Simulation")

H.test("une même graine rejoue exactement la même course", function()
	local function temps(graine)
		local course = Courses.parId("archipel")
		local sim = Simulation.nouvelle(pisteStandard(), course, pelotonDeBots(graine), graine, 3)
		courir(sim)
		local liste = {}
		for _, r in sim:resultats() do
			table.insert(liste, `{r.id}:{r.temps}`)
		end
		return table.concat(liste, ",")
	end
	assert(temps(42) == temps(42), "deux courses identiques diffèrent")
	assert(temps(42) ~= temps(43), "deux graines différentes donnent la même course")
end)

H.test("toutes les coureuses finissent, en des temps plausibles", function()
	for _, course in Courses.liste do
		local sim = Simulation.nouvelle(Pistes.geometrie(course.piste), course, pelotonDeBots(7), 7, 3)
		courir(sim)
		local res = sim:resultats()
		assert(#res == Config.TAILLE_PELOTON)
		local v0 = F.vitesseBase(course.distance, course.etat)
		local reference = course.distance / v0
		for _, r in res do
			assert(
				r.temps > reference * 0.9 and r.temps < reference * 1.2,
				`{course.nom} : {r.nom} en {r.temps} s (référence {reference} s)`
			)
		end
		for i = 2, #res do
			assert(res[i].temps >= res[i - 1].temps, "classement et temps incohérents")
		end
	end
end)

H.test("deux coureuses dans le même couloir ne se traversent jamais", function()
	local pires = 0
	for graine = 1, 20 do
		local sim = Simulation.nouvelle(pisteStandard(), Courses.parId("aube"), pelotonDeBots(graine), graine, 0)
		courir(sim, function(s)
			for i, a in s.coureuses do
				for j = i + 1, #s.coureuses do
					local b = s.coureuses[j]
					if a.partie and b.partie and not a.arrivee and not b.arrivee then
						if math.abs(a.couloir - b.couloir) < F.LARGEUR_CORPS * 0.95 and math.abs(a.d - b.d) < 0.5 then
							pires += 1
						end
					end
				end
			end
		end)
	end
	assert(pires == 0, `{pires} chevauchements observés`)
end)

H.test("le sprint est refusé avant la finale et accepté pendant", function()
	local course = Courses.parId("alizes")
	local joueuse = {
		nom = "Testeuse",
		strategie = "ombre",
		stats = Peloton.profil("equilibree").stats,
		competences = {},
		controle = "joueur",
	}
	local defs = Peloton.completer({ joueuse }, 8, Aleatoire.nouveau(3))
	local sim = Simulation.nouvelle(pisteStandard(), course, defs, 3, 0)
	local c = sim.coureuses[1]
	for _ = 1, 30 * 10 do
		sim:pas(PAS)
	end
	sim:commande(1, "sprint")
	sim:pas(PAS)
	assert(not c.sprint, "sprint accepté en début de course")
	while F.phase(c.d, course.distance) < F.FINALE do
		sim:pas(PAS)
	end
	sim:commande(1, "sprint")
	local evenements = sim:pas(PAS)
	assert(c.sprint, "sprint refusé en finale")
	local vu = false
	for _, e in evenements do
		vu = vu or (e.genre == "sprint" and e.id == 1 and e.auto == false)
	end
	assert(vu, "pas d'événement de sprint")
end)

H.test("une joueuse distraite finit par sprinter seule", function()
	local course = Courses.parId("alizes")
	local joueuse = {
		nom = "Distraite",
		strategie = "vague",
		stats = Peloton.profil("equilibree").stats,
		competences = {},
		controle = "joueur",
	}
	local sim = Simulation.nouvelle(pisteStandard(), course, { joueuse }, 5, 0)
	local c = sim.coureuses[1]
	local restantAuSprint
	courir(sim, function(s)
		if c.sprint and not restantAuSprint then
			restantAuSprint = s:restant(c)
		end
	end)
	-- Sur 1 400 m, le sprint est tenable dès l'entrée en finale (467 m) :
	-- la coureuse se lance seule environ 4 s plus tard.
	local finale = course.distance / 3
	assert(restantAuSprint, "jamais sprinté")
	assert(
		restantAuSprint < finale - 60 and restantAuSprint > finale - 110,
		`sprint à {restantAuSprint} m de l'arrivée (finale à {finale} m)`
	)
end)

H.test("faux départ et départ parfait", function()
	local course = Courses.parId("alizes")
	local function joueuse(nom)
		return {
			nom = nom,
			strategie = "ombre",
			stats = Peloton.profil("equilibree").stats,
			competences = {},
			controle = "joueur",
		}
	end
	local sim = Simulation.nouvelle(pisteStandard(), course, { joueuse("A"), joueuse("B"), joueuse("C") }, 9, 1)
	sim:commande(1, "depart", -0.3)
	sim:commande(2, "depart", 0.1)
	sim:commande(3, "depart", 0.8)
	for _ = 1, 30 * 4 do
		sim:pas(PAS)
	end
	local a, b, c = sim.coureuses[1], sim.coureuses[2], sim.coureuses[3]
	assert(a.reaction == "faux" and b.reaction == "parfait" and c.reaction == "aucune")
	assert(b.d > c.d and c.d > a.d, `parfait {b.d}, normal {c.d}, faux {a.d}`)
end)

H.test("une compétence prête et non déclenchée finit par être perdue", function()
	local course = Courses.parId("aube")
	local joueuse = {
		nom = "Rêveuse",
		strategie = "fusee",
		stats = Peloton.profil("equilibree").stats,
		competences = { "departCanon" },
		controle = "joueur",
	}
	local sim = Simulation.nouvelle(pisteStandard(), course, { joueuse }, 2, 0)
	local etats = {}
	for _ = 1, 30 * 8 do
		for _, e in sim:pas(PAS) do
			table.insert(etats, e.genre)
		end
	end
	local liste = table.concat(etats, " ")
	assert(string.find(liste, "competencePrete"), liste)
	assert(string.find(liste, "competenceManquee"), liste)
	assert(sim.coureuses[1].competences[1].etat == "manquee")
end)

H.test("un joueur qui quitte la course est repris par l'IA", function()
	local course = Courses.parId("alizes")
	local joueuse = {
		nom = "Partie",
		strategie = "ombre",
		stats = Peloton.profil("equilibree").stats,
		competences = {},
		controle = "joueur",
	}
	local sim = Simulation.nouvelle(pisteStandard(), course, { joueuse }, 2, 0)
	sim:commande(1, "ia")
	assert(sim.coureuses[1].controle == "ia")
	courir(sim)
	assert(sim.coureuses[1].arrivee)
end)

H.test("personne n'est avantagée : toutes les partantes ont le même total de stats", function()
	for graine = 1, 50 do
		for _, def in pelotonDeBots(graine, 16) do
			local s = def.stats
			local total = s.vitesse + s.souffle + s.puissance + s.coeur + s.instinct
			assert(total == Peloton.TOTAL_STATS, `{def.nom} : {total}`)
		end
	end
	for _, profil in Peloton.profils do
		local s = profil.stats
		assert(s.vitesse + s.souffle + s.puissance + s.coeur + s.instinct == Peloton.TOTAL_STATS, profil.nom)
	end
end)

H.test("les stalles sont centrées et jamais plus serrées qu'un corps", function()
	for _, n in { 4, 8, 12, 16 } do
		local premier = F.couloirDepart(1, n, Config.LARGEUR_PISTE)
		local dernier = F.couloirDepart(n, n, Config.LARGEUR_PISTE)
		H.proche(premier, Config.LARGEUR_PISTE - dernier, 1e-9, `{n} partantes : symétrie`)
		assert(premier >= F.COULOIR_MIN - 1e-9, `{n} partantes : stalle 1 contre la lice`)
		if n > 1 then
			assert(F.ecartStalles(n, Config.LARGEUR_PISTE) >= F.LARGEUR_CORPS, `{n} partantes : stalles trop serrées`)
		end
	end
	-- Jusqu'à 12 partantes, il reste un couloir libre de chaque côté
	assert(F.couloirDepart(1, 12, Config.LARGEUR_PISTE) >= F.COULOIR_MIN + F.LARGEUR_CORPS)
end)

print("Réseau et commentaire")

H.test("un instantané survit à l'aller-retour binaire", function()
	local sim = Simulation.nouvelle(pisteStandard(), Courses.parId("archipel"), pelotonDeBots(11), 11, 0)
	for _ = 1, 30 * 40 do
		sim:pas(PAS)
	end
	local b = Paquet.ecrire(1234, 98765.4321, sim.t, true, sim.coureuses)
	assert(buffer.len(b) == 18 + 11 * #sim.coureuses, "taille inattendue")
	local lu = Paquet.lire(b)
	assert(lu and lu.numero == 1234 and lu.ralenti)
	H.proche(lu.heure, 98765.4321, 1e-9, "heure")
	for i, c in sim.coureuses do
		local r = lu.coureuses[i]
		H.proche(r.d, c.d, 1e-3, "distance")
		H.proche(r.couloir, c.couloir, 1e-3, "couloir")
		H.proche(r.v, c.v, 0.01, "vitesse")
		H.proche(r.endurance, c.endurance / c.enduranceMax, 0.003, "endurance")
		assert(r.rang == c.rang and r.sprint == c.sprint and r.aura == c.aura)
	end
	local tailleMax = 18 + 11 * 80
	assert(tailleMax <= 900, "80 coureuses ne tiennent plus dans un envoi")
end)

H.test("le commentateur nomme les bonnes coureuses", function()
	local noms = { "Brise", "Comète" }
	local contexte = {
		nom = function(id)
			return noms[id] or "?"
		end,
		course = "Prix de l'Aube",
	}
	local l = Commentaire.ligne({ genre = "duel", id = 1, autre = 2 }, contexte, 0)
	assert(l and string.find(l.texte, "Brise") and string.find(l.texte, "Comète"), l and l.texte)
	local v = Commentaire.ligne({ genre = "arrivee", id = 2, rang = 1 }, contexte, 0)
	assert(v and v.priorite == 4 and string.find(v.texte, "Comète"))
	assert(Commentaire.ligne({ genre = "arrivee", id = 2, rang = 2 }, contexte, 0) == nil)
	local c = Commentaire.ligne({ genre = "competence", id = 1, competence = "ouragan" }, contexte, 0)
	assert(c and string.find(c.texte, "Ouragan"), c and c.texte)
end)

if not H.bilan() then
	local process = require("@lune/process")
	process.exit(1)
end
