--!strict
-- Boutique — acheter et porter les objets du catalogue, choisir son titre,
-- et les packs d'étoiles en Robux.
--
-- Pur : ces fonctions reçoivent la sauvegarde (Schema.Donnees) et la
-- modifient sur place ; le serveur les appelle dans Profils.modifier. Tout
-- ce qui vient du client passe par ici et est revérifié.
--
-- Rien ne s'achète qui fasse courir plus vite : ce ne sont que des
-- cosmétiques. Les packs d'étoiles en Robux n'achètent donc, eux aussi, que
-- des cosmétiques.

local Catalogue = require(script.Parent:WaitForChild("Catalogue"))
local Economie = require(script.Parent:WaitForChild("Economie"))
local Schema = require(script.Parent:WaitForChild("Schema"))
local Titres = require(script.Parent:WaitForChild("Titres"))

local Boutique = {}

-- Catégorie du catalogue → champ d'équipement
Boutique.EQUIPEMENT = {
	robes = "robe",
	tenues = "tenue",
	batons = "baton",
	effets = "effet",
}

-- Au-delà de ce prix, l'interface demande une confirmation.
Boutique.SEUIL_CONFIRMATION = 500

export type Pack = {
	id: string,
	nom: string,
	etoiles: number,
	produit: number, -- identifiant du produit développeur (0 = pas en vente)
}

-- Les packs d'étoiles. Le créateur du jeu crée les produits sur le tableau
-- de bord Roblox (Monétisation > Produits développeur) et colle leur
-- identifiant ici ; tant qu'il vaut 0, le pack n'existe pas.
Boutique.PACKS = {
	{ id = "sachet", nom = "Sachet d'étoiles", etoiles = 500, produit = 0 },
	{ id = "coffret", nom = "Coffret d'étoiles", etoiles = 1200, produit = 0 },
	{ id = "malle", nom = "Malle d'étoiles", etoiles = 3000, produit = 0 },
} :: { Pack }

local function categorieValide(categorie: unknown): boolean
	return type(categorie) == "string" and Boutique.EQUIPEMENT[categorie] ~= nil
end

local function possede(d: any, categorie: string, id: string): boolean
	local ensemble = d.possessions[categorie]
	return ensemble ~= nil and ensemble[id] == true
end

-- Peut-on acheter cet objet ? Sinon, pourquoi (en français, pour le joueur).
function Boutique.peutAcheter(d: any, categorie: unknown, id: unknown): (boolean, string?)
	if not categorieValide(categorie) or type(id) ~= "string" then
		return false, "Cet objet n'existe pas."
	end
	local objet = Catalogue.obtenir(categorie :: string, id)
	if not objet then
		return false, "Cet objet n'existe pas."
	end
	if possede(d, objet.categorie, objet.id) then
		return false, "Tu l'as déjà !"
	end
	if objet.prix < 0 then
		return false, "Cet objet n'est pas à vendre."
	end
	local niveau = Economie.niveau(d.xp)
	if niveau < objet.niveau then
		return false, `Il faut le niveau {objet.niveau} pour l'acheter.`
	end
	if d.etoiles < objet.prix then
		return false, `Il te manque {objet.prix - d.etoiles} étoiles.`
	end
	return true, nil
end

-- Achète un objet (débite et ajoute la possession). Renvoie ok et une raison.
function Boutique.acheter(d: any, categorie: unknown, id: unknown): (boolean, string?)
	local ok, raison = Boutique.peutAcheter(d, categorie, id)
	if not ok then
		return false, raison
	end
	local objet = Catalogue.obtenir(categorie :: string, id :: string) :: Catalogue.Objet
	d.etoiles -= objet.prix
	d.possessions[objet.categorie][objet.id] = true
	return true, nil
end

-- Porte un objet qu'on possède.
function Boutique.equiper(d: any, categorie: unknown, id: unknown): (boolean, string?)
	if not categorieValide(categorie) or type(id) ~= "string" or not Catalogue.existe(categorie, id) then
		return false, "Cet objet n'existe pas."
	end
	if not possede(d, categorie :: string, id) then
		return false, "Achète-le d'abord !"
	end
	d.equipement[Boutique.EQUIPEMENT[categorie :: string]] = id
	return true, nil
end

-- Le titre affiché sous son nom : "" pour aucun, sinon un titre gagné.
function Boutique.equiperTitre(d: any, id: unknown): (boolean, string?)
	if id == "" then
		d.equipement.titre = ""
		return true, nil
	end
	if type(id) ~= "string" or not Titres.parId(id) then
		return false, "Ce titre n'existe pas."
	end
	if not d.titres[id] then
		return false, "Tu n'as pas encore gagné ce titre."
	end
	d.equipement.titre = id
	return true, nil
end

-- Le nom à afficher pour le titre équipé ("" s'il n'y en a pas).
function Boutique.nomTitre(id: string): string
	local t = Titres.parId(id)
	return if t then t.nom else ""
end

-- Le pack correspondant à un produit développeur (nil s'il n'y en a pas).
function Boutique.packDuProduit(produit: unknown): Pack?
	if type(produit) ~= "number" or produit == 0 then
		return nil
	end
	for _, p in Boutique.PACKS do
		if p.produit == produit then
			return p
		end
	end
	return nil
end

-- Crédite un achat en Robux, une seule fois par reçu : vrai si c'est fait
-- maintenant, faux si ce reçu était déjà crédité. La trace vit dans la
-- sauvegarde, avec les étoiles : les deux sont écrites ensemble.
function Boutique.accorderAchat(d: any, recu: string, pack: Pack): boolean
	if table.find(d.achats, recu) then
		return false
	end
	d.etoiles = math.min(Schema.MAX_ETOILES, d.etoiles + pack.etoiles)
	table.insert(d.achats, recu)
	while #d.achats > Schema.MAX_ACHATS do
		table.remove(d.achats, 1)
	end
	return true
end

-- Vrai si au moins un pack est en vente.
function Boutique.packsEnVente(): boolean
	for _, p in Boutique.PACKS do
		if p.produit ~= 0 then
			return true
		end
	end
	return false
end

return Boutique
