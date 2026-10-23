--!nocheck
-- Essai du jeu complet, hors de Roblox.
--
-- Le serveur ET le client du jeu tournent ensemble dans Lune, sur la place
-- construite par Rojo, avec une joueuse factice. Les services Roblox qui
-- n'existent pas hors ligne sont simulés : signaux, tweens, sons,
-- animations, réseau (FireServer, FireClient, InvokeServer vont
-- directement de l'un à l'autre). Les durées des phases sont raccourcies et
-- le temps de course accéléré.
--
-- Le scénario : la joueuse arrive, on ouvre chaque écran de l'Académie et on
-- appuie sur tous les boutons, on joue un peu de chaque mini-jeu, on court
-- une course libre jusqu'au concert, on crée une carrière… À la fin, la
-- liste des erreurs d'exécution. Ce n'est pas Studio : rien sur le rendu
-- ni le ressenti, mais les erreurs de code y passent.
--
--     rojo build default.project.json -o essai.rbxl
--     lune run tools/decor essai.rbxl
--     lune run tools/essai-jeu essai.rbxl

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local taches = require("@lune/task")

local chemin = process.args[1] or "build/StellarDerby.rbxl"
local place = roblox.deserializePlace(fs.readFile(chemin))
local Enum = roblox.Enum

-- Lune ne déduit pas Position du CFrame des pièces lues dans la place
for _, i in place:GetDescendants() do
	if i:IsA("BasePart") then
		pcall(function()
			i.Position = i.CFrame.Position
		end)
	end
end

local erreurs: { string } = {}
local avertissements: { string } = {}
local function noter(message: string)
	-- Une même erreur ne compte qu'une fois
	for _, e in erreurs do
		if e == message then
			return
		end
	end
	table.insert(erreurs, message)
	print(`  ✗ {message}`)
end

-- ─────────────────────────────── Tâches surveillées ───────────────────────────────
-- Les erreurs des fils lancés par le jeu sont attrapées et notées.

local function surveille(f, ...)
	local ok, e = pcall(f, ...)
	if not ok then
		noter(tostring(e))
	end
end

local task = {
	wait = taches.wait,
	cancel = taches.cancel,
	spawn = function(f, ...)
		if type(f) == "thread" then
			return taches.spawn(f, ...)
		end
		return taches.spawn(surveille, f, ...)
	end,
	defer = function(f, ...)
		return taches.defer(surveille, f, ...)
	end,
	delay = function(d, f, ...)
		return taches.delay(d, surveille, f, ...)
	end,
}

-- ─────────────────────────────── Signaux factices ───────────────────────────────

local Signal = {}
Signal.__index = Signal

local function signal(nom: string)
	return setmetatable({ nom = nom, connexions = {} }, Signal)
end

function Signal:Connect(f)
	local c = { f = f, actif = true }
	table.insert(self.connexions, c)
	return {
		Connected = true,
		Disconnect = function()
			c.actif = false
		end,
	}
end

function Signal:Once(f)
	local c
	c = self:Connect(function(...)
		c.Disconnect()
		f(...)
	end)
	return c
end

function Signal:Wait()
	return taches.wait()
end

function Signal:Fire(...)
	local args = table.pack(...)
	for _, c in table.clone(self.connexions) do
		if c.actif then
			taches.spawn(function()
				local ok, e = pcall(c.f, table.unpack(args, 1, args.n))
				if not ok then
					noter(`{self.nom} : {e}`)
				end
			end)
		end
	end
end

-- Un signal par instance et par nom d'événement
local signaux = {}
local numeros = 0
local function cle(instance): number
	local id = instance:GetAttribute("EssaiId")
	if not id then
		numeros += 1
		id = numeros
		instance:SetAttribute("EssaiId", id)
	end
	return id
end
local function signalDe(instance, nom: string)
	local k = `{cle(instance)}:{nom}`
	local s = signaux[k]
	if not s then
		s = signal(`{instance.Name}.{nom}`)
		signaux[k] = s
	end
	return s
end
local function evenement(classe: string, nom: string)
	roblox.implementProperty(classe, nom, function(instance)
		return signalDe(instance, nom)
	end)
end

for _, n in
	{
		"DescendantAdded",
		"DescendantRemoving",
		"ChildAdded",
		"ChildRemoved",
		"Destroying",
		"AncestryChanged",
		"Changed",
	}
do
	evenement("Instance", n)
end
for _, n in { "Activated", "MouseButton1Click", "MouseButton1Down", "MouseButton1Up" } do
	evenement("GuiButton", n)
end
for _, n in { "InputBegan", "InputEnded", "InputChanged", "MouseEnter", "MouseLeave" } do
	evenement("GuiObject", n)
