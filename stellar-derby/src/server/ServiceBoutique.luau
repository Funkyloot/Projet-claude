--!strict
-- ServiceBoutique — la boutique et la garde-robe : acheter et porter robes,
-- tenues, bâtons lumineux et effets, choisir son titre ; les tenues portées
-- en course ; les packs d'étoiles en Robux.
--
-- Requêtes :
--   boutique.acheter { categorie, id }
--   boutique.equiper { categorie, id }
--   profil.titre { id }            ("" pour n'afficher aucun titre)
-- Les règles sont dans Jeu/Boutique ; ici, on les applique dans
-- Profils.modifier et on prévient le joueur.
--
-- Robux : ProcessReceipt ne crédite jamais deux fois le même reçu. La trace
-- des reçus vit dans la sauvegarde (d.achats), écrite en même temps que les
-- étoiles ; on ne répond « accordé » qu'une fois cette sauvegarde écrite.
-- Tant qu'aucun produit n'est renseigné dans Jeu/Boutique, rien n'est
-- branché.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Boutique = require(Partage:WaitForChild("Jeu"):WaitForChild("Boutique"))
local Catalogue = require(Partage:WaitForChild("Jeu"):WaitForChild("Catalogue"))

local Coureuses = require(script.Parent:WaitForChild("Coureuses"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Tenues = require(script.Parent:WaitForChild("Tenues"))

local ServiceBoutique = {}

local function acheter(joueur: Player, args: any): Reseau.Reponse
	if type(args) ~= "table" then
		return { ok = false, erreur = "Demande invalide." }
	end
	local ok, raison = false, "Ta sauvegarde n'est pas encore chargée." :: string?
	Profils.modifier(joueur, function(d)
		ok, raison = Boutique.acheter(d, args.categorie, args.id)
	end)
	if not ok then
		return { ok = false, erreur = raison or "Achat impossible." }
	end
	local objet = Catalogue.obtenir(args.categorie, args.id)
	Profils.notifier(joueur, `{objet and objet.nom or "Objet"} : à toi !`, "gain")
	return { ok = true }
end

local function equiper(joueur: Player, args: any): Reseau.Reponse
	if type(args) ~= "table" then
		return { ok = false, erreur = "Demande invalide." }
	end
	local ok, raison = false, "Ta sauvegarde n'est pas encore chargée." :: string?
	Profils.modifier(joueur, function(d)
		ok, raison = Boutique.equiper(d, args.categorie, args.id)
	end)
	if not ok then
		return { ok = false, erreur = raison or "Impossible de le porter." }
	end
	return { ok = true }
end

local function choisirTitre(joueur: Player, args: any): Reseau.Reponse
	local id = if type(args) == "table" then args.id else nil
	local ok, raison = false, "Ta sauvegarde n'est pas encore chargée." :: string?
	Profils.modifier(joueur, function(d)
		ok, raison = Boutique.equiperTitre(d, id)
	end)
	if not ok then
		return { ok = false, erreur = raison or "Titre indisponible." }
	end
	return { ok = true }
end

-- Un reçu de Robux. Ne répond « accordé » qu'une fois les étoiles sauvées.
local function traiterRecu(recu: { [string]: any }): Enum.ProductPurchaseDecision
	local pack = Boutique.packDuProduit(recu.ProductId)
	local joueur = Players:GetPlayerByUserId(recu.PlayerId)
	local idRecu = recu.PurchaseId
	if not pack or not joueur or not Profils.pret(joueur) or type(idRecu) ~= "string" then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local nouveau = false
	Profils.modifier(joueur, function(d)
		nouveau = Boutique.accorderAchat(d, idRecu, pack)
	end)
	local ok, sauve = pcall(Profils.sauverMaintenant, joueur)
	if not ok or not sauve then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if nouveau then
		Profils.notifier(joueur, `Merci ! +{pack.etoiles} ★`, "gain")
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

function ServiceBoutique.demarrer()
	Profils.surRequete("boutique.acheter", acheter)
	Profils.surRequete("boutique.equiper", equiper)
	Profils.surRequete("profil.titre", choisirTitre)

	-- Les tenues des joueuses, dessinées sur leur coureuse
	Coureuses.surCreation(function(modele, fiche)
		local tenue = fiche.tenue
		if tenue and Catalogue.existe("tenues", tenue) then
			Tenues.habiller(modele, tenue)
		end
	end)

	if Boutique.packsEnVente() then
		MarketplaceService.ProcessReceipt = traiterRecu
	end
	Profils.surRequete("boutique.pack", function(joueur, args)
		local id = if type(args) == "table" then args.id else nil
		for _, p in Boutique.PACKS do
			if p.id == id and p.produit ~= 0 then
				local ok = pcall(function()
					MarketplaceService:PromptProductPurchase(joueur, p.produit)
				end)
				return if ok then { ok = true } else { ok = false, erreur = "La boutique Roblox ne répond pas." }
			end
		end
		return { ok = false, erreur = "Ce pack n'est pas en vente." }
	end)
end

return ServiceBoutique
