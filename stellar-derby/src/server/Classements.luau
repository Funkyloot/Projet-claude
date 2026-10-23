--!strict
-- Classements — les classements du jeu (victoires, saison, Légendes), leurs
-- tableaux à l'Académie, et le titre « Étoile de la saison ».
--
-- Écriture : un OrderedDataStore par classement (un par mois pour la
-- saison). On écrit la valeur d'un joueur quand elle change, au plus toutes
-- les 2 minutes par classement, et à son départ.
-- Lecture : le top 10 de chaque classement, toutes les 60 s, publié sur
-- Reseau.monde() :
--   Classements  JSON { victoires = { {nom, valeur}… }, saison = …, legendes = …, maj }
--   Saison, NomSaison, Weekend
-- et affiché sur les trois tableaux de l'Académie.
--
-- Sans DataStore (Studio sans accès aux API), tout marche en mémoire avec
-- les joueurs présents.

local HttpService = game:GetService("HttpService")
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Classement = require(Partage:WaitForChild("Jeu"):WaitForChild("Classement"))
local Saisons = require(Partage:WaitForChild("Jeu"):WaitForChild("Saisons"))
local Titres = require(Partage:WaitForChild("Jeu"):WaitForChild("Titres"))

local Donnees = require(script.Parent:WaitForChild("Donnees"))
local Profils = require(script.Parent:WaitForChild("Profils"))

local Classements = {}

local PERIODE_ECRITURE = 30
local PERIODE_LECTURE = 60

type Ligne = { nom: string, valeur: number, userId: number }
type Ecriture = { valeur: number, heure: number }

local magasins: { [string]: OrderedDataStore } = {}
local ecrites: { [Player]: { [string]: Ecriture } } = {}
local noms: { [number]: string } = {}
local tops: { [string]: { Ligne } } = { victoires = {}, saison = {}, legendes = {} }
local saisonPrecedente: { id: string, userIds: { [number]: boolean } }? = nil
local tableaux: { [string]: { TextLabel } } = {}

local function memoire(): boolean
	return Donnees.memoire == true
end

local function magasin(nom: string): OrderedDataStore?
	if memoire() then
		return nil
	end
	local existant = magasins[nom]
	if existant then
		return existant
	end
	local ok, resultat = pcall(function()
		return DataStoreService:GetOrderedDataStore(nom)
	end)
	if not ok then
		return nil
	end
	magasins[nom] = resultat
	return resultat
end

local function nomDe(userId: number): string
	local enCache = noms[userId]
	if enCache then
		return enCache
	end
	local joueur = Players:GetPlayerByUserId(userId)
	if joueur then
		noms[userId] = joueur.DisplayName
		return joueur.DisplayName
	end
	local ok, nom = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	local resultat = if ok and type(nom) == "string" then nom else "?"
	noms[userId] = resultat
	return resultat
end

-- ─────────────────────────────── Écriture ───────────────────────────────

local function ecrire(joueur: Player, forcer: boolean)
	local d = Profils.obtenir(joueur)
	if not d then
		return
	end
	local idSaison = Saisons.id(os.time())
	local miennes: { [string]: Ecriture } = ecrites[joueur] or {}
	ecrites[joueur] = miennes
	for _, classement in Classement.LISTE do
		local valeur = Classement.valeur(classement, d, idSaison)
		local cle = if classement == "saison" then `saison_{idSaison}` else classement
		if Classement.fautReecrire(miennes[cle], valeur, os.time(), forcer) then
			miennes[cle] = { valeur = valeur, heure = os.time() }
			local m = magasin(Classement.magasin(classement, idSaison))
			if m then
				local ok, erreur = pcall(function()
					m:SetAsync(tostring(joueur.UserId), valeur)
				end)
				if not ok then
					warn(`[Classements] écriture {classement} : {erreur}`)
					miennes[cle] = nil -- on réessaiera
				end
				task.wait(0.2) -- on étale les écritures
			end
		end
	end
end

-- ─────────────────────────────── Lecture ───────────────────────────────

local function lireTop(nomMagasin: string): { Ligne }?
	local m = magasin(nomMagasin)
	if not m then
		return nil
	end
	local ok, page = pcall(function()
		return m:GetSortedAsync(false, Classement.TAILLE):GetCurrentPage()
	end)
	if not ok or type(page) ~= "table" then
		return nil
	end
	local lignes: { Ligne } = {}
	for _, entree in page :: { any } do
		local userId = tonumber(entree.key)
		local valeur = tonumber(entree.value)
		if userId and valeur and valeur > 0 then
			table.insert(lignes, { nom = nomDe(userId), valeur = valeur, userId = userId })
		end
	end
	return lignes
end

-- En mémoire : le top des joueurs présents.
local function topPresents(classement: string, idSaison: string): { Ligne }
	local lignes: { Ligne } = {}
	for _, joueur in Players:GetPlayers() do
		local d = Profils.obtenir(joueur)
		if d then
			local valeur = Classement.valeur(classement, d, idSaison)
			if valeur > 0 then
				table.insert(lignes, { nom = joueur.DisplayName, valeur = valeur, userId = joueur.UserId })
			end
		end
	end
	table.sort(lignes, function(a, b)
		return a.valeur > b.valeur
	end)
	while #lignes > Classement.TAILLE do
		table.remove(lignes)
	end
	return lignes