end
evenement("TextBox", "FocusLost")
evenement("TextBox", "Focused")
evenement("RemoteEvent", "OnClientEvent")
evenement("RemoteEvent", "OnServerEvent")
evenement("UnreliableRemoteEvent", "OnClientEvent")
evenement("UnreliableRemoteEvent", "OnServerEvent")
evenement("Players", "PlayerAdded")
evenement("Players", "PlayerRemoving")
evenement("ProximityPrompt", "Triggered")

-- Les signaux de changement : Lune ne les déclenche pas, on surveille donc
-- les valeurs à chaque image et on prévient ceux qui écoutent.
local surveilles = {}
local function surveiller(instance, nom: string, lire)
	local k = `{cle(instance)}:surveille:{nom}`
	local s = signaux[k]
	if not s then
		s = signal(`{instance.Name}.{nom} (changement)`)
		signaux[k] = s
		local ok, v = pcall(lire)
		table.insert(surveilles, { signal = s, lire = lire, valeur = if ok then v else nil })
	end
	return s
end
local function verifierChangements()
	for _, w in surveilles do
		local ok, v = pcall(w.lire)
		if ok and v ~= w.valeur then
			w.valeur = v
			w.signal:Fire()
		end
	end
end
roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(instance, nom)
	return surveiller(instance, "propriete:" .. nom, function()
		return instance[nom]
	end)
end)
roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(instance, nom)
	return surveiller(instance, "attribut:" .. nom, function()
		return instance:GetAttribute(nom)
	end)
end)
roblox.implementMethod("Instance", "WaitForChild", function(instance, nom, delai)
	local fin = os.clock() + (delai or 5)
	repeat
		local enfant = instance:FindFirstChild(nom)
		if enfant then
			return enfant
		end
		taches.wait(0.05)
	until os.clock() > fin
	if not delai then
		noter(`WaitForChild : {instance:GetFullName()} n'a pas d'enfant « {nom} »`)
	end
	return nil
end)

-- Le terrain ne se remplit pas hors ligne
for _, m in { "FillBlock", "FillCylinder", "FillBall", "SetMaterialColor", "Clear" } do
	roblox.implementMethod("Terrain", m, function() end)
end

-- ─────────────────────────────── Le joueur factice ───────────────────────────────

local Players = place:GetService("Players")
local joueur = roblox.Instance.new("Player")
joueur.Name = "Testeuse"
local USERID = 1001
joueur.UserId = USERID
joueur.DisplayName = "Testeuse"
roblox.implementMethod("Player", "Kick", function() end)
local playerGui = roblox.Instance.new("PlayerGui")
playerGui.Parent = joueur
Players.LocalPlayer = joueur
roblox.implementMethod("Players", "GetPlayers", function()
	return if joueur.Parent then { joueur } else {}
end)
roblox.implementMethod("Players", "GetPlayerByUserId", function(_, id)
	return if id == USERID and joueur.Parent then joueur else nil
end)
roblox.implementMethod("Players", "GetHumanoidDescriptionFromUserIdAsync", function()
	error("pas d'avatar hors ligne")
end)
-- Un personnage R15 réduit à l'essentiel : de quoi habiller et animer une coureuse
local function personnage()
	local m = roblox.Instance.new("Model")
	m.Name = "Personnage"
	local h = roblox.Instance.new("Humanoid")
	h.Parent = m
	roblox.Instance.new("Animator").Parent = h
	for _, def in
		{
			{ "HumanoidRootPart", roblox.Vector3.new(2, 2, 1), 3 },
			{ "LowerTorso", roblox.Vector3.new(2, 0.4, 1), 2.8 },
			{ "UpperTorso", roblox.Vector3.new(2, 1.6, 1), 3.8 },
			{ "Head", roblox.Vector3.new(1.2, 1.2, 1.2), 5.2 },
			{ "LeftFoot", roblox.Vector3.new(0.8, 0.3, 1), 0.15 },
			{ "RightFoot", roblox.Vector3.new(0.8, 0.3, 1), 0.15 },
		}
	do
		local p = roblox.Instance.new("Part")
		p.Name = def[1]
		p.Size = def[2]
		p.CFrame = roblox.CFrame.new(0, def[3], 0)
		p.Parent = m
	end
	m.PrimaryPart = m.HumanoidRootPart
	return m
end
roblox.implementMethod("Players", "CreateHumanoidModelFromDescriptionAsync", function()
	return personnage()
end)
roblox.implementMethod("Players", "CreateHumanoidModelFromDescription", function()
	return personnage()
end)
roblox.implementMethod("Players", "GetNameFromUserIdAsync", function()
	return "Inconnue"
end)
roblox.implementMethod("Players", "GetUserIdFromNameAsync", function()
	return 42
end)

