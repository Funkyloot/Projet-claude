--!strict
-- Etat — ce que le client sait de la partie, et les signaux qui préviennent
-- le reste du client quand ça change.
--
-- Sources : les attributs du dossier EtatPartie (phase, course, peloton,
-- résultats), l'attribut CoureuseId du joueur, et les deux canaux réseau
-- (instantanés de positions, événements de course).

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Paquet = require(Partage:WaitForChild("Course"):WaitForChild("Paquet"))

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

local MAX_INSTANTANES = 40

local Etat = {
	phase = "lobby",
	finPhase = 0,
	courseId = "",
	numeroCourse = 0,
	heureDepart = 0,
	peloton = {} :: { Reseau.Partante },
	parId = {} :: { [number]: Reseau.Partante },
	monId = 0,
	resultats = {} :: { Resultat },
	instantanes = {} :: { Paquet.Instantane },
}

local ecouteurs: { [string]: { (...any) -> ...any } } = {}

-- Signaux : "phase", "peloton", "resultats", "evenements", "monId", "course"
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

function Etat.moi(): Reseau.Partante?
	return Etat.parId[Etat.monId]
end

function Etat.enCourse(): boolean
	return Etat.phase == "presentation" or Etat.phase == "stalles" or Etat.phase == "course"
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

local function decoder(json: unknown): any
	if type(json) ~= "string" or json == "" then
		return {}
	end
	local ok, valeur = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	return if ok then valeur else {}
end

local function lirePeloton(dossier: Folder)
	local liste = decoder(dossier:GetAttribute("Peloton")) :: { Reseau.Partante }
	Etat.peloton = liste
	table.clear(Etat.parId)
	for _, p in liste do
		Etat.parId[p.id] = p
	end
	emettre("peloton")
end

local function lirePhase(dossier: Folder)
	local ancienne = Etat.phase
	Etat.phase = (dossier:GetAttribute("Phase") :: string?) or "lobby"
	Etat.finPhase = (dossier:GetAttribute("FinPhase") :: number?) or 0
	if Etat.phase ~= ancienne then
		emettre("phase", Etat.phase, ancienne)
	end
end

function Etat.demarrer()
	local dossier = Reseau.etat()
	local joueur = Players.LocalPlayer

	dossier:GetAttributeChangedSignal("Phase"):Connect(function()
		lirePhase(dossier)
	end)
	dossier:GetAttributeChangedSignal("FinPhase"):Connect(function()
		Etat.finPhase = (dossier:GetAttribute("FinPhase") :: number?) or 0
	end)
	dossier:GetAttributeChangedSignal("Course"):Connect(function()
		Etat.courseId = (dossier:GetAttribute("Course") :: string?) or ""
		emettre("course")
	end)
	dossier:GetAttributeChangedSignal("NumeroCourse"):Connect(function()
		Etat.numeroCourse = (dossier:GetAttribute("NumeroCourse") :: number?) or 0
		table.clear(Etat.instantanes)
	end)
	dossier:GetAttributeChangedSignal("HeureDepart"):Connect(function()
		Etat.heureDepart = (dossier:GetAttribute("HeureDepart") :: number?) or 0
	end)
	dossier:GetAttributeChangedSignal("Peloton"):Connect(function()
		lirePeloton(dossier)
	end)
	dossier:GetAttributeChangedSignal("Resultats"):Connect(function()
		Etat.resultats = decoder(dossier:GetAttribute("Resultats")) :: { Resultat }
		emettre("resultats")
	end)
	joueur:GetAttributeChangedSignal("CoureuseId"):Connect(function()
		Etat.monId = (joueur:GetAttribute("CoureuseId") :: number?) or 0
		emettre("monId")
	end)

	-- Lecture initiale : un joueur qui arrive en pleine course voit tout de suite où on en est
	Etat.courseId = (dossier:GetAttribute("Course") :: string?) or ""
	Etat.numeroCourse = (dossier:GetAttribute("NumeroCourse") :: number?) or 0
	Etat.heureDepart = (dossier:GetAttribute("HeureDepart") :: number?) or 0
	Etat.monId = (joueur:GetAttribute("CoureuseId") :: number?) or 0
	Etat.resultats = decoder(dossier:GetAttribute("Resultats")) :: { Resultat }
	lirePeloton(dossier)
	lirePhase(dossier)
	emettre("phase", Etat.phase, "")

	Reseau.instantane().OnClientEvent:Connect(function(b: unknown)
		if typeof(b) ~= "buffer" then
			return
		end
		local instantane = Paquet.lire(b :: buffer)
		if not instantane then
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

	Reseau.evenements().OnClientEvent:Connect(function(lot: unknown)
		if type(lot) == "table" then
			emettre("evenements", lot)
		end
	end)
end

return Etat
