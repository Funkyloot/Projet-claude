--!nocheck
-- Équilibrage — simule des centaines de courses et mesure qui gagne.
--
--     lune run tests/equilibrage [courses par distance] [--ecrire]
--
-- Avec --ecrire, le rapport est enregistré dans docs/EQUILIBRAGE.md.
--
-- Ce qu'on vérifie :
--   * chaque stratégie gagne à peu près sa part (indice 1,0 = sa juste part) ;
--   * le numéro de stalle ne décide pas de la course ;
--   * les profils joueurs se valent quand ils sont bien joués ;
--   * une joueuse qui ne touche à rien fait moins bien qu'un bot, sans être
--     ridicule : les commandes doivent compter, sans rendre le jeu punitif.

local fs = require("@lune/fs")
local process = require("@lune/process")
local H = require("./harnais")

local Partage = H.partage()
local Course = Partage.Course
local Piste = H.require(Course.Piste)
local Courses = H.require(Course.Courses)
local Peloton = H.require(Course.Peloton)
local Simulation = H.require(Course.Simulation)
local Strategies = H.require(Course.Strategies)
local Aleatoire = H.require(Course.Aleatoire)
local Config = H.require(Partage.Config)

local N = tonumber(process.args[1]) or 300
local ECRIRE = table.find(process.args, "--ecrire") ~= nil
local PAS = 1 / Config.FREQUENCE_SIMULATION
local TAILLE = Config.TAILLE_PELOTON

local piste = Piste.stade(Config.LIGNE_DROITE, Config.RAYON_VIRAGE, Config.LARGEUR_PISTE, Config.POSITION_ARRIVEE)

local lignes = {}
local function sortie(texte: string)
	print(texte)
	table.insert(lignes, texte)
end

local function courir(sim)
	while not sim.termine do
		sim:pas(PAS)
	end
end

local function pct(x: number): string
	return string.format("%.0f %%", 100 * x)
end

local debut = os.clock()

sortie("# Rapport d'équilibrage")
sortie("")
sortie(`{N} courses par distance, {TAILLE} partantes, bots uniquement sauf mention contraire.`)
sortie("Généré par `lune run tests/equilibrage {N} --ecrire`.")
sortie("")
sortie("**Indice** = victoires observées ÷ victoires attendues si tout le monde se valait.")
sortie("1,00 = juste part ; au-dessus, la stratégie est avantagée.")

-- ─────────────── 1. Stratégies et stalles, par distance ───────────────

for _, course in Courses.liste do
	local victoires, partants, podiums, sommeRangs = {}, {}, {}, {}
	for _, id in Strategies.ordre do
		victoires[id], partants[id], podiums[id], sommeRangs[id] = 0, 0, 0, 0
	end
	local rangParStalle = {}
	for i = 1, TAILLE do
		rangParStalle[i] = 0
	end
	local epuisees, photoFinish, sommeTempsVainqueur, ecartsSerres = 0, 0, 0, 0
	local sommeSprint, nbSprint = 0, 0

	for graine = 1, N do
		local defs = Peloton.completer({}, TAILLE, Aleatoire.nouveau(graine * 7919))
		local sim = Simulation.nouvelle(piste, course, defs, graine, 0)
		local debutSprint = {}
		while not sim.termine do
			for _, e in sim:pas(PAS) do
				if e.genre == "sprint" then
					debutSprint[e.id] = sim:restant(sim.coureuses[e.id])
				elseif e.genre == "epuisee" then
					epuisees += 1
				end
			end
		end
		if sim.photoFinish then
			photoFinish += 1
		end
		local res = sim:resultats()
		sommeTempsVainqueur += res[1].temps
		if res[2].ecart == "Nez" or res[2].ecart == "Tête" or res[2].ecart == "Encolure" then
			ecartsSerres += 1
		end
		for _, r in res do
			partants[r.strategie] += 1
			sommeRangs[r.strategie] += r.rang
			rangParStalle[r.numero] += r.rang
			if r.rang == 1 then
				victoires[r.strategie] += 1
			end
			if r.rang <= 3 then
				podiums[r.strategie] += 1
			end
		end
		for _, restant in debutSprint do
			sommeSprint += restant
			nbSprint += 1
		end
	end

	sortie("")
	sortie(`## {course.nom} — {course.distance} m ({course.categorie}, terrain {course.etat})`)
	sortie("")
	sortie("| Stratégie | Partantes | Victoires | Indice | Podiums | Rang moyen |")
	sortie("|---|---:|---:|---:|---:|---:|")
	for _, id in Strategies.ordre do
		local attendu = partants[id] / TAILLE
		local indice = if attendu > 0 then victoires[id] / attendu else 0
		sortie(
			string.format(
				"| %s %s | %d | %d | %.2f | %s | %.1f |",
				Strategies.parId[id].icone,
				Strategies.parId[id].nom,
				partants[id],
				victoires[id],
				indice,
				pct(podiums[id] / math.max(1, partants[id])),
				sommeRangs[id] / math.max(1, partants[id])
			)
		)
	end
	sortie("")
	local stalles = {}
	for i = 1, TAILLE do
		table.insert(stalles, string.format("%d : %.1f", i, rangParStalle[i] / N))
	end
	sortie(`Rang moyen par numéro de stalle (6,5 = neutre) : {table.concat(stalles, " · ")}`)
	sortie("")
	sortie(
		string.format(
			"Temps moyen du vainqueur %.1f s · photo-finish %s · arrivées serrées (≤ encolure) %s · "
				.. "coureuses à bout %.1f par course · sprint lancé à %.0f m de l'arrivée en moyenne",
			sommeTempsVainqueur / N,
			pct(photoFinish / N),
			pct(ecartsSerres / N),
			epuisees / N,
			sommeSprint / math.max(1, nbSprint)
		)
	)
