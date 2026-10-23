# Streamoutils
Offre des outils permettant d’insérer facilement des options sur votre propre site internet.

## Tests du lecteur PGN

Avec Node.js 22 ou plus récent, sans dépendance à installer :

```sh
node --test tests/pgn-analyzer.test.cjs
```

Les tests exécutent le script intégré à `insertwitch.html` avec un DOM simulé.
Ils couvrent les variantes imbriquées, les parenthèses accolées et les numéros de
coups compacts (`1.e4`, `23...Qe7`), puis vérifient les métriques, les scores de
style, les valeurs affichées et le contenu du rapport exporté. Les formats
compacts et espacés d'un même exemple doivent produire un rapport identique.
