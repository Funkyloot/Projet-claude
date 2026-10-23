--!nocheck
-- Tests de la logique de jeu (sauvegarde, économie, saisons). Depuis
-- stellar-derby/ :  lune run tests/jeu
--
-- Chaque fonctionnalité ajoute ses tests dans son propre fichier
-- (tests/<fonctionnalite>.luau) ; celui-ci couvre le socle.

local H = require("./harnais")

local Partage = H.partage()
local Jeu = Partage.Jeu
local Schema = H.require(Jeu.Schema)
local Economie = H.require(Jeu.Economie)
local Saisons = H.require(Jeu.Saisons)

print("Sauvegarde")

H.test("une sauvegarde neuve est déjà propre", function()
	local d = Schema.nouveau()
	local n = Schema.nettoyer(d)
	assert(n.etoiles == d.etoiles and n.equipement.robe == "bai" and n.possessions.robes.bai)
	assert(n.version == Schema.VERSION)
end)

H.test("des données absurdes deviennent une sauvegarde neuve, sans planter", function()
	for _, brut in { nil, 42, "texte", true, { etoiles = "beaucoup" }, { stats = 3 }, { possessions = { robes = 1 } } } do
		local d = Schema.migrer(brut)
		assert(type(d.etoiles) == "number" and d.etoiles >= 0)
		assert(type(d.stats.courses) == "number")
		assert(d.possessions.robes.bai == true)
	end
end)

H.test("les valeurs hors bornes sont ramenées, les objets offerts restent possédés", function()
	local d = Schema.migrer({
		etoiles = -50,
		xp = 1 / 0,
		possessions = { robes = { nuit = true, faux = "oui" } },
		equipement = { robe = "prune" },
		reglages = { musique = 7 },
	})
	assert(d.etoiles == 0, "étoiles négatives")
	assert(d.xp == 0, "xp infinie")
	assert(d.possessions.robes.nuit and d.possessions.robes.bai, "possessions")
	assert(d.possessions.robes.faux == nil, "valeur non booléenne gardée")
	assert(d.equipement.robe == "bai", "on porte une robe qu'on ne possède pas")
	assert(d.reglages.musique == 1, "volume hors bornes")
end)

H.test("une sauvegarde complète survit à l'aller-retour", function()
	local d = Schema.nouveau()
	d.etoiles = 1234
	d.xp = 999
	d.possessions.robes.nuit = true
	d.equipement.robe = "nuit"
	d.titres.premiere = 10
	d.equipement.titre = "premiere"
	d.stats.victoires = 3
	d.stats.parStrategie.fusee = { courses = 5, victoires = 2 }
	d.stats.meilleursTemps.alizes = 66.5
	table.insert(d.rivales, { cle = "u1", nom = "Lune", fois = 2, battue = 1, derniere = 5 })
	table.insert(d.legendes, {
		id = "l1",
		nom = "Étoile",
		robe = "nuit",
		stats = { vitesse = 900, souffle = 800, puissance = 700, coeur = 700, instinct = 600 },
		strategie = "vague",
		note = 4200,
		titre = "Reine",
		victoires = 6,
		date = 1,
	})
	d.carriere = { annee = 2, tour = 7 }
	local copie = Schema.migrer(Schema.copier(d))
	assert(copie.etoiles == 1234 and copie.xp == 999)
	assert(copie.equipement.robe == "nuit" and copie.equipement.titre == "premiere")
	assert(copie.stats.parStrategie.fusee.victoires == 2)
	assert(copie.stats.meilleursTemps.alizes == 66.5)
	assert(#copie.rivales == 1 and copie.rivales[1].nom == "Lune")
	assert(#copie.legendes == 1 and copie.legendes[1].stats.vitesse == 900)
	assert(copie.carriere.annee == 2)
end)

H.test("les listes sont bornées", function()
	local brut = Schema.nouveau()
	for i = 1, 50 do
		table.insert(brut.rivales, { cle = `u{i}`, nom = "x", fois = 1, battue = 0, derniere = 0 })
	end
	local d = Schema.migrer(brut)
	assert(#d.rivales == Schema.MAX_RIVALES)
end)

print("Économie")

H.test("gagner rapporte plus que finir deuxième, et ainsi de suite", function()
	local precedent = math.huge
	for rang = 1, 12 do
		local g = Economie.recompenseCourse({ rang = rang, partantes = 12, genre = "publique" })
		assert(g.etoiles <= precedent, `rang {rang}`)
		assert(g.etoiles > 0 and g.xp > 0)
		precedent = g.etoiles
	end
end)

H.test("le Grand Prix du week-end rapporte double", function()
	local normal = Economie.recompenseCourse({ rang = 1, partantes = 12, genre = "publique" })
	local gp = Economie.recompenseCourse({ rang = 1, partantes = 12, genre = "publique", grandPrix = true })
	assert(gp.etoiles == normal.etoiles * 2)
end)

H.test("la courbe des niveaux est croissante et cohérente", function()
	local n, dans, besoin = Economie.niveau(0)
	assert(n == 1 and dans == 0 and besoin == Economie.xpPourNiveau(1))
	local total = 0
	for niveau = 1, 10 do
		total += Economie.xpPourNiveau(niveau)
	end
	local n2 = Economie.niveau(total)
	assert(n2 == 11, `niveau {n2} au lieu de 11`)
	assert(Economie.niveau(10 ^ 9) == Economie.NIVEAU_MAX)
end)

H.test("les récompenses restent bornées quelle que soit l'entrée", function()
	for _, q in { -5, 0, 0.5, 1, 9 } do
		local e = Economie.recompenseEntrainement(q)
		assert(e.etoiles >= 8 and e.etoiles <= 40)
		local c = Economie.recompenseConcert(q, true, q)
		assert(c.etoiles >= 0 and c.etoiles <= 140)
	end
end)

print("Saisons")

H.test("identifiant et nom de saison", function()
	-- 14 octobre 2026, 12:00 UTC
	local heure = 1791979200
	assert(Saisons.id(heure) == "2026-10", Saisons.id(heure))
	assert(Saisons.nom("2026-10") == "Saison d'Octobre 2026", Saisons.nom("2026-10"))
	assert(Saisons.nom("2026-03") == "Saison de Mars 2026")
end)

H.test("le Grand Prix n'a lieu que le week-end, une course sur trois", function()
	-- 17 octobre 2026 (samedi) et 14 octobre 2026 (mercredi), 12:00 UTC
	local samedi, mercredi = 1792238400, 1791979200
	assert(Saisons.estWeekend(samedi) and not Saisons.estWeekend(mercredi))
	assert(Saisons.estGrandPrix(samedi, 3) and not Saisons.estGrandPrix(samedi, 4))
	assert(not Saisons.estGrandPrix(mercredi, 3))
end)

H.test("les points de saison récompensent le classement", function()
	assert(Saisons.pointsCourse(1, 12, false) > Saisons.pointsCourse(2, 12, false))
	assert(Saisons.pointsCourse(12, 12, false) > 0)
	assert(Saisons.pointsCourse(1, 12, true) == 2 * Saisons.pointsCourse(1, 12, false))
end)

if not H.bilan() then
	error("des tests ont échoué")
end
