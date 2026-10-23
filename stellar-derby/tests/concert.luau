--!nocheck
-- Tests du concert de la victoire. Depuis stellar-derby/ :  lune run tests/concert

local H = require("./harnais")

local Partage = H.partage()
local Concert = H.require(Partage.Jeu.Concert)
local Economie = H.require(Partage.Jeu.Economie)

print("Chansons")

H.test("au moins 3 chansons, noms originaux, tempo plausible", function()
	assert(#Concert.CHANSONS >= 3)
	local vus = {}
	for _, c in Concert.CHANSONS do
		assert(not vus[c.id], c.id)
		vus[c.id] = true
		assert(#c.nom > 0 and c.tempo >= 60 and c.tempo <= 200)
		assert(c.son == "" or string.match(c.son, "^rbxassetid://%d+$"), c.son)
		assert(not string.find(string.lower(c.nom), "winning", 1, true))
	end
	assert(Concert.chanson("galop").id == "galop")
	assert(Concert.chanson("inconnue").id == Concert.CHANSONS[1].id)
end)

print("Partition")

H.test("la partition est déterministe, jouable et tient dans la chanson", function()
	for _, g in { 1, 2, 99, 123456 } do
		for _, c in Concert.CHANSONS do
			local a, b = Concert.partition(g, c.tempo, Concert.DUREE), Concert.partition(g, c.tempo, Concert.DUREE)
			assert(#a == #b and #a >= 25, `{#a} notes`)
			for i, n in a do
				assert(n.t == b[i].t and n.colonne == b[i].colonne)
				assert(n.colonne >= 1 and n.colonne <= Concert.COLONNES)
				assert(n.t >= Concert.CHUTE * 0.9 and n.t < Concert.DUREE, "note hors de la chanson")
				if i > 1 then
					assert(n.t - a[i - 1].t >= Concert.ECART_MIN - 1e-9, "notes trop rapprochées")
				end
				if i > 2 then
					assert(
						not (n.colonne == a[i - 1].colonne and n.colonne == a[i - 2].colonne),
						"3 fois la même colonne"
					)
				end
			end
		end
	end
end)

H.test("la difficulté monte : plus de notes à la fin qu'au début", function()
	local notes = Concert.partition(7, 124, Concert.DUREE)
	local debut, fin = 0, 0
	for _, n in notes do
		if n.t < Concert.DUREE / 3 then
			debut += 1
		elseif n.t > 2 * Concert.DUREE / 3 then
			fin += 1
		end
	end
	assert(fin > debut * 1.5, `{debut} au début, {fin} à la fin`)
end)

print("Jugement et note")

H.test("parfait, bien, raté", function()
	assert(select(1, Concert.juger(0)) == 1 and select(2, Concert.juger(0.05)) == "Parfait")
	assert(select(1, Concert.juger(-0.1)) == 0.6)
	assert(select(1, Concert.juger(0.3)) == 0)
end)

H.test("la note : de 0 à 100, bornée quelles que soient les valeurs", function()
	assert(Concert.note({ 1, 1, 1, 1 }, 4) == 100)
	assert(Concert.note({ 1, 0.6, 0, 1 }, 4) == 65)
	assert(Concert.note({}, 10) == 0 and Concert.note({ 1 }, 0) == 0)
	assert(Concert.note({ 5, 9, 0 / 0, -3 }, 4) == 50, "valeurs absurdes")
	assert(Concert.note({ 1, 1, 1, 1, 1, 1 }, 3) == 100, "plus de valeurs que de notes")
end)

print("Ambiance")

H.test("une ovation compte au plus 3 fois par seconde et par spectateur", function()
	local recentes = {}
	local comptees = 0
	for i = 0, 59 do
		if Concert.compte(recentes, i * 0.1) then
			comptees += 1
		end
	end
	assert(comptees >= 17 and comptees <= 19, `{comptees} ovations comptées en 6 s`)
end)

-- L'ambiance au bout de la chanson, si `actifs` spectateurs sur `public`
-- tapent à 6 par seconde (le maximum accepté).
local function salle(actifs: number, public: number): number
	local a = 0
	local recentes = {}
	for i = 1, actifs do
		recentes[i] = {}
	end
	local dt = 0.25
	for pas = 1, Concert.DUREE / dt do
		local t = pas * dt
		local ovations = 0
		for i = 1, actifs do
			for k = 0, 1 do
				if Concert.compte(recentes[i], t + k * 0.125) then
					ovations += 1
				end
			end
		end
		a = Concert.ambiance(a, ovations, public, dt)
	end
	return a
end

H.test("toute la salle qui joue remplit la jauge", function()
	assert(salle(10, 10) >= 0.95, `{salle(10, 10)}`)
	assert(salle(1, 1) >= 0.95, "un spectateur seul ne remplit pas")
end)

H.test("un seul tapoteur dans une grande salle ne fait presque rien", function()
	assert(salle(1, 10) <= 0.1, `{salle(1, 10)}`)
	local moitie = salle(5, 10)
	assert(moitie > 0.3 and moitie < salle(10, 10), `moitié de la salle : {moitie}`)
end)

H.test("l'ambiance retombe quand personne ne bouge, et reste entre 0 et 1", function()
	assert(Concert.ambiance(0.5, 0, 10, 1) < 0.5)
	assert(Concert.ambiance(0.99, 1000, 1, 1) == 1)
	assert(Concert.ambiance(0.01, -5, 1, 100) == 0)
	assert(Concert.ambianceSansPublic({ 1, 1 }) > Concert.ambianceSansPublic({ 0, 0 }))
	assert(Concert.ambianceSansPublic({}) > 0)
end)

H.test("les gains du concert : la scène et l'ambiance rapportent plus", function()
	local scene = Economie.recompenseConcert(0.8, true, 0.5)
	local fosse = Economie.recompenseConcert(0.8, false, 0.5)
	assert(scene.etoiles > fosse.etoiles)
	assert(Economie.recompenseConcert(0.8, false, 1).etoiles > fosse.etoiles)
end)

if not H.bilan() then
	error("des tests ont échoué")
end
