--!strict
-- Ecran — les écrans géants des hippodromes, vus depuis la tribune.
-- Chaque client les remplit lui-même : rien ne transite par le réseau.
--
-- L'écran de l'hippodrome de la course regardée suit cette course ; les
-- autres annoncent simplement l'hippodrome.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local LIGNES = 6

local Ecran = {}

type Affichage = { titre: TextLabel, lignes: { TextLabel } }

local ecrans: { [string]: Affichage } = {}

local function creer(support: BasePart): Affichage
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
	local lignes = {}
	for i = 1, LIGNES do
		local l = Ui.texte(fond, `Ligne{i}`, "", 30, Couleurs.BLANC, Ui.POLICE_TEXTE)
		l.LayoutOrder = i
		l.Size = UDim2.new(1, 0, 0, 38)
		l.TextXAlignment = Enum.TextXAlignment.Left
		lignes[i] = l
	end
	return { titre = t, lignes = lignes }
end

function Ecran.demarrer()
	for _, def in Pistes.liste do
		task.spawn(function()
			local hippodromes = Workspace:WaitForChild("Hippodromes", 60)
			local racine = hippodromes and hippodromes:WaitForChild(def.id, 60)
			local support = racine and racine:WaitForChild("EcranGeant", 30) :: BasePart?
			if support then
				local e = creer(support)
				e.titre.Text = def.nom
				e.lignes[1].Text = "Courses libres toute la journée"
				e.lignes[2].Text = "Portail à l'Académie"
				ecrans[def.id] = e
			end
		end)
	end
end

local function remplir(e: Affichage)
	local course = Etat.course()
	local textes: { string } = {}
	if Etat.phase == "lobby" then
		e.titre.Text = if course then course.nom else "STELLAR DERBY"
		if course then
			table.insert(textes, `{course.distance} m · {course.categorie}`)
		end
		if Etat.finPhase > 0 then
			table.insert(textes, `Départ dans {math.max(0, math.ceil(Etat.finPhase - Etat.maintenant()))} s`)
		else
			table.insert(textes, "En attente des partantes")
		end
	elseif Etat.phase == "resultats" or Etat.phase == "concert" or Etat.phase == "fin" then
		e.titre.Text = "Arrivée"
		for _, r in Etat.resultats do
			if r.rang <= LIGNES then
				table.insert(textes, `{r.rang}. {r.nom}   {r.ecart}`)
			end
		end
	else
		e.titre.Text = if course then course.nom else ""
		local classement = {}
		for id, a in Rendu.affiche do
			classement[a.rang] = id
		end
		for rang = 1, LIGNES do
			local id = classement[rang]
			local p = id and Etat.parId[id]
			if p then
				table.insert(textes, `{rang}. {p.nom}`)
			end
		end
	end
	for i, l in e.lignes do
		l.Text = textes[i] or ""
	end
end

function Ecran.mettreAJour()
	if not Etat.regarde() then
		return
	end
	local e = ecrans[Etat.pisteId]
	if e then
		remplir(e)
	end
end

return Ecran