-- ─────────────────────────────── Réseau ───────────────────────────────

local rappels = {}
roblox.implementProperty("RemoteFunction", "OnServerInvoke", function(instance)
	return rappels[cle(instance)]
end, function(instance, f)
	rappels[cle(instance)] = f
end)
roblox.implementMethod("RemoteFunction", "InvokeServer", function(instance, ...)
	local f = rappels[cle(instance)]
	assert(f, "aucun serveur ne répond")
	return f(joueur, ...)
end)
local envois = 0
for _, classe in { "RemoteEvent", "UnreliableRemoteEvent" } do
	roblox.implementMethod(classe, "FireServer", function(instance, ...)
		envois += 1
		signalDe(instance, "OnServerEvent"):Fire(joueur, ...)
	end)
	roblox.implementMethod(classe, "FireClient", function(instance, _p, ...)
		signalDe(instance, "OnClientEvent"):Fire(...)
	end)
	roblox.implementMethod(classe, "FireAllClients", function(instance, ...)
		signalDe(instance, "OnClientEvent"):Fire(...)
	end)
end

-- ─────────────────────────────── Services simulés ───────────────────────────────

local heartbeat = signal("Heartbeat")
local renderStepped = signal("RenderStepped")
local rendus = {}

local function runService(serveur: boolean)
	return {
		Heartbeat = heartbeat,
		RenderStepped = renderStepped,
		Stepped = heartbeat,
		IsServer = function()
			return serveur
		end,
		IsClient = function()
			return not serveur
		end,
		IsStudio = function()
			return true
		end,
		IsRunning = function()
			return true
		end,
		BindToRenderStep = function(_, nom, _priorite, f)
			rendus[nom] = f
		end,
		UnbindFromRenderStep = function(_, nom)
			rendus[nom] = nil
		end,
	}
end

local entree = {
	InputBegan = signal("UIS.InputBegan"),
	InputEnded = signal("UIS.InputEnded"),
	InputChanged = signal("UIS.InputChanged"),
	TouchStarted = signal("UIS.TouchStarted"),
	TouchEnded = signal("UIS.TouchEnded"),
	TouchEnabled = true,
	KeyboardEnabled = true,
	GamepadEnabled = false,
	GetFocusedTextBox = function()
		return nil
	end,
}

local function tween(instance, _info, proprietes)
	local t = { Completed = signal("Tween.Completed"), PlaybackState = Enum.PlaybackState.Begin }
	function t:Play()
		for k, v in proprietes do
			local ok, e = pcall(function()
				instance[k] = v
			end)
			if not ok then
				noter(`Tween sur {instance.ClassName}.{k} : {e}`)
			end
		end
		taches.defer(function()
			t.Completed:Fire(Enum.PlaybackState.Completed)
		end)
	end
	function t:Cancel() end
	function t:Pause() end
	return t
end

local services = {
	TweenService = {
		Create = function(_, instance, info, proprietes)
			return tween(instance, info, proprietes)
		end,
	},
	ContextActionService = {
		BindAction = function() end,
		BindActionAtPriority = function() end,
		UnbindAction = function() end,
	},
	ProximityPromptService = { PromptTriggered = signal("PromptTriggered") },
	HttpService = {
		JSONEncode = function(_, v)
			return serde.encode("json", v)
		end,
		JSONDecode = function(_, s)
			return serde.decode("json", s)
		end,
		GenerateGUID = function()
			return `essai-{math.random(1, 1e9)}`
		end,
		UrlEncode = function(_, s)
			return s
		end,
		HttpEnabled = false,
		GetAsync = function()
			error("pas de réseau hors ligne")
		end,
	},
	DataStoreService = {
		GetDataStore = function()
			error("pas de DataStore hors ligne")
		end,
		GetOrderedDataStore = function()
			error("pas de DataStore hors ligne")
		end,
	},
	MarketplaceService = {
		PromptProductPurchase = function() end,
	},
	TextService = {
		FilterStringAsync = function()
			error("pas de filtre hors ligne")
		end,
	},
	UserInputService = entree,
}

local horlogeDebut = os.time()
roblox.implementMethod("Workspace", "GetServerTimeNow", function()
	return horlogeDebut + os.clock()
end)
local camera = roblox.Instance.new("Camera")
camera.Parent = place:GetService("Workspace")
camera.ViewportSize = roblox.Vector2.new(1280, 720)
place:GetService("Workspace").CurrentCamera = camera
roblox.implementMethod("Sound", "Play", function(son)
	son.IsPlaying = true
end)
roblox.implementMethod("Sound", "Resume", function(son)
	son.IsPlaying = true
end)
roblox.implementMethod("Sound", "Stop", function(son)
	son.IsPlaying = false
end)
roblox.implementMethod("Sound", "Pause", function(son)
	son.IsPlaying = false
end)

