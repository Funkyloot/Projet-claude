--!strict
-- Sons — les musiques, les ambiances et les petits sons du jeu.
--
--   musiques   une seule à la fois, en fondu : douce à l'Académie, entraînante
--              pendant la course, la fanfare à l'arrivée ; rien pendant le
--              concert (il a sa propre chanson)
--   ambiance   pendant les courses, très bas : des oiseaux à l'Archipel, des
--              vagues à la Baie, le vent aux Falaises
--   effets     le sifflet du départ, le souffle du sprint, la foule à
--              l'arrivée ; le clic des boutons, la pièce d'un gain, la fanfare
--              d'un niveau, le ding d'un titre
--
-- Les volumes suivent les réglages du joueur (musique et sons, de 0 à 1).
-- Les identifiants sont dans Config.SONS (bibliothèque sous licence de
-- Roblox : APM, ProSoundEffects) ; un son qui ne charge pas reste muet.
-- Les autres modules jouent un effet avec Sons.jouer("clic"), etc.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Reseau = require(Partage:WaitForChild("Reseau"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Profil = require(script.Parent:WaitForChild("Profil"))

local Sons = {}

local FONDU = 1.2
local VOLUME_AMBIANCE = 0.35 -- par rapport au volume de la musique
local AMBIANCES: { [string]: string } = {
	archipel = Config.SONS.ambianceArchipel,
	baie = Config.SONS.ambianceBaie,
	falaises = Config.SONS.ambianceFalaises,
}
-- Le volume de base de chaque effet (avant le réglage « sons »)
local EFFETS: { [string]: number } = {
	clic = 0.4,
	gain = 0.6,
	niveau = 0.7,
	titre = 0.7,
	partez = 0.6,
	sprint = 0.5,
	foule = 0.6,
}
-- Les boutons qui ne cliquent pas (mini-jeux, rythme : ils sonneraient sans arrêt)
local SANS_CLIC: { [string]: boolean } = {
	Capture = true,
	Ovation = true,
	Touche1 = true,
	Touche2 = true,
	Touche3 = true,
	Touche4 = true,
	Couloir1 = true,
	Couloir2 = true,
	Couloir3 = true,
}

local musiques: { [string]: Sound } = {}
local ambiances: { [string]: Sound } = {}
local effets: { [string]: Sound } = {}
local musiqueActuelle = "" -- "" = silence
local ambianceActuelle = ""
local branches: { [Instance]: boolean } = {}

local function reglage(cle: string, defaut: number): number
	local d = Profil.donnees
	local v = d and (d.reglages :: any)[cle]
	return if type(v) == "number" then math.clamp(v, 0, 1) else defaut
end

local function volumeMusique(): number
	return reglage("musique", Config.VOLUME_MUSIQUE)
end

local function creerSon(nom: string, id: string, boucle: boolean): Sound?
	if id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = nom
	s.SoundId = id
	s.Volume = 0
	s.Looped = boucle
	s.Parent = SoundService
	return s
end

local function fondu(s: Sound, volume: number, arreter: boolean)
	local tween = TweenService:Create(s, TweenInfo.new(FONDU), { Volume = volume })
	tween:Play()
	if arreter then
		tween.Completed:Once(function(etat: Enum.PlaybackState)
			-- Seulement si personne ne l'a relancée entre-temps
			if etat.Name == "Completed" and s.Volume <= 0.001 then
				s:Stop()
			end
		end)
	end
end

-- Passe à la musique `nom` ("" pour le silence), en fondu.
local function musique(nom: string, depuisLeDebut: boolean?)
	if nom == musiqueActuelle and not depuisLeDebut then
		return
	end
	local ancienne = musiques[musiqueActuelle]
	if ancienne and nom ~= musiqueActuelle then
		fondu(ancienne, 0, true)
	end
	musiqueActuelle = nom
	local nouvelle = musiques[nom]
	if nouvelle then
		if depuisLeDebut or not nouvelle.IsPlaying then
			nouvelle.TimePosition = 0
		end
		if not nouvelle.IsPlaying then
			nouvelle:Play()
		end
		fondu(nouvelle, volumeMusique(), false)
	end
end

local function ambiance(piste: string)
	if piste == ambianceActuelle then
		return
	end
	local ancienne = ambiances[ambianceActuelle]
	if ancienne then
		fondu(ancienne, 0, true)
	end
	ambianceActuelle = piste
	local nouvelle = ambiances[piste]
	if nouvelle then
		if not nouvelle.IsPlaying then
			nouvelle:Play()
		end
		fondu(nouvelle, volumeMusique() * VOLUME_AMBIANCE, false)
	end
end

-- Joue un effet par son nom (clic, gain, niveau, titre, partez, sprint, foule).
function Sons.jouer(nom: string)
	local s = effets[nom]
	if not s then
		return
	end
	s.Volume = (EFFETS[nom] or 0.5) * reglage("sons", 1)
	if s.Volume > 0 then
		s.TimePosition = 0
		s:Play()
	end
end

-- Les volumes changent avec les réglages
local function appliquerReglages()
	local m = musiques[musiqueActuelle]
	if m then
		m.Volume = volumeMusique()
	end
	local a = ambiances[ambianceActuelle]
	if a then
		a.Volume = volumeMusique() * VOLUME_AMBIANCE
	end
end

local function surPhase(phase: string)
	if phase == "aucune" or phase == "lobby" then
		musique("academie")
		ambiance("")
	elseif phase == "presentation" then
		musique("")
		ambiance(Etat.pisteId)
	elseif phase == "stalles" then
		musique("course", true)
		ambiance(Etat.pisteId)
	elseif phase == "course" then
		musique("course")
		ambiance(Etat.pisteId)
	elseif phase == "resultats" then
		musique("fanfare", true)
	elseif phase == "concert" or phase == "fin" then
		musique("")
		ambiance("")
	end
end

-- Un clic pour chaque bouton de l'interface, sans toucher aux autres modules.
local function brancherBouton(objet: Instance)
	if branches[objet] or not objet:IsA("GuiButton") or SANS_CLIC[objet.Name] then
		return
	end
	branches[objet] = true
	local bouton = objet :: GuiButton
	bouton.Activated:Connect(function()
		Sons.jouer("clic")
	end)
	bouton.Destroying:Connect(function()
		branches[objet] = nil
	end)
end

function Sons.demarrer()
	musiques.course = creerSon("MusiqueCourse", Config.SONS.musiqueCourse, true) :: Sound
	musiques.academie = creerSon("MusiqueAcademie", Config.SONS.musiqueAcademie, true) :: Sound
	musiques.fanfare = creerSon("Fanfare", Config.SONS.fanfare, false) :: Sound
	for piste, id in AMBIANCES do
		local s = creerSon(`Ambiance_{piste}`, id, true)
		if s then
			ambiances[piste] = s
		end
	end
	for nom in EFFETS do
		local s = creerSon(`Effet_{nom}`, (Config.SONS :: any)[nom] or "", false)
		if s then
			effets[nom] = s
		end
	end

	Etat.ecouter("phase", surPhase)
	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		for _, e in lot do
			if e.genre == "depart" then
				Sons.jouer("partez")
			elseif e.genre == "arrivee" and e.rang == 1 then
				Sons.jouer("foule")
			elseif e.genre == "sprint" and e.id == Etat.monId and Etat.monId ~= 0 then
				Sons.jouer("sprint")
			end
		end
	end)
	Reseau.notification().OnClientEvent:Connect(function(_texte: unknown, genre: unknown)
		if genre == "gain" then
			Sons.jouer("gain")
		elseif genre == "niveau" then
			Sons.jouer("niveau")
		elseif genre == "titre" then
			Sons.jouer("titre")
		end
	end)
	Profil.ecouter(appliquerReglages)

	local gui = Menu.ecran()
	if gui then
		for _, objet in gui:GetDescendants() do
			brancherBouton(objet)
		end
		gui.DescendantAdded:Connect(brancherBouton)
	end
	surPhase(Etat.phase)
end

return Sons
