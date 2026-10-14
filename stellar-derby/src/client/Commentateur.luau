--!strict
-- Commentateur — le bandeau qui raconte la course.
--
-- Une phrase reste affichée au moins MIN_AFFICHAGE secondes ; une phrase
-- plus importante peut couper la parole à une moins importante. Les petits
-- faits (sprint, compétence, réaction au départ) ne sont commentés que pour
-- la joueuse et les quatre premières : sinon le bandeau défilerait sans fin.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Commentaire = require(Partage:WaitForChild("Course"):WaitForChild("Commentaire"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local MIN_AFFICHAGE = 1.6
local DUREE_AFFICHAGE = 3.2
local PETITS_FAITS = { sprint = true, competence = true, reaction = true, epuisee = true }

local Commentateur = {}

local bandeau: Frame
local texte: TextLabel
local prioriteActuelle = 0
local depuis = 0

local function nom(id: number?): string
	local p = id and Etat.parId[id]
	return if p then p.nom else "?"
end

local function tete(): string?
	for id, e in Rendu.affiche do
		if e.rang == 1 then
			return nom(id)
		end
	end
	return nil
end

local function afficher(ligne: Commentaire.Ligne)
	local t = os.clock()
	local occupe = t - depuis < MIN_AFFICHAGE
	if occupe and ligne.priorite < prioriteActuelle then
		return
	end
	prioriteActuelle = ligne.priorite
	depuis = t
	texte.Text = ligne.texte
	bandeau.Visible = true
	bandeau.BackgroundColor3 = if ligne.priorite >= 3 then Couleurs.ROSE else Couleurs.FOND_SOMBRE
	local echelle = bandeau:FindFirstChildOfClass("UIScale") :: UIScale?
	if echelle then
		echelle.Scale = 1.12
		TweenService:Create(echelle, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	end
end

local function pertinent(e: { [string]: any }): boolean
	if not PETITS_FAITS[e.genre] then
		return true
	end
	if e.id == Etat.monId then
		return true
	end
	local affiche = e.id and Rendu.affiche[e.id]
	return affiche ~= nil and affiche.rang <= 4
end

function Commentateur.creer(parent: Instance)
	bandeau = Ui.cadre(
		parent,
		"Commentateur",
		UDim2.fromOffset(560, 40),
		UDim2.new(0.5, 0, 0, 92),
		Couleurs.FOND_SOMBRE,
		0.15
	)
	bandeau.AnchorPoint = Vector2.new(0.5, 0)
	bandeau.Visible = false
	Ui.coins(bandeau, 20)
	Instance.new("UIScale").Parent = bandeau
	texte = Ui.texte(bandeau, "Texte", "", 20, Couleurs.BLANC)
	texte.Size = UDim2.fromScale(1, 1)
	local limite = Instance.new("UITextSizeConstraint")
	limite.MaxTextSize = 20
	limite.Parent = texte
	texte.TextScaled = true

	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		local contexte: Commentaire.Contexte = {
			nom = nom,
			course = (Etat.course() or { nom = "la course" }).nom,
			tete = tete(),
		}
		for _, e in lot do
			if pertinent(e) then
				local ligne = Commentaire.ligne(e, contexte, math.random(1, 1000))
				if ligne then
					afficher(ligne)
				end
			end
		end
	end)
	Etat.ecouter("phase", function(phase: string)
		if phase == "lobby" or phase == "presentation" then
			bandeau.Visible = false
			prioriteActuelle = 0
		end
	end)
end

function Commentateur.mettreAJour()
	if bandeau and bandeau.Visible and os.clock() - depuis > DUREE_AFFICHAGE then
		bandeau.Visible = false
		prioriteActuelle = 0
	end
end

return Commentateur
