--!strict
-- Ui — petites briques d'interface, pour que les écrans restent lisibles.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Couleurs = require(ReplicatedStorage:WaitForChild("Partage"):WaitForChild("Couleurs"))

local Ui = {}

Ui.POLICE = Enum.Font.FredokaOne
Ui.POLICE_TEXTE = Enum.Font.GothamMedium

function Ui.coins(objet: GuiObject, rayon: number?)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, rayon or 12)
	c.Parent = objet
end

function Ui.contour(objet: GuiObject, couleur: Color3, epaisseur: number?)
	local c = Instance.new("UIStroke")
	c.Color = couleur
	c.Thickness = epaisseur or 2
	c.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	c.Parent = objet
end

function Ui.marges(objet: GuiObject, px: number)
	local m = Instance.new("UIPadding")
	m.PaddingTop = UDim.new(0, px)
	m.PaddingBottom = UDim.new(0, px)
	m.PaddingLeft = UDim.new(0, px)
	m.PaddingRight = UDim.new(0, px)
	m.Parent = objet
end

function Ui.liste(objet: GuiObject, sens: Enum.FillDirection, ecart: number, alignement: Enum.HorizontalAlignment?)
	local l = Instance.new("UIListLayout")
	l.FillDirection = sens
	l.Padding = UDim.new(0, ecart)
	l.SortOrder = Enum.SortOrder.LayoutOrder
	l.HorizontalAlignment = alignement or Enum.HorizontalAlignment.Left
	l.VerticalAlignment = Enum.VerticalAlignment.Center
	l.Parent = objet
end

function Ui.cadre(
	parent: Instance,
	nom: string,
	taille: UDim2,
	position: UDim2,
	fond: Color3?,
	transparence: number?
): Frame
	local f = Instance.new("Frame")
	f.Name = nom
	f.Size = taille
	f.Position = position
	f.BackgroundColor3 = fond or Couleurs.FOND
	f.BackgroundTransparency = transparence or 0
	f.BorderSizePixel = 0
	f.Parent = parent
	return f
end

function Ui.texte(
	parent: Instance,
	nom: string,
	texte: string,
	taille: number,
	couleur: Color3?,
	police: Enum.Font?
): TextLabel
	local t = Instance.new("TextLabel")
	t.Name = nom
	t.BackgroundTransparency = 1
	t.Text = texte
	t.TextSize = taille
	t.TextColor3 = couleur or Couleurs.TEXTE
	t.Font = police or Ui.POLICE
	t.TextWrapped = true
	t.Size = UDim2.new(1, 0, 0, taille + 6)
	t.Parent = parent
	return t
end

function Ui.bouton(
	parent: Instance,
	nom: string,
	texte: string,
	taille: UDim2,
	fond: Color3,
	couleurTexte: Color3?
): TextButton
	local b = Instance.new("TextButton")
	b.Name = nom
	b.Size = taille
	b.BackgroundColor3 = fond
	b.AutoButtonColor = true
	b.Text = texte
	b.TextColor3 = couleurTexte or Couleurs.BLANC
	b.Font = Ui.POLICE
	b.TextScaled = true
	b.BorderSizePixel = 0
	b.Parent = parent
	Ui.coins(b, 14)
	local limite = Instance.new("UITextSizeConstraint")
	limite.MaxTextSize = 28
	limite.MinTextSize = 10
	limite.Parent = b
	return b
end

-- Écran plein, insensible à l'encoche, mis à l'échelle de l'appareil.
function Ui.ecran(parent: Instance, nom: string, ordre: number): ScreenGui
	local g = Instance.new("ScreenGui")
	g.Name = nom
	g.ResetOnSpawn = false
	g.IgnoreGuiInset = true
	g.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets
	g.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	g.DisplayOrder = ordre
	g.Parent = parent
	return g
end

-- Temps de course : 1:38.42
function Ui.chrono(secondes: number): string
	local minutes = math.floor(secondes / 60)
	local reste = secondes - minutes * 60
	return string.format("%d:%05.2f", minutes, reste)
end

function Ui.ordinal(rang: number): string
	return if rang == 1 then "1re" else `{rang}e`
end

return Ui
