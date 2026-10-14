--!strict
-- Simulation — une course, pas à pas, sans rien savoir de Roblox.
--
-- Le serveur crée une Simulation au moment où les coureuses entrent dans les
-- stalles, l'avance à pas fixes (1/30 s), lui transmet les commandes des
-- joueurs et diffuse son état. Les clients ne simulent rien : ils affichent.
--
-- Chaque coureuse avance le long de la piste avec une distance parcourue `d`
-- et un `couloir` (distance à la corde). Pas de physique Roblox : c'est ce
-- qui permet 12 ou 80 coureuses fluides, une triche impossible côté client,
-- et un classement qui n'est qu'un tri.
--
-- Le temps de course `t` commence négatif pendant le compte à rebours des
-- stalles et vaut 0 au « Partez ! ».

local Aleatoire = require(script.Parent:WaitForChild("Aleatoire"))
local Competences = require(script.Parent:WaitForChild("Competences"))
local Courses = require(script.Parent:WaitForChild("Courses"))
local Formules = require(script.Parent:WaitForChild("Formules"))
local IA = require(script.Parent:WaitForChild("IA"))
local Peloton = require(script.Parent:WaitForChild("Peloton"))
local Piste = require(script.Parent:WaitForChild("Piste"))
local Strategies = require(script.Parent:WaitForChild("Strategies"))

local F = Formules

export type EtatCompetence = {
	def: Competences.Competence,
	etat: "attente" | "prete" | "utilisee" | "manquee",
	fenetre: number,
}

export type EffetActif = {
	genre: "vitesse" | "acceleration" | "endurance",
	valeur: number,
	reste: number,
}

export type Coureuse = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	strategie: Strategies.Strategie,
	stats: Formules.Stats,
	controle: "joueur" | "ia",
	userId: number?,
	apparence: number?,

	d: number,
	couloir: number,
	couloirCible: number,
	v: number,
	endurance: number,
	enduranceMax: number,
	rythme: number,

	partie: boolean,
	delaiDepart: number,
	departLance: boolean,
	reaction: "aucune" | "parfait" | "faux",

	sprint: boolean,
	epuisee: boolean,
	aspiration: boolean,
	aspirationDepuis: number,
	bloquee: boolean,
	duel: boolean,
	duelReste: number,
	devant: Coureuse?,
	ecartDevant: number,

	arrivee: boolean,
	tempsArrivee: number,
	vArrivee: number,
	rang: number,

	alea: number,
	section: number,
	competences: { EtatCompetence },
	effets: { EffetActif },
	aura: number, -- 0 aucune, 1 vitesse, 2 accélération, 3 endurance
	auraReste: number,
	prochaineDecision: number,
	dernierCouloirManuel: number, -- dernier ordre de couloir d'une joueuse
	sprintPossibleDepuis: number, -- secondes depuis que le sprint est tenable
}

export type Evenement = {
	genre: string,
	id: number?,
	autre: number?,
	phase: number?,
	competence: string?,
	rang: number?,
	temps: number?,
	resultat: string?,
	auto: boolean?,
}

export type Resultat = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	strategie: string,
	rang: number,
	temps: number,
	ecart: string, -- par rapport à la précédente
	controle: "joueur" | "ia",
	userId: number?,
}

local AURA_PAR_GENRE = { vitesse = 1, acceleration = 2, endurance = 3 }

local DELAI_REACTION_JOUEUR = 0.05
-- Une joueuse qui ne sprinte pas d'elle-même n'est pas condamnée : sa
-- coureuse se lance seule quand le sprint est tenable depuis quelques
-- secondes, ou à 200 m. Elle perd ces secondes sur celles qui ont su
-- appuyer au bon moment, pas toute la course.
local SPRINT_AUTO_DELAI = 4
local SPRINT_AUTO_DISTANCE = 200
local DUREE_APRES_VAINQUEUR = 25
local PERIODE_IA = 0.25
local REPRISE_CORDE = 3 -- s sans ordre de couloir avant que la coureuse ne regagne la corde seule