-- Les propriétés que Roblox calcule (et que Lune ne connaît pas) reçoivent
-- une valeur à la création de l'instance
local function nouvelleInstance(classe, parent)
	local i = roblox.Instance.new(classe)
	if classe == "Sound" then
		i.IsPlaying = false
		i.IsLoaded = true
		i.TimeLength = 60
	elseif classe == "HumanoidDescription" then
		for _, champ in
			{
				"HatAccessory",
				"HairAccessory",
				"FaceAccessory",
				"NeckAccessory",
				"ShouldersAccessory",
				"FrontAccessory",
				"BackAccessory",
				"WaistAccessory",
			}
		do
			i[champ] = ""
		end
	end
	if parent then
		i.Parent = parent
	end
	return i
end
local InstanceSimule = { new = nouvelleInstance }

-- Roblox arrondit les décalages en pixels ; Lune refuse les nombres à virgule
local function entier(v)
	if v ~= v or v == math.huge or v == -math.huge then
		return 0
	end
	return math.floor(v + 0.5)
end
local UDim2Simule = {
	new = function(xs, xo, ys, yo)
		return roblox.UDim2.new(xs or 0, entier(xo or 0), ys or 0, entier(yo or 0))
	end,
	fromOffset = function(x, y)
		return roblox.UDim2.fromOffset(entier(x or 0), entier(y or 0))
	end,
	fromScale = function(x, y)
		return roblox.UDim2.fromScale(x or 0, y or 0)
	end,
}
local UDimSimule = {
	new = function(sc, of)
		return roblox.UDim.new(sc or 0, entier(of or 0))
	end,
}
local function piste()
	local p = { Looped = false, Priority = Enum.AnimationPriority.Core, IsPlaying = false, Speed = 1, TimePosition = 0 }
	function p:Play()
		p.IsPlaying = true
	end
	function p:Stop()
		p.IsPlaying = false
	end
	function p:AdjustSpeed(v)
		p.Speed = v
	end
	function p:AdjustWeight() end
	return p
end
roblox.implementMethod("Animator", "LoadAnimation", function()
	return piste()
end)
roblox.implementMethod("Animator", "GetPlayingAnimationTracks", function()
	return {}
end)
roblox.implementMethod("Humanoid", "LoadAnimation", function()
	return piste()
end)
roblox.implementMethod("Model", "PivotTo", function(modele, cadre)
	local p = modele.PrimaryPart
	if p then
		p.CFrame = cadre
	end
end)
roblox.implementMethod("Model", "GetPivot", function(modele)
	local p = modele.PrimaryPart
	return if p then p.CFrame else roblox.CFrame.new()
end)

local function service(serveur: boolean, nom: string)
	if nom == "RunService" then
		return runService(serveur)
	end
	return services[nom] or place:GetService(nom)
end

local function jeu(serveur: boolean)
	return setmetatable({}, {
		__index = function(_, k)
			if k == "GetService" then
				return function(_, nom)
					return service(serveur, nom)
				end
			elseif k == "BindToClose" then
				return function() end
			elseif k == "PrivateServerId" then
				return ""
			elseif k == "PrivateServerOwnerId" then
				return 0
			elseif k == "JobId" then
				return if serveur then "essai-serveur" else ""
			elseif k == "PlaceId" or k == "GameId" or k == "CreatorId" then
				return 0
			end
			local v = place[k]
			if type(v) == "function" then
				return function(_, ...)
					return v(place, ...)
				end
			end
			return v
		end,
	})
end

local Random = {
	new = function(_graine)
		return {
			NextInteger = function(_, a, b)
				return math.random(a, b)
			end,
			NextNumber = function(_, a, b)
				a, b = a or 0, b or 1
				return a + (b - a) * math.random()
			end,
		}
	end,
}

local TweenInfo = {
	new = function(...)
		return { ... }
	end,
}

-- ─────────────────────────────── Chargement des modules ───────────────────────────────

