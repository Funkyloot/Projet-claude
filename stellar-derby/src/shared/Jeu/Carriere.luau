--!strict
-- Carriere — le roguelite de l'Académie : former une coureuse pendant trois
-- années condensées, puis la voir devenir une Légende.
--
-- Pur et sérialisable en JSON : la carrière en cours vit dans d.carriere, et
-- chaque fonction ici la modifie sur place (le serveur l'appelle dans
-- Profils.modifier). Rien ne dépend de l'heure ni d'un hasard caché : les
-- tirages (blessure, humeur, événements) sortent de la graine de la carrière
-- et du numéro du tour. Rejouer un tour ne change donc rien.
--
-- Le déroulé : 3 années de 8 tours, puis la finale (tour 25). À chaque tour
-- on s'entraîne (un mini-jeu), on se repose ou on sort. Certains tours sont
-- des courses-objectifs : rater l'objectif termine la carrière, sauf la
-- première fois (la coureuse est repêchée). La carrière finie devient une
-- Légende, notée selon ses stats et ses résultats.
--
-- Les bonus de stats n'existent qu'ici, contre l'IA : une course libre reste
-- égale pour toutes.

local Partage = script.Parent.Parent
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Competences = require(Partage:WaitForChild("Course"):WaitForChild("Competences"))
local Peloton = require(Partage:WaitForChild("Course"):WaitForChild("Peloton"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))
local Entrainement = require(script.Parent:WaitForChild("Entrainement"))
local Evenements = require(script.Parent:WaitForChild("Evenements"))

export type Stats = {
	vitesse: number,
	souffle: number,
	puissance: number,
	coeur: number,
	instinct: number,
}

export type Resultat = {
	tour: number,
	course: string,
	rang: number,
	place: number, -- place qu'il fallait atteindre
	reussi: boolean,
}

export type Carriere = {
	version: number,
	nom: string,
	robe: string,
	strategie: string,
	profil: string,
	stats: Stats,
	energie: number, -- 0 à 100
	humeur: number, -- 1 (au plus bas) à 5 (au top)
	tour: number, -- 1 à 25
	competences: { string }, -- compétences générales apprises (la signature vient de la stratégie)
	evenement: string?, -- carte en attente d'un choix
	vus: { string }, -- cartes déjà tombées (pour varier)
	resultats: { Resultat },
	victoires: number,
	joker: boolean, -- le repêchage est encore disponible
	rivale: { nom: string, strategie: string, apparence: number },
	rivaleBattue: boolean, -- en finale
	graine: number,
	inspirations: { string }, -- identifiants des Légendes choisies comme inspirations
	finie: boolean,
	fin: string, -- "" en cours, "terminee" (finale courue) ou "objectif" (objectif raté)
	journal: { string }, -- les derniers événements, pour le tableau de bord
	debut: number, -- os.time() à la création
}

export type Objectif = {
	tour: number,
	course: string, -- identifiant de la course (Course/Courses)
	place: number, -- 1 = il faut gagner
	totalBots: number, -- total de stats des bots du peloton
}

-- Ce qu'une action a donné, pour l'interface.
export type Bilan = {
	messages: { string },
	stat: string?,
	gain: number?,
	lie: string?,
	gainLie: number?,
	blessure: boolean?,
	evenement: string?,
}

local Carriere = {}

Carriere.VERSION = 1
Carriere.STATS = { "vitesse", "souffle", "puissance", "coeur", "instinct" }
Carriere.HUMEURS = { "Au plus bas", "Morose", "Normale", "Bien", "Au top" }
Carriere.ICONES_HUMEUR = { "😣", "😕", "🙂", "😊", "🤩" }

-- Six de ces noms sont proposés à la création (pas de texte libre : rien à filtrer).
Carriere.NOMS = {
	"Aube Claire",
	"Plume de Vent",
	"Lumière d'Été",
	"Douce Tempête",
	"Céleste Envol",
	"Rubis Ardent",
	"Brume Légère",
	"Saphir Rieur",
	"Écho des Prés",
	"Myrtille Vive",
	"Opale Sereine",
	"Clé des Champs",
}

