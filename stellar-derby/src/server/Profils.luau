--!strict
-- Profils — la sauvegarde de chaque joueur pendant la partie, et les requêtes.
--
-- Pour les autres modules du serveur :
--
--   Profils.obtenir(joueur)            les données du joueur (lecture seule !), ou nil
--   Profils.modifier(joueur, fonction) applique une modification, puis l'envoie
--                                      au client et la sauvegarde plus tard
--   Profils.surChargement(fonction)    appelée quand les données d'un joueur arrivent
--   Profils.avantDepart(fonction)      appelée quand un joueur part, juste avant
--                                      la dernière sauvegarde (on peut encore modifier)
--   Profils.sauverMaintenant(joueur)   sauvegarde tout de suite (achat en Robux…)
--   Profils.surRequete(nom, fonction)  branche une requête du client (voir plus bas)
--   Profils.notifier(joueur, texte)    un message éphémère à l'écran
--   Profils.signal(joueur, nom, data)  un message propre à une fonctionnalité
--
-- Les requêtes : le client appelle Reseau.requete():InvokeServer(nom, args).
-- Le serveur trouve la fonction branchée sous `nom`, l'appelle avec
-- (joueur, args) et renvoie sa réponse, une table { ok = true, … } ou
-- { ok = false, erreur = "…" }. Les arguments viennent du client : chaque
-- fonction vérifie tout ce qu'elle reçoit. Une erreur dans une fonction ne
-- fait pas planter le serveur, et le nombre de requêtes est limité.
--
-- Toute modification passe par Profils.modifier : c'est ce qui garantit que
-- le client voit l'état réel et que la sauvegarde suit.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Economie = require(Partage:WaitForChild("Jeu"):WaitForChild("Economie"))
local Schema = require(Partage:WaitForChild("Jeu"):WaitForChild("Schema"))

local Donnees = require(script.Parent:WaitForChild("Donnees"))

type Requete = (joueur: Player, args: any) -> Reseau.Reponse

local Profils = {}

type Fiche = {
	donnees: Schema.Donnees,
	lectureSeule: boolean,
	sale: boolean, -- modifiée depuis la dernière sauvegarde
	envoi: boolean, -- un envoi au client est déjà prévu
}

local fiches: { [Player]: Fiche } = {}
local surCharge: { (Player, Schema.Donnees) -> () } = {}
local avantDeparts: { (Player) -> () } = {}
local requetes: { [string]: Requete } = {}
local quotas: { [Player]: { debut: number, compte: number } } = {}
local canalProfil = Reseau.profil()
local canalNotification = Reseau.notification()
local canalSignal = Reseau.signal()

function Profils.obtenir(joueur: Player): Schema.Donnees?
	local f = fiches[joueur]
	return f and f.donnees
end

function Profils.pret(joueur: Player): boolean
	return fiches[joueur] ~= nil
end

-- Attend que les données d'un joueur soient chargées (au plus `delai` s).
function Profils.attendre(joueur: Player, delai: number?): Schema.Donnees?
	local fin = os.clock() + (delai or 30)
	while not fiches[joueur] and joueur.Parent and os.clock() < fin do
		task.wait(0.2)
	end
	return Profils.obtenir(joueur)
end

-- Ce que les autres joueurs voient (au-dessus de la tête, dans les listes).
local function publierAttributs(joueur: Player, d: Schema.Donnees)
	joueur:SetAttribute("Niveau", (Economie.niveau(d.xp)))
	joueur:SetAttribute("TitreAffiche", d.equipement.titre)
	joueur:SetAttribute("Etoiles", d.etoiles)
end

local function envoyer(joueur: Player)
	local f = fiches[joueur]
	if not f or f.envoi then
		return
	end
	f.envoi = true
	-- Plusieurs modifications de suite partent en un seul envoi
	task.delay(0.15, function()
		local actuelle = fiches[joueur]
		if actuelle ~= f or not joueur.Parent then
			return
		end
		f.envoi = false
		publierAttributs(joueur, f.donnees)
		canalProfil:FireClient(joueur, Schema.copier(f.donnees))
	end)
