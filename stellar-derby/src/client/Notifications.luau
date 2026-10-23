--!strict
-- Notifications — les petits messages qui apparaissent en haut de l'écran
-- (gains, niveau, erreurs), puis s'effacent.
--
--     Notifications.afficher("Tenue achetée !", "gain")
--
-- Genres : "info", "gain", "niveau", "alerte", "titre".

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))

local Ui = require(script.Parent:WaitForChild("Ui"))

local Notifications = {}

local pile: Frame
local MAX = 4
local compteur = 0

local COULEURS: { [string]: Color3 } = {
	info = Couleurs.FOND_SOMBRE,
	gain = Color3.fromRGB(70, 150, 100),
	niveau = Couleurs.OR,
	alerte = Color3.fromRGB(200, 70, 70),
	titre = Couleurs.ROSE,
}

function Notifications.afficher(texte: string, genre: string?)
	if not pile then
		return
	end
	local fond = COULEURS[genre or "info"] or COULEURS.info
	local carte = Ui.cadre(pile, "Notification", UDim2.fromOffset(520, 0), UDim2.new(), fond, 0.08)
	carte.AutomaticSize = Enum.AutomaticSize.Y
	compteur += 1
	carte.LayoutOrder = -compteur -- la plus récente en haut
	Ui.coins(carte, 14)
	Ui.marges(carte, 10)
	local t = Ui.texte(
		carte,
		"Texte",
		texte,
		18,
		if genre == "niveau" then Couleurs.TEXTE else Couleurs.BLANC,
		Ui.POLICE_TEXTE
	)
	t.AutomaticSize = Enum.AutomaticSize.Y
	t.Size = UDim2.new(1, 0, 0, 0)
	local cartes = {}
	for _, enfant in pile:GetChildren() do
		if enfant:IsA("Frame") then
			table.insert(cartes, enfant)
		end
	end
	if #cartes > MAX then
		table.sort(cartes, function(a, b)
			return (a :: Frame).LayoutOrder > (b :: Frame).LayoutOrder
		end)
		for i = MAX + 1, #cartes do
			cartes[i]:Destroy()
		end
	end
	local duree = if genre == "alerte" then 7 else 4
	task.delay(duree, function()
		if carte.Parent then
			local fondu = TweenService:Create(carte, TweenInfo.new(0.4), { BackgroundTransparency = 1 })
			TweenService:Create(t, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
			fondu:Play()
			fondu.Completed:Wait()
			carte:Destroy()
		end
	end)
end

function Notifications.creer(parent: ScreenGui)
	pile = Ui.cadre(parent, "Notifications", UDim2.fromOffset(520, 0), UDim2.new(0.5, 0, 0, 70), Couleurs.FOND, 1)
	pile.AnchorPoint = Vector2.new(0.5, 0)
	pile.AutomaticSize = Enum.AutomaticSize.Y
	pile.ZIndex = 20
	Ui.liste(pile, Enum.FillDirection.Vertical, 6, Enum.HorizontalAlignment.Center)
	Reseau.notification().OnClientEvent:Connect(function(texte: unknown, genre: unknown)
		if type(texte) == "string" then
			Notifications.afficher(texte, if type(genre) == "string" then genre else "info")
		end
	end)
end

return Notifications