local function environnement(serveur: boolean)
	return {
		game = jeu(serveur),
		workspace = place:GetService("Workspace"),
		Instance = InstanceSimule,
		Vector3 = roblox.Vector3,
		Vector2 = roblox.Vector2,
		CFrame = roblox.CFrame,
		Color3 = roblox.Color3,
		UDim = UDimSimule,
		UDim2 = UDim2Simule,
		Enum = Enum,
		Font = roblox.Font,
		NumberSequence = roblox.NumberSequence,
		NumberSequenceKeypoint = roblox.NumberSequenceKeypoint,
		ColorSequence = roblox.ColorSequence,
		ColorSequenceKeypoint = roblox.ColorSequenceKeypoint,
		NumberRange = roblox.NumberRange,
		Rect = roblox.Rect,
		TweenInfo = TweenInfo,
		Random = Random,
		task = task,
		warn = function(...)
			local morceaux = {}
			for _, v in { ... } do
				table.insert(morceaux, tostring(v))
			end
			table.insert(avertissements, table.concat(morceaux, " "))
		end,
	}
end

local function chargeur(serveur: boolean)
	local cache = {}
	local env = environnement(serveur)
	local function exiger(module)
		if cache[module] ~= nil then
			return cache[module]
		end
		local e = table.clone(env)
		e.script = module
		e.require = exiger
		local f = luau.load(module.Source, { debugName = module:GetFullName(), environment = e })
		cache[module] = f()
		return cache[module]
	end
	local function lancer(script)
		local e = table.clone(env)
		e.script = script
		e.require = exiger
		local f = luau.load(script.Source, { debugName = script:GetFullName(), environment = e })
		task.spawn(f)
	end
	return exiger, lancer
end

local exigerServeur, lancerServeur = chargeur(true)
local exigerClient, lancerClient = chargeur(false)

local RS = place:GetService("ReplicatedStorage")
local serveurDossier = place:GetService("ServerScriptService").Serveur
local clientDossier = place:GetService("StarterPlayer").StarterPlayerScripts.Client

-- Des parties plus courtes (le temps de course, lui, est accéléré)
local function raccourcir(config)
	config.DUREE_ATTENTE_SEUL = 1
	config.DUREE_LOBBY = 1
	config.DUREE_LOBBY_SEUL = 1
	config.DUREE_PRESENTATION = 0.5
	config.DUREE_STALLES = 0.5
	config.DUREE_RESULTATS = 1
	config.SAUVEGARDE_AUTO = 1000
end
raccourcir(exigerServeur(RS.Partage.Config))
raccourcir(exigerClient(RS.Partage.Config))
for _, exiger in { exigerServeur, exigerClient } do
	local Concert = exiger(RS.Partage.Jeu.Concert)
	Concert.INTRO, Concert.DUREE, Concert.FINALE = 0.5, 6, 2.5
end

-- ─────────────────────────────── Le scénario ───────────────────────────────

local function etape(titre: string)
	print(`\n▶ {titre}`)
end

-- Fait tourner le monde : le serveur et le client avancent de `secondes`
-- (temps de jeu), avec des pas de `dt`.
local function avancer(secondes: number, dt: number?)
	local pas = dt or 1 / 30
	local n = math.ceil(secondes / pas)
	for i = 1, n do
		heartbeat:Fire(pas)
		renderStepped:Fire(pas)
		for _, f in rendus do
			local ok, e = pcall(f, pas)
			if not ok then
				noter(`rendu : {e}`)
			end
		end
		if i % 4 == 0 then
			verifierChangements()
			taches.wait()
		end
	end
	verifierChangements()
	taches.wait()
end

local function attendre(secondes: number)
	local fin = os.clock() + secondes
	while os.clock() < fin do
		avancer(0.1)
	end
end

etape("Démarrage du serveur")
local principalServeur = serveurDossier:FindFirstChild("Principal")
lancerServeur(principalServeur)
attendre(1)
etape("Arrivée de la joueuse")
joueur.Parent = Players
signalDe(Players, "PlayerAdded"):Fire(joueur)
attendre(1)

etape("Démarrage du client")
lancerClient(clientDossier:FindFirstChild("Principal"))
attendre(2)

local Profils = exigerServeur(serveurDossier.Profils)
local d = Profils.obtenir(joueur)
print(if d then `  sauvegarde chargée : {d.etoiles} étoiles` else "  ✗ pas de sauvegarde")
if not d then
	noter("la sauvegarde de la joueuse n'est pas chargée")
end

local gui = playerGui:FindFirstChild("StellarDerby")
if not gui then
	noter("l'interface StellarDerby n'existe pas")
end

-- Appuie sur un bouton (comme un doigt : Activated)
local function appuyer(bouton)
	signalDe(bouton, "Activated"):Fire()
end

local function boutonsVisibles(racine)
	local liste = {}
	for _, b in racine:GetDescendants() do
		if b:IsA("GuiButton") then
			local visible = true
			local p = b
			while p and p ~= racine do
				if p:IsA("GuiObject") and not p.Visible then
					visible = false
					break
				end
				p = p.Parent
			end
			if visible then
				table.insert(liste, b)
			end
		end
	end
	return liste
