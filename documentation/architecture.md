# Architecture du projet — Drone de livraison

## 1. Objectif

Développer la partie logicielle d'un drone capable d'effectuer une livraison.

Le logiciel devra permettre de communiquer avec le drone, récupérer ses informations et suivre son état.

## 2. Architecture générale

Utilisateur
↓
Interface web
↓
API / Serveur
↓
Raspberry Pi
↓
Électronique du drone

## 3. Interface web

L'interface permettra notamment de consulter :

- l'état du drone
- le niveau de batterie
- sa position
- sa destination
- l'état de la livraison

## 4. API / Serveur

L'API servira d'intermédiaire entre l'interface web et le Raspberry Pi.

Elle permettra notamment de :

- recevoir les informations du drone
- transmettre les informations à l'interface
- recevoir des commandes de l'interface
- transmettre les commandes au Raspberry Pi

## 5. Raspberry Pi

Le Raspberry Pi constituera l'ordinateur embarqué du système.

Il devra :

- communiquer avec les composants électroniques
- récupérer les données des capteurs
- transmettre les données au serveur
- recevoir des commandes

## 6. Électronique

La partie électronique comprendra notamment les capteurs et autres composants nécessaires au fonctionnement du drone.

Cette partie sera développée par les membres de l'équipe responsables de l'électronique.