--!strict
-- Couleurs — la palette du jeu.
--
-- Les cadres reprennent les couleurs des courses japonaises : on reconnaît
-- une coureuse à la couleur de son dossard, de la stalle au podium.

local Couleurs = {}

Couleurs.CADRES = {
	Color3.fromRGB(245, 245, 245), -- 1 blanc
	Color3.fromRGB(35, 35, 40), -- 2 noir
	Color3.fromRGB(220, 50, 60), -- 3 rouge
	Color3.fromRGB(45, 110, 220), -- 4 bleu
	Color3.fromRGB(250, 210, 40), -- 5 jaune
	Color3.fromRGB(40, 170, 90), -- 6 vert
	Color3.fromRGB(250, 140, 30), -- 7 orange
	Color3.fromRGB(245, 130, 180), -- 8 rose
}

-- Texte lisible sur chaque cadre
Couleurs.TEXTE_CADRES = {
	Color3.fromRGB(20, 20, 20),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(20, 20, 20),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(20, 20, 20),
	Color3.fromRGB(20, 20, 20),
}

Couleurs.STRATEGIES = {
	fusee = Color3.fromRGB(255, 120, 80),
	ombre = Color3.fromRGB(130, 110, 220),
	vague = Color3.fromRGB(60, 170, 230),
	tempete = Color3.fromRGB(80, 200, 160),
}

-- Interface : blanc nacré, rose bonbon, bleu ciel — l'esprit des idoles
Couleurs.FOND = Color3.fromRGB(255, 250, 253)
Couleurs.FOND_SOMBRE = Color3.fromRGB(40, 32, 58)
Couleurs.ROSE = Color3.fromRGB(255, 95, 160)
Couleurs.ROSE_PALE = Color3.fromRGB(255, 205, 225)
Couleurs.CIEL = Color3.fromRGB(90, 190, 255)
Couleurs.OR = Color3.fromRGB(255, 200, 60)
Couleurs.ARGENT = Color3.fromRGB(200, 205, 215)
Couleurs.BRONZE = Color3.fromRGB(215, 140, 90)
Couleurs.TEXTE = Color3.fromRGB(45, 35, 60)
Couleurs.TEXTE_DOUX = Color3.fromRGB(120, 105, 140)
Couleurs.BLANC = Color3.fromRGB(255, 255, 255)
Couleurs.ENDURANCE_PLEINE = Color3.fromRGB(80, 210, 140)
Couleurs.ENDURANCE_BASSE = Color3.fromRGB(250, 90, 80)

-- Auras de compétence (indices 1 à 3 des instantanés)
Couleurs.AURAS = {
	Color3.fromRGB(255, 215, 60), -- vitesse : éclair doré
	Color3.fromRGB(90, 190, 255), -- accélération : bleu
	Color3.fromRGB(90, 230, 140), -- endurance : vert
}

-- Apparence des bots
Couleurs.PEAUX = {
	Color3.fromRGB(255, 224, 199),
	Color3.fromRGB(241, 194, 160),
	Color3.fromRGB(224, 172, 135),
	Color3.fromRGB(198, 134, 98),
	Color3.fromRGB(141, 85, 56),
}

return Couleurs
