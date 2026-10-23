--!nocheck
-- Tests du tutoriel. Depuis stellar-derby/ :  lune run tests/tutoriel

local H = require("./harnais")

local Partage = H.partage()
local Tutoriel = H.require(Partage.Jeu.Tutoriel)
local Schema = H.require(Partage.Jeu.Schema)

local function ctx(phase, fraction, evenements)
	return { phase = phase, fraction = fraction or 0, evenements = evenements or {} }
end

print("Étapes")

H.test("chaque étape a un identifiant unique, un moment et une validation", function()
	local vus = {}
	for i, e in Tutoriel.ETAPES do
		assert(not vus[e.id], `doublon {e.id}`)
		vus[e.id] = true
		assert(Tutoriel.indice(e.id) == i)
		assert(e.id == "arrivee" or #e.texte > 0, e.id)
		assert(e.validation == "temps" or e.validation == "suivant", e.id)
		assert(({ phase = true, fraction = true, evenement = true, academie = true })[e.moment.genre], e.id)
	end
end)

H.test("les gestes sont donnés au doigt ET au clavier", function()
	for _, id in { "depart", "couloirs", "rythme", "competence", "sprint" } do
		local texte = Tutoriel.ETAPES[Tutoriel.indice(id)].texte
		assert(string.find(texte, "(", 1, true), `{id} : pas de touche clavier`)
	end
end)

H.test("la course guidée, puis la visite des boutons du menu", function()
	local debut = Tutoriel.debutAcademie()
	for i = 1, debut - 1 do
		assert(Tutoriel.ETAPES[i].moment.genre ~= "academie")
	end
	local boutons = {}
	for i = debut, #Tutoriel.ETAPES do
		local e = Tutoriel.ETAPES[i]
		assert(e.moment.genre == "academie" and e.validation == "suivant")
		if e.moment.bouton then
			boutons[e.moment.bouton] = true
		end
	end
	for _, b in { "courir", "carriere", "entrainement", "boutique", "classements" } do
		assert(boutons[b], `bouton {b} jamais montré`)
	end
end)

H.test("la progression avance jusqu'à la fin", function()
	local i, n = 1, 0
	while i do
		n += 1
		i = Tutoriel.suivante(i)
	end
	assert(n == #Tutoriel.ETAPES)
end)

print("Moments")

H.test("chaque étape de course se déclenche au bon moment, pas avant", function()
	local E = function(id)
		return Tutoriel.ETAPES[Tutoriel.indice(id)]
	end
	assert(Tutoriel.declenchee(E("presentation"), ctx("presentation")))
	assert(not Tutoriel.declenchee(E("presentation"), ctx("stalles")))
	assert(Tutoriel.declenchee(E("depart"), ctx("stalles")))
	assert(not Tutoriel.declenchee(E("couloirs"), ctx("course", 0.01)))
	assert(Tutoriel.declenchee(E("couloirs"), ctx("course", 0.05)))
	assert(not Tutoriel.declenchee(E("couloirs"), ctx("stalles", 0.5)))
	assert(Tutoriel.declenchee(E("competence"), ctx("course", 0.4, { competencePrete = true })))
	assert(not Tutoriel.declenchee(E("competence"), ctx("course", 0.4, {})))
	assert(Tutoriel.declenchee(E("sprint"), ctx("course", 0.7)))
	assert(not Tutoriel.declenchee(E("sprint"), ctx("course", 0.6)))
	assert(Tutoriel.declenchee(E("arrivee"), ctx("resultats")))
	assert(not Tutoriel.declenchee(E("courir"), ctx("course", 1)), "une étape de l'Académie en course")
end)

H.test("un mot d'arrivée pour chaque place", function()
	assert(string.find(Tutoriel.bravo(1, 12), "VICTOIRE", 1, true))
	for rang = 1, 12 do
		assert(#Tutoriel.bravo(rang, 12) > 0)
	end
	assert(Tutoriel.bravo(2, 12) ~= Tutoriel.bravo(12, 12))
end)

print("Sauvegarde et récompense")

H.test("la progression s'enregistre sans reculer, bornée", function()
	local d = Schema.nouveau()
	Tutoriel.enregistrer(d, 4)
	assert(d.tutoriel.etape == 4)
	Tutoriel.enregistrer(d, 2)
	assert(d.tutoriel.etape == 4, "recul")
	Tutoriel.enregistrer(d, 9999)
	assert(d.tutoriel.etape == #Tutoriel.ETAPES)
	for _, absurde in { "5", nil, 0 / 0, {} } do
		Tutoriel.enregistrer(d, absurde)
	end
	assert(d.tutoriel.etape == #Tutoriel.ETAPES)
end)

H.test("la récompense ne se donne qu'une fois", function()
	local d = Schema.nouveau()
	local r = Tutoriel.finir(d)
	assert(r and r.etoiles == 200 and d.tutoriel.fini)
	assert(Tutoriel.finir(d) == nil, "récompense donnée deux fois")
	local copie = Schema.migrer(Schema.copier(d))
	assert(Tutoriel.finir(copie) == nil, "récompense redonnée après la sauvegarde")
end)

if not H.bilan() then
	error("des tests ont échoué")
end
