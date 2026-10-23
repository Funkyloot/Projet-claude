--!strict
-- Stalles — les stalles de départ, posées en travers de la piste.
--
-- Plusieurs courses peuvent se courir en même temps sur le même hippodrome
-- (courses libres, carrières, tutoriel) : chacune a ses propres stalles, et
-- c'est le client qui bâtit celles de la course qu'il regarde. Elles restent
-- donc invisibles des autres joueurs.

local Construction = require(script.Parent:WaitForChild("Construction"))
local Couleurs = require(script.Parent:WaitForChild("Couleurs"))
local Monde = require(script.Parent:WaitForChild("Monde"))
local Formules = require(script.Parent:WaitForChild("Course"):WaitForChild("Formules"))

local piece = Construction.piece
local ECHELLE = Monde.ECHELLE

local Stalles = {}

function Stalles.construire(repere: Monde.Repere, distance: number, partantes: number, parent: Instance): Model
	local modele = Instance.new("Model")
	modele.Name = "Stalles"
	local largeurPiste = repere.piste.largeur
	local s = -distance
	local ecart = Formules.ecartStalles(partantes, largeurPiste)
	local premier = Formules.couloirDepart(1, partantes, largeurPiste)
	local hauteur = 5.5
	local profondeur = 3.2
	-- Cloisons entre les stalles, et de part et d'autre
	for i = 0, partantes do
		local couloir = premier + (i - 0.5) * ecart
		piece(
			modele,
			"Cloison",
			Vector3.new(0.25, hauteur, profondeur),
			repere:cadre(s, couloir, hauteur / 2),
			Color3.fromRGB(70, 140, 90)
		)
	end
	local gauche = premier - ecart / 2
	local droite = premier + (partantes - 0.5) * ecart
	local largeur = (droite - gauche) * ECHELLE + 0.5
	local milieu = (gauche + droite) / 2
	piece(
		modele,
		"Toit",
		Vector3.new(largeur, 1, profondeur + 0.5),
		repere:cadre(s, milieu, hauteur + 0.5),
		Color3.fromRGB(60, 120, 80)
	)
	-- Les portes, devant chaque stalle, avec le numéro
	for numero = 1, partantes do
		local couloir = Formules.couloirDepart(numero, partantes, largeurPiste)
		local porte = piece(
			modele,
			"Porte",
			Vector3.new(ecart * ECHELLE - 0.3, hauteur - 1, 0.2),
			repere:cadre(s, couloir, (hauteur - 1) / 2 + 0.3) * CFrame.new(0, 0, -profondeur / 2),
			Color3.fromRGB(240, 240, 240)
		)
		porte:SetAttribute("Numero", numero)
		local cadre = Formules.cadre(numero, partantes)
		Construction.etiquette(
			porte,
			Enum.NormalId.Front,
			tostring(numero),
			Couleurs.TEXTE_CADRES[cadre],
			Couleurs.CADRES[cadre],
			20
		)
	end
	for _, p in modele:GetDescendants() do
		if p:IsA("BasePart") then
			local b = p :: BasePart
			b.CanCollide = false
			b.CanQuery = false
		end
	end
	modele.Parent = parent
	return modele
end

-- Le départ : les portes s'effacent, puis les stalles disparaissent.
function Stalles.ouvrir(modele: Model)
	for _, porte in modele:GetChildren() do
		if porte.Name == "Porte" then
			porte:Destroy()
		end
	end
	task.delay(4, function()
		if modele.Parent then
			modele:Destroy()
		end
	end)
end

return Stalles
