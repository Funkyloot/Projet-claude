--!strict
-- RivalesMarques — les étiquettes au-dessus des coureuses du peloton.
--
--   - « RIVALE » au-dessus de mes rivales du destin (c'est local : ma rivale
--     n'est pas forcément la tienne), avec un bandeau au départ ;
--   - l'étiquette donnée par le serveur (« RIVALE » d'une carrière, invitée
--     du mode Live…), le champ `marque` des partantes.
-- Les étiquettes se posent sur les modèles locaux (Rendu.modeleDe) dès
-- qu'ils sont chargés, sans toucher à Rendu.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Rivales = require(Partage:WaitForChild("Jeu"):WaitForChild("Rivales"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))

local RivalesMarques = {}

local NOM_ETIQUETTE = "MarqueRivale"

local marques: { [number]: string } = {} -- identifiant de coureuse → texte
local annonce = "" -- course déjà annoncée (session + numéro)
local depuis = 0

local function calculer()
	table.clear(marques)
	local d = Profil.donnees
	local mesRivales: { [number]: boolean } = {}
	for _, p in Etat.peloton do
		if p.id ~= Etat.monId then
			local mienne = d ~= nil and Rivales.estRivale(d.rivales, p.nom, p.userId)
			if mienne then
				mesRivales[p.id] = true
			end
			local marque = p.marque
			if mienne then
				marques[p.id] = "RIVALE"
			elseif marque and marque ~= "" then
				marques[p.id] = marque
			end
		end
	end
	return mesRivales
end

local function poser(id: number, texte: string)
	local modele = Rendu.modeleDe(id)
	local tete = modele and modele:FindFirstChild("Head") :: BasePart?
	if not tete or tete:FindFirstChild(NOM_ETIQUETTE) then
		return
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = NOM_ETIQUETTE
	gui.Size = UDim2.fromOffset(110, 26)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 5, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = 260
	gui.LightInfluence = 0
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundColor3 = if texte == "RIVALE" then Color3.fromRGB(200, 40, 70) else Couleurs.ROSE
	t.BackgroundTransparency = 0.1
	t.TextColor3 = Couleurs.BLANC
	t.Text = texte
	t.TextScaled = true
	t.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	t.Parent = gui
	local coins = Instance.new("UICorner")
	coins.CornerRadius = UDim.new(0, 8)
	coins.Parent = t
	gui.Parent = tete
end

local function annoncer(mesRivales: { [number]: boolean })
	local cle = `{Etat.sessionId}:{Etat.numeroCourse}`
	if cle == annonce then
		return
	end
	local noms: { string } = {}
	for id in mesRivales do
		local p = Etat.parId[id]
		if p then
			table.insert(noms, p.nom)
		end
	end
	if #noms == 0 then
		return
	end
	annonce = cle
	if #noms == 1 then
		Notifications.afficher(`Ta rivale {noms[1]} est au départ !`, "alerte")
	else
		Notifications.afficher(`Tes rivales {table.concat(noms, ", ")} sont au départ !`, "alerte")
	end
end

function RivalesMarques.creer()
	Etat.ecouter("peloton", function()
		local mesRivales = calculer()
		if Etat.phase == "presentation" or Etat.phase == "stalles" or Etat.phase == "lobby" then
			annoncer(mesRivales)
		end
	end)
	Etat.ecouter("phase", function(phase: string)
		if phase == "presentation" then
			annoncer(calculer())
		end
	end)
end

-- Appelée à chaque image : on ne travaille que deux fois par seconde.
function RivalesMarques.mettreAJour()
	local t = os.clock()
	if t - depuis < 0.5 then
		return
	end
	depuis = t
	if not Etat.regarde() then
		return
	end
	for id, texte in marques do
		poser(id, texte)
	end
end

return RivalesMarques
