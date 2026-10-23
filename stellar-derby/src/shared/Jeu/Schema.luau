--!strict
-- Schema — la forme de la sauvegarde d'un joueur, et sa remise en ordre.
--
-- Pur (aucune API Roblox) : testé hors de Roblox. Le serveur charge les
-- données du DataStore, les passe par Schema.migrer, et ne garde que ce qui
-- a la bonne forme. Une sauvegarde abîmée ou trop ancienne ne fait jamais
-- planter le jeu : chaque champ manquant ou faux reprend sa valeur par défaut.
--
-- Pour ajouter un champ : le déclarer dans Schema.nouveau(), et dans
-- nettoyer() si sa forme doit être vérifiée. Pour changer la forme d'un champ
-- existant : augmenter VERSION et écrire l'étape dans migrer().
--
-- Tout doit rester sérialisable en JSON : pas de tables mixtes, des clés de
-- dictionnaire en chaînes, pas de fonctions.

local Schema = {}

Schema.VERSION = 1

export type Stats = {
	vitesse: number,
	souffle: number,
	puissance: number,
	coeur: number,
	instinct: number,
}

export type Rivale = {
	cle: string, -- "u<userId>" pour une joueuse, "b:<nom>" pour une coureuse de l'IA
	nom: string,
	fois: number, -- nombre de fois qu'elle t'a battue d'une encolure ou moins
	battue: number, -- nombre de fois que tu l'as battue depuis
	derniere: number, -- heure (os.time) de la dernière rencontre
}

export type Legende = {
	id: string,
	nom: string,
	robe: string,
	stats: Stats,
	strategie: string,
	note: number, -- note finale de la carrière
	titre: string, -- titre gagné (« Reine des Falaises »…)
	victoires: number,
	date: number,
}

export type Donnees = {
	version: number,
	etoiles: number, -- la monnaie du jeu
	xp: number,
	equipement: {
		robe: string,
		tenue: string,
		baton: string, -- couleur du bâton lumineux au concert
		effet: string, -- effet des cinématiques de compétence
		titre: string, -- titre affiché sous le nom ("" = aucun)
	},
	possessions: {
		robes: { [string]: boolean },
		tenues: { [string]: boolean },
		batons: { [string]: boolean },
		effets: { [string]: boolean },
	},
	titres: { [string]: number }, -- titre → heure d'obtention
	stats: {
		courses: number,
		victoires: number,
		podiums: number,
		photoFinish: number,
		parStrategie: { [string]: { courses: number, victoires: number } },
		meilleursTemps: { [string]: number }, -- course → meilleur temps, en s
		entrainements: number,
		meilleursScores: { [string]: number }, -- mini-jeu → meilleur score
		concerts: number,
		concertsMeneuse: number, -- concerts où l'on était sur scène
		carrieres: number,
		duos: number, -- courses menées en duo avec une entraîneuse
	},
	rivales: { Rivale },
	carriere: { [string]: any }?, -- carrière en cours, gérée par Jeu/Carriere
	legendes: { Legende },
	tutoriel: { fini: boolean, etape: number },
	saison: { id: string, points: number },
	reglages: { musique: number, sons: number, cinematiques: boolean },
	achats: { string }, -- derniers achats en Robux déjà crédités (PurchaseId)
	creeLe: number,
	derniereVisite: number,
}

-- Ce qu'on offre à l'arrivée : trois robes, la tenue de l'Académie, un bâton
-- rose et l'effet d'étoiles. Le reste se gagne ou s'achète en étoiles.
function Schema.nouveau(): Donnees
	return {
		version = Schema.VERSION,
		etoiles = 300,
		xp = 0,
		equipement = {
			robe = "bai",
			tenue = "academie",
			baton = "rose",
			effet = "etoiles",
			titre = "",
		},
		possessions = {
			robes = { bai = true, noir = true, alezan = true },
			tenues = { academie = true },
			batons = { rose = true },
			effets = { etoiles = true },
		},
		titres = {},
		stats = {
			courses = 0,
			victoires = 0,
			podiums = 0,
			photoFinish = 0,
			parStrategie = {},
			meilleursTemps = {},
			entrainements = 0,
			meilleursScores = {},
			concerts = 0,
			concertsMeneuse = 0,
			carrieres = 0,
			duos = 0,
		},
		rivales = {},
		carriere = nil,
		legendes = {},
		tutoriel = { fini = false, etape = 0 },
		saison = { id = "", points = 0 },
		reglages = { musique = 0.35, sons = 1, cinematiques = true },
		achats = {},
		creeLe = 0,
		derniereVisite = 0,
	}