Carriere.TOURS_PAR_ANNEE = 8
Carriere.TOUR_FINALE = 25
Carriere.TOTAL_DEPART = 2000
Carriere.PART_HERITAGE = 0.05 -- part des stats d'une Légende transmise en inspiration
Carriere.HERITAGE_MAX = 250
Carriere.MAX_INSPIRATIONS = 2
Carriere.MAX_COMPETENCES = 3
Carriere.STAT_MIN = 1
Carriere.STAT_MAX = 1200
Carriere.MAX_JOURNAL = 6
Carriere.MAX_VUS = 40

-- Ce que coûte chaque entraînement en énergie (l'étude fatigue moins).
Carriere.COUT_ENERGIE = { vitesse = 20, souffle = 20, puissance = 20, coeur = 20, instinct = 10 }
-- L'entraînement d'une stat fait aussi progresser sa voisine, de moitié.
Carriere.LIEE =
	{ vitesse = "puissance", souffle = "coeur", puissance = "vitesse", coeur = "souffle", instinct = "vitesse" }
Carriere.REPOS = 50
Carriere.SORTIE_ENERGIE = 10
Carriere.FATIGUE_COURSE = 15
Carriere.SEUIL_BLESSURE = 40 -- en dessous, s'entraîner peut blesser
Carriere.CHANCE_EVENEMENT = { entrainement = 0.2, sortie = 0.65, repos = 0.1 }
Carriere.CHANCE_COUP_DE_MOU = 0.1 -- l'humeur baisse d'un cran après un entraînement
Carriere.BONUS_OBJECTIF = 10 -- à chaque stat, objectif atteint
Carriere.BONUS_VICTOIRE = 20 -- à chaque stat, course gagnée

-- Le calendrier des courses-objectifs : les trois hippodromes, toutes les
-- distances. Les totaux des bots sont réglés par simulation, course par
-- course (certaines pistes sont plus imprévisibles que d'autres) : sur 64
-- carrières bien menées jouées par l'IA, 3 sur 4 atteignent la finale et
-- un peu plus de la moitié la gagnent ; une carrière bâclée la gagne
-- rarement. Le test tests/carriere le revérifie à plus petite échelle.
Carriere.OBJECTIFS = {
	{ tour = 4, course = "alizes", place = 5, totalBots = 1750 },
	{ tour = 8, course = "coquillages", place = 5, totalBots = 1850 },
	{ tour = 12, course = "vent", place = 3, totalBots = 1950 },
	{ tour = 16, course = "baie", place = 3, totalBots = 1800 },
	{ tour = 20, course = "cimes", place = 3, totalBots = 2200 },
	{ tour = 24, course = "phare", place = 3, totalBots = 2100 },
	{ tour = 25, course = "archipel", place = 1, totalBots = 2800 },
} :: { Objectif }
Carriere.BONUS_RIVALE = 150 -- la rivale a un peu plus que le peloton

local objectifsParTour: { [number]: Objectif } = {}
for _, o in Carriere.OBJECTIFS do
	objectifsParTour[o.tour] = o
end

-- ─────────────────────────────── Outils ───────────────────────────────

local function arrondir(x: number): number
	return math.floor(x + 0.5)
end

local function nombre(x: unknown, defaut: number, min: number, max: number): number
	if type(x) ~= "number" or x ~= x then
		return defaut
	end
	return math.clamp(x, min, max)
end

local function total(s: Stats): number
	return s.vitesse + s.souffle + s.puissance + s.coeur + s.instinct
end
Carriere.total = total

local function ajouterStat(c: Carriere, stat: string, n: number)
	local s = c.stats :: any
	s[stat] = math.clamp(arrondir(s[stat] + n), Carriere.STAT_MIN, Carriere.STAT_MAX)
end

local function changerHumeur(c: Carriere, delta: number)
	c.humeur = math.clamp(c.humeur + delta, 1, 5)
end

local function changerEnergie(c: Carriere, delta: number)
	c.energie = math.clamp(arrondir(c.energie + delta), 0, 100)
end

local function noter(c: Carriere, bilan: Bilan, message: string)
	table.insert(bilan.messages, message)
	table.insert(c.journal, message)
	while #c.journal > Carriere.MAX_JOURNAL do
		table.remove(c.journal, 1)
	end
end

-- Un tirage propre à ce tour et à cet usage : rejouer ne change rien.
local function hasard(c: Carriere, sel: number): Aleatoire.Aleatoire
	return Aleatoire.nouveau(c.graine * 7 + c.tour * 7919 + sel * 104729)
end

local function estStat(stat: unknown): boolean
	return type(stat) == "string" and table.find(Carriere.STATS, stat) ~= nil
end

function Carriere.nomHumeur(humeur: number): string
	return Carriere.HUMEURS[math.clamp(math.floor(humeur), 1, 5)]
end

function Carriere.annee(tour: number): number
	return math.clamp(math.ceil(tour / Carriere.TOURS_PAR_ANNEE), 1, 3)
end

-- « Année 2 · Tour 3/8 », ou « Finale ».
function Carriere.libelleTour(tour: number): string
	if tour >= Carriere.TOUR_FINALE then
		return "Finale"
	end
	local dansAnnee = (tour - 1) % Carriere.TOURS_PAR_ANNEE + 1
	return `Année {Carriere.annee(tour)} · Tour {dansAnnee}/{Carriere.TOURS_PAR_ANNEE}`
end

function Carriere.objectifDuTour(tour: number): Objectif?
	return objectifsParTour[tour]
end

-- Le prochain objectif (celui du tour en cours compris).
function Carriere.prochainObjectif(c: Carriere): Objectif?
	for _, o in Carriere.OBJECTIFS do
		if o.tour >= c.tour then
			return o
		end
	end
	return nil
end

-- « Top 3 », « Victoire ».
function Carriere.libellePlace(place: number): string
	return if place == 1 then "Victoire" else `Top {place}`
end

-- Ce que le joueur doit faire maintenant : "evenement", "course", "action" ou "finie".
function Carriere.attente(c: Carriere): string
	if c.finie then
		return "finie"
	elseif c.evenement then
		return "evenement"
	elseif Carriere.objectifDuTour(c.tour) then
		return "course"
	end
	return "action"
end

-- ─────────────────────────────── Création ───────────────────────────────

-- Le profil de départ, ramené au total de départ de la carrière.
function Carriere.statsDepart(profil: string): Stats
	local p = Peloton.profil(profil)
	local echelle = Carriere.TOTAL_DEPART / total(p.stats)
	local s = {} :: any
	local somme = 0
	for _, id in Carriere.STATS do
		s[id] = arrondir((p.stats :: any)[id] * echelle)
		somme += s[id]
	end
	s.vitesse += Carriere.TOTAL_DEPART - somme
	return s :: Stats
end

-- Le bonus de départ des Légendes choisies en inspiration (plafonné).
function Carriere.heritage(legendes: { any }, ids: { string }): Stats
	local bonus = { vitesse = 0, souffle = 0, puissance = 0, coeur = 0, instinct = 0 } :: any
	for _, id in ids do
		for _, l in legendes do
			if l.id == id then
				for _, stat in Carriere.STATS do
					bonus[stat] += math.floor((tonumber(l.stats[stat]) or 0) * Carriere.PART_HERITAGE)
				end
				break
			end
		end
	end
	local somme = total(bonus)
	if somme > Carriere.HERITAGE_MAX then
		local echelle = Carriere.HERITAGE_MAX / somme
		for _, stat in Carriere.STATS do
			bonus[stat] = math.floor(bonus[stat] * echelle)
		end
	end
	return bonus :: Stats
end

-- Crée une carrière. `params` vient du client (tout est vérifié) ; `d` est la
-- sauvegarde du joueur (robes possédées, Légendes). Renvoie la carrière, ou
-- nil et un message d'erreur.
function Carriere.nouvelle(params: any, d: any, graine: number, heure: number): (Carriere?, string?)
	if type(params) ~= "table" then
		return nil, "Paramètres invalides."
	end
	local nom = params.nom
	if type(nom) ~= "string" or not table.find(Carriere.NOMS, nom) then
		return nil, "Choisis un des noms proposés."
	end
	local robe = params.robe
	if type(robe) ~= "string" or d.possessions.robes[robe] ~= true then
		return nil, "Tu ne possèdes pas cette robe."
	end
	local strategie = params.strategie
	if type(strategie) ~= "string" or not Strategies.parId[strategie] then
		return nil, "Stratégie inconnue."
	end
	local profilValide = false
	for _, p in Peloton.profils do
		if p.id == params.profil then
			profilValide = true
		end
	end
	if not profilValide then
		return nil, "Profil inconnu."
	end
	local inspirations: { string } = {}
	local brutes = params.inspirations
	if brutes ~= nil then
		if type(brutes) ~= "table" or #brutes > Carriere.MAX_INSPIRATIONS then
			return nil, `Choisis au plus {Carriere.MAX_INSPIRATIONS} inspirations.`
		end
		for _, id in brutes do
			local connue = false
			for _, l in d.legendes do
				if l.id == id then
					connue = true
				end
			end
			if type(id) ~= "string" or not connue or table.find(inspirations, id) then
				return nil, "Inspiration invalide."
			end
			table.insert(inspirations, id)
		end
	end

	local stats = Carriere.statsDepart(params.profil)
	local bonus = Carriere.heritage(d.legendes, inspirations) :: any
	for _, stat in Carriere.STATS do
		(stats :: any)[stat] += bonus[stat]
	end

	local rng = Aleatoire.nouveau(graine)
	local c: Carriere = {
		version = Carriere.VERSION,
		nom = nom,
		robe = robe,
		strategie = strategie,
		profil = params.profil,
		stats = stats,
		energie = 100,
		humeur = 3,
		tour = 1,
		competences = {},
		evenement = nil,
		vus = {},
		resultats = {},
		victoires = 0,
		joker = true,
		rivale = {
			nom = rng:choisir(Peloton.NOMS),
			strategie = rng:choisir(Strategies.ordre),
			apparence = rng:entier(1, 1000000),
		},
		rivaleBattue = false,
		graine = math.floor(math.abs(graine)) % 2147483647,
		inspirations = inspirations,
		finie = false,
		fin = "",
		journal = {},
		debut = heure,
	}
	table.insert(c.journal, `{nom} fait ses premiers pas à l'Académie. Sa rivale : {c.rivale.nom}.`)
	return c, nil
end

-- ─────────────────────────────── Nettoyage ───────────────────────────────

local function listeDeChaines(brut: unknown, max: number, valide: ((string) -> boolean)?): { string }
	local liste: { string } = {}
	if type(brut) ~= "table" then
		return liste
	end
	for _, v in brut :: { any } do
		if #liste >= max then
			break
		end
		if type(v) == "string" and #v <= 200 and (not valide or valide(v)) then
			table.insert(liste, v)
		end
	end
	return liste
end

-- Valide une carrière lue de la sauvegarde ; nil si elle est irrécupérable.
function Carriere.nettoyer(brut: unknown): Carriere?
	if type(brut) ~= "table" then
		return nil
	end
	local b = brut :: any
	if type(b.nom) ~= "string" or type(b.strategie) ~= "string" or not Strategies.parId[b.strategie] then
		return nil
	end
	if type(b.stats) ~= "table" then
		return nil
	end
	local stats = {} :: any
	for _, stat in Carriere.STATS do
		stats[stat] = arrondir(nombre(b.stats[stat], 400, Carriere.STAT_MIN, Carriere.STAT_MAX))
	end
	local resultats: { Resultat } = {}
	if type(b.resultats) == "table" then
		for _, r in b.resultats do
			if type(r) == "table" and type(r.course) == "string" and #resultats < 10 then
				table.insert(resultats, {
					tour = nombre(r.tour, 1, 1, Carriere.TOUR_FINALE),
					course = r.course,
					rang = nombre(r.rang, 12, 1, 99),
					place = nombre(r.place, 3, 1, 99),
					reussi = r.reussi == true,
				})
			end
		end
	end
	local rivale = if type(b.rivale) == "table" then b.rivale else {}
	local apparence = nombre(rivale.apparence, 1, 1, 1000000)
	local evenement = if Evenements.parId(b.evenement) then b.evenement :: string else nil
	local graine = math.floor(nombre(b.graine, 1, 1, 2147483646))
	return {
		version = Carriere.VERSION,
		nom = string.sub(b.nom, 1, 40),
		robe = if type(b.robe) == "string" then string.sub(b.robe, 1, 40) else "bai",
		strategie = b.strategie,
		profil = if type(b.profil) == "string" then Peloton.profil(b.profil).id else "equilibree",
		stats = stats :: Stats,
		energie = arrondir(nombre(b.energie, 100, 0, 100)),
		humeur = math.floor(nombre(b.humeur, 3, 1, 5)),
		tour = math.floor(nombre(b.tour, 1, 1, Carriere.TOUR_FINALE)),
		competences = listeDeChaines(b.competences, Carriere.MAX_COMPETENCES, function(id)
			return Competences.existe(id) and table.find(Competences.generales, id) ~= nil
		end),
		evenement = evenement,
		vus = listeDeChaines(b.vus, Carriere.MAX_VUS),
		resultats = resultats,
		victoires = math.floor(nombre(b.victoires, 0, 0, 10)),
		joker = b.joker ~= false,
		rivale = {
			nom = if type(rivale.nom) == "string" then string.sub(rivale.nom, 1, 40) else Peloton.NOMS[1],
			strategie = if type(rivale.strategie) == "string" and Strategies.parId[rivale.strategie]
				then rivale.strategie
				else "vague",
			apparence = math.floor(apparence),
		},
		rivaleBattue = b.rivaleBattue == true,
		graine = graine,
		inspirations = listeDeChaines(b.inspirations, Carriere.MAX_INSPIRATIONS),
		finie = b.finie == true,
		fin = (if b.fin == "terminee" or b.fin == "objectif" then b.fin else "") :: string,
		journal = listeDeChaines(b.journal, Carriere.MAX_JOURNAL),
		debut = nombre(b.debut, 0, 0, 1e12),
	}
end

-- ─────────────────────────────── Événements ───────────────────────────────

local function tirerEvenement(c: Carriere, action: string, rng: Aleatoire.Aleatoire, bilan: Bilan)
	if rng:reel() >= (Carriere.CHANCE_EVENEMENT :: any)[action] then
		return
	end
	local possibles = Evenements.possibles(action)
	local neuves: { Evenements.Carte } = {}
	for _, carte in possibles do
		if not table.find(c.vus, carte.id) then
			table.insert(neuves, carte)
		end
	end
	local pool: { Evenements.Carte } = if #neuves > 0 then neuves else possibles
	local carte: Evenements.Carte = rng:choisir(pool)
	local id: string = carte.id
	c.evenement = id
	table.insert(c.vus, id)
	while #c.vus > Carriere.MAX_VUS do
		table.remove(c.vus, 1)
	end
	bilan.evenement = id
end

-- Applique les effets d'un choix d'événement.
function Carriere.appliquerEffets(c: Carriere, effets: Evenements.Effets, bilan: Bilan)
	if effets.tous then
		for _, stat in Carriere.STATS do
			ajouterStat(c, stat, effets.tous)
		end
	end
	local stats = effets.stats
	if stats then
		for stat, n in stats do
			if estStat(stat) then
				ajouterStat(c, stat, n)
			end
		end
	end
	if effets.energie then
		changerEnergie(c, effets.energie)
	end
	if effets.humeur then
		changerHumeur(c, effets.humeur)
	end
	local competence = effets.competence
	if competence and Competences.existe(competence) then
		local nom = Competences.parId[competence].nom
		if table.find(c.competences, competence) then
			-- Déjà apprise : on en tire tout de même une leçon
			ajouterStat(c, "instinct", 10)
			noter(c, bilan, `{nom} : déjà maîtrisée. Instinct +10.`)
		elseif #c.competences >= Carriere.MAX_COMPETENCES then
			ajouterStat(c, "instinct", 10)
			noter(c, bilan, `Plus de place pour {nom} : Instinct +10.`)
		else
			table.insert(c.competences, competence)
			noter(c, bilan, `Nouvelle compétence : {nom} !`)
		end
	end
end

-- ─────────────────────────────── Actions ───────────────────────────────

-- Vrai si l'on peut jouer un tour ordinaire (s'entraîner, se reposer, sortir).
function Carriere.peutAgir(c: Carriere): (boolean, string?)
	local attente = Carriere.attente(c)
	if attente == "finie" then
		return false, "Cette carrière est terminée."
	elseif attente == "evenement" then
		return false, "Réponds d'abord à l'événement."
	elseif attente == "course" then
		return false, "C'est le jour de la course-objectif !"
	end
	return true, nil
end

-- Un tour d'entraînement : `qualite` ∈ [0, 1] vient du mini-jeu.
function Carriere.entrainer(c: Carriere, stat: string, qualite: number): (Bilan?, string?)
	local ok, erreur = Carriere.peutAgir(c)
	if not ok then
		return nil, erreur
	end
	if not estStat(stat) then
		return nil, "Stat inconnue."
	end
	local bilan: Bilan = { messages = {}, stat = stat }
	local rng = hasard(c, 1)
	local nomStat = Evenements.NOMS_STATS[stat]
	-- Épuisée, on risque la blessure : le tour est perdu
	local risque = math.max(0, (Carriere.SEUIL_BLESSURE - c.energie) / 80)
	if rng:reel() < risque then
		bilan.blessure = true
		bilan.gain = 0
		changerHumeur(c, -1)
		changerEnergie(c, 10)
		noter(c, bilan, "Aïe ! Une petite blessure : ce tour est perdu. Pense à te reposer.")
	else
		local gain = Entrainement.gain(stat, qualite, c.humeur, c.energie)
		local lie = (Carriere.LIEE :: any)[stat] :: string
		local gainLie = math.floor(gain / 2)
		ajouterStat(c, stat, gain)
		ajouterStat(c, lie, gainLie)
		changerEnergie(c, -(Carriere.COUT_ENERGIE :: any)[stat])
		bilan.gain, bilan.lie, bilan.gainLie = gain, lie, gainLie
		noter(c, bilan, `Entraînement : {nomStat} +{gain}, {Evenements.NOMS_STATS[lie]} +{gainLie}.`)
		if rng:reel() < Carriere.CHANCE_COUP_DE_MOU then
			changerHumeur(c, -1)
			noter(c, bilan, "Un petit coup de mou après l'effort…")
		end
	end
	c.tour += 1
	tirerEvenement(c, "entrainement", rng, bilan)
	return bilan, nil
end

function Carriere.reposer(c: Carriere): (Bilan?, string?)
	local ok, erreur = Carriere.peutAgir(c)
	if not ok then
		return nil, erreur
	end
	local bilan: Bilan = { messages = {} }
	changerEnergie(c, Carriere.REPOS)
	noter(c, bilan, `Repos : énergie +{Carriere.REPOS}.`)
	local rng = hasard(c, 2)
	c.tour += 1
	tirerEvenement(c, "repos", rng, bilan)
	return bilan, nil
end

function Carriere.sortir(c: Carriere): (Bilan?, string?)
	local ok, erreur = Carriere.peutAgir(c)
	if not ok then
		return nil, erreur
	end
	local bilan: Bilan = { messages = {} }
	changerHumeur(c, 1)
	changerEnergie(c, Carriere.SORTIE_ENERGIE)
	noter(c, bilan, `Sortie : humeur « {Carriere.nomHumeur(c.humeur)} ».`)
	local rng = hasard(c, 3)
	c.tour += 1
	tirerEvenement(c, "sortie", rng, bilan)
	return bilan, nil
end

-- Répond à l'événement en attente (`index` : 1, 2 ou 3).
function Carriere.choisir(c: Carriere, index: unknown): (Bilan?, string?)
	local carte = Evenements.parId(c.evenement)
	if not carte then
		return nil, "Aucun événement en attente."
	end
	if type(index) ~= "number" or index ~= math.floor(index) or index < 1 or index > #carte.choix then
		return nil, "Choix invalide."
	end
	local choix = carte.choix[index]
	local bilan: Bilan = { messages = {} }
	c.evenement = nil
	noter(c, bilan, `{carte.titre} : {choix.texte}.`)
	Carriere.appliquerEffets(c, choix.effets, bilan)
	return bilan, nil
end

-- ─────────────────────────────── Courses ───────────────────────────────

-- La coureuse du joueur, telle qu'elle prend le départ.
function Carriere.definition(c: Carriere, userId: number?): Peloton.Definition
	local competences = { Strategies.obtenir(c.strategie).signature }
	for _, id in c.competences do
		table.insert(competences, id)
	end
	return {
		nom = c.nom,
		strategie = c.strategie,
		stats = table.clone(c.stats),
		competences = competences,
		controle = "joueur",
		userId = userId,
	}
end

-- La rivale, un peu au-dessus du peloton de cette course.
function Carriere.definitionRivale(c: Carriere, objectif: Objectif): Peloton.Definition
	local rng = Aleatoire.nouveau(c.rivale.apparence * 31 + objectif.tour)
	return {
		nom = c.rivale.nom,
		strategie = c.rivale.strategie,
		stats = Peloton.statsBot(rng, objectif.totalBots + Carriere.BONUS_RIVALE),
		competences = Peloton.competencesPour(c.rivale.strategie, rng),
		controle = "ia",
		apparence = c.rivale.apparence,
	}
end

-- Le résultat de la course-objectif du tour. `rangRivale` : la place de la
-- rivale (nil si on ne la connaît pas).
function Carriere.appliquerCourse(c: Carriere, rang: number, rangRivale: number?): (Bilan?, string?)
	local objectif = Carriere.objectifDuTour(c.tour)
	if c.finie or c.evenement or not objectif then
		return nil, "Pas de course-objectif à ce tour."
	end
	local course = Courses.parId(objectif.course)
	local nomCourse = if course then course.nom else objectif.course
	rang = math.max(1, math.floor(rang))
	local reussi = rang <= objectif.place
	local bilan: Bilan = { messages = {} }
	table.insert(c.resultats, {
		tour = objectif.tour,
		course = objectif.course,
		rang = rang,
		place = objectif.place,
		reussi = reussi,
	})
	if rang == 1 then
		c.victoires += 1
	end
	changerEnergie(c, -Carriere.FATIGUE_COURSE)

	if objectif.tour == Carriere.TOUR_FINALE then
		if rangRivale and rang < rangRivale then
			c.rivaleBattue = true
			noter(c, bilan, `{c.rivale.nom} est battue en finale !`)
		end
		noter(
			c,
			bilan,
			if rang == 1
				then `{nomCourse} : VICTOIRE ! {c.nom} entre dans la légende.`
				else `{nomCourse} : {rang}e place.`
		)
		c.finie = true
		c.fin = "terminee"
		return bilan, nil
	end

	if reussi then
		local bonus = if rang == 1 then Carriere.BONUS_VICTOIRE else Carriere.BONUS_OBJECTIF
		for _, stat in Carriere.STATS do
			ajouterStat(c, stat, bonus)
		end
		if rang == 1 then
			changerHumeur(c, 1)
		end
		noter(
			c,
			bilan,
			`{nomCourse} : {if rang == 1 then "victoire" else `{rang}e place`}, objectif atteint ! Toutes les stats +{bonus}.`
		)
		c.tour += 1
	elseif c.joker then
		c.joker = false
		changerHumeur(c, -1)
		noter(
			c,
			bilan,
			`{nomCourse} : {rang}e place… Objectif manqué, mais l'Académie te laisse une seconde chance !`
		)
		c.tour += 1
	else
		noter(c, bilan, `{nomCourse} : {rang}e place. L'objectif est manqué : la carrière s'arrête ici.`)
		c.finie = true
		c.fin = "objectif"
	end
	return bilan, nil
end

-- ─────────────────────────────── Fin de carrière ───────────────────────────────

function Carriere.objectifsReussis(c: Carriere): number
	local n = 0
	for _, r in c.resultats do
		if r.reussi then
			n += 1
		end
	end
	return n
end

function Carriere.finaleGagnee(c: Carriere): boolean
	for _, r in c.resultats do
		if r.tour == Carriere.TOUR_FINALE and r.rang == 1 then
			return true
		end
	end
	return false
end

-- La note de la Légende : ses stats, ses victoires, ses objectifs, la finale.
function Carriere.note(c: Carriere): number
	local note = total(c.stats)
	note += 300 * c.victoires
	note += 150 * Carriere.objectifsReussis(c)
	if Carriere.finaleGagnee(c) then
		note += 500
	end
	if c.rivaleBattue then
		note += 300
	end
	return arrondir(note)
end

local NOMS_PISTES = { archipel = "de l'Archipel", baie = "de la Baie", falaises = "des Falaises" }
local TITRES_CATEGORIE = {
	Sprint = "Étoile du sprint",
	Mile = "Flèche du mile",
	Moyenne = "Cœur de championne",
	Longue = "Reine des longues distances",
}

-- Le titre de la Légende, selon ce qu'elle a accompli.
function Carriere.titre(c: Carriere): string
	if Carriere.finaleGagnee(c) then
		local finale = Courses.parId(Carriere.OBJECTIFS[#Carriere.OBJECTIFS].course)
		return `Reine {NOMS_PISTES[finale and finale.piste or "archipel"] or "de l'Archipel"}`
	end
	-- Où et sur quelle distance elle a gagné le plus
	local parPiste: { [string]: number } = {}
	local parCategorie: { [string]: number } = {}
	for _, r in c.resultats do
		local course = Courses.parId(r.course)
		if r.rang == 1 and course then
			parPiste[course.piste] = (parPiste[course.piste] or 0) + 1
			parCategorie[course.categorie] = (parCategorie[course.categorie] or 0) + 1
		end
	end
	for piste, n in parPiste do
		if n >= 2 then
			return `Reine {NOMS_PISTES[piste] or ""}`
		end
	end
	local meilleure, meilleurNombre = nil :: string?, 0
	for _, categorie in Courses.CATEGORIES do
		local n = parCategorie[categorie] or 0
		if n > meilleurNombre then
			meilleure, meilleurNombre = categorie, n
		end
	end
	if meilleure then
		return TITRES_CATEGORIE[meilleure]
	end
	if c.tour >= Carriere.TOUR_FINALE then
		return "Finaliste de l'Archipel"
	elseif c.tour > 16 then
		return "Espoir confirmé"
	end
	return "Cœur vaillant"
end

-- La Légende qu'une carrière finie laisse derrière elle.
function Carriere.legende(c: Carriere, heure: number): { [string]: any }
	return {
		id = `l{math.floor(heure)}_{c.graine % 100000}`,
		nom = c.nom,
		robe = c.robe,
		stats = table.clone(c.stats),
		strategie = c.strategie,
		note = Carriere.note(c),
		titre = Carriere.titre(c),
		victoires = c.victoires,
		date = heure,
	}
end

-- Étoiles et XP de fin de carrière, selon la note.
function Carriere.recompense(note: number): { etoiles: number, xp: number }
	return {
		etoiles = math.clamp(math.floor(note / 15), 40, 400),
		xp = math.clamp(math.floor(note / 6), 80, 1000),
	}
end

-- Ajoute une Légende à la liste (au plus `max`) : si elle est pleine, la
-- nouvelle remplace la moins bien notée, à condition de faire mieux.
-- Renvoie vrai si elle a trouvé sa place.
function Carriere.ajouterLegende(legendes: { any }, legende: any, max: number): boolean
	if #legendes < max then
		table.insert(legendes, legende)
		return true
	end
	local pire, pireNote = nil :: number?, math.huge
	for i, l in legendes do
		if l.note < pireNote then
			pire, pireNote = i, l.note
		end
	end
	if pire and legende.note > pireNote then
		legendes[pire] = legende
		return true
	end
	return false
end

return Carriere
