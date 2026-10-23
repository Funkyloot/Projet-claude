--!nocheck
-- Tests du mode Live. Depuis stellar-derby/ :  lune run tests/live

local H = require("./harnais")

local Partage = H.partage()
local Live = H.require(Partage.Jeu.Live)
local Config = H.require(Partage.Config)
local Course = Partage.Course
local Pistes = H.require(Course.Pistes)
local Courses = H.require(Course.Courses)
local Peloton = H.require(Course.Peloton)
local Simulation = H.require(Course.Simulation)
local Aleatoire = H.require(Course.Aleatoire)

print("Messages du chat")

H.test("les pseudos Roblox valables", function()
	for _, p in { "abc", "Lune_Rose", "Joueur123", "a1b2c3d4e5f6g7h8i9j0" } do
		assert(Live.pseudoValide(p), p)
	end
	for _, p in { "ab", "_abc", "abc_", "a__b", "a_b_c", "é_a", "abc def", "a-b", string.rep("a", 21), "", 42 } do
		assert(not Live.pseudoValide(p), tostring(p))
	end
end)

H.test("!join, !prono, !vote sont reconnus", function()
	local j = Live.analyser("!join Lune_Rose")
	assert(j and j.genre == "join" and j.pseudo == "Lune_Rose")
	assert(Live.analyser("  !JOIN   Lune  ").pseudo == "Lune")
	local p = Live.analyser("!prono 7")
	assert(p and p.genre == "prono" and p.numero == 7)
	local v = Live.analyser("!vote 2")
	assert(v and v.genre == "vote" and v.choix == 2)
end)

H.test("messages malformés, injections, limites : ignorés", function()
	for _, texte in
		{
			"join Lune",
			"!join",
			"!join a b",
			"!join <script>",
			"!join Lune; DROP TABLE",
			"!prono 0",
			"!prono 31",
			"!prono -3",
			"!prono 7.5",
			"!prono 1e3",
			"!vote 4",
			"!vote 0",
			"!vote 12",
			"!danse 1",
			"!join " .. string.rep("a", 300),
			"bonjour à tous",
			"",
			42,
		}
	do
		assert(Live.analyser(texte) == nil, tostring(texte))
	end
	assert(Live.analyser(string.rep(" ", 250) .. "!vote 1") == nil, "message trop long")
end)

H.test("les auteurs sont nettoyés", function()
	assert(Live.auteur("  Camille  ") == "Camille")
	assert(Live.auteur("a\nb\0c") == "abc")
	assert(#Live.auteur(string.rep("x", 100)) == Live.MAX_AUTEUR)
	assert(Live.auteur("   ") == nil and Live.auteur(nil) == nil and Live.auteur(5) == nil)
end)

print("File des invitées")

H.test("un pseudo une seule fois, sans tenir compte des majuscules", function()
	local e = Live.nouvelEtat()
	assert(Live.ajouterInvite(e, "Lune"))
	assert(not Live.ajouterInvite(e, "lune"))
	assert(not Live.ajouterInvite(e, "LUNE"))
	assert(#e.invites == 1)
	assert(Live.retirerInvite(e, "LUNE") and #e.invites == 0)
	assert(Live.ajouterInvite(e, "lune"), "retirée, elle peut revenir")
end)

H.test("la file est bornée et rend les premières arrivées", function()
	local e = Live.nouvelEtat()
	for i = 1, 40 do
		Live.ajouterInvite(e, `Joueuse{i}`)
	end
	assert(#e.invites == Live.CAPACITE and Live.CAPACITE == Config.TAILLE_PELOTON_LIVE)
	local partantes = Live.prendreInvites(e, 5)
	assert(#partantes == 5 and partantes[1] == "Joueuse1" and #e.invites == 25)
	assert(Live.ajouterInvite(e, "Joueuse1"), "après sa course, elle peut se réinscrire")
	assert(not Live.ajouterInvite(e, "x"), "pseudo invalide accepté")
end)

H.test("une liste collée est découpée", function()
	local p = Live.decouper("Lune, @Rose_Bleue\nJoueur123 ;; _invalide a")
	assert(#p == 3 and p[2] == "Rose_Bleue", table.concat(p, "|"))
	assert(#Live.decouper(nil) == 0)
end)

print("Votes et pronostics")

H.test("un vote par auteur, dépouillement et égalités", function()
	local e = Live.nouvelEtat()
	assert(not Live.voter(e, "a", 1), "vote sans options")
	Live.ouvrirVote(e, { "alizes", "aube", "archipel" })
	assert(Live.voter(e, "a", 2))
	assert(not Live.voter(e, "a", 3), "deuxième vote du même auteur")
	assert(Live.voter(e, "b", 3) and Live.voter(e, "c", 3))
	assert(not Live.voter(e, "d", 4))
	local compte, gagnante = Live.depouiller(e)
	assert(compte[1] == 0 and compte[2] == 1 and compte[3] == 2 and gagnante == 3)
	Live.ouvrirVote(e, { "x", "y", "z" })
	Live.voter(e, "a", 1)
	Live.voter(e, "b", 2)
	local _, egalite = Live.depouiller(e)
	assert(egalite == 1, "à égalité, la première")
	Live.ouvrirVote(e, { "x", "y", "z" })
	local _, aucune = Live.depouiller(e)
	assert(aucune == nil)
end)

H.test("pronostics : 10 points la gagnante, 3 le podium, rien à miser", function()
	local e = Live.nouvelEtat()
	assert(Live.pronostiquer(e, "a", 5))
	assert(not Live.pronostiquer(e, "a", 6), "deuxième prono")
	Live.pronostiquer(e, "b", 2)
	Live.pronostiquer(e, "c", 9)
	assert(Live.nombrePronos(e) == 3)
	local gagnes = Live.attribuerPoints(e, { 5, 1, 2 })
	assert(gagnes.a == 10 and gagnes.b == 3 and gagnes.c == nil)
	assert(Live.nombrePronos(e) == 0, "les pronostics ne sont pas remis à zéro")
	Live.pronostiquer(e, "b", 1)
	Live.attribuerPoints(e, { 1, 3, 4 })
	local c = Live.classement(e, 10)
	assert(c[1].auteur == "b" and c[1].points == 13 and c[2].auteur == "a")
	assert(#Live.classement(e, 1) == 1)
end)

print("Une course Live à 30")

H.test("trente partantes courent jusqu'au bout sur chaque hippodrome", function()
	for _, piste in Pistes.liste do
		local course = Courses.dePiste(piste.id)[1]
		local defs = Peloton.completer({}, Config.TAILLE_PELOTON_LIVE, Aleatoire.nouveau(3))
		local sim = Simulation.nouvelle(Pistes.geometrie(piste.id), course, defs, 11, 0)
		local garde = 0
		while not sim.termine do
			sim:pas(1 / 30)
			garde += 1
			assert(garde < 30 * 600, "la course ne finit pas")
		end
		assert(#sim:resultats() == Config.TAILLE_PELOTON_LIVE)
	end
end)

if not H.bilan() then
	error("des tests ont échoué")
end
