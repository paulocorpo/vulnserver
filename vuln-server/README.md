# Vuln Server — Application volontairement vulnérable

> **ATTENTION :** Cette application est **intentionnellement vulnérable** et destinée **exclusivement** à des fins pédagogiques (CTF, labs, formation).  
> **NE JAMAIS** déployer ce code en production ni l’exécuter sur des environnements accessibles publiquement.  

---

## But du projet
Vuln Server est un laboratoire d’apprentissage conçu pour permettre :
- l’étude pratique de vulnérabilités web courantes (injections, XSS, contrôle d’accès, etc.),  
- l’entraînement au pentest et aux exercices Red/Blue,  
- l’intégration et l’évaluation d’outils de sécurité (sqlmap, semgrep, OWASP ZAP, etc.).

Public cible : formateurs, étudiants, compétiteurs CTF, équipes de sécurité en environnement isolé.

---

## Avertissement légal et éthique
- Vous êtes **responsable** de l’environnement dans lequel vous exécutez cette application.  
- N’utilisez pas ce code sur des réseaux publics, serveurs de production, ni sur des machines tierces sans **autorisation écrite explicite**.  
- Toute utilisation malveillante est strictement interdite.  
- Si vous découvrez une vulnérabilité qui pourrait impacter d’autres systèmes, merci d’en faire **une divulgation responsable** (voir section Contact).

---

## Principales vulnérabilités intégrées (exemples)
- Injection SQL (endpoints non paramétrés)  
- Cross-Site Scripting (XSS) réfléchi et stocké  
- Contrôle d’accès insuffisant (IDOR, escalation)  
- Faiblesse d’authentification / gestion de session non sécurisée  
- Exposition volontaire de secrets ou de fichiers de configuration

> Cette liste est indicative : le lab contient plusieurs scénarios et variantes conçus pour l’apprentissage.

---

## Exécution sécurisée — recommandations
Exécuter **uniquement** dans un environnement isolé : VM dédiée, conteneur Docker sandboxé, ou réseau de laboratoire fermé.  
Recommandations :
- Utiliser Docker ou VM (VirtualBox, QEMU) avec snapshots.  
- Ne pas exposer l’application sur une interface réseau publique.  
- Ne mapper aucun volume contenant des données sensibles.  
- Bloquer l’accès Internet si possible.

### Execution du lab

#### start
docker compose up --build -d

#### stop
docker compose down