end

function Profils.modifier(joueur: Player, fonction: (Schema.Donnees) -> ()): boolean
	local f = fiches[joueur]
	if not f then
		return false
	end
	local ok, erreur = pcall(function(): string?
		fonction(f.donnees)
		return nil
	end)
	if not ok then
		warn(`[Profils] modification refusée pour {joueur.Name} : {erreur}`)
		return false
	end
	f.donnees.etoiles = math.clamp(math.floor(f.donnees.etoiles), 0, Schema.MAX_ETOILES)
	f.sale = true
	envoyer(joueur)
	return true
end

-- Ajoute des étoiles et de l'XP, et prévient le joueur. Renvoie vrai si un
-- niveau a été franchi.
function Profils.crediter(joueur: Player, etoiles: number, xp: number, raison: string?): boolean
	local montee = false
	Profils.modifier(joueur, function(d)
		local avant = Economie.niveau(d.xp)
		d.etoiles += math.max(0, math.floor(etoiles))
		d.xp += math.max(0, math.floor(xp))
		montee = Economie.niveau(d.xp) > avant
	end)
	if etoiles > 0 or xp > 0 then
		Profils.notifier(joueur, `{raison or "Gain"} : +{math.floor(etoiles)} ★  +{math.floor(xp)} XP`, "gain")
	end
	if montee then
		local d = Profils.obtenir(joueur)
		if d then
			Profils.notifier(joueur, `Niveau {(Economie.niveau(d.xp))} atteint !`, "niveau")
		end
	end
	return montee
end

function Profils.surChargement(fonction: (Player, Schema.Donnees) -> ())
	table.insert(surCharge, fonction)
	-- Les joueurs déjà chargés ne sont pas oubliés
	for joueur, f in fiches do
		task.spawn(fonction, joueur, f.donnees)
	end
end

