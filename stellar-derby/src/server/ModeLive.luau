--!strict
-- ModeLive — le mode Live des streamers.
--
-- Activé :
--   - sur un serveur privé : la streameuse est sa propriétaire ;
--   - dans Studio, si Workspace a l'attribut « ModeLive » à vrai : la
--     streameuse est le premier joueur.
-- Partout ailleurs, ce module ne fait rien.
--
-- Les spectateurs du live s'inscrivent avec !join <pseudo Roblox> : leur
-- avatar court, piloté par l'IA, avec 3 000 points comme tout le monde. Le
-- chat vote la course (!vote) et fait ses pronostics (!prono), SANS RIEN
-- MISER : les pronostics ne rapportent qu'une place au classement de la
-- soirée. Les joueurs présents dans le serveur peuvent courir aussi.
--
-- Requêtes de la streameuse : live.etat, live.ajouter { pseudos },
-- live.retirer { pseudo }, live.vote { piste }, live.lancer { piste, course },
-- live.message { auteur, texte } (pour tester sans relais).
-- Requête de tous : live.rejoindre (courir la course Live en préparation).
--
-- Le relais (facultatif) : une petite page web qui recopie le chat du live.
-- Voir docs/MODE-LIVE.md. L'adresse se colle dans RELAIS ; vide = pas de relais.
--
-- L'état est publié sur Reseau.monde(), attribut « Live » (JSON) : invitées,
-- vote en cours, nombre de pronostics, classement des pronostiqueurs.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TextService = game:GetService("TextService")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Robes = require(Partage:WaitForChild("Robes"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Peloton = require(Partage:WaitForChild("Course"):WaitForChild("Peloton"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))
local Live = require(Partage:WaitForChild("Jeu"):WaitForChild("Live"))
local Titres = require(Partage:WaitForChild("Jeu"):WaitForChild("Titres"))

local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ModeLive = {}

-- L'adresse du relais du chat (voir docs/MODE-LIVE.md). Vide : pas de relais.
local RELAIS = ""
local PERIODE_RELAIS = 2
local DUREE_LOBBY = 30 -- s pour que le chat et le serveur s'inscrivent
local MAX_MESSAGES = 200 -- par lecture du relais

local streameuse: Player? = nil
local proprietaire = 0 -- userId attendu (serveur privé), 0 = le premier joueur (Studio)
local etat = Live.nouvelEtat()
local userIds: { [string]: number } = {} -- pseudo (minuscules) → userId
local filtres: { [string]: string } = {} -- auteur → nom filtré, affichable
local sessionLive: Sessions.Session? = nil
local aleatoire = Random.new()

-- ─────────────────────────────── Outils ───────────────────────────────

local function estStreameuse(joueur: Player): boolean
	return streameuse == joueur
end

local function prevenir(texte: string, genre: string?)
	local s = streameuse
	if s and s.Parent then
		Profils.notifier(s, texte, genre)
	end
end

-- Le userId d'un pseudo Roblox (nil s'il n'existe pas), avec un cache.
local function resoudre(pseudo: string): number?
	local cle = string.lower(pseudo)
	local enCache = userIds[cle]
	if enCache then
		return enCache
	end
	local ok, id = pcall(function()
		return Players:GetUserIdFromNameAsync(pseudo)
	end)
	if ok and type(id) == "number" and id > 0 then
		userIds[cle] = id
		return id
	end
	return nil
end

-- Un nom venu du chat du live ne s'affiche qu'une fois filtré par Roblox.
local function nomAffichable(auteur: string): string
	local enCache = filtres[auteur]
	if enCache then
		return enCache
	end
	local s = streameuse
	local resultat = "Spectateur"
	if s then
		local ok, filtre = pcall(function()
			local objet = TextService:FilterStringAsync(auteur, s.UserId)
			return objet:GetNonChatStringForBroadcastAsync()
		end)
		if ok and type(filtre) == "string" and filtre ~= "" then
			resultat = filtre
		end
	end
	filtres[auteur] = resultat
	return resultat
end

local function publier()
	local compte, gagnante = Live.depouiller(etat)
	local classement = {}
	for _, l in Live.classement(etat, 10) do
		table.insert(classement, { nom = nomAffichable(l.auteur), points = l.points })
	end
	local s = streameuse
	Reseau.monde():SetAttribute(
		"Live",
		HttpService:JSONEncode({
			actif = true,
			streameuse = if s then s.DisplayName else "",
			invites = etat.invites,
			vote = { options = etat.options, compte = compte, gagnante = gagnante },
			pronos = Live.nombrePronos(etat),
			classement = classement,
			session = if sessionLive and not sessionLive.finie then sessionLive.id else "",
		})
	)
end

-- ─────────────────────────────── Invitées ───────────────────────────────

local function ajouter(pseudo: string): (boolean, string?)
	local ok, raison = Live.ajouterInvite(etat, pseudo, Config.TAILLE_PELOTON_LIVE)
	if not ok then
		return false, raison
	end
	if not resoudre(pseudo) then
		Live.retirerInvite(etat, pseudo)
		return false, `{pseudo} : ce pseudo Roblox n'existe pas.`
	end
	return true, nil
end

-- Un message du chat (relais ou test).
local function message(auteurBrut: unknown, texte: unknown)
	local auteur = Live.auteur(auteurBrut)
	local commande = Live.analyser(texte)
	if not auteur or not commande then
		return
	end
	if commande.genre == "join" then
		local pseudo = (commande :: any).pseudo :: string
		task.spawn(function()
			local ok, raison = ajouter(pseudo)
			if not ok and raison then
				prevenir(raison, "alerte")
			end
			publier()
		end)
	elseif commande.genre == "prono" then
		Live.pronostiquer(etat, auteur, (commande :: any).numero)
	elseif commande.genre == "vote" then
		Live.voter(etat, auteur, (commande :: any).choix)
	end
end

-- ─────────────────────────────── La course ───────────────────────────────

local function definitionInvitee(pseudo: string, userId: number, rng: Aleatoire.Aleatoire): Sessions.Participant
	local profil = rng:choisir(Peloton.profils)
	local strategie = rng:choisir(Strategies.ordre)
	return {
		joueur = nil,
		definition = {
			nom = pseudo,
			strategie = strategie,
			-- 3 000 points, comme tout le monde : la course reste égale
			stats = table.clone(profil.stats),
			competences = Peloton.competencesPour(strategie, rng),
			controle = "ia",
			userId = userId,
		},
		robe = rng:choisir(Robes.liste).id,
		marque = "LIVE",
	}
end

local function apresCourse(session: Sessions.Session, resultats: { any })
	local tries = table.clone(resultats)
	table.sort(tries, function(a, b)
		return a.rang < b.rang
	end)
	local podium: { number } = {}
	for i = 1, math.min(3, #tries) do
		table.insert(podium, tries[i].numero)
	end
	local gagnes = Live.attribuerPoints(etat, podium)
	local lignes = {}
	for _, l in Live.classement(etat, 5) do
		table.insert(lignes, { nom = nomAffichable(l.auteur), points = l.points })
	end
	local bons = 0
	for _ in gagnes do
		bons += 1
	end
	Sessions.diffuser(session, "live.classement", { classement = lignes, bons = bons })
	publier()
end

local function lancer(joueur: Player, args: any): Reseau.Reponse
	if type(args) ~= "table" or not Pistes.existe(args.piste) then
		return { ok = false, erreur = "Choisis un hippodrome." }
	end
	local course = Courses.parId(args.course)
	if not course or course.piste ~= args.piste then
		return { ok = false, erreur = "Choisis une course de cet hippodrome." }
	end
	local actuelle = sessionLive
	if actuelle and not actuelle.finie then
		return { ok = false, erreur = "Une course Live est déjà en route." }
	end
	-- Les invitées qui tiennent dans les stalles (joueurs présents compris)
	local place = math.max(0, Config.TAILLE_PELOTON_LIVE - #Players:GetPlayers())
	local rng = Aleatoire.nouveau(aleatoire:NextInteger(1, 2147483646))
	local participants: { Sessions.Participant } = {}
	for _, pseudo in Live.prendreInvites(etat, place) do
		local userId = resoudre(pseudo)
		if userId then
			table.insert(participants, definitionInvitee(pseudo, userId, rng))
		end
	end
	local session = Sessions.creer({
		genre = "live",
		titre = `Live de {joueur.DisplayName}`,
		piste = course.piste,
		course = course,
		lobby = true,
		dureeLobby = DUREE_LOBBY,
		participants = participants,
		taille = math.max(Config.TAILLE_PELOTON, #participants),
		concert = true,
		surFin = apresCourse,
	})
	sessionLive = session
	-- Tout le serveur regarde, sauf ceux qui sont déjà dans une autre course
	for _, j in Players:GetPlayers() do
		local regardee = Sessions.deJoueur(j)
		if not regardee or regardee.finie or regardee.options.genre == "publique" then
			Sessions.regarder(j, session)
			Lieux.versTribune(j, course.piste)
		end
	end
	local nouveau = false
	Profils.modifier(joueur, function(d)
		nouveau = Titres.donner(d, "streameuse", os.time())
	end)
	if nouveau then
		Profils.notifier(joueur, "Nouveau titre : Star du Live", "titre")
	end
	table.clear(etat.options)
	table.clear(etat.votes)
	publier()
	return { ok = true, invitees = #participants }
end

-- ─────────────────────────────── Relais ───────────────────────────────

local function lireRelais()
	local curseur = ""
	while true do
		task.wait(PERIODE_RELAIS)
		if HttpService.HttpEnabled then
			local ok, reponse = pcall(function()
				return HttpService:GetAsync(`{RELAIS}?curseur={HttpService:UrlEncode(curseur)}`, true)
			end)
			if ok and type(reponse) == "string" then
				local okJson, donnees = pcall(function()
					return HttpService:JSONDecode(reponse)
				end)
				if okJson and type(donnees) == "table" then
					if type(donnees.curseur) == "string" or type(donnees.curseur) == "number" then
						curseur = string.sub(tostring(donnees.curseur), 1, 100)
					end
					if type(donnees.messages) == "table" then
						local n = 0
						for _, m in donnees.messages do
							n += 1
							if n > MAX_MESSAGES then
								break
							end
							if type(m) == "table" then
								message(m.auteur, m.texte)
							end
						end
						publier()
					end
				end
			end
		end
	end
end

-- ─────────────────────────────── Démarrage ───────────────────────────────

local function reserve(fonction: (Player, any) -> Reseau.Reponse): (Player, any) -> Reseau.Reponse
	return function(joueur: Player, args: any): Reseau.Reponse
		if not estStreameuse(joueur) then
			return { ok = false, erreur = "Réservé à la streameuse." }
		end
		return fonction(joueur, args)
	end
end

local function brancher()
	Profils.surRequete(
		"live.etat",
		reserve(function()
			publier()
			return { ok = true }
		end)
	)
	Profils.surRequete(
		"live.ajouter",
		reserve(function(_joueur, args)
			local pseudos = Live.decouper(if type(args) == "table" then args.pseudos else nil)
			local ajoutes, refus = 0, {}
			for _, pseudo in pseudos do
				local ok, raison = ajouter(pseudo)
				if ok then
					ajoutes += 1
				elseif raison then
					table.insert(refus, raison)
				end
			end
			publier()
			return { ok = true, ajoutes = ajoutes, refus = refus }
		end)
	)
	Profils.surRequete(
		"live.retirer",
		reserve(function(_joueur, args)
			local pseudo = if type(args) == "table" then args.pseudo else nil
			if type(pseudo) ~= "string" or not Live.retirerInvite(etat, pseudo) then
				return { ok = false, erreur = "Cette invitée n'est pas dans la file." }
			end
			publier()
			return { ok = true }
		end)
	)
	Profils.surRequete(
		"live.vote",
		reserve(function(_joueur, args)
			local piste = if type(args) == "table" then args.piste else nil
			if not Pistes.existe(piste) then
				return { ok = false, erreur = "Choisis un hippodrome." }
			end
			-- Trois courses de cet hippodrome, au hasard
			local courses = table.clone(Courses.dePiste(piste))
			Aleatoire.nouveau(aleatoire:NextInteger(1, 2147483646)):melanger(courses)
			local options: { string } = {}
			for i = 1, math.min(3, #courses) do
				table.insert(options, courses[i].id)
			end
			Live.ouvrirVote(etat, options)
			publier()
			return { ok = true, options = options }
		end)
	)
	Profils.surRequete("live.lancer", reserve(lancer))
	Profils.surRequete(
		"live.message",
		reserve(function(_joueur, args)
			if type(args) ~= "table" then
				return { ok = false, erreur = "Message invalide." }
			end
			message(args.auteur, args.texte)
			publier()
			return { ok = true }
		end)
	)
	Profils.surRequete("live.rejoindre", function(joueur)
		local session = sessionLive
		if not session or session.finie or session.phase ~= "lobby" then
			return { ok = false, erreur = "Aucune course Live n'attend de partantes." }
		end
		Sessions.regarder(joueur, session, true)
		Lieux.versTribune(joueur, session.options.piste)
		return { ok = true }
	end)
end

local function arrivee(joueur: Player)
	if streameuse then
		return
	end
	if proprietaire == 0 or joueur.UserId == proprietaire then
		streameuse = joueur
		joueur:SetAttribute("Streameuse", true)
		publier()
	end
end

function ModeLive.demarrer()
	local prive = game.PrivateServerId ~= "" and game.PrivateServerOwnerId ~= 0
	local studio = RunService:IsStudio() and Workspace:GetAttribute("ModeLive") == true
	if not prive and not studio then
		return
	end
	proprietaire = if prive then game.PrivateServerOwnerId else 0
	brancher()
	Players.PlayerAdded:Connect(arrivee)
	for _, joueur in Players:GetPlayers() do
		arrivee(joueur)
	end
	Players.PlayerRemoving:Connect(function(joueur)
		if joueur == streameuse then
			streameuse = nil
			-- La propriétaire peut revenir ; dans Studio, le joueur suivant reprend
			for _, autre in Players:GetPlayers() do
				if autre ~= joueur then
					arrivee(autre)
				end
			end
		end
	end)
	publier()
	if RELAIS ~= "" then
		task.spawn(lireRelais)
	end
	-- Le compte des votes et des pronostics, rafraîchi pour l'écran
	task.spawn(function()
		while true do
			task.wait(3)
			pcall(publier)
		end
	end)
end

return ModeLive
