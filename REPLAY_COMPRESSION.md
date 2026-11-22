# Compression locale des replays

Cette première version compresse les vidéos sur votre PC **avant** leur envoi à Synta Academy. Elle ne modifie ni la plateforme, ni R2, ni la base de données, ni les fichiers originaux. Elle ne concerne pas les liens Drive et n'est pas un bouton automatique de compression dans l'administration.

## Utilisation sous Windows

1. Installer Node.js 20+ et FFmpeg/FFprobe. FFmpeg liste les distributions Windows recommandées sur https://ffmpeg.org/download.html (lien Gyan). Mettre `ffmpeg.exe` et `ffprobe.exe` dans le PATH, ou dans `.local-tools/ffmpeg/bin/` à la racine du projet. Les binaires locaux sont ignorés par Git.
2. Double-cliquer **Optimiser les replays.cmd** sans déposer de fichier dessus pour lancer la surveillance du dossier **Replays Zoom** à la racine du projet. Un runtime Node portable a été ajouté sur ce PC dans `.local-tools/node/node.exe`, pour fonctionner même sans Node dans le PATH de Windows.
3. Déposer les vidéos dans **Replays Zoom** (sous-dossiers acceptés). Le surveillant attend environ 30 à 40 secondes de stabilité après la copie, puis traite un fichier à la fois. Laisser la surveillance active ; après redémarrage du PC, relancer le `.cmd`.
4. Les copies vérifiées se trouvent dans **Replays Zoom/Compresses**, suffixées `.optimized.mp4`. Les dossiers imbriqués sont conservés. Le dossier, les binaires et le `.cmd` local sont ignorés par Git et exclus du contexte Docker. La surveillance n’est jamais lancée par le site.
5. Vérifier visuellement un passage avec du petit code et du texte. Ensuite envoyer la copie optimisée depuis **Ajouter un replay → Téléverser une vidéo**. Dates, titres, ressources et cours se règlent comme avant.

Un rapport JSON indique les tailles, durées, empreintes SHA-256 et économies mesurées. Si le résultat serait plus gros, aucune copie n'est publiée : le rapport indique `keep_original`. Un résultat déjà présent n'est jamais écrasé (`exists`) : ce statut n'affirme pas que le fichier existant est valide. Pour essayer d'autres réglages, choisir un nouveau dossier de sortie.

L'envoi de la plateforme reste limité à 1 Go par vidéo. Le rapport indique `platformUploadReady` pour les fichiers traités et signale ceux qui dépassent encore cette limite. Prévoir de l'espace libre sur le PC pour les copies temporaires et finales.

## Réglages par défaut

- MP4, H.264 / libx264, CRF 23, preset medium, deux threads ; traitement natif en processus séparé.
- Résolution d'origine conservée, sans réduction vers 720p, sans coupe et sans diminution volontaire de la cadence.
- Toutes les pistes audio sont réencodées en AAC 96 kbit/s par piste ; les métadonnées et chapitres sont repris lorsqu'ils sont compatibles avec MP4.
- Fast start déplace les métadonnées MP4 pour faciliter le démarrage du lecteur.
- La durée, la résolution, le codec et le nombre de pistes audio sont contrôlés. L'écart de durée toléré est au maximum 0,5 seconde ou 0,01 % de la durée source (tolérance technique de conteneur). La copie entière est ensuite décodée pour détecter les erreurs avant publication, et doit être plus petite que l'original.
- La compression est avec pertes : même durée/résolution ne signifie pas qualité visuelle identique. Inspecter le petit texte. Les vidéos Zoom déjà bien compressées peuvent très peu diminuer ou ne donner aucune économie.

```powershell
node backend/scripts/optimize-replays.js "D:\Mes sessions Zoom" --recursive
```

Pour privilégier davantage la qualité :

```powershell
node backend/scripts/optimize-replays.js "D:\Mes sessions Zoom" --recursive --crf 20 --preset slow --output "D:\Replays qualite"
```

CRF autorisé : 18 à 28 ; un chiffre plus bas privilégie la qualité. Preset : fast, medium ou slow. `--threads` accepte 1 à 8. Les variables `FFMPEG_PATH` et `FFPROBE_PATH` peuvent désigner les exécutables. Un fichier peut prendre longtemps selon sa durée et le PC. Aucun pourcentage d'économie n'est garanti.

Les fichiers supportés sont MP4, MOV, WebM et MKV. Les sorties ont des noms distincts (`session.mov.optimized.mp4`) pour éviter les collisions. Les liens symboliques trouvés dans les dossiers sont ignorés. Les exécutables sont lancés sans shell, sur des fichiers locaux avec les protocoles réseau interdits. Les sorties temporaires sont uniques ; seuls ces fichiers temporaires sont supprimés lors d'un échec.

## Limites et prochaine phase

- Le PC doit rester allumé pendant le traitement. Un arrêt brutal peut laisser un `.partial.mp4` dans le dossier de sortie ; ce fichier n'est pas un résultat validé.
- Aucun envoi automatique et aucune suppression de fichiers R2. Les vidéos déjà stockées ne diminuent pas grâce à cet outil ; il faut d'abord traiter la source puis remplacer le replay selon le flux existant. Le remplacement actuel conserve les anciens objets R2.
- La compression automatique côté serveur nécessiterait une file durable, des limites CPU/disque et un cycle de conservation/nettoyage. Elle n'est pas implémentée ici. Toute nouvelle table doit suivre l'approbation de migration du projet.
- Aucune vidéo réelle d'élève ou d'enseignant n'est utilisée pour les tests. Les mesures sur des clips synthétiques ne prédisent pas celles des sessions Zoom.

Documentation primaire : https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb et https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv.

## Validation exécutée — 2026-11-22

FFmpeg 9.1 portable (Gyan, archive SHA256 vérifiée), Node 24, Windows. Suite complète : **90 tests réussis, 0 échec, 0 ignoré**, y compris PostgreSQL jetable et Chrome. Le test média a réellement encodé puis décodé un clip synthétique de 3 secondes en 1920×1080 avec audio. Il vérifie la réduction de taille, durée/résolution/pistes audio, faststart, source inchangée, caractères spéciaux dans le chemin, reprise sans écrasement, fichier corrompu et conservation des originaux déjà plus petits. Les sessions longues réelles et leur lisibilité visuelle restent à vérifier sur un extrait choisi par l’utilisateur.

### Surveillance locale

`backend/scripts/watch-replays.js` mémorise les fichiers déjà traités dans `.compression-state.json` du dossier ignoré. Les sorties ne sont pas réencodées. Un verrou PID évite les lancements répétés. En cas de fichier corrompu, le fichier original est conservé et l’erreur est signalée ; après correction, renommer le fichier ou modifier son contenu permet une nouvelle tentative. Les fichiers déjà présents dans Compresses ne sont jamais écrasés. Le mode glisser-déposer sur le `.cmd` reste disponible pour un traitement ponctuel avec sortie `replay-output`. La stabilité de taille/date réduit le risque de lire une copie incomplète mais ne constitue pas un verrou du programme de téléchargement ; la validation complète protège la publication de la sortie.
