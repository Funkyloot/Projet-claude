--!nocheck
-- Tests des mini-jeux d'entraînement. Depuis stellar-derby/ :  lune run tests/entrainement

local H = require("./harnais")

local Partage = H.partage()
local E = H.require(Partage.Jeu.Entrainement)

local GRAINES = { 1, 7, 42, 1234, 99999, 2 ^ 31 - 2 }

print("Définitions")

H.test("cinq jeux, un par stat, tous décrits", function()
	assert(#E.ORDRE == 5)
	for _, id in E.ORDRE do
		local j = E.JEUX[id]
		assert(j and j.id == id and #j.nom > 0 and #j.consigne > 0 and #j.icone > 0, id)
		assert(E.existe(id))
	end
	assert(not E.existe("vol") and not E.existe(nil) and not E.existe(3))
end)

H.test("chaque note a son mot, du meilleur au moins bon", function()
	assert(E.mot(100) == "Parfait !")
	assert(E.mot(85) == "Très bien !")
	assert(E.mot(45) == "Pas mal")
	assert(#E.mot(0) > 0)
end)

H.test("les séquences sont déterministes : même graine, même partie", function()
	for _, g in GRAINES do
		local a, b = E.sequenceVitesse(g), E.sequenceVitesse(g)
		for i, e in a do
			assert(e.centre == b[i].centre and e.largeur == b[i].largeur)
		end
		assert(E.sequenceCoeur(g)[5] == E.sequenceCoeur(g)[5])
		assert(E.sequenceInstinct(g)[3].libre == E.sequenceInstinct(g)[3].libre)
		assert(E.sequencePuissance(g)[2] == E.sequencePuissance(g)[2])
	end
	local differentes = 0
	for i = 1, 20 do
		if E.sequenceVitesse(i)[1].centre ~= E.sequenceVitesse(i + 100)[1].centre then
			differentes += 1
		end
	end
	assert(differentes >= 18, "les graines ne changent rien")
end)

print("Vitesse")

H.test("la zone rétrécit et le curseur accélère, sans sortir de la barre", function()
	for _, g in GRAINES do
		local s = E.sequenceVitesse(g)
		assert(#s == E.VITESSE.ESSAIS)
		for i, e in s do
			assert(e.centre - e.largeur / 2 >= 0 and e.centre + e.largeur / 2 <= 1, "zone hors barre")
			if i > 1 then
				assert(e.largeur < s[i - 1].largeur and e.vitesse > s[i - 1].vitesse)
			end
		end
	end
end)

H.test("le curseur fait des allers-retours entre 0 et 1", function()
	local e = { centre = 0.5, largeur = 0.2, vitesse = 1 }
	H.proche(E.curseurVitesse(e, 0), 0, 1e-9)
	H.proche(E.curseurVitesse(e, 0.5), 0.5, 1e-9)
	H.proche(E.curseurVitesse(e, 1), 1, 1e-9)
	H.proche(E.curseurVitesse(e, 1.25), 0.75, 1e-9)
	H.proche(E.curseurVitesse(e, 2), 0, 1e-9)
end)

H.test("note de vitesse : précision récompensée, ratés à zéro", function()
	local parfait = {}
	local bords = {}
	for i = 1, 8 do
		parfait[i] = 0
		bords[i] = 1
	end
	assert(E.noteVitesse(parfait) == 100)
	assert(E.noteVitesse(bords) == 60)
	assert(E.noteVitesse({}) == 0)
	assert(E.noteVitesse({ 0, 0, 0, 0 }) == 50, "4 essais parfaits sur 8")
	assert(E.noteVitesse({ 1.5, 2, 0 / 0, -1 }) == 13, "hors zone, NaN ou négatif")
end)

print("Souffle")

H.test("la bande reste dans la jauge et rétrécit", function()
	for _, g in GRAINES do
		local points = E.sequenceSouffle(g)
		assert(points[#points].t >= E.SOUFFLE.DUREE)
		local _, largeurDebut = E.bandeSouffle(points, 0)
		local _, largeurFin = E.bandeSouffle(points, E.SOUFFLE.DUREE)
		assert(largeurFin < largeurDebut)
		for t = 0, 25, 0.1 do
			local centre, largeur = E.bandeSouffle(points, t)
			assert(centre - largeur / 2 >= 0 and centre + largeur / 2 <= 1, `bande hors jauge à t = {t}`)
		end
	end
end)

H.test("la jauge monte en appuyant, descend en relâchant, reste entre 0 et 1", function()
	assert(E.jaugeSouffle(0.5, true, 0.1) > 0.5)
	assert(E.jaugeSouffle(0.5, false, 0.1) < 0.5)
	assert(E.jaugeSouffle(0.99, true, 10) == 1)
	assert(E.jaugeSouffle(0.01, false, 10) == 0)
end)

H.test("un joueur qui suit bien la bande peut avoir 100", function()
	-- Un pilote automatique : appuie quand la jauge est sous le centre
	for _, g in GRAINES do
		local points = E.sequenceSouffle(g)
		local niveau, dans, dt = 0.5, 0, 1 / 60
		for i = 1, E.SOUFFLE.DUREE / dt do
			local t = i * dt
			local centre, largeur = E.bandeSouffle(points, t)
			niveau = E.jaugeSouffle(niveau, niveau < centre, dt)
			if math.abs(niveau - centre) <= largeur / 2 then
				dans += dt
			end
		end
		assert(E.noteSouffle(dans, E.SOUFFLE.DUREE) >= 90, `graine {g} : {E.noteSouffle(dans, E.SOUFFLE.DUREE)}`)
	end
	assert(E.noteSouffle(0, 20) == 0 and E.noteSouffle(30, 20) == 100 and E.noteSouffle(5, 0) == 0)
end)

print("Puissance")

H.test("départs imprévisibles, faux départ pénalisé, cadence plafonnée", function()
	for _, g in GRAINES do
		for _, a in E.sequencePuissance(g) do
			assert(a >= 1.5 and a <= 4)
		end
	end
	local bon = { reaction = 0.15, appuis = 45 }
	assert(E.notePuissance({ bon, bon, bon }) == 100)
	local faux = { reaction = nil, appuis = 45 }
	assert(E.notePuissance({ faux, faux, faux }) == 60, "faux départ : la réaction ne compte pas")
	local anticipe = { reaction = 0.02, appuis = 45 }
	assert(E.notePuissance({ anticipe, bon, bon }) < 100, "réaction surhumaine acceptée")
	local robot = { reaction = 0.15, appuis = 10000 }
	assert(E.notePuissance({ robot, robot, robot }) == 100, "plafond")
	assert(E.notePuissance({}) == 0)
	assert(E.notePuissance({ { reaction = "vite", appuis = "beaucoup" } }) == 0)
end)

print("Cœur")

H.test("les battements se rapprochent pendant 20 s", function()
	for _, g in GRAINES do
		local b = E.sequenceCoeur(g)
		assert(#b >= 25 and #b <= 45, `{#b} battements`)
		assert(b[1] >= E.COEUR.APPROCHE, "le premier anneau n'a pas le temps d'arriver")
		assert(b[#b] < E.COEUR.DUREE)
		local debut = b[2] - b[1]
		local fin = b[#b] - b[#b - 1]
		assert(fin < debut, "le rythme n'accélère pas")
		for i = 2, #b do
			assert(b[i] - b[i - 1] >= 0.35, "deux battements trop proches")
		end
	end
end)

H.test("jugement des appuis et jauge de courage", function()
	assert(select(1, E.jugerBattement(0)) == 1)
	assert(select(1, E.jugerBattement(-0.1)) == 0.6)
	assert(select(1, E.jugerBattement(0.2)) == 0.3)
	assert(select(1, E.jugerBattement(0.5)) == 0)
	assert(E.courage(1, 1) == 1 and E.courage(0.5, 0) == 0.35 and E.courage(0.05, 0) == 0)
end)

H.test("note de cœur : justesse, appuis au hasard pénalisés", function()
	local tous = {}
	for i = 1, 30 do
		tous[i] = 1
	end
	assert(E.noteCoeur(tous, 30, 0, 1) == 100)
	assert(E.noteCoeur(tous, 30, 60, 1) == 0, "taper sans arrêt ne paie pas")
	assert(E.noteCoeur({}, 30, 0, 0) == 0)
	assert(E.noteCoeur(tous, 0, 0, 1) == 0)
	assert(E.noteCoeur(tous, 30, 0, 0) == 85, "le courage compte pour 15 %")
end)

print("Instinct")

H.test("chaque situation a exactement un couloir libre", function()
	for _, g in GRAINES do
		local s = E.sequenceInstinct(g)
		assert(#s == E.INSTINCT.QUESTIONS)
		for _, sit in s do
			local libres = 0
			for c = 1, E.INSTINCT.COULOIRS do
				if E.couloirLibre(sit, c) then
					libres += 1
					assert(c == sit.libre)
				end
			end
			assert(libres == 1)
			assert(sit.limite >= 1.8 and sit.limite <= 3)
		end
	end
end)

H.test("note d'instinct : juste et vite", function()
	local s = E.sequenceInstinct(5)
	local vite, lent, faux = {}, {}, {}
	for i = 1, 10 do
		vite[i] = { juste = true, temps = 0 }
		lent[i] = { juste = true, temps = s[i].limite }
		faux[i] = { juste = false, temps = 0.2 }
	end
	assert(E.noteInstinct(vite, s) == 100)
	assert(E.noteInstinct(lent, s) == 50)
	assert(E.noteInstinct(faux, s) == 0)
	assert(E.noteInstinct({}, s) == 0)
	assert(E.noteInstinct({ { juste = true, temps = 99 } }, s) == 0, "réponse hors délai")
end)

print("Durées et récompenses")

H.test("durées plausibles : minimum < maximum, dans les 20 à 35 s annoncées", function()
	for _, id in E.ORDRE do
		for _, g in GRAINES do
			local mini, maxi = E.dureeMinimale(id, g), E.dureeMaximale(id, g)
			assert(mini > 3 and mini <= maxi, `{id} : {mini} / {maxi}`)
			assert(maxi <= 36, `{id} trop long : {maxi}`)
		end
	end
	assert(E.dureeMinimale("inconnu", 1) == 0)
end)

H.test("plein tarif pour les 10 premiers entraînements du jour", function()
	assert(E.tarif(0) == 1 and E.tarif(9) == 1)
	assert(E.tarif(10) == E.TARIF_REDUIT and E.tarif(500) == E.TARIF_REDUIT)
	assert(E.jour(0) == 0 and E.jour(86399) == 0 and E.jour(86400) == 1)
end)

H.test("gain de carrière : entre ~8 et ~40, plus faible épuisée ou morose", function()
	local normal = E.gain("vitesse", 1, 3, 100)
	assert(normal >= 30 and normal <= 40, `normal {normal}`)
	assert(E.gain("vitesse", 0, 3, 100) == 8)
	assert(E.gain("vitesse", 1, 5, 100) > normal, "l'humeur au top ne compte pas")
	assert(E.gain("vitesse", 1, 1, 100) < normal, "l'humeur au plus bas ne compte pas")
	assert(E.gain("vitesse", 1, 3, 10) < normal, "l'énergie basse ne compte pas")
	assert(E.gain("vitesse", 1, 5, 100) <= 45)
	for _, entree in { { 0 / 0, 3, 50 }, { -4, -9, -100 }, { 9, 99, 1000 } } do
		local g = E.gain("souffle", entree[1], entree[2], entree[3])
		assert(g >= 1 and g <= 45, `entrée absurde : {g}`)
	end
end)

if not H.bilan() then
	error("des tests ont échoué")
end
