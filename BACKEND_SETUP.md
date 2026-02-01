# 🚀 Démarrer le Backend pour les Vidéos

## Pourquoi le backend est nécessaire ?

Les vidéos sont stockées dans Cloudflare R2 (stockage sécurisé). Pour y accéder, nous devons générer des URLs signées temporaires. Le backend Node.js s'occupe de :
- Vérifier que l'utilisateur a accès au cours
- Générer des URLs signées sécurisées pour les vidéos
- Suivre la progression des leçons

## 📋 Prérequis

1. **Node.js** installé (version 16 ou supérieure)
   - Vérifiez : `node --version`
   - Télécharger : https://nodejs.org/

## 🛠️ Installation et Démarrage

### 1. Ouvrir un Terminal dans le dossier backend

```bash
cd "c:\Work\website\Synta main website\Syntaacademy\backend"
```

### 2. Installer les dépendances (première fois uniquement)

```bash
npm install
```

### 3. Configurer l'environnement

1. Copiez `.env.example` vers `.env` :
   ```bash
   copy .env.example .env
   ```

2. Ouvrez `.env` et remplissez les valeurs :
   ```env
   # Supabase (déjà configuré)
   SUPABASE_URL=https://lzlqxwwhjveyfhgopdph.supabase.co
   SUPABASE_ANON_KEY=votre-clé-anon
   SUPABASE_SERVICE_KEY=votre-clé-service
   
   # Cloudflare R2
   CLOUDFLARE_ACCOUNT_ID=votre-account-id
   R2_ACCESS_KEY=votre-access-key
   R2_SECRET_KEY=votre-secret-key
   R2_BUCKET=syntacontent
   ```

### 4. Démarrer le serveur

```bash
npm start
```

Vous devriez voir :
```
✅ Synta Academy Backend Server Started
🌍 Listening on http://localhost:3000
📦 R2 Bucket: syntacontent
```

## ✅ Vérifier que ça fonctionne

1. Le backend doit afficher "Server running on port 3000"
2. Recharger la page des cours
3. Cliquer sur une leçon vidéo
4. La vidéo devrait maintenant se charger depuis Cloudflare R2

## 🔧 Résoudre les Problèmes

### Erreur "ERR_CONNECTION_REFUSED"
- Le backend n'est pas démarré
- Solution : Exécutez `npm start` dans le dossier backend

### Erreur "Row-level security policy violation"
- Les politiques RLS de Supabase bloquent l'insertion
- Solution : Exécutez le fichier `database/fix-rls-policies.sql` dans Supabase SQL Editor

### Vidéo de démo au lieu de la vraie vidéo
- Le backend n'a pas pu générer l'URL signée
- Vérifiez les credentials R2 dans `.env`
- Vérifiez que le bucket "syntacontent" existe dans Cloudflare

## 📱 Alternative : URL Publique R2

Si vous ne voulez pas utiliser le backend, vous pouvez configurer un domaine public R2 :

1. Dans Cloudflare, activez l'accès public pour votre bucket
2. Obtenez l'URL publique (ex: `https://pub-xxxxx.r2.dev`)
3. Dans `js/api-client.js`, changez :
   ```javascript
   const R2_PUBLIC_URL = 'https://pub-xxxxx.r2.dev';
   ```

⚠️ **Note** : Cette méthode expose publiquement vos vidéos. Les URLs signées via le backend sont plus sécurisées.