end

etape("Le tutoriel : la course guidée, puis la visite")
do
	local bulle = gui and gui:FindFirstChild("BulleTutoriel")
	print(`  bulle de bienvenue : {bulle and bulle.Visible}`)
	local commencer = bulle and bulle:FindFirstChild("Commencer", true)
	if commencer then
		appuyer(commencer)
	end
	local EtatClient = exigerClient(clientDossier.Etat)
	local RenduClient = exigerClient(clientDossier.Rendu)
	local vues = {}
	local finTuto = os.clock() + 60
	local derniereFraction = -1
	while os.clock() < finTuto do
		avancer(0.2, 0.1)
		local course = EtatClient.course()
		local a = RenduClient.affiche[EtatClient.monId]
		local fraction = if course and a then math.floor(10 * a.d / course.distance) / 10 else -1
		if fraction ~= derniereFraction then
			derniereFraction = fraction
			print(`    (phase {EtatClient.phase}, part de course {fraction})`)
		end
		local texte = bulle and bulle:FindFirstChild("Texte")
		if bulle and bulle.Visible and texte and not table.find(vues, texte.Text) then
			table.insert(vues, texte.Text)
		end
		if EtatClient.phase == "aucune" and #vues > 2 then
			break
		end
	end
	attendre(1.5)
	-- La visite : « Suivant » jusqu'au bout
	for _ = 1, 8 do
		local suivant = bulle and bulle:FindFirstChild("Suivant", true)
		if suivant and suivant.Visible then
			local texte = bulle:FindFirstChild("Texte")
			if texte and not table.find(vues, texte.Text) then
				table.insert(vues, texte.Text)
			end
			appuyer(suivant)
			attendre(0.3)
		end
	end
	print(`  {#vues} bulles vues :`)
	for _, v in vues do
		print(`    · {v}`)
	end
	local dt = Profils.obtenir(joueur)
	print(`  tutoriel fini : {dt and dt.tutoriel.fini}, étoiles : {dt and dt.etoiles}`)
	if not (dt and dt.tutoriel.fini) then
		noter("le tutoriel n'est pas marqué comme fini")
	end
end

etape("Les écrans de l'Académie")
local Menu = exigerClient(clientDossier.Menu)
local rangee = gui and gui:FindFirstChild("BoutonsAcademie")
local boutonsMenu = {}
if rangee then
	for _, b in rangee:GetChildren() do
		if b:IsA("GuiButton") then
			table.insert(boutonsMenu, b.Name)
		end
	end
end
table.sort(boutonsMenu)
print(`  boutons du menu : {table.concat(boutonsMenu, ", ")}`)
for _, nom in boutonsMenu do
	appuyer(rangee:FindFirstChild(nom))
	attendre(0.3)
	-- Dans l'écran ouvert, on appuie sur chaque bouton visible (sauf ceux
	-- qui lancent une longue activité, essayés à part)
	local ouverts = 0
	for _, panneau in gui:GetChildren() do
		if
			panneau:IsA("Frame")
			and panneau.Visible
			and panneau.Name ~= "BoutonsAcademie"
			and panneau.Name ~= "BarreAcademie"
		then
			ouverts += 1
			for _, b in boutonsVisibles(panneau) do
				local n = b.Name
				if n ~= "Jouer" and n ~= "Commencer" and n ~= "Courir" and n ~= "Regarder" and n ~= "Fermer" then
					appuyer(b)
				end
			end
		end
	end
	attendre(0.4)
	print(`  {nom} : {ouverts} panneau(x) ouvert(s)`)
	Menu.fermer()
end

etape("Les cinq mini-jeux (quelques secondes chacun)")
local EcranEntrainement = exigerClient(clientDossier.EcranEntrainement)
local fondJeu = gui and gui:FindFirstChild("Entrainement")
for _, stat in { "vitesse", "souffle", "puissance", "coeur", "instinct" } do
	local fini = false
	task.spawn(function()
		EcranEntrainement.jouer(stat, "libre")
		fini = true
	end)
	-- La consigne et le 3-2-1 (4,1 s), puis un peu de jeu avec des appuis
	attendre(4.4)
	for _ = 1, 6 do
		entree.InputBegan:Fire({ UserInputType = Enum.UserInputType.Touch, KeyCode = Enum.KeyCode.Space }, false)
		attendre(0.15)
		entree.InputEnded:Fire({ UserInputType = Enum.UserInputType.Touch, KeyCode = Enum.KeyCode.Space }, false)
		attendre(0.1)
	end
	local abandon = fondJeu and fondJeu:FindFirstChild("Abandonner")
	if abandon then
		appuyer(abandon)
	end
	attendre(0.6)
	print(`  {stat} : {if fini then "abandonné proprement" else "toujours en cours"}`)
	if not fini then
		noter(`le mini-jeu {stat} ne s'arrête pas après « Abandonner »`)
	end
