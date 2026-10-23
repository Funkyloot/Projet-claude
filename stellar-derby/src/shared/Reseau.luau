--!strict
-- Reseau — les canaux entre serveur et clients, et l'état partagé.
--
-- Le serveur crée tout au démarrage ; les clients attendent que ça existe.
--
--   Instantane   (serveur → client, non fiable) positions des coureuses de la
--                course que le joueur regarde, en binaire (Course/Paquet)
--   Evenements   (serveur → client)  (idSession, lot) événements de course
--   Commande     (client → serveur)  (genre, valeur) ordres en course et
--                choix du lobby, pour la course où le joueur est inscrit
--   Requete      (client → serveur, avec réponse)  (nom, arguments) → réponse
--                tout le reste : boutique, carrière, entraînement… Voir
--                server/Profils (Profils.surRequete) pour les brancher.
--   Profil       (serveur → client)  (donnees) la sauvegarde du joueur, à jour
--   Notification (serveur → client)  (texte, genre) un message éphémère
--   Signal       (serveur → client)  (nom, donnees) messages propres à une
--                fonctionnalité (concert, carrière, mode Live…)
--
-- Plusieurs courses tournent en même temps (une course libre par
-- hippodrome, les carrières, les tutoriels). Chacune a son dossier dans
-- Reseau.Sessions, nommé par son identifiant, dont les attributs sont
-- répliqués à tous, y compris aux joueurs qui arrivent en route :
--   Genre         "publique" | "carriere" | "tutoriel" | "live"
--   Titre         ce qu'affiche l'interface (« Course libre », « Carrière de … »)
--   Piste         identifiant de l'hippodrome
--   Course        identifiant de la course
--   Phase         "lobby" | "presentation" | "stalles" | "course"
--                 | "resultats" | "concert" | "fin"
--   FinPhase      heure serveur de fin de la phase (compte à rebours affiché)
--   NumeroCourse  incrémenté à chaque nouvelle course de la session
--   HeureDepart   heure serveur du « Partez ! »
--   Creee         heure serveur de création (le client jette les instantanés plus vieux)
--   Peloton       partantes, en JSON (liste de Partante)
--   Resultats     classement final, en JSON (liste de Resultat)
--   Inscrits      nombre de joueuses inscrites (lobby des courses libres)
-- Le dossier contient aussi « Modeles » : les modèles des coureuses, que
-- chaque client copie chez lui pour les faire courir (ils ne sont visibles
-- que de ceux qui regardent cette course).
--
-- Attributs du joueur posés par le serveur :
--   Session       identifiant de la course regardée, "" à l'Académie
--   CoureuseId    numéro de sa coureuse dans cette course, 0 s'il regarde
--   Strategie, Profil, Robe, Participer, Pret   ses choix au lobby

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Formules = require(script.Parent:WaitForChild("Course"):WaitForChild("Formules"))

local NOM_DOSSIER = "Reseau"

export type Partante = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	strategie: string,
	controle: "joueur" | "ia",
	userId: number?,
	competences: { string },
	stats: Formules.Stats, -- le HUD en a besoin pour estimer le sprint tenable
	marque: string?, -- une étiquette affichée à côté du nom (« RIVALE », « Légende »…)
}

export type Resultat = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	strategie: string,
	rang: number,
	temps: number,
	ecart: string,
	controle: string,
	userId: number?,
}

-- Réponse à une requête : { ok = true, … } ou { ok = false, erreur = "…" }
export type Reponse = {
	ok: boolean,
	[string]: any,
}

local Reseau = {}

local function dossier(): Folder
	if RunService:IsServer() then
		local existant = ReplicatedStorage:FindFirstChild(NOM_DOSSIER)
		if existant and existant:IsA("Folder") then
			return existant :: Folder
		end
		local nouveau = Instance.new("Folder")
		nouveau.Name = NOM_DOSSIER
		nouveau.Parent = ReplicatedStorage
		return nouveau
	end
	return ReplicatedStorage:WaitForChild(NOM_DOSSIER) :: Folder
end

local function obtenir(
	nom: string,
	classe: "RemoteEvent" | "UnreliableRemoteEvent" | "RemoteFunction" | "Folder"
): Instance
	local parent = dossier()
	if RunService:IsServer() then
		local existant = parent:FindFirstChild(nom)
		if existant then
			return existant
		end
		local nouveau = Instance.new(classe)
		nouveau.Name = nom
		nouveau.Parent = parent
		return nouveau
	end
	return parent:WaitForChild(nom)
end

function Reseau.instantane(): UnreliableRemoteEvent
	return obtenir("Instantane", "UnreliableRemoteEvent") :: UnreliableRemoteEvent
end

function Reseau.evenements(): RemoteEvent
	return obtenir("Evenements", "RemoteEvent") :: RemoteEvent
end

function Reseau.commande(): RemoteEvent
	return obtenir("Commande", "RemoteEvent") :: RemoteEvent
end

function Reseau.requete(): RemoteFunction
	return obtenir("Requete", "RemoteFunction") :: RemoteFunction
end

function Reseau.profil(): RemoteEvent
	return obtenir("Profil", "RemoteEvent") :: RemoteEvent
end

function Reseau.notification(): RemoteEvent
	return obtenir("Notification", "RemoteEvent") :: RemoteEvent
end

function Reseau.signal(): RemoteEvent
	return obtenir("Signal", "RemoteEvent") :: RemoteEvent
end

-- Le dossier qui contient un dossier par course en cours.
function Reseau.sessions(): Folder
	return obtenir("Sessions", "Folder") :: Folder
end

-- État global du monde (attributs) : saison, week-end de Grand Prix…
function Reseau.monde(): Folder
	return obtenir("Monde", "Folder") :: Folder
end

-- Le dossier d'une course, s'il existe encore.
function Reseau.session(id: string): Folder?
	if id == "" then
		return nil
	end
	local trouve = Reseau.sessions():FindFirstChild(id)
	if trouve and trouve:IsA("Folder") then
		return trouve :: Folder
	end
	return nil
end

return Reseau
