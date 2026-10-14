--!strict
-- BoucleCourse — le déroulé d'une partie, de lobby en lobby.
--
--   lobby        les joueurs choisissent stratégie et profil (20 s, ou moins
--                si tout le monde est prêt)
--   presentation les partantes apparaissent dans les stalles, la caméra les
--                passe en revue
--   stalles      compte à rebours ; appuyer pile au « Partez ! » donne un
--                départ parfait
--   course       la simulation tourne, les clients affichent
--   resultats    podium et classement
--
-- La simulation est créée dès la présentation, avec un temps négatif : elle
-- tourne à vide jusqu'au départ, ce qui garde une seule boucle pour tout.

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
local Simulation = require(Course:WaitForChild("Simulation"))
local Strategies = require(Course:WaitForChild("Strategies"))

local Ambiance = require(script.Parent:WaitForChild("Ambiance"))
local Coureuses = require(script.Parent:WaitForChild("Coureuses"))
local Hippodrome = require(script.Parent:WaitForChild("Hippodrome"))

type Choix = {
	strategie: string,
	profil: string,
	robe: string,
	participer: boolean,
	pret: boolean,
}

local PAS = 1 / Config.FREQUENCE_SIMULATION
local PERIODE_INSTANTANES = 1 / Config.FREQUENCE_INSTANTANES

local BoucleCourse = {}

local etat = Reseau.etat()
local canalInstantanes = Reseau.instantane()
local canalEvenements = Reseau.evenements()
local canalCommandes = Reseau.commande()

local choix: { [Player]: Choix } = {}
local coureuseDe: { [Player]: number } = {}
local simulation: Simulation.Simulation? = nil
local stallesEnPlace: Model? = nil
local quotas: { [Player]: { debut: number, compte: number } } = {}

local dossierCoureuses = Instance.new("Folder")
dossierCoureuses.Name = "Coureuses"
dossierCoureuses.Parent = Workspace

local function maintenant(): number
	return Workspace:GetServerTimeNow()
end

local function changerPhase(phase: string, duree: number?)
	etat:SetAttribute("Phase", phase)
	etat:SetAttribute("FinPhase", if duree then maintenant() + duree else 0)
end

local function choixDe(joueur: Player): Choix
	local c = choix[joueur]
	if not c then
		c = { strategie = "ombre", profil = "equilibree", robe = Robes.PAR_DEFAUT, participer = true, pret = false }
		choix[joueur] = c
	end
	return c :: Choix
end

-- Le choix validé est renvoyé au joueur dans ses attributs : l'interface
-- affiche toujours ce que le serveur a retenu, pas ce que le client a cru
-- envoyer.
local function publierChoix(joueur: Player)
	local c = choixDe(joueur)
	joueur:SetAttribute("Strategie", c.strategie)
	joueur:SetAttribute("Profil", c.profil)
	joueur:SetAttribute("Robe", c.robe)
	joueur:SetAttribute("Participer", c.participer)
	joueur:SetAttribute("Pret", c.pret)
end

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
	if genre == "choix" then
		if type(valeur) ~= "table" then
			return
		end
		local v = valeur :: { [string]: unknown }
		local c = choixDe(joueur)
		if Strategies.existe(v.strategie) then
			c.strategie = v.strategie :: string
		end
		if type(v.profil) == "string" and Peloton.profil(v.profil).id == v.profil then
			c.profil = v.profil
		end
		if Robes.existe(v.robe) then
			c.robe = v.robe :: string
		end
		if type(v.participer) == "boolean" then
			c.participer = v.participer
		end
		if type(v.pret) == "boolean" then
			c.pret = v.pret
		end
		publierChoix(joueur)
		return
	end
	local id = coureuseDe[joueur]
	local sim = simulation
	if sim and id then
		sim:commande(id, genre, valeur)
	end
end

local function joueurParti(joueur: Player)
	local id = coureuseDe[joueur]
	local sim = simulation
	if sim and id then
		-- La coureuse finit la course, menée par l'IA
		sim:commande(id, "ia", nil)
	end
	coureuseDe[joueur] = nil
	choix[joueur] = nil
	quotas[joueur] = nil
end

-- ─────────────────────────────── Lobby ───────────────────────────────

local function tousPrets(): boolean
	local participants = 0
	for _, joueur in Players:GetPlayers() do
		local c = choixDe(joueur)
		if c.participer then
			participants += 1
			if not c.pret then
				return false
			end
		end
	end
	return participants > 0
end

local function lobby(course: Courses.Course)
	while #Players:GetPlayers() == 0 do
		Players.PlayerAdded:Wait()
	end
	for _, joueur in Players:GetPlayers() do
		choixDe(joueur).pret = false
		publierChoix(joueur)
	end
	etat:SetAttribute("Course", course.id)
	local duree = if #Players:GetPlayers() == 1 then Config.DUREE_LOBBY_SEUL else Config.DUREE_LOBBY
	changerPhase("lobby", duree)
	local fin = maintenant() + duree
	local minimum = maintenant() + 2
	while maintenant() < fin do
		if maintenant() > minimum and tousPrets() then
			break
		end
		task.wait(0.25)
	end
end

-- ───────────────────────────── Peloton ───────────────────────────────

local function composerPeloton(rng: Aleatoire.Aleatoire): ({ Peloton.Definition }, { Player })
	local joueuses: { Peloton.Definition } = {}
	local participants: { Player } = {}
	for _, joueur in Players:GetPlayers() do
		local c = choixDe(joueur)
		if c.participer and #joueuses < Config.TAILLE_PELOTON_MAX then
			table.insert(joueuses, {
				nom = joueur.DisplayName,
				strategie = c.strategie,
				stats = table.clone(Peloton.profil(c.profil).stats),
				competences = Peloton.competencesPour(c.strategie, rng),
				controle = "joueur",
				userId = joueur.UserId,
			})
			table.insert(participants, joueur)
		end
	end
	local taille = math.max(Config.TAILLE_PELOTON, #joueuses)
	return Peloton.completer(joueuses, taille, rng), participants
end

local function publierPeloton(sim: Simulation.Simulation)
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
		})
	end
	etat:SetAttribute("Peloton", HttpService:JSONEncode(liste))