end

etape("Une partie complète de mini-jeu (souffle, 20 s)")
do
	local fini, reponse = false, nil
	task.spawn(function()
		reponse = EcranEntrainement.jouer("souffle", "libre")
		fini = true
	end)
	attendre(4.3 + 20.5)
	local finEcran = fondJeu and fondJeu:FindFirstChild("Fin")
	local continuer = finEcran and finEcran:FindFirstChild("Continuer")
	if continuer then
		appuyer(continuer)
	end
	attendre(0.5)
	print(
		`  terminé : {fini}, réponse : {if reponse then `note {reponse.note}, +{reponse.etoiles} ★` else "aucune"}`
	)
	if not reponse then
		noter("le mini-jeu souffle n'a pas été compté par le serveur")
	end
end

etape("La boutique : acheter et porter une tenue")
local Requetes = exigerClient(clientDossier.Requetes)
do
	Profils.crediter(joueur, 1000, 0, "Essai")
	local achat = Requetes.envoyer("boutique.acheter", { categorie = "tenues", id = "marine" })
	local port = Requetes.envoyer("boutique.equiper", { categorie = "tenues", id = "marine" })
	print(`  acheter : {achat.ok} {achat.erreur or ""} · porter : {port.ok} {port.erreur or ""}`)
end

etape("Une course libre, jusqu'au concert")
local r = Requetes.envoyer("course.rejoindre", { piste = "archipel" })
print(`  rejoindre : {r.ok} {r.erreur or ""}`)
local Etat = exigerClient(clientDossier.Etat)
local phases = {}
local derniere = ""
local echarpes = 0
local fin = os.clock() + 90
while os.clock() < fin do
	avancer(0.2, 0.2)
	if Etat.phase ~= derniere then
		derniere = Etat.phase
		table.insert(phases, derniere)
		if derniere == "course" then
			for _, i in place:GetDescendants() do
				if i.Name == "Echarpe" then
					echarpes += 1
				end
			end
		end
		if derniere == "lobby" then
			-- Prête tout de suite
			local lobby = gui and gui:FindFirstChild("Lobby", true)
			local pret = lobby and lobby:FindFirstChild("Pret", true)
			if pret then
				appuyer(pret)
			end
		elseif derniere == "concert" then
			-- Quelques notes et ovations
			for _ = 1, 8 do
				entree.InputBegan:Fire({ UserInputType = Enum.UserInputType.Keyboard, KeyCode = Enum.KeyCode.D }, false)
				local ovation = gui and gui:FindFirstChild("Ovation", true)
				if ovation then
					appuyer(ovation)
				end
				attendre(0.2)
			end
		end
	end
	if #phases > 1 and derniere == "lobby" and table.find(phases, "resultats") then
		break
	end
end
print(`  phases vues : {table.concat(phases, " → ")}`)
-- La tenue est-elle dessinée sur la coureuse de la joueuse (le modèle du
-- serveur et sa copie chez le client : deux bandes chacun) ?
print(`  écharpes de tenue vues pendant la course : {echarpes}`)
if echarpes == 0 then
	noter("la tenue équipée n'apparaît pas sur la coureuse")
end
for _, attendue in { "presentation", "course", "resultats", "concert" } do
	if not table.find(phases, attendue) then
		noter(`la course libre n'est pas passée par la phase « {attendue} »`)
	end
end
d = Profils.obtenir(joueur)
print(
	`  après la course : {d and d.stats.courses or "?"} course(s), {d and d.etoiles or "?"} étoiles, {d and d.stats.concerts or "?"} concert(s)`
)
Requetes.envoyer("course.quitter")
attendre(1)

etape("Une carrière : création, un tour, un événement")
local Carriere = exigerServeur(RS.Partage.Jeu.Carriere)
local creee = Requetes.envoyer("carriere.creer", {
	nom = Carriere.NOMS[1],
	robe = "bai",
	strategie = "vague",
	profil = "equilibree",
	inspirations = {},
})
print(`  créer : {creee.ok} {creee.erreur or ""}`)
local action = Requetes.envoyer("carriere.action", { action = "repos" })
print(`  se reposer : {action.ok} {action.erreur or ""}`)
attendre(0.6)
local EcranCarriere = exigerClient(clientDossier.EcranCarriere)
EcranCarriere.ouvrir()
attendre(0.5)
local tableau = gui and gui:FindFirstChild("Carriere")
print(`  tableau de bord visible : {tableau and tableau.Visible}`)
do
	local fini = false
	task.spawn(function()
		EcranEntrainement.jouer("instinct", "carriere")
		fini = true
	end)
	attendre(4.3)
	local abandon = fondJeu and fondJeu:FindFirstChild("Abandonner")
	if abandon then
		appuyer(abandon)
	end
	attendre(0.5)
	print(`  entraînement de carrière lancé puis abandonné : {fini}`)
