--!nocheck
-- Tests du duo entraîneuse–coureuse. Depuis stellar-derby/ :  lune run tests/duo

local H = require("./harnais")

local Partage = H.partage()
local Duo = H.require(Partage.Jeu.Duo)

local function contexte(champs)
	local c = {
		phase = 2,
		enduranceRelative = 0.8,
		rythme = 2,
		aspiration = false,
		devant = nil,
		sprintTenable = false,
		sprint = false,
	}
	for k, v in champs or {} do
		c[k] = v
	end
	return c
end

print("Ordres")

H.test("trois ordres, chacun avec un texte et une couleur", function()
	assert(#Duo.ORDRES == 3)
	for _, o in Duo.ORDRES do
		assert(Duo.ordre(o.id) == o and #o.texte > 0 and #o.couleur == 3)
	end
	assert(Duo.ordre("vole") == nil and Duo.ordre(nil) == nil)
end)

H.test("« Garde ton souffle ! » : juste quand elle s'épuise ou pousse trop tôt", function()
	assert(Duo.evaluer("souffle", contexte({ enduranceRelative = 0.3 })))
	assert(Duo.evaluer("souffle", contexte({ rythme = 3, enduranceRelative = 0.6 })))
	assert(not Duo.evaluer("souffle", contexte({ enduranceRelative = 0.9 })))
	assert(not Duo.evaluer("souffle", contexte({ phase = 3, enduranceRelative = 0.2 })), "en finale")
end)

H.test("« Dans son sillage ! » : juste avec une concurrente à moins de 8 m", function()
	assert(Duo.evaluer("sillage", contexte({ devant = 4 })))
	assert(not Duo.evaluer("sillage", contexte({ devant = 15 })))
	assert(not Duo.evaluer("sillage", contexte({ devant = nil })))
	assert(not Duo.evaluer("sillage", contexte({ devant = 4, aspiration = true })), "déjà à l'abri")
end)

H.test("« MAINTENANT ! » : juste en finale, sprint tenable et pas encore lancé", function()
	assert(Duo.evaluer("maintenant", contexte({ phase = 3, sprintTenable = true })))
	assert(not Duo.evaluer("maintenant", contexte({ phase = 2, sprintTenable = true })))
	assert(not Duo.evaluer("maintenant", contexte({ phase = 3, sprintTenable = false })))
	assert(not Duo.evaluer("maintenant", contexte({ phase = 3, sprintTenable = true, sprint = true })))
end)

H.test("chaque verdict est expliqué", function()
	for _, o in Duo.ORDRES do
		for _, champs in { {}, { phase = 3, sprintTenable = true, devant = 3, enduranceRelative = 0.2 } } do
			local _, explication = Duo.evaluer(o.id, contexte(champs))
			assert(type(explication) == "string" and #explication > 0)
		end
	end
	assert(not Duo.evaluer("inconnu", contexte()))
end)

H.test("6 s de recharge entre deux ordres", function()
	assert(Duo.peutDonner(nil, 0))
	assert(not Duo.peutDonner(10, 15))
	assert(Duo.peutDonner(10, 16))
end)

print("Équité")

H.test("aucun effet sur la course hors carrière", function()
	for _, o in Duo.ORDRES do
		for _, genre in { "publique", "tutoriel", "live", "inconnu" } do
			assert(Duo.effet(o.id, genre) == nil, `{o.id} agit en {genre}`)
		end
		local e = Duo.effet(o.id, "carriere")
		assert(e and e.valeur > 0 and e.valeur <= 0.3, o.id)
	end
	assert(Duo.effet("inconnu", "carriere") == nil)
end)

H.test("un gain modeste et borné", function()
	assert(Duo.recompense(0).etoiles == 5)
	assert(Duo.recompense(3).etoiles > Duo.recompense(1).etoiles)
	assert(Duo.recompense(1000).etoiles == Duo.recompense(8).etoiles and Duo.recompense(8).etoiles <= 40)
	assert(Duo.recompense(-5).etoiles == 5)
end)

if not H.bilan() then
	error("des tests ont échoué")
end
