--!strict
-- Construction — petites briques pour bâtir le décor par le code.
--
-- Partagé : le serveur bâtit les hippodromes et l'Académie, le client bâtit
-- les stalles de la course qu'il regarde (chaque course a les siennes).

local Construction = {}

function Construction.piece(
	parent: Instance,
	nom: string,
	taille: Vector3,
	cadre: CFrame,
	couleur: Color3,
	materiau: Enum.Material?
): Part
	local p = Instance.new("Part")
	p.Name = nom
	p.Anchored = true
	p.Size = taille
	p.CFrame = cadre
	p.Color = couleur
	p.Material = materiau or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

-- Une pièce invisible qui sert de repère (point d'apparition, place sur scène…).
function Construction.repere(parent: Instance, nom: string, cadre: CFrame): Part
	local p = Construction.piece(parent, nom, Vector3.new(1, 1, 1), cadre, Color3.new(1, 1, 1))
	p.Transparency = 1
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	return p
end

function Construction.etiquette(
	support: BasePart,
	face: Enum.NormalId,
	texte: string,
	couleurTexte: Color3,
	fond: Color3?,
	pixelsParStud: number?
): TextLabel
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsParStud or 40
	gui.LightInfluence = 0.2
	gui.Parent = support
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = if fond then 0 else 1
	label.BackgroundColor3 = fond or Color3.new(1, 1, 1)
	label.Text = texte
	label.TextColor3 = couleurTexte
	label.TextScaled = true
	label.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	label.Parent = gui
	return label
end

-- Une invite d'interaction (touche E, ou appui sur téléphone). L'attribut
-- « Action » dit au client quoi ouvrir : voir client/Interactions.
function Construction.invite(support: BasePart, action: string, texte: string, objet: string?): ProximityPrompt
	local invite = Instance.new("ProximityPrompt")
	invite.Name = "Invite"
	invite.ActionText = texte
	invite.ObjectText = objet or ""
	invite.HoldDuration = 0
	invite.MaxActivationDistance = 14
	invite.RequiresLineOfSight = false
	invite:SetAttribute("Action", action)
	invite.Parent = support
	return invite
end

return Construction