end
-- Jusqu'au tour 4 (course-objectif), en répondant aux événements
for _ = 1, 8 do
	local c = Profils.obtenir(joueur).carriere
	if not c or c.tour >= 4 then
		break
	end
	if c.evenement then
		local rc = Requetes.envoyer("carriere.choix", { choix = 1 })
		print(`  événement « {c.evenement} » : {rc.ok}`)
	else
		Requetes.envoyer("carriere.action", { action = "sortie" })
	end
end
local avant = Profils.obtenir(joueur).carriere
if avant and avant.evenement then
	-- Un événement attend : on y répond d'abord (la course ne part pas avant)
	Requetes.envoyer("carriere.choix", { choix = 1 })
	avant = Profils.obtenir(joueur).carriere
end
print(`  tour avant la course : {avant and avant.tour}`)
local cours = Requetes.envoyer("carriere.courir")
print(`  courir l'objectif : {cours.ok} {cours.erreur or ""}`)
do
	local finCourse = os.clock() + 60
	local phasesCarriere = {}
	local derniereCarriere = ""
	while os.clock() < finCourse do
		avancer(1, 0.2)
		if Etat.phase ~= derniereCarriere then
			derniereCarriere = Etat.phase
			table.insert(phasesCarriere, derniereCarriere)
		end
		if Etat.phase == "aucune" and #phasesCarriere > 2 then
			break
		end
	end
	print(`  phases : {table.concat(phasesCarriere, " → ")}`)
	local apres = Profils.obtenir(joueur).carriere
	local resultat = apres and apres.resultats[1]
	print(
		`  après la course : tour {apres and apres.tour or "(finie)"}, résultat : {resultat and `{resultat.rang}e, objectif {resultat.reussi}` or "?"}`
	)
	if apres and apres.tour == 4 then
		noter("la course-objectif n'a pas été comptée dans la carrière")
	end
end
local abandonner = Requetes.envoyer("carriere.abandonner")
print(`  abandonner : {abandonner.ok}`)

etape("Les signaux des fonctionnalités")
local canal = RS.Reseau.Signal
for _, s in
	{
		{ "tutoriel.proposer", {} },
		{ "duo.debut", { entraineuse = "Amie" } },
		{ "duo.ordre", { ordre = "maintenant", texte = "MAINTENANT !", juste = true } },
		{ "live.classement", { classement = { { nom = "Lea", points = 10 } }, bons = 1 } },
		{ "concert.bilan", { scene = false, gestes = 12, ambiance = 0.5, etoiles = 20, xp = 16 } },
		{
			"carriere.fin",
			{
				legende = { nom = "Aube Claire", titre = "Cœur vaillant", note = 2500, victoires = 0 },
				etoiles = 166,
				xp = 416,
				fin = "objectif",
			},
		},
	}
do
	signalDe(canal, "OnClientEvent"):Fire(s[1], s[2])
	attendre(0.3)
end
local notification = RS.Reseau.Notification
for _, genre in { "info", "gain", "niveau", "alerte", "titre" } do
	signalDe(notification, "OnClientEvent"):Fire(`Essai {genre}`, genre)
end
attendre(1)

etape("Départ de la joueuse")
signalDe(Players, "PlayerRemoving"):Fire(joueur)
attendre(0.5)
joueur.Parent = nil
attendre(0.5)

print(`\n{envois} envois du client au serveur.`)
if #avertissements > 0 then
	-- Regroupés : un même avertissement n'apparaît qu'une fois, avec son nombre
	local comptes, ordre = {}, {}
	for _, a in avertissements do
		local court = string.gsub(a, "%d+", "#")
		if not comptes[court] then
			comptes[court] = 0
			table.insert(ordre, { court = court, texte = a })
		end
		comptes[court] += 1
	end
	print(`\n{#avertissements} avertissement(s) du jeu :`)
	for _, o in ordre do
		print(`  ! ({comptes[o.court]}×) {o.texte}`)
	end
end
print(`\n{#erreurs} erreur(s).`)
process.exit(if #erreurs == 0 then 0 else 1)
