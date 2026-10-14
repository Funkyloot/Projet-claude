--!nocheck
-- Aperçu — assemble la page de rediffusions à partir des courses enregistrées.
--
--     lune run tools/rediffusion build/rediffusion.json
--     lune run tools/apercu build/rediffusion.json build/apercu.html

local fs = require("@lune/fs")
local process = require("@lune/process")

local entree = process.args[1] or "build/rediffusion.json"
local sortie = process.args[2] or "build/apercu.html"

local modele = fs.readFile("tools/apercu/modele.html")
-- Dans une balise <script>, « </ » fermerait la balise : on l'échappe
local donnees = string.gsub(fs.readFile(entree), "</", "<\\/")
local debut, fin = string.find(modele, "/*DONNEES*/", 1, true)
assert(debut, "marqueur /*DONNEES*/ introuvable dans le modèle")
fs.writeFile(sortie, string.sub(modele, 1, debut - 1) .. donnees .. string.sub(modele, fin + 1))
print(`→ {sortie} ({math.floor(#fs.readFile(sortie) / 1024)} Ko)`)
