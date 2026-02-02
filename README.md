# LexiGuess

A web game that challenges players to guess words using hints from Wikidata lexemes.

## What is this?

LexiGuess fetches random words (lexemes) from Wikidata, hides some letters, and asks players to guess the complete word. Hints come from Wikidata's structured data - part of speech, language, definitions.

**Current status**: Working prototype with basic gameplay, pending actively development under a Wikimedia Rapid Grant.

## How to play

1. The game fetches a random word from Wikidata
2. Some letters are replaced with blanks (e.g., "h_pp_")
3. Use hints (language, part of speech) to guess the word
4. Submit your guess and see if you're right
5. Score points for correct guesses with fewer hints

## For developers

### Quick start

1. Clone the repo
2. Open `index.html` in a browser
3. Start playing (no build needed)

The game runs entirely in the browser using:
- HTML/CSS/JavaScript (no frameworks)
- SPARQL queries to Wikidata Query Service
- Toolforge hosting planned

### Key files

- `script.js` - Main game logic and SPARQL queries
- `style.css` - All styling (needs mobile optimization)
- `index.html` - Game interface

### Development notes

The current SPARQL query fetches random lexemes with their lemmas and basic data. This needs optimization for better word selection.

Example query (simplified):
```sparql
SELECT ?lexeme ?lemma WHERE {
  ?lexeme a ontolex:Lexeme; dct:language wd:Q1860; wikibase:lemma ?lemma.
}
LIMIT 1
```
### License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