end

-- ─────────────────────────────── Tableaux ───────────────────────────────

local function creerTableau(classement: string)
	local academie = Workspace:FindFirstChild("Academie")
	local modele = academie and academie:FindFirstChild("Classements")
	local piece = modele and modele:FindFirstChild(`Tableau_{classement}`) :: BasePart?
	if not piece then
		return
	end
	local gui = Instance.new("SurfaceGui")
	gui.Name = "Top"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0
	gui.Parent = piece
	local fond = Instance.new("Frame")
	fond.Size = UDim2.fromScale(1, 1)
	fond.BackgroundTransparency = 1
	fond.Parent = gui
	local lignes: { TextLabel } = {}
	for i = 1, Classement.TAILLE do
		local t = Instance.new("TextLabel")
		t.Name = `Ligne{i}`
		t.BackgroundTransparency = 1
		t.Size = UDim2.new(1, -24, 1 / Classement.TAILLE, -4)
		t.Position = UDim2.new(0, 12, (i - 1) / Classement.TAILLE, 2)
		t.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
		t.TextScaled = true
		t.TextXAlignment = Enum.TextXAlignment.Left
		t.TextColor3 = if i == 1 then Couleurs.OR elseif i <= 3 then Couleurs.ROSE_PALE else Couleurs.BLANC
		t.Text = ""
		t.Parent = fond
		lignes[i] = t
	end
	tableaux[classement] = lignes
end

local function afficherTableaux()
	for classement, lignes in tableaux do
		local top = tops[classement] or {}
		for i, etiquette in lignes do
			local ligne = top[i]
			etiquette.Text = if ligne
				then `{Classement.rang(i)}  {ligne.nom}  ·  {Classement.abreger(ligne.valeur)}`
				else (if i == 1 then "En attente des premières courses…" else "")
		end
	end
end

local function publier()
	local idSaison = Saisons.id(os.time())
	for _, classement in Classement.LISTE do
		local lu = lireTop(Classement.magasin(classement, idSaison))
		tops[classement] = lu or topPresents(classement, idSaison)
	end
	local monde = Reseau.monde()
	local donnees: { [string]: any } = { maj = os.time() }
	for classement, top in tops do
		local liste = {}
		for _, l in top do
			table.insert(liste, { nom = l.nom, valeur = l.valeur })
		end
		donnees[classement] = liste
	end
	monde:SetAttribute("Classements", HttpService:JSONEncode(donnees))
	monde:SetAttribute("Saison", idSaison)
	monde:SetAttribute("NomSaison", Saisons.nom(idSaison))
	monde:SetAttribute("Weekend", Saisons.estWeekend(os.time()))
	afficherTableaux()
end

-- ─────────────────────────────── Titre de la saison ───────────────────────────────

-- Le top 10 de la saison précédente, lu une fois par saison.
local function topPrecedent(): { [number]: boolean }
	local id = Classement.saisonPrecedente(Saisons.id(os.time()))
	local cache = saisonPrecedente
	if cache and cache.id == id then
		return cache.userIds
	end
	local userIds: { [number]: boolean } = {}
	local lignes = lireTop(Classement.magasin("saison", id))
	if lignes then
		for _, l in lignes do
			userIds[l.userId] = true
		end
	end
	-- En mémoire (ou en cas d'échec), on ne retient rien : on relira plus tard
	if lignes then
		saisonPrecedente = { id = id, userIds = userIds }
	end
	return userIds
end

local function verifierTitreSaison(joueur: Player)
	if memoire() then
		return
	end
	if topPrecedent()[joueur.UserId] then
		local nouveau = false
		Profils.modifier(joueur, function(d)
			nouveau = Titres.donner(d, "saison", os.time())
		end)
		if nouveau then
			Profils.notifier(joueur, "Nouveau titre : Étoile de la saison ! Tu as fini dans le top 10.", "titre")
		end
	end
end

function Classements.demarrer()
	for _, classement in Classement.LISTE do
		creerTableau(classement)
	end
	Profils.surChargement(function(joueur)
		verifierTitreSaison(joueur)
	end)
	Profils.avantDepart(function(joueur)
		-- Au départ : on écrit ce qui a changé, sans attendre (en tâche à part)
		task.spawn(ecrire, joueur, true)
	end)
	Players.PlayerRemoving:Connect(function(joueur)
		task.delay(1, function()
			ecrites[joueur] = nil
		end)
	end)
	task.spawn(function()
		while true do
			for _, joueur in Players:GetPlayers() do
				if Profils.pret(joueur) then
					ecrire(joueur, false)
				end
			end
			task.wait(PERIODE_ECRITURE)
		end
	end)
	task.spawn(function()
		task.wait(3)
		while true do
			local ok, erreur = pcall(function(): string?
				publier()
				return nil
			end)
			if not ok then
				warn(`[Classements] publication : {erreur}`)
			end
			task.wait(PERIODE_LECTURE)
		end
	end)
end

return Classements
