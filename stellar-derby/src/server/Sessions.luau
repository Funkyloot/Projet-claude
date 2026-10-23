--!strict
-- Sessions — les courses en cours. Plusieurs tournent en même temps.
--
-- Une session, c'est une course de bout en bout, sur un hippodrome :
--
--   lobby         (courses libres seulement) les joueurs choisissent stratégie,
--                 profil et robe ; la course part quand tout le monde est prêt
--                 ou au bout du compte à rebours
--   presentation  les partantes apparaissent dans les stalles, la caméra les
--                 passe en revue
--   stalles       compte à rebours ; appuyer pile au « Partez ! » donne un
--                 départ parfait
--   course        la simulation tourne, les clients affichent
--   resultats     podium et classement
--   concert       (si prévu) le concert de la victoire, mené par ServiceConcert
--   fin           la session se range
--
-- Qui crée des sessions : CoursesPubliques (une course libre par
-- hippodrome, en boucle), la carrière, le tutoriel, le mode Live.
--
-- Ce que voit un joueur : la session qu'il « regarde » (Sessions.regarder),
-- et elle seule. S'il y court, il en reçoit aussi les commandes. Les modèles
-- des coureuses ne sont copiés que chez ceux qui regardent : deux courses sur
-- le même hippodrome ne se voient pas.
--
-- Branchements pour les fonctionnalités :
--   Sessions.surFin(fonction)               (session, resultats) à chaque arrivée
--   Sessions.surCommande(genre, fonction)   commande d'un genre nouveau (ordre
--                                           d'entraîneuse, geste du concert…)
--   Sessions.definirConcert(fonction)       joue le concert d'une session
--   options.surFin                          rappel propre à une session

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Course = Partage:WaitForChild("Course")
local Config = require(Partage:WaitForChild("Config"))
local Monde = require(Partage:WaitForChild("Monde"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Robes = require(Partage:WaitForChild("Robes"))
local Aleatoire = require(Course:WaitForChild("Aleatoire"))
local Courses = require(Course:WaitForChild("Courses"))
local Paquet = require(Course:WaitForChild("Paquet"))
local Peloton = require(Course:WaitForChild("Peloton"))
local Pistes = require(Course:WaitForChild("Pistes"))
local Simulation = require(Course:WaitForChild("Simulation"))
local Strategies = require(Course:WaitForChild("Strategies"))

local Coureuses = require(script.Parent:WaitForChild("Coureuses"))

local PAS = 1 / Config.FREQUENCE_SIMULATION
local PERIODE_INSTANTANES = 1 / Config.FREQUENCE_INSTANTANES

export type Genre = "publique" | "carriere" | "tutoriel" | "live"

export type Choix = {
	strategie: string,
	profil: string,
	robe: string,
	participer: boolean,
	pret: boolean,
}

-- Une partante imposée (carrière, tutoriel, invité du mode Live).
export type Participant = {
	joueur: Player?, -- nil pour un invité qui n'est pas dans le serveur
	definition: Peloton.Definition,
	robe: string?,
	tenue: string?,
	marque: string?,
}

export type Options = {
	genre: Genre,
	titre: string,
	piste: string,
	course: Courses.Course,
	lobby: boolean?, -- courses libres : les spectateurs s'inscrivent au lobby
	participants: { Participant }?, -- partantes imposées
	bots: { Peloton.Definition }?, -- bots imposés (une rivale qui revient…)
	marques: { [string]: string }?, -- nom → étiquette (« RIVALE »…)
	taille: number?, -- taille du peloton (12 par défaut)
	totalBots: number?, -- total de stats des bots générés (3 000 par défaut)
	concert: boolean?, -- jouer le concert de la victoire après la course
	grandPrix: boolean?, -- Grand Prix du week-end : récompenses doublées
	dureeResultats: number?,
	surFin: ((Session, { Simulation.Resultat }) -> ())?,
	-- Quand la session est finie, rendre les spectateurs à l'Académie (sinon
	-- c'est le créateur de la session qui décide où ils vont)
	libererALaFin: boolean?,
}

export type Session = {
	id: string,
	options: Options,
	dossier: Folder,
	modeles: Folder,
	phase: string,
	simulation: Simulation.Simulation?,
	spectateurs: { [Player]: boolean },
	choix: { [Player]: Choix },
	coureuseDe: { [Player]: number },
	joueurDe: { [number]: Player },
	finie: boolean,
	resultats: { Simulation.Resultat }?,
	numeroCourse: number,
	donnees: { [string]: any }, -- libre, pour les fonctionnalités
}

local Sessions = {}

local sessions: { [string]: Session } = {}
local regardee: { [Player]: Session } = {}
local quotas: { [Player]: { debut: number, compte: number } } = {}
local surFins: { (Session, { Simulation.Resultat }) -> () } = {}
local surCommandes: { [string]: (Session, Player, unknown) -> () } = {}
local jouerConcert: ((Session) -> ())? = nil
type ApercuProfil = { robe: string, tenue: string, robes: { [string]: boolean } }
local profilDe: ((Player) -> ApercuProfil?)? = nil
local compteur = 0

local canalInstantanes = Reseau.instantane()
local canalEvenements = Reseau.evenements()
local canalCommandes = Reseau.commande()
local dossierSessions = Reseau.sessions()

local function maintenant(): number
	return Workspace:GetServerTimeNow()
end

-- ─────────────────────────── Branchements ───────────────────────────

function Sessions.surFin(fonction: (Session, { Simulation.Resultat }) -> ())
	table.insert(surFins, fonction)
end

function Sessions.surCommande(genre: string, fonction: (Session, Player, unknown) -> ())
	assert(surCommandes[genre] == nil, `commande « {genre} » branchée deux fois`)
	surCommandes[genre] = fonction
end

function Sessions.definirConcert(fonction: (Session) -> ())
	jouerConcert = fonction
end

-- Où trouver la robe et la tenue équipées d'un joueur, et les robes qu'il
-- possède (branché par Principal sur Profils, pour que ce module n'en
-- dépende pas).
function Sessions.definirProfil(fonction: (Player) -> ApercuProfil?)
	profilDe = fonction
end

-- ─────────────────────────── Interrogation ───────────────────────────

function Sessions.parId(id: string): Session?
	return sessions[id]
end

function Sessions.liste(): { Session }
	local liste: { Session } = {}
	for _, s in sessions do
		liste[#liste + 1] = s :: any -- (le vérificateur de types confond deux copies du type Session)
	end
	return liste
end

-- La session que regarde un joueur.
function Sessions.deJoueur(joueur: Player): Session?
	return regardee[joueur]
end

-- Vrai si le joueur court (ou va courir) dans cette session.
function Sessions.participe(session: Session, joueur: Player): boolean
	if session.coureuseDe[joueur] then
		return true
	end
	local c = session.choix[joueur]
	return session.phase == "lobby" and c ~= nil and c.participer
end

function Sessions.changerPhase(session: Session, phase: string, duree: number?)
	session.phase = phase
	session.dossier:SetAttribute("Phase", phase)
	session.dossier:SetAttribute("FinPhase", if duree then maintenant() + duree else 0)
end

-- Envoie un message de fonctionnalité à tous ceux qui regardent la session.
function Sessions.diffuser(session: Session, nom: string, donnees: any)
	local canal = Reseau.signal()
	for joueur in session.spectateurs do
		if joueur.Parent then
			canal:FireClient(joueur, nom, donnees)
		end
	end
end

-- ───────────────────────────── Choix ─────────────────────────────

local function choixParDefaut(joueur: Player): Choix
	local p = profilDe and profilDe(joueur)
	return {
		strategie = "ombre",
		profil = "equilibree",
		robe = if p and Robes.existe(p.robe) then p.robe else Robes.PAR_DEFAUT,
		participer = false,
		pret = false,
	}
end

-- Le choix validé est renvoyé au joueur dans ses attributs : l'interface
-- affiche toujours ce que le serveur a retenu, pas ce que le client a cru
-- envoyer.
local function publierChoix(joueur: Player, c: Choix)
	joueur:SetAttribute("Strategie", c.strategie)
	joueur:SetAttribute("Profil", c.profil)
	joueur:SetAttribute("Robe", c.robe)
	joueur:SetAttribute("Participer", c.participer)
	joueur:SetAttribute("Pret", c.pret)
end

local function inscrits(session: Session): number
	local n = 0
	for joueur, c in session.choix do
		if c.participer and session.spectateurs[joueur] then
			n += 1
		end
	end
	return n
end

local function publierInscrits(session: Session)
	session.dossier:SetAttribute("Inscrits", inscrits(session))
end

local function changerChoix(session: Session, joueur: Player, valeur: unknown)
	if session.phase ~= "lobby" or type(valeur) ~= "table" then
		return
	end
	local v = valeur :: { [string]: unknown }
	local c = session.choix[joueur]
	if not c then
		return
	end
	if Strategies.existe(v.strategie) then
		c.strategie = v.strategie :: string
	end
	if type(v.profil) == "string" and Peloton.profil(v.profil).id == v.profil then
		c.profil = v.profil
	end
	if Robes.existe(v.robe) then
		local p = profilDe and profilDe(joueur)
		-- On ne court qu'avec une robe qu'on possède
		if not p or p.robes[v.robe :: string] then
			c.robe = v.robe :: string
		end
	end
	if type(v.participer) == "boolean" then
		c.participer = v.participer
		if not c.participer then
			c.pret = false
		end
	end
	if type(v.pret) == "boolean" and c.participer then
		c.pret = v.pret
	end
	publierChoix(joueur, c)
	publierInscrits(session)
end

-- ───────────────────────────── Regarder ─────────────────────────────

-- Fait regarder `session` à un joueur (nil : il ne regarde plus rien et
-- revient à l'Académie, côté interface). `participer` l'inscrit au lobby
-- d'une course libre.
function Sessions.regarder(joueur: Player, session: Session?, participer: boolean?)
	local ancienne = regardee[joueur]
	if ancienne and ancienne ~= session then
		ancienne.spectateurs[joueur] = nil
		local id = ancienne.coureuseDe[joueur]
		local sim = ancienne.simulation
		if id and sim and not sim.termine then
			-- Parti en pleine course : un bot reprend les rênes
			sim:commande(id, "ia", nil)
		end
		if ancienne.phase == "lobby" then
			ancienne.choix[joueur] = nil
		end
		publierInscrits(ancienne)
	end
	if not session or session.finie then
		regardee[joueur] = nil
		joueur:SetAttribute("Session", "")
		joueur:SetAttribute("CoureuseId", 0)
		return
	end
	regardee[joueur] = session
	session.spectateurs[joueur] = true
	if session.options.lobby then
		local c = session.choix[joueur] or choixParDefaut(joueur)
		if participer ~= nil then
			c.participer = participer
			c.pret = false
		end
		session.choix[joueur] = c
		publierChoix(joueur, c)
		publierInscrits(session)
	end
	joueur:SetAttribute("CoureuseId", session.coureuseDe[joueur] or 0)
	joueur:SetAttribute("Session", session.id)
end

-- ───────────────────────────── Peloton ─────────────────────────────

local function participantsDuLobby(session: Session, rng: Aleatoire.Aleatoire): { Participant }
	local liste: { Participant } = {}
	for joueur, c in session.choix do
		if c.participer and session.spectateurs[joueur] and joueur.Parent and #liste < Config.TAILLE_PELOTON_MAX then
			local p = profilDe and profilDe(joueur)
			table.insert(liste, {
				joueur = joueur,
				definition = {
					nom = joueur.DisplayName,
					strategie = c.strategie,
					stats = table.clone(Peloton.profil(c.profil).stats),
					competences = Peloton.competencesPour(c.strategie, rng),
					controle = "joueur",
					userId = joueur.UserId,
				},
				robe = c.robe,
				tenue = if p then p.tenue else nil,
			})
		end
	end
	-- L'ordre des inscriptions ne doit rien décider : les stalles sont tirées
	-- au sort par la simulation, mais on mélange quand même la liste.
	return rng:melanger(liste)
end

local function publierPeloton(session: Session, sim: Simulation.Simulation)
	local marques = session.options.marques or {}
	local liste: { Reseau.Partante } = {}
	for _, c in sim.coureuses do
		local competences = {}
		for _, ec in c.competences do
			table.insert(competences, ec.def.id)
		end
		table.insert(liste, {
			id = c.id,
			nom = c.nom,
			numero = c.numero,
			cadre = c.cadre,
			strategie = c.strategie.id,
			controle = c.controle,
			userId = c.userId,
			competences = competences,
			stats = c.stats,
			marque = marques[c.nom] or session.donnees["marque_" .. c.id],
		})
	end
	session.dossier:SetAttribute("Peloton", HttpService:JSONEncode(liste))
end

local function creerModeles(
	session: Session,
	sim: Simulation.Simulation,
	robes: { [number]: string },
	tenues: { [number]: string }
)
	local repere = Monde.pour(session.options.piste)
	for _, c in sim.coureuses do
		task.spawn(function()
			local fiche: Coureuses.Fiche = {
				id = c.id,
				nom = c.nom,
				numero = c.numero,
				cadre = c.cadre,
				userId = c.userId,
				apparence = c.apparence,
				robe = robes[c.id],
				tenue = tenues[c.id],
			}
			if not session.finie then
				Coureuses.creer(fiche, repere:cadre(sim:abscisse(0), c.couloir, 0), session.modeles)
			end
		end)
	end
end

-- ───────────────────────────── Course ─────────────────────────────

local function spectateursPresents(session: Session): { Player }
	local liste = {}
	for joueur in session.spectateurs do
		if joueur.Parent then
			table.insert(liste, joueur)
		end
	end
	return liste
end

-- Fait tourner la simulation jusqu'à la fin de la course.
local function courir(session: Session, sim: Simulation.Simulation)
	local accumulateur = 0
	local depuisInstantane = 0
	local numero = 0
	local fini = false
	local erreur: string? = nil
	local enStalles = false
	local partie = false

	local function diffuser()
		numero += 1
		local paquet = Paquet.ecrire(numero, maintenant(), sim.t, sim.ralenti, sim.coureuses)
		for _, joueur in spectateursPresents(session) do
			canalInstantanes:FireClient(joueur, paquet)
		end
	end

	local function etape(dt: number): string?
		local echelle = if sim.ralenti then Config.RALENTI_PHOTO_FINISH else 1
		-- Plafonné : après un gros à-coup du serveur, on ne rattrape pas tout
		-- d'un coup (la course sauterait), on ralentit un instant.
		accumulateur = math.min(accumulateur + dt * echelle, PAS * 6)
		local lot = {}
		while accumulateur >= PAS and not sim.termine do
			accumulateur -= PAS
			for _, e in sim:pas(PAS) do
				table.insert(lot, e)
			end
		end
		if #lot > 0 then
			for _, joueur in spectateursPresents(session) do
				canalEvenements:FireClient(joueur, session.id, lot)
			end
		end

		if not enStalles and sim.t >= -Config.DUREE_STALLES then
			enStalles = true
			Sessions.changerPhase(session, "stalles", -sim.t)
		end
		if not partie and sim.t >= 0 then
			partie = true
			Sessions.changerPhase(session, "course")
		end

		depuisInstantane += dt
		if depuisInstantane >= PERIODE_INSTANTANES then
			depuisInstantane = math.min(depuisInstantane - PERIODE_INSTANTANES, PERIODE_INSTANTANES)
			diffuser()
		end
		if sim.termine or session.finie then
			fini = true
		end
		return nil
	end

	-- Une erreur dans Heartbeat n'atteindrait jamais le pcall de la boucle
	-- principale : on la capture ici et on la relance une fois sortis.
	local connexion = RunService.Heartbeat:Connect(function(dt: number)
		local ok, message = pcall(etape, dt)
		if not ok then
			erreur = tostring(message)
			fini = true
		end
	end)

	while not fini do
		task.wait()
	end
	connexion:Disconnect()
	if erreur then
		error(erreur, 0)
	end
	diffuser()
end

local function publierResultats(session: Session, resultats: { Simulation.Resultat })
	local liste: { Reseau.Resultat } = {}
	for _, r in resultats do
		table.insert(liste, {
			id = r.id,
			nom = r.nom,
			numero = r.numero,
			cadre = r.cadre,
			strategie = r.strategie,
			rang = r.rang,
			temps = math.floor(r.temps * 100 + 0.5) / 100,
			ecart = r.ecart,
			controle = r.controle :: string,
			userId = r.userId,
		})
	end
	session.dossier:SetAttribute("Resultats", HttpService:JSONEncode(liste))
end

-- ─────────────────────────────── Lobby ───────────────────────────────

local function tousPrets(session: Session): boolean
	local n = 0
	for joueur, c in session.choix do
		if c.participer and session.spectateurs[joueur] then
			n += 1
			if not c.pret then
				return false
			end
		end
	end
	return n > 0
end

-- Attend qu'au moins une joueuse soit inscrite, puis laisse le temps du
-- choix. Le compte à rebours repart si plus personne n'est inscrit.
local function lobby(session: Session)
	Sessions.changerPhase(session, "lobby", nil)
	while not session.finie do
		while inscrits(session) == 0 and not session.finie do
			if session.dossier:GetAttribute("FinPhase") ~= 0 then
				session.dossier:SetAttribute("FinPhase", 0)
			end
			task.wait(0.25)
		end
		local duree = if inscrits(session) <= 1 then Config.DUREE_LOBBY_SEUL else Config.DUREE_LOBBY
		Sessions.changerPhase(session, "lobby", duree)
		local fin = maintenant() + duree
		local minimum = maintenant() + 2
		local abandon = false
		while maintenant() < fin and not session.finie do
			if inscrits(session) == 0 then
				abandon = true
				break
			end
			if maintenant() > minimum and tousPrets(session) then
				break
			end
			task.wait(0.25)
		end
		if not abandon then
			return
		end
	end
end

-- ─────────────────────────── Déroulé complet ───────────────────────────

local function nettoyer(session: Session)
	session.finie = true
	session.simulation = nil
	sessions[session.id] = nil
	session.modeles:ClearAllChildren()
	for joueur in session.spectateurs do
		if regardee[joueur] == session and session.options.libererALaFin then
			Sessions.regarder(joueur, nil)
		end
	end
	-- On laisse aux clients le temps de voir la phase « fin » avant de ranger
	task.delay(5, function()
		session.dossier:Destroy()
	end)
end

local function derouler(session: Session)
	local options = session.options
	local course = options.course
	if options.lobby then
		lobby(session)
	else
		Sessions.changerPhase(session, "lobby", Config.DUREE_ATTENTE_SEUL)
		task.wait(Config.DUREE_ATTENTE_SEUL)
	end
	if session.finie then
		return
	end

	local graine = Random.new():NextInteger(1, 2 ^ 31 - 2)
	local rng = Aleatoire.nouveau(graine)
	local participants: { Participant } = {}
	if options.lobby then
		participants = participantsDuLobby(session, rng)
	end
	local imposes: { Participant } = options.participants or {}
	for _, p in imposes do
		table.insert(participants, p)
	end
	local definitions: { Peloton.Definition } = {}
	for _, p in participants do
		table.insert(definitions, p.definition)
	end
	local botsImposes: { Peloton.Definition } = options.bots or {}
	for _, bot in botsImposes do
		table.insert(definitions, bot)
	end
	local taille = math.max(options.taille or Config.TAILLE_PELOTON, #definitions)
	definitions = Peloton.completer(definitions, taille, rng, options.totalBots)

	local avance = Config.DUREE_PRESENTATION + Config.DUREE_STALLES
	local sim = Simulation.nouvelle(Pistes.geometrie(options.piste), course, definitions, graine, avance)
	session.simulation = sim
	session.numeroCourse += 1

	-- Les partantes imposées et inscrites sont en tête des définitions : leur
	-- identifiant de coureuse est leur rang dans cette liste.
	local robes: { [number]: string } = {}
	local tenues: { [number]: string } = {}
	table.clear(session.coureuseDe)
	table.clear(session.joueurDe)
	for i, p in participants do
		if p.robe then
			robes[i] = p.robe
		end
		if p.tenue then
			tenues[i] = p.tenue
		end
		if p.marque then
			session.donnees["marque_" .. i] = p.marque
		end
		local joueur = p.joueur
		if joueur then
			session.coureuseDe[joueur] = i
			session.joueurDe[i] = joueur
		end
	end
	for joueur in session.spectateurs do
		joueur:SetAttribute("CoureuseId", session.coureuseDe[joueur] or 0)
	end

	session.dossier:SetAttribute("NumeroCourse", session.numeroCourse)
	session.dossier:SetAttribute("HeureDepart", maintenant() + avance)
	session.dossier:SetAttribute("Resultats", "")
	publierPeloton(session, sim)
	creerModeles(session, sim, robes, tenues)
	Sessions.changerPhase(session, "presentation", Config.DUREE_PRESENTATION)

	courir(session, sim)
	if session.finie then
		return
	end

	local resultats = sim:resultats()
	session.resultats = resultats
	publierResultats(session, resultats)
	local dureeResultats = options.dureeResultats or (if options.concert then 8 else Config.DUREE_RESULTATS)
	Sessions.changerPhase(session, "resultats", dureeResultats)
	for _, fonction in surFins do
		task.spawn(function()
			local ok, erreur = pcall(function(): string?
				fonction(session, resultats)
				return nil
			end)
			if not ok then
				warn(`[Sessions] après la course : {erreur}`)
			end
		end)
	end
	local surFinSession = options.surFin
	if surFinSession then
		task.spawn(function()
			local ok, erreur = pcall(function(): string?
				surFinSession(session, resultats)
				return nil
			end)
			if not ok then
				warn(`[Sessions] après la course ({options.genre}) : {erreur}`)
			end
		end)
	end
	task.wait(dureeResultats)

	local concert = jouerConcert
	if options.concert and concert and not session.finie then
		local ok, erreur = pcall(function(): string?
			concert(session)
			return nil
		end)
		if not ok then
			warn(`[Sessions] concert : {erreur}`)
		end
	end
	Sessions.changerPhase(session, "fin")
end

-- Crée une session et la lance aussitôt. Ses spectateurs s'ajoutent avec
-- Sessions.regarder.
function Sessions.creer(options: Options): Session
	assert(Pistes.existe(options.piste), `hippodrome inconnu : {options.piste}`)
	compteur += 1
	local id = `{options.genre}_{compteur}`
	local dossier = Instance.new("Folder")
	dossier.Name = id
	local modeles = Instance.new("Folder")
	modeles.Name = "Modeles"
	modeles.Parent = dossier
	dossier:SetAttribute("Genre", options.genre)
	dossier:SetAttribute("Titre", options.titre)
	dossier:SetAttribute("Piste", options.piste)
	dossier:SetAttribute("Course", options.course.id)
	dossier:SetAttribute("Phase", "lobby")
	dossier:SetAttribute("FinPhase", 0)
	dossier:SetAttribute("NumeroCourse", 0)
	dossier:SetAttribute("HeureDepart", 0)
	dossier:SetAttribute("Creee", maintenant())
	dossier:SetAttribute("Peloton", "")
	dossier:SetAttribute("Resultats", "")
	dossier:SetAttribute("Inscrits", 0)
	dossier:SetAttribute("GrandPrix", options.grandPrix == true)
	dossier.Parent = dossierSessions

	local session: Session = {
		id = id,
		options = options,
		dossier = dossier,
		modeles = modeles,
		phase = "lobby",
		simulation = nil,
		spectateurs = {},
		choix = {},
		coureuseDe = {},
		joueurDe = {},
		finie = false,
		resultats = nil,
		numeroCourse = 0,
		donnees = {},
	}
	sessions[id] = session
	task.spawn(function()
		local ok, erreur = pcall(function(): string?
			derouler(session)
			return nil
		end)
		if not ok then
			-- Une course qui plante ne doit pas arrêter le serveur
			warn(`[Sessions] {id} interrompue : {erreur}`)
			Sessions.changerPhase(session, "fin")
		end
		nettoyer(session)
	end)
	return session
end

-- Arrête une session tout de suite (carrière abandonnée…).
function Sessions.terminer(session: Session)
	if session.finie then
		return
	end
	Sessions.changerPhase(session, "fin")
	session.finie = true
end

-- Attend la fin d'une session.
function Sessions.attendre(session: Session)
	while sessions[session.id] == session and not session.finie do
		task.wait(0.25)
	end
end

-- ───────────────────────────── Commandes ─────────────────────────────

-- Au plus COMMANDES_PAR_SECONDE commandes par joueur et par seconde.
local function autorise(joueur: Player): boolean
	local q = quotas[joueur]
	local t = os.clock()
	if not q or t - q.debut >= 1 then
		quotas[joueur] = { debut = t, compte = 1 }
		return true
	end
	q.compte += 1
	return q.compte <= Config.COMMANDES_PAR_SECONDE
end

local function recevoirCommande(joueur: Player, genre: unknown, valeur: unknown)
	if type(genre) ~= "string" or not autorise(joueur) then
		return
	end
	local session = regardee[joueur]
	if not session or session.finie then
		return
	end
	if genre == "choix" then
		changerChoix(session, joueur, valeur)
		return
	end
	local branche = surCommandes[genre]
	if branche then
		local ok, erreur = pcall(function(): string?
			branche(session, joueur, valeur)
			return nil
		end)
		if not ok then
			warn(`[Sessions] commande « {genre} » : {erreur}`)
		end
		return
	end
	local id = session.coureuseDe[joueur]
	local sim = session.simulation
	if sim and id then
		sim:commande(id, genre, valeur)
	end
end

function Sessions.demarrer()
	canalCommandes.OnServerEvent:Connect(recevoirCommande)
	Players.PlayerRemoving:Connect(function(joueur)
		Sessions.regarder(joueur, nil)
		quotas[joueur] = nil
	end)
end

return Sessions