end

local function creerModeles(sim: Simulation.Simulation)
	local robeDe: { [number]: string } = {}
	for joueur, id in coureuseDe do
		robeDe[id] = choixDe(joueur).robe
	end
	for _, c in sim.coureuses do
		task.spawn(function()
			local fiche = {
				id = c.id,
				nom = c.nom,
				numero = c.numero,
				cadre = c.cadre,
				userId = c.userId,
				apparence = c.apparence,
				robe = robeDe[c.id],
			}
			Coureuses.creer(fiche, Monde.cadre(sim:abscisse(0), c.couloir, 0), dossierCoureuses)
		end)
	end
end

-- ───────────────────────────── Course ────────────────────────────────

local function ouvrirStalles(stalles: Model)
	for _, porte in stalles:GetChildren() do
		if porte.Name == "Porte" then
			porte:Destroy()
		end
	end
	task.delay(4, function()
		stalles:Destroy()
	end)
end

-- Fait tourner la simulation jusqu'à la fin de la course.
local function courir(sim: Simulation.Simulation, stalles: Model)
	local accumulateur = 0
	local depuisInstantane = 0
	local numero = 0
	local fini = false
	local erreur: string? = nil
	local enStalles = false
	local partie = false

	local function diffuser()
		numero += 1
		canalInstantanes:FireAllClients(Paquet.ecrire(numero, maintenant(), sim.t, sim.ralenti, sim.coureuses))
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
			canalEvenements:FireAllClients(lot)
		end

		if not enStalles and sim.t >= -Config.DUREE_STALLES then
			enStalles = true
			changerPhase("stalles", -sim.t)
		end
		if not partie and sim.t >= 0 then
			partie = true
			changerPhase("course")
			ouvrirStalles(stalles)
		end

		depuisInstantane += dt
		if depuisInstantane >= PERIODE_INSTANTANES then
			depuisInstantane = math.min(depuisInstantane - PERIODE_INSTANTANES, PERIODE_INSTANTANES)
			diffuser()
		end
		if sim.termine then
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

local function publierResultats(sim: Simulation.Simulation)
	local liste = {}
	for _, r in sim:resultats() do
		table.insert(liste, {
			id = r.id,
			nom = r.nom,
			numero = r.numero,
			cadre = r.cadre,
			strategie = r.strategie,
			rang = r.rang,
			temps = math.floor(r.temps * 100 + 0.5) / 100,
			ecart = r.ecart,
			controle = r.controle,
			userId = r.userId,
		})
	end
	etat:SetAttribute("Resultats", HttpService:JSONEncode(liste))
end

local function nettoyer()
	simulation = nil
	table.clear(coureuseDe)
	dossierCoureuses:ClearAllChildren()
	local stalles = stallesEnPlace
	if stalles and stalles.Parent then
		stalles:Destroy()
	end
	stallesEnPlace = nil
end

local function uneCourse(numeroCourse: number)
	local course = Courses.liste[(numeroCourse - 1) % #Courses.liste + 1]
	lobby(course)

	local graine = Random.new():NextInteger(1, 2 ^ 31 - 2)
	local rng = Aleatoire.nouveau(graine)
	local definitions, participants = composerPeloton(rng)
	local avance = Config.DUREE_PRESENTATION + Config.DUREE_STALLES
	local sim = Simulation.nouvelle(Monde.piste, course, definitions, graine, avance)
	simulation = sim

	table.clear(coureuseDe)
	for i, joueur in participants do
		-- Les joueuses sont en tête de la liste des définitions : leur
		-- identifiant de coureuse est leur rang dans cette liste.
		coureuseDe[joueur] = i
		joueur:SetAttribute("CoureuseId", i)
	end
	for _, joueur in Players:GetPlayers() do
		if not coureuseDe[joueur] then
			joueur:SetAttribute("CoureuseId", 0)
		end
	end

	Ambiance.appliquer(course.meteo)
	etat:SetAttribute("NumeroCourse", numeroCourse)
	etat:SetAttribute("HeureDepart", maintenant() + avance)
	etat:SetAttribute("Resultats", "")
	publierPeloton(sim)
	local stalles = Hippodrome.construireStalles(course.distance, sim.partantes)
	stallesEnPlace = stalles
	creerModeles(sim)
	changerPhase("presentation", Config.DUREE_PRESENTATION)

	courir(sim, stalles)

	publierResultats(sim)
	changerPhase("resultats", Config.DUREE_RESULTATS)
	task.wait(Config.DUREE_RESULTATS)

	nettoyer()
end

function BoucleCourse.demarrer()
	canalCommandes.OnServerEvent:Connect(recevoirCommande)
	Players.PlayerAdded:Connect(publierChoix)
	for _, joueur in Players:GetPlayers() do
		publierChoix(joueur)
	end
	Players.PlayerRemoving:Connect(joueurParti)

	task.spawn(function()
		local numero = 1
		while true do
			local ok, erreur = pcall(function(): string?
				uneCourse(numero)
				return nil
			end)
			if not ok then
				-- Une course qui plante ne doit pas arrêter le serveur
				warn(`[BoucleCourse] course {numero} interrompue : {erreur}`)
				nettoyer()
				task.wait(2)
			end
			numero += 1
		end
	end)
end

return BoucleCourse