local Simulation = {}
Simulation.__index = Simulation

export type Simulation = typeof(setmetatable(
	{} :: {
		piste: Piste.Piste,
		course: Courses.Course,
		distance: number,
		v0: number,
		etat: "bon" | "lourd",
		partantes: number,
		depart: number, -- abscisse s des stalles
		rng: Aleatoire.Aleatoire,
		t: number,
		lancee: boolean,
		termine: boolean,
		coureuses: { Coureuse },
		ordre: { Coureuse },
		ralenti: boolean,
		photoFinish: boolean,
		enAttente: { Evenement }, -- produits par des commandes, rendus au pas suivant
		tPremiereArrivee: number?,
		arrivees: number,

		idTete: number,
		candidatTete: number,
		candidatDepuis: number,
		dernierChangementTete: number,
		phaseTete: number,
		annonceDernierVirage: boolean,
		annonceLigneDroite: boolean,
	},
	Simulation
))

function Simulation.nouvelle(
	piste: Piste.Piste,
	course: Courses.Course,
	definitions: { Peloton.Definition },
	graine: number,
	compteARebours: number?
): Simulation
	local rng = Aleatoire.nouveau(graine)
	local distance = course.distance
	local v0 = F.vitesseBase(distance, course.etat)
	local n = #definitions

	-- Tirage au sort des stalles
	local numeros = {}
	for i = 1, n do
		numeros[i] = i
	end
	rng:melanger(numeros)

	local ecartStalles = math.min(1.1, (piste.largeur - 2 * F.COULOIR_MIN) / math.max(1, n - 1))

	local coureuses: { Coureuse } = {}
	for id, def in definitions do
		local strategie = Strategies.obtenir(def.strategie)
		local numero = numeros[id]
		local couloir = F.COULOIR_MIN + (numero - 1) * ecartStalles
		local enduranceMax = F.enduranceMax(strategie, def.stats.souffle, distance)

		local competences: { EtatCompetence } = {}
		for _, idCompetence in def.competences do
			local competence = Competences.parId[idCompetence]
			if competence then
				table.insert(competences, { def = competence, etat = "attente", fenetre = 0 })
			end
		end

		local c: Coureuse = {
			id = id,
			nom = def.nom,
			numero = numero,
			cadre = F.cadre(numero, n),
			strategie = strategie,
			stats = def.stats,
			controle = def.controle,
			userId = def.userId,
			apparence = def.apparence,

			d = 0,
			couloir = couloir,
			couloirCible = couloir,
			v = 0,
			endurance = enduranceMax,
			enduranceMax = enduranceMax,
			rythme = F.RYTHME_NORMAL,

			partie = false,
			delaiDepart = if def.controle == "joueur" then DELAI_REACTION_JOUEUR else rng:entre(0, 0.1),
			departLance = true,
			reaction = "aucune",

			sprint = false,
			epuisee = false,
			aspiration = false,
			aspirationDepuis = 0,
			bloquee = false,
			duel = false,
			duelReste = 0,
			devant = nil,
			ecartDevant = math.huge,

			arrivee = false,
			tempsArrivee = 0,
			vArrivee = 0,
			rang = numero,

			alea = 0,
			section = -1,
			competences = competences,
			effets = {},
			aura = 0,
			auraReste = 0,
			prochaineDecision = rng:entre(0, PERIODE_IA),
			dernierCouloirManuel = -math.huge,
			sprintPossibleDepuis = 0,
		}
		table.insert(coureuses, c)
	end

	local self = setmetatable({
		piste = piste,
		course = course,
		distance = distance,
		v0 = v0,
		etat = course.etat,
		partantes = n,
		depart = -distance,
		rng = rng,
		t = -(compteARebours or 0),
		lancee = false,
		termine = false,
		coureuses = coureuses,
		ordre = table.clone(coureuses),
		ralenti = false,
		photoFinish = false,
		enAttente = {},
		tPremiereArrivee = nil,
		arrivees = 0,

		idTete = 0,
		candidatTete = 0,
		candidatDepuis = 0,
		dernierChangementTete = -math.huge,
		phaseTete = F.DEBUT,
		annonceDernierVirage = false,
		annonceLigneDroite = false,
	}, Simulation)
	self:_classer()
	return self
