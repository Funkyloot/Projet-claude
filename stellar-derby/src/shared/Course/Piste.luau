--!strict
-- Piste — la géométrie de l'hippodrome vue d'en haut, en mètres.
--
-- Une piste est une boucle fermée faite de tronçons (lignes droites et arcs)
-- qu'on enchaîne comme une tortue Logo. Tout se passe dans le plan (x, z).
--
-- Deux abscisses coexistent :
--   u  — distance le long de la corde depuis le début du premier tronçon ;
--   s  — distance depuis la ligne d'arrivée, dans le sens de la course.
-- Le reste du jeu ne parle qu'en s : s = 0 sur la ligne, s = -1400 aux
-- stalles d'une course de 1 400 m. La boucle rend s périodique.
--
-- La « corde » est la lice intérieure. Le couloir d'une coureuse est sa
-- distance à la corde, mesurée vers l'extérieur selon la normale (nx, nz).
-- En virage, un couloir extérieur parcourt plus de terrain : le facteur
-- 1 / (1 + courbure × couloir) en rend compte dans la simulation.

export type Troncon = {
	genre: "droite" | "virage",
	longueur: number,
	rayon: number, -- 0 pour une ligne droite
	sens: number, -- +1 tourne vers la corde, -1 dans l'autre sens
	debut: number, -- abscisse u du début du tronçon
	x: number,
	z: number,
	cap: number, -- angle de la tangente au début du tronçon, en radians
}

export type Pose = {
	x: number,
	z: number,
	tx: number, -- tangente unitaire, sens de la course
	tz: number,
	nx: number, -- normale unitaire, vers l'extérieur
	nz: number,
	courbure: number, -- 1/rayon, positive quand la corde est à l'intérieur
}

local Piste = {}
Piste.__index = Piste

export type Piste = typeof(setmetatable(
	{} :: {
		troncons: { Troncon },
		longueur: number,
		largeur: number,
		origine: number, -- abscisse u de la ligne d'arrivée
		ligneDroiteFinale: number, -- longueur de ligne droite avant l'arrivée
		dernierVirage: number, -- longueur du virage qui la précède
	},
	Piste
))

type DefinitionTroncon =
	{ genre: "droite", longueur: number }
	| {
		genre: "virage",
		rayon: number,
		angle: number,
		sens: number?,
	}