-- Appelée quand un joueur quitte le jeu, avant sa dernière sauvegarde : le
-- dernier moment pour écrire quelque chose (une course de carrière que
-- l'IA finit pour lui…). Doit rester rapide et ne pas attendre.
function Profils.avantDepart(fonction: (Player) -> ())
	table.insert(avantDeparts, fonction)
end

function Profils.surRequete(nom: string, fonction: Requete)
	assert(requetes[nom] == nil, `requête « {nom} » branchée deux fois`)
	requetes[nom] = fonction
end

function Profils.notifier(joueur: Player, texte: string, genre: string?)
	canalNotification:FireClient(joueur, texte, genre or "info")
end

function Profils.notifierTous(texte: string, genre: string?)
	canalNotification:FireAllClients(texte, genre or "info")
end

function Profils.signal(joueur: Player, nom: string, donnees: any)
	canalSignal:FireClient(joueur, nom, donnees)
end

-- ─────────────────────────── Cycle de vie ───────────────────────────

local function sauver(joueur: Player, liberer: boolean)
	local f = fiches[joueur]
	if not f or f.lectureSeule then
		return
	end
	if not f.sale and not liberer then
		return
	end
	f.sale = false
	f.donnees.derniereVisite = os.time()
	if not Donnees.sauver(joueur.UserId, f.donnees, liberer) then
		f.sale = true
	end
end

-- Sauvegarde tout de suite, en attendant le DataStore. Vrai si c'est écrit
-- (faux en lecture seule : la sauvegarde est ouverte ailleurs).
function Profils.sauverMaintenant(joueur: Player): boolean
	local f = fiches[joueur]
	if not f or f.lectureSeule then
		return false
	end
	f.donnees.derniereVisite = os.time()
	-- Marquée propre avant d'écrire : une modification pendant l'écriture la resalit
	f.sale = false
	local ok = Donnees.sauver(joueur.UserId, f.donnees, false)
	if not ok then
		f.sale = true
	end
	return ok
end

local function arrivee(joueur: Player)
	local donnees, lectureSeule = Donnees.charger(joueur.UserId)
	if not joueur.Parent then
		-- Parti pendant le chargement : on rend le verrou tout de suite
		if not lectureSeule then
			Donnees.sauver(joueur.UserId, donnees, true)
		end
		return
	end
	if donnees.creeLe == 0 then
		donnees.creeLe = os.time()
	end
	fiches[joueur] = { donnees = donnees, lectureSeule = lectureSeule, sale = true, envoi = false }
	publierAttributs(joueur, donnees)
	canalProfil:FireClient(joueur, Schema.copier(donnees))
	if lectureSeule then
		Profils.notifier(
			joueur,
			"Ta sauvegarde est encore ouverte sur un autre serveur : ta progression de cette partie ne sera pas gardée. Reviens dans une minute.",
			"alerte"
		)
	end
	for _, fonction in surCharge do
		task.spawn(fonction, joueur, donnees)
	end
end

local function depart(joueur: Player)
	for _, fonction in avantDeparts do
		local ok, erreur = pcall(function(): string?
			fonction(joueur)
			return nil
		end)
		if not ok then
			warn(`[Profils] avant le départ de {joueur.Name} : {erreur}`)
		end
	end
	sauver(joueur, true)
	fiches[joueur] = nil
	quotas[joueur] = nil
end

local function autorise(joueur: Player): boolean
	local q = quotas[joueur]
	local t = os.clock()
	if not q or t - q.debut >= 1 then
		quotas[joueur] = { debut = t, compte = 1 }
		return true
	end
	q.compte += 1
	return q.compte <= Config.REQUETES_PAR_SECONDE
end

local function traiter(joueur: Player, nom: unknown, args: unknown): Reseau.Reponse
	if type(nom) ~= "string" then
		return { ok = false, erreur = "Requête invalide." }
	end
	if not autorise(joueur) then
		return { ok = false, erreur = "Doucement ! Réessaie dans un instant." }
	end
	local fonction = requetes[nom]
	if not fonction then
		return { ok = false, erreur = `Requête inconnue : {nom}` }
	end
	local ok, reponse = pcall(fonction, joueur, args)
	if not ok then
		warn(`[Profils] requête « {nom} » de {joueur.Name} : {reponse}`)
		return { ok = false, erreur = "Une erreur est survenue." }
	end
	if type(reponse) ~= "table" then
		return { ok = true }
	end
	return reponse :: Reseau.Reponse
end

function Profils.demarrer()
	Donnees.demarrer()
	Reseau.requete().OnServerInvoke = traiter

	-- Les réglages (volume, cinématiques) : la seule écriture directe du client
	Profils.surRequete("profil.reglages", function(joueur, args)
		if type(args) ~= "table" then
			return { ok = false, erreur = "Réglages invalides." }
		end
		Profils.modifier(joueur, function(d)
			if type(args.musique) == "number" then
				d.reglages.musique = math.clamp(args.musique, 0, 1)
			end
			if type(args.sons) == "number" then
				d.reglages.sons = math.clamp(args.sons, 0, 1)
			end
			if type(args.cinematiques) == "boolean" then
				d.reglages.cinematiques = args.cinematiques
			end
		end)
		return { ok = true }
	end)

	Players.PlayerAdded:Connect(arrivee)
	Players.PlayerRemoving:Connect(depart)
	for _, joueur in Players:GetPlayers() do
		task.spawn(arrivee, joueur)
	end

	-- Sauvegarde automatique, joueur par joueur, étalée dans le temps
	task.spawn(function()
		while true do
			task.wait(Config.SAUVEGARDE_AUTO)
			for joueur in fiches do
				if joueur.Parent then
					task.spawn(sauver, joueur, false)
					task.wait(0.5)
				end
			end
		end
	end)

	-- Fermeture du serveur : on sauve tout le monde avant de partir
	game:BindToClose(function()
		local restants = 0
		for joueur in fiches do
			restants += 1
			task.spawn(function()
				sauver(joueur, true)
				restants -= 1
			end)
		end
		local fin = os.clock() + 25
		while restants > 0 and os.clock() < fin do
			task.wait(0.2)
		end
	end)
end

return Profils