end

Schema.MAX_RIVALES = 12
Schema.MAX_LEGENDES = 30
Schema.MAX_ETOILES = 10 ^ 9
Schema.MAX_ACHATS = 50

-- ───────────────────────────── Nettoyage ─────────────────────────────

local function nombre(v: unknown, defaut: number, mini: number?, maxi: number?): number
	if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then
		return defaut
	end
	local n = v :: number
	if mini and n < mini then
		n = mini
	end
	if maxi and n > maxi then
		n = maxi
	end
	return n
end

local function chaine(v: unknown, defaut: string, longueurMax: number?): string
	if type(v) ~= "string" then
		return defaut
	end
	local s = v :: string
	if longueurMax and #s > longueurMax then
		return string.sub(s, 1, longueurMax)
	end
	return s
end

local function booleen(v: unknown, defaut: boolean): boolean
	if type(v) == "boolean" then
		return v :: boolean
	end
	return defaut
end

-- Ensemble { [chaîne] = true } ; tout le reste est jeté.
local function ensemble(v: unknown, defaut: { [string]: boolean }): { [string]: boolean }
	local resultat: { [string]: boolean } = {}
	if type(v) == "table" then
		for cle, valeur in v :: { [any]: any } do
			if type(cle) == "string" and valeur == true then
				resultat[cle] = true
			end
		end
	end
	-- Ce qui est offert reste toujours possédé
	for cle in defaut do
		resultat[cle] = true
	end
	return resultat
end

-- Dictionnaire { [chaîne] = nombre }.
local function nombres(v: unknown): { [string]: number }
	local resultat: { [string]: number } = {}
	if type(v) == "table" then
		for cle, valeur in v :: { [any]: any } do
			if type(cle) == "string" and type(valeur) == "number" and valeur == valeur then
				resultat[cle] = valeur
			end
		end
	end
	return resultat
end

local function stats(v: unknown): Stats?
	if type(v) ~= "table" then
		return nil
	end
	local t = v :: { [string]: any }
	local s = {
		vitesse = nombre(t.vitesse, 0, 0, 3000),
		souffle = nombre(t.souffle, 0, 0, 3000),
		puissance = nombre(t.puissance, 0, 0, 3000),
		coeur = nombre(t.coeur, 0, 0, 3000),
		instinct = nombre(t.instinct, 0, 0, 3000),
	}
	return s
end

local function liste(v: unknown): { any }
	if type(v) ~= "table" then
		return {}
	end
	local resultat = {}
	for _, element in ipairs(v :: { any }) do
		table.insert(resultat, element)
	end
	return resultat
end

