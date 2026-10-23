--!strict
-- Sons — musique pendant la course, foule à l'arrivée, fanfare au podium.
-- Les identifiants sont dans Config.SONS ; un son qui ne charge pas ne
-- gêne rien, il reste muet.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Partage"):WaitForChild("Config"))

local Etat = require(script.Parent:WaitForChild("Etat"))

local Sons = {}

local function son(nom: string, id: string, volume: number, boucle: boolean): Sound?
	if id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = nom
	s.SoundId = id
	s.Volume = volume
	s.Looped = boucle
	s.Parent = SoundService
	return s
end

local musique: Sound?
local foule: Sound?
local fanfare: Sound?

local function fondu(s: Sound?, volume: number, duree: number, arreter: boolean)
	if not s then
		return
	end
	local tween = TweenService:Create(s, TweenInfo.new(duree), { Volume = volume })
	tween:Play()
	if arreter then
		tween.Completed:Once(function()
			s:Stop()
		end)
	end
end

function Sons.demarrer()
	musique = son("MusiqueCourse", Config.SONS.musiqueCourse, Config.VOLUME_MUSIQUE, true)
	foule = son("Foule", Config.SONS.foule, 0.6, false)
	fanfare = son("Fanfare", Config.SONS.fanfare, 0.7, false)

	Etat.ecouter("phase", function(phase: string)
		local m = musique
		if phase == "stalles" and m and not m.IsPlaying then
			m.Volume = Config.VOLUME_MUSIQUE
			m.TimePosition = 0
			m:Play()
		elseif phase == "resultats" then
			fondu(m, 0, 1.5, true)
			local f = fanfare
			if f then
				f:Play()
			end
		elseif (phase == "lobby" or phase == "aucune" or phase == "fin") and m and m.IsPlaying then
			fondu(m, 0, 1, true)
		end
	end)
	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		for _, e in lot do
			if e.genre == "arrivee" and e.rang == 1 then
				local f = foule
				if f then
					f:Play()
				end
			end
		end
	end)
end

return Sons