end

-- ─────────────── 2. Profils joueurs, joués par l'IA ───────────────
-- Une coureuse au profil fixe, pilotée par l'IA, dans un peloton de bots.

sortie("")
sortie("## Profils joueurs (pilotés par l'IA)")
sortie("")
sortie("Une coureuse au profil donné, stratégie tirée au hasard, face à 11 bots, toutes distances.")
sortie("")
sortie("| Profil | Courses | Victoires | Indice | Rang moyen |")
sortie("|---|---:|---:|---:|---:|")

local function essai(profil, controle: string, n: number): (number, number)
	local victoires, sommeRangs = 0, 0
	for graine = 1, n do
		local rng = Aleatoire.nouveau(graine * 104729)
		local course = Courses.liste[(graine % #Courses.liste) + 1]
		local strategie = rng:choisir(Strategies.ordre)
		local joueuse = {
			nom = "Essai",
			strategie = strategie,
			stats = profil.stats,
			competences = Peloton.competencesPour(strategie, rng),
			controle = controle,
		}
		local sim = Simulation.nouvelle(piste, course, Peloton.completer({ joueuse }, TAILLE, rng), graine, 0)
		courir(sim)
		local rang = sim.coureuses[1].rang
		sommeRangs += rang
		if rang == 1 then
			victoires += 1
		end
	end
	return victoires, sommeRangs
end

local nProfils = N * 2
for _, profil in Peloton.profils do
	local victoires, sommeRangs = essai(profil, "ia", nProfils)
	sortie(
		string.format(
			"| %s | %d | %d | %.2f | %.1f |",
			profil.nom,
			nProfils,
			victoires,
			victoires / (nProfils / TAILLE),
			sommeRangs / nProfils
		)
	)
end

-- ─────────────── 3. La joueuse qui ne touche à rien ───────────────

sortie("")
sortie("## Joueuse passive")
sortie("")
sortie(
	"Profil Équilibrée, aucune commande : rythme normal, la coureuse regagne seule la corde, "
		.. "et sprinte d'elle-même 4 s après que le sprint est devenu tenable."
)
sortie("")
local victoires, sommeRangs = essai(Peloton.profil("equilibree"), "joueur", nProfils)
sortie(
	string.format(
		"%d courses : %d victoires (indice %.2f), rang moyen %.1f.",
		nProfils,
		victoires,
		victoires / (nProfils / TAILLE),
		sommeRangs / nProfils
	)
)

sortie("")
sortie(string.format("_Calculé en %.0f s._", os.clock() - debut))

if ECRIRE then
	fs.writeFile("docs/EQUILIBRAGE.md", table.concat(lignes, "\n") .. "\n")
	print("\n→ docs/EQUILIBRAGE.md")
end