-- Remet en ordre des données dont on ne sait rien (venues du DataStore).
function Schema.nettoyer(brut: unknown): Donnees
	local d = Schema.nouveau()
	if type(brut) ~= "table" then
		return d
	end
	local b = brut :: { [string]: any }

	d.etoiles = math.floor(nombre(b.etoiles, d.etoiles, 0, Schema.MAX_ETOILES))
	d.xp = math.floor(nombre(b.xp, 0, 0, Schema.MAX_ETOILES))

	local eq = if type(b.equipement) == "table" then b.equipement else {}
	d.equipement.robe = chaine(eq.robe, d.equipement.robe, 40)
	d.equipement.tenue = chaine(eq.tenue, d.equipement.tenue, 40)
	d.equipement.baton = chaine(eq.baton, d.equipement.baton, 40)
	d.equipement.effet = chaine(eq.effet, d.equipement.effet, 40)
	d.equipement.titre = chaine(eq.titre, "", 40)

	local pos = if type(b.possessions) == "table" then b.possessions else {}
	d.possessions.robes = ensemble(pos.robes, d.possessions.robes)
	d.possessions.tenues = ensemble(pos.tenues, d.possessions.tenues)
	d.possessions.batons = ensemble(pos.batons, d.possessions.batons)
	d.possessions.effets = ensemble(pos.effets, d.possessions.effets)

	d.titres = nombres(b.titres)

	local st = if type(b.stats) == "table" then b.stats else {}
	for _, cle in
		{
			"courses",
			"victoires",
			"podiums",
			"photoFinish",
			"entrainements",
			"concerts",
			"concertsMeneuse",
			"carrieres",
			"duos",
		}
	do
		(d.stats :: any)[cle] = math.floor(nombre(st[cle], 0, 0, Schema.MAX_ETOILES))
	end
	if type(st.parStrategie) == "table" then
		for id, v in st.parStrategie do
			if type(id) == "string" and type(v) == "table" then
				d.stats.parStrategie[id] = {
					courses = math.floor(nombre(v.courses, 0, 0)),
					victoires = math.floor(nombre(v.victoires, 0, 0)),
				}
			end
		end
	end
	d.stats.meilleursTemps = nombres(st.meilleursTemps)
	d.stats.meilleursScores = nombres(st.meilleursScores)

	for _, r in liste(b.rivales) do
		if type(r) == "table" and type(r.cle) == "string" and #d.rivales < Schema.MAX_RIVALES then
			table.insert(d.rivales, {
				cle = chaine(r.cle, "", 60),
				nom = chaine(r.nom, "?", 40),
				fois = math.floor(nombre(r.fois, 1, 0)),
				battue = math.floor(nombre(r.battue, 0, 0)),
				derniere = nombre(r.derniere, 0, 0),
			})
		end
	end

	if type(b.carriere) == "table" then
		d.carriere = b.carriere
	end

	for _, l in liste(b.legendes) do
		local s = if type(l) == "table" then stats(l.stats) else nil
		if s and #d.legendes < Schema.MAX_LEGENDES then
			table.insert(d.legendes, {
				id = chaine(l.id, tostring(#d.legendes + 1), 40),
				nom = chaine(l.nom, "Légende", 40),
				robe = chaine(l.robe, "bai", 40),
				stats = s,
				strategie = chaine(l.strategie, "ombre", 20),
				note = math.floor(nombre(l.note, 0, 0)),
				titre = chaine(l.titre, "", 60),
				victoires = math.floor(nombre(l.victoires, 0, 0)),
				date = nombre(l.date, 0, 0),
			})
		end
	end

	local tuto = if type(b.tutoriel) == "table" then b.tutoriel else {}
	d.tutoriel.fini = booleen(tuto.fini, false)
	d.tutoriel.etape = math.floor(nombre(tuto.etape, 0, 0, 100))

	local saison = if type(b.saison) == "table" then b.saison else {}
	d.saison.id = chaine(saison.id, "", 20)
	d.saison.points = math.floor(nombre(saison.points, 0, 0))

	local reglages = if type(b.reglages) == "table" then b.reglages else {}
	d.reglages.musique = nombre(reglages.musique, d.reglages.musique, 0, 1)
	d.reglages.sons = nombre(reglages.sons, d.reglages.sons, 0, 1)
	d.reglages.cinematiques = booleen(reglages.cinematiques, true)

	-- Les achats en Robux : la trace qui empêche de créditer deux fois le même
	-- reçu. On ne garde que les plus récents.
	local achats = liste(b.achats)
	for i = math.max(1, #achats - Schema.MAX_ACHATS + 1), #achats do
		local id = achats[i]
		if type(id) == "string" and #id <= 100 then
			table.insert(d.achats, id)
		end
	end

	d.creeLe = nombre(b.creeLe, 0, 0)
	d.derniereVisite = nombre(b.derniereVisite, 0, 0)

	-- On ne porte que ce qu'on possède
	if not d.possessions.robes[d.equipement.robe] then
		d.equipement.robe = "bai"
	end
	if not d.possessions.tenues[d.equipement.tenue] then
		d.equipement.tenue = "academie"
	end
	if not d.possessions.batons[d.equipement.baton] then
		d.equipement.baton = "rose"
	end
	if not d.possessions.effets[d.equipement.effet] then
		d.equipement.effet = "etoiles"
	end
	if d.equipement.titre ~= "" and not d.titres[d.equipement.titre] then
		d.equipement.titre = ""
	end
	return d
end

-- Porte des données d'une ancienne version à la version actuelle, puis les
-- nettoie. Les données d'une version plus récente (un serveur pas encore mis à
-- jour) sont nettoyées sans être rétrogradées : on ne perd que ce qu'on ne
-- connaît pas.
function Schema.migrer(brut: unknown): Donnees
	if type(brut) ~= "table" then
		return Schema.nouveau()
	end
	-- (Version 1 : rien à migrer pour l'instant. Une future étape s'écrira
	-- ainsi : if version < 2 then … end)
	local d = Schema.nettoyer(brut)
	d.version = Schema.VERSION
	return d
end

-- Copie profonde, pour envoyer les données au client sans partager de table.
function Schema.copier<T>(valeur: T): T
	if type(valeur) ~= "table" then
		return valeur
	end
	local copie = {}
	for cle, v in valeur :: any do
		copie[cle] = Schema.copier(v)
	end
	return copie :: any
end

return Schema