end

-- ───────────────────────────── Requêtes ──────────────────────────────

function Simulation.restant(self: Simulation, c: Coureuse): number
	return math.max(0, self.distance - c.d)
end

-- Abscisse s (depuis la ligne d'arrivée) d'une distance parcourue.
function Simulation.abscisse(self: Simulation, d: number): number
	return self.depart + d
end

function Simulation.phaseDe(self: Simulation, c: Coureuse): number
	return F.phase(c.d, self.distance)
end

function Simulation.vitesseSprint(self: Simulation, c: Coureuse): number
	return F.vitesseSprint(self.v0, c.strategie, c.stats)
end

-- Mètres de sprint que l'endurance actuelle permet de tenir jusqu'au bout.
function Simulation.sprintTenable(self: Simulation, c: Coureuse): number
	local vNormale = F.vitesseCroisiere(self.v0, c.strategie, F.FINALE, F.RYTHME_NORMAL, c.stats)
	return F.sprintTenable(
		c.endurance,
		self:restant(c),
		vNormale,
		self:vitesseSprint(c),
		self.v0,
		c.stats.coeur,
		self.etat
	)
end

-- Endurance nécessaire pour finir la course à rythme normal, sans sprint.
function Simulation.besoinEndurance(self: Simulation, c: Coureuse): number
	local besoin = 0
	local finMilieu = self.distance * 2 / 3
	if c.d < finMilieu then
		local v = F.vitesseCroisiere(self.v0, c.strategie, F.MILIEU, F.RYTHME_NORMAL, c.stats)
		besoin += F.consommation(v, self.v0, false, c.stats.coeur, self.etat) / v * (finMilieu - c.d)
	end
	local v = F.vitesseCroisiere(self.v0, c.strategie, F.FINALE, F.RYTHME_NORMAL, c.stats)
	local metresFinale = self.distance - math.max(c.d, finMilieu)
	besoin += F.consommation(v, self.v0, true, c.stats.coeur, self.etat) / v * math.max(0, metresFinale)
	return besoin
end

-- Aucune coureuse en course dans ce couloir, entre `arriere` mètres derrière
-- et `avant` mètres devant `c` ?
function Simulation.couloirLibre(
	self: Simulation,
	c: Coureuse,
	couloir: number,
	avant: number,
	arriere: number
): boolean
	for _, o in self.coureuses do
		if o ~= c and o.partie and not o.arrivee then
			local dd = o.d - c.d
			if dd <= avant and dd >= -arriere and math.abs(o.couloir - couloir) < F.LARGEUR_CORPS then
				return false
			end
		end
	end
	return true
end

function Simulation.contexte(self: Simulation, c: Coureuse): Competences.Contexte
	local s = self:abscisse(c.d)
	local restant = self:restant(c)
	return {
		phase = self:phaseDe(c),
		fraction = c.d / self.distance,
		restant = restant,
		rang = c.rang,
		partantes = self.partantes,
		enVirage = self.piste:courbure(s) ~= 0,
		ligneDroiteFinale = restant <= self.piste.ligneDroiteFinale,
		couloir = c.couloir,
		enduranceRelative = c.endurance / c.enduranceMax,
		aspirationDepuis = c.aspirationDepuis,
		duel = c.duel,
	}
end

-- ───────────────────────────── Commandes ─────────────────────────────

function Simulation.lancerSprint(self: Simulation, c: Coureuse, auto: boolean, evenements: { Evenement }?): boolean
	if c.sprint or c.arrivee or not c.partie or self:phaseDe(c) < F.FINALE then
		return false
	end
	c.sprint = true
	table.insert(evenements or self.enAttente, { genre = "sprint", id = c.id, auto = auto })
	return true
end

function Simulation._declencher(self: Simulation, c: Coureuse, evenements: { Evenement }): boolean
	for _, ec in c.competences do
		if ec.etat == "prete" then
			ec.etat = "utilisee"
			local effet = ec.def.effet
			if effet.genre == "endurance" then
				c.endurance = math.min(c.enduranceMax, c.endurance + effet.valeur * c.enduranceMax)
				if c.endurance > 0 then
					c.epuisee = false
				end
				c.auraReste = 1.2
			else
				table.insert(c.effets, { genre = effet.genre, valeur = effet.valeur, reste = effet.duree })
				c.auraReste = effet.duree
			end
			c.aura = AURA_PAR_GENRE[effet.genre]
			table.insert(evenements, { genre = "competence", id = c.id, competence = ec.def.id })
			return true
		end
	end
	return false
end

-- Un départ parfait sort des stalles sans délai et relance plus vite ; un
-- faux départ coûte un quart de seconde, soit deux longueurs à l'arrivée.
-- (Un bonus de vitesse visée ne servirait à rien ici : juste après les
-- stalles, c'est l'accélération qui limite, pas la vitesse visée.)
function Simulation._reagir(self: Simulation, c: Coureuse, resultat: "parfait" | "faux", evenements: { Evenement })
	c.reaction = resultat
	if resultat == "parfait" then
		c.delaiDepart = 0
		table.insert(c.effets, { genre = "acceleration", valeur = 0.6, reste = 2 })
	elseif not c.partie then
		c.delaiDepart += 0.25
	else
		table.insert(c.effets, { genre = "acceleration", valeur = -0.3, reste = 2 })
	end
	table.insert(evenements, { genre = "reaction", id = c.id, resultat = resultat :: string })
end

-- Commande d'un joueur. Tout est validé ici : le client n'est jamais cru
-- sur parole au-delà de ce que la commande a le droit de demander.
function Simulation.commande(self: Simulation, id: number, genre: string, valeur: unknown)
	local c = self.coureuses[id]
	if not c or c.controle ~= "joueur" or self.termine then
		return
	end
	if genre == "rythme" then
		if type(valeur) == "number" and F.RYTHMES[valeur] then
			c.rythme = valeur
		end
	elseif genre == "couloir" then
		if valeur == 1 or valeur == -1 then
			local cible = c.couloirCible + (valeur :: number) * F.PAS_COULOIR
			-- On n'empile pas plus de deux pas d'avance sur le couloir réel
			cible = math.clamp(cible, c.couloir - 2 * F.PAS_COULOIR, c.couloir + 2 * F.PAS_COULOIR)
			c.couloirCible = math.clamp(cible, F.COULOIR_MIN, self.piste.largeur - F.COULOIR_MIN)
			c.dernierCouloirManuel = self.t
		end
	elseif genre == "sprint" then
		self:lancerSprint(c, false)
	elseif genre == "competence" then
		self:_declencher(c, self.enAttente)
	elseif genre == "depart" then
		-- `valeur` : instant de l'appui mesuré par le client, relatif au
		-- « Partez ! ». Trop tôt = faux départ ; juste après = départ parfait.
		if c.reaction ~= "aucune" or type(valeur) ~= "number" or self.t > 1.5 then
			return
		end
		if valeur >= -0.6 and valeur < 0 then
			self:_reagir(c, "faux", self.enAttente)
		elseif valeur >= 0 and valeur <= 0.2 then
			self:_reagir(c, "parfait", self.enAttente)
		end
	elseif genre == "ia" then
		-- Joueur parti en pleine course : un bot reprend les rênes.
		c.controle = "ia"
	end
end

-- ─────────────────────────────── Pas ─────────────────────────────────

function Simulation.pas(self: Simulation, dt: number): { Evenement }
	-- Les événements nés des commandes reçues depuis le dernier pas
	local evenements = self.enAttente
	self.enAttente = {}
	if self.termine then
		return evenements
	end

	self.t += dt
	if self.t < 0 then
		return evenements
	end
	if not self.lancee then
		self:_lancer(evenements)
	end

	self:_voisinages(dt)
	self:_duels(dt, evenements)
	-- De la tête vers la queue : chaque coureuse voit sa voisine de devant
	-- déjà déplacée, ce qui évite les chevauchements.
	for _, c in self.ordre do
		self:_avancer(c, dt, evenements)
	end
	self:_classer()
	self:_competences(dt, evenements)
	self:_decisions(dt, evenements)
	self:_suivreCourse(dt, evenements)
	self:_verifierFin()
	return evenements
end

function Simulation._lancer(self: Simulation, evenements: { Evenement })
	self.lancee = true
	table.insert(evenements, { genre = "depart" })
	-- Réactions des bots : l'Instinct fait les départs parfaits
	for _, c in self.coureuses do
		if c.controle == "ia" then
			local tirage = self.rng:reel()
			if tirage < 0.04 then
				self:_reagir(c, "faux", evenements)
			elseif tirage < 0.04 + c.stats.instinct / 2000 then
				self:_reagir(c, "parfait", evenements)
			end
		end
	end
end

function Simulation._voisinages(self: Simulation, dt: number)
	local ordre = self.ordre
	for i, c in ordre do
		c.devant = nil
		c.ecartDevant = math.huge
		c.aspiration = false
		c.bloquee = false
		if c.partie and not c.arrivee then
			-- `ordre` est trié de la tête vers la queue : on remonte vers la
			-- tête et la première dans le même couloir est la plus proche.
			for j = i - 1, 1, -1 do
				local o = ordre[j]
				local ecart = o.d - c.d
				if ecart > F.SILLAGE_MAX then
					break
				end
				if o.partie and not o.arrivee and ecart > 0 and math.abs(o.couloir - c.couloir) < F.LARGEUR_CORPS then
					c.devant = o
					c.ecartDevant = ecart
					c.bloquee = ecart < F.DISTANCE_BLOCAGE
					c.aspiration = ecart >= F.SILLAGE_MIN
					break
				end
			end
		end
		if c.aspiration then
			c.aspirationDepuis += dt
		else
			c.aspirationDepuis = 0
		end
	end
end

function Simulation._duels(self: Simulation, dt: number, evenements: { Evenement })
	local ordre = self.ordre
	local ligne = self.piste.ligneDroiteFinale
	for _, c in ordre do
		c.duelReste = math.max(0, c.duelReste - dt)
	end
	for i, c in ordre do
		if c.partie and not c.arrivee and c.endurance > 0 and self:restant(c) <= ligne then
			for j = i + 1, #ordre do
				local o = ordre[j]
				if c.d - o.d > 2 then
					break
				end
				if o.partie and not o.arrivee and o.endurance > 0 and math.abs(o.couloir - c.couloir) < 2.5 then
					if c.duelReste <= 0 and o.duelReste <= 0 then
						table.insert(evenements, { genre = "duel", id = c.id, autre = o.id })
					end
					c.duelReste = 1.5
					o.duelReste = 1.5
				end
			end
		end
	end
	for _, c in ordre do
		c.duel = c.duelReste > 0
	end
end

function Simulation._deplacerLateralement(self: Simulation, c: Coureuse, dt: number)
	local delta = c.couloirCible - c.couloir
	if math.abs(delta) < 1e-3 then
		return
	end
	local vLat = F.vitesseLaterale(c.stats.puissance)
	local pasLat = math.clamp(delta, -vLat * dt, vLat * dt)
	local nouveau = math.clamp(c.couloir + pasLat, F.COULOIR_MIN, self.piste.largeur - F.COULOIR_MIN)
	-- Quelqu'un à côté, du côté où l'on veut aller ? On attend.
	for _, o in self.coureuses do
		if
			o ~= c
			and o.partie
			and not o.arrivee
			and math.abs(o.d - c.d) < F.ESPACE_CORPS
			and (o.couloir - c.couloir) * pasLat > 0
			and math.abs(o.couloir - nouveau) < F.LARGEUR_CORPS
		then
			return
		end
	end
	c.couloir = nouveau
end

function Simulation._vitesseCible(self: Simulation, c: Coureuse, phase: number): number
	local v0 = self.v0
	local cible
	if c.arrivee then
		return v0 * 0.55
	elseif c.endurance <= 0 then
		cible = F.vitesseEpuisee(v0, c.stats.coeur)
	elseif c.sprint then
		cible = self:vitesseSprint(c)
	else
		cible = F.vitesseCroisiere(v0, c.strategie, phase, c.rythme, c.stats)
	end
	cible += c.alea * v0
	for _, e in c.effets do
		if e.genre == "vitesse" then
			cible += e.valeur
		end
	end
	if c.duel then
		cible += F.bonusDuelVitesse(c.stats.coeur)
	end
	if c.aspiration then
		cible += F.ASPIRATION_VITESSE
	end
	local devant = c.devant
	if c.bloquee and devant then
		cible = math.min(cible, devant.v)
	end
	return cible
end

function Simulation._avancer(self: Simulation, c: Coureuse, dt: number, evenements: { Evenement })
	if not c.partie then
		if self.t < c.delaiDepart then
			return
		end
		c.partie = true
		c.v = F.VITESSE_DEPART
	end

	local v0 = self.v0
	local phase = self:phaseDe(c)
	local cible = self:_vitesseCible(c, phase)

	if cible > c.v then
		local acceleration = F.acceleration(c.stats.puissance, c.strategie, phase)
		for _, e in c.effets do
			if e.genre == "acceleration" then
				acceleration += e.valeur
			end
		end
		if c.duel then
			acceleration += F.bonusDuelAcceleration(c.stats.coeur)
		end
		if c.departLance then
			acceleration += F.ACCELERATION_DEPART
		end
		c.v = math.min(cible, c.v + acceleration * dt)
	else
		local deceleration = if c.endurance <= 0 then F.DECELERATION_EPUISEE else F.DECELERATION[phase]
		c.v = math.max(cible, c.v - deceleration * dt)
	end
	if c.departLance and c.v >= 0.85 * v0 then
		c.departLance = false
	end

	for i = #c.effets, 1, -1 do
		local e = c.effets[i]
		e.reste -= dt
		if e.reste <= 0 then
			table.remove(c.effets, i)
		end
	end
	if c.auraReste > 0 then
		c.auraReste -= dt
		if c.auraReste <= 0 then
			c.aura = 0
		end
	end

	self:_deplacerLateralement(c, dt)

	-- En virage, un couloir extérieur parcourt plus de terrain pour la même
	-- progression le long de la corde.
	local courbure = self.piste:courbure(self:abscisse(c.d))
	local dPrecedente = c.d
	c.d += c.v * dt * F.progressionEnVirage(courbure, c.couloir)

	-- Jamais à travers une coureuse de devant. On regarde les positions de cet
	-- instant, pas le voisinage calculé en début de pas : un changement de
	-- couloir pendant le pas a pu amener quelqu'un juste devant.
	if not c.arrivee then
		for _, o in self.coureuses do
			if
				o ~= c
				and o.partie
				and not o.arrivee
				and o.d >= dPrecedente
				and c.d > o.d - F.ESPACE_CORPS
				and math.abs(o.couloir - c.couloir) < F.LARGEUR_CORPS
			then
				c.d = math.max(dPrecedente, o.d - F.ESPACE_CORPS)
				c.v = math.min(c.v, o.v)
			end
		end
	end

	if not c.arrivee and c.endurance > 0 then
		local consommation = F.consommation(c.v, v0, phase == F.FINALE, c.stats.coeur, self.etat)
		if c.aspiration then
			consommation *= F.ASPIRATION_ENDURANCE
		end
		c.endurance -= consommation * dt
		if c.endurance <= 0 then
			c.endurance = 0
			if not c.epuisee then
				c.epuisee = true
				table.insert(evenements, { genre = "epuisee", id = c.id })
			end
		end
	end

	if not c.arrivee and c.d >= self.distance then
		c.arrivee = true
		-- Instant exact du franchissement, interpolé dans le pas
		local fraction = (self.distance - dPrecedente) / math.max(1e-9, c.d - dPrecedente)
		c.tempsArrivee = self.t - dt + fraction * dt
		c.vArrivee = c.v
		self.arrivees += 1
		if not self.tPremiereArrivee then
			self.tPremiereArrivee = c.tempsArrivee
		end
		table.insert(evenements, { genre = "arrivee", id = c.id, rang = self.arrivees, temps = c.tempsArrivee })
	end

	-- Petites variations d'allure, renouvelées à chaque 24e de la course
	if not c.arrivee then
		local section = math.floor(c.d / (self.distance / 24))
		if section ~= c.section then
			c.section = section
			local min, max = F.bornesAlea(c.stats.instinct)
			c.alea = self.rng:entre(min, max)
		end
	else
		c.alea = 0
	end
end

function Simulation._classer(self: Simulation)
	table.sort(self.ordre, function(a: Coureuse, b: Coureuse): boolean
		if a.arrivee ~= b.arrivee then
			return a.arrivee
		end
		if a.arrivee then
			if a.tempsArrivee ~= b.tempsArrivee then
				return a.tempsArrivee < b.tempsArrivee
			end
			return a.id < b.id
		end
		if a.d ~= b.d then
			return a.d > b.d
		end
		-- À égalité (dans les stalles), la corde d'abord
		return a.numero < b.numero
	end)
	for rang, c in self.ordre do
		c.rang = rang
	end
end

function Simulation._competences(self: Simulation, dt: number, evenements: { Evenement })
	for _, c in self.coureuses do
		if c.partie and not c.arrivee then
			local contexte: Competences.Contexte? = nil
			for _, ec in c.competences do
				if ec.etat == "attente" then
					contexte = contexte or self:contexte(c)
					if ec.def.condition(contexte :: Competences.Contexte) then
						ec.etat = "prete"
						ec.fenetre = Competences.fenetre(c.stats.instinct)
						if c.controle == "joueur" then
							table.insert(evenements, { genre = "competencePrete", id = c.id, competence = ec.def.id })
						end
					end
				elseif ec.etat == "prete" then
					ec.fenetre -= dt
					if ec.fenetre <= 0 then
						ec.etat = "manquee"
						if c.controle == "joueur" then
							table.insert(evenements, { genre = "competenceManquee", id = c.id, competence = ec.def.id })
						end
					elseif c.controle == "ia" and self.rng:reel() < Competences.reflexeBot(c.stats.instinct) * dt then
						self:_declencher(c, evenements)
					end
				end
			end
		end
	end
end

function Simulation._decisions(self: Simulation, dt: number, evenements: { Evenement })
	for _, c in self.coureuses do
		if c.partie and not c.arrivee then
			c.prochaineDecision -= dt
			local decide = c.prochaineDecision <= 0
			if decide then
				c.prochaineDecision += PERIODE_IA
			end
			if c.controle == "ia" then
				if decide then
					IA.decider(self, c, evenements)
				end
			else
				if decide and self.t - c.dernierCouloirManuel > REPRISE_CORDE then
					IA.regagnerCorde(self, c)
				end
				if not c.sprint and self:phaseDe(c) == F.FINALE then
					local restant = self:restant(c)
					if self:sprintTenable(c) >= restant then
						c.sprintPossibleDepuis += dt
						if c.sprintPossibleDepuis >= SPRINT_AUTO_DELAI or restant <= SPRINT_AUTO_DISTANCE then
							self:lancerSprint(c, true, evenements)
						end
					else
						c.sprintPossibleDepuis = 0
					end
				end
			end
		end
	end
end

function Simulation._suivreCourse(self: Simulation, dt: number, evenements: { Evenement })
	-- Tête de course (parmi celles qui n'ont pas fini)
	local tete: Coureuse? = nil
	for _, c in self.ordre do
		if not c.arrivee then
			tete = c
			break
		end
	end
	if not tete then
		return
	end

	if tete.id ~= self.candidatTete then
		self.candidatTete = tete.id
		self.candidatDepuis = 0
	else
		self.candidatDepuis += dt
	end
	if
		self.idTete ~= self.candidatTete
		and self.candidatDepuis >= 0.6
		and self.t - self.dernierChangementTete >= 3
		and self.t > 2
		and self.arrivees == 0
	then
		self.idTete = self.candidatTete
		self.dernierChangementTete = self.t
		table.insert(evenements, { genre = "tete", id = tete.id })
	end

	local phase = self:phaseDe(tete)
	if phase > self.phaseTete then
		self.phaseTete = phase
		table.insert(evenements, { genre = "phase", phase = phase })
	end

	local restant = self:restant(tete)
	local ligne = self.piste.ligneDroiteFinale
	if not self.annonceDernierVirage and restant <= ligne + self.piste.dernierVirage and restant > ligne then
		self.annonceDernierVirage = true
		table.insert(evenements, { genre = "dernierVirage" })
	end
	if not self.annonceLigneDroite and restant <= ligne then
		self.annonceLigneDroite = true
		table.insert(evenements, { genre = "ligneDroite" })
	end

	-- Photo-finish : les deux premières au coude-à-coude à quelques foulées
	-- de la ligne. Le ralenti dure jusqu'à un peu après le franchissement.
	if not self.photoFinish and self.arrivees == 0 then
		local seconde: Coureuse? = self.ordre[2]
		if seconde and not seconde.arrivee and restant < 8 and tete.d - seconde.d < 0.25 then
			self.photoFinish = true
			self.ralenti = true
			table.insert(evenements, { genre = "photoFinish", id = tete.id, autre = seconde.id })
		end
	end
	local premiere = self.tPremiereArrivee
	if self.ralenti and premiere and self.t > premiere + 0.6 then
		self.ralenti = false
	end
end

function Simulation._verifierFin(self: Simulation)
	local premiere = self.tPremiereArrivee
	if self.arrivees == self.partantes then
		self.termine = true
	elseif premiere and self.t > premiere + DUREE_APRES_VAINQUEUR then
		-- Les retardataires reçoivent un temps estimé
		for _, c in self.ordre do
			if not c.arrivee then
				c.arrivee = true
				c.tempsArrivee = self.t + self:restant(c) / math.max(5, c.v)
				c.vArrivee = math.max(5, c.v)
			end
		end
		self:_classer()
		self.termine = true
	end
	if self.termine then
		self.ralenti = false
	end
end

-- ───────────────────────────── Résultats ─────────────────────────────

function Simulation.resultats(self: Simulation): { Resultat }
	local liste: { Resultat } = {}
	local precedente: Coureuse? = nil
	for rang, c in self.ordre do
		local ecart = ""
		if precedente and c.arrivee and precedente.arrivee then
			local metres = (c.tempsArrivee - precedente.tempsArrivee) * math.max(1, c.vArrivee)
			ecart = F.intituleEcart(metres)
		end
		table.insert(liste, {
			id = c.id,
			nom = c.nom,
			numero = c.numero,
			cadre = c.cadre,
			strategie = c.strategie.id,
			rang = rang,
			temps = c.tempsArrivee,
			ecart = ecart,
			controle = c.controle,
			userId = c.userId,
		})
		precedente = c
	end
	return liste
end

return Simulation
