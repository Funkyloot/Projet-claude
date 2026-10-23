--!nocheck
-- Tests de la boutique, de la garde-robe et des titres. Depuis stellar-derby/ :  lune run tests/boutique

local H = require("./harnais")

local Partage = H.partage()
local Jeu = Partage.Jeu
local Boutique = H.require(Jeu.Boutique)
local Catalogue = H.require(Jeu.Catalogue)
local Economie = H.require(Jeu.Economie)
local Schema = H.require(Jeu.Schema)

local function riche(niveau)
	local d = Schema.nouveau()
	d.etoiles = 100000
	local xp = 0
	for n = 1, (niveau or 99) - 1 do
		xp += Economie.xpPourNiveau(n)
	end
	d.xp = xp
	return d
end

print("Acheter")

H.test("acheter débite le prix et donne l'objet", function()
	local d = riche()
	local avant = d.etoiles
	local prix = Catalogue.obtenir("robes", "nuit").prix
	assert(Boutique.acheter(d, "robes", "nuit"))
	assert(d.etoiles == avant - prix and d.possessions.robes.nuit)
end)

H.test("on n'achète pas deux fois la même chose", function()
	local d = riche()
	assert(Boutique.acheter(d, "tenues", "marine"))
	local avant = d.etoiles
	local ok, raison = Boutique.acheter(d, "tenues", "marine")
	assert(not ok and raison and d.etoiles == avant)
	assert(not Boutique.acheter(d, "robes", "bai"), "un objet offert se rachète")
end)

H.test("niveau insuffisant ou étoiles insuffisantes : refusé, rien ne bouge", function()
	local pauvre = Schema.nouveau()
	pauvre.etoiles = 10
	local ok, raison = Boutique.acheter(pauvre, "robes", "cuivre")
	assert(not ok and string.find(raison, "manque", 1, true), raison)
	assert(pauvre.etoiles == 10 and not pauvre.possessions.robes.cuivre)
	local debutante = riche(1)
	local ok2, raison2 = Boutique.acheter(debutante, "tenues", "royale")
	assert(not ok2 and string.find(raison2, "niveau", 1, true), raison2)
	assert(not debutante.possessions.tenues.royale)
end)

H.test("les demandes absurdes sont refusées sans planter", function()
	local d = riche()
	local avant = d.etoiles
	for _, args in
		{
			{ "armes", "epee" },
			{ "robes", "licorne" },
			{ nil, nil },
			{ 3, {} },
			{ "robes", 12 },
			{ "__index", "x" },
		}
	do
		assert(not Boutique.acheter(d, args[1], args[2]))
		assert(not Boutique.equiper(d, args[1], args[2]))
	end
	assert(d.etoiles == avant)
end)

H.test("tout le catalogue a un prix positif : un achat ne peut pas rendre d'étoiles", function()
	for _, o in Catalogue.liste do
		assert(o.prix >= 0, o.id)
		local d = riche()
		local avant = d.etoiles
		Boutique.acheter(d, o.categorie, o.id)
		assert(d.etoiles <= avant)
	end
end)

print("Porter")

H.test("on ne porte que ce qu'on possède", function()
	local d = riche()
	assert(not Boutique.equiper(d, "batons", "or"))
	assert(d.equipement.baton == "rose")
	Boutique.acheter(d, "batons", "or")
	assert(Boutique.equiper(d, "batons", "or") and d.equipement.baton == "or")
	assert(Boutique.equiper(d, "robes", "noir") and d.equipement.robe == "noir")
	for categorie, champ in Boutique.EQUIPEMENT do
		assert(d.equipement[champ] ~= nil, champ)
		assert(Catalogue.NOMS_CATEGORIES[categorie], categorie)
	end
end)

H.test("titres : seulement ceux qu'on a gagnés, ou aucun", function()
	local d = riche()
	assert(not Boutique.equiperTitre(d, "championne"))
	assert(not Boutique.equiperTitre(d, "inventé"))
	assert(not Boutique.equiperTitre(d, 5))
	d.titres.championne = 100
	assert(Boutique.equiperTitre(d, "championne") and d.equipement.titre == "championne")
	assert(Boutique.nomTitre("championne") == "Championne")
	assert(Boutique.equiperTitre(d, "") and d.equipement.titre == "")
	assert(Boutique.nomTitre("") == "")
end)

print("Robux")

H.test("aucun pack n'est en vente tant qu'aucun produit n'est renseigné", function()
	for _, p in Boutique.PACKS do
		assert(p.etoiles > 0)
	end
	assert(Boutique.packDuProduit(0) == nil and Boutique.packDuProduit("x") == nil)
	assert(Boutique.packDuProduit(123456) == nil)
end)

H.test("un reçu n'est crédité qu'une fois", function()
	local d = Schema.nouveau()
	local pack = Boutique.PACKS[1]
	local avant = d.etoiles
	assert(Boutique.accorderAchat(d, "recu-1", pack))
	assert(not Boutique.accorderAchat(d, "recu-1", pack))
	assert(d.etoiles == avant + pack.etoiles)
	-- Même après un aller-retour par la sauvegarde
	local relue = Schema.migrer(Schema.copier(d))
	assert(not Boutique.accorderAchat(relue, "recu-1", pack))
	assert(Boutique.accorderAchat(relue, "recu-2", pack))
end)

if not H.bilan() then
	error("des tests ont échoué")
end
