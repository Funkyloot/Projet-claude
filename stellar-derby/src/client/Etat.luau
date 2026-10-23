--!strict
-- Etat — ce que le client sait de la course qu'il regarde, et les signaux qui
-- préviennent le reste du client quand ça change.
--
-- Plusieurs courses tournent en même temps ; le joueur en regarde une au plus
-- (attribut « Session » posé par le serveur), ou aucune quand il est à
-- l'Académie. Dans ce cas, la phase vaut "aucune".
--
-- Sources : les attributs du dossier de la session (phase, course, peloton,
-- résultats), les attributs du joueur (Session, CoureuseId), et les deux
-- canaux réseau (instantanés de positions, événements de course).

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Monde = require(Partage:WaitForChild("Monde"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Paquet = require(Partage:WaitForChild("Course"):WaitForChild("Paquet"))

export type Resultat = Reseau.Resultat

local MAX_INSTANTANES = 40

local Etat = {
	sessionId = "",
	dossier = nil :: Folder?,
	genre = "",
	titre = "",
	pisteId = "archipel",
	phase = "aucune",
	finPhase = 0,
	courseId = "",
	numeroCourse = 0,
	heureDepart = 0,
	creee = 0,
	grandPrix = false,
	inscrits = 0,
	peloton = {} :: { Reseau.Partante },
	parId = {} :: { [number]: Reseau.Partante },
	monId = 0,
	resultats = {} :: { Resultat },
	instantanes = {} :: { Paquet.Instantane },
}

local ecouteurs: { [string]: { (...any) -> ...any } } = {}
local connexions: { RBXScriptConnection } = {}
-- Juste après un changement de session, des instantanés de l'ancienne
-- peuvent encore arriver : on les ignore un court instant.
local ignorerJusqua = 0

-- Signaux : "session", "phase", "peloton", "resultats", "evenements",
-- "monId", "course"
function Etat.ecouter(signal: string, fonction: (...any) -> ...any)
	local liste = ecouteurs[signal]
	if not liste then
		liste = {}
		ecouteurs[signal] = liste
	end
	table.insert(liste, fonction)
end

local function emettre(signal: string, ...: any)
	local liste = ecouteurs[signal]
	if not liste then
		return
	end
	for _, fonction in liste do
		local ok, erreur = pcall(fonction, ...)
		if not ok then
			warn(`[Etat] écouteur « {signal} » : {erreur}`)
		end
	end
end

function Etat.maintenant(): number
	return Workspace:GetServerTimeNow()
end

function Etat.course(): Courses.Course?
	return Courses.parId(Etat.courseId)
end

-- Le repère de l'hippodrome de la course regardée.
function Etat.repere(): Monde.Repere
	return Monde.pour(Etat.pisteId)
end

function Etat.moi(): Reseau.Partante?
	return Etat.parId[Etat.monId]
end

-- Vrai si le joueur regarde une course (sinon, il est à l'Académie).
function Etat.regarde(): boolean
	return Etat.sessionId ~= "" and Etat.phase ~= "aucune"
end

function Etat.enCourse(): boolean
	return Etat.phase == "presentation" or Etat.phase == "stalles" or Etat.phase == "course"
end

-- Le dossier « Modeles » de la session regardée.
function Etat.modeles(): Folder?
	local dossier = Etat.dossier
	local modeles = dossier and dossier:FindFirstChild("Modeles")
	return if modeles and modeles:IsA("Folder") then modeles :: Folder else nil
end

-- Les deux instantanés qui encadrent `heure`, et la fraction entre les deux.
-- Au-delà du dernier, on renvoie le dernier deux fois (extrapolation à la
-- charge de l'appelant).
function Etat.encadrer(heure: number): (Paquet.Instantane?, Paquet.Instantane?, number)
	local liste = Etat.instantanes
	local n = #liste
	if n == 0 then
		return nil, nil, 0
	end
	if heure <= liste[1].heure then
		return liste[1], liste[1], 0
	end
	for i = n, 2, -1 do
		local a, b = liste[i - 1], liste[i]
		if heure >= a.heure and heure <= b.heure then
			local duree = b.heure - a.heure
			return a, b, if duree > 0 then (heure - a.heure) / duree else 0
		end
	end
	return liste[n], liste[n], 0
end

function Etat.decoder(json: unknown): any
	if type(json) ~= "string" or json == "" then
		return {}
	end
	local ok, valeur = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	return if ok then valeur else {}
end

local function lirePeloton(dossier: Folder)
	local liste = Etat.decoder(dossier:GetAttribute("Peloton")) :: { Reseau.Partante }
	Etat.peloton = liste
	table.clear(Etat.parId)
	for _, p in liste do
		Etat.parId[p.id] = p
	end
	emettre("peloton")
end

local function lirePhase(dossier: Folder?)
	local ancienne = Etat.phase
	if dossier then
		Etat.phase = (dossier:GetAttribute("Phase") :: string?) or "lobby"
		Etat.finPhase = (dossier:GetAttribute("FinPhase") :: number?) or 0
	else
		Etat.phase = "aucune"
		Etat.finPhase = 0
	end
	if Etat.phase ~= ancienne then
		emettre("phase", Etat.phase, ancienne)
	end
end

local function lireSimple(dossier: Folder)
	Etat.genre = (dossier:GetAttribute("Genre") :: string?) or ""
	Etat.titre = (dossier:GetAttribute("Titre") :: string?) or ""
	Etat.pisteId = (dossier:GetAttribute("Piste") :: string?) or "archipel"
	Etat.numeroCourse = (dossier:GetAttribute("NumeroCourse") :: number?) or 0
	Etat.heureDepart = (dossier:GetAttribute("HeureDepart") :: number?) or 0
	Etat.creee = (dossier:GetAttribute("Creee") :: number?) or 0
	Etat.grandPrix = (dossier:GetAttribute("GrandPrix") :: boolean?) == true
	Etat.inscrits = (dossier:GetAttribute("Inscrits") :: number?) or 0
end

local function deconnecter()
	for _, c in connexions do
		c:Disconnect()
	end
	table.clear(connexions)
end

-- Bascule sur une autre session (ou sur aucune).
local function suivre(id: string)
	deconnecter()
	Etat.sessionId = id
	table.clear(Etat.instantanes)
	ignorerJusqua = os.clock() + 0.4
	local dossier: Folder? = nil
	if id ~= "" then
		local trouve = Reseau.sessions():WaitForChild(id, 10)
		if trouve and trouve:IsA("Folder") and Etat.sessionId == id then
			dossier = trouve :: Folder
		end
	end
	if Etat.sessionId ~= id then
		return -- un autre changement est arrivé pendant l'attente
	end
	Etat.dossier = dossier

	if not dossier then
		Etat.genre, Etat.titre, Etat.courseId = "", "", ""
		Etat.peloton, Etat.resultats = {}, {}
		table.clear(Etat.parId)
		emettre("session")
		emettre("peloton")
		lirePhase(nil)
		return
	end
	local d = dossier :: Folder

	local function surAttribut(nom: string, fonction: () -> ())
		table.insert(connexions, d:GetAttributeChangedSignal(nom):Connect(fonction))
	end
	surAttribut("Phase", function()
		lirePhase(d)
	end)
	surAttribut("FinPhase", function()
		Etat.finPhase = (d:GetAttribute("FinPhase") :: number?) or 0
	end)
	surAttribut("Course", function()
		Etat.courseId = (d:GetAttribute("Course") :: string?) or ""
		emettre("course")
	end)
	surAttribut("NumeroCourse", function()
		Etat.numeroCourse = (d:GetAttribute("NumeroCourse") :: number?) or 0
		table.clear(Etat.instantanes)
	end)
	surAttribut("HeureDepart", function()
		Etat.heureDepart = (d:GetAttribute("HeureDepart") :: number?) or 0
	end)
	surAttribut("Inscrits", function()
		Etat.inscrits = (d:GetAttribute("Inscrits") :: number?) or 0
	end)
	surAttribut("Peloton", function()
		lirePeloton(d)
	end)
	surAttribut("Resultats", function()
		Etat.resultats = Etat.decoder(d:GetAttribute("Resultats")) :: { Resultat }
		emettre("resultats")
	end)
	table.insert(
		connexions,
		d.AncestryChanged:Connect(function()
			if not d.Parent and Etat.sessionId == id then
				suivre("")
			end
		end)
	)

	-- Lecture initiale : un joueur qui arrive en pleine course voit tout de suite où on en est
	lireSimple(d)
	Etat.courseId = (d:GetAttribute("Course") :: string?) or ""
	Etat.resultats = Etat.decoder(d:GetAttribute("Resultats")) :: { Resultat }
	emettre("session")
	emettre("course")
	lirePeloton(d)
	lirePhase(d)
end

function Etat.demarrer()
	local joueur = Players.LocalPlayer

	joueur:GetAttributeChangedSignal("Session"):Connect(function()
		task.spawn(suivre, (joueur:GetAttribute("Session") :: string?) or "")
	end)
	joueur:GetAttributeChangedSignal("CoureuseId"):Connect(function()
		Etat.monId = (joueur:GetAttribute("CoureuseId") :: number?) or 0
		emettre("monId")
	end)
	Etat.monId = (joueur:GetAttribute("CoureuseId") :: number?) or 0
	emettre("phase", Etat.phase, "")
	task.spawn(suivre, (joueur:GetAttribute("Session") :: string?) or "")

	Reseau.instantane().OnClientEvent:Connect(function(b: unknown)
		if typeof(b) ~= "buffer" or Etat.sessionId == "" or os.clock() < ignorerJusqua then
			return
		end
		local instantane = Paquet.lire(b :: buffer)
		-- Un instantané plus vieux que la session vient de la course d'avant
		if not instantane or instantane.heure < Etat.creee then
			return
		end
		-- Envoi non fiable : un instantané peut arriver en retard ou jamais.
		-- On l'insère à sa place (par heure serveur : les numéros repartent
		-- de 1 à chaque course) et on jette les plus vieux.
		local liste = Etat.instantanes
		local i = #liste
		while i >= 1 and liste[i].heure > instantane.heure do
			i -= 1
		end
		if i >= 1 and liste[i].heure == instantane.heure then
			return
		end
		table.insert(liste, i + 1, instantane)
		while #liste > MAX_INSTANTANES do
			table.remove(liste, 1)
		end
	end)

	Reseau.evenements().OnClientEvent:Connect(function(id: unknown, lot: unknown)
		if id == Etat.sessionId and type(lot) == "table" then
			emettre("evenements", lot)
		end
	end)
end

return Etat
