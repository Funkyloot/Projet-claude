--!nocheck
-- Tests des classements. Depuis stellar-derby/ :  lune run tests/classements

local H = require("./harnais")

local Partage = H.partage()
local Classement = H.require(Partage.Jeu.Classement)
local Schema = H.require(Partage.Jeu.Schema)

print("Magasins et saisons")

H.test("un magasin par classement, un par mois pour la saison", function()
	assert(Classement.magasin("victoires", "2026-10") == Classement.magasin("victoires", "2026-11"))
	assert(Classement.magasin("saison", "2026-10") ~= Classement.magasin("saison", "2026-11"))
	assert(string.find(Classement.magasin("saison", "2026-10"), "2026-10", 1, true))
	for _, c in Classement.LISTE do
		assert(Classement.existe(c) and Classement.NOMS[c] and Classement.ICONES[c])
	end
	assert(not Classement.existe("argent") and not Classement.existe(nil))
end)

H.test("la saison précédente, y compris en janvier", function()
	assert(Classement.saisonPrecedente("2026-10") == "2026-09")
	assert(Classement.saisonPrecedente("2027-01") == "2026-12")
	assert(Classement.saisonPrecedente("n'importe quoi") == "")
end)

print("Valeurs")

H.test("la valeur de chaque classement vient de la sauvegarde", function()
	local d = Schema.nouveau()
	d.stats.victoires = 12
	d.saison = { id = "2026-10", points = 340 }
	d.legendes = { { note = 3100 }, { note = 5200 }, { note = 800 } }
	assert(Classement.valeur("victoires", d, "2026-10") == 12)
	assert(Classement.valeur("saison", d, "2026-10") == 340)
	assert(Classement.valeur("saison", d, "2026-11") == 0, "les points d'une saison passée comptent")
	assert(Classement.valeur("legendes", d, "2026-10") == 5200)
	assert(Classement.valeur("legendes", Schema.nouveau(), "2026-10") == 0)
	assert(Classement.valeur("inconnu", d, "2026-10") == 0)
end)

H.test("on ne réécrit que ce qui a changé, au plus toutes les 2 minutes", function()
	assert(Classement.fautReecrire(nil, 5, 0))
	assert(not Classement.fautReecrire(nil, 0, 0), "écrire un zéro inutile")
	local derniere = { valeur = 5, heure = 1000 }
	assert(not Classement.fautReecrire(derniere, 5, 5000), "valeur inchangée")
	assert(not Classement.fautReecrire(derniere, 6, 1060), "trop tôt")
	assert(Classement.fautReecrire(derniere, 6, 1120))
	assert(Classement.fautReecrire(derniere, 6, 1010, true), "au départ, on écrit tout de suite")
end)

print("Affichage")

H.test("rangs et valeurs abrégées", function()
	assert(Classement.rang(1) == "1er" and Classement.rang(2) == "2e" and Classement.rang(10) == "10e")
	assert(Classement.abreger(950) == "950")
	assert(Classement.abreger(1234) == "1,2 k", Classement.abreger(1234))
	assert(Classement.abreger(1000) == "1 k", Classement.abreger(1000))
	assert(Classement.abreger(15400) == "15 k", Classement.abreger(15400))
	assert(Classement.abreger(2500000) == "2,5 M", Classement.abreger(2500000))
end)

H.test("le temps avant la fin de la saison", function()
	-- 30 octobre 2026, 12:00 UTC : il reste 1 jour et demi
	local heure = 1793361600
	assert(os.date("!%d", heure) == "30", os.date("!%c", heure))
	assert(Classement.tempsRestant(heure) == 36 * 3600, tostring(Classement.tempsRestant(heure)))
	-- 28 février 2028 (bissextile), 0:00 : il reste 2 jours
	local fevrier = 1835308800
	assert(os.date("!%m-%d", fevrier) == "02-28", os.date("!%c", fevrier))
	assert(Classement.tempsRestant(fevrier) == 2 * 86400)
	assert(Classement.duree(36 * 3600) == "1 j 12 h")
	assert(Classement.duree(5 * 3600 + 20 * 60) == "5 h 20 min")
	assert(Classement.duree(10) == "1 min")
end)

if not H.bilan() then
	error("des tests ont échoué")
end
