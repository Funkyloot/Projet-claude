--!strict
-- Ecran — l'écran géant de l'hippodrome, vu depuis la tribune.
-- Chaque client le remplit lui-même : rien ne transite par le réseau.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local LIGNES = 6

local Ecran = {}

local titre: TextLabel?
local lignes: { TextLabel } = {}

function Ecran.demarrer()
	task.spawn(function()
		local hippodrome = Workspace:WaitForChild("Hippodrome", 30)
		local support = hippodrome and hippodrome:WaitForChild("EcranGeant", 30) :: BasePart?
		if not support then
			return
		end
		local gui = Instance.new("SurfaceGui")
		gui.Face = Enum.NormalId.Front
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 24
		gui.LightInfluence = 0
		gui.Brightness = 1.5
		gui.Parent = support
		local fond = Ui.cadre(gui, "Fond", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.FOND_SOMBRE)
		Ui.marges(fond, 18)
		Ui.liste(fond, Enum.FillDirection.Vertical, 6)
		local t = Ui.texte(fond, "Titre", "STELLAR DERBY", 44, Couleurs.ROSE)
		t.Size = UDim2.new(1, 0, 0, 56)
		titre = t
		for i = 1, LIGNES do
			local l = Ui.texte(fond, `Ligne{i}`, "", 30, Couleurs.BLANC, Ui.POLICE_TEXTE)
			l.LayoutOrder = i
			l.Size = UDim2.new(1, 0, 0, 38)
			l.TextXAlignment = Enum.TextXAlignment.Left
			lignes[i] = l
		end
	end)
end

function Ecran.mettreAJour()
	local t = titre
	if not t then
		return
	end
	local course = Etat.course()
	local textes: { string } = {}
	if Etat.phase == "lobby" then
		t.Text = if course then course.nom else "STELLAR DERBY"
		if course then
			table.insert(textes, `{course.distance} m · {course.categorie}`)
		end
		table.insert(textes, `Départ dans {math.max(0, math.ceil(Etat.finPhase - Etat.maintenant()))} s`)
	elseif Etat.phase == "resultats" then
		t.Text = "Arrivée"
		for _, r in Etat.resultats do
			if r.rang <= LIGNES then
				table.insert(textes, `{r.rang}. {r.nom}   {r.ecart}`)
			end
		end
	else
		t.Text = if course then course.nom else ""
		local classement = {}
		for id, e in Rendu.affiche do
			classement[e.rang] = id
		end
		for rang = 1, LIGNES do
			local id = classement[rang]
			local p = id and Etat.parId[id]
			if p then
				table.insert(textes, `{rang}. {p.nom}`)
			end
		end
	end
	for i, l in lignes do
		l.Text = textes[i] or ""
	end
end

return Ecran
