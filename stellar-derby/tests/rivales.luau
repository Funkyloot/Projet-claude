--!nocheck
-- Tests des rivales du destin. Depuis stellar-derby/ :  lune run tests/rivales

local H = require("./harnais")

local Partage = H.partage()
local Rivales = H.require(Partage.Jeu.Rivales)
local Schema = H.require(Partage.Jeu.Schema)

-- Une course : liste de { nom, ecart, userId? } dans l'ordre d'arrivée
local function course(arrivee)
	local resultats = {}
	for rang, a in arrivee do
		table.insert(resultats, { id = rang, nom = a[1], rang = rang, ecart = a[2] or "1 longueur", userId = a[3] })
	end
	return resultats
end

print("Rivales")

H.test("battue d'une encolure ou moins par celle de devant : elle devient ta rivale", function()
	for _, ecart in { "Nez", "Tête", "Encolure", "Ex æquo" } do
		local d = Schema.nouveau()
		local bilan = Rivales.apresCourse(d, course({ { "Brise Lunaire", "" }, { "Moi", ecart, 7 } }), 2, 100)
		assert(bilan.nouvelle == "Brise Lunaire", ecart)
		assert(#d.rivales == 1 and d.rivales[1].cle == "b:Brise Lunaire" and d.rivales[1].fois == 1)
	end
end)

H.test("battue de plus d'une encolure : pas de rivale", function()
	local d = Schema.nouveau()
	local bilan = Rivales.apresCourse(d, course({ { "A", "" }, { "Moi", "½ longueur", 7 } }), 2, 100)
	assert(bilan.nouvelle == nil and #d.rivales == 0)
	Rivales.apresCourse(d, course({ { "Moi", "", 7 }, { "A", "Nez" } }), 1, 100)
	assert(#d.rivales == 0, "la gagnante se donne une rivale")
end)

H.test("une joueuse est reconnue par son userId, une coureuse de l'IA par son nom", function()
	assert(Rivales.cle({ nom = "Lune", userId = 42 }) == "u42")
	assert(Rivales.cle({ nom = "Lune" }) == "b:Lune")
	local d = Schema.nouveau()
	Rivales.apresCourse(d, course({ { "Camille", "", 42 }, { "Moi", "Nez", 7 } }), 2, 100)
	assert(d.rivales[1].cle == "u42")
	assert(Rivales.estRivale(d.rivales, "Autre pseudo", 42), "un changement de pseudo fait oublier")
	assert(not Rivales.estRivale(d.rivales, "Camille", nil))
end)

H.test("la retrouver la rend plus coriace ; la battre brise le destin une fois", function()
	local d = Schema.nouveau()
	Rivales.apresCourse(d, course({ { "Brise", "" }, { "Moi", "Tête", 7 } }), 2, 100)
	Rivales.apresCourse(d, course({ { "Brise", "" }, { "Moi", "Nez", 7 } }), 2, 200)
	assert(d.rivales[1].fois == 2 and d.rivales[1].derniere == 200)
	local bilan = Rivales.apresCourse(d, course({ { "Moi", "", 7 }, { "Autre" }, { "Brise" } }), 1, 300)
	assert(#bilan.destins == 1 and bilan.destins[1] == "Brise")
	assert(d.rivales[1].battue == 1)
	local encore = Rivales.apresCourse(d, course({ { "Moi", "", 7 }, { "Brise" } }), 1, 400)
	assert(#encore.destins == 0 and #encore.battues == 1 and d.rivales[1].battue == 2)
end)

H.test("au plus 12 rivales : la plus ancienne est oubliée", function()
	local d = Schema.nouveau()
	for i = 1, 15 do
		Rivales.apresCourse(d, course({ { `R{i}`, "" }, { "Moi", "Nez", 7 } }), 2, i)
	end
	assert(#d.rivales == Rivales.MAX)
	assert(not Rivales.estRivale(d.rivales, "R1") and Rivales.estRivale(d.rivales, "R15"))
	assert(Rivales.MAX == Schema.MAX_RIVALES)
end)

H.test("une course sans moi, ou bizarre, ne casse rien", function()
	local d = Schema.nouveau()
	local bilan = Rivales.apresCourse(d, course({ { "A", "" }, { "B", "Nez" } }), 9, 1)
	assert(bilan.nouvelle == nil and #d.rivales == 0)
	assert(Rivales.apresCourse(d, {}, 1, 1).nouvelle == nil)
end)

if not H.bilan() then
	error("des tests ont échoué")
end