-- Assemble une boucle à partir de ses tronçons. `arrivee` est l'abscisse u
-- de la ligne d'arrivée.
function Piste.nouvelle(definitions: { DefinitionTroncon }, largeur: number, arrivee: number): Piste
	local troncons: { Troncon } = {}
	local x, z, cap, u = 0, 0, 0, 0
	for _, def in definitions do
		local troncon: Troncon
		if def.genre == "droite" then
			troncon = {
				genre = "droite",
				longueur = def.longueur,
				rayon = 0,
				sens = 0,
				debut = u,
				x = x,
				z = z,
				cap = cap,
			}
		else
			local sens = def.sens or 1
			troncon = {
				genre = "virage",
				longueur = def.rayon * def.angle,
				rayon = def.rayon,
				sens = sens,
				debut = u,
				x = x,
				z = z,
				cap = cap,
			}
		end
		table.insert(troncons, troncon)
		x, z, cap = Piste._avancer(troncon, troncon.longueur)
		u += troncon.longueur
	end

	-- Une boucle qui ne se referme pas trahit une erreur de définition :
	-- mieux vaut s'arrêter ici que de voir les coureuses se téléporter.
	assert(math.abs(x) < 1e-6 and math.abs(z) < 1e-6, "la piste ne se referme pas")

	local self = setmetatable({
		troncons = troncons,
		longueur = u,
		largeur = largeur,
		origine = arrivee,
		ligneDroiteFinale = 0,
		dernierVirage = 0,
	}, Piste)

	-- Ligne droite finale : du début du tronçon qui porte l'arrivée jusqu'à
	-- la ligne. Puis le virage qui la précède, s'il y en a un.
	local indice = self:_indiceTroncon(arrivee)
	local porteur = troncons[indice]
	if porteur.genre == "droite" then
		self.ligneDroiteFinale = arrivee - porteur.debut
		local precedent = troncons[(indice - 2) % #troncons + 1]
		if precedent.genre == "virage" then
			self.dernierVirage = precedent.longueur
		end
	end
	return self
end

-- L'hippodrome classique : deux lignes droites reliées par deux demi-cercles.
-- La première ligne droite est celle des tribunes ; l'arrivée y est placée à
-- la fraction `positionArrivee` de sa longueur.
function Piste.stade(ligneDroite: number, rayon: number, largeur: number, positionArrivee: number): Piste
	return Piste.nouvelle({
		{ genre = "droite", longueur = ligneDroite },
		{ genre = "virage", rayon = rayon, angle = math.pi },
		{ genre = "droite", longueur = ligneDroite },
		{ genre = "virage", rayon = rayon, angle = math.pi },
	}, largeur, ligneDroite * positionArrivee)
end

-- Pose après avoir parcouru `l` mètres dans un tronçon.
function Piste._avancer(t: Troncon, l: number): (number, number, number)
	if t.genre == "droite" then
		return t.x + math.cos(t.cap) * l, t.z + math.sin(t.cap) * l, t.cap
	end
	-- Centre du cercle, du côté où l'on tourne
	local r, sens = t.rayon, t.sens
	local cx = t.x - sens * r * math.sin(t.cap)
	local cz = t.z + sens * r * math.cos(t.cap)
	local cap = t.cap + sens * l / r
	return cx + sens * r * math.sin(cap), cz - sens * r * math.cos(cap), cap
end

function Piste._indiceTroncon(self: Piste, u: number): number
	local troncons = self.troncons
	for i = #troncons, 1, -1 do
		if u >= troncons[i].debut then
			return i
		end
	end
	return 1
end

-- Abscisse u correspondant à s, ramenée dans [0, longueur[.
function Piste.versU(self: Piste, s: number): number
	return (s + self.origine) % self.longueur
end

function Piste.troncon(self: Piste, s: number): Troncon
	return self.troncons[self:_indiceTroncon(self:versU(s))]
end

function Piste.pose(self: Piste, s: number): Pose
	local u = self:versU(s)
	local t = self.troncons[self:_indiceTroncon(u)]
	local x, z, cap = Piste._avancer(t, u - t.debut)
	local tx, tz = math.cos(cap), math.sin(cap)
	local courbure = if t.genre == "virage" then t.sens / t.rayon else 0
	-- La corde est à gauche de la tangente (sens trigonométrique du plan) :
	-- l'extérieur est donc à droite, soit (tz, -tx).
	return { x = x, z = z, tx = tx, tz = tz, nx = tz, nz = -tx, courbure = courbure }
end

-- Plus léger que pose() : la simulation n'a besoin que de la courbure.
function Piste.courbure(self: Piste, s: number): number
	local t = self:troncon(s)
	return if t.genre == "virage" then t.sens / t.rayon else 0
end

-- Position d'un point de la piste à `couloir` mètres de la corde.
function Piste.position(self: Piste, s: number, couloir: number): (number, number)
	local p = self:pose(s)
	return p.x + p.nx * couloir, p.z + p.nz * couloir
end

-- Points régulièrement espacés le long de la corde (dessin, mini-carte).
function Piste.echantillons(self: Piste, pas: number): { Pose }
	local points = {}
	local n = math.max(8, math.floor(self.longueur / pas))
	for i = 0, n - 1 do
		table.insert(points, self:pose(i * self.longueur / n))
	end
	return points
end

-- Rectangle englobant, largeur de piste comprise.
function Piste.boite(self: Piste): (number, number, number, number)
	local minX, maxX, minZ, maxZ = math.huge, -math.huge, math.huge, -math.huge
	for _, p in self:echantillons(2) do
		for _, c in { 0, self.largeur } do
			local x, z = p.x + p.nx * c, p.z + p.nz * c
			minX, maxX = math.min(minX, x), math.max(maxX, x)
			minZ, maxZ = math.min(minZ, z), math.max(maxZ, z)
		end
	end
	return minX, maxX, minZ, maxZ
end

return Piste
